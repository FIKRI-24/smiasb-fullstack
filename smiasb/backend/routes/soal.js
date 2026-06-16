const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { normalizeKelas } = require('../utils/accessControl');
const { getUploadDir } = require('../utils/uploadPaths');

// Konfigurasi upload gambar
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, getUploadDir('soal'));
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'soal-' + unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Format gambar tidak didukung'));
  }
});

const ACCESS_DENIED_MESSAGE = 'Anda tidak memiliki akses ke data ini';

function denyAccess(res) {
  return res.status(403).json({
    success: false,
    message: ACCESS_DENIED_MESSAGE
  });
}

async function getUserSiswa(userId) {
  const [rows] = await pool.execute(
    'SELECT id, peran, id_sekolah, kelas, nis, is_aktif FROM users WHERE id = ? AND peran = "siswa" AND is_aktif = 1',
    [userId]
  );

  return rows[0] || null;
}

async function getInstrumenById(instrumenId) {
  const [rows] = await pool.execute(
    'SELECT * FROM instrumen WHERE id = ?',
    [instrumenId]
  );

  return rows[0] || null;
}

function ensureSiswaKelasMatchesInstrumen(siswa, instrumen) {
  const siswaKelas = normalizeKelas(siswa?.id_kelas || siswa?.kelas);
  const instrumenKelas = normalizeKelas(instrumen?.id_kelas || instrumen?.kelas);

  return Boolean(siswaKelas && instrumenKelas && siswaKelas === instrumenKelas);
}

function ensureGuruOwnsInstrumen(guru, instrumen) {
  return Number(instrumen?.dibuat_oleh) === Number(guru?.id);
}

function sameSekolah(user, instrumen) {
  return Number(user?.id_sekolah) === Number(instrumen?.id_sekolah);
}

function isSuperAdmin(peran) {
  return peran === 'super_admin';
}

