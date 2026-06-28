const express = require('express');
const router = express.Router();

const { pool, isPostgres, dbPlaceholder, dbPlaceholders, addParam } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const {
  appendSekolahScope,
  canAccessInstrumen,
  denyAccess,
  isSuperAdmin,
  normalizeKelas
} = require('../utils/accessControl');

const LIKE_OPERATOR = isPostgres ? 'ILIKE' : 'LIKE';
const COUNT_TOTAL_SQL = isPostgres ? 'COUNT(*)::int' : 'COUNT(*)';
const ACTIVE_SQL = isPostgres ? 'TRUE' : '1';
const INACTIVE_SQL = isPostgres ? 'FALSE' : '0';

function resultRows(result) {
  return result.rows || result[0] || [];
}

function resultInsertId(result) {
  return isPostgres ? result.rows[0]?.id : result.insertId ?? result[0]?.insertId;
}

function resultRowCount(result) {
  return isPostgres
    ? result.rowCount
    : result.rowCount ?? result[0]?.affectedRows ?? result.affectedRows ?? 0;
}

async function getRouteConnection() {
  if (!isPostgres) {
    return pool.getConnection();
  }

  const client = await pool.connect();
  return {
    execute(sql, params) {
      return client.query(sql, params);
    },
    beginTransaction() {
      return client.query('BEGIN');
    },
    commit() {
      return client.query('COMMIT');
    },
    rollback() {
      return client.query('ROLLBACK');
    },
    release() {
      client.release();
    }
  };
}

function buildOrderByIdList(ids, params, column = 'id') {
  if (isPostgres) {
    const cases = ids
      .map((id, index) => `WHEN ${addParam(params, id)} THEN ${index}`)
      .join(' ');
    return `CASE ${column} ${cases} ELSE ${ids.length} END`;
  }

  const placeholders = ids.map(id => addParam(params, id)).join(', ');
  return `FIELD(${column}, ${placeholders})`;
}

