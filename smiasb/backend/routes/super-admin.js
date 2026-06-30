const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const { body, validationResult } = require('express-validator');
const { pool, isPostgres, addParam } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { denyAccess, isSuperAdmin, parseId } = require('../utils/accessControl');

const KKM_DEFAULT = 75;
const nullSafeEq = isPostgres ? 'IS NOT DISTINCT FROM' : '<=>';
const SCHOOL_ORDER_SQL = isPostgres
  ? `CASE s.nama_sekolah WHEN 'SMPS Adabiah Padang' THEN 1 WHEN 'SMPN 12 Padang' THEN 2 WHEN 'MTsN 6 Padang' THEN 3 ELSE 99 END, s.nama_sekolah ASC`
  : `FIELD(s.nama_sekolah, 'SMPS Adabiah Padang', 'SMPN 12 Padang', 'MTsN 6 Padang'), s.nama_sekolah ASC`;
const SCHOOL_ORDER_CASE_SQL = `
  CASE s.nama_sekolah
    WHEN 'SMPS Adabiah Padang' THEN 1
    WHEN 'SMPN 12 Padang' THEN 2
    WHEN 'MTsN 6 Padang' THEN 3
    ELSE 99
  END,
  s.nama_sekolah ASC
`;

function resultRows(result) {
  return result.rows || result[0] || [];
}

function requireSuperAdmin(req, res, next) {
  if (!isSuperAdmin(req.user)) return denyAccess(res);
  next();
}

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;

  res.status(400).json({ success: false, errors: errors.array() });
  return true;
}

function normalizeText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeIdentifier(body) {
  const identifier = normalizeText(body.email || body.username || body.identifier);
  return identifier ? identifier.toLowerCase() : null;
}

function normalizeIsAktif(body, fallback = 1) {
  if (body.is_aktif !== undefined) return Number(body.is_aktif) === 1 || body.is_aktif === true ? 1 : 0;
  if (body.status === 'aktif') return 1;
  if (body.status === 'nonaktif') return 0;
  return fallback;
}

function parseStatusFilter(value) {
  const status = normalizeText(value);
  if (!status || status.toLowerCase() === 'semua') {
    return { ok: true, hasValue: false, isAktif: null };
  }

  const normalized = status.toLowerCase();
  if (['aktif', '1', 'true'].includes(normalized)) {
    return { ok: true, hasValue: true, isAktif: 1 };
  }

  if (['nonaktif', '0', 'false'].includes(normalized)) {
    return { ok: true, hasValue: true, isAktif: 0 };
  }

  return { ok: false, hasValue: false, isAktif: null };
}

function parseInstrumenStatusFilter(value) {
  const status = normalizeText(value);
  if (!status || status.toLowerCase() === 'semua') {
    return { ok: true, hasValue: false, status: null };
  }

  const normalized = status.toLowerCase();
  if (['draft', 'aktif', 'nonaktif'].includes(normalized)) {
    return { ok: true, hasValue: true, status: normalized };
  }

  return { ok: false, hasValue: false, status: null };
}

function parseJenisFilter(value) {
  const jenis = normalizeText(value);
  if (!jenis || jenis.toLowerCase() === 'semua') {
    return { ok: true, hasValue: false, jenis: null };
  }

  const allowed = ['HOTS', 'Literasi', 'Numerasi'];
  const matched = allowed.find(item => item.toLowerCase() === jenis.toLowerCase());
  if (matched) {
    return { ok: true, hasValue: true, jenis: matched };
  }

  return { ok: false, hasValue: false, jenis: null };
}

function toAdminSekolah(row) {
  if (!row) return null;

  return {
    id: row.id,
    id_user: row.id,
    nama: row.nama,
    email: row.email,
    username: row.email,
    peran: 'admin_sekolah',
    id_sekolah: row.id_sekolah,
    nama_sekolah: row.nama_sekolah,
    is_aktif: Number(row.is_aktif) === 1,
    status: Number(row.is_aktif) === 1 ? 'aktif' : 'nonaktif',
    created_at: row.created_at,
    jumlah_guru: Number(row.jumlah_guru || 0),
    jumlah_siswa: Number(row.jumlah_siswa || 0)
  };
}

function toGuru(row) {
  if (!row) return null;

  return {
    id: row.id,
    id_user: row.id,
    nama: row.nama,
    email: row.email,
    username: row.email,
    peran: 'guru',
    id_sekolah: row.id_sekolah,
    nama_sekolah: row.nama_sekolah || 'Belum terhubung ke sekolah',
    mata_pelajaran: row.mata_pelajaran,
    nip: row.nip,
    is_aktif: Number(row.is_aktif) === 1,
    status: Number(row.is_aktif) === 1 ? 'aktif' : 'nonaktif',
    created_at: row.created_at,
    jumlah_instrumen: Number(row.jumlah_instrumen || 0),
    jumlah_instrumen_aktif: Number(row.jumlah_instrumen_aktif || 0),
    rata_rata_nilai_instrumen: row.total_pengerjaan > 0 ? Number(row.rata_rata_nilai_instrumen || 0) : null,
    total_pengerjaan: Number(row.total_pengerjaan || 0)
  };
}

function toSiswa(row) {
  if (!row) return null;

  const jumlahInstrumen = Number(row.jumlah_instrumen_dikerjakan || 0);

  return {
    id: row.id,
    id_user: row.id,
    nama: row.nama,
    email: row.email,
    username: row.email,
    nis: row.nis,
    kelas: row.kelas,
    id_sekolah: row.id_sekolah,
    nama_sekolah: row.nama_sekolah || 'Belum terhubung ke sekolah',
    is_aktif: Number(row.is_aktif) === 1,
    status: Number(row.is_aktif) === 1 ? 'aktif' : 'nonaktif',
    created_at: row.created_at,
    jumlah_instrumen_dikerjakan: jumlahInstrumen,
    rata_rata_nilai: jumlahInstrumen > 0 ? Number(row.rata_rata_nilai || 0) : null,
    nilai_tertinggi: jumlahInstrumen > 0 ? Number(row.nilai_tertinggi || 0) : null,
    nilai_terendah: jumlahInstrumen > 0 ? Number(row.nilai_terendah || 0) : null,
    terakhir_mengerjakan: row.terakhir_mengerjakan || null
  };
}

function toRiwayatSiswa(row) {
  return {
    id: row.id,
    instrumen_id: row.instrumen_id,
    instrumen: row.judul,
    judul: row.judul,
    jenis: row.jenis,
    kelas: row.kelas,
    nilai: row.nilai !== null && row.nilai !== undefined ? Number(row.nilai) : null,
    total_benar: Number(row.total_benar || 0),
    total_soal: Number(row.total_soal || 0),
    tanggal_mengerjakan: row.waktu_selesai || row.created_at,
    waktu_selesai: row.waktu_selesai,
    created_at: row.created_at
  };
}

function toInstrumen(row) {
  if (!row) return null;

  const jumlahPengerjaan = Number(row.jumlah_pengerjaan || 0);

  return {
    id: row.id,
    id_instrumen: row.id,
    judul: row.judul,
    jenis: row.jenis,
    mata_pelajaran: row.mata_pelajaran,
    kelas: row.kelas,
    jumlah_soal: Number(row.jumlah_soal || 0),
    status: row.status,
    batas_waktu: row.batas_waktu || null,
    gunakan_batas_waktu: Number(row.gunakan_batas_waktu || 0),
    dibuat_oleh: row.dibuat_oleh,
    id_guru: row.dibuat_oleh,
    nama_guru: row.nama_guru || 'Guru tidak ditemukan',
    id_sekolah: row.id_sekolah,
    nama_sekolah: row.nama_sekolah || 'Belum terhubung ke sekolah',
    created_at: row.created_at,
    jumlah_pengerjaan: jumlahPengerjaan,
    rata_rata_nilai: jumlahPengerjaan > 0 ? Number(row.rata_rata_nilai || 0) : null,
    nilai_tertinggi: jumlahPengerjaan > 0 ? Number(row.nilai_tertinggi || 0) : null,
    nilai_terendah: jumlahPengerjaan > 0 ? Number(row.nilai_terendah || 0) : null,
    ketuntasan: jumlahPengerjaan > 0 ? Number(row.ketuntasan || 0) : null,
    jumlah_siswa_kelas: Number(row.jumlah_siswa_kelas || 0),
    sudah_mengerjakan: Number(row.sudah_mengerjakan || 0),
    belum_mengerjakan: Number(row.belum_mengerjakan || 0)
  };
}

function toHasilInstrumen(row) {
  return {
    id: row.id,
    siswa_id: row.siswa_id,
    nama_siswa: row.nama_siswa,
    email: row.email,
    nis: row.nis,
    kelas: row.kelas,
    nilai: row.nilai !== null && row.nilai !== undefined ? Number(row.nilai) : null,
    total_benar: Number(row.total_benar || 0),
    total_soal: Number(row.total_soal || 0),
    waktu_selesai: row.waktu_selesai || row.created_at,
    created_at: row.created_at
  };
}

