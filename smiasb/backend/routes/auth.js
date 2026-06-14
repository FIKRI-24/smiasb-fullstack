const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { normalizeKelas } = require('../utils/accessControl');

// ==========================
// Helper Token dan User Auth
// ==========================
function normalizePeran(peran) {
  return peran === 'admin' ? 'admin_sekolah' : peran;
}

function getTokenExpiresIn(peran) {
  const expiresByRole = {
    siswa: '2h',
    guru: '6h',
    admin: '4h',
    admin_sekolah: '4h',
    super_admin: '4h'
  };

  return expiresByRole[peran] || '2h';
}

function toAuthUser(user) {
  if (!user) return null;

  const isAktif = Number(user.is_aktif) === 1;

  return {
    id: user.id,
    id_user: user.id,
    nama: user.nama,
    email: user.email,
    peran: normalizePeran(user.peran),
    id_sekolah: user.id_sekolah ?? null,
    nama_sekolah: user.nama_sekolah ?? null,
    mata_pelajaran: user.mata_pelajaran ?? null,
    nip: user.nip ?? null,
    kelas: user.kelas ?? null,
    nis: user.nis ?? null,
    foto: user.foto ?? null,
    is_aktif: isAktif,
    status_aktif: isAktif
  };
}

function generateToken(user) {
  const authUser = toAuthUser(user);

  return jwt.sign(
    {
      id: authUser.id_user,
      id_user: authUser.id_user,
      nama: authUser.nama,
      email: authUser.email,
      peran: authUser.peran,
      id_sekolah: authUser.id_sekolah,
      nama_sekolah: authUser.nama_sekolah,
      kelas: authUser.kelas,
      is_aktif: authUser.is_aktif
    },
    process.env.JWT_SECRET || 'SECRETKEY',
    { expiresIn: getTokenExpiresIn(authUser.peran) }
  );
}

const AUTH_USER_SELECT = `
  SELECT
    u.id,
    u.nama,
    u.email,
    u.password,
    u.peran,
    u.mata_pelajaran,
    u.nip,
    u.kelas,
    u.nis,
    u.foto,
    u.is_aktif,
    u.id_sekolah,
    s.nama_sekolah
  FROM users u
  LEFT JOIN sekolah s ON s.id = u.id_sekolah
`;

async function getDefaultSekolahId() {
  const [rows] = await pool.execute(
    'SELECT id FROM sekolah WHERE nama_sekolah = ? ORDER BY id ASC LIMIT 1',
    ['SMPS Adabiah Padang']
  );

  return rows[0]?.id || null;
}

async function getAuthUserById(id) {
  const [rows] = await pool.execute(
    `${AUTH_USER_SELECT} WHERE u.id = ?`,
    [id]
  );

  return rows[0] || null;
}

// ==========================
// Helper Log
// ==========================
async function logActivity(userId, aksi, detail = null, ip = null) {
  try {
    await pool.execute(
      'INSERT INTO activity_log (user_id, aksi, detail, ip_address) VALUES (?,?,?,?)',
      [userId, aksi, detail, ip]
    );
  } catch (err) {
    console.log('Log error:', err.message);
  }
}

// ==========================
// REGISTER
// ==========================
router.post('/register', [
  body('nama').trim().notEmpty().withMessage('Nama lengkap wajib diisi.'),
  body('kelas').trim().notEmpty().withMessage('Kelas siswa wajib diisi.'),
  body('nis').trim().notEmpty().withMessage('NIS siswa wajib diisi.'),
  body('password').isLength({ min: 6 }).withMessage('Password minimal 6 karakter.')
], async (req, res) => {

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { nama, password, kelas, nis } = req.body;
  const peran = 'siswa';
  const normalizedNis = String(nis).trim();
  const normalizedKelas = normalizeKelas(kelas);

  try {
    const defaultSekolahId = await getDefaultSekolahId();

    const [existingNis] = await pool.execute(
      'SELECT id FROM users WHERE nis = ? AND peran = "siswa"',
      [normalizedNis]
    );

    if (existingNis.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'NIS sudah terdaftar'
      });
    }

    const hashedPass = await bcrypt.hash(password, 10);

    const [result] = await pool.execute(
      `INSERT INTO users
      (nama, email, password, peran, mata_pelajaran, nip, kelas, nis, id_sekolah, is_aktif)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nama,
        null,
        hashedPass,
        peran,
        null,
        null,
        normalizedKelas || null,
        normalizedNis,
        defaultSekolahId,
        1
      ]
    );

    const userId = result.insertId;
    const user = await getAuthUserById(userId);
    const token = generateToken(user);

    await logActivity(userId, 'REGISTER', `User baru: ${normalizedNis}`, req.ip);

    return res.status(201).json({
      success: true,
      message: 'Register berhasil',
      data: { token, user: toAuthUser(user) }
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ==========================
// LOGIN
// ==========================
router.post('/login', async (req, res) => {
  try {
    const { email, identifier, nis, password } = req.body;
    const loginId = String(identifier || email || nis || '').trim();

    if (!loginId || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email/NIS/Username dan password wajib diisi'
      });
    }

    const isEmailLogin = loginId.includes('@');
    const [rows] = isEmailLogin
      ? await pool.execute(
        `${AUTH_USER_SELECT} WHERE LOWER(u.email) = ?`,
        [loginId.toLowerCase()]
      )
      : await pool.execute(
        `${AUTH_USER_SELECT}
         WHERE (u.nis = ? AND u.peran = "siswa")
            OR LOWER(u.email) = ?
         ORDER BY FIELD(u.peran, 'super_admin', 'admin_sekolah', 'admin', 'guru', 'siswa')
         LIMIT 1`,
        [loginId, loginId.toLowerCase()]
      );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Email/NIS/Username atau password salah'
      });
    }

    const user = rows[0];

    if (user.is_aktif !== null && Number(user.is_aktif) === 0) {
      return res.status(403).json({
        success: false,
        message: 'Akun dinonaktifkan'
      });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({
        success: false,
        message: 'Email/NIS/Username atau password salah'
      });
    }

    const token = generateToken(user);
    const authUser = toAuthUser(user);

    return res.json({
      success: true,
      message: 'Login berhasil',
      data: {
        token,
        user: authUser
      }
    });

  } catch (err) {
    console.error('LOGIN ERROR:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: err.message
    });
  }
});

// ==========================
// LOGOUT
// ==========================
router.post('/logout', authenticate, async (req, res) => {
  await logActivity(req.user.id, 'LOGOUT', null, req.ip);
  res.json({ success: true, message: 'Logout berhasil' });
});

// ==========================
// GET PROFILE
// ==========================
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await getAuthUserById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });
    }

    res.json({ success: true, data: toAuthUser(user) });

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// ==========================
// CHANGE PASSWORD
// ==========================
router.put('/change-password', authenticate, async (req, res) => {
  const { password_lama, password_baru } = req.body;

  try {
    const [rows] = await pool.execute(
      'SELECT password FROM users WHERE id = ?',
      [req.user.id]
    );

    const match = await bcrypt.compare(password_lama, rows[0].password);

    if (!match) {
      return res.status(400).json({
        success: false,
        message: 'Password lama salah'
      });
    }

    const hashed = await bcrypt.hash(password_baru, 10);

    await pool.execute(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashed, req.user.id]
    );

    res.json({
      success: true,
      message: 'Password berhasil diubah'
    });

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;
