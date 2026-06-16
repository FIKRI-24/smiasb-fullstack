const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { pool } = require('../config/database');
const { createQuestionHash } = require('../utils/bankSoalSync');

const args = new Set(process.argv.slice(2));
const shouldApply = args.has('--apply');

function getFinalHash(row) {
  return createQuestionHash(row, {
    id_sekolah: row.id_sekolah,
    kelas: row.kelas || null,
    stimulus_tambahan: row.stimulus_tambahan || null,
    layout_blocks: row.layout_blocks || null,
    supporting_tables: row.supporting_tables || null
  });
}

function makeTempHash(rowId) {
  return crypto
    .createHash('sha256')
    .update(`bank-soal-class-hash-repair:${rowId}:${Date.now()}:${Math.random()}`)
    .digest('hex');
}

function getBackupPath() {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-');

  return path.join(
    __dirname,
    '..',
    'backups',
    `bank-soal-class-hash-${timestamp}.json`
  );
}

function chooseKeeper(group) {
  return [...group].sort((left, right) => {
    const leftAlreadyFinal = left.question_hash === left.final_hash ? 1 : 0;
    const rightAlreadyFinal = right.question_hash === right.final_hash ? 1 : 0;
    if (leftAlreadyFinal !== rightAlreadyFinal) return rightAlreadyFinal - leftAlreadyFinal;

    const leftActive = Number(left.is_aktif) === 1 ? 1 : 0;
    const rightActive = Number(right.is_aktif) === 1 ? 1 : 0;
    if (leftActive !== rightActive) return rightActive - leftActive;

    return Number(left.id) - Number(right.id);
  })[0];
}

function buildPlan(rows) {
  const rowsWithFinalHash = rows.map(row => ({
    ...row,
    final_hash: getFinalHash(row)
  }));

  const groups = new Map();
  rowsWithFinalHash.forEach(row => {
    const key = `${row.id_sekolah}:${row.final_hash}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  const keepers = [];
  const duplicateMerges = [];
  const changedRows = rowsWithFinalHash.filter(row => row.question_hash !== row.final_hash);

  groups.forEach(group => {
    const keeper = chooseKeeper(group);
    keepers.push(keeper);

    group
      .filter(row => Number(row.id) !== Number(keeper.id))
      .forEach(row => {
        duplicateMerges.push({
          duplicate: row,
          keeper
        });
      });
  });

  const affectedIds = new Set();
  changedRows.forEach(row => affectedIds.add(Number(row.id)));
  duplicateMerges.forEach(item => {
    affectedIds.add(Number(item.duplicate.id));
    affectedIds.add(Number(item.keeper.id));
  });

  return {
    rowsWithFinalHash,
    keepers,
    changedRows,
    duplicateMerges,
    affectedIds
  };
}

async function writeBackup(rows) {
  const backupPath = getBackupPath();
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(
    backupPath,
    JSON.stringify({
      created_at: new Date().toISOString(),
      reason: 'Repair Bank Soal question_hash agar mempertimbangkan kelas.',
      rows
    }, null, 2)
  );
  return backupPath;
}

async function applyPlan(conn, plan, originalRowsById) {
  const rowsToTemp = plan.rowsWithFinalHash
    .filter(row => row.question_hash !== row.final_hash);

  for (const row of rowsToTemp) {
    await conn.execute(
      'UPDATE bank_soal SET question_hash = ?, updated_at = NOW() WHERE id = ?',
      [makeTempHash(row.id), row.id]
    );
  }

  for (const { duplicate, keeper } of plan.duplicateMerges) {
    await conn.execute(
      `UPDATE bank_soal
       SET usage_count = usage_count + ?, is_aktif = GREATEST(is_aktif, ?), updated_at = NOW()
       WHERE id = ?`,
      [
        Number(duplicate.usage_count || 0),
        Number(duplicate.is_aktif || 0),
        keeper.id
      ]
    );

    await conn.execute(
      'UPDATE bank_soal SET is_aktif = 0, updated_at = NOW() WHERE id = ?',
      [duplicate.id]
    );
  }

  const keeperIds = new Set(plan.keepers.map(row => Number(row.id)));
  const duplicateIds = new Set(plan.duplicateMerges.map(item => Number(item.duplicate.id)));

  for (const row of plan.rowsWithFinalHash) {
    if (!keeperIds.has(Number(row.id)) || duplicateIds.has(Number(row.id))) continue;

    const original = originalRowsById.get(Number(row.id));
    if (!original || original.question_hash === row.final_hash) continue;

    await conn.execute(
      'UPDATE bank_soal SET question_hash = ?, updated_at = NOW() WHERE id = ?',
      [row.final_hash, row.id]
    );
  }
}

async function main() {
  const conn = await pool.getConnection();

  try {
    const [rows] = await conn.execute('SELECT * FROM bank_soal ORDER BY id ASC');
    const originalRowsById = new Map(rows.map(row => [Number(row.id), row]));
    const plan = buildPlan(rows);

    console.log('Repair Bank Soal class-aware hash');
    console.log(`Mode: ${shouldApply ? 'apply' : 'dry-run'}`);
    console.log(`Total baris Bank Soal: ${rows.length}`);
    console.log(`Hash perlu dihitung ulang: ${plan.changedRows.length}`);
    console.log(`Duplikat final yang akan digabung/nonaktif: ${plan.duplicateMerges.length}`);

    if (plan.affectedIds.size === 0) {
      console.log('Tidak ada data Bank Soal yang perlu diperbaiki.');
      return;
    }

    const preview = [...plan.affectedIds]
      .sort((left, right) => left - right)
      .slice(0, 20);
    console.log(`Contoh ID terdampak: ${preview.join(', ')}`);

    if (!shouldApply) {
      console.log('Belum ada perubahan database. Jalankan dengan --apply untuk menerapkan.');
      return;
    }

    const affectedRows = rows.filter(row => plan.affectedIds.has(Number(row.id)));
    const backupPath = await writeBackup(affectedRows);

    await conn.beginTransaction();
    await applyPlan(conn, plan, originalRowsById);
    await conn.commit();

    console.log(`Backup dibuat: ${backupPath}`);
    console.log('Perbaikan Bank Soal selesai.');
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // Transaction may not have started yet.
    }

    console.error('Perbaikan Bank Soal gagal:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