function toMonitoring(row) {
  if (!row) return null;

  const totalPengerjaan = Number(row.total_pengerjaan || row.jumlah_pengerjaan || 0);

  return {
    id: row.id,
    id_instrumen: row.id,
    judul: row.judul,
    jenis: row.jenis,
    mata_pelajaran: row.mata_pelajaran,
    kelas: row.kelas,
    status: row.status,
    id_sekolah: row.id_sekolah,
    nama_sekolah: row.nama_sekolah || 'Belum terhubung ke sekolah',
    dibuat_oleh: row.dibuat_oleh,
    id_guru: row.dibuat_oleh,
    nama_guru: row.nama_guru || 'Guru tidak ditemukan',
    jumlah_soal: Number(row.jumlah_soal || 0),
    jumlah_siswa_kelas: Number(row.jumlah_siswa_kelas || 0),
    sudah_mengerjakan: Number(row.sudah_mengerjakan || 0),
    belum_mengerjakan: Number(row.belum_mengerjakan || 0),
    total_pengerjaan: totalPengerjaan,
    jumlah_pengerjaan: totalPengerjaan,
    rata_rata_nilai: totalPengerjaan > 0 ? Number(row.rata_rata_nilai || 0) : null,
    nilai_tertinggi: totalPengerjaan > 0 ? Number(row.nilai_tertinggi || 0) : null,
    nilai_terendah: totalPengerjaan > 0 ? Number(row.nilai_terendah || 0) : null,
    ketuntasan: totalPengerjaan > 0 ? Number(row.ketuntasan || 0) : null,
    terakhir_dikerjakan: row.terakhir_dikerjakan || null,
    created_at: row.created_at
  };
}

async function getActiveSekolah(idSekolah) {
  const [rows] = await pool.execute(
    'SELECT id, nama_sekolah, status FROM sekolah WHERE id = ? AND status = "aktif"',
    [idSekolah]
  );

  return rows[0] || null;
}

async function getAdminSekolahById(id) {
  const [rows] = await pool.execute(
    `SELECT
       u.id,
       u.nama,
       u.email,
       u.peran,
       u.id_sekolah,
       u.is_aktif,
       u.created_at,
       s.nama_sekolah,
       COALESCE((SELECT COUNT(*) FROM users guru WHERE guru.id_sekolah = u.id_sekolah AND guru.peran = "guru" AND guru.is_aktif = 1), 0) as jumlah_guru,
       COALESCE((SELECT COUNT(*) FROM users siswa WHERE siswa.id_sekolah = u.id_sekolah AND siswa.peran = "siswa" AND siswa.is_aktif = 1), 0) as jumlah_siswa
     FROM users u
     LEFT JOIN sekolah s ON s.id = u.id_sekolah
     WHERE u.id = ? AND u.peran IN ("admin", "admin_sekolah")`,
    [id]
  );

  return rows[0] || null;
}

async function getGuruById(id) {
  const [rows] = await pool.execute(
    `SELECT
       u.id,
       u.nama,
       u.email,
       u.peran,
       u.id_sekolah,
       u.mata_pelajaran,
       u.nip,
       u.is_aktif,
       u.created_at,
       s.nama_sekolah,
       COALESCE((SELECT COUNT(*) FROM instrumen i WHERE i.dibuat_oleh = u.id), 0) as jumlah_instrumen,
       COALESCE((SELECT COUNT(*) FROM instrumen i WHERE i.dibuat_oleh = u.id AND i.status = "aktif"), 0) as jumlah_instrumen_aktif,
       COALESCE((SELECT COUNT(*) FROM hasil_siswa hs JOIN instrumen i ON i.id = hs.instrumen_id WHERE i.dibuat_oleh = u.id), 0) as total_pengerjaan,
       COALESCE((SELECT ROUND(AVG(hs.nilai), 1) FROM hasil_siswa hs JOIN instrumen i ON i.id = hs.instrumen_id WHERE i.dibuat_oleh = u.id), 0) as rata_rata_nilai_instrumen
     FROM users u
     LEFT JOIN sekolah s ON s.id = u.id_sekolah
     WHERE u.id = ? AND u.peran = "guru"`,
    [id]
  );

  return rows[0] || null;
}

async function getInstrumenTerbaruByGuru(idGuru) {
  const [rows] = await pool.execute(
    `SELECT
       i.id,
       i.judul,
       i.jenis,
       i.kelas,
       i.status,
       i.created_at,
       COUNT(hs.id) as total_pengerjaan,
       COALESCE(ROUND(AVG(hs.nilai), 1), 0) as rata_rata_nilai
     FROM instrumen i
     LEFT JOIN hasil_siswa hs ON hs.instrumen_id = i.id
     WHERE i.dibuat_oleh = ?
     GROUP BY i.id, i.judul, i.jenis, i.kelas, i.status, i.created_at
     ORDER BY i.created_at DESC
     LIMIT 8`,
    [idGuru]
  );

  return rows.map(item => ({
    ...item,
    total_pengerjaan: Number(item.total_pengerjaan || 0),
    rata_rata_nilai: Number(item.total_pengerjaan || 0) > 0 ? Number(item.rata_rata_nilai || 0) : null
  }));
}

async function identifierExists(identifier, exceptId = null) {
  const where = ['LOWER(email) = ?'];
  const params = [identifier.toLowerCase()];

  if (exceptId) {
    where.push('id <> ?');
    params.push(exceptId);
  }

  const [rows] = await pool.execute(
    `SELECT id FROM users WHERE ${where.join(' AND ')} LIMIT 1`,
    params
  );

  return rows.length > 0;
}

async function getSiswaById(id) {
  const [rows] = await pool.execute(
    `SELECT
       u.id,
       u.nama,
       u.email,
       u.nis,
       u.kelas,
       u.id_sekolah,
       u.is_aktif,
       u.created_at,
       s.nama_sekolah,
       COUNT(hs.id) as jumlah_instrumen_dikerjakan,
       ROUND(AVG(hs.nilai), 1) as rata_rata_nilai,
       MAX(hs.nilai) as nilai_tertinggi,
       MIN(hs.nilai) as nilai_terendah,
       MAX(COALESCE(hs.waktu_selesai, hs.created_at)) as terakhir_mengerjakan
     FROM users u
     LEFT JOIN sekolah s ON s.id = u.id_sekolah
     LEFT JOIN hasil_siswa hs ON hs.siswa_id = u.id AND hs.id_sekolah <=> u.id_sekolah
     WHERE u.id = ? AND u.peran = "siswa"
     GROUP BY u.id, u.nama, u.email, u.nis, u.kelas, u.id_sekolah, u.is_aktif, u.created_at, s.nama_sekolah`,
    [id]
  );

  return rows[0] || null;
}

async function getRiwayatPengerjaanBySiswa(idSiswa, idSekolah) {
  const [rows] = await pool.execute(
    `SELECT
       hs.id,
       hs.instrumen_id,
       hs.nilai,
       hs.total_benar,
       hs.total_soal,
       hs.waktu_selesai,
       hs.created_at,
       i.judul,
       i.jenis,
       i.kelas
     FROM hasil_siswa hs
     JOIN instrumen i ON i.id = hs.instrumen_id
     WHERE hs.siswa_id = ? AND hs.id_sekolah <=> ?
     ORDER BY COALESCE(hs.waktu_selesai, hs.created_at) DESC
     LIMIT 50`,
    [idSiswa, idSekolah]
  );

  return rows.map(toRiwayatSiswa);
}

async function getInstrumenByIdForSuperAdmin(id) {
  const [rows] = await pool.execute(
    `SELECT
       i.id,
       i.judul,
       i.jenis,
       i.mata_pelajaran,
       i.kelas,
       i.jumlah_soal,
       i.status,
       i.batas_waktu,
       i.gunakan_batas_waktu,
       i.dibuat_oleh,
       u.nama as nama_guru,
       i.id_sekolah,
       s.nama_sekolah,
       i.created_at,
       COUNT(hs.id) as jumlah_pengerjaan,
       ROUND(AVG(hs.nilai), 1) as rata_rata_nilai,
       MAX(hs.nilai) as nilai_tertinggi,
       MIN(hs.nilai) as nilai_terendah,
       ROUND((SUM(CASE WHEN hs.nilai >= 75 THEN 1 ELSE 0 END) / NULLIF(COUNT(hs.id), 0)) * 100, 1) as ketuntasan,
       COALESCE((
         SELECT COUNT(*)
         FROM users siswa
         WHERE siswa.peran = "siswa"
           AND siswa.is_aktif = 1
           AND siswa.id_sekolah <=> i.id_sekolah
           AND siswa.kelas = i.kelas
       ), 0) as jumlah_siswa_kelas,
       COUNT(hs.id) as sudah_mengerjakan,
       GREATEST(
         COALESCE((
           SELECT COUNT(*)
           FROM users siswa
           WHERE siswa.peran = "siswa"
             AND siswa.is_aktif = 1
             AND siswa.id_sekolah <=> i.id_sekolah
             AND siswa.kelas = i.kelas
         ), 0) - COUNT(DISTINCT hs.siswa_id),
         0
       ) as belum_mengerjakan
     FROM instrumen i
     LEFT JOIN sekolah s ON s.id = i.id_sekolah
     LEFT JOIN users u ON u.id = i.dibuat_oleh
     LEFT JOIN hasil_siswa hs ON hs.instrumen_id = i.id AND hs.id_sekolah <=> i.id_sekolah
     WHERE i.id = ?
     GROUP BY
       i.id, i.judul, i.jenis, i.mata_pelajaran, i.kelas, i.jumlah_soal, i.status,
       i.batas_waktu, i.gunakan_batas_waktu, i.dibuat_oleh, u.nama,
       i.id_sekolah, s.nama_sekolah, i.created_at`,
    [id]
  );

  return rows[0] || null;
}

