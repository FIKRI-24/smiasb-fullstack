const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
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

function getGoogleClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  return clientId ? new OAuth2Client(clientId) : null;
}

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

async function ensurePasswordResetRequestsTable() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS password_reset_requests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NULL,
      identifier VARCHAR(191) NOT NULL,
      peran VARCHAR(50) NULL,
      id_sekolah BIGINT UNSIGNED NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      ip_address VARCHAR(80) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME NULL,
      PRIMARY KEY (id),
      KEY idx_password_reset_user_status (user_id, status),
      KEY idx_password_reset_school_status (id_sekolah, status),
      KEY idx_password_reset_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

async function ensurePasswordResetOtpsTable() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS password_reset_otps (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      email VARCHAR(191) NOT NULL,
      otp_hash CHAR(64) NOT NULL,
      attempt_count INT NOT NULL DEFAULT 0,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      ip_address VARCHAR(80) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_password_reset_otps_user_created (user_id, created_at),
      KEY idx_password_reset_otps_email_created (email, created_at),
      KEY idx_password_reset_otps_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

function getOtpHash(userId, otp) {
  return crypto
    .createHash('sha256')
    .update(`${userId}:${otp}:${process.env.JWT_SECRET || 'SECRETKEY'}`)
    .digest('hex');
}

function createOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function getSmtpTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  const port = Number(process.env.SMTP_PORT || 587);

  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: { user, pass }
  });
}

async function sendTeacherResetOtpEmail(user, otp) {
  const transporter = getSmtpTransport();
  const allowConsoleOtp =
    process.env.RESET_OTP_CONSOLE === 'true' ||
    process.env.NODE_ENV !== 'production';

  if (!transporter) {
    if (!allowConsoleOtp) {
      throw new Error('SMTP email belum dikonfigurasi. Isi SMTP_HOST, SMTP_USER, dan SMTP_PASS di file .env backend.');
    }

    console.log(`[RESET OTP DEV] ${user.email}: ${otp}`);
    return { devConsole: true };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  return transporter.sendMail({
    from,
    to: user.email,
    subject: 'Kode OTP Reset Password SMIASB',
    text: [
      `Halo ${user.nama || 'Bapak/Ibu Guru'},`,
      '',
      `Kode OTP reset password SMIASB Anda adalah: ${otp}`,
      'Kode ini berlaku selama 10 menit dan hanya dapat digunakan satu kali.',
      '',
      'Jika Anda tidak meminta reset password, abaikan email ini.'
    ].join('\n')
  });
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
// GOOGLE LOGIN KHUSUS GURU
// ==========================
router.post('/google-login', async (req, res) => {
  try {
    const credential = String(req.body.credential || req.body.idToken || req.body.token || '').trim();
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const googleClient = getGoogleClient();

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: 'Credential Google wajib diisi.'
      });
    }

    if (!clientId || !googleClient) {
      return res.status(500).json({
        success: false,
        message: 'Google Login belum dikonfigurasi.'
      });
    }

    let payload;

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: clientId
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      return res.status(400).json({
        success: false,
        message: 'Credential Google tidak valid.'
      });
    }

    const googleEmail = String(payload?.email || '').trim().toLowerCase();

    if (!googleEmail || payload?.email_verified !== true) {
      return res.status(400).json({
        success: false,
        message: 'Email Google belum terverifikasi.'
      });
    }

    const [rows] = await pool.execute(
      `${AUTH_USER_SELECT}
       WHERE LOWER(u.email) = ?
         AND u.peran = "guru"
       LIMIT 1`,
      [googleEmail]
    );

    const user = rows[0];

    if (!user || Number(user.is_aktif) === 0) {
      return res.status(403).json({
        success: false,
        message: 'Akun guru belum terdaftar oleh admin sekolah.'
      });
    }

    const token = generateToken(user);
    const authUser = toAuthUser(user);

    return res.json({
      success: true,
      message: 'Login Google berhasil',
      data: {
        token,
        user: authUser
      }
    });
  } catch (err) {
    console.error('GOOGLE LOGIN ERROR:', err);
    return res.status(500).json({
      success: false,
      message: 'Login Google belum dapat diproses.'
    });
  }
});

