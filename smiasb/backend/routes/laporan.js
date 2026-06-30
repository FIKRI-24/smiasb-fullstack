const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const { pool, isPostgres, addParam } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const {
  appendSekolahScope,
  denyAccess,
  isSuperAdmin,
  isAdminSekolah,
  isGuru,
  isSiswa,
  parseId
} = require('../utils/accessControl');

function resultRows(result) {
  return result.rows || result[0] || [];
}

const nullSafeEq = isPostgres ? 'IS NOT DISTINCT FROM' : '<=>';

function whereSql(where) {
  return where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
}

function buildInstrumenScope(user, requestedSekolahId) {
  const where = [];
  const params = [];
  const scope = appendSekolahScope(where, params, user, 'i.id_sekolah', requestedSekolahId);

  if (!scope.ok) return { ok: false, where, params };

  if (isGuru(user)) {
    where.push(`i.dibuat_oleh = ${addParam(params, user.id)}`);
  }

  if (isSiswa(user)) {
    where.push("i.status = 'aktif'");
    if (user.kelas) {
      where.push(`i.kelas = ${addParam(params, user.kelas)}`);
    }
  }

  return { ok: true, where, params };
}

function buildUserSchoolScope(user, requestedSekolahId, alias = 'u') {
  const where = [];
  const params = [];
  const scope = appendSekolahScope(where, params, user, `${alias}.id_sekolah`, requestedSekolahId);

  return { ok: scope.ok, where, params };
}

async function getDashboardStats(user, requestedSekolahId) {
  const instrumenScope = buildInstrumenScope(user, requestedSekolahId);
  if (!instrumenScope.ok) return null;

  const instrumenWhere = whereSql(instrumenScope.where);

  const totalInstrumen = resultRows(await pool.execute(
    `SELECT COUNT(*) as total FROM instrumen i ${instrumenWhere}`,
    instrumenScope.params
  ));

  const instrumenAktif = resultRows(await pool.execute(
    `SELECT COUNT(*) as total FROM instrumen i ${whereSql([...instrumenScope.where, "i.status = 'aktif'"])}`,
    instrumenScope.params
  ));

  let totalGuru = [{ total: 0 }];
  let totalSiswa = [{ total: 0 }];

  if (isSuperAdmin(user) || isAdminSekolah(user)) {
    const userScope = buildUserSchoolScope(user, requestedSekolahId);
    if (!userScope.ok) return null;

    totalGuru = resultRows(await pool.execute(
      `SELECT COUNT(*) as total FROM users u ${whereSql([...userScope.where, "u.peran = 'guru'", 'u.is_aktif = TRUE'])}`,
      userScope.params
    ));

    totalSiswa = resultRows(await pool.execute(
      `SELECT COUNT(*) as total FROM users u ${whereSql([...userScope.where, "u.peran = 'siswa'", 'u.is_aktif = TRUE'])}`,
      userScope.params
    ));
  } else if (isGuru(user)) {
    totalGuru = [{ total: 1 }];
    totalSiswa = resultRows(await pool.execute(
      `SELECT COUNT(DISTINCT hs.siswa_id) as total
       FROM hasil_siswa hs
       JOIN instrumen i ON i.id = hs.instrumen_id
       ${instrumenWhere}`,
      instrumenScope.params
    ));
  } else if (isSiswa(user)) {
    totalSiswa = [{ total: 1 }];
  }

  return {
    totalInstrumen: totalInstrumen[0].total,
    instrumenAktif: instrumenAktif[0].total,
    totalGuru: totalGuru[0].total,
    totalSiswa: totalSiswa[0].total
  };
}

async function getDistribusiInstrumen(user, requestedSekolahId) {
  const scope = buildInstrumenScope(user, requestedSekolahId);
  if (!scope.ok) return null;

  const rows = resultRows(await pool.execute(
    `SELECT i.jenis as jenis, COUNT(*) as jumlah
     FROM instrumen i
     ${whereSql(scope.where)}
     GROUP BY i.jenis`,
    scope.params
  ));

  return rows;
}

async function getInstrumenTerbaru(user, requestedSekolahId) {
  const scope = buildInstrumenScope(user, requestedSekolahId);
  if (!scope.ok) return null;

  const rows = resultRows(await pool.execute(
    `SELECT i.id, i.judul, i.jenis, i.status, i.created_at, u.nama as pembuat
     FROM instrumen i
     LEFT JOIN users u ON i.dibuat_oleh = u.id
     ${whereSql(scope.where)}
     ORDER BY i.created_at DESC
     LIMIT 5`,
    scope.params
  ));

  return rows;
}

async function getAktivitasTerbaru(user, requestedSekolahId) {
  const where = [];
  const params = [];

  if (isSuperAdmin(user) || isAdminSekolah(user)) {
    const scope = appendSekolahScope(where, params, user, 'u.id_sekolah', requestedSekolahId);
    if (!scope.ok) return null;
  } else {
    where.push(`al.user_id = ${addParam(params, user.id)}`);
  }

  const rows = resultRows(await pool.execute(
    `SELECT al.aksi, al.detail, al.created_at, u.nama, u.peran
     FROM activity_log al
     LEFT JOIN users u ON al.user_id = u.id
     ${whereSql(where)}
     ORDER BY al.created_at DESC
     LIMIT 10`,
    params
  ));

  return rows;
}

function buildChatScope(user, requestedSekolahId) {
  const where = [];
  const params = [];

  if (isSuperAdmin(user) || isAdminSekolah(user)) {
    const scope = appendSekolahScope(where, params, user, 'u.id_sekolah', requestedSekolahId);
    if (!scope.ok) return { ok: false, where, params };
  } else {
    where.push(`ch.user_id = ${addParam(params, user.id)}`);
  }

  return { ok: true, where, params };
}

function buildGlobalSekolahFilter(alias, selectedSekolahId) {
  if (!selectedSekolahId) return { where: [], params: [] };

  const params = [];
  return {
    where: [`${alias}.id_sekolah = ${addParam(params, selectedSekolahId)}`],
    params
  };
}