async function getHasilRingkasByInstrumen(idInstrumen, idSekolah) {
  const [rows] = await pool.execute(
    `SELECT
       hs.id,
       hs.siswa_id,
       u.nama as nama_siswa,
       u.email,
       u.nis,
       u.kelas,
       hs.nilai,
       hs.total_benar,
       hs.total_soal,
       hs.waktu_selesai,
       hs.created_at
     FROM hasil_siswa hs
     LEFT JOIN users u ON u.id = hs.siswa_id
     WHERE hs.instrumen_id = ? AND hs.id_sekolah <=> ?
     ORDER BY hs.nilai DESC, COALESCE(hs.waktu_selesai, hs.created_at) ASC
     LIMIT 100`,
    [idInstrumen, idSekolah]
  );

  return rows.map(toHasilInstrumen);
}

function buildWhereSql(where) {
  return where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
}

function ketuntasanSql(alias = 'hs') {
  return `ROUND((SUM(CASE WHEN ${alias}.nilai >= ${KKM_DEFAULT} THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(${alias}.id), 0)), 1)`;
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableMetric(value, total) {
  if (numberValue(total) <= 0 || value === null || value === undefined) return null;
  return Number(value);
}

function parseDateOnly(value) {
  const text = normalizeText(value);
  if (!text) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { ok: false, value: null };

  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { ok: false, value: null };

  return { ok: true, value: text };
}

function firstQueryValue(query, keys) {
  for (const key of keys) {
    if (query[key] !== undefined && query[key] !== null && query[key] !== '') {
      return query[key];
    }
  }

  return null;
}

function parseLaporanFilters(query) {
  const rawSekolahId = query.id_sekolah;
  const idSekolah = parseId(rawSekolahId);
  const jenisFilter = parseJenisFilter(query.jenis);
  const statusFilter = parseInstrumenStatusFilter(query.status);
  const kelas = normalizeText(query.kelas);
  const guru = normalizeText(query.guru);
  const guruId = parseId(guru);
  const search = normalizeText(query.search);
  const singleDate = normalizeText(query.tanggal);
  const startRaw = firstQueryValue(query, ['tanggal_mulai', 'tanggal_dari', 'start_date', 'date_from', 'dari']) || singleDate;
  const endRaw = firstQueryValue(query, ['tanggal_selesai', 'tanggal_sampai', 'end_date', 'date_to', 'sampai']) || singleDate;
  const startDate = parseDateOnly(startRaw);
  const endDate = parseDateOnly(endRaw);

  if (rawSekolahId !== undefined && rawSekolahId !== null && rawSekolahId !== '' && !idSekolah) {
    return { ok: false, message: 'ID sekolah tidak valid.' };
  }

  if (!jenisFilter.ok) {
    return { ok: false, message: 'Jenis instrumen tidak valid.' };
  }

  if (!statusFilter.ok) {
    return { ok: false, message: 'Status instrumen tidak valid.' };
  }

  if (!startDate.ok || !endDate.ok) {
    return { ok: false, message: 'Format tanggal tidak valid. Gunakan YYYY-MM-DD.' };
  }

  if (startDate.value && endDate.value && startDate.value > endDate.value) {
    return { ok: false, message: 'Tanggal mulai tidak boleh melewati tanggal selesai.' };
  }

  return {
    ok: true,
    filters: {
      idSekolah,
      jenis: jenisFilter.hasValue ? jenisFilter.jenis : null,
      status: statusFilter.hasValue ? statusFilter.status : null,
      kelas,
      guru,
      guruId,
      search,
      tanggalMulai: startDate.value,
      tanggalSelesai: endDate.value
    }
  };
}

function addLaporanInstrumentFilters(filters, where, params, aliases = {}) {
  const instrumenAlias = aliases.instrumen || 'i';
  const sekolahAlias = aliases.sekolah || 's';
  const guruAlias = aliases.guru || 'u';

  if (filters.idSekolah) {
    where.push(`${instrumenAlias}.id_sekolah = ${addParam(params, filters.idSekolah)}`);
  }

  if (filters.jenis) {
    where.push(`${instrumenAlias}.jenis = ${addParam(params, filters.jenis)}`);
  }

  if (filters.status) {
    where.push(`${instrumenAlias}.status = ${addParam(params, filters.status)}`);
  }

  if (filters.kelas) {
    where.push(`${instrumenAlias}.kelas = ${addParam(params, filters.kelas)}`);
  }

  if (filters.guru) {
    if (filters.guruId) {
      where.push(`${instrumenAlias}.dibuat_oleh = ${addParam(params, filters.guruId)}`);
    } else {
      where.push(`${guruAlias}.nama LIKE ${addParam(params, `%${filters.guru}%`)}`);
    }
  }

  if (filters.search) {
    const p1 = addParam(params, `%${filters.search}%`);
    const p2 = addParam(params, `%${filters.search}%`);
    const p3 = addParam(params, `%${filters.search}%`);
    const p4 = addParam(params, `%${filters.search}%`);
    const p5 = addParam(params, `%${filters.search}%`);
    where.push(`(${instrumenAlias}.judul LIKE ${p1} OR ${sekolahAlias}.nama_sekolah LIKE ${p2} OR ${guruAlias}.nama LIKE ${p3} OR ${instrumenAlias}.kelas LIKE ${p4} OR ${instrumenAlias}.mata_pelajaran LIKE ${p5})`);
  }
}

function getLaporanDateParts(filters, alias = 'hs', params = []) {
  const where = [];

  if (filters.tanggalMulai) {
    where.push(`COALESCE(${alias}.waktu_selesai, ${alias}.created_at) >= ${addParam(params, `${filters.tanggalMulai} 00:00:00`)}`);
  }

  if (filters.tanggalSelesai) {
    where.push(`COALESCE(${alias}.waktu_selesai, ${alias}.created_at) <= ${addParam(params, `${filters.tanggalSelesai} 23:59:59`)}`);
  }

  return {
    where,
    params,
    joinSql: where.length > 0 ? ` AND ${where.join(' AND ')}` : ''
  };
}

function addLaporanDateWhere(filters, where, params, alias = 'hs') {
  const dateParts = getLaporanDateParts(filters, alias, params);
  where.push(...dateParts.where);
}

function getTipeSoalCategory(value) {
  if (value === null || value === undefined) return 'Belum ada data';
  const percent = Number(value);
  if (percent >= 80) return 'Dikuasai / Mudah';
  if (percent >= 60) return 'Cukup / Sedang';
  return 'Sulit / Perlu pembahasan ulang';
}

function toRekapSekolah(row) {
  const totalPengerjaan = numberValue(row.total_pengerjaan);

  return {
    id_sekolah: row.id,
    nama_sekolah: row.nama_sekolah,
    jumlah_guru: numberValue(row.jumlah_guru),
    jumlah_siswa: numberValue(row.jumlah_siswa),
    jumlah_instrumen: numberValue(row.jumlah_instrumen),
    instrumen_aktif: numberValue(row.instrumen_aktif),
    total_pengerjaan: totalPengerjaan,
    rata_rata_nilai: nullableMetric(row.rata_rata_nilai, totalPengerjaan),
    ketuntasan: nullableMetric(row.ketuntasan, totalPengerjaan),
    siswa_tuntas: numberValue(row.siswa_tuntas),
    siswa_belum_tuntas: numberValue(row.siswa_belum_tuntas)
  };
}

function toRekapInstrumen(row) {
  const totalPengerjaan = numberValue(row.total_pengerjaan);

  return {
    id_instrumen: row.id,
    id_sekolah: row.id_sekolah,
    nama_sekolah: row.nama_sekolah || 'Belum terhubung ke sekolah',
    judul: row.judul,
    jenis: row.jenis,
    mata_pelajaran: row.mata_pelajaran,
    kelas: row.kelas,
    id_guru: row.dibuat_oleh,
    nama_guru: row.nama_guru || 'Guru tidak ditemukan',
    status: row.status,
    jumlah_soal: numberValue(row.jumlah_soal),
    total_pengerjaan: totalPengerjaan,
    rata_rata_nilai: nullableMetric(row.rata_rata_nilai, totalPengerjaan),
    ketuntasan: nullableMetric(row.ketuntasan, totalPengerjaan),
    nilai_tertinggi: nullableMetric(row.nilai_tertinggi, totalPengerjaan),
    nilai_terendah: nullableMetric(row.nilai_terendah, totalPengerjaan)
  };
}

function toRekapSiswa(row) {
  const jumlah = numberValue(row.jumlah_instrumen_dikerjakan);
  const rataRata = nullableMetric(row.rata_rata_nilai, jumlah);

  return {
    id_siswa: row.id_siswa,
    id_sekolah: row.id_sekolah,
    nama_sekolah: row.nama_sekolah || 'Belum terhubung ke sekolah',
    kelas: row.kelas || 'Belum diisi',
    nama_siswa: row.nama_siswa,
    jumlah_instrumen_dikerjakan: jumlah,
    rata_rata_nilai: rataRata,
    nilai_tertinggi: nullableMetric(row.nilai_tertinggi, jumlah),
    nilai_terendah: nullableMetric(row.nilai_terendah, jumlah),
    status_ketuntasan: jumlah > 0 && Number(rataRata || 0) >= KKM_DEFAULT ? 'Tuntas' : 'Belum tuntas'
  };
}

function toAnalisisTipe(row) {
  const rata = row.rata_rata_persentase_benar === null || row.rata_rata_persentase_benar === undefined
    ? null
    : Number(row.rata_rata_persentase_benar);

  return {
    id_sekolah: row.id_sekolah,
    nama_sekolah: row.nama_sekolah || 'Belum terhubung ke sekolah',
    tipe_soal: row.tipe_soal || 'Tidak diketahui',
    total_soal: numberValue(row.total_soal),
    total_jawaban: numberValue(row.total_jawaban),
    rata_rata_persentase_benar: rata,
    kategori: getTipeSoalCategory(rata)
  };
}

async function queryLaporanSummary(filters) {
  const where = [];
  const params = [];
  const dateParts = getLaporanDateParts(filters, 'hs', params);

  addLaporanInstrumentFilters(filters, where, params, { instrumen: 'i', sekolah: 's', guru: 'guru' });

  const rows = resultRows(await pool.execute(
    `SELECT
       COUNT(DISTINCT i.id) as total_instrumen,
       COUNT(DISTINCT CASE WHEN i.status = 'aktif' THEN i.id END) as total_instrumen_aktif,
       COUNT(hs.id) as total_pengerjaan,
       ROUND(AVG(hs.nilai), 1) as rata_rata_nilai,
       ${ketuntasanSql('hs')} as ketuntasan,
       SUM(CASE WHEN hs.nilai >= ${KKM_DEFAULT} THEN 1 ELSE 0 END) as siswa_tuntas,
       SUM(CASE WHEN hs.id IS NOT NULL AND hs.nilai < ${KKM_DEFAULT} THEN 1 ELSE 0 END) as siswa_belum_tuntas
     FROM instrumen i
     LEFT JOIN sekolah s ON s.id = i.id_sekolah
     LEFT JOIN users guru ON guru.id = i.dibuat_oleh
     LEFT JOIN hasil_siswa hs
       ON hs.instrumen_id = i.id
      AND hs.id_sekolah ${nullSafeEq} i.id_sekolah
      ${dateParts.joinSql}
     ${buildWhereSql(where)}`,
    params
  ));

  return rows[0] || {};
}

async function queryRekapSekolah(filters) {
  const where = [];
  const params = [];
  const siswaKelasSql = filters.kelas ? ` AND siswa.kelas = ${addParam(params, filters.kelas)}` : '';
  const dateParts = getLaporanDateParts(filters, 'hs', params);

  addLaporanInstrumentFilters(filters, where, params, { instrumen: 'i', sekolah: 's', guru: 'guru' });

  const rows = resultRows(await pool.execute(
    `SELECT
       s.id,
       s.nama_sekolah,
       COALESCE((SELECT COUNT(*) FROM users guru_count WHERE guru_count.id_sekolah = s.id AND guru_count.peran = 'guru' AND guru_count.is_aktif = TRUE), 0) as jumlah_guru,
       COALESCE((SELECT COUNT(*) FROM users siswa WHERE siswa.id_sekolah = s.id AND siswa.peran = 'siswa' AND siswa.is_aktif = TRUE${siswaKelasSql}), 0) as jumlah_siswa,
       COUNT(DISTINCT i.id) as jumlah_instrumen,
       COUNT(DISTINCT CASE WHEN i.status = 'aktif' THEN i.id END) as instrumen_aktif,
       COUNT(hs.id) as total_pengerjaan,
       ROUND(AVG(hs.nilai), 1) as rata_rata_nilai,
       ${ketuntasanSql('hs')} as ketuntasan,
       SUM(CASE WHEN hs.nilai >= ${KKM_DEFAULT} THEN 1 ELSE 0 END) as siswa_tuntas,
       SUM(CASE WHEN hs.id IS NOT NULL AND hs.nilai < ${KKM_DEFAULT} THEN 1 ELSE 0 END) as siswa_belum_tuntas
     FROM sekolah s
     LEFT JOIN instrumen i ON i.id_sekolah = s.id
     LEFT JOIN users guru ON guru.id = i.dibuat_oleh
     LEFT JOIN hasil_siswa hs
       ON hs.instrumen_id = i.id
      AND hs.id_sekolah ${nullSafeEq} i.id_sekolah
      ${dateParts.joinSql}
     ${buildWhereSql(where)}
     GROUP BY s.id, s.nama_sekolah
     ORDER BY ${SCHOOL_ORDER_SQL}`,
    params
  ));

  return rows.map(toRekapSekolah);
}

async function queryRekapInstrumen(filters) {
  const where = [];
  const params = [];
  const dateParts = getLaporanDateParts(filters, 'hs', params);

  addLaporanInstrumentFilters(filters, where, params, { instrumen: 'i', sekolah: 's', guru: 'guru' });

  const rows = resultRows(await pool.execute(
    `SELECT
       i.id,
       i.id_sekolah,
       s.nama_sekolah,
       i.judul,
       i.jenis,
       i.mata_pelajaran,
       i.kelas,
       i.dibuat_oleh,
       guru.nama as nama_guru,
       i.status,
       i.jumlah_soal,
       COUNT(hs.id) as total_pengerjaan,
       ROUND(AVG(hs.nilai), 1) as rata_rata_nilai,
       ${ketuntasanSql('hs')} as ketuntasan,
       MAX(hs.nilai) as nilai_tertinggi,
       MIN(hs.nilai) as nilai_terendah
     FROM instrumen i
     LEFT JOIN sekolah s ON s.id = i.id_sekolah
     LEFT JOIN users guru ON guru.id = i.dibuat_oleh
     LEFT JOIN hasil_siswa hs
       ON hs.instrumen_id = i.id
      AND hs.id_sekolah ${nullSafeEq} i.id_sekolah
      ${dateParts.joinSql}
     ${buildWhereSql(where)}
     GROUP BY
       i.id, i.id_sekolah, s.nama_sekolah, i.judul, i.jenis, i.mata_pelajaran,
       i.kelas, i.dibuat_oleh, guru.nama, i.status, i.jumlah_soal, i.created_at
     ORDER BY
       CASE WHEN i.id_sekolah IS NULL THEN 1 ELSE 0 END,
       ${SCHOOL_ORDER_CASE_SQL},
       i.created_at DESC`,
    params
  ));

  return rows.map(toRekapInstrumen);
}

async function queryRekapSiswa(filters) {
  const where = [];
  const params = [];

  addLaporanInstrumentFilters(filters, where, params, { instrumen: 'i', sekolah: 's', guru: 'guru' });
  addLaporanDateWhere(filters, where, params, 'hs');

  const rows = resultRows(await pool.execute(
    `SELECT
       siswa.id as id_siswa,
       siswa.id_sekolah,
       s.nama_sekolah,
       siswa.kelas,
       siswa.nama as nama_siswa,
       COUNT(DISTINCT hs.instrumen_id) as jumlah_instrumen_dikerjakan,
       ROUND(AVG(hs.nilai), 1) as rata_rata_nilai,
       MAX(hs.nilai) as nilai_tertinggi,
       MIN(hs.nilai) as nilai_terendah
     FROM hasil_siswa hs
     JOIN users siswa
       ON siswa.id = hs.siswa_id
      AND siswa.id_sekolah ${nullSafeEq} hs.id_sekolah
     JOIN instrumen i
       ON i.id = hs.instrumen_id
      AND i.id_sekolah ${nullSafeEq} hs.id_sekolah
     LEFT JOIN sekolah s ON s.id = hs.id_sekolah
     LEFT JOIN users guru ON guru.id = i.dibuat_oleh
     ${buildWhereSql(where)}
     GROUP BY siswa.id, siswa.id_sekolah, s.nama_sekolah, siswa.kelas, siswa.nama
     ORDER BY
       CASE WHEN siswa.id_sekolah IS NULL THEN 1 ELSE 0 END,
       ${SCHOOL_ORDER_CASE_SQL},
       CASE WHEN siswa.kelas IS NULL OR siswa.kelas = '' THEN 1 ELSE 0 END,
       siswa.kelas ASC,
       siswa.nama ASC
     LIMIT 500`,
    params
  ));

  return rows.map(toRekapSiswa);
}

async function queryAnalisisTipe(filters) {
  const where = [];
  const params = [];
  const dateParts = getLaporanDateParts(filters, 'hs', params);
  const benarSql = isPostgres ? 'TRUE' : '1';
  const rataBenarSql = `ROUND(AVG(CASE WHEN js.id IS NULL THEN NULL WHEN js.is_benar = ${benarSql} THEN 100 ELSE 0 END), 1)`;

  addLaporanInstrumentFilters(filters, where, params, { instrumen: 'i', sekolah: 's', guru: 'guru' });

  const rows = resultRows(await pool.execute(
    `SELECT
       s.id as id_sekolah,
       s.nama_sekolah,
       soal.tipe_soal,
       COUNT(DISTINCT soal.id) as total_soal,
       COUNT(js.id) as total_jawaban,
       ${rataBenarSql} as rata_rata_persentase_benar
     FROM soal soal
     JOIN instrumen i ON i.id = soal.instrumen_id
     LEFT JOIN sekolah s ON s.id = i.id_sekolah
     LEFT JOIN users guru ON guru.id = i.dibuat_oleh
     JOIN jawaban_siswa js
       ON js.soal_id = soal.id
      AND js.instrumen_id = i.id
      AND js.id_sekolah ${nullSafeEq} i.id_sekolah
     JOIN hasil_siswa hs
       ON hs.instrumen_id = i.id
      AND hs.siswa_id = js.siswa_id
      AND hs.id_sekolah ${nullSafeEq} i.id_sekolah
      ${dateParts.joinSql}
     ${buildWhereSql(where)}
     GROUP BY s.id, s.nama_sekolah, soal.tipe_soal
     ORDER BY
       CASE WHEN s.id IS NULL THEN 1 ELSE 0 END,
       ${SCHOOL_ORDER_CASE_SQL},
       ${rataBenarSql} ASC,
       soal.tipe_soal ASC`,
    params
  ));

  return rows.map(toAnalisisTipe);
}

async function queryKelasKritis(filters) {
  const where = [];
  const params = [];
  const dateParts = getLaporanDateParts(filters, 'hs', params);

  addLaporanInstrumentFilters(filters, where, params, { instrumen: 'i', sekolah: 's', guru: 'guru' });

  const rows = resultRows(await pool.execute(
    `SELECT
       s.id as id_sekolah,
       s.nama_sekolah,
       i.kelas,
       COUNT(hs.id) as total_pengerjaan,
       ROUND(AVG(hs.nilai), 1) as rata_rata_nilai,
       ${ketuntasanSql('hs')} as ketuntasan
     FROM instrumen i
     LEFT JOIN sekolah s ON s.id = i.id_sekolah
     LEFT JOIN users guru ON guru.id = i.dibuat_oleh
     LEFT JOIN hasil_siswa hs
       ON hs.instrumen_id = i.id
      AND hs.id_sekolah ${nullSafeEq} i.id_sekolah
      ${dateParts.joinSql}
     ${buildWhereSql(where)}
     GROUP BY s.id, s.nama_sekolah, i.kelas
     HAVING COUNT(hs.id) > 0
     ORDER BY ${ketuntasanSql('hs')} ASC, ROUND(AVG(hs.nilai), 1) ASC
     LIMIT 5`,
    params
  ));

  return rows.map(row => ({
    id_sekolah: row.id_sekolah,
    nama_sekolah: row.nama_sekolah || 'Belum terhubung ke sekolah',
    kelas: row.kelas || 'Belum diisi',
    total_pengerjaan: numberValue(row.total_pengerjaan),
    rata_rata_nilai: nullableMetric(row.rata_rata_nilai, row.total_pengerjaan),
    ketuntasan: nullableMetric(row.ketuntasan, row.total_pengerjaan)
  }));
}

function buildLaporanRekomendasi(data, kelasKritis) {
  const rekomendasi = [];

  if (data.summary.total_pengerjaan === 0) {
    return {
      items: ['Belum ada data pengerjaan siswa pada filter ini.'],
      sekolah_ketuntasan_terendah: null,
      instrumen_rata_rata_terendah: null,
      tipe_soal_tersulit: null,
      kelas_perlu_perhatian: null,
      siswa_belum_tuntas: []
    };
  }

  const sekolahTerendah = [...data.rekap_sekolah]
    .filter(item => item.total_pengerjaan > 0 && item.ketuntasan !== null)
    .sort((a, b) => a.ketuntasan - b.ketuntasan || a.rata_rata_nilai - b.rata_rata_nilai)[0] || null;

  const instrumenTerendah = [...data.rekap_instrumen]
    .filter(item => item.total_pengerjaan > 0 && item.rata_rata_nilai !== null)
    .sort((a, b) => a.rata_rata_nilai - b.rata_rata_nilai || a.ketuntasan - b.ketuntasan)[0] || null;

  const tipeTersulit = [...data.analisis_tipe]
    .filter(item => item.total_jawaban > 0 && item.rata_rata_persentase_benar !== null)
    .sort((a, b) => a.rata_rata_persentase_benar - b.rata_rata_persentase_benar)[0] || null;

  const kelasPerluPerhatian = kelasKritis[0] || null;
  const siswaBelumTuntas = data.rekap_siswa
    .filter(item => item.status_ketuntasan === 'Belum tuntas')
    .slice(0, 10);

  if (sekolahTerendah) {
    rekomendasi.push(`${sekolahTerendah.nama_sekolah} memiliki ketuntasan paling rendah pada filter saat ini.`);
  }

  if (instrumenTerendah) {
    rekomendasi.push(`Instrumen "${instrumenTerendah.judul}" memiliki rata-rata nilai paling rendah dan perlu pembahasan ulang.`);
  }

  if (tipeTersulit && tipeTersulit.rata_rata_persentase_benar < 80) {
    rekomendasi.push(`Tipe soal ${String(tipeTersulit.tipe_soal).replace(/_/g, ' ')} menjadi tipe tersulit pada filter ini.`);
  }

  if (kelasPerluPerhatian) {
    rekomendasi.push(`Kelas ${kelasPerluPerhatian.kelas} di ${kelasPerluPerhatian.nama_sekolah} perlu perhatian karena ketuntasannya masih rendah.`);
  }

  if (siswaBelumTuntas.length > 0) {
    rekomendasi.push(`${siswaBelumTuntas.length} siswa pada rekap ringkas masih belum tuntas berdasarkan rata-rata nilai.`);
  }

  if (rekomendasi.length === 0) {
    rekomendasi.push('Mayoritas data pada filter ini sudah menunjukkan ketuntasan yang baik.');
  }

  return {
    items: rekomendasi,
    sekolah_ketuntasan_terendah: sekolahTerendah,
    instrumen_rata_rata_terendah: instrumenTerendah,
    tipe_soal_tersulit: tipeTersulit,
    kelas_perlu_perhatian: kelasPerluPerhatian,
    siswa_belum_tuntas: siswaBelumTuntas
  };
}

async function getLaporanGlobalData(filters) {
  const [summaryStats, rekapSekolah, rekapInstrumen, rekapSiswa, analisisTipe, kelasKritis] = await Promise.all([
    queryLaporanSummary(filters),
    queryRekapSekolah(filters),
    queryRekapInstrumen(filters),
    queryRekapSiswa(filters),
    queryAnalisisTipe(filters),
    queryKelasKritis(filters)
  ]);

  const totalPengerjaan = numberValue(summaryStats.total_pengerjaan);
  const data = {
    summary: {
      kkm: KKM_DEFAULT,
      total_sekolah: rekapSekolah.length,
      total_instrumen: numberValue(summaryStats.total_instrumen),
      total_instrumen_aktif: numberValue(summaryStats.total_instrumen_aktif),
      total_siswa: rekapSekolah.reduce((sum, item) => sum + numberValue(item.jumlah_siswa), 0),
      total_pengerjaan: totalPengerjaan,
      rata_rata_nilai: nullableMetric(summaryStats.rata_rata_nilai, totalPengerjaan),
      ketuntasan: nullableMetric(summaryStats.ketuntasan, totalPengerjaan),
      siswa_tuntas: numberValue(summaryStats.siswa_tuntas),
      siswa_belum_tuntas: numberValue(summaryStats.siswa_belum_tuntas)
    },
    rekap_sekolah: rekapSekolah,
    rekap_instrumen: rekapInstrumen,
    rekap_siswa: rekapSiswa,
    analisis_tipe: analisisTipe,
    rekomendasi: null
  };

  data.rekomendasi = buildLaporanRekomendasi(data, kelasKritis);
  return data;
}

function sheetFromRows(rows, fallbackText = 'Belum ada data laporan pada filter ini.') {
  return XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Keterangan: fallbackText }]);
}