function isAdminRole(peran) {
  return ['admin', 'admin_sekolah', 'super_admin'].includes(peran);
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

async function canAccessInstrumen(user, instrumenId, mode = 'view_soal') {
  const instrumen = await getInstrumenById(instrumenId);

  if (!instrumen) {
    return { ok: false, status: 403, message: ACCESS_DENIED_MESSAGE };
  }

  if (isSuperAdmin(user.peran)) {
    return { ok: true, instrumen };
  }

  if (!sameSekolah(user, instrumen)) {
    return { ok: false, status: 403, message: ACCESS_DENIED_MESSAGE };
  }

  if (isAdminRole(user.peran)) {
    return { ok: true, instrumen };
  }

  if (user.peran === 'guru') {
    const allowedMode = ['view_soal', 'manage_soal', 'monitoring'].includes(mode);
    if (allowedMode && ensureGuruOwnsInstrumen(user, instrumen)) {
      return { ok: true, instrumen };
    }

    return { ok: false, status: 403, message: ACCESS_DENIED_MESSAGE };
  }

  if (user.peran === 'siswa') {
    const allowedMode = ['view_soal', 'status', 'kerjakan', 'submit'].includes(mode);
    if (!allowedMode || instrumen.status !== 'aktif') {
      return { ok: false, status: 403, message: ACCESS_DENIED_MESSAGE };
    }

    const siswa = await getUserSiswa(user.id);
    if (!siswa || !sameSekolah(siswa, instrumen) || !ensureSiswaKelasMatchesInstrumen(siswa, instrumen)) {
      return { ok: false, status: 403, message: ACCESS_DENIED_MESSAGE };
    }

    if ((mode === 'kerjakan' || mode === 'submit') && !isInstrumenOpenForWork(instrumen)) {
      return { ok: false, status: 403, message: ACCESS_DENIED_MESSAGE };
    }

    return { ok: true, instrumen, siswa };
  }

  return { ok: false, status: 403, message: ACCESS_DENIED_MESSAGE };
}

// ============================================================
// Helper keamanan response soal
// - Guru/admin boleh melihat kunci jawaban
// - Siswa tidak boleh menerima kunci jawaban dari API
// ============================================================
function safeJsonParse(value, fallback = null) {
  try {
    if (!value) return fallback;
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch (e) {
    return fallback;
  }
}

function stripHtmlForScoring(value = '') {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeChoiceAnswer(value, allowed = ['A', 'B', 'C', 'D', 'E']) {
  const text = stripHtmlForScoring(value).toUpperCase();
  const match = text.match(/[A-E]/);
  if (match) return allowed.includes(match[0]) ? match[0] : null;
  return allowed.includes(text) ? text : null;
}

function normalizeChoiceSet(value) {
  const rawItems = Array.isArray(value)
    ? value
    : (value === undefined || value === null || value === '' ? [] : [value]);

  const labels = new Set();

  rawItems.forEach((item) => {
    let parsedItem = item;
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (/^\s*\[/.test(trimmed)) {
        try {
          parsedItem = JSON.parse(trimmed);
        } catch (e) {
          parsedItem = item;
        }
      }
    }

    if (Array.isArray(parsedItem)) {
      normalizeChoiceSet(parsedItem).forEach(label => labels.add(label));
      return;
    }

    const text = stripHtmlForScoring(parsedItem).toUpperCase();
    const matches = text.match(/[A-E]/g) || [];
    matches.forEach(label => labels.add(label));
  });

  return [...labels].sort();
}

function normalizeBooleanAnswer(value) {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;

  const text = stripHtmlForScoring(value).toLowerCase();
  if (['benar', 'true', 'b', 'ya', 'yes'].includes(text)) return true;
  if (['salah', 'false', 's', 'tidak', 'no'].includes(text)) return false;
  return null;
}

function normalizeMatchingAnswer(value, key = '') {
  const text = stripHtmlForScoring(value)
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
    .replace(/[.]/g, '')
    .toLowerCase();

  if (!text) return '';

  const numericKey = Number(key);
  const oneBasedKey = Number.isInteger(numericKey) ? numericKey + 1 : null;

  if (oneBasedKey !== null) {
    const pairForKey = text.match(new RegExp(`(?:^|\\s)${oneBasedKey}\\s*-?\\s*([a-z])(?:\\s|$)`));
    if (pairForKey) return pairForKey[1];
  }

  const anyPair = text.match(/(?:^|\s)\d+\s*-?\s*([a-z])(?:\s|$)/);
  if (anyPair) return anyPair[1];

  const leadingLabel = text.match(/^([a-z])\s*[-)]?/);
  if (leadingLabel) return leadingLabel[1];

  const anyLabel = text.match(/[a-z]/);
  return anyLabel ? anyLabel[0] : text.replace(/\s+/g, '');
}

function getScoringKeys(primaryKeys = [], expectedLength = 0) {
  const keys = new Set(primaryKeys.map(key => String(key)));
  for (let i = 0; i < expectedLength; i++) {
    keys.add(String(i));
  }
  return [...keys].sort((a, b) => Number(a) - Number(b));
}

function normalizeIndexedObjectKeys(value = {}, expectedLength = 0) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const keys = Object.keys(source);
  const numericKeys = keys.filter(key => /^\d+$/.test(key)).map(Number);
  const looksOneBased =
    expectedLength > 0 &&
    numericKeys.length === keys.length &&
    numericKeys.length > 0 &&
    !numericKeys.includes(0) &&
    Math.min(...numericKeys) === 1 &&
    Math.max(...numericKeys) <= expectedLength;

  if (!looksOneBased) return source;

  return Object.entries(source).reduce((acc, [key, itemValue]) => {
    acc[String(Number(key) - 1)] = itemValue;
    return acc;
  }, {});
}

function getEmptyAnswerForType(tipeSoal) {
  if (tipeSoal === 'ganda_kompleks') return [];
  if (tipeSoal === 'benar_salah' || tipeSoal === 'menjodohkan') return {};
  return '';
}

function evaluateJawabanSiswa(soalData, jawabanSiswa) {
  let butirBenar = 0;
  let butirTotal = 1;
  const subbagian = [];
  let kunciJawaban = soalData.jawaban_benar || null;
  let catatan = '';

  switch (soalData.tipe_soal) {
    case 'pilihan_ganda': {
      const kunci = normalizeChoiceAnswer(soalData.jawaban_benar, ['A', 'B', 'C', 'D', 'E']);
      const jawaban = normalizeChoiceAnswer(jawabanSiswa, ['A', 'B', 'C', 'D', 'E']);
      butirBenar = kunci && jawaban && kunci === jawaban ? 1 : 0;
      kunciJawaban = kunci;
      subbagian.push({ siswa: jawaban, kunci, benar: butirBenar === 1 });
      break;
    }

    case 'sebab_akibat': {
      const kunci = normalizeChoiceAnswer(soalData.jawaban_benar, ['A', 'B', 'C', 'D']);
      const jawaban = normalizeChoiceAnswer(jawabanSiswa, ['A', 'B', 'C', 'D']);
      butirBenar = kunci && jawaban && kunci === jawaban ? 1 : 0;
      kunciJawaban = kunci;
      subbagian.push({ siswa: jawaban, kunci, benar: butirBenar === 1 });
      break;
    }

    case 'ganda_kompleks': {
      const kunciSet = normalizeChoiceSet(safeJsonParse(soalData.jawaban_benar_json, []));
      const jawabanSet = normalizeChoiceSet(jawabanSiswa);
      const kunciLookup = new Set(kunciSet);
      const jawabanLookup = new Set(jawabanSet);

      butirTotal = kunciSet.length || 1;

      const benarDipilih = jawabanSet.filter(label => kunciLookup.has(label)).length;
      const salahDipilih = jawabanSet.filter(label => !kunciLookup.has(label)).length;
      butirBenar = Math.max(benarDipilih - salahDipilih, 0);
      kunciJawaban = kunciSet;

      [...new Set([...kunciSet, ...jawabanSet])].sort().forEach((label) => {
        subbagian.push({
          pilihan: label,
          siswa_memilih: jawabanLookup.has(label),
          seharusnya: kunciLookup.has(label),
          benar: jawabanLookup.has(label) === kunciLookup.has(label)
        });
      });

      break;
    }

    case 'benar_salah': {
      const pernyataan = safeJsonParse(soalData.pernyataan_checklist, []);
      const kunciChecklist = normalizeIndexedObjectKeys(
        safeJsonParse(soalData.jawaban_benar_json, {}),
        Array.isArray(pernyataan) ? pernyataan.length : 0
      );
      const jawabanChecklist = jawabanSiswa && typeof jawabanSiswa === 'object' ? jawabanSiswa : {};
      const keys = getScoringKeys(Object.keys(kunciChecklist), Array.isArray(pernyataan) ? pernyataan.length : 0);

      butirTotal = keys.length || 1;
      kunciJawaban = kunciChecklist;

      for (const key of keys) {
        const kunci = normalizeBooleanAnswer(kunciChecklist[key]);
        const jawaban = Object.prototype.hasOwnProperty.call(jawabanChecklist, key)
          ? normalizeBooleanAnswer(jawabanChecklist[key])
          : null;
        const benar = jawaban !== null && kunci !== null && jawaban === kunci;

        if (benar) butirBenar++;
        subbagian.push({
          index: Number(key) + 1,
          siswa: jawabanChecklist[key] ?? null,
          siswa_normalized: jawaban,
          kunci: kunciChecklist[key] ?? null,
          kunci_normalized: kunci,
          benar
        });
      }

      break;
    }

    case 'menjodohkan': {
      const parsedMatching = safeJsonParse(soalData.pasangan_menjodohkan, {});
      const jawabanMatching = jawabanSiswa && typeof jawabanSiswa === 'object' ? jawabanSiswa : {};
      const kolomKiri = Array.isArray(parsedMatching.kolom_kiri) ? parsedMatching.kolom_kiri : [];
      const kunciMatching = normalizeIndexedObjectKeys(parsedMatching.kunci || {}, kolomKiri.length);
      const keys = getScoringKeys(Object.keys(kunciMatching), kolomKiri.length);

      butirTotal = keys.length || 1;
      kunciJawaban = kunciMatching;

      for (const key of keys) {
        const jawaban = normalizeMatchingAnswer(jawabanMatching[key], key);
        const kunci = normalizeMatchingAnswer(kunciMatching[key], key);
        const benar = Boolean(jawaban && kunci && jawaban === kunci);

        if (benar) butirBenar++;
        subbagian.push({
          nomor_kiri: Number(key) + 1,
          siswa: jawabanMatching[key] ?? null,
          siswa_normalized: jawaban,
          kunci: kunciMatching[key] ?? null,
          kunci_normalized: kunci,
          benar
        });
      }

      break;
    }

    default: {
      butirTotal = 1;
      butirBenar = 0;
      kunciJawaban = null;
      catatan = `Tipe soal tidak dikenali: ${soalData.tipe_soal}`;
      break;
    }
  }

  const isBenar = butirTotal > 0 ? butirBenar / butirTotal : 0;
  const benarAtauSalah = isBenar >= 1 ? 'benar' : isBenar > 0 ? 'sebagian' : 'salah';

  return {
    butirBenar,
    butirTotal,
    isBenar,
    benarAtauSalah,
    kunciJawaban,
    subbagian,
    catatan: catatan || (
      isBenar >= 1
        ? 'Semua subjawaban sesuai kunci.'
        : 'Ada subjawaban yang tidak sesuai kunci atau belum dijawab.'
    )
  };
}

function getAnalysisCategory(percent) {
  const value = Number(percent || 0);
  if (value >= 80) return 'Dikuasai / Mudah';
  if (value >= 60) return 'Cukup / Sedang';
  return 'Sulit / Perlu remedial';
}

function getPilihanMap(soalData) {
  return {
    A: soalData.pilihan_a || '',
    B: soalData.pilihan_b || '',
    C: soalData.pilihan_c || '',
    D: soalData.pilihan_d || '',
    E: soalData.pilihan_e || ''
  };
}

function getMatchingTextByLabel(parsedMatching = {}, label = '') {
  const normalizedLabel = normalizeMatchingAnswer(label);
  const found = (parsedMatching.kolom_kanan || []).find((item, index) => {
    const itemLabel = item && typeof item === 'object'
      ? item.label
      : String.fromCharCode(97 + index);
    return normalizeMatchingAnswer(itemLabel) === normalizedLabel;
  });

  if (!found) return '';
  if (found && typeof found === 'object') return found.text || found.isi || found.value || '';
  return String(found || '').replace(/^[a-zA-Z]\s*[.)-]\s*/, '');
}

function getStatementTextForAnalysis(item) {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') return item.pernyataan || item.text || item.isi || '';
  return String(item || '');
}

