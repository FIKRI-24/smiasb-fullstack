const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { pool, isPostgres, dbPlaceholder, dbPlaceholders } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { denyAccess, isSuperAdmin, parseId } = require('../utils/accessControl');

const SCHOOL_ORDER_SQL = isPostgres
  ? "CASE s.nama_sekolah WHEN 'SMPS Adabiah Padang' THEN 1 WHEN 'SMPN 12 Padang' THEN 2 WHEN 'MTsN 6 Padang' THEN 3 ELSE 4 END, s.nama_sekolah ASC"
  : "FIELD(s.nama_sekolah, 'SMPS Adabiah Padang', 'SMPN 12 Padang', 'MTsN 6 Padang'), s.nama_sekolah ASC";
const ACTIVE_USER_SQL = isPostgres ? 'TRUE' : '1';

function resultRows(result) {
  return result.rows || result[0] || [];
}

function getInsertedId(result) {
  return isPostgres ? result.rows[0]?.id : result.insertId ?? result[0]?.insertId;
}

function isDuplicateEntry(err) {
  return err.code === 'ER_DUP_ENTRY' || err.code === '23505';
}

function requireSuperAdmin(req, res, next) {
  if (!isSuperAdmin(req.user)) return denyAccess(res);
  next();
}

function normalizeText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeStatus(value, fallback = 'aktif') {
  return value === 'nonaktif' ? 'nonaktif' : fallback;
}

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;

  res.status(400).json({ success: false, errors: errors.array() });
  return true;
}

async function getSekolahById(id) {
  const result = await pool.execute(
    `SELECT
       s.id,
       s.nama_sekolah,
       s.npsn,
       s.alamat,
       s.status,
       s.created_at,
       s.updated_at,
       COALESCE((SELECT COUNT(*) FROM users u WHERE u.id_sekolah = s.id AND u.peran = 'guru' AND u.is_aktif = ${ACTIVE_USER_SQL}), 0) as jumlah_guru,
       COALESCE((SELECT COUNT(*) FROM users u WHERE u.id_sekolah = s.id AND u.peran = 'siswa' AND u.is_aktif = ${ACTIVE_USER_SQL}), 0) as jumlah_siswa,
       COALESCE((SELECT COUNT(*) FROM instrumen i WHERE i.id_sekolah = s.id), 0) as jumlah_instrumen,
       COALESCE((SELECT COUNT(*) FROM instrumen i WHERE i.id_sekolah = s.id AND i.status = 'aktif'), 0) as jumlah_instrumen_aktif
     FROM sekolah s
     WHERE s.id = ${dbPlaceholder(1)}`,
    [id]
  );
  const rows = resultRows(result);

  return rows[0] || null;
}

// GET /api/sekolah - daftar sekolah untuk super admin
router.get('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.execute(
      `SELECT
         s.id,
         s.nama_sekolah,
         s.npsn,
         s.alamat,
         s.status,
         s.created_at,
         s.updated_at,
         COALESCE((SELECT COUNT(*) FROM users u WHERE u.id_sekolah = s.id AND u.peran = 'guru' AND u.is_aktif = ${ACTIVE_USER_SQL}), 0) as jumlah_guru,
         COALESCE((SELECT COUNT(*) FROM users u WHERE u.id_sekolah = s.id AND u.peran = 'siswa' AND u.is_aktif = ${ACTIVE_USER_SQL}), 0) as jumlah_siswa,
         COALESCE((SELECT COUNT(*) FROM instrumen i WHERE i.id_sekolah = s.id), 0) as jumlah_instrumen,
         COALESCE((SELECT COUNT(*) FROM instrumen i WHERE i.id_sekolah = s.id AND i.status = 'aktif'), 0) as jumlah_instrumen_aktif
       FROM sekolah s
       ORDER BY ${SCHOOL_ORDER_SQL}`
    );
    const rows = resultRows(result);

    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// GET /api/sekolah/:id - detail sekolah
router.get('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID sekolah tidak valid.' });

    const sekolah = await getSekolahById(id);
    if (!sekolah) return res.status(404).json({ success: false, message: 'Sekolah tidak ditemukan.' });

    return res.json({ success: true, data: sekolah });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// POST /api/sekolah - tambah sekolah
