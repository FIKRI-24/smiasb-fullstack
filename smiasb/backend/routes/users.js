const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const {
  isSuperAdmin,
  isAdminRole,
  denyAccess,
  appendSekolahScope,
  resolveTargetSekolahId,
  sameSekolah,
  normalizeKelas
} = require('../utils/accessControl');
const multer = require('multer');
const path = require('path');
const fs = require('fs'); // Tambahan untuk hapus file lama

async function getUserForAccess(id) {
  const [rows] = await pool.execute(
    'SELECT id, id_sekolah, peran, foto FROM users WHERE id = ?',
    [id]
  );

  return rows[0] || null;
}

function canAccessUserTarget(currentUser, targetUser, allowSelf = true) {
  if (!targetUser) return false;
  if (isSuperAdmin(currentUser)) return true;
  if (allowSelf && Number(currentUser.id) === Number(targetUser.id)) return true;

  return isAdminRole(currentUser.peran) && sameSekolah(currentUser, targetUser.id_sekolah);
}

// ============================================================
// GET /api/users — daftar pengguna (admin only)
// ============================================================
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { peran, search, id_sekolah } = req.query;
    const parsedPage = Number.parseInt(req.query.page, 10);
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Math.min(
      100,
      Math.max(1, Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20)
    );
    const offset = (page - 1) * limit;
    let where = [];
    let params = [];

    if (peran) {
      where.push('u.peran = ?');
      params.push(peran === 'admin' ? 'admin_sekolah' : peran);
    }
    if (search) {
      where.push('(u.nama LIKE ? OR u.email LIKE ? OR u.nis LIKE ?)');
      params.push('%' + search + '%', '%' + search + '%', '%' + search + '%');
    }

    const scope = appendSekolahScope(where, params, req.user, 'u.id_sekolah', id_sekolah);
    if (!scope.ok) return denyAccess(res);

    const whereStr = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const [rows] = await pool.query(
      `SELECT u.id, u.nama, u.email, u.peran, u.id_sekolah, s.nama_sekolah,
              u.mata_pelajaran, u.nip, u.kelas, u.nis, u.foto, u.is_aktif, u.created_at
       FROM users u
       LEFT JOIN sekolah s ON s.id = u.id_sekolah
       ${whereStr}
       ORDER BY u.peran, u.nama
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const [total] = await pool.query(
      `SELECT COUNT(*) as total
       FROM users u
       LEFT JOIN sekolah s ON s.id = u.id_sekolah
       ${whereStr}`,
      params
    );

    return res.json({
      success: true,
      data: rows,
      pagination: { total: total[0].total, page, limit }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// ============================================================
// GET /api/users/:id
// ============================================================
router.get('/:id', authenticate, async (req, res) => {
  // Hanya admin atau pemilik akun sendiri
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.nama, u.email, u.peran, u.id_sekolah, s.nama_sekolah,
              u.mata_pelajaran, u.nip, u.kelas, u.nis, u.foto, u.is_aktif, u.created_at
       FROM users u
       LEFT JOIN sekolah s ON s.id = u.id_sekolah
       WHERE u.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });
    if (!canAccessUserTarget(req.user, rows[0], true)) return denyAccess(res);
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// ============================================================
// POST /api/users — tambah pengguna (admin)
// ============================================================
router.post('/', authenticate, authorize('admin'), [
  body('nama').trim().notEmpty().withMessage('Nama wajib diisi'),
  body('email')
    .if((value, { req }) => req.body.peran !== 'siswa')
    .isEmail()
    .withMessage('Email tidak valid'),
  body('nis')
    .if((value, { req }) => req.body.peran === 'siswa')
    .trim()
    .notEmpty()
    .withMessage('NIS siswa wajib diisi'),
  body('password').isLength({ min: 6 }).withMessage('Password minimal 6 karakter'),
  body('peran').isIn(['admin', 'admin_sekolah', 'guru', 'siswa']).withMessage('Peran tidak valid'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { nama, email, password, peran, mata_pelajaran, nip, kelas, nis, id_sekolah } = req.body;
  const normalizedPeran = peran === 'admin' ? 'admin_sekolah' : peran;
  const normalizedEmail = normalizedPeran === 'siswa' ? null : String(email).trim().toLowerCase();
  const normalizedNis = normalizedPeran === 'siswa' ? String(nis).trim() : null;
  const normalizedSiswaKelas = normalizedPeran === 'siswa' ? normalizeKelas(kelas) : null;
  const targetSekolah = resolveTargetSekolahId(req.user, id_sekolah);

  if (!targetSekolah.ok) {
    return denyAccess(res);
  }

  try {
    if (normalizedPeran !== 'siswa') {
      const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
      if (existing.length > 0) return res.status(409).json({ success: false, message: 'Email sudah terdaftar.' });
    }

    if (normalizedPeran === 'siswa') {
      const [existingNis] = await pool.execute('SELECT id FROM users WHERE nis = ? AND peran = "siswa"', [normalizedNis]);
      if (existingNis.length > 0) return res.status(409).json({ success: false, message: 'NIS sudah terdaftar.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO users (nama, email, password, peran, mata_pelajaran, nip, kelas, nis, id_sekolah) VALUES (?,?,?,?,?,?,?,?,?)',
      [
        nama,
        normalizedEmail,
        hashed,
        normalizedPeran,
        normalizedPeran === 'guru' ? mata_pelajaran || null : null,
        normalizedPeran === 'guru' ? nip || null : null,
        normalizedSiswaKelas || null,
        normalizedNis,
        targetSekolah.id_sekolah
      ]
    );

    return res.status(201).json({ success: true, message: 'Pengguna berhasil ditambahkan.', data: { id: result.insertId } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// ============================================================
// PUT /api/users/:id — update pengguna
// ============================================================
router.put('/:id', authenticate, async (req, res) => {
  const { nama, mata_pelajaran, nip, kelas, nis } = req.body;

  try {
    const targetUser = await getUserForAccess(req.params.id);
    if (!targetUser) return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });
    if (!canAccessUserTarget(req.user, targetUser, true)) return denyAccess(res);

    const normalizedUserKelas =
      kelas !== undefined && kelas !== null && String(kelas).trim() !== ''
        ? normalizeKelas(kelas)
        : null;

    await pool.execute(
      'UPDATE users SET nama=?, mata_pelajaran=?, nip=?, kelas=?, nis=? WHERE id=?',
      [nama, mata_pelajaran||null, nip||null, normalizedUserKelas, nis||null, req.params.id]
    );
    return res.json({ success: true, message: 'Profil berhasil diperbarui.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// ============================================================
// PATCH /api/users/:id/toggle — aktif/nonaktif (admin)
// ============================================================
router.patch('/:id/toggle', authenticate, authorize('admin'), async (req, res) => {
  try {
    const targetUser = await getUserForAccess(req.params.id);
    if (!targetUser) return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });
    if (!canAccessUserTarget(req.user, targetUser, false)) return denyAccess(res);

    await pool.execute('UPDATE users SET is_aktif = NOT is_aktif WHERE id = ?', [req.params.id]);
    return res.json({ success: true, message: 'Status pengguna diperbarui.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

async function updateManagedUserPassword(req, res) {
  const newPass = String(req.body.password || '').trim();

  if (newPass.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password baru minimal 6 karakter.'
    });
  }

  try {
    const targetUser = await getUserForAccess(req.params.id);
    if (!targetUser) return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });
    if (!canAccessUserTarget(req.user, targetUser, false)) return denyAccess(res);
    if (!['guru', 'siswa'].includes(targetUser.peran)) {
      return res.status(400).json({
        success: false,
        message: 'Password hanya dapat diedit untuk akun guru atau siswa.'
      });
    }

    const hashed = await bcrypt.hash(newPass, 10);
    await pool.execute('UPDATE users SET password = ? WHERE id = ?', [hashed, req.params.id]);
    return res.json({ success: true, message: 'Password pengguna berhasil diperbarui.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
}

router.patch('/:id/password', authenticate, authorize('admin'), updateManagedUserPassword);

// ============================================================
// DELETE /api/users/:id (admin)
// ============================================================
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  if (req.user.id === parseInt(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Tidak bisa hapus akun sendiri.' });
  }
  try {
    // Hapus file foto jika ada sebelum menghapus user
    const targetUser = await getUserForAccess(req.params.id);
    if (!targetUser) return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });
    if (!canAccessUserTarget(req.user, targetUser, false)) return denyAccess(res);

    if (targetUser.foto) {
      const fotoPath = '.' + targetUser.foto;
      if (fs.existsSync(fotoPath)) {
        fs.unlinkSync(fotoPath);
      }
    }
    
    await pool.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
    return res.json({ success: true, message: 'Pengguna berhasil dihapus.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// ============================================================
// Konfigurasi Multer untuk upload foto
// ============================================================
// Buat folder jika belum ada
const uploadDir = './uploads/users';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `user-${req.params.id}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Hanya file gambar yang diperbolehkan (jpeg, jpg, png, gif)'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: fileFilter
});