function buildLaporanExcelBuffer(data) {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, sheetFromRows([
    { Indikator: 'Total Sekolah', Nilai: data.summary.total_sekolah },
    { Indikator: 'Total Instrumen', Nilai: data.summary.total_instrumen },
    { Indikator: 'Total Instrumen Aktif', Nilai: data.summary.total_instrumen_aktif },
    { Indikator: 'Total Siswa', Nilai: data.summary.total_siswa },
    { Indikator: 'Total Pengerjaan', Nilai: data.summary.total_pengerjaan },
    { Indikator: 'Rata-rata Nilai', Nilai: data.summary.rata_rata_nilai ?? '-' },
    { Indikator: 'Ketuntasan', Nilai: data.summary.ketuntasan ?? '-' },
    { Indikator: 'Jumlah Siswa Tuntas', Nilai: data.summary.siswa_tuntas },
    { Indikator: 'Jumlah Siswa Belum Tuntas', Nilai: data.summary.siswa_belum_tuntas },
    { Indikator: 'KKM', Nilai: data.summary.kkm }
  ]), 'Ringkasan');

  XLSX.utils.book_append_sheet(workbook, sheetFromRows(data.rekap_sekolah.map(item => ({
    Sekolah: item.nama_sekolah,
    'Jumlah Guru': item.jumlah_guru,
    'Jumlah Siswa': item.jumlah_siswa,
    'Jumlah Instrumen': item.jumlah_instrumen,
    'Instrumen Aktif': item.instrumen_aktif,
    'Total Pengerjaan': item.total_pengerjaan,
    'Rata-rata Nilai': item.rata_rata_nilai ?? '-',
    Ketuntasan: item.ketuntasan ?? '-',
    'Siswa Tuntas': item.siswa_tuntas,
    'Siswa Belum Tuntas': item.siswa_belum_tuntas
  }))), 'Rekap Per Sekolah');

  XLSX.utils.book_append_sheet(workbook, sheetFromRows(data.rekap_instrumen.map(item => ({
    Sekolah: item.nama_sekolah,
    'Judul Instrumen': item.judul,
    Jenis: item.jenis,
    Mapel: item.mata_pelajaran,
    Kelas: item.kelas,
    Guru: item.nama_guru,
    Status: item.status,
    'Jumlah Soal': item.jumlah_soal,
    'Total Pengerjaan': item.total_pengerjaan,
    'Rata-rata Nilai': item.rata_rata_nilai ?? '-',
    Ketuntasan: item.ketuntasan ?? '-',
    'Nilai Tertinggi': item.nilai_tertinggi ?? '-',
    'Nilai Terendah': item.nilai_terendah ?? '-'
  }))), 'Rekap Instrumen');

  XLSX.utils.book_append_sheet(workbook, sheetFromRows(data.rekap_siswa.map(item => ({
    Sekolah: item.nama_sekolah,
    Kelas: item.kelas,
    'Nama Siswa': item.nama_siswa,
    'Jumlah Instrumen Dikerjakan': item.jumlah_instrumen_dikerjakan,
    'Rata-rata Nilai': item.rata_rata_nilai ?? '-',
    'Nilai Tertinggi': item.nilai_tertinggi ?? '-',
    'Nilai Terendah': item.nilai_terendah ?? '-',
    'Status Ketuntasan': item.status_ketuntasan
  }))), 'Rekap Siswa');

  XLSX.utils.book_append_sheet(workbook, sheetFromRows(data.analisis_tipe.map(item => ({
    Sekolah: item.nama_sekolah,
    'Tipe Soal': String(item.tipe_soal).replace(/_/g, ' '),
    'Total Soal/Butir': item.total_soal,
    'Total Jawaban': item.total_jawaban,
    'Rata-rata Persentase Benar': item.rata_rata_persentase_benar ?? '-',
    Kategori: item.kategori
  }))), 'Analisis Tipe Soal');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function buildLaporanFilename() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');

  return `laporan-global-smiasb-${yyyy}${mm}${dd}.xlsx`;
}