function buildSekolahTableFilter(alias, selectedSekolahId) {
  if (!selectedSekolahId) return { where: [], params: [] };

  const params = [];
  return {
    where: [`${alias}.id = ${addParam(params, selectedSekolahId)}`],
    params
  };
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeGlobalStats(stats) {
  return {
    totalSekolah: numberValue(stats.total_sekolah),
    totalGuru: numberValue(stats.total_guru),
    totalSiswa: numberValue(stats.total_siswa),
    totalInstrumen: numberValue(stats.total_instrumen),
    instrumenAktif: numberValue(stats.instrumen_aktif),
    totalPengerjaan: numberValue(stats.total_pengerjaan),
    rataRataNilai: numberValue(stats.rata_rata_nilai),
    ketuntasanGlobal: numberValue(stats.ketuntasan_global)
  };
}

let chatHistoryColumnsCache = null;

async function getChatHistoryColumns() {
  if (chatHistoryColumnsCache) return chatHistoryColumnsCache;

  const sql = isPostgres
    ? `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'chat_history'`
    : `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_history'`;

  const columns = resultRows(await pool.execute(sql));

  chatHistoryColumnsCache = new Set(columns.map(column => column.column_name || column.COLUMN_NAME));
  return chatHistoryColumnsCache;
}

function firstQueryValue(query, names) {
  for (const name of names) {
    if (query[name] !== undefined && query[name] !== null && query[name] !== '') {
      return query[name];
    }
  }
  return null;
}

function normalizeDateOnly(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizeChatbotStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (['success', 'berhasil', 'ok'].includes(status)) return 'success';
  if (['error', 'gagal'].includes(status)) return 'error';
  return '';
}

function getChatbotErrorExpression(hasIsErrorColumn) {
  if (hasIsErrorColumn) {
    return isPostgres
      ? 'CASE WHEN COALESCE(ch.is_error, FALSE) THEN 1 ELSE 0 END'
      : 'COALESCE(ch.is_error, 0)';
  }

  return `CASE
    WHEN ch.balasan LIKE '%kesalahan%'
      OR ch.balasan LIKE '%Gagal terhubung%'
      OR ch.balasan LIKE '%bermasalah%'
      OR ch.balasan LIKE '%tidak valid%'
      OR ch.balasan LIKE '%Terlalu banyak permintaan%'
    THEN 1 ELSE 0
  END`;
}

async function buildChatbotSiswaQueryParts(user, query = {}) {
  const columns = await getChatHistoryColumns();
  const hasInstrumenColumn = columns.has('instrumen_id');
  const hasIsErrorColumn = columns.has('is_error');
  const errorExpression = getChatbotErrorExpression(hasIsErrorColumn);
  const instrumenIdExpression = hasInstrumenColumn ? 'ch.instrumen_id' : 'NULL';
  const instrumenJoin = hasInstrumenColumn
    ? 'LEFT JOIN instrumen i ON i.id = ch.instrumen_id'
    : 'LEFT JOIN instrumen i ON 1 = 0';

  const where = ["siswa.peran = 'siswa'"];
  const params = [];

  if (isSuperAdmin(user) || isAdminSekolah(user)) {
    const scope = appendSekolahScope(where, params, user, 'siswa.id_sekolah', query.id_sekolah);
    if (!scope.ok) return { ok: false };
  } else if (isGuru(user)) {
    if (!hasInstrumenColumn) {
      return {
        ok: true,
        hasInstrumenColumn,
        hasIsErrorColumn,
        fromSql: `
          FROM chat_history ch
          JOIN users siswa ON siswa.id = ch.user_id
          ${instrumenJoin}
        `,
        where: ['1 = 0'],
        params: [],
        errorExpression,
        instrumenIdExpression
      };
    }

    where.push(`i.dibuat_oleh = ${addParam(params, user.id)}`);
    where.push(`siswa.id_sekolah = ${addParam(params, user.id_sekolah)}`);
  } else {
    return { ok: false };
  }

  const dateStart = normalizeDateOnly(firstQueryValue(query, ['tanggal_mulai', 'start', 'date_from', 'dari']));
  const dateEnd = normalizeDateOnly(firstQueryValue(query, ['tanggal_selesai', 'end', 'date_to', 'sampai']));
  const kelas = String(query.kelas || '').trim();
  const instrumenId = parseId(query.instrumen_id || query.id_instrumen);
  const siswaId = parseId(query.siswa_id || query.id_siswa);
  const status = normalizeChatbotStatus(query.status);
  const search = String(query.search || query.q || '').trim();

  if (dateStart) {
    where.push(`DATE(ch.created_at) >= ${addParam(params, dateStart)}`);
  }

  if (dateEnd) {
    where.push(`DATE(ch.created_at) <= ${addParam(params, dateEnd)}`);
  }

  if (kelas) {
    where.push(`siswa.kelas = ${addParam(params, kelas)}`);
  }

  if (instrumenId && hasInstrumenColumn) {
    where.push(`ch.instrumen_id = ${addParam(params, instrumenId)}`);
  }

  if (siswaId) {
    where.push(`siswa.id = ${addParam(params, siswaId)}`);
  }

  if (status === 'success') {
    where.push(`${errorExpression} = 0`);
  } else if (status === 'error') {
    where.push(`${errorExpression} = 1`);
  }

  if (search) {
    const searchParam1 = addParam(params, `%${search}%`);
    const searchParam2 = addParam(params, `%${search}%`);
    where.push(`(ch.pesan LIKE ${searchParam1} OR ch.balasan LIKE ${searchParam2})`);
  }

  const fromSql = `
    FROM chat_history ch
    JOIN users siswa ON siswa.id = ch.user_id
    ${instrumenJoin}
  `;

  return {
    ok: true,
    hasInstrumenColumn,
    hasIsErrorColumn,
    fromSql,
    where,
    params,
    errorExpression,
    instrumenIdExpression
  };
}

function buildChatbotStatus(isError) {
  return Number(isError || 0) === 1 ? 'error' : 'berhasil';
}

function normalizeQuestionText(text = '') {
  const stopWords = new Set([
    'apa', 'itu', 'yang', 'dimaksud', 'jelaskan', 'pengertian', 'maksud',
    'adalah', 'dari', 'tentang', 'tolong', 'coba', 'dong', 'sih', 'ya',
    'bagaimana', 'gimana', 'sebutkan', 'contoh', 'materi', 'mengenai'
  ]);

  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map(word => word.trim())
    .filter(word => word && !stopWords.has(word))
    .join(' ')
    .trim();
}

function questionTokens(text = '') {
  return new Set(normalizeQuestionText(text).split(/\s+/).filter(Boolean));
}

function questionSimilarity(a = '', b = '') {
  const left = questionTokens(a);
  const right = questionTokens(b);
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  left.forEach(token => {
    if (right.has(token)) intersection += 1;
  });

  const union = new Set([...left, ...right]).size;
  return union > 0 ? intersection / union : 0;
}

function formatExportDateTime(value) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function buildExportFilename() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');

  return `laporan-lengkap-smiasb-${yyyy}${mm}${dd}.xlsx`;
}

function buildWorksheet(rows, fallbackText = 'Belum ada data pada bagian ini.') {
  const safeRows = rows.length > 0 ? rows : [{ Keterangan: fallbackText }];
  const worksheet = XLSX.utils.json_to_sheet(safeRows);
  const headers = Object.keys(safeRows[0] || {});

  worksheet['!cols'] = headers.map(header => {
    const maxContentLength = safeRows.reduce((max, row) => {
      const value = row[header] === null || row[header] === undefined ? '' : String(row[header]);
      return Math.max(max, value.length);
    }, String(header).length);

    return { wch: Math.min(Math.max(maxContentLength + 2, 12), 60) };
  });

  return worksheet;
}

function appendWorksheet(workbook, sheetName, rows, fallbackText) {
  XLSX.utils.book_append_sheet(
    workbook,
    buildWorksheet(rows, fallbackText),
    sheetName.slice(0, 31)
  );
}

function getTipeSoalCategory(value) {
  if (value === null || value === undefined) return 'Belum ada data';
  const percent = Number(value);
  if (percent >= 80) return 'Dikuasai / Mudah';
  if (percent >= 60) return 'Cukup / Sedang';
  return 'Sulit / Perlu pembahasan ulang';
}

