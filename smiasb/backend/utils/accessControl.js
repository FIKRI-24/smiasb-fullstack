const { pool } = require('../config/database');

const ACCESS_DENIED_MESSAGE = 'Anda tidak memiliki akses ke data ini';

function normalizePeran(peran) {
  return peran === 'admin' ? 'admin_sekolah' : peran;
}

function isSuperAdmin(user) {
  return normalizePeran(user?.peran) === 'super_admin';
}

function isAdminSekolah(user) {
  return normalizePeran(user?.peran) === 'admin_sekolah';
}

function isGuru(user) {
  return normalizePeran(user?.peran) === 'guru';
}

function isSiswa(user) {
  return normalizePeran(user?.peran) === 'siswa';
}

function isAdminRole(peran) {
  return ['admin', 'admin_sekolah', 'super_admin'].includes(normalizePeran(peran));
}

function denyAccess(res) {
  return res.status(403).json({
    success: false,
    message: ACCESS_DENIED_MESSAGE
  });
}

function parseId(value) {
  if (value === undefined || value === null || value === '') return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function sameSekolah(user, idSekolah) {
  return Number(user?.id_sekolah) === Number(idSekolah);
}

function appendSekolahScope(where, params, user, column, requestedSekolahId = null) {
  const targetSekolahId = parseId(requestedSekolahId);

  if (isSuperAdmin(user)) {
    if (targetSekolahId) {
      where.push(`${column} = ?`);
      params.push(targetSekolahId);
    }

    return { ok: true };
  }

  if (targetSekolahId && !sameSekolah(user, targetSekolahId)) {
    return { ok: false };
  }

  if (!user?.id_sekolah) {
    return { ok: false };
  }

  where.push(`${column} = ?`);
  params.push(user.id_sekolah);

  return { ok: true };
}

function resolveTargetSekolahId(user, requestedSekolahId = null) {
  const targetSekolahId = parseId(requestedSekolahId);

  if (isSuperAdmin(user)) {
    return { ok: Boolean(targetSekolahId), id_sekolah: targetSekolahId };
  }

  if (targetSekolahId && !sameSekolah(user, targetSekolahId)) {
    return { ok: false, id_sekolah: null };
  }

  return { ok: Boolean(user?.id_sekolah), id_sekolah: user?.id_sekolah || null };
}

function normalizeKelas(value) {
  return String(value || '').trim().toUpperCase();
}

function isInstrumenOpenForWork(instrumen) {
  const now = new Date();

  if (instrumen?.waktu_mulai && now < new Date(instrumen.waktu_mulai)) {
    return false;
  }

  if (instrumen?.waktu_selesai && now > new Date(instrumen.waktu_selesai)) {
    return false;
  }

  if (
    Number(instrumen?.gunakan_batas_waktu) === 1 &&
    instrumen?.batas_waktu &&
    now > new Date(instrumen.batas_waktu)
  ) {
    return false;
  }

  return true;
}

function siswaKelasMatchesInstrumen(user, instrumen) {
  const siswaKelas = normalizeKelas(user?.id_kelas || user?.kelas);
  const instrumenKelas = normalizeKelas(instrumen?.id_kelas || instrumen?.kelas);
  return Boolean(siswaKelas && instrumenKelas && siswaKelas === instrumenKelas);
}

async function getInstrumenById(instrumenId) {
  const [rows] = await pool.execute(
    'SELECT * FROM instrumen WHERE id = ?',
    [instrumenId]
  );

  return rows[0] || null;
}

async function canAccessInstrumen(user, instrumenId, mode = 'view') {
  const instrumen = await getInstrumenById(instrumenId);

  if (!instrumen) {
    return { ok: false, status: 404, message: 'Instrumen tidak ditemukan.' };
  }
  if (isSuperAdmin(user)) {
    return { ok: true, instrumen };
  }

  if (!sameSekolah(user, instrumen.id_sekolah)) {
    return { ok: false, status: 403, message: ACCESS_DENIED_MESSAGE };
  }

  if (isAdminSekolah(user)) {
    return { ok: true, instrumen };
  }

  if (isGuru(user)) {
    if (Number(instrumen.dibuat_oleh) === Number(user.id)) {
      return { ok: true, instrumen };
    }

    return { ok: false, status: 403, message: ACCESS_DENIED_MESSAGE };
  }

  if (isSiswa(user)) {
    const allowedMode = ['view', 'view_soal', 'status', 'kerjakan', 'submit'].includes(mode);
    if (!allowedMode || instrumen.status !== 'aktif') {
      return { ok: false, status: 403, message: ACCESS_DENIED_MESSAGE };
    }

    if (!siswaKelasMatchesInstrumen(user, instrumen)) {
      return { ok: false, status: 403, message: ACCESS_DENIED_MESSAGE };
    }

    if ((mode === 'kerjakan' || mode === 'submit') && !isInstrumenOpenForWork(instrumen)) {
      return { ok: false, status: 403, message: ACCESS_DENIED_MESSAGE };
    }

    return { ok: true, instrumen };
  }

  return { ok: false, status: 403, message: ACCESS_DENIED_MESSAGE };
}

module.exports = {
  ACCESS_DENIED_MESSAGE,
  normalizePeran,
  isSuperAdmin,
  isAdminSekolah,
  isGuru,
  isSiswa,
  isAdminRole,
  denyAccess,
  parseId,
  sameSekolah,
  appendSekolahScope,
  resolveTargetSekolahId,
  canAccessInstrumen,
  isInstrumenOpenForWork,
  normalizeKelas
};