// ==========================
// FORGOT PASSWORD
// ==========================
router.post('/forgot-password', [
  body('identifier').trim().notEmpty().withMessage('Email atau NIS wajib diisi.')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const identifier = String(req.body.identifier || '').trim();
  const genericMessage = 'Jika data akun cocok, instruksi reset password akan diproses sesuai jenis akun.';

  try {
    const isEmail = identifier.includes('@');
    const [rows] = isEmail
      ? await pool.execute(
        `${AUTH_USER_SELECT} WHERE LOWER(u.email) = ? AND u.peran IN ("guru", "siswa") LIMIT 1`,
        [identifier.toLowerCase()]
      )
      : await pool.execute(
        `${AUTH_USER_SELECT}
         WHERE ((u.nis = ? AND u.peran = "siswa") OR LOWER(u.email) = ?)
           AND u.peran IN ("guru", "siswa")
         ORDER BY FIELD(u.peran, 'guru', 'siswa')
         LIMIT 1`,
        [identifier, identifier.toLowerCase()]
      );

    const user = rows[0];

    if (user && Number(user.is_aktif) !== 0 && user.peran === 'guru' && user.email) {
      await ensurePasswordResetOtpsTable();

      const [recentOtpRows] = await pool.execute(
        `SELECT id FROM password_reset_otps
         WHERE user_id = ?
           AND used_at IS NULL
           AND created_at >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
         LIMIT 1`,
        [user.id]
      );

      if (recentOtpRows.length > 0) {
        return res.status(429).json({
          success: false,
          message: 'OTP baru saja dikirim. Silakan tunggu beberapa menit sebelum meminta kode baru.'
        });
      }

      const otp = createOtpCode();
      const otpHash = getOtpHash(user.id, otp);

      await pool.execute(
        `UPDATE password_reset_otps
         SET used_at = NOW()
         WHERE user_id = ? AND used_at IS NULL`,
        [user.id]
      );

      await pool.execute(
        `INSERT INTO password_reset_otps
         (user_id, email, otp_hash, expires_at, ip_address, created_at)
         VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), ?, NOW())`,
        [user.id, user.email, otpHash, req.ip || null]
      );

      await sendTeacherResetOtpEmail(user, otp);
      await logActivity(user.id, 'FORGOT_PASSWORD_OTP', `OTP reset password dikirim ke ${user.email}`, req.ip);

      return res.json({
        success: true,
        mode: 'otp',
        message: 'Kode OTP sudah dikirim ke email guru. Masukkan OTP untuk membuat password baru.'
      });
    }

    if (user && Number(user.is_aktif) !== 0 && user.peran === 'siswa') {
      await ensurePasswordResetRequestsTable();

      const [recentRows] = await pool.execute(
        `SELECT id FROM password_reset_requests
         WHERE user_id = ?
           AND status = 'pending'
           AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
         LIMIT 1`,
        [user.id]
      );

      if (recentRows.length === 0) {
        await pool.execute(
          `INSERT INTO password_reset_requests
           (user_id, identifier, peran, id_sekolah, status, ip_address, created_at)
           VALUES (?, ?, ?, ?, 'pending', ?, NOW())`,
          [user.id, identifier, user.peran, user.id_sekolah || null, req.ip || null]
        );

        await logActivity(user.id, 'FORGOT_PASSWORD_REQUEST', `Permintaan reset password untuk ${identifier}`, req.ip);
      }

      return res.json({
        success: true,
        mode: 'admin_request',
        message: 'Permintaan reset password siswa sudah dicatat. Silakan hubungi admin sekolah untuk dibuatkan password baru.'
      });
    }

    return res.json({
      success: true,
      mode: 'unknown',
      message: genericMessage
    });
  } catch (err) {
    console.error('FORGOT PASSWORD ERROR:', err);
    return res.status(500).json({
      success: false,
      message: 'Permintaan reset password belum dapat diproses. Silakan coba lagi.'
    });
  }
});

// ==========================
// RESET PASSWORD GURU DENGAN OTP
// ==========================
router.post('/reset-password-otp', [
  body('identifier').trim().notEmpty().withMessage('Email guru wajib diisi.'),
  body('otp').trim().isLength({ min: 6, max: 6 }).withMessage('OTP harus 6 digit.'),
  body('password_baru').isLength({ min: 6 }).withMessage('Password baru minimal 6 karakter.')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const identifier = String(req.body.identifier || '').trim().toLowerCase();
  const otp = String(req.body.otp || '').trim();
  const passwordBaru = String(req.body.password_baru || '');

  try {
    await ensurePasswordResetOtpsTable();

    const [userRows] = await pool.execute(
      `${AUTH_USER_SELECT}
       WHERE LOWER(u.email) = ?
         AND u.peran = "guru"
       LIMIT 1`,
      [identifier]
    );

    if (userRows.length === 0 || Number(userRows[0].is_aktif) === 0) {
      return res.status(400).json({
        success: false,
        message: 'OTP tidak valid atau sudah kedaluwarsa.'
      });
    }

    const user = userRows[0];
    const [otpRows] = await pool.execute(
      `SELECT id, otp_hash, attempt_count
       FROM password_reset_otps
       WHERE user_id = ?
         AND email = ?
         AND used_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id, identifier]
    );

    if (otpRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'OTP tidak valid atau sudah kedaluwarsa.'
      });
    }

    const otpRow = otpRows[0];

    if (Number(otpRow.attempt_count || 0) >= 5) {
      await pool.execute(
        'UPDATE password_reset_otps SET used_at = NOW() WHERE id = ?',
        [otpRow.id]
      );

      return res.status(400).json({
        success: false,
        message: 'Percobaan OTP terlalu banyak. Silakan minta OTP baru.'
      });
    }

    const otpHash = getOtpHash(user.id, otp);

    if (otpHash !== otpRow.otp_hash) {
      await pool.execute(
        'UPDATE password_reset_otps SET attempt_count = attempt_count + 1 WHERE id = ?',
        [otpRow.id]
      );

      return res.status(400).json({
        success: false,
        message: 'OTP tidak valid atau sudah kedaluwarsa.'
      });
    }

    const hashed = await bcrypt.hash(passwordBaru, 10);

    await pool.execute(
      'UPDATE users SET password = ? WHERE id = ? AND peran = "guru"',
      [hashed, user.id]
    );

    await pool.execute(
      'UPDATE password_reset_otps SET used_at = NOW() WHERE id = ?',
      [otpRow.id]
    );

    await logActivity(user.id, 'RESET_PASSWORD_OTP', 'Password guru direset melalui OTP email', req.ip);

    return res.json({
      success: true,
      message: 'Password berhasil diubah. Silakan login menggunakan password baru.'
    });
  } catch (err) {
    console.error('RESET PASSWORD OTP ERROR:', err);
    return res.status(500).json({
      success: false,
      message: 'Password belum dapat diubah. Silakan coba lagi.'
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