async function getDashboardFullData(user, requestedSekolahId) {
  const stats = await getDashboardStats(user, requestedSekolahId);
  const distribusiInstrumen = await getDistribusiInstrumen(user, requestedSekolahId);
  const chatScope = buildChatScope(user, requestedSekolahId);

  if (!stats || !distribusiInstrumen || !chatScope.ok) return null;

  const chatWhere = whereSql(chatScope.where);
  const chatFrom = `
    FROM chat_history ch
    JOIN users u ON u.id = ch.user_id
    ${chatWhere}
  `;

  const totalChat = resultRows(await pool.execute(`SELECT COUNT(*) as total ${chatFrom}`, chatScope.params));
  const uniqueQuestion = resultRows(await pool.execute(`SELECT COUNT(DISTINCT ch.pesan) as total ${chatFrom}`, chatScope.params));
  const errorAI = resultRows(await pool.execute(
    `SELECT COUNT(*) as total ${chatFrom} ${chatWhere ? 'AND' : 'WHERE'} ch.balasan LIKE '%kesalahan%'`,
    chatScope.params
  ));
  const topQuestions = resultRows(await pool.execute(
    `SELECT ch.pesan, COUNT(*) as total
     ${chatFrom}
     GROUP BY ch.pesan
     ORDER BY total DESC
     LIMIT 5`,
    chatScope.params
  ));
  const dailyActivity = resultRows(await pool.execute(
    `SELECT DATE(ch.created_at) as tanggal, COUNT(*) as total
     ${chatFrom}
     GROUP BY DATE(ch.created_at)
     ORDER BY tanggal ASC`,
    chatScope.params
  ));

  const insight = [];

  if (errorAI[0].total > 10) {
    insight.push('Sistem AI sering error, perlu pengecekan.');
  }

  if (topQuestions.length > 0 && topQuestions[0].total > 5) {
    insight.push(`Pertanyaan "${topQuestions[0].pesan}" sering muncul.`);
  }

  if (totalChat[0].total > 50) {
    insight.push('Aktivitas chatbot tinggi, siswa aktif belajar.');
  }

  return {
    stats,
    instrumen: {
      distribusi: distribusiInstrumen
    },
    chatbot: {
      totalChat: totalChat[0].total,
      uniqueQuestion: uniqueQuestion[0].total,
      errorAI: errorAI[0].total,
      topQuestions,
      dailyActivity
    },
    insight
  };
}

async function getExportInstrumenRows(user, requestedSekolahId) {
  const scope = buildInstrumenScope(user, requestedSekolahId);
  if (!scope.ok) return null;

  const rows = resultRows(await pool.execute(
    `SELECT
       i.id,
       s.nama_sekolah,
       i.judul,
       i.jenis,
       i.mata_pelajaran,
       i.kelas,
       guru.nama as nama_guru,
       i.status,
       i.jumlah_soal,
       COUNT(hs.id) as total_pengerjaan,
       ROUND(AVG(hs.nilai), 1) as rata_rata_nilai,
       ROUND((SUM(CASE WHEN hs.nilai >= 75 THEN 1 ELSE 0 END) / NULLIF(COUNT(hs.id), 0)) * 100, 1) as ketuntasan,
       MAX(hs.nilai) as nilai_tertinggi,
       MIN(hs.nilai) as nilai_terendah
     FROM instrumen i
     LEFT JOIN sekolah s ON s.id = i.id_sekolah
     LEFT JOIN users guru ON guru.id = i.dibuat_oleh
     LEFT JOIN hasil_siswa hs
       ON hs.instrumen_id = i.id
      AND hs.id_sekolah ${nullSafeEq} i.id_sekolah
     ${whereSql(scope.where)}
     GROUP BY
       i.id, s.nama_sekolah, i.judul, i.jenis, i.mata_pelajaran,
       i.kelas, guru.nama, i.status, i.jumlah_soal, i.created_at
     ORDER BY total_pengerjaan DESC, i.created_at DESC
     LIMIT 500`,
    scope.params
  ));

  return rows;
}

async function getExportHasilSiswaRows(user, requestedSekolahId) {
  const scope = buildInstrumenScope(user, requestedSekolahId);
  if (!scope.ok) return null;

  const rows = resultRows(await pool.execute(
    `SELECT
       s.nama_sekolah,
       siswa.nama as nama_siswa,
       siswa.kelas,
       i.judul as instrumen,
       i.mata_pelajaran,
       i.jenis,
       guru.nama as nama_guru,
       hs.nilai,
       hs.total_benar,
       hs.total_soal,
       CASE WHEN hs.nilai >= 75 THEN 'Tuntas' ELSE 'Belum tuntas' END as status_ketuntasan,
       COALESCE(hs.waktu_selesai, hs.created_at) as waktu_selesai
     FROM hasil_siswa hs
     JOIN instrumen i
       ON i.id = hs.instrumen_id
      AND i.id_sekolah ${nullSafeEq} hs.id_sekolah
     JOIN users siswa
       ON siswa.id = hs.siswa_id
      AND siswa.id_sekolah ${nullSafeEq} hs.id_sekolah
     LEFT JOIN sekolah s ON s.id = hs.id_sekolah
     LEFT JOIN users guru ON guru.id = i.dibuat_oleh
     ${whereSql(scope.where)}
     ORDER BY COALESCE(hs.waktu_selesai, hs.created_at) DESC
     LIMIT 1000`,
    scope.params
  ));

  return rows;
}

async function getExportAnalisisTipeRows(user, requestedSekolahId) {
  const scope = buildInstrumenScope(user, requestedSekolahId);
  if (!scope.ok) return null;

  const rows = resultRows(await pool.execute(
    `SELECT
       s.nama_sekolah,
       i.judul as instrumen,
       i.jenis,
       i.mata_pelajaran,
       i.kelas,
       soal.tipe_soal,
       COUNT(DISTINCT soal.id) as total_soal,
       COUNT(js.id) as total_jawaban,
       ROUND(AVG(CASE
         WHEN js.id IS NULL THEN NULL
         WHEN js.is_benar = ${isPostgres ? 'TRUE' : '1'} THEN 100
         ELSE 0
       END), 1) as rata_rata_persentase_benar
     FROM soal soal
     JOIN instrumen i ON i.id = soal.instrumen_id
     LEFT JOIN sekolah s ON s.id = i.id_sekolah
     LEFT JOIN jawaban_siswa js
       ON js.soal_id = soal.id
      AND js.instrumen_id = i.id
      AND js.id_sekolah ${nullSafeEq} i.id_sekolah
     ${whereSql(scope.where)}
     GROUP BY
       s.nama_sekolah, i.id, i.judul, i.jenis, i.mata_pelajaran,
       i.kelas, soal.tipe_soal
     ORDER BY rata_rata_persentase_benar ASC, total_jawaban DESC
     LIMIT 500`,
    scope.params
  ));

  return rows.map(row => ({
    ...row,
    kategori: getTipeSoalCategory(row.rata_rata_persentase_benar)
  }));
}

async function getExportChatbotRows(user, query = {}, limit = 1000) {
  const parts = await buildChatbotSiswaQueryParts(user, query);
  if (!parts.ok) return null;

  const rows = resultRows(await pool.execute(
    `SELECT
       ch.id,
       siswa.id as siswa_id,
       siswa.nama as nama_siswa,
       siswa.kelas,
       ${parts.instrumenIdExpression} as instrumen_id,
       i.judul as instrumen_judul,
       i.mata_pelajaran,
       i.jenis as jenis_instrumen,
       ch.pesan as pertanyaan,
       ch.balasan as jawaban_chatbot,
       ${parts.errorExpression} as is_error,
       ch.created_at
     ${parts.fromSql}
     ${whereSql(parts.where)}
     ORDER BY ch.created_at DESC, ch.id DESC
     LIMIT ${addParam(parts.params, limit)}${isPostgres ? '::int' : ''}`,
    parts.params
  ));

  return rows.map(row => ({
    ...row,
    is_error: Number(row.is_error || 0),
    status: buildChatbotStatus(row.is_error)
  }));
}