router.post('/', authenticate, requireSuperAdmin, [
  body('nama_sekolah').trim().notEmpty().withMessage('Nama sekolah wajib diisi.'),
  body('status').optional().isIn(['aktif', 'nonaktif']).withMessage('Status tidak valid.'),
], async (req, res) => {
  if (handleValidation(req, res)) return;

  const namaSekolah = normalizeText(req.body.nama_sekolah);
  const npsn = normalizeText(req.body.npsn);
  const alamat = normalizeText(req.body.alamat);
  const status = normalizeStatus(req.body.status);

  try {
    const result = await pool.execute(
      `INSERT INTO sekolah (nama_sekolah, npsn, alamat, status)
       VALUES (${dbPlaceholders(4).join(', ')})${isPostgres ? ' RETURNING id' : ''}`,
      [namaSekolah, npsn, alamat, status]
    );
    const sekolah = await getSekolahById(getInsertedId(result));

    return res.status(201).json({
      success: true,
      message: 'Sekolah berhasil ditambahkan.',
      data: sekolah
    });
  } catch (err) {
    if (isDuplicateEntry(err)) {
      return res.status(409).json({ success: false, message: 'Nama sekolah sudah terdaftar.' });
    }

    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// PUT /api/sekolah/:id - update sekolah
router.put('/:id', authenticate, requireSuperAdmin, [
  body('nama_sekolah').trim().notEmpty().withMessage('Nama sekolah wajib diisi.'),
  body('status').optional().isIn(['aktif', 'nonaktif']).withMessage('Status tidak valid.'),
], async (req, res) => {
  if (handleValidation(req, res)) return;

  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'ID sekolah tidak valid.' });

  const namaSekolah = normalizeText(req.body.nama_sekolah);
  const npsn = normalizeText(req.body.npsn);
  const alamat = normalizeText(req.body.alamat);
  const status = normalizeStatus(req.body.status);

  try {
    const existing = await getSekolahById(id);
    if (!existing) return res.status(404).json({ success: false, message: 'Sekolah tidak ditemukan.' });

    await pool.execute(
      `UPDATE sekolah
       SET nama_sekolah = ${dbPlaceholder(1)}, npsn = ${dbPlaceholder(2)}, alamat = ${dbPlaceholder(3)}, status = ${dbPlaceholder(4)}
       WHERE id = ${dbPlaceholder(5)}`,
      [namaSekolah, npsn, alamat, status, id]
    );

    const sekolah = await getSekolahById(id);
    return res.json({ success: true, message: 'Sekolah berhasil diperbarui.', data: sekolah });
  } catch (err) {
    if (isDuplicateEntry(err)) {
      return res.status(409).json({ success: false, message: 'Nama sekolah sudah terdaftar.' });
    }

    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// PATCH /api/sekolah/:id/status - toggle atau set status sekolah
router.patch('/:id/status', authenticate, requireSuperAdmin, [
  body('status').optional().isIn(['aktif', 'nonaktif']).withMessage('Status tidak valid.'),
], async (req, res) => {
  if (handleValidation(req, res)) return;

  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'ID sekolah tidak valid.' });

  try {
    const existing = await getSekolahById(id);
    if (!existing) return res.status(404).json({ success: false, message: 'Sekolah tidak ditemukan.' });

    const nextStatus = req.body.status || (existing.status === 'aktif' ? 'nonaktif' : 'aktif');
    await pool.execute(
      `UPDATE sekolah SET status = ${dbPlaceholder(1)} WHERE id = ${dbPlaceholder(2)}`,
      [nextStatus, id]
    );

    const sekolah = await getSekolahById(id);
    return res.json({ success: true, message: 'Status sekolah diperbarui.', data: sekolah });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// DELETE /api/sekolah/:id - aman: nonaktifkan sekolah, bukan hapus permanen
router.delete('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'ID sekolah tidak valid.' });

  try {
    const existing = await getSekolahById(id);
    if (!existing) return res.status(404).json({ success: false, message: 'Sekolah tidak ditemukan.' });

    await pool.execute(
      `UPDATE sekolah SET status = ${dbPlaceholder(1)} WHERE id = ${dbPlaceholder(2)}`,
      ['nonaktif', id]
    );
    const sekolah = await getSekolahById(id);

    return res.json({
      success: true,
      message: 'Sekolah dinonaktifkan. Data terkait tidak dihapus.',
      data: sekolah
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

module.exports = router;
