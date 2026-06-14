const express = require('express');
const router = express.Router();

const { pool } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const {
  appendSekolahScope,
  canAccessInstrumen,
  denyAccess,
  isSuperAdmin
} = require('../utils/accessControl');

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
  const where = ['bs.is_aktif = 1'];
  const params = [];
  const scope = appendSekolahScope(where, params, user, 'bs.id_sekolah', query.id_sekolah);

  if (!scope.ok) {
    return { ok: false, where, params };
  }

  if (query.kelas) {
    where.push('bs.kelas = ?');
    params.push(query.kelas);
  }

  if (query.mata_pelajaran) {
    where.push('bs.mata_pelajaran LIKE ?');
    params.push(`%${query.mata_pelajaran}%`);
  }

  if (query.jenis_instrumen) {
    where.push('bs.jenis_instrumen = ?');
    params.push(query.jenis_instrumen);
  }

  if (query.tipe_soal) {
    where.push('bs.tipe_soal = ?');
    params.push(query.tipe_soal);
  }

  if (query.materi) {
    where.push('(bs.materi LIKE ? OR bs.topik LIKE ?)');
    params.push(`%${query.materi}%`, `%${query.materi}%`);
  }

  if (query.search) {
    where.push(`(
      bs.pertanyaan LIKE ? OR
      bs.stimulus_tambahan LIKE ? OR
      bs.pilihan_a LIKE ? OR
      bs.pilihan_b LIKE ? OR
      bs.pilihan_c LIKE ? OR
      bs.pilihan_d LIKE ? OR
      bs.pilihan_e LIKE ?
    )`);
    const keyword = `%${query.search}%`;
    params.push(keyword, keyword, keyword, keyword, keyword, keyword, keyword);
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

function normalizeDuplicateText(value = '') {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getDuplicateKey(soal = {}) {
  return [
    normalizeDuplicateText(soal.pertanyaan),
    String(soal.tipe_soal || '').trim().toLowerCase(),
    normalizeDuplicateText(soal.jawaban_benar)
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
      const [rows] = await pool.query(
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

      const [totalRows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM bank_soal bs
         ${whereSql}`,
        filter.params
      );

      return res.json({
        success: true,
        data: rows,
        meta: {
          page,
          limit,
          total: totalRows[0]?.total || 0,
          total_pages: Math.ceil((totalRows[0]?.total || 0) / limit),
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
      const [rows] = await pool.execute(
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

    const conn = await pool.getConnection();

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

      const instrumen = access.instrumen;
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

      const placeholders = bankSoalIds.map(() => '?').join(',');
      const [bankRows] = await conn.execute(
        `SELECT *
         FROM bank_soal
         WHERE id IN (${placeholders})
           AND is_aktif = 1
           AND id_sekolah = ?
         ORDER BY FIELD(id, ${placeholders})`,
        [...bankSoalIds, instrumen.id_sekolah, ...bankSoalIds]
      );

      const foundIds = new Set(bankRows.map(item => Number(item.id)));
      let skippedCount = bankSoalIds.filter(id => !foundIds.has(id)).length;

      const [existingRows] = await conn.execute(
        `SELECT id, pertanyaan, tipe_soal, jawaban_benar
         FROM soal
         WHERE instrumen_id = ?`,
        [instrumenId]
      );

      const existingKeys = new Set(existingRows.map(getDuplicateKey));
      const [lastRows] = await conn.execute(
        'SELECT MAX(nomor) AS nomor FROM soal WHERE instrumen_id = ?',
        [instrumenId]
      );

      let nextNomor = Number(lastRows[0]?.nomor || 0) + 1;
      const targetSoal = Number(instrumen.jumlah_soal || 0);
      let remainingSlots = targetSoal > 0
        ? Math.max(0, targetSoal - existingRows.length)
        : bankRows.length;

      const addedSoalIds = [];
      const usedBankSoalIds = [];

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

        const [insertResult] = await conn.execute(
          `INSERT INTO soal
            (instrumen_id, nomor, pertanyaan, gambar_soal, tabel_data,
             pilihan_a, pilihan_b, pilihan_c, pilihan_d, pilihan_e,
             jawaban_benar, jawaban_benar_json, tipe_soal, kategori_instrumen, bobot,
             pasangan_menjodohkan, pernyataan_checklist)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

        addedSoalIds.push(insertResult.insertId);
        usedBankSoalIds.push(bankSoal.id);
        existingKeys.add(duplicateKey);
        nextNomor += 1;
        remainingSlots -= 1;
      }

      if (usedBankSoalIds.length) {
        const updatePlaceholders = usedBankSoalIds.map(() => '?').join(',');
        await conn.execute(
          `UPDATE bank_soal
           SET usage_count = usage_count + 1, updated_at = NOW()
           WHERE id IN (${updatePlaceholders})`,
          usedBankSoalIds
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
      const where = ['bs.id = ?', 'bs.is_aktif = 1'];
      const params = [req.params.id];
      const scope = appendSekolahScope(where, params, req.user, 'bs.id_sekolah', req.query.id_sekolah);
      if (!scope.ok) return denyAccess(res);

      const [rows] = await pool.execute(
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
      const where = ['id = ?', 'is_aktif = 1'];
      const params = [req.params.id];
      const scope = appendSekolahScope(where, params, req.user, 'id_sekolah', req.query.id_sekolah);
      if (!scope.ok) return denyAccess(res);

      const [result] = await pool.execute(
        `UPDATE bank_soal
         SET is_aktif = 0, updated_at = NOW()
         WHERE ${where.join(' AND ')}`,
        params
      );

      if (result.affectedRows === 0) {
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