// ============================================================
// POST /api/users/:id/upload-foto - upload/update foto profil
// ============================================================
router.post('/:id/upload-foto', authenticate, upload.single('foto'), async (req, res) => {
  // Cek akses: admin atau pemilik akun sendiri
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File foto tidak ditemukan.' });
    }

    // Cek apakah user ada
    const targetUser = await getUserForAccess(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });
    }
    if (!canAccessUserTarget(req.user, targetUser, true)) return denyAccess(res);

    // Hapus foto lama jika ada
    if (targetUser.foto) {
      const oldFotoPath = '.' + targetUser.foto;
      if (fs.existsSync(oldFotoPath)) {
        fs.unlinkSync(oldFotoPath);
      }
    }

    // Simpan path foto baru ke database
    const fotoPath = `/uploads/users/${req.file.filename}`;
    await pool.execute('UPDATE users SET foto = ? WHERE id = ?', [fotoPath, req.params.id]);

    return res.json({ 
      success: true, 
      message: 'Foto profil berhasil diupload.',
      data: { fotoUrl: fotoPath }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// ============================================================
// DELETE /api/users/:id/foto - hapus foto profil
// ============================================================
router.delete('/:id/foto', authenticate, async (req, res) => {
  // Cek akses: admin atau pemilik akun sendiri
  try {
    const targetUser = await getUserForAccess(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });
    }
    if (!canAccessUserTarget(req.user, targetUser, true)) return denyAccess(res);

    if (targetUser.foto) {
      const fotoPath = '.' + targetUser.foto;
      if (fs.existsSync(fotoPath)) {
        fs.unlinkSync(fotoPath);
      }
      await pool.execute('UPDATE users SET foto = NULL WHERE id = ?', [req.params.id]);
    }

    return res.json({ success: true, message: 'Foto profil berhasil dihapus.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// ============================================================
// GET /api/users/:id/foto - ambil foto profil
// ============================================================
router.get('/:id/foto', authenticate, async (req, res) => {
  try {
    const targetUser = await getUserForAccess(req.params.id);
    if (!targetUser || !targetUser.foto) {
      return res.status(404).json({ success: false, message: 'Foto tidak ditemukan' });
    }
    if (!canAccessUserTarget(req.user, targetUser, true)) return denyAccess(res);
    
    const fotoPath = path.join(__dirname, '..', targetUser.foto);
    if (fs.existsSync(fotoPath)) {
      res.sendFile(fotoPath);
    } else {
      res.status(404).json({ success: false, message: 'File foto tidak ditemukan' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