function buildSubbutirAnalysis(soalData, jawabanSiswa, hasilKoreksi) {
  if (soalData.tipe_soal === 'ganda_kompleks') {
    const pilihan = getPilihanMap(soalData);
    const kunciSet = new Set(normalizeChoiceSet(safeJsonParse(soalData.jawaban_benar_json, [])));
    const jawabanSet = new Set(normalizeChoiceSet(jawabanSiswa));
    const visibleLabels = Object.entries(pilihan)
      .filter(([, text]) => stripHtmlForScoring(text))
      .map(([label]) => label);

    return visibleLabels.map((label) => ({
      opsi: label,
      teks_opsi: pilihan[label],
      dipilih_siswa: jawabanSet.has(label),
      kunci_benar: kunciSet.has(label),
      benar: jawabanSet.has(label) === kunciSet.has(label)
    }));
  }

  if (soalData.tipe_soal === 'benar_salah') {
    const pernyataan = safeJsonParse(soalData.pernyataan_checklist, []);
    return hasilKoreksi.subbagian.map((item) => {
      const index = Number(item.index || 1) - 1;
      return {
        no: item.index,
        pernyataan: getStatementTextForAnalysis(pernyataan[index]),
        jawaban_siswa: item.siswa_normalized === true ? 'Benar' : item.siswa_normalized === false ? 'Salah' : '-',
        kunci: item.kunci_normalized === true ? 'Benar' : item.kunci_normalized === false ? 'Salah' : '-',
        benar: item.benar
      };
    });
  }

  if (soalData.tipe_soal === 'menjodohkan') {
    const pasangan = safeJsonParse(soalData.pasangan_menjodohkan, {});
    const kolomKiri = Array.isArray(pasangan.kolom_kiri) ? pasangan.kolom_kiri : [];

    return hasilKoreksi.subbagian.map((item) => {
      const index = Number(item.nomor_kiri || 1) - 1;
      return {
        no: item.nomor_kiri,
        pernyataan: getStatementTextForAnalysis(kolomKiri[index]),
        jawaban_siswa: item.siswa_normalized || '-',
        jawaban_siswa_teks: getMatchingTextByLabel(pasangan, item.siswa_normalized),
        kunci: item.kunci_normalized || '-',
        kunci_teks: getMatchingTextByLabel(pasangan, item.kunci_normalized),
        benar: item.benar
      };
    });
  }

  return hasilKoreksi.subbagian;
}

function getKunciDisplay(soalData, hasilKoreksi) {
  if (soalData.tipe_soal === 'ganda_kompleks') {
    return normalizeChoiceSet(safeJsonParse(soalData.jawaban_benar_json, [])).join(', ');
  }

  if (soalData.tipe_soal === 'benar_salah') {
    return hasilKoreksi.subbagian.map((item) => ({
      no: item.index,
      kunci: item.kunci_normalized === true ? 'Benar' : item.kunci_normalized === false ? 'Salah' : '-'
    }));
  }

  if (soalData.tipe_soal === 'menjodohkan') {
    return hasilKoreksi.subbagian.map((item) => ({
      no: item.nomor_kiri,
      kunci: item.kunci_normalized || '-'
    }));
  }

  return hasilKoreksi.kunciJawaban || '-';
}