// GET /api/super-admin/laporan
router.get('/laporan', authenticate, requireSuperAdmin, async (req, res) => {
  const parsed = parseLaporanFilters(req.query);
  if (!parsed.ok) return res.status(400).json({ success: false, message: parsed.message });

  try {
    const data = await getLaporanGlobalData(parsed.filters);
    return res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// GET /api/super-admin/laporan/export-excel
router.get('/laporan/export-excel', authenticate, requireSuperAdmin, async (req, res) => {
  const parsed = parseLaporanFilters(req.query);
  if (!parsed.ok) return res.status(400).json({ success: false, message: parsed.message });

  try {
    const data = await getLaporanGlobalData(parsed.filters);
    const buffer = buildLaporanExcelBuffer(data);
    const filename = buildLaporanFilename();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Gagal membuat export Excel.' });
  }
});

// GET /api/super-admin/monitoring
router.get('/monitoring', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const rawSekolahId = req.query.id_sekolah;
    const idSekolah = parseId(rawSekolahId);
    const jenisFilter = parseJenisFilter(req.query.jenis);
    const statusFilter = parseInstrumenStatusFilter(req.query.status);
    const kelas = normalizeText(req.query.kelas);
    const guru = normalizeText(req.query.guru);
    const guruId = parseId(guru);
    const search = normalizeText(req.query.search);
    const where = [];
    const params = [];

    if (rawSekolahId !== undefined && rawSekolahId !== null && rawSekolahId !== '' && !idSekolah) {
      return res.status(400).json({ success: false, message: 'ID sekolah tidak valid.' });
    }

    if (!jenisFilter.ok) {
      return res.status(400).json({ success: false, message: 'Jenis instrumen tidak valid.' });
    }

    if (!statusFilter.ok) {
      return res.status(400).json({ success: false, message: 'Status instrumen tidak valid.' });
    }

    if (idSekolah) {
      where.push('i.id_sekolah = ?');
      params.push(idSekolah);
    }

    if (jenisFilter.hasValue) {
      where.push('i.jenis = ?');
      params.push(jenisFilter.jenis);
    }

    if (statusFilter.hasValue) {
      where.push('i.status = ?');
      params.push(statusFilter.status);
    }

    if (kelas) {
      where.push('i.kelas = ?');
      params.push(kelas);
    }

    if (guru) {
      if (guruId) {
        where.push('i.dibuat_oleh = ?');
        params.push(guruId);
      } else {
        where.push('u.nama LIKE ?');
        params.push(`%${guru}%`);
      }
    }

    if (search) {
      where.push('(i.judul LIKE ? OR s.nama_sekolah LIKE ? OR u.nama LIKE ? OR i.kelas LIKE ? OR i.mata_pelajaran LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT
         i.id,
         i.judul,
         i.jenis,
         i.mata_pelajaran,
         i.kelas,
         i.status,
         i.id_sekolah,
         s.nama_sekolah,
         i.dibuat_oleh,
         u.nama as nama_guru,
         i.jumlah_soal,
         i.created_at,
         COALESCE((
           SELECT COUNT(*)
           FROM users siswa
           WHERE siswa.peran = "siswa"
             AND siswa.is_aktif = 1
             AND siswa.id_sekolah <=> i.id_sekolah
             AND siswa.kelas = i.kelas
         ), 0) as jumlah_siswa_kelas,
         COUNT(hs.id) as sudah_mengerjakan,
         GREATEST(
           COALESCE((
             SELECT COUNT(*)
             FROM users siswa
             WHERE siswa.peran = "siswa"
               AND siswa.is_aktif = 1
               AND siswa.id_sekolah <=> i.id_sekolah
               AND siswa.kelas = i.kelas
           ), 0) - COUNT(DISTINCT hs.siswa_id),
           0
         ) as belum_mengerjakan,
         COUNT(hs.id) as total_pengerjaan,
         ROUND(AVG(hs.nilai), 1) as rata_rata_nilai,
         MAX(hs.nilai) as nilai_tertinggi,
         MIN(hs.nilai) as nilai_terendah,
         ROUND((SUM(CASE WHEN hs.nilai >= 75 THEN 1 ELSE 0 END) / NULLIF(COUNT(hs.id), 0)) * 100, 1) as ketuntasan,
         MAX(COALESCE(hs.waktu_selesai, hs.created_at)) as terakhir_dikerjakan
       FROM instrumen i
       LEFT JOIN sekolah s ON s.id = i.id_sekolah
       LEFT JOIN users u ON u.id = i.dibuat_oleh
       LEFT JOIN hasil_siswa hs ON hs.instrumen_id = i.id AND hs.id_sekolah <=> i.id_sekolah
       ${whereSql}
       GROUP BY
         i.id, i.judul, i.jenis, i.mata_pelajaran, i.kelas, i.status,
         i.id_sekolah, s.nama_sekolah, i.dibuat_oleh, u.nama, i.jumlah_soal, i.created_at
       ORDER BY
         CASE WHEN i.id_sekolah IS NULL THEN 1 ELSE 0 END,
         ${SCHOOL_ORDER_CASE_SQL},
         MAX(COALESCE(hs.waktu_selesai, hs.created_at)) DESC,
         i.created_at DESC`,
      params
    );

    return res.json({ success: true, data: rows.map(toMonitoring) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// GET /api/super-admin/instrumen
router.get('/instrumen', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const rawSekolahId = req.query.id_sekolah;
    const idSekolah = parseId(rawSekolahId);
    const jenisFilter = parseJenisFilter(req.query.jenis);
    const statusFilter = parseInstrumenStatusFilter(req.query.status);
    const kelas = normalizeText(req.query.kelas);
    const guru = normalizeText(req.query.guru);
    const guruId = parseId(guru);
    const search = normalizeText(req.query.search);
    const where = [];
    const params = [];

    if (rawSekolahId !== undefined && rawSekolahId !== null && rawSekolahId !== '' && !idSekolah) {
      return res.status(400).json({ success: false, message: 'ID sekolah tidak valid.' });
    }

    if (!jenisFilter.ok) {
      return res.status(400).json({ success: false, message: 'Jenis instrumen tidak valid.' });
    }

    if (!statusFilter.ok) {
      return res.status(400).json({ success: false, message: 'Status instrumen tidak valid.' });
    }

    if (idSekolah) {
      where.push('i.id_sekolah = ?');
      params.push(idSekolah);
    }

    if (jenisFilter.hasValue) {
      where.push('i.jenis = ?');
      params.push(jenisFilter.jenis);
    }

    if (statusFilter.hasValue) {
      where.push('i.status = ?');
      params.push(statusFilter.status);
    }

    if (kelas) {
      where.push('i.kelas = ?');
      params.push(kelas);
    }

    if (guru) {
      if (guruId) {
        where.push('i.dibuat_oleh = ?');
        params.push(guruId);
      } else {
        where.push('u.nama LIKE ?');
        params.push(`%${guru}%`);
      }
    }

    if (search) {
      where.push('(i.judul LIKE ? OR i.mata_pelajaran LIKE ? OR i.kelas LIKE ? OR u.nama LIKE ? OR s.nama_sekolah LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT
         i.id,
         i.judul,
         i.jenis,
         i.mata_pelajaran,
         i.kelas,
         i.jumlah_soal,
         i.status,
         i.batas_waktu,
         i.gunakan_batas_waktu,
         i.dibuat_oleh,
         u.nama as nama_guru,
         i.id_sekolah,
         s.nama_sekolah,
         i.created_at,
         COUNT(hs.id) as jumlah_pengerjaan,
         ROUND(AVG(hs.nilai), 1) as rata_rata_nilai,
         MAX(hs.nilai) as nilai_tertinggi,
         MIN(hs.nilai) as nilai_terendah,
         ROUND((SUM(CASE WHEN hs.nilai >= 75 THEN 1 ELSE 0 END) / NULLIF(COUNT(hs.id), 0)) * 100, 1) as ketuntasan,
         COALESCE((
           SELECT COUNT(*)
           FROM users siswa
           WHERE siswa.peran = "siswa"
             AND siswa.is_aktif = 1
             AND siswa.id_sekolah <=> i.id_sekolah
             AND siswa.kelas = i.kelas
         ), 0) as jumlah_siswa_kelas,
         COUNT(hs.id) as sudah_mengerjakan,
         GREATEST(
           COALESCE((
             SELECT COUNT(*)
             FROM users siswa
             WHERE siswa.peran = "siswa"
               AND siswa.is_aktif = 1
               AND siswa.id_sekolah <=> i.id_sekolah
               AND siswa.kelas = i.kelas
           ), 0) - COUNT(DISTINCT hs.siswa_id),
           0
         ) as belum_mengerjakan
       FROM instrumen i
       LEFT JOIN sekolah s ON s.id = i.id_sekolah
       LEFT JOIN users u ON u.id = i.dibuat_oleh
       LEFT JOIN hasil_siswa hs ON hs.instrumen_id = i.id AND hs.id_sekolah <=> i.id_sekolah
       ${whereSql}
       GROUP BY
         i.id, i.judul, i.jenis, i.mata_pelajaran, i.kelas, i.jumlah_soal, i.status,
         i.batas_waktu, i.gunakan_batas_waktu, i.dibuat_oleh, u.nama,
         i.id_sekolah, s.nama_sekolah, i.created_at
       ORDER BY
         CASE WHEN i.id_sekolah IS NULL THEN 1 ELSE 0 END,
         ${SCHOOL_ORDER_CASE_SQL},
         i.created_at DESC`,
      params
    );

    return res.json({ success: true, data: rows.map(toInstrumen) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// GET /api/super-admin/instrumen/:id
router.get('/instrumen/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID instrumen tidak valid.' });

    const instrumen = await getInstrumenByIdForSuperAdmin(id);
    if (!instrumen) return res.status(404).json({ success: false, message: 'Instrumen tidak ditemukan.' });

    const hasilSiswa = await getHasilRingkasByInstrumen(id, instrumen.id_sekolah);

    return res.json({
      success: true,
      data: {
        ...toInstrumen(instrumen),
        hasil_siswa: hasilSiswa
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// GET /api/super-admin/siswa
router.get('/siswa', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const rawSekolahId = req.query.id_sekolah;
    const idSekolah = parseId(rawSekolahId);
    const kelas = normalizeText(req.query.kelas);
    const search = normalizeText(req.query.search);
    const statusFilter = parseStatusFilter(req.query.status);
    const where = ['u.peran = "siswa"'];
    const params = [];

    if (rawSekolahId !== undefined && rawSekolahId !== null && rawSekolahId !== '' && !idSekolah) {
      return res.status(400).json({ success: false, message: 'ID sekolah tidak valid.' });
    }

    if (!statusFilter.ok) {
      return res.status(400).json({ success: false, message: 'Status tidak valid.' });
    }

    if (idSekolah) {
      where.push('u.id_sekolah = ?');
      params.push(idSekolah);
    }

    if (kelas) {
      where.push('u.kelas = ?');
      params.push(kelas);
    }

    if (statusFilter.hasValue) {
      where.push('u.is_aktif = ?');
      params.push(statusFilter.isAktif);
    }

    if (search) {
      where.push('(u.nama LIKE ? OR u.email LIKE ? OR u.nis LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const [rows] = await pool.execute(
      `SELECT
         u.id,
         u.nama,
         u.email,
         u.nis,
         u.kelas,
         u.id_sekolah,
         u.is_aktif,
         u.created_at,
         s.nama_sekolah,
         COUNT(hs.id) as jumlah_instrumen_dikerjakan,
         ROUND(AVG(hs.nilai), 1) as rata_rata_nilai,
         MAX(hs.nilai) as nilai_tertinggi,
         MIN(hs.nilai) as nilai_terendah,
         MAX(COALESCE(hs.waktu_selesai, hs.created_at)) as terakhir_mengerjakan
       FROM users u
       LEFT JOIN sekolah s ON s.id = u.id_sekolah
       LEFT JOIN hasil_siswa hs ON hs.siswa_id = u.id AND hs.id_sekolah <=> u.id_sekolah
       WHERE ${where.join(' AND ')}
       GROUP BY u.id, u.nama, u.email, u.nis, u.kelas, u.id_sekolah, u.is_aktif, u.created_at, s.nama_sekolah
       ORDER BY
         CASE WHEN u.id_sekolah IS NULL THEN 1 ELSE 0 END,
         ${SCHOOL_ORDER_CASE_SQL},
         CASE WHEN u.kelas IS NULL OR u.kelas = "" THEN 1 ELSE 0 END,
         u.kelas ASC,
         u.nama ASC`,
      params
    );

    return res.json({ success: true, data: rows.map(toSiswa) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// GET /api/super-admin/siswa/kelas-summary
router.get('/siswa/kelas-summary', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const rawSekolahId = req.query.id_sekolah;
    const idSekolah = parseId(rawSekolahId);
    const kelas = normalizeText(req.query.kelas);
    const search = normalizeText(req.query.search);
    const statusFilter = parseStatusFilter(req.query.status);
    const where = ['u.peran = "siswa"'];
    const params = [];

    if (rawSekolahId !== undefined && rawSekolahId !== null && rawSekolahId !== '' && !idSekolah) {
      return res.status(400).json({ success: false, message: 'ID sekolah tidak valid.' });
    }

    if (!statusFilter.ok) {
      return res.status(400).json({ success: false, message: 'Status tidak valid.' });
    }

    if (idSekolah) {
      where.push('u.id_sekolah = ?');
      params.push(idSekolah);
    }

    if (kelas) {
      where.push('u.kelas = ?');
      params.push(kelas);
    }

    if (statusFilter.hasValue) {
      where.push('u.is_aktif = ?');
      params.push(statusFilter.isAktif);
    }

    if (search) {
      where.push('(u.nama LIKE ? OR u.email LIKE ? OR u.nis LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const [rows] = await pool.execute(
      `SELECT
         s.id as id_sekolah,
         s.nama_sekolah,
         u.kelas,
         COUNT(DISTINCT u.id) as jumlah_siswa,
         COUNT(DISTINCT CASE WHEN u.is_aktif = 1 THEN u.id END) as jumlah_siswa_aktif,
         COUNT(hs.id) as jumlah_pengerjaan,
         ROUND(AVG(hs.nilai), 1) as rata_rata_nilai
       FROM users u
       LEFT JOIN sekolah s ON s.id = u.id_sekolah
       LEFT JOIN hasil_siswa hs ON hs.siswa_id = u.id AND hs.id_sekolah <=> u.id_sekolah
       WHERE ${where.join(' AND ')}
       GROUP BY s.id, s.nama_sekolah, u.kelas
       ORDER BY
         CASE WHEN s.id IS NULL THEN 1 ELSE 0 END,
         ${SCHOOL_ORDER_CASE_SQL},
         CASE WHEN u.kelas IS NULL OR u.kelas = "" THEN 1 ELSE 0 END,
         u.kelas ASC`,
      params
    );

    return res.json({
      success: true,
      data: rows.map(row => ({
        id_sekolah: row.id_sekolah,
        sekolah: row.nama_sekolah || 'Belum terhubung ke sekolah',
        nama_sekolah: row.nama_sekolah || 'Belum terhubung ke sekolah',
        kelas: row.kelas || 'Belum diisi',
        jumlah_siswa: Number(row.jumlah_siswa || 0),
        jumlah_siswa_aktif: Number(row.jumlah_siswa_aktif || 0),
        rata_rata_nilai: Number(row.jumlah_pengerjaan || 0) > 0 ? Number(row.rata_rata_nilai || 0) : null,
        jumlah_pengerjaan: Number(row.jumlah_pengerjaan || 0)
      }))
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// GET /api/super-admin/siswa/:id
router.get('/siswa/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID siswa tidak valid.' });

    const siswa = await getSiswaById(id);
    if (!siswa) return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan.' });

    const riwayat = await getRiwayatPengerjaanBySiswa(id, siswa.id_sekolah);

    return res.json({
      success: true,
      data: {
        ...toSiswa(siswa),
        riwayat_pengerjaan: riwayat
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// GET /api/super-admin/guru
router.get('/guru', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const rawSekolahId = req.query.id_sekolah;
    const idSekolah = parseId(rawSekolahId);
    const search = normalizeText(req.query.search);
    const where = ['u.peran = "guru"'];
    const params = [];

    if (rawSekolahId !== undefined && rawSekolahId !== null && rawSekolahId !== '' && !idSekolah) {
      return res.status(400).json({ success: false, message: 'ID sekolah tidak valid.' });
    }

    if (idSekolah) {
      where.push('u.id_sekolah = ?');
      params.push(idSekolah);
    }

    if (search) {
      where.push('(u.nama LIKE ? OR u.email LIKE ? OR u.mata_pelajaran LIKE ? OR s.nama_sekolah LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const [rows] = await pool.execute(
      `SELECT
         u.id,
         u.nama,
         u.email,
         u.peran,
         u.id_sekolah,
         u.mata_pelajaran,
         u.nip,
         u.is_aktif,
         u.created_at,
         s.nama_sekolah,
         COALESCE((SELECT COUNT(*) FROM instrumen i WHERE i.dibuat_oleh = u.id), 0) as jumlah_instrumen,
         COALESCE((SELECT COUNT(*) FROM instrumen i WHERE i.dibuat_oleh = u.id AND i.status = "aktif"), 0) as jumlah_instrumen_aktif,
         COALESCE((SELECT COUNT(*) FROM hasil_siswa hs JOIN instrumen i ON i.id = hs.instrumen_id WHERE i.dibuat_oleh = u.id), 0) as total_pengerjaan,
         COALESCE((SELECT ROUND(AVG(hs.nilai), 1) FROM hasil_siswa hs JOIN instrumen i ON i.id = hs.instrumen_id WHERE i.dibuat_oleh = u.id), 0) as rata_rata_nilai_instrumen
       FROM users u
       LEFT JOIN sekolah s ON s.id = u.id_sekolah
       WHERE ${where.join(' AND ')}
       ORDER BY CASE WHEN u.id_sekolah IS NULL THEN 1 ELSE 0 END, ${SCHOOL_ORDER_CASE_SQL}, u.nama ASC`,
      params
    );

    return res.json({ success: true, data: rows.map(toGuru) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// GET /api/super-admin/guru/:id
router.get('/guru/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID guru tidak valid.' });

    const guru = await getGuruById(id);
    if (!guru) return res.status(404).json({ success: false, message: 'Guru tidak ditemukan.' });

    const instrumenTerbaru = await getInstrumenTerbaruByGuru(id);

    return res.json({
      success: true,
      data: {
        ...toGuru(guru),
        instrumen_terbaru: instrumenTerbaru
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// GET /api/super-admin/admin-sekolah
router.get('/admin-sekolah', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const idSekolah = parseId(req.query.id_sekolah);
    const search = normalizeText(req.query.search);
    const where = ['u.peran IN ("admin", "admin_sekolah")'];
    const params = [];

    if (idSekolah) {
      where.push('u.id_sekolah = ?');
      params.push(idSekolah);
    }

    if (search) {
      where.push('(u.nama LIKE ? OR u.email LIKE ? OR s.nama_sekolah LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const [rows] = await pool.execute(
      `SELECT
         u.id,
         u.nama,
         u.email,
         u.peran,
         u.id_sekolah,
         u.is_aktif,
         u.created_at,
         s.nama_sekolah,
         COALESCE((SELECT COUNT(*) FROM users guru WHERE guru.id_sekolah = u.id_sekolah AND guru.peran = "guru" AND guru.is_aktif = 1), 0) as jumlah_guru,
         COALESCE((SELECT COUNT(*) FROM users siswa WHERE siswa.id_sekolah = u.id_sekolah AND siswa.peran = "siswa" AND siswa.is_aktif = 1), 0) as jumlah_siswa
       FROM users u
       LEFT JOIN sekolah s ON s.id = u.id_sekolah
       WHERE ${where.join(' AND ')}
       ORDER BY ${SCHOOL_ORDER_SQL}, u.nama ASC`,
      params
    );

    return res.json({ success: true, data: rows.map(toAdminSekolah) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// POST /api/super-admin/admin-sekolah
router.post('/admin-sekolah', authenticate, requireSuperAdmin, [
  body('nama').trim().notEmpty().withMessage('Nama admin wajib diisi.'),
  body('password').isLength({ min: 6 }).withMessage('Password minimal 6 karakter.'),
], async (req, res) => {
  if (handleValidation(req, res)) return;

  const nama = normalizeText(req.body.nama);
  const identifier = normalizeIdentifier(req.body);
  const idSekolah = parseId(req.body.id_sekolah);
  const isAktif = normalizeIsAktif(req.body, 1);

  if (!identifier) return res.status(400).json({ success: false, message: 'Email/username wajib diisi.' });
  if (!idSekolah) return res.status(400).json({ success: false, message: 'Sekolah wajib dipilih.' });

  try {
    const sekolah = await getActiveSekolah(idSekolah);
    if (!sekolah) {
      return res.status(400).json({ success: false, message: 'Sekolah tidak ditemukan atau tidak aktif.' });
    }

    if (await identifierExists(identifier)) {
      return res.status(409).json({ success: false, message: 'Email/username sudah digunakan.' });
    }

    const hashed = await bcrypt.hash(req.body.password, 10);
    const [result] = await pool.execute(
      `INSERT INTO users
       (nama, email, password, peran, mata_pelajaran, nip, kelas, nis, id_sekolah, is_aktif)
       VALUES (?, ?, ?, "admin_sekolah", NULL, NULL, NULL, NULL, ?, ?)`,
      [nama, identifier, hashed, idSekolah, isAktif]
    );

    const admin = await getAdminSekolahById(result.insertId);
    return res.status(201).json({
      success: true,
      message: 'Admin sekolah berhasil ditambahkan.',
      data: toAdminSekolah(admin)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// PUT /api/super-admin/admin-sekolah/:id
router.put('/admin-sekolah/:id', authenticate, requireSuperAdmin, [
  body('nama').trim().notEmpty().withMessage('Nama admin wajib diisi.'),
], async (req, res) => {
  if (handleValidation(req, res)) return;

  const id = parseId(req.params.id);
  const idSekolah = parseId(req.body.id_sekolah);
  const nama = normalizeText(req.body.nama);
  const identifier = normalizeIdentifier(req.body);
  const isAktif = normalizeIsAktif(req.body, 1);

  if (!id) return res.status(400).json({ success: false, message: 'ID admin tidak valid.' });
  if (!identifier) return res.status(400).json({ success: false, message: 'Email/username wajib diisi.' });
  if (!idSekolah) return res.status(400).json({ success: false, message: 'Sekolah wajib dipilih.' });

  try {
    const existing = await getAdminSekolahById(id);
    if (!existing) return res.status(404).json({ success: false, message: 'Admin sekolah tidak ditemukan.' });

    const sekolah = await getActiveSekolah(idSekolah);
    if (!sekolah) {
      return res.status(400).json({ success: false, message: 'Sekolah tidak ditemukan atau tidak aktif.' });
    }

    if (await identifierExists(identifier, id)) {
      return res.status(409).json({ success: false, message: 'Email/username sudah digunakan.' });
    }

    await pool.execute(
      'UPDATE users SET nama = ?, email = ?, id_sekolah = ?, is_aktif = ? WHERE id = ? AND peran IN ("admin", "admin_sekolah")',
      [nama, identifier, idSekolah, isAktif, id]
    );

    const admin = await getAdminSekolahById(id);
    return res.json({ success: true, message: 'Admin sekolah berhasil diperbarui.', data: toAdminSekolah(admin) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// PATCH /api/super-admin/admin-sekolah/:id/reset-password
router.patch('/admin-sekolah/:id/reset-password', authenticate, requireSuperAdmin, [
  body('password_baru').isLength({ min: 6 }).withMessage('Password minimal 6 karakter.'),
], async (req, res) => {
  if (handleValidation(req, res)) return;

  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'ID admin tidak valid.' });

  try {
    const existing = await getAdminSekolahById(id);
    if (!existing) return res.status(404).json({ success: false, message: 'Admin sekolah tidak ditemukan.' });

    const hashed = await bcrypt.hash(req.body.password_baru, 10);
    await pool.execute(
      'UPDATE users SET password = ? WHERE id = ? AND peran IN ("admin", "admin_sekolah")',
      [hashed, id]
    );

    return res.json({ success: true, message: 'Password admin sekolah berhasil direset.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// PATCH /api/super-admin/admin-sekolah/:id/status
router.patch('/admin-sekolah/:id/status', authenticate, requireSuperAdmin, [
  body('status').optional().isIn(['aktif', 'nonaktif']).withMessage('Status tidak valid.'),
], async (req, res) => {
  if (handleValidation(req, res)) return;

  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'ID admin tidak valid.' });
  if (Number(req.user.id) === Number(id)) {
    return res.status(400).json({ success: false, message: 'Tidak bisa mengubah status akun sendiri melalui endpoint ini.' });
  }

  try {
    const existing = await getAdminSekolahById(id);
    if (!existing) return res.status(404).json({ success: false, message: 'Admin sekolah tidak ditemukan.' });

    const nextStatus = req.body.status || (Number(existing.is_aktif) === 1 ? 'nonaktif' : 'aktif');
    const isAktif = nextStatus === 'aktif' ? 1 : 0;

    await pool.execute(
      'UPDATE users SET is_aktif = ? WHERE id = ? AND peran IN ("admin", "admin_sekolah")',
      [isAktif, id]
    );

    const admin = await getAdminSekolahById(id);
    return res.json({ success: true, message: 'Status admin sekolah diperbarui.', data: toAdminSekolah(admin) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

module.exports = router;