function buildTopSiswaChatbotRows(chatbotRows) {
  const siswaMap = new Map();

  chatbotRows.forEach(row => {
    const key = row.siswa_id || `${row.nama_siswa}-${row.kelas}`;
    if (!siswaMap.has(key)) {
      siswaMap.set(key, {
        nama_siswa: row.nama_siswa,
        kelas: row.kelas,
        jumlah_pertanyaan: 0,
        jumlah_error: 0,
        instrumenCount: new Map()
      });
    }

    const item = siswaMap.get(key);
    item.jumlah_pertanyaan += 1;
    if (row.status === 'error') item.jumlah_error += 1;

    const instrumen = row.instrumen_judul || 'Tanpa instrumen';
    item.instrumenCount.set(instrumen, (item.instrumenCount.get(instrumen) || 0) + 1);
  });

  return [...siswaMap.values()]
    .sort((a, b) => b.jumlah_pertanyaan - a.jumlah_pertanyaan || String(a.nama_siswa).localeCompare(String(b.nama_siswa)))
    .slice(0, 20)
    .map(item => {
      const instrumenTerbanyak = [...item.instrumenCount.entries()]
        .sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

      return {
        'Nama Siswa': item.nama_siswa || '-',
        Kelas: item.kelas || '-',
        'Jumlah Pertanyaan': item.jumlah_pertanyaan,
        'Jumlah Error AI': item.jumlah_error,
        'Instrumen Paling Sering': instrumenTerbanyak
      };
    });
}

function buildTopPertanyaanChatbotRows(chatbotRows) {
  const groups = [];

  chatbotRows.forEach(row => {
    const normalized = normalizeQuestionText(row.pertanyaan);
    if (!normalized) return;

    let group = groups.find(item => (
      item.normalized_key === normalized ||
      questionSimilarity(item.representative_question, row.pertanyaan) >= 0.65
    ));

    if (!group) {
      group = {
        representative_question: row.pertanyaan,
        normalized_key: normalized,
        total: 0,
        siswaMap: new Map()
      };
      groups.push(group);
    }

    group.total += 1;
    group.siswaMap.set(row.siswa_id || `${row.nama_siswa}-${row.kelas}`, {
      nama_siswa: row.nama_siswa,
      kelas: row.kelas
    });

    if (String(row.pertanyaan || '').length < String(group.representative_question || '').length) {
      group.representative_question = row.pertanyaan;
    }
  });

  return groups
    .sort((a, b) => b.total - a.total)
    .slice(0, 20)
    .map((group, index) => ({
      No: index + 1,
      'Pertanyaan Representatif': group.representative_question || '-',
      'Jumlah Ditanyakan': group.total,
      'Siswa Terkait': [...group.siswaMap.values()]
        .map(siswa => `${siswa.nama_siswa || '-'} (${siswa.kelas || '-'})`)
        .join(', ')
    }));
}

function buildExportRecommendationRows(dashboardData, instrumenRows, analisisTipeRows, hasilSiswaRows, chatbotRows) {
  const recommendations = [...(dashboardData.insight || [])];
  const chatbot = dashboardData.chatbot || {};
  const totalInstrumen = Number(dashboardData.stats?.totalInstrumen || 0);
  const instrumenAktif = Number(dashboardData.stats?.instrumenAktif || 0);
  const activeRatio = totalInstrumen > 0 ? Math.round((instrumenAktif / totalInstrumen) * 100) : 0;

  if (totalInstrumen > 0 && activeRatio < 50) {
    recommendations.push('Rasio instrumen aktif masih di bawah 50%, perlu aktivasi atau peninjauan instrumen yang masih draft/nonaktif.');
  }

  const lowInstrument = [...instrumenRows]
    .filter(item => Number(item.total_pengerjaan || 0) > 0 && item.rata_rata_nilai !== null && item.rata_rata_nilai !== undefined)
    .sort((a, b) => Number(a.rata_rata_nilai) - Number(b.rata_rata_nilai))[0];

  if (lowInstrument) {
    recommendations.push(`Instrumen "${lowInstrument.judul}" memiliki rata-rata nilai terendah (${lowInstrument.rata_rata_nilai}) dan perlu pembahasan ulang.`);
  }

  const difficultType = [...analisisTipeRows]
    .filter(item => item.rata_rata_persentase_benar !== null && item.rata_rata_persentase_benar !== undefined)
    .sort((a, b) => Number(a.rata_rata_persentase_benar) - Number(b.rata_rata_persentase_benar))[0];

  if (difficultType && Number(difficultType.rata_rata_persentase_benar) < 60) {
    recommendations.push(`Tipe soal ${String(difficultType.tipe_soal || '-').replace(/_/g, ' ')} termasuk sulit karena persentase benar berada di ${difficultType.rata_rata_persentase_benar}%.`);
  }

  const siswaBelumTuntas = hasilSiswaRows.filter(item => Number(item.nilai || 0) < 75).length;
  if (siswaBelumTuntas > 0) {
    recommendations.push(`${siswaBelumTuntas} hasil pengerjaan masih belum tuntas berdasarkan KKM 75.`);
  }

  const topQuestion = buildTopPertanyaanChatbotRows(chatbotRows)[0];
  if (topQuestion) {
    recommendations.push(`Pertanyaan "${topQuestion['Pertanyaan Representatif']}" paling sering muncul dan dapat dijadikan bahan pengayaan atau FAQ.`);
  }

  if (Number(chatbot.errorAI || 0) > 0) {
    recommendations.push(`Terdapat ${chatbot.errorAI} respons AI berstatus error, perlu pemantauan kualitas jawaban chatbot.`);
  }

  if (recommendations.length === 0) {
    recommendations.push('Belum ada rekomendasi khusus. Data pada filter saat ini terlihat stabil.');
  }

  return recommendations.map((item, index) => ({
    No: index + 1,
    Rekomendasi: item
  }));
}

