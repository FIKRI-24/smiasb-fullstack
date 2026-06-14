const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

function normalizePeran(peran) {
  return peran === 'admin' ? 'admin_sekolah' : peran;
}

function expandAllowedRoles(roles) {
  const expanded = new Set();

  roles.forEach((role) => {
    const normalized = normalizePeran(role);
    expanded.add(normalized);

    if (normalized === 'admin_sekolah') {
      expanded.add('admin');
    }
  });

  return expanded;
}

// Verifikasi token JWT
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token tidak ditemukan. Silakan login.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'SECRETKEY');
    const userId = decoded.id_user || decoded.id;

    const [rows] = await pool.execute(
      `SELECT
        u.id,
        u.nama,
        u.email,
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
       WHERE u.id = ?`,
      [userId]
    );

    if (rows.length === 0 || !rows[0].is_aktif) {
      return res.status(401).json({ success: false, message: 'Akun tidak ditemukan atau tidak aktif.' });
    }

    req.user = {
      ...rows[0],
      id_user: rows[0].id,
      peran_asli: rows[0].peran,
      peran: normalizePeran(rows[0].peran),
      id_sekolah: rows[0].id_sekolah ?? null,
      nama_sekolah: rows[0].nama_sekolah ?? null
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Sesi habis. Silakan login kembali.' });
    }
    return res.status(401).json({ success: false, message: 'Token tidak valid.' });
  }
};

// Cek peran pengguna
const authorize = (...roles) => {
  return (req, res, next) => {
    const allowedRoles = expandAllowedRoles(roles);
    const userRole = req.user.peran;
    const userOriginalRole = req.user.peran_asli;

    const isAllowed = allowedRoles.has(userRole) || allowedRoles.has(userOriginalRole);
    const superAdminCanUseAdminRoute =
      userRole === 'super_admin' &&
      (allowedRoles.has('admin') || allowedRoles.has('admin_sekolah'));

    if (!isAllowed && !superAdminCanUseAdminRoute) {
      return res.status(403).json({
        success: false,
        message: 'Anda tidak memiliki akses ke data ini'
      });
    }
    next();
  };
};

module.exports = { authenticate, authorize, normalizePeran };
