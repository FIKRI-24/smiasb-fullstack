const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
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

function whereSql(where) {
  return where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
}

function buildInstrumenScope(user, requestedSekolahId) {
  const where = [];
  const params = [];
  const scope = appendSekolahScope(where, params, user, 'i.id_sekolah', requestedSekolahId);

  if (!scope.ok) return { ok: false, where, params };

  if (isGuru(user)) {
    where.push('i.dibuat_oleh = ?');
    params.push(user.id);
  }

  if (isSiswa(user)) {
    where.push('i.status = "aktif"');
    if (user.kelas) {
      where.push('i.kelas = ?');
      params.push(user.kelas);
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

  const [totalInstrumen] = await pool.execute(
    `SELECT COUNT(*) as total FROM instrumen i ${instrumenWhere}`,
    instrumenScope.params
  );

  const [instrumenAktif] = await pool.execute(
    `SELECT COUNT(*) as total FROM instrumen i ${whereSql([...instrumenScope.where, 'i.status = "aktif"'])}`,
    instrumenScope.params
  );

  let totalGuru = [{ total: 0 }];
  let totalSiswa = [{ total: 0 }];

  if (isSuperAdmin(user) || isAdminSekolah(user)) {
    const userScope = buildUserSchoolScope(user, requestedSekolahId);
    if (!userScope.ok) return null;

    totalGuru = (await pool.execute(
      `SELECT COUNT(*) as total FROM users u ${whereSql([...userScope.where, 'u.peran = "guru"', 'u.is_aktif = 1'])}`,
      userScope.params
    ))[0];

    totalSiswa = (await pool.execute(
      `SELECT COUNT(*) as total FROM users u ${whereSql([...userScope.where, 'u.peran = "siswa"', 'u.is_aktif = 1'])}`,
      userScope.params
    ))[0];
  } else if (isGuru(user)) {
    totalGuru = [{ total: 1 }];
    totalSiswa = (await pool.execute(
      `SELECT COUNT(DISTINCT hs.siswa_id) as total
       FROM hasil_siswa hs
       JOIN instrumen i ON i.id = hs.instrumen_id
       ${instrumenWhere}`,
      instrumenScope.params
    ))[0];
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

  const [rows] = await pool.execute(
    `SELECT i.jenis as jenis, COUNT(*) as jumlah
     FROM instrumen i
     ${whereSql(scope.where)}
     GROUP BY i.jenis`,
    scope.params
  );

  return rows;
}

async function getInstrumenTerbaru(user, requestedSekolahId) {
  const scope = buildInstrumenScope(user, requestedSekolahId);
  if (!scope.ok) return null;

  const [rows] = await pool.execute(
    `SELECT i.id, i.judul, i.jenis, i.status, i.created_at, u.nama as pembuat
     FROM instrumen i
     LEFT JOIN users u ON i.dibuat_oleh = u.id
     ${whereSql(scope.where)}
     ORDER BY i.created_at DESC
     LIMIT 5`,
    scope.params
  );

  return rows;
}

async function getAktivitasTerbaru(user, requestedSekolahId) {
  const where = [];
  const params = [];

  if (isSuperAdmin(user) || isAdminSekolah(user)) {
    const scope = appendSekolahScope(where, params, user, 'u.id_sekolah', requestedSekolahId);
    if (!scope.ok) return null;
  } else {
    where.push('al.user_id = ?');
    params.push(user.id);
  }

  const [rows] = await pool.execute(
    `SELECT al.aksi, al.detail, al.created_at, u.nama, u.peran
     FROM activity_log al
     LEFT JOIN users u ON al.user_id = u.id
     ${whereSql(where)}
     ORDER BY al.created_at DESC
     LIMIT 10`,
    params
  );

  return rows;
}

function buildChatScope(user, requestedSekolahId) {
  const where = [];
  const params = [];

  if (isSuperAdmin(user) || isAdminSekolah(user)) {
    const scope = appendSekolahScope(where, params, user, 'u.id_sekolah', requestedSekolahId);
    if (!scope.ok) return { ok: false, where, params };
  } else {
    where.push('ch.user_id = ?');
    params.push(user.id);
  }

  return { ok: true, where, params };
}

function buildGlobalSekolahFilter(alias, selectedSekolahId) {
  if (!selectedSekolahId) return { where: [], params: [] };

  return {
    where: [`${alias}.id_sekolah = ?`],
    params: [selectedSekolahId]
  };
}

function buildSekolahTableFilter(alias, selectedSekolahId) {
  if (!selectedSekolahId) return { where: [], params: [] };

  return {
    where: [`${alias}.id = ?`],
    params: [selectedSekolahId]
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

  const [columns] = await pool.execute(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_history'`
  );

  chatHistoryColumnsCache = new Set(columns.map(column => column.COLUMN_NAME));
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
    return 'COALESCE(ch.is_error, 0)';
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

  const where = ['siswa.peran = "siswa"'];
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

    where.push('i.dibuat_oleh = ?');
    params.push(user.id);
    where.push('siswa.id_sekolah = ?');
    params.push(user.id_sekolah);
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
    where.push('DATE(ch.created_at) >= ?');
    params.push(dateStart);
  }

  if (dateEnd) {
    where.push('DATE(ch.created_at) <= ?');
    params.push(dateEnd);
  }

  if (kelas) {
    where.push('siswa.kelas = ?');
    params.push(kelas);
  }

  if (instrumenId && hasInstrumenColumn) {
    where.push('ch.instrumen_id = ?');
    params.push(instrumenId);
  }

  if (siswaId) {
    where.push('siswa.id = ?');
    params.push(siswaId);
  }

  if (status === 'success') {
    where.push(`${errorExpression} = 0`);
  } else if (status === 'error') {
    where.push(`${errorExpression} = 1`);
  }

  if (search) {
    where.push('(ch.pesan LIKE ? OR ch.balasan LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
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

    const [[sekolah], [[totalSekolah]], [[totalGuru]], [[totalSiswa]], [[totalInstrumen]], [[instrumenAktif]], [[hasilStats]]] = await Promise.all([
      pool.execute(
        `SELECT id, nama_sekolah, status
         FROM sekolah
         ORDER BY FIELD(nama_sekolah, "SMPS Adabiah Padang", "SMPN 12 Padang", "MTsN 6 Padang"), nama_sekolah ASC`
      ),
      pool.execute(
        `SELECT COUNT(*) as total_sekolah FROM sekolah s ${whereSql(sekolahFilter.where)}`,
        sekolahFilter.params
      ),
      pool.execute(
        `SELECT COUNT(*) as total_guru
         FROM users u
         ${whereSql([...guruFilter.where, 'u.peran = "guru"', 'u.is_aktif = 1'])}`,
        guruFilter.params
      ),
      pool.execute(
        `SELECT COUNT(*) as total_siswa
         FROM users u
         ${whereSql([...siswaFilter.where, 'u.peran = "siswa"', 'u.is_aktif = 1'])}`,
        siswaFilter.params
      ),
      pool.execute(
        `SELECT COUNT(*) as total_instrumen FROM instrumen i ${whereSql(instrumenFilter.where)}`,
        instrumenFilter.params
      ),
      pool.execute(
        `SELECT COUNT(*) as instrumen_aktif
         FROM instrumen i
         ${whereSql([...instrumenFilter.where, 'i.status = "aktif"'])}`,
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

    const selectedSchoolWhere = selectedSekolahId ? 'WHERE s.id = ?' : '';
    const selectedSchoolParams = selectedSekolahId ? [selectedSekolahId] : [];

    const [perSekolah] = await pool.execute(
      `SELECT
         s.id,
         s.nama_sekolah,
         s.status,
         COALESCE((SELECT COUNT(*) FROM users u WHERE u.id_sekolah = s.id AND u.peran = "guru" AND u.is_aktif = 1), 0) as total_guru,
         COALESCE((SELECT COUNT(*) FROM users u WHERE u.id_sekolah = s.id AND u.peran = "siswa" AND u.is_aktif = 1), 0) as total_siswa,
         COALESCE((SELECT COUNT(*) FROM instrumen i WHERE i.id_sekolah = s.id), 0) as total_instrumen,
         COALESCE((SELECT COUNT(*) FROM instrumen i WHERE i.id_sekolah = s.id AND i.status = "aktif"), 0) as instrumen_aktif,
         COALESCE((SELECT COUNT(*) FROM hasil_siswa hs WHERE hs.id_sekolah = s.id), 0) as total_pengerjaan,
         COALESCE((SELECT ROUND(AVG(hs.nilai), 1) FROM hasil_siswa hs WHERE hs.id_sekolah = s.id), 0) as rata_rata_nilai,
         COALESCE((SELECT ROUND((SUM(CASE WHEN hs.nilai >= 75 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) * 100, 1) FROM hasil_siswa hs WHERE hs.id_sekolah = s.id), 0) as ketuntasan
       FROM sekolah s
       ${selectedSchoolWhere}
       ORDER BY FIELD(s.nama_sekolah, "SMPS Adabiah Padang", "SMPN 12 Padang", "MTsN 6 Padang"), s.nama_sekolah ASC`,
      selectedSchoolParams
    );

    const [komposisiJenis] = await pool.execute(
       `SELECT i.jenis, COUNT(*) as jumlah
       FROM instrumen i
       ${whereSql(instrumenFilter.where)}
       GROUP BY i.jenis
       ORDER BY FIELD(i.jenis, "Literasi", "Numerasi", "HOTS"), i.jenis`,
      instrumenFilter.params
    );

    const [instrumenTerbaru] = await pool.execute(
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
    );

    const aktivitasWhere = selectedSekolahId ? 'WHERE u.id_sekolah = ?' : '';
    const aktivitasParams = selectedSekolahId ? [selectedSekolahId] : [];
    const [aktivitas] = await pool.execute(
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
    );

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
    const requestedSekolahId = req.query.id_sekolah;
    const stats = await getDashboardStats(req.user, requestedSekolahId);
    const distribusiInstrumen = await getDistribusiInstrumen(req.user, requestedSekolahId);
    const chatScope = buildChatScope(req.user, requestedSekolahId);

    if (!stats || !distribusiInstrumen || !chatScope.ok) return denyAccess(res);

    const chatWhere = whereSql(chatScope.where);
    const chatFrom = `
      FROM chat_history ch
      JOIN users u ON u.id = ch.user_id
      ${chatWhere}
    `;

    const [totalChat] = await pool.execute(`SELECT COUNT(*) as total ${chatFrom}`, chatScope.params);
    const [uniqueQuestion] = await pool.execute(`SELECT COUNT(DISTINCT ch.pesan) as total ${chatFrom}`, chatScope.params);
    const [errorAI] = await pool.execute(
      `SELECT COUNT(*) as total ${chatFrom} ${chatWhere ? 'AND' : 'WHERE'} ch.balasan LIKE '%kesalahan%'`,
      chatScope.params
    );
    const [topQuestions] = await pool.execute(
      `SELECT ch.pesan, COUNT(*) as total
       ${chatFrom}
       GROUP BY ch.pesan
       ORDER BY total DESC
       LIMIT 5`,
      chatScope.params
    );
    const [dailyActivity] = await pool.execute(
      `SELECT DATE(ch.created_at) as tanggal, COUNT(*) as total
       ${chatFrom}
       GROUP BY tanggal
       ORDER BY tanggal ASC`,
      chatScope.params
    );

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

    return res.json({
      success: true,
      data: {
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
      }
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server.'
    });
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

    const [countRows, rows, kelasRows, instrumenRows, siswaRows] = await Promise.all([
      pool.execute(
        `SELECT COUNT(*) as total ${parts.fromSql} ${where}`,
        parts.params
      ).then(result => result[0]),
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
         LIMIT ? OFFSET ?`,
        [...parts.params, limit, offset]
      ).then(result => result[0]),
      pool.execute(
        `SELECT DISTINCT siswa.kelas
         ${parts.fromSql}
         ${where}
         ORDER BY siswa.kelas ASC`,
        parts.params
      ).then(result => result[0]).catch(() => []),
      pool.execute(
        `SELECT DISTINCT ${parts.instrumenIdExpression} as id, i.judul
         ${parts.fromSql}
         ${where}
         AND i.id IS NOT NULL
         ORDER BY i.judul ASC`,
        parts.params
      ).then(result => result[0]).catch(() => []),
      pool.execute(
        `SELECT DISTINCT siswa.id, siswa.nama, siswa.kelas
         ${parts.fromSql}
         ${where}
         ORDER BY siswa.nama ASC`,
        parts.params
      ).then(result => result[0]).catch(() => [])
    ]);

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

    const [rows] = await pool.execute(
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
    );

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

    const [rows] = await pool.execute(
      `SELECT
         ch.id,
         ch.pesan as pertanyaan,
         siswa.id as siswa_id,
         siswa.nama as nama_siswa,
         siswa.kelas
       ${parts.fromSql}
       ${whereSql(parts.where)}
       ORDER BY ch.created_at DESC
       LIMIT 1000`,
      parts.params
    );

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

    const [rows] = await pool.execute(
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
       ${whereSql([...parts.where, 'ch.id = ?'])}`,
      [...parts.params, chatId]
    );

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