function getPagination(query = {}) {
  const parsedPage = Number.parseInt(query.page, 10);
  const parsedLimit = Number.parseInt(query.limit, 10);

  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = Math.min(
    100,
    Math.max(1, Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10)
  );
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

function buildBankSoalWhere(query, user) {
  const where = [`bs.is_aktif = ${ACTIVE_SQL}`];
  const params = [];
  const scope = appendSekolahScope(where, params, user, 'bs.id_sekolah', query.id_sekolah);

  if (!scope.ok) {
    return { ok: false, where, params };
  }

  if (query.kelas) {
    where.push(`${normalizeKelasSqlExpression('bs.kelas')} = ${addParam(params, normalizeKelasForCompare(query.kelas))}`);
  }

  if (query.mata_pelajaran) {
    where.push(`bs.mata_pelajaran ${LIKE_OPERATOR} ${addParam(params, `%${query.mata_pelajaran}%`)}`);
  }

  if (query.jenis_instrumen) {
    where.push(`bs.jenis_instrumen = ${addParam(params, query.jenis_instrumen)}`);
  }

  if (query.tipe_soal) {
    where.push(`bs.tipe_soal = ${addParam(params, query.tipe_soal)}`);
  }

  if (query.materi) {
    const materi = `%${query.materi}%`;
    where.push(`(bs.materi ${LIKE_OPERATOR} ${addParam(params, materi)} OR bs.topik ${LIKE_OPERATOR} ${addParam(params, materi)})`);
  }

  if (query.search) {
    where.push(`(
      bs.pertanyaan ${LIKE_OPERATOR} ${addParam(params, `%${query.search}%`)} OR
      bs.stimulus_tambahan ${LIKE_OPERATOR} ${addParam(params, `%${query.search}%`)} OR
      bs.pilihan_a ${LIKE_OPERATOR} ${addParam(params, `%${query.search}%`)} OR
      bs.pilihan_b ${LIKE_OPERATOR} ${addParam(params, `%${query.search}%`)} OR
      bs.pilihan_c ${LIKE_OPERATOR} ${addParam(params, `%${query.search}%`)} OR
      bs.pilihan_d ${LIKE_OPERATOR} ${addParam(params, `%${query.search}%`)} OR
      bs.pilihan_e ${LIKE_OPERATOR} ${addParam(params, `%${query.search}%`)}
    )`);
  }

  return { ok: true, where, params };
}

function getWhereSql(where) {
  return where.length ? `WHERE ${where.join(' AND ')}` : '';
}

function safeJsonParse(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeKelasForCompare(value) {
  return normalizeKelas(value)
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeKelasSqlExpression(column) {
  if (!/^[A-Za-z0-9_.]+$/.test(column)) {
    throw new Error(`Nama kolom kelas tidak valid: ${column}`);
  }

  const base = `UPPER(TRIM(REPLACE(${column}, '_', ' ')))`;
  const spacesCollapsed = [
    '     ',
    '    ',
    '   ',
    '  ',
    '  '
  ].reduce((expr, spaces) => `REPLACE(${expr}, '${spaces}', ' ')`, base);
  const spacesToDashes = `REPLACE(${spacesCollapsed}, ' ', '-')`;

  return [
    '--',
    '--',
    '--'
  ].reduce((expr, dashes) => `REPLACE(${expr}, '${dashes}', '-')`, spacesToDashes);
}

function normalizeComparableText(value = '') {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'ya', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'tidak', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function canonicalizeDuplicateValue(value) {
  if (value === undefined || value === null || value === '') return null;

  const parsed = typeof value === 'string'
    ? safeJsonParse(value, value)
    : value;

  if (Array.isArray(parsed)) {
    return parsed.map(item => canonicalizeDuplicateValue(item));
  }

  if (parsed && typeof parsed === 'object') {
    return Object.keys(parsed)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalizeDuplicateValue(parsed[key]);
        return acc;
      }, {});
  }

  if (typeof parsed === 'string') return normalizeComparableText(parsed);
  return parsed;
}

function stableDuplicateStringify(value) {
  const canonical = canonicalizeDuplicateValue(value);
  return canonical === null ? '' : JSON.stringify(canonical);
}

function normalizeDuplicateText(value = '') {
  return normalizeComparableText(value);
}

function getDuplicateKey(soal = {}) {
  const tabelData = soal.tabel_data || buildTabelDataFromBankSoal(soal);

  return [
    normalizeDuplicateText(soal.pertanyaan),
    String(soal.tipe_soal || '').trim().toLowerCase(),
    normalizeDuplicateText(soal.pilihan_a),
    normalizeDuplicateText(soal.pilihan_b),
    normalizeDuplicateText(soal.pilihan_c),
    normalizeDuplicateText(soal.pilihan_d),
    normalizeDuplicateText(soal.pilihan_e),
    normalizeDuplicateText(soal.jawaban_benar),
    stableDuplicateStringify(soal.jawaban_benar_json),
    stableDuplicateStringify(tabelData),
    stableDuplicateStringify(soal.gambar_soal),
    stableDuplicateStringify(soal.pasangan_menjodohkan),
    stableDuplicateStringify(soal.pernyataan_checklist)
  ].join('|');
}

function buildTabelDataFromBankSoal(bankSoal = {}) {
  if (bankSoal.tabel_data) return bankSoal.tabel_data;

  const tables = [];
  const supportingTables = safeJsonParse(bankSoal.supporting_tables, []);
  if (Array.isArray(supportingTables)) tables.push(...supportingTables);

  const layoutBlocks = safeJsonParse(bankSoal.layout_blocks, null);
  const media = safeJsonParse(bankSoal.media, null);
  if (bankSoal.stimulus_tambahan || Array.isArray(layoutBlocks) || Array.isArray(media)) {
    tables.push({
      source: 'bank_soal',
      role: 'layout_blocks',
      type: 'layout_blocks',
      layout_blocks: Array.isArray(layoutBlocks) && layoutBlocks.length
        ? layoutBlocks
        : [{ type: 'question', id: 'question' }],
      stimulus_tambahan: bankSoal.stimulus_tambahan || null,
      gambar: Array.isArray(media) ? media : null
    });
  }

  return tables.length ? JSON.stringify(tables) : null;
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();

  return value
    .map(item => Number(item))
    .filter(item => Number.isInteger(item) && item > 0)
    .filter(item => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function isSameKelas(left, right) {
  const normalizedLeft = normalizeKelasForCompare(left);
  const normalizedRight = normalizeKelasForCompare(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function isSameTextLabel(left, right) {
  const normalizedLeft = normalizeComparableText(left);
  const normalizedRight = normalizeComparableText(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function getCompatibilityIssues(bankSoal = {}, instrumen = {}, options = {}) {
  const issues = [];

  if (!options.allowCrossClass && !isSameKelas(bankSoal.kelas, instrumen.kelas)) {
    issues.push('kelas');
  }

  if (!isSameTextLabel(bankSoal.mata_pelajaran, instrumen.mata_pelajaran)) {
    issues.push('mata_pelajaran');
  }

  if (!isSameTextLabel(bankSoal.jenis_instrumen, instrumen.jenis)) {
    issues.push('jenis_instrumen');
  }

  return issues;
}

function summarizeCompatibilityIssues(incompatibleRows = []) {
  const summary = incompatibleRows.reduce((acc, item) => {
    item.issues.forEach(issue => {
      acc[issue] = (acc[issue] || 0) + 1;
    });
    return acc;
  }, {});

  const parts = [];
  if (summary.kelas) parts.push(`${summary.kelas} beda kelas`);
  if (summary.mata_pelajaran) parts.push(`${summary.mata_pelajaran} beda mata pelajaran`);
  if (summary.jenis_instrumen) parts.push(`${summary.jenis_instrumen} beda jenis instrumen`);

  return parts.join(', ');
}

// GET /api/bank-soal - daftar Bank Soal
router.get(
  '/',
  authenticate,
  authorize('guru', 'admin', 'admin_sekolah', 'super_admin'),
  async (req, res) => {
    try {
      const { page, limit, offset } = getPagination(req.query);
      const filter = buildBankSoalWhere(req.query, req.user);
      if (!filter.ok) return denyAccess(res);

      const whereSql = getWhereSql(filter.where);
      const rowsResult = await pool.query(
        `SELECT
          bs.id,
          bs.id_sekolah,
          sk.nama_sekolah,
          bs.source_instrumen_id,
          bs.source_soal_id,
          i.judul AS source_instrumen_judul,
          bs.kelas,
          bs.mata_pelajaran,
          bs.jenis_instrumen,
          bs.materi,
          bs.topik,
          bs.pertanyaan,
          bs.tipe_soal,
          bs.kategori_instrumen,
          bs.bobot,
          bs.created_at,
          bs.updated_at
         FROM bank_soal bs
         LEFT JOIN instrumen i ON i.id = bs.source_instrumen_id
         LEFT JOIN sekolah sk ON sk.id = bs.id_sekolah
         ${whereSql}
         ORDER BY bs.created_at DESC, bs.id DESC
         LIMIT ${limit} OFFSET ${offset}`,
        filter.params
      );
      const rows = resultRows(rowsResult);

      const totalResult = await pool.query(
        `SELECT ${COUNT_TOTAL_SQL} AS total
         FROM bank_soal bs
         ${whereSql}`,
        filter.params
      );
      const totalRows = resultRows(totalResult);
      const total = Number(totalRows[0]?.total || 0);

      return res.json({
        success: true,
        data: rows,
        meta: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
          is_super_admin: isSuperAdmin(req.user)
        }
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: 'Gagal mengambil data Bank Soal.'
      });
    }
  }
);

// GET /api/bank-soal/summary - statistik Bank Soal
router.get(
  '/summary',
  authenticate,
  authorize('guru', 'admin', 'admin_sekolah', 'super_admin'),
  async (req, res) => {
    try {
      const filter = buildBankSoalWhere(req.query, req.user);
      if (!filter.ok) return denyAccess(res);

      const whereSql = getWhereSql(filter.where);
      const result = await pool.execute(
        `SELECT
          COUNT(*) AS total_soal,
          SUM(CASE WHEN bs.jenis_instrumen = 'Literasi' THEN 1 ELSE 0 END) AS total_literasi,
          SUM(CASE WHEN bs.jenis_instrumen = 'Numerasi' THEN 1 ELSE 0 END) AS total_numerasi,
          SUM(CASE WHEN bs.jenis_instrumen = 'HOTS' THEN 1 ELSE 0 END) AS total_hots,
          SUM(CASE WHEN bs.tipe_soal = 'pilihan_ganda' THEN 1 ELSE 0 END) AS total_pilihan_ganda,
          SUM(CASE WHEN bs.tipe_soal = 'ganda_kompleks' THEN 1 ELSE 0 END) AS total_ganda_kompleks,
          SUM(CASE WHEN bs.tipe_soal = 'benar_salah' THEN 1 ELSE 0 END) AS total_benar_salah,
          SUM(CASE WHEN bs.tipe_soal = 'menjodohkan' THEN 1 ELSE 0 END) AS total_menjodohkan,
          SUM(CASE WHEN bs.tipe_soal = 'sebab_akibat' THEN 1 ELSE 0 END) AS total_sebab_akibat
         FROM bank_soal bs
         ${whereSql}`,
        filter.params
      );
      const rows = resultRows(result);

      const data = rows[0] || {};
      Object.keys(data).forEach(key => {
        data[key] = Number(data[key] || 0);
      });

      return res.json({ success: true, data });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: 'Gagal mengambil ringkasan Bank Soal.'
      });
    }
  }
);

// POST /api/bank-soal/use - salin soal Bank Soal ke instrumen
router.post(
  '/use',
  authenticate,
  authorize('guru', 'admin', 'admin_sekolah', 'super_admin'),
  async (req, res) => {
    const instrumenId = Number(req.body?.instrumen_id);
    const bankSoalIds = normalizeIdList(req.body?.bank_soal_ids);
    const allowCrossClass = parseBoolean(req.body?.allow_cross_class, false);

    if (!Number.isInteger(instrumenId) || instrumenId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Instrumen tujuan wajib dipilih.'
      });
    }

    if (!bankSoalIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Pilih minimal satu soal dari Bank Soal.'
      });
    }

    const conn = await getRouteConnection();

    try {
      await conn.beginTransaction();

      const access = await canAccessInstrumen(req.user, instrumenId, 'manage_soal');
      if (!access.ok) {
        await conn.rollback();
        return res.status(access.status || 403).json({
          success: false,
          message: access.message || 'Anda tidak memiliki akses ke data ini'
        });
      }

      const lockedInstrumenResult = await conn.execute(
        `SELECT * FROM instrumen WHERE id = ${dbPlaceholder(1)} FOR UPDATE`,
        [instrumenId]
      );
      const lockedInstrumenRows = resultRows(lockedInstrumenResult);
      const instrumen = lockedInstrumenRows[0] || access.instrumen;

      if (instrumen.status === 'aktif') {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: 'Instrumen sudah aktif. Tidak bisa menambah soal.'
        });
      }

      if (!instrumen.id_sekolah) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: 'Instrumen belum memiliki data sekolah.'
        });
      }

      const bankParams = [];
      const bankPlaceholders = bankSoalIds.map(id => addParam(bankParams, id)).join(',');
      const schoolPlaceholder = addParam(bankParams, instrumen.id_sekolah);
      const orderByIdList = buildOrderByIdList(bankSoalIds, bankParams, 'id');
      const bankResult = await conn.execute(
        `SELECT *
         FROM bank_soal
         WHERE id IN (${bankPlaceholders})
           AND is_aktif = ${ACTIVE_SQL}
           AND id_sekolah = ${schoolPlaceholder}
         ORDER BY ${orderByIdList}`,
        bankParams
      );
      const bankRows = resultRows(bankResult);

      const foundIds = new Set(bankRows.map(item => Number(item.id)));
      let skippedCount = bankSoalIds.filter(id => !foundIds.has(id)).length;

      const incompatibleRows = bankRows
        .map(bankSoal => ({
          id: Number(bankSoal.id),
          kelas: bankSoal.kelas,
          mata_pelajaran: bankSoal.mata_pelajaran,
          jenis_instrumen: bankSoal.jenis_instrumen,
          issues: getCompatibilityIssues(bankSoal, instrumen, { allowCrossClass })
        }))
        .filter(item => item.issues.length > 0);

      if (incompatibleRows.length) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: `Ada soal Bank Soal yang tidak cocok dengan instrumen tujuan (${summarizeCompatibilityIssues(incompatibleRows)}).`,
          incompatible_count: incompatibleRows.length,
          incompatible_items: incompatibleRows
        });
      }

      const existingResult = await conn.execute(
        `SELECT id, pertanyaan, gambar_soal, tabel_data,
          pilihan_a, pilihan_b, pilihan_c, pilihan_d, pilihan_e,
          jawaban_benar, jawaban_benar_json, tipe_soal, kategori_instrumen, bobot,
          pasangan_menjodohkan, pernyataan_checklist
         FROM soal
         WHERE instrumen_id = ${dbPlaceholder(1)}
         FOR UPDATE`,
        [instrumenId]
      );
      const existingRows = resultRows(existingResult);

      const existingKeys = new Set(existingRows.map(getDuplicateKey));
      const lastResult = await conn.execute(
        `SELECT MAX(nomor) AS nomor FROM soal WHERE instrumen_id = ${dbPlaceholder(1)}`,
        [instrumenId]
      );
      const lastRows = resultRows(lastResult);

      let nextNomor = Number(lastRows[0]?.nomor || 0) + 1;
      const targetSoal = Number(instrumen.jumlah_soal || 0);
      let remainingSlots = targetSoal > 0
        ? Math.max(0, targetSoal - existingRows.length)
        : bankRows.length;

      const addedSoalIds = [];
      const usedBankSoalIds = [];
      let crossClassCount = 0;

      for (const bankSoal of bankRows) {
        if (remainingSlots <= 0) {
          skippedCount += 1;
          continue;
        }

        const duplicateKey = getDuplicateKey(bankSoal);
        if (existingKeys.has(duplicateKey)) {
          skippedCount += 1;
          continue;
        }

        const insertResult = await conn.execute(
          `INSERT INTO soal
            (instrumen_id, nomor, pertanyaan, gambar_soal, tabel_data,
             pilihan_a, pilihan_b, pilihan_c, pilihan_d, pilihan_e,
             jawaban_benar, jawaban_benar_json, tipe_soal, kategori_instrumen, bobot,
             pasangan_menjodohkan, pernyataan_checklist)
           VALUES (${dbPlaceholders(17).join(', ')})${isPostgres ? ' RETURNING id' : ''}`,
          [
            instrumenId,
            nextNomor,
            bankSoal.pertanyaan,
            bankSoal.gambar_soal || null,
            buildTabelDataFromBankSoal(bankSoal),
            bankSoal.pilihan_a || null,
            bankSoal.pilihan_b || null,
            bankSoal.pilihan_c || null,
            bankSoal.pilihan_d || null,
            bankSoal.pilihan_e || null,
            bankSoal.jawaban_benar || null,
            bankSoal.jawaban_benar_json || null,
            bankSoal.tipe_soal || 'pilihan_ganda',
            bankSoal.kategori_instrumen || bankSoal.jenis_instrumen || instrumen.jenis || 'HOTS',
            Number(bankSoal.bobot || 1),
            bankSoal.pasangan_menjodohkan || null,
            bankSoal.pernyataan_checklist || null
          ]
        );

        addedSoalIds.push(resultInsertId(insertResult));
        usedBankSoalIds.push(bankSoal.id);
        if (!isSameKelas(bankSoal.kelas, instrumen.kelas)) {
          crossClassCount += 1;
        }
        existingKeys.add(duplicateKey);
        nextNomor += 1;
        remainingSlots -= 1;
      }

      if (usedBankSoalIds.length) {
        const updateParams = [];
        const updatePlaceholders = usedBankSoalIds.map(id => addParam(updateParams, id)).join(',');
        await conn.execute(
          `UPDATE bank_soal
           SET usage_count = usage_count + 1, updated_at = NOW()
           WHERE id IN (${updatePlaceholders})`,
          updateParams
        );
      }

      await conn.commit();

      return res.json({
        success: true,
        message: addedSoalIds.length
          ? `${addedSoalIds.length} soal berhasil ditambahkan ke instrumen.`
          : 'Tidak ada soal baru yang ditambahkan.',
        added_count: addedSoalIds.length,
        skipped_count: skippedCount,
        cross_class_count: crossClassCount,
        warning: crossClassCount > 0
          ? `${crossClassCount} soal dari kelas berbeda ditambahkan.`
          : null,
        added_soal_ids: addedSoalIds
      });
    } catch (err) {
      await conn.rollback();
      console.error(err);
      return res.status(500).json({
        success: false,
        message: 'Gagal menambahkan soal dari Bank Soal.'
      });
    } finally {
      conn.release();
    }
  }
);