function buildLaporanLengkapWorkbook(data) {
  const workbook = XLSX.utils.book_new();
  const stats = data.dashboard.stats || {};
  const chatbot = data.dashboard.chatbot || {};
  const chatbotRows = data.chatbotRows || [];
  const totalInstrumen = Number(stats.totalInstrumen || 0);
  const instrumenAktif = Number(stats.instrumenAktif || 0);
  const activeRatio = totalInstrumen > 0 ? Math.round((instrumenAktif / totalInstrumen) * 100) : 0;
  const healthScore = Math.max(0, Math.min(100, 100 - Number(chatbot.errorAI || 0)));
  const exportedUniqueQuestions = new Set(chatbotRows.map(item => String(item.pertanyaan || '').trim()).filter(Boolean)).size;
  const exportedAiErrors = chatbotRows.filter(item => item.status === 'error').length;

  appendWorksheet(workbook, 'Ringkasan', [
    { Bagian: 'Identitas', Indikator: 'Nama Laporan', Nilai: 'Laporan Lengkap Dashboard SMIASB' },
    { Bagian: 'Identitas', Indikator: 'Tanggal Export', Nilai: formatExportDateTime(new Date()) },
    { Bagian: 'Identitas', Indikator: 'Dicetak Oleh', Nilai: data.user?.nama || '-' },
    { Bagian: 'Identitas', Indikator: 'Peran', Nilai: data.user?.peran || '-' },
    { Bagian: 'Identitas', Indikator: 'Lingkup Sekolah', Nilai: data.query?.id_sekolah || data.user?.id_sekolah || 'Sesuai akses akun' },
    { Bagian: 'Metrik', Indikator: 'Total Instrumen', Nilai: stats.totalInstrumen || 0 },
    { Bagian: 'Metrik', Indikator: 'Instrumen Aktif', Nilai: stats.instrumenAktif || 0 },
    { Bagian: 'Metrik', Indikator: 'Rasio Aktivasi Instrumen', Nilai: `${activeRatio}%` },
    { Bagian: 'Metrik', Indikator: 'Total Guru', Nilai: stats.totalGuru || 0 },
    { Bagian: 'Metrik', Indikator: 'Total Siswa', Nilai: stats.totalSiswa || 0 },
    { Bagian: 'Metrik', Indikator: 'Total Chatbot Dashboard', Nilai: chatbot.totalChat || 0 },
    { Bagian: 'Metrik', Indikator: 'Pertanyaan Unik Dashboard', Nilai: chatbot.uniqueQuestion || 0 },
    { Bagian: 'Metrik', Indikator: 'Error AI Dashboard', Nilai: chatbot.errorAI || 0 },
    { Bagian: 'Metrik', Indikator: 'Tanya Jawab AI Diexport', Nilai: chatbotRows.length },
    { Bagian: 'Metrik', Indikator: 'Pertanyaan Unik Diexport', Nilai: exportedUniqueQuestions },
    { Bagian: 'Metrik', Indikator: 'Error AI Diexport', Nilai: exportedAiErrors },
    { Bagian: 'Metrik', Indikator: 'Health Score', Nilai: `${healthScore}%` },
    { Bagian: 'Catatan', Indikator: 'KKM', Nilai: 75 },
    { Bagian: 'Catatan', Indikator: 'Batas Baris', Nilai: 'Rekap hasil dan tanya jawab AI dibatasi maksimal 1000 baris terbaru.' }
  ]);

  appendWorksheet(workbook, 'Distribusi Instrumen', (data.dashboard.instrumen?.distribusi || []).map(item => ({
    Jenis: item.jenis || '-',
    Jumlah: Number(item.jumlah || 0)
  })));

  appendWorksheet(workbook, 'Aktivitas Chatbot', (chatbot.dailyActivity || []).map(item => ({
    Tanggal: item.tanggal ? String(item.tanggal).slice(0, 10) : '-',
    'Total Percakapan': Number(item.total || 0)
  })));

  appendWorksheet(workbook, 'Top Pertanyaan Dashboard', (chatbot.topQuestions || []).map((item, index) => ({
    No: index + 1,
    Pertanyaan: item.pesan || '-',
    'Jumlah Ditanyakan': Number(item.total || 0)
  })));

  appendWorksheet(workbook, 'Rekap Instrumen', data.instrumenRows.map(item => ({
    Sekolah: item.nama_sekolah || '-',
    'Judul Instrumen': item.judul || '-',
    Jenis: item.jenis || '-',
    'Mata Pelajaran': item.mata_pelajaran || '-',
    Kelas: item.kelas || '-',
    Guru: item.nama_guru || '-',
    Status: item.status || '-',
    'Jumlah Soal': Number(item.jumlah_soal || 0),
    'Total Pengerjaan': Number(item.total_pengerjaan || 0),
    'Rata-rata Nilai': item.rata_rata_nilai ?? '-',
    Ketuntasan: item.ketuntasan === null || item.ketuntasan === undefined ? '-' : `${item.ketuntasan}%`,
    'Nilai Tertinggi': item.nilai_tertinggi ?? '-',
    'Nilai Terendah': item.nilai_terendah ?? '-'
  })));

  appendWorksheet(workbook, 'Hasil Siswa', data.hasilSiswaRows.map(item => ({
    Sekolah: item.nama_sekolah || '-',
    Siswa: item.nama_siswa || '-',
    Kelas: item.kelas || '-',
    Instrumen: item.instrumen || '-',
    'Mata Pelajaran': item.mata_pelajaran || '-',
    Jenis: item.jenis || '-',
    Guru: item.nama_guru || '-',
    Nilai: item.nilai ?? '-',
    'Total Benar': item.total_benar ?? '-',
    'Total Soal': item.total_soal ?? '-',
    Status: item.status_ketuntasan || '-',
    'Waktu Selesai': formatExportDateTime(item.waktu_selesai)
  })));

  appendWorksheet(workbook, 'Analisis Tipe Soal', data.analisisTipeRows.map(item => ({
    Sekolah: item.nama_sekolah || '-',
    Instrumen: item.instrumen || '-',
    Jenis: item.jenis || '-',
    'Mata Pelajaran': item.mata_pelajaran || '-',
    Kelas: item.kelas || '-',
    'Tipe Soal': String(item.tipe_soal || '-').replace(/_/g, ' '),
    'Total Soal/Butir': Number(item.total_soal || 0),
    'Total Jawaban': Number(item.total_jawaban || 0),
    'Rata-rata Benar': item.rata_rata_persentase_benar === null || item.rata_rata_persentase_benar === undefined ? '-' : `${item.rata_rata_persentase_benar}%`,
    Kategori: item.kategori || '-'
  })));

  appendWorksheet(workbook, 'Tanya Jawab AI', data.chatbotRows.map(item => ({
    Siswa: item.nama_siswa || '-',
    Kelas: item.kelas || '-',
    Instrumen: item.instrumen_judul || '-',
    'Mata Pelajaran': item.mata_pelajaran || '-',
    'Jenis Instrumen': item.jenis_instrumen || '-',
    'Pertanyaan Siswa': item.pertanyaan || '-',
    'Jawaban AI': item.jawaban_chatbot || '-',
    Status: item.status === 'error' ? 'Error' : 'Berhasil',
    'Waktu Bertanya': formatExportDateTime(item.created_at)
  })));

  appendWorksheet(workbook, 'Top Siswa Chatbot', buildTopSiswaChatbotRows(data.chatbotRows));
  appendWorksheet(workbook, 'Top Pertanyaan Chatbot', buildTopPertanyaanChatbotRows(data.chatbotRows));
  appendWorksheet(workbook, 'Rekomendasi', data.recommendationRows);

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

async function getLaporanLengkapExportData(user, query) {
  const requestedSekolahId = query.id_sekolah;
  const [dashboard, instrumenRows, hasilSiswaRows, analisisTipeRows, chatbotRows] = await Promise.all([
    getDashboardFullData(user, requestedSekolahId),
    getExportInstrumenRows(user, requestedSekolahId),
    getExportHasilSiswaRows(user, requestedSekolahId),
    getExportAnalisisTipeRows(user, requestedSekolahId),
    getExportChatbotRows(user, query)
  ]);

  if (!dashboard || !instrumenRows || !hasilSiswaRows || !analisisTipeRows || !chatbotRows) {
    return null;
  }

  const recommendationRows = buildExportRecommendationRows(
    dashboard,
    instrumenRows,
    analisisTipeRows,
    hasilSiswaRows,
    chatbotRows
  );

  return {
    user,
    query,
    dashboard,
    instrumenRows,
    hasilSiswaRows,
    analisisTipeRows,
    chatbotRows,
    recommendationRows
  };
}

// GET /api/laporan/super-admin-dashboard - ringkasan global lintas sekolah
router.get('/super-admin-dashboard', authenticate, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) return denyAccess(res);

    const selectedSekolahId = parseId(req.query.id_sekolah);
    const sekolahFilter = buildSekolahTableFilter('s', selectedSekolahId);
    const guruFilter = buildGlobalSekolahFilter('u', selectedSekolahId);
    const siswaFilter = buildGlobalSekolahFilter('u', selectedSekolahId);
    const instrumenFilter = buildGlobalSekolahFilter('i', selectedSekolahId);
    const hasilFilter = buildGlobalSekolahFilter('hs', selectedSekolahId);

    const orderSekolahSql = isPostgres
      ? `ORDER BY CASE nama_sekolah WHEN 'SMPS Adabiah Padang' THEN 1 WHEN 'SMPN 12 Padang' THEN 2 WHEN 'MTsN 6 Padang' THEN 3 ELSE 4 END, nama_sekolah ASC`
      : `ORDER BY FIELD(nama_sekolah, 'SMPS Adabiah Padang', 'SMPN 12 Padang', 'MTsN 6 Padang'), nama_sekolah ASC`;

    const results = await Promise.all([
      pool.execute(
        `SELECT id, nama_sekolah, status
         FROM sekolah
         ${orderSekolahSql}`
      ),
      pool.execute(
        `SELECT COUNT(*) as total_sekolah FROM sekolah s ${whereSql(sekolahFilter.where)}`,
        sekolahFilter.params
      ),
      pool.execute(
        `SELECT COUNT(*) as total_guru
         FROM users u
         ${whereSql([...guruFilter.where, "u.peran = 'guru'", 'u.is_aktif = TRUE'])}`,
        guruFilter.params
      ),
      pool.execute(
        `SELECT COUNT(*) as total_siswa
         FROM users u
         ${whereSql([...siswaFilter.where, "u.peran = 'siswa'", 'u.is_aktif = TRUE'])}`,
        siswaFilter.params
      ),
      pool.execute(
        `SELECT COUNT(*) as total_instrumen FROM instrumen i ${whereSql(instrumenFilter.where)}`,
        instrumenFilter.params
      ),
      pool.execute(
        `SELECT COUNT(*) as instrumen_aktif
         FROM instrumen i
         ${whereSql([...instrumenFilter.where, "i.status = 'aktif'"])}`,
        instrumenFilter.params
      ),
      pool.execute(
        `SELECT
           COUNT(*) as total_pengerjaan,
           COALESCE(ROUND(AVG(hs.nilai), 1), 0) as rata_rata_nilai,
           COALESCE(ROUND((SUM(CASE WHEN hs.nilai >= 75 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) * 100, 1), 0) as ketuntasan_global
         FROM hasil_siswa hs
         ${whereSql(hasilFilter.where)}`,
        hasilFilter.params
      )
    ]);

    const sekolah = resultRows(results[0]);
    const totalSekolah = resultRows(results[1])[0];
    const totalGuru = resultRows(results[2])[0];
    const totalSiswa = resultRows(results[3])[0];
    const totalInstrumen = resultRows(results[4])[0];
    const instrumenAktif = resultRows(results[5])[0];
    const hasilStats = resultRows(results[6])[0];

    const selectedSchoolParams = [];
    const selectedSchoolWhere = selectedSekolahId ? `WHERE s.id = ${addParam(selectedSchoolParams, selectedSekolahId)}` : '';

    const orderSekolahAliasSql = isPostgres
      ? `ORDER BY CASE s.nama_sekolah WHEN 'SMPS Adabiah Padang' THEN 1 WHEN 'SMPN 12 Padang' THEN 2 WHEN 'MTsN 6 Padang' THEN 3 ELSE 4 END, s.nama_sekolah ASC`
      : `ORDER BY FIELD(s.nama_sekolah, 'SMPS Adabiah Padang', 'SMPN 12 Padang', 'MTsN 6 Padang'), s.nama_sekolah ASC`;

    const perSekolah = resultRows(await pool.execute(
      `SELECT
         s.id,
         s.nama_sekolah,
         s.status,
         COALESCE((SELECT COUNT(*) FROM users u WHERE u.id_sekolah = s.id AND u.peran = 'guru' AND u.is_aktif = TRUE), 0) as total_guru,
         COALESCE((SELECT COUNT(*) FROM users u WHERE u.id_sekolah = s.id AND u.peran = 'siswa' AND u.is_aktif = TRUE), 0) as total_siswa,
         COALESCE((SELECT COUNT(*) FROM instrumen i WHERE i.id_sekolah = s.id), 0) as total_instrumen,
         COALESCE((SELECT COUNT(*) FROM instrumen i WHERE i.id_sekolah = s.id AND i.status = 'aktif'), 0) as instrumen_aktif,
         COALESCE((SELECT COUNT(*) FROM hasil_siswa hs WHERE hs.id_sekolah = s.id), 0) as total_pengerjaan,
         COALESCE((SELECT ROUND(AVG(hs.nilai), 1) FROM hasil_siswa hs WHERE hs.id_sekolah = s.id), 0) as rata_rata_nilai,
         COALESCE((SELECT ROUND((SUM(CASE WHEN hs.nilai >= 75 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) * 100, 1) FROM hasil_siswa hs WHERE hs.id_sekolah = s.id), 0) as ketuntasan
       FROM sekolah s
       ${selectedSchoolWhere}
       ${orderSekolahAliasSql}`,
      selectedSchoolParams
    ));

    const orderJenisSql = isPostgres
      ? `ORDER BY CASE i.jenis WHEN 'Literasi' THEN 1 WHEN 'Numerasi' THEN 2 WHEN 'HOTS' THEN 3 ELSE 4 END, i.jenis`
      : `ORDER BY FIELD(i.jenis, 'Literasi', 'Numerasi', 'HOTS'), i.jenis`;

    const komposisiJenis = resultRows(await pool.execute(
       `SELECT i.jenis, COUNT(*) as jumlah
       FROM instrumen i
       ${whereSql(instrumenFilter.where)}
       GROUP BY i.jenis
       ${orderJenisSql}`,
      instrumenFilter.params
    ));

    const instrumenTerbaru = resultRows(await pool.execute(
      `SELECT
         i.id,
         s.nama_sekolah,
         i.judul,
         i.jenis,
         i.kelas,
         u.nama as guru,
         i.status,
         i.created_at,
         COUNT(hs.id) as total_pengerjaan,
         COALESCE(ROUND(AVG(hs.nilai), 1), 0) as rata_rata_nilai,
         COALESCE(ROUND((SUM(CASE WHEN hs.nilai >= 75 THEN 1 ELSE 0 END) / NULLIF(COUNT(hs.id), 0)) * 100, 1), 0) as ketuntasan
       FROM instrumen i
       LEFT JOIN sekolah s ON s.id = i.id_sekolah
       LEFT JOIN users u ON u.id = i.dibuat_oleh
       LEFT JOIN hasil_siswa hs ON hs.instrumen_id = i.id
       ${whereSql(instrumenFilter.where)}
       GROUP BY i.id, s.nama_sekolah, i.judul, i.jenis, i.kelas, u.nama, i.status, i.created_at
       ORDER BY i.created_at DESC
       LIMIT 8`,
      instrumenFilter.params
    ));

    const aktivitasParams = [];
    const aktivitasWhere = selectedSekolahId ? `WHERE u.id_sekolah = ${addParam(aktivitasParams, selectedSekolahId)}` : '';
    const aktivitas = resultRows(await pool.execute(
      `SELECT
         al.aksi,
         al.detail,
         al.created_at,
         u.nama,
         u.peran,
         s.nama_sekolah
       FROM activity_log al
       LEFT JOIN users u ON al.user_id = u.id
       LEFT JOIN sekolah s ON s.id = u.id_sekolah
       ${aktivitasWhere}
       ORDER BY al.created_at DESC
       LIMIT 8`,
      aktivitasParams
    ));

    return res.json({
      success: true,
      data: {
        selected_id_sekolah: selectedSekolahId,
        sekolah,
        stats: normalizeGlobalStats({
          ...totalSekolah,
          ...totalGuru,
          ...totalSiswa,
          ...totalInstrumen,
          ...instrumenAktif,
          ...hasilStats
        }),
        perSekolah: perSekolah.map(item => ({
          id: item.id,
          nama_sekolah: item.nama_sekolah,
          status: item.status,
          total_guru: numberValue(item.total_guru),
          total_siswa: numberValue(item.total_siswa),
          total_instrumen: numberValue(item.total_instrumen),
          instrumen_aktif: numberValue(item.instrumen_aktif),
          total_pengerjaan: numberValue(item.total_pengerjaan),
          rata_rata_nilai: numberValue(item.rata_rata_nilai),
          ketuntasan: numberValue(item.ketuntasan)
        })),
        komposisiJenis: komposisiJenis.map(item => ({
          jenis: item.jenis || 'Lainnya',
          jumlah: numberValue(item.jumlah)
        })),
        instrumenTerbaru: instrumenTerbaru.map(item => ({
          ...item,
          total_pengerjaan: numberValue(item.total_pengerjaan),
          rata_rata_nilai: numberValue(item.rata_rata_nilai),
          ketuntasan: numberValue(item.ketuntasan)
        })),
        aktivitas
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// GET /api/laporan/dashboard - statistik untuk dashboard
router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const requestedSekolahId = req.query.id_sekolah;
    const stats = await getDashboardStats(req.user, requestedSekolahId);
    const distribusi = await getDistribusiInstrumen(req.user, requestedSekolahId);
    const terbaru = await getInstrumenTerbaru(req.user, requestedSekolahId);
    const aktivitas = await getAktivitasTerbaru(req.user, requestedSekolahId);

    if (!stats || !distribusi || !terbaru || !aktivitas) return denyAccess(res);

    return res.json({
      success: true,
      data: {
        stats,
        distribusi,
        terbaru,
        aktivitas
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// GET /api/laporan/instrumen - statistik instrumen
router.get('/instrumen', authenticate, authorize('admin', 'guru'), async (req, res) => {
  try {
    const scope = buildInstrumenScope(req.user, req.query.id_sekolah);
    if (!scope.ok) return denyAccess(res);

    const scopedWhere = whereSql(scope.where);

    const [perJenis] = await pool.execute(
      `SELECT i.jenis, COUNT(*) as jumlah, SUM(i.jumlah_soal) as total_soal
       FROM instrumen i
       ${scopedWhere}
       GROUP BY i.jenis`,
      scope.params
    );
    const [perMapel] = await pool.execute(
      `SELECT i.mata_pelajaran, COUNT(*) as jumlah
       FROM instrumen i
       ${scopedWhere}
       GROUP BY i.mata_pelajaran
       ORDER BY jumlah DESC`,
      scope.params
    );
    const [perKelas] = await pool.execute(
      `SELECT i.kelas, COUNT(*) as jumlah
       FROM instrumen i
       ${scopedWhere}
       GROUP BY i.kelas
       ORDER BY i.kelas`,
      scope.params
    );
    const [perStatus] = await pool.execute(
      `SELECT i.status, COUNT(*) as jumlah
       FROM instrumen i
       ${scopedWhere}
       GROUP BY i.status`,
      scope.params
    );

    return res.json({ success: true, data: { perJenis, perMapel, perKelas, perStatus } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// GET /api/laporan/dashboard-full
router.get('/dashboard-full', authenticate, authorize('admin', 'guru'), async (req, res) => {
  try {
    const data = await getDashboardFullData(req.user, req.query.id_sekolah);
    if (!data) return denyAccess(res);

    return res.json({ success: true, data });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server.'
    });
  }
});

// GET /api/laporan/export-excel - export laporan dashboard lengkap
router.get('/export-excel', authenticate, authorize('admin', 'guru'), async (req, res) => {
  try {
    const data = await getLaporanLengkapExportData(req.user, req.query);
    if (!data) return denyAccess(res);

    const buffer = buildLaporanLengkapWorkbook(data);
    const filename = buildExportFilename();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Gagal membuat export Excel laporan.' });
  }
});

// GET /api/laporan/chatbot-siswa - rekapan pertanyaan chatbot siswa
router.get('/chatbot-siswa', authenticate, authorize('admin', 'guru'), async (req, res) => {
  try {
    const parts = await buildChatbotSiswaQueryParts(req.user, req.query);
    if (!parts.ok) return denyAccess(res);

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(5, Number.parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const where = whereSql(parts.where);

    const listParams = [...parts.params];
    const limitParam = addParam(listParams, limit);
    const offsetParam = addParam(listParams, offset);

    const results = await Promise.all([
      pool.execute(
        `SELECT COUNT(*) as total ${parts.fromSql} ${where}`,
        parts.params
      ),
      pool.execute(
        `SELECT
           ch.id,
           siswa.id as siswa_id,
           siswa.nama as nama_siswa,
           siswa.kelas,
           ${parts.instrumenIdExpression} as instrumen_id,
           i.judul as instrumen_judul,
           i.mata_pelajaran,
           i.jenis as jenis_instrumen,
           ch.pesan as pertanyaan,
           ch.balasan as jawaban_chatbot,
           ${parts.errorExpression} as is_error,
           ch.created_at
         ${parts.fromSql}
         ${where}
         ORDER BY ch.created_at DESC, ch.id DESC
         LIMIT ${limitParam}${isPostgres ? '::int' : ''} OFFSET ${offsetParam}${isPostgres ? '::int' : ''}`,
        listParams
      ),
      pool.execute(
        `SELECT DISTINCT siswa.kelas
         ${parts.fromSql}
         ${where}
         ORDER BY siswa.kelas ASC`,
        parts.params
      ).catch(() => ({ rows: [] })),
      pool.execute(
        `SELECT DISTINCT ${parts.instrumenIdExpression} as id, i.judul
         ${parts.fromSql}
         ${where}
         AND i.id IS NOT NULL
         ORDER BY i.judul ASC`,
        parts.params
      ).catch(() => ({ rows: [] })),
      pool.execute(
        `SELECT DISTINCT siswa.id, siswa.nama, siswa.kelas
         ${parts.fromSql}
         ${where}
         ORDER BY siswa.nama ASC`,
        parts.params
      ).catch(() => ({ rows: [] }))
    ]);

    const countRows = resultRows(results[0]);
    const rows = resultRows(results[1]);
    const kelasRows = resultRows(results[2]);
    const instrumenRows = resultRows(results[3]);
    const siswaRows = resultRows(results[4]);

    const total = numberValue(countRows[0]?.total);

    return res.json({
      success: true,
      data: {
        items: rows.map(row => ({
          id: row.id,
          siswa_id: row.siswa_id,
          nama_siswa: row.nama_siswa,
          kelas: row.kelas,
          instrumen_id: row.instrumen_id,
          instrumen_judul: row.instrumen_judul || null,
          mata_pelajaran: row.mata_pelajaran || null,
          jenis_instrumen: row.jenis_instrumen || null,
          pertanyaan: row.pertanyaan,
          jawaban_chatbot: row.jawaban_chatbot,
          is_error: Number(row.is_error || 0),
          status: buildChatbotStatus(row.is_error),
          created_at: row.created_at
        })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(total / limit))
        },
        filters: {
          kelas: kelasRows.map(item => item.kelas).filter(Boolean),
          instrumen: instrumenRows
            .filter(item => item.id)
            .map(item => ({ id: item.id, judul: item.judul })),
          siswa: siswaRows.map(item => ({
            id: item.id,
            nama: item.nama,
            kelas: item.kelas
          }))
        },
        schema: {
          has_instrumen_id: parts.hasInstrumenColumn,
          has_is_error: parts.hasIsErrorColumn
        }
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Gagal mengambil laporan chatbot siswa.' });
  }
});

// GET /api/laporan/chatbot-siswa/top-siswa - siswa paling sering bertanya
router.get('/chatbot-siswa/top-siswa', authenticate, authorize('admin', 'guru'), async (req, res) => {
  try {
    const parts = await buildChatbotSiswaQueryParts(req.user, req.query);
    if (!parts.ok) return denyAccess(res);

    const rows = resultRows(await pool.execute(
      `SELECT
         siswa.id as siswa_id,
         siswa.nama as nama_siswa,
         siswa.kelas,
         ${parts.instrumenIdExpression} as instrumen_id,
         COALESCE(i.judul, 'Tanpa instrumen') as instrumen_judul,
         COUNT(*) as jumlah
       ${parts.fromSql}
       ${whereSql(parts.where)}
       GROUP BY siswa.id, siswa.nama, siswa.kelas, ${parts.instrumenIdExpression}, i.judul
       ORDER BY jumlah DESC, siswa.nama ASC`,
      parts.params
    ));

    const siswaMap = new Map();
    rows.forEach(row => {
      const key = Number(row.siswa_id);
      if (!siswaMap.has(key)) {
        siswaMap.set(key, {
          siswa_id: row.siswa_id,
          nama_siswa: row.nama_siswa,
          kelas: row.kelas,
          jumlah_pertanyaan: 0,
          instrumen_terbanyak: row.instrumen_judul,
          instrumen_terbanyak_id: row.instrumen_id || null,
          _maxInstrumenCount: 0
        });
      }

      const item = siswaMap.get(key);
      const jumlah = numberValue(row.jumlah);
      item.jumlah_pertanyaan += jumlah;
      if (jumlah > item._maxInstrumenCount) {
        item._maxInstrumenCount = jumlah;
        item.instrumen_terbanyak = row.instrumen_judul;
        item.instrumen_terbanyak_id = row.instrumen_id || null;
      }
    });

    const data = [...siswaMap.values()]
      .sort((a, b) => b.jumlah_pertanyaan - a.jumlah_pertanyaan || a.nama_siswa.localeCompare(b.nama_siswa))
      .slice(0, Math.min(20, Number.parseInt(req.query.limit, 10) || 10))
      .map(({ _maxInstrumenCount, ...item }) => item);

    return res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Gagal mengambil top siswa chatbot.' });
  }
});

// GET /api/laporan/chatbot-siswa/top-pertanyaan - kelompok pertanyaan mirip
router.get('/chatbot-siswa/top-pertanyaan', authenticate, authorize('admin', 'guru'), async (req, res) => {
  try {
    const parts = await buildChatbotSiswaQueryParts(req.user, req.query);
    if (!parts.ok) return denyAccess(res);

    const topPertanyaanParams = [...parts.params];
    const rows = resultRows(await pool.execute(
      `SELECT
         ch.id,
         ch.pesan as pertanyaan,
         siswa.id as siswa_id,
         siswa.nama as nama_siswa,
         siswa.kelas
       ${parts.fromSql}
       ${whereSql(parts.where)}
       ORDER BY ch.created_at DESC
       LIMIT ${addParam(topPertanyaanParams, 1000)}${isPostgres ? '::int' : ''}`,
      topPertanyaanParams
    ));

    const groups = [];
    rows.forEach(row => {
      const normalized = normalizeQuestionText(row.pertanyaan);
      if (!normalized) return;

      let group = groups.find(item => (
        item.normalized_key === normalized ||
        questionSimilarity(item.representative_question, row.pertanyaan) >= 0.65
      ));

      if (!group) {
        group = {
          representative_question: row.pertanyaan,
          normalized_key: normalized,
          total: 0,
          siswaMap: new Map(),
          examples: []
        };
        groups.push(group);
      }

      group.total += 1;
      group.examples.push(row.pertanyaan);
      group.siswaMap.set(Number(row.siswa_id), {
        siswa_id: row.siswa_id,
        nama_siswa: row.nama_siswa,
        kelas: row.kelas
      });

      if (row.pertanyaan.length < group.representative_question.length) {
        group.representative_question = row.pertanyaan;
      }
    });

    const data = groups
      .sort((a, b) => b.total - a.total)
      .slice(0, Math.min(20, Number.parseInt(req.query.limit, 10) || 10))
      .map(group => ({
        representative_question: group.representative_question,
        normalized_key: group.normalized_key,
        total: group.total,
        siswa: [...group.siswaMap.values()],
        contoh_pertanyaan: [...new Set(group.examples)].slice(0, 5)
      }));

    return res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Gagal mengambil top pertanyaan chatbot.' });
  }
});

// GET /api/laporan/chatbot-siswa/:id - detail pertanyaan chatbot siswa
router.get('/chatbot-siswa/:id', authenticate, authorize('admin', 'guru'), async (req, res) => {
  try {
    const parts = await buildChatbotSiswaQueryParts(req.user, req.query);
    if (!parts.ok) return denyAccess(res);

    const chatId = parseId(req.params.id);
    if (!chatId) {
      return res.status(400).json({ success: false, message: 'ID chat tidak valid.' });
    }

    const detailParams = [...parts.params];
    const rows = resultRows(await pool.execute(
      `SELECT
         ch.id,
         siswa.id as siswa_id,
         siswa.nama as nama_siswa,
         siswa.kelas,
         ${parts.instrumenIdExpression} as instrumen_id,
         i.judul as instrumen_judul,
         i.mata_pelajaran,
         i.jenis as jenis_instrumen,
         ch.pesan as pertanyaan,
         ch.balasan as jawaban_chatbot,
         ${parts.errorExpression} as is_error,
         ch.created_at
       ${parts.fromSql}
       ${whereSql([...parts.where, `ch.id = ${addParam(detailParams, chatId)}`])}`,
      detailParams
    ));

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Data chat tidak ditemukan.' });
    }

    const row = rows[0];
    return res.json({
      success: true,
      data: {
        id: row.id,
        siswa_id: row.siswa_id,
        nama_siswa: row.nama_siswa,
        kelas: row.kelas,
        instrumen_id: row.instrumen_id,
        instrumen_judul: row.instrumen_judul || null,
        mata_pelajaran: row.mata_pelajaran || null,
        jenis_instrumen: row.jenis_instrumen || null,
        pertanyaan: row.pertanyaan,
        jawaban_chatbot: row.jawaban_chatbot,
        is_error: Number(row.is_error || 0),
        status: buildChatbotStatus(row.is_error),
        created_at: row.created_at
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Gagal mengambil detail chat siswa.' });
  }
});

module.exports = router;