function roundPercent(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function parseSoalForGuru(soal) {
  return {
    ...soal,
    jawaban_benar_json: safeJsonParse(soal.jawaban_benar_json, null),
    tabel_data: safeJsonParse(soal.tabel_data, null),
    pasangan_menjodohkan: safeJsonParse(soal.pasangan_menjodohkan, null),
    pernyataan_checklist: safeJsonParse(soal.pernyataan_checklist, null)
  };
}

function isLayoutMetadataBlock(table = {}) {
  return (
    String(table?.role || '').toLowerCase() === 'layout_blocks' ||
    String(table?.type || '').toLowerCase() === 'layout_blocks' ||
    Array.isArray(table?.layout_blocks)
  );
}

function getLayoutMetadataFromTabelData(tabelData) {
  if (!Array.isArray(tabelData)) return null;
  return tabelData.find(isLayoutMetadataBlock) || null;
}

function sanitizeLayoutBlocksForSiswa(blocks = []) {
  const allowed = new Map([
    ['question', 'question'],
    ['stimulus', 'stimulus'],
    ['image', 'images'],
    ['table', 'tables']
  ]);
  const seen = new Set();
  const sanitized = [];

  if (Array.isArray(blocks)) {
    blocks.forEach((block) => {
      const type = String(block?.type || '').trim();
      if (!allowed.has(type) || seen.has(type)) return;
      seen.add(type);
      sanitized.push({ type, id: block?.id || allowed.get(type) });
    });
  }

  if (!seen.has('question')) sanitized.unshift({ type: 'question', id: 'question' });
  return sanitized;
}

function filterTabelDataForSiswa(tabelData, tipeSoal) {
  if (!Array.isArray(tabelData)) return null;

  const tablesOnly = tabelData.filter(table => !isLayoutMetadataBlock(table));

  if (tipeSoal !== 'benar_salah' && tipeSoal !== 'menjodohkan') {
    return tablesOnly.length > 0 ? tablesOnly : null;
  }

  const safeTables = tablesOnly.filter((table) => {
    const role = String(table?.role || '').toLowerCase();
    const source = String(table?.source || '').toLowerCase();

    return source === 'manual' || role === 'stimulus' || role === 'pendukung';
  });

  return safeTables.length > 0 ? safeTables : null;
}

function sanitizeSoalForSiswa(soal) {
  const tabelData = safeJsonParse(soal.tabel_data, null);
  const layoutMetadata = getLayoutMetadataFromTabelData(tabelData);
  const pasangan = safeJsonParse(soal.pasangan_menjodohkan, null);
  const pernyataan = safeJsonParse(soal.pernyataan_checklist, null);

  // Dipakai hanya untuk menghitung batas maksimal centang ganda kompleks.
  // Ini tidak membocorkan kunci jawaban, hanya jumlah jawaban benar.
  const jawabanBenarJson = safeJsonParse(soal.jawaban_benar_json, []);

  let maksimalPilihan = null;

  if (soal.tipe_soal === 'ganda_kompleks') {
    if (Array.isArray(jawabanBenarJson) && jawabanBenarJson.length > 0) {
      maksimalPilihan = jawabanBenarJson.length;
    } else {
      maksimalPilihan = 1;
    }
  }

  let pasanganUntukSiswa = pasangan;

  // Hapus kunci menjodohkan agar tidak bocor ke siswa
  if (pasanganUntukSiswa && typeof pasanganUntukSiswa === 'object') {
    pasanganUntukSiswa = { ...pasanganUntukSiswa };
    delete pasanganUntukSiswa.kunci;
  }

  return {
    id: soal.id,
    instrumen_id: soal.instrumen_id,
    nomor: soal.nomor,
    pertanyaan: soal.pertanyaan,
    gambar_soal: soal.gambar_soal,
    tipe_soal: soal.tipe_soal,
    kategori_instrumen: soal.kategori_instrumen,
    bobot: soal.bobot,

    pilihan_a: soal.pilihan_a,
    pilihan_b: soal.pilihan_b,
    pilihan_c: soal.pilihan_c,
    pilihan_d: soal.pilihan_d,
    pilihan_e: soal.pilihan_e,

    // Untuk ganda kompleks:
    // siswa hanya tahu maksimal berapa pilihan yang boleh dicentang,
    // bukan tahu kunci jawabannya.
    maksimal_pilihan: maksimalPilihan,

    // Tabel jawaban benar/salah atau menjodohkan tidak dikirim ke siswa,
    // tetapi tabel pendukung/stimulus manual tetap aman untuk ditampilkan.
    tabel_data: filterTabelDataForSiswa(tabelData, soal.tipe_soal),
    layout_blocks: layoutMetadata
      ? sanitizeLayoutBlocksForSiswa(layoutMetadata.layout_blocks)
      : null,
    stimulus_tambahan: layoutMetadata?.stimulus_tambahan || '',
    gambar: Array.isArray(layoutMetadata?.gambar) ? layoutMetadata.gambar : [],

    // Ini dipakai frontend untuk render soal benar/salah
    pernyataan_checklist: pernyataan,

    // Ini dipakai frontend untuk render soal menjodohkan, tanpa properti kunci
    pasangan_menjodohkan: pasanganUntukSiswa
  };
}
// ============================================================
// GET /api/soal/status/:instrumenId - Cek status pengerjaan siswa
// ============================================================
router.get('/status/:instrumenId', authenticate, authorize('siswa'), async (req, res) => {
  try {
    const { instrumenId } = req.params;
    const siswaId = req.user.id;

    const access = await canAccessInstrumen(req.user, instrumenId, 'status');
    if (!access.ok) {
      return denyAccess(res);
    }

    const [hasil] = await pool.execute(
      'SELECT * FROM hasil_siswa WHERE instrumen_id = ? AND siswa_id = ?',
      [instrumenId, siswaId]
    );

    if (hasil.length > 0) {
      return res.json({
        success: true,
        data: {
          sudahMengerjakan: true,
          nilai: hasil[0].nilai,
          total_benar: hasil[0].total_benar
        }
      });
    }

    res.json({
      success: true,
      data: {
        sudahMengerjakan: false,
        nilai: null
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal cek status' });
  }
});

// ============================================================
// GET /api/soal/:instrumenId - ambil semua soal
// ============================================================
router.get('/:instrumenId', authenticate, async (req, res) => {
  try {
    const access = await canAccessInstrumen(req.user, req.params.instrumenId, 'view_soal');
    if (!access.ok) {
      return denyAccess(res);
    }

    const [rows] = await pool.execute(
      'SELECT * FROM soal WHERE instrumen_id = ? ORDER BY nomor ASC',
      [req.params.instrumenId]
    );

    const soalWithParsed = rows.map(soal => {
      if (req.user.peran === 'siswa') {
        return sanitizeSoalForSiswa(soal);
      }

      return parseSoalForGuru(soal);
    });

    res.json({ success: true, data: soalWithParsed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal ambil soal' });
  }
});

// ============================================================
// GET /api/soal/kerjakan/:instrumenId - Ambil soal untuk siswa
// ============================================================
router.get('/kerjakan/:instrumenId', authenticate, authorize('siswa'), async (req, res) => {
  try {
    const { instrumenId } = req.params;
    const siswaId = req.user.id;

    const access = await canAccessInstrumen(req.user, instrumenId, 'kerjakan');
    if (!access.ok) {
      return denyAccess(res);
    }

    const instrumenData = access.instrumen;

    // CEK APAKAH SUDAH PERNAH MENGERJAKAN
    const [sudahMengerjakan] = await pool.execute(
      'SELECT * FROM hasil_siswa WHERE instrumen_id = ? AND siswa_id = ?',
      [instrumenId, siswaId]
    );

    if (sudahMengerjakan.length > 0) {
      return res.status(403).json({
        success: false,
        message: `Anda sudah mengerjakan soal ini dengan nilai ${sudahMengerjakan[0].nilai}`,
        sudahMengerjakan: true,
        nilai: sudahMengerjakan[0].nilai
      });
    }

    // AMBIL SEMUA SOAL
    const [soal] = await pool.execute(
      'SELECT * FROM soal WHERE instrumen_id = ? ORDER BY nomor ASC',
      [instrumenId]
    );

    const soalWithParsed = soal.map(sanitizeSoalForSiswa);

    res.json({
      success: true,
      data: {
        instrumen: instrumenData,
        soal: soalWithParsed,
        total_soal: soalWithParsed.length
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal ambil soal' });
  }
});

// ============================================================
// POST /api/soal - tambah soal
// ============================================================
router.post('/', authenticate, authorize('guru', 'admin'), upload.single('gambar_soal'), async (req, res) => {
  try {
    let {
      instrumen_id, pertanyaan, tipe_soal, kategori_instrumen, bobot,
      pilihan_a, pilihan_b, pilihan_c, pilihan_d, pilihan_e,
      jawaban_benar, jawaban_benar_json,
      tabel_data, pasangan_menjodohkan, pernyataan_checklist
    } = req.body;

    if (!instrumen_id || !pertanyaan) {
      return res.status(400).json({ success: false, message: 'Instrumen dan pertanyaan wajib diisi' });
    }

    // Cek target soal
    const [instrumen] = await pool.execute(
      'SELECT id, jumlah_soal, status, dibuat_oleh, id_sekolah FROM instrumen WHERE id = ?',
      [instrumen_id]
    );

    if (instrumen.length === 0) {
      return res.status(404).json({ success: false, message: 'Instrumen tidak ditemukan' });
    }

    if (instrumen[0].status === 'aktif') {
      return res.status(400).json({ success: false, message: 'Instrumen sudah aktif. Tidak bisa menambah soal.' });
    }

    const access = await canAccessInstrumen(req.user, instrumen_id, 'manage_soal');
    if (!access.ok) {
      return denyAccess(res);
    }

    const [countResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM soal WHERE instrumen_id = ?',
      [instrumen_id]
    );

    if (countResult[0].total >= instrumen[0].jumlah_soal) {
      return res.status(400).json({ success: false, message: `Target soal sudah tercapai (${instrumen[0].jumlah_soal} soal)` });
    }

    // Default values
    tipe_soal = tipe_soal || 'pilihan_ganda';
    kategori_instrumen = kategori_instrumen || 'HOTS';
    bobot = bobot || 1;
    const gambar_soal = req.file ? req.file.filename : null;

    // Parse JSON fields
    let parsedTabelData = null;
    if (tabel_data && tabel_data !== 'null') {
      try { parsedTabelData = JSON.stringify(JSON.parse(tabel_data)); } catch (e) {}
    }

    let parsedJawabanJson = null;
    if (jawaban_benar_json && tipe_soal === 'ganda_kompleks') {
      try {
        const parsed = typeof jawaban_benar_json === 'string' ? JSON.parse(jawaban_benar_json) : jawaban_benar_json;
        parsedJawabanJson = JSON.stringify(parsed);
      } catch (e) {}
    }

    // FIX: benar_salah — simpan jawaban_benar_json sebagai object { "0": true, "1": false }
    if (jawaban_benar_json && tipe_soal === 'benar_salah') {
      try {
        const parsed = typeof jawaban_benar_json === 'string' ? JSON.parse(jawaban_benar_json) : jawaban_benar_json;
        if (Array.isArray(parsed)) {
          const asObject = {};
          parsed.forEach((val, idx) => { asObject[String(idx)] = val; });
          parsedJawabanJson = JSON.stringify(asObject);
        } else {
          parsedJawabanJson = JSON.stringify(parsed);
        }
      } catch (e) {}
    }

    let parsedPasangan = null;
    if (pasangan_menjodohkan && tipe_soal === 'menjodohkan') {
      try {
        const raw = typeof pasangan_menjodohkan === 'string'
          ? JSON.parse(pasangan_menjodohkan)
          : pasangan_menjodohkan;

        if (raw.kunci) {
          const kunciKeys = Object.keys(raw.kunci);
          const normalizedKunci = {};
          kunciKeys.forEach((k, idx) => {
            normalizedKunci[String(idx)] = raw.kunci[k];
          });
          raw.kunci = normalizedKunci;
        }

        parsedPasangan = JSON.stringify(raw);
      } catch (e) {}
    }

    let parsedPernyataan = null;
    if (pernyataan_checklist && tipe_soal === 'benar_salah') {
      try {
        parsedPernyataan = typeof pernyataan_checklist === 'string'
          ? pernyataan_checklist
          : JSON.stringify(pernyataan_checklist);
      } catch (e) {}
    }

    // Validasi berdasarkan tipe soal
    if (tipe_soal === 'pilihan_ganda') {
      if (!pilihan_a || !pilihan_b || !pilihan_c || !pilihan_d) {
        return res.status(400).json({ success: false, message: 'Semua pilihan (A,B,C,D) wajib diisi' });
      }
      if (!['A', 'B', 'C', 'D'].includes(jawaban_benar)) {
        return res.status(400).json({ success: false, message: 'Jawaban benar harus A/B/C/D' });
      }
    }
    else if (tipe_soal === 'sebab_akibat') {
      if (!pilihan_a || !pilihan_b) {
        return res.status(400).json({ success: false, message: 'Pernyataan dan sebab wajib diisi' });
      }
      if (!['A', 'B', 'C', 'D'].includes(jawaban_benar)) {
        return res.status(400).json({ success: false, message: 'Jawaban benar harus A/B/C/D' });
      }
      pilihan_e = null;
    }
    else if (tipe_soal === 'ganda_kompleks' && (!jawaban_benar_json || JSON.parse(jawaban_benar_json).length === 0)) {
      return res.status(400).json({ success: false, message: 'Pilih minimal satu jawaban benar' });
    }
    else if (tipe_soal === 'benar_salah' && (!pernyataan_checklist || JSON.parse(pernyataan_checklist).length === 0)) {
      return res.status(400).json({ success: false, message: 'Pernyataan checklist wajib diisi' });
    }
    else if (tipe_soal === 'menjodohkan') {
      try {
        const p = JSON.parse(pasangan_menjodohkan);
        if (!p.kolom_kiri || p.kolom_kiri.length === 0) {
          return res.status(400).json({ success: false, message: 'Data menjodohkan wajib diisi' });
        }
      } catch (e) {
        return res.status(400).json({ success: false, message: 'Data menjodohkan tidak valid' });
      }
    }

    // Ambil nomor terakhir
    const [last] = await pool.execute(
      'SELECT MAX(nomor) as nomor FROM soal WHERE instrumen_id = ?',
      [instrumen_id]
    );
    const nomor = (last[0].nomor || 0) + 1;

    // INSERT SOAL
    await pool.execute(
      `INSERT INTO soal 
      (instrumen_id, nomor, pertanyaan, gambar_soal, tabel_data, 
       pilihan_a, pilihan_b, pilihan_c, pilihan_d, pilihan_e,
       jawaban_benar, jawaban_benar_json, tipe_soal, kategori_instrumen, bobot,
       pasangan_menjodohkan, pernyataan_checklist)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        instrumen_id, nomor, pertanyaan, gambar_soal, parsedTabelData,
        pilihan_a || null, pilihan_b || null, pilihan_c || null, pilihan_d || null, pilihan_e || null,
        jawaban_benar || null, parsedJawabanJson, tipe_soal, kategori_instrumen, bobot,
        parsedPasangan, parsedPernyataan
      ]
    );

    return res.json({ success: true, message: 'Soal berhasil ditambahkan' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Gagal tambah soal' });
  }
});

// ============================================================
// PUT /api/soal/:id - update soal
// ============================================================
router.put('/:id', authenticate, authorize('guru', 'admin'), upload.single('gambar_soal'), async (req, res) => {
  try {
    const [existingSoal] = await pool.execute(
      'SELECT s.*, i.status, i.dibuat_oleh, i.id_sekolah FROM soal s JOIN instrumen i ON s.instrumen_id = i.id WHERE s.id = ?',
      [req.params.id]
    );

    if (existingSoal.length === 0) {
      return res.status(404).json({ success: false, message: 'Soal tidak ditemukan' });
    }

    if (existingSoal[0].status === 'aktif') {
      return res.status(400).json({ success: false, message: 'Instrumen sudah aktif. Tidak bisa mengedit soal.' });
    }

    const access = await canAccessInstrumen(req.user, existingSoal[0].instrumen_id, 'manage_soal');
    if (!access.ok) return denyAccess(res);

    let gambar_soal = existingSoal[0].gambar_soal;
    if (req.file) {
      if (gambar_soal) {
        const oldPath = path.join(getUploadDir('soal'), gambar_soal);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      gambar_soal = req.file.filename;
    } else if (req.body.remove_gambar_soal === 'true' || req.body.remove_gambar_soal === true) {
      if (gambar_soal) {
        const oldPath = path.join(getUploadDir('soal'), gambar_soal);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      gambar_soal = null;
    }

    let pasanganMenjodohkan = req.body.pasangan_menjodohkan || existingSoal[0].pasangan_menjodohkan;
    if (req.body.pasangan_menjodohkan) {
      try {
        const raw = typeof req.body.pasangan_menjodohkan === 'string'
          ? JSON.parse(req.body.pasangan_menjodohkan)
          : req.body.pasangan_menjodohkan;

        if (raw.kunci) {
          const kunciKeys = Object.keys(raw.kunci);
          const normalizedKunci = {};
          kunciKeys.forEach((k, idx) => {
            normalizedKunci[String(idx)] = raw.kunci[k];
          });
          raw.kunci = normalizedKunci;
        }
        pasanganMenjodohkan = JSON.stringify(raw);
      } catch (e) {}
    }

    let jawabanBenarJson = req.body.jawaban_benar_json || existingSoal[0].jawaban_benar_json;
    const tipeUpdate = req.body.tipe_soal || existingSoal[0].tipe_soal;
    const jawabanBenarUpdate = req.body.jawaban_benar || existingSoal[0].jawaban_benar;

    if (tipeUpdate === 'sebab_akibat' && !['A', 'B', 'C', 'D'].includes(jawabanBenarUpdate)) {
      return res.status(400).json({ success: false, message: 'Jawaban benar harus A/B/C/D' });
    }

    if (req.body.jawaban_benar_json && tipeUpdate === 'benar_salah') {
      try {
        const parsed = typeof req.body.jawaban_benar_json === 'string'
          ? JSON.parse(req.body.jawaban_benar_json)
          : req.body.jawaban_benar_json;
        if (Array.isArray(parsed)) {
          const asObject = {};
          parsed.forEach((val, idx) => { asObject[String(idx)] = val; });
          jawabanBenarJson = JSON.stringify(asObject);
        }
      } catch (e) {}
    }

    await pool.execute(
      `UPDATE soal SET 
        pertanyaan = ?, gambar_soal = ?, tabel_data = ?,
        pilihan_a = ?, pilihan_b = ?, pilihan_c = ?, pilihan_d = ?, pilihan_e = ?,
        jawaban_benar = ?, jawaban_benar_json = ?,
        tipe_soal = ?, kategori_instrumen = ?, bobot = ?,
        pasangan_menjodohkan = ?, pernyataan_checklist = ?
       WHERE id = ?`,
      [
        req.body.pertanyaan || existingSoal[0].pertanyaan,
        gambar_soal,
        req.body.tabel_data || existingSoal[0].tabel_data,
        req.body.pilihan_a || existingSoal[0].pilihan_a,
        req.body.pilihan_b || existingSoal[0].pilihan_b,
        req.body.pilihan_c || existingSoal[0].pilihan_c,
        req.body.pilihan_d || existingSoal[0].pilihan_d,
        tipeUpdate === 'sebab_akibat' ? null : (req.body.pilihan_e || existingSoal[0].pilihan_e),
        jawabanBenarUpdate,
        jawabanBenarJson,
        tipeUpdate,
        req.body.kategori_instrumen || existingSoal[0].kategori_instrumen,
        req.body.bobot || existingSoal[0].bobot,
        pasanganMenjodohkan,
        req.body.pernyataan_checklist || existingSoal[0].pernyataan_checklist,
        req.params.id
      ]
    );

    res.json({ success: true, message: 'Soal berhasil diupdate' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal update soal' });
  }
});

// ============================================================
// DELETE /api/soal/:id - hapus soal
// ============================================================
router.delete('/:id', authenticate, authorize('guru', 'admin'), async (req, res) => {
  try {
    const [soal] = await pool.execute(
      'SELECT s.*, i.status, i.dibuat_oleh, i.id_sekolah FROM soal s JOIN instrumen i ON s.instrumen_id = i.id WHERE s.id = ?',
      [req.params.id]
    );

    if (soal.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Soal tidak ditemukan'
      });
    }

    if (soal[0].status === 'aktif') {
      return res.status(400).json({
        success: false,
        message: 'Instrumen sudah aktif. Tidak bisa menghapus soal.'
      });
    }

    const access = await canAccessInstrumen(req.user, soal[0].instrumen_id, 'manage_soal');
    if (!access.ok) return denyAccess(res);

    if (soal[0].gambar_soal) {
      const imagePath = path.join(
        getUploadDir('soal'),
        soal[0].gambar_soal
      );

      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    const instrumenId = soal[0].instrumen_id;

    // Hapus soal
    await pool.execute(
      'DELETE FROM soal WHERE id = ?',
      [req.params.id]
    );

    // Ambil ulang sisa soal berdasarkan urutan lama
    const [sisaSoal] = await pool.execute(
      'SELECT id FROM soal WHERE instrumen_id = ? ORDER BY nomor ASC, id ASC',
      [instrumenId]
    );

    // Reset nomor soal satu per satu agar urut kembali: 1, 2, 3, dst
    for (let i = 0; i < sisaSoal.length; i++) {
      await pool.execute(
        'UPDATE soal SET nomor = ? WHERE id = ?',
        [i + 1, sisaSoal[i].id]
      );
    }

    return res.json({
      success: true,
      message: 'Soal berhasil dihapus'
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: 'Gagal hapus soal'
    });
  }
});

// ============================================================
// POST /api/soal/submit - siswa submit jawaban
// Sistem nilai berdasarkan total butir jawaban
// Rumus: nilai = (jumlah_butir_benar / total_butir_aktual) * 100
// ============================================================
router.post('/submit', authenticate, authorize('siswa'), async (req, res) => {
  const { instrumen_id, jawaban } = req.body;
  const siswa_id = req.user.id;

  // Target kisi-kisi lama adalah 35 butir, tetapi nilai akhir harus memakai
  // total butir aktual yang tersimpan agar semua jawaban sesuai kunci bernilai 100.
  const TOTAL_BUTIR_TARGET = 35;

  try {
    if (!instrumen_id) {
      return res.status(400).json({
        success: false,
        message: 'Instrumen wajib diisi.'
      });
    }

    if (!Array.isArray(jawaban)) {
      return res.status(400).json({
        success: false,
        message: 'Format jawaban tidak valid.'
      });
    }

    const access = await canAccessInstrumen(req.user, instrumen_id, 'submit');
    if (!access.ok) {
      return denyAccess(res);
    }

    const [sudahMengerjakan] = await pool.execute(
      'SELECT * FROM hasil_siswa WHERE instrumen_id = ? AND siswa_id = ?',
      [instrumen_id, siswa_id]
    );

    if (sudahMengerjakan.length > 0) {
      return res.status(403).json({
        success: false,
        message: 'Anda sudah mengerjakan soal ini.'
      });
    }

    const [soalList] = await pool.execute(
      'SELECT * FROM soal WHERE instrumen_id = ? ORDER BY nomor ASC',
      [instrumen_id]
    );

    if (soalList.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Belum ada soal pada instrumen ini.'
      });
    }

    const jawabanBySoalId = new Map();
    jawaban.forEach((item) => {
      if (item && item.soal_id !== undefined && item.soal_id !== null) {
        jawabanBySoalId.set(Number(item.soal_id), item.jawaban);
      }
    });

    let totalButirBenar = 0;
    let totalButirMaksimal = 0;
    const debugKoreksi = [];

    for (const soalData of soalList) {
      const jawabanSiswa = jawabanBySoalId.has(Number(soalData.id))
        ? jawabanBySoalId.get(Number(soalData.id))
        : getEmptyAnswerForType(soalData.tipe_soal);

      const hasilKoreksi = evaluateJawabanSiswa(soalData, jawabanSiswa);

      totalButirBenar += hasilKoreksi.butirBenar;
      totalButirMaksimal += hasilKoreksi.butirTotal;

      debugKoreksi.push({
        nomor_soal: soalData.nomor,
        tipe_soal: soalData.tipe_soal,
        jawaban_siswa: jawabanSiswa,
        kunci_jawaban: hasilKoreksi.kunciJawaban,
        benar_atau_salah: hasilKoreksi.benarAtauSalah,
        poin_diperoleh: hasilKoreksi.butirBenar,
        poin_maksimal: hasilKoreksi.butirTotal,
        subbagian: hasilKoreksi.subbagian,
        catatan: hasilKoreksi.catatan
      });

      await pool.execute(
        `INSERT INTO jawaban_siswa (soal_id, siswa_id, instrumen_id, id_sekolah, jawaban, is_benar)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          soalData.id,
          siswa_id,
          instrumen_id,
          access.instrumen.id_sekolah,
          JSON.stringify(jawabanSiswa),
          hasilKoreksi.isBenar
        ]
      );
    }

    const totalBenarFinal = Math.min(totalButirBenar, totalButirMaksimal);

    const nilai = Math.min(
      100,
      Math.round((totalBenarFinal / totalButirMaksimal) * 100)
    );

    const shouldLogScoringDebug =
      process.env.DEBUG_SCORING === '1' ||
      nilai < 100 ||
      totalButirMaksimal !== TOTAL_BUTIR_TARGET;

    if (shouldLogScoringDebug) {
      console.log('[SCORING_DEBUG]', JSON.stringify({
        instrumen_id,
        siswa_id,
        nilai,
        total_benar: totalBenarFinal,
        total_soal: totalButirMaksimal,
        total_butir_target: TOTAL_BUTIR_TARGET,
        detail: debugKoreksi
      }, null, 2));
    }

    await pool.execute(
      `INSERT INTO hasil_siswa 
       (instrumen_id, siswa_id, id_sekolah, nilai, total_benar, total_soal, waktu_selesai)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        instrumen_id,
        siswa_id,
        access.instrumen.id_sekolah,
        nilai,
        totalBenarFinal,
        totalButirMaksimal
      ]
    );

    return res.json({
      success: true,
      message: 'Jawaban berhasil dikirim',
      data: {
        nilai,
        total_benar: totalBenarFinal,
        total_soal: totalButirMaksimal,
        total_butir_target: TOTAL_BUTIR_TARGET,
        total_butir_terhitung: totalButirMaksimal,
        keterangan: `Nilai dihitung berdasarkan ${totalButirMaksimal} butir jawaban aktual.`
      }
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: 'Gagal menyimpan jawaban.'
    });
  }
});
// ============================================================
// GET /api/soal/monitoring/:instrumenId
// guru monitor hasil + detail jawaban siswa
// ============================================================
router.get(
  '/monitoring/:instrumenId',
  authenticate,
  authorize('guru', 'admin'),
  async (req, res) => {
    try {

      const instrumenId = req.params.instrumenId;
      const access = await canAccessInstrumen(req.user, instrumenId, 'monitoring');
      if (!access.ok) {
        return denyAccess(res);
      }

      const [results] = await pool.execute(
        `
        SELECT 
          hs.*,
          u.nama AS siswa_nama,
          u.email,
          u.nis
        FROM hasil_siswa hs
        JOIN users u
          ON hs.siswa_id = u.id
        WHERE hs.instrumen_id = ?
        ORDER BY hs.nilai DESC, hs.waktu_selesai ASC
        `,
        [instrumenId]
      );

      const [soalList] = await pool.execute(
        'SELECT * FROM soal WHERE instrumen_id = ? ORDER BY nomor ASC',
        [instrumenId]
      );

      const analisisButirMap = new Map();

      soalList.forEach((soal) => {
        analisisButirMap.set(Number(soal.id), {
          soal_id: soal.id,
          nomor_soal: soal.nomor,
          tipe_soal: soal.tipe_soal,
          jumlah_benar: 0,
          jumlah_salah: 0,
          total_peserta: 0,
          total_persen_skor: 0,
          persentase_benar: 0,
          kategori: getAnalysisCategory(0)
        });
      });

      for (let i = 0; i < results.length; i++) {

        const siswa = results[i];
        let totalButirBenarAktual = 0;
        let totalButirMaksimalAktual = 0;

        const [detail] = await pool.execute(
          `
          SELECT
            js.id AS jawaban_id,
            js.jawaban,
            js.is_benar,
            js.created_at AS waktu_jawab,
            s.id AS soal_id,
            s.nomor,
            s.pertanyaan,
            s.gambar_soal,
            s.tabel_data,
            s.tipe_soal,
            s.pilihan_a,
            s.pilihan_b,
            s.pilihan_c,
            s.pilihan_d,
            s.pilihan_e,
            s.jawaban_benar,
            s.jawaban_benar_json,
            s.pasangan_menjodohkan,
            s.pernyataan_checklist,
            s.kategori_instrumen,
            s.bobot
          FROM soal s
          LEFT JOIN jawaban_siswa js
            ON js.soal_id = s.id
            AND js.instrumen_id = s.instrumen_id
            AND js.siswa_id = ?
          WHERE s.instrumen_id = ?
          ORDER BY s.nomor ASC
          `,
          [siswa.siswa_id, instrumenId]
        );

        siswa.detail_jawaban = detail.map((d) => {
          let parsedJawaban = d.jawaban;
          try { parsedJawaban = JSON.parse(d.jawaban); } catch (e) {}

          let parsedPasangan = d.pasangan_menjodohkan;
          try { parsedPasangan = JSON.parse(d.pasangan_menjodohkan); } catch (e) {}

          let parsedJawabanBenarJson = d.jawaban_benar_json;
          try { parsedJawabanBenarJson = JSON.parse(d.jawaban_benar_json); } catch (e) {}

          let parsedPernyataanChecklist = d.pernyataan_checklist;
          try { parsedPernyataanChecklist = JSON.parse(d.pernyataan_checklist); } catch (e) {}

          let parsedTabelData = d.tabel_data;
          try { parsedTabelData = JSON.parse(d.tabel_data); } catch (e) {}

          if (parsedJawaban === null || parsedJawaban === undefined) {
            parsedJawaban = getEmptyAnswerForType(d.tipe_soal);
          }

          const hasilKoreksi = evaluateJawabanSiswa(d, parsedJawaban);
          const skorPersen = hasilKoreksi.isBenar * 100;
          const analisisButir = analisisButirMap.get(Number(d.soal_id));

          if (analisisButir) {
            analisisButir.total_peserta += 1;
            analisisButir.total_persen_skor += skorPersen;
            if (hasilKoreksi.isBenar >= 1) analisisButir.jumlah_benar += 1;
            else analisisButir.jumlah_salah += 1;
          }

          totalButirBenarAktual += hasilKoreksi.butirBenar;
          totalButirMaksimalAktual += hasilKoreksi.butirTotal;

          return {
            ...d,
            jawaban: parsedJawaban,
            pasangan_menjodohkan: parsedPasangan,
            jawaban_benar_json: parsedJawabanBenarJson,
            pernyataan_checklist: parsedPernyataanChecklist,
            tabel_data: parsedTabelData,
            pilihan: getPilihanMap(d),
            kunci_display: getKunciDisplay(d, hasilKoreksi),
            analisis_subbutir: buildSubbutirAnalysis(d, parsedJawaban, hasilKoreksi),
            benar_atau_salah: hasilKoreksi.benarAtauSalah,
            skor_diperoleh: hasilKoreksi.butirBenar,
            skor_maksimal: hasilKoreksi.butirTotal,
            skor_persen: roundPercent(skorPersen),
            is_benar: hasilKoreksi.isBenar,
            catatan_koreksi: hasilKoreksi.catatan
          };
        });

        siswa.total_benar_aktual = totalButirBenarAktual;
        siswa.total_soal_aktual = totalButirMaksimalAktual;
        siswa.nilai_terhitung = totalButirMaksimalAktual > 0
          ? Math.min(100, Math.round((totalButirBenarAktual / totalButirMaksimalAktual) * 100))
          : 0;
        siswa.status_tuntas = siswa.nilai_terhitung >= 75 ? 'Tuntas' : 'Belum tuntas';
      }

      const analisisButir = [...analisisButirMap.values()].map((item) => {
        const persentaseBenar = item.total_peserta > 0
          ? item.total_persen_skor / item.total_peserta
          : 0;

        return {
          ...item,
          persentase_benar: roundPercent(persentaseBenar),
          kategori: getAnalysisCategory(persentaseBenar)
        };
      });

      const tipeMap = new Map();
      analisisButir.forEach((item) => {
        if (!tipeMap.has(item.tipe_soal)) {
          tipeMap.set(item.tipe_soal, {
            tipe_soal: item.tipe_soal,
            jumlah_soal: 0,
            total_persentase: 0
          });
        }

        const tipe = tipeMap.get(item.tipe_soal);
        tipe.jumlah_soal += 1;
        tipe.total_persentase += item.persentase_benar;
      });

      const analisisTipe = [...tipeMap.values()].map((item) => {
        const rataRata = item.jumlah_soal > 0
          ? item.total_persentase / item.jumlah_soal
          : 0;

        return {
          tipe_soal: item.tipe_soal,
          jumlah_soal: item.jumlah_soal,
          rata_rata_persentase_benar: roundPercent(rataRata),
          kategori_pemahaman: getAnalysisCategory(rataRata)
        };
      });

      const nilaiList = results.map(siswa => Number(siswa.nilai_terhitung || siswa.nilai || 0));
      const statistik = {
        total_siswa: results.length,
        rata_rata: nilaiList.length > 0
          ? roundPercent(nilaiList.reduce((sum, nilai) => sum + nilai, 0) / nilaiList.length)
          : 0,
        nilai_tertinggi: nilaiList.length > 0 ? Math.max(...nilaiList) : 0,
        nilai_terendah: nilaiList.length > 0 ? Math.min(...nilaiList) : 0
      };

      const siswaBelumTuntas = results
        .filter(siswa => Number(siswa.nilai_terhitung || siswa.nilai || 0) < 75)
        .map(siswa => ({
          siswa_id: siswa.siswa_id,
          nama: siswa.siswa_nama,
          nilai: Number(siswa.nilai_terhitung || siswa.nilai || 0)
        }));

      const soalPalingBanyakSalah = [...analisisButir]
        .filter(item => item.jumlah_salah > 0 || item.persentase_benar < 100)
        .sort((a, b) => {
          if (b.jumlah_salah !== a.jumlah_salah) return b.jumlah_salah - a.jumlah_salah;
          return a.persentase_benar - b.persentase_benar;
        })
        .slice(0, 5)
        .map(item => ({
          nomor_soal: item.nomor_soal,
          tipe_soal: item.tipe_soal,
          jumlah_salah: item.jumlah_salah,
          persentase_benar: item.persentase_benar,
          kategori: item.kategori
        }));

      const tipeSoalPalingSulit = [...analisisTipe]
        .filter(item => item.rata_rata_persentase_benar < 100)
        .sort((a, b) => a.rata_rata_persentase_benar - b.rata_rata_persentase_benar)
        .slice(0, 3);

      const rekomendasiTeks = [];

      if (siswaBelumTuntas.length > 0) {
        rekomendasiTeks.push(`${siswaBelumTuntas.length} siswa perlu remedial karena nilai di bawah 75.`);
      }

      const butirSulit = soalPalingBanyakSalah.filter(item => item.persentase_benar < 60);
      if (butirSulit.length > 0) {
        rekomendasiTeks.push(`Bahas ulang soal nomor ${butirSulit.map(item => item.nomor_soal).join(', ')} karena persentase benar di bawah 60%.`);
      }

      if (tipeSoalPalingSulit.length > 0 && tipeSoalPalingSulit[0].rata_rata_persentase_benar < 80) {
        rekomendasiTeks.push(`Prioritaskan latihan tipe ${tipeSoalPalingSulit[0].tipe_soal.replace(/_/g, ' ')}.`);
      }

      if (rekomendasiTeks.length === 0) {
        rekomendasiTeks.push('Mayoritas siswa sudah menguasai butir soal. Remedial khusus belum diperlukan.');
      }

      return res.json({
        success: true,
        data: {
          hasil: results,
          statistik,
          analisis_butir: analisisButir,
          analisis_tipe: analisisTipe,
          rekomendasi: {
            siswa_belum_tuntas: siswaBelumTuntas,
            soal_paling_banyak_salah: soalPalingBanyakSalah,
            tipe_soal_paling_sulit: tipeSoalPalingSulit,
            rekomendasi_remedial: rekomendasiTeks
          }
        }
      });

    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: 'Gagal mengambil data monitoring'
      });
    }
  }
);

// ============================================================
// ========== TAMBAHAN BARU: GET /api/soal/monitoring/:instrumenId/belum-mengerjakan
// ========== Menampilkan siswa yang belum mengerjakan instrumen, dikelompokkan per rombel (kelas)
// ============================================================
router.get(
  '/monitoring/:instrumenId/belum-mengerjakan',
  authenticate,
  authorize('guru', 'admin'),
  async (req, res) => {
    try {
      const instrumenId = req.params.instrumenId;
      const access = await canAccessInstrumen(req.user, instrumenId, 'monitoring');
      if (!access.ok) {
        return denyAccess(res);
      }

      // 1. Ambil data instrumen untuk mengetahui kelas target
      const [instrumen] = await pool.execute(
        'SELECT id, judul, kelas, id_sekolah FROM instrumen WHERE id = ?',
        [instrumenId]
      );

      if (instrumen.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Instrumen tidak ditemukan'
        });
      }

      const targetKelas = instrumen[0].kelas;
      const targetSekolah = instrumen[0].id_sekolah;

      // 2. Ambil daftar siswa yang sudah mengerjakan instrumen ini
      const [sudahMengerjakan] = await pool.execute(
        `SELECT siswa_id FROM hasil_siswa WHERE instrumen_id = ?`,
        [instrumenId]
      );

      const sudahMengerjakanIds = sudahMengerjakan.map(s => s.siswa_id);
      const placeholders = sudahMengerjakanIds.length > 0 
        ? sudahMengerjakanIds.map(() => '?').join(',') 
        : null;

      // 3. Ambil siswa yang BELUM mengerjakan, filter berdasarkan kelas instrumen
      let query = `
  SELECT 
    u.id AS siswa_id,
    u.nama AS nama_siswa,
    u.email,
    u.kelas,
    u.nis
  FROM users u
  WHERE u.peran = 'siswa'
  AND u.kelas = ?
  AND u.id_sekolah = ?
`;

      let params = [targetKelas, targetSekolah];

      if (sudahMengerjakanIds.length > 0) {
        query += ` AND u.id NOT IN (${placeholders})`;
        params = [...params, ...sudahMengerjakanIds];
      }

      query += ` ORDER BY u.nama ASC`;

      const [belumMengerjakan] = await pool.execute(query, params);

      // 4. Kelompokkan berdasarkan kelas (rombel) - untuk fleksibilitas jika ingin grup per kelas
      const groupedByKelas = {};
      for (const siswa of belumMengerjakan) {
        const kelas = siswa.kelas || 'Tidak Diketahui';
        if (!groupedByKelas[kelas]) {
          groupedByKelas[kelas] = [];
        }
        groupedByKelas[kelas].push({
          siswa_id: siswa.siswa_id,
          nama: siswa.nama_siswa,
          email: siswa.email,
          nisn: siswa.nisn
        });
      }

     // 5. Kirim response
return res.json({
  success: true,
  data: {
    instrumen: {
      id: instrumen[0].id,
      judul: instrumen[0].judul,
      kelas_target: targetKelas
    },
    total_belum_mengerjakan: belumMengerjakan.length,
    per_rombel: groupedByKelas,
    daftar_siswa: belumMengerjakan.map(s => ({
      siswa_id: s.siswa_id,
      nama: s.nama_siswa,   
      email: s.email,
      nisn: s.nis || '-',
      kelas: s.kelas
    }))
  }
});
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: 'Gagal mengambil data siswa yang belum mengerjakan'
      });
    }
  }
);

module.exports = router;