// GET /api/bank-soal/:id - detail soal Bank Soal
router.get(
  '/:id',
  authenticate,
  authorize('guru', 'admin', 'admin_sekolah', 'super_admin'),
  async (req, res) => {
    try {
      const params = [];
      const where = [
        `bs.id = ${addParam(params, req.params.id)}`,
        `bs.is_aktif = ${ACTIVE_SQL}`
      ];
      const scope = appendSekolahScope(where, params, req.user, 'bs.id_sekolah', req.query.id_sekolah);
      if (!scope.ok) return denyAccess(res);

      const result = await pool.execute(
        `SELECT
          bs.*,
          sk.nama_sekolah,
          i.judul AS source_instrumen_judul
         FROM bank_soal bs
         LEFT JOIN instrumen i ON i.id = bs.source_instrumen_id
         LEFT JOIN sekolah sk ON sk.id = bs.id_sekolah
         WHERE ${where.join(' AND ')}
         LIMIT 1`,
        params
      );
      const rows = resultRows(result);

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: 'Soal Bank Soal tidak ditemukan.'
        });
      }

      return res.json({ success: true, data: rows[0] });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: 'Gagal mengambil detail Bank Soal.'
      });
    }
  }
);

// DELETE /api/bank-soal/:id - soft delete soal Bank Soal
router.delete(
  '/:id',
  authenticate,
  authorize('guru', 'admin', 'admin_sekolah', 'super_admin'),
  async (req, res) => {
    try {
      const params = [];
      const where = [
        `id = ${addParam(params, req.params.id)}`,
        `is_aktif = ${ACTIVE_SQL}`
      ];
      const scope = appendSekolahScope(where, params, req.user, 'id_sekolah', req.query.id_sekolah);
      if (!scope.ok) return denyAccess(res);

      const result = await pool.execute(
        `UPDATE bank_soal
         SET is_aktif = ${INACTIVE_SQL}, updated_at = NOW()
         WHERE ${where.join(' AND ')}`,
        params
      );

      if (resultRowCount(result) === 0) {
        return res.status(404).json({
          success: false,
          message: 'Soal Bank Soal tidak ditemukan.'
        });
      }

      return res.json({
        success: true,
        message: 'Soal berhasil dinonaktifkan dari Bank Soal.'
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: 'Gagal menonaktifkan soal Bank Soal.'
      });
    }
  }
);

module.exports = router;
