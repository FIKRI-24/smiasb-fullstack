const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { pool } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { canAccessInstrumen, isInstrumenOpenForWork, isSiswa } = require('../utils/accessControl');

// ================================
// 🔑 API KEY GEMINI
// Isi GEMINI_API_KEY di file .env backend
// ================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ================================
// 🧠 MODEL GEMINI
// Default: gemini-2.5-flash
// Bisa dioverride lewat GEMINI_MODEL di .env
// ================================
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
let chatHistoryColumnsCache = null;
let chatbotCacheReady = null;

// ================================
// 🧠 SYSTEM PROMPT
// ================================
const SYSTEM_PROMPT = `Kamu adalah ASBA (Asisten Belajar Adabiah), chatbot asisten pembelajaran cerdas untuk SMP Adabiah Padang, Sumatera Barat.

Tugasmu:
1. Membantu guru dan siswa memahami instrumen penilaian HOTS, Literasi, dan Numerasi
2. Menjelaskan cara menggunakan Sistem Manajemen Instrumen Assessment (SMIA)
3. Memberikan contoh soal HOTS, Literasi, atau Numerasi bila diminta
4. Membantu memahami kurikulum Merdeka terkait asesmen
5. Menjawab pertanyaan seputar pembelajaran di SMP
6. Mengarahkan pertanyaan di luar pendidikan kembali ke konteks pembelajaran, instrumen, asesmen, atau penggunaan SMIA

Aturan menjawab:
- Gunakan bahasa Indonesia yang ramah, sopan, dan mudah dipahami
- Jawaban singkat dan padat (2-5 kalimat), kecuali jika pengguna meminta penjelasan panjang
- Jika tidak tahu, akui dengan jujur dan sarankan mencari sumber lain
- Jangan memberikan jawaban, kunci jawaban, atau isi spesifik soal dari Bank Soal/instrumen yang tersimpan di sistem
- Jika pengguna meminta isi/kunci soal yang tersimpan, tolak dengan sopan dan arahkan untuk belajar konsep, latihan soal baru, atau cara menggunakan fitur secara benar
- Jika pertanyaan tidak berkaitan dengan pendidikan, jawab singkat bahwa kamu fokus pada pembelajaran lalu tawarkan bantuan seputar HOTS, Literasi, Numerasi, instrumen, atau Bank Soal`;


// ================================
// 🧩 NLP: INTENT DETECTION
// Deteksi maksud pengguna sebelum dikirim ke AI
// ================================
const intents = [
  {
    name: 'petunjuk_siswa',
    patterns: [
      /petunjuk.*(siswa|penggunaan sistem|sistem)/i,
      /panduan.*(siswa|penggunaan sistem|sistem)/i,
      /cara.*(pakai|menggunakan).*(sistem|smia|smiasb)/i,
      /mulai.*sebagai siswa/i
    ],
    response: () => [
      'Berikut petunjuk penggunaan sistem untuk siswa:',
      '1. Masuk menggunakan akun siswa yang sudah terdaftar.',
      '2. Buka menu Instrumen untuk melihat daftar instrumen aktif sesuai kelas Anda.',
      '3. Pilih instrumen yang tersedia, lalu baca judul, mata pelajaran, dan informasi pengerjaan.',
      '4. Klik kerjakan, jawab setiap soal dengan teliti, dan periksa kembali sebelum mengumpulkan.',
      '5. Setelah submit, ikuti arahan guru untuk melihat pembahasan atau tindak lanjut.',
      'Jika bingung pada materi, tanyakan konsepnya kepada saya tanpa meminta kunci jawaban soal.'
    ].join('\n')
  },
  {
    name: 'salam',
    patterns: [/^(halo|hai|hi|hello|selamat pagi|selamat siang|selamat sore|selamat malam|assalamualaikum|assalam)/i],
    response: () => "Halo! Saya ASBA, asisten belajar Adabiah 👋. Ada yang bisa saya bantu hari ini?"
  },
  {
    name: 'terima_kasih',
    patterns: [/terima kasih|makasih|thanks|thank you|thx/i],
    response: () => "Sama-sama! Senang bisa membantu 😊. Ada lagi yang ingin ditanyakan?"
  },
  {
    name: 'siapa_kamu',
    patterns: [/siapa (kamu|anda|kau)|apa itu asba|perkenalkan dirimu|kamu (siapa|apa)/i],
    response: () => "Saya adalah ASBA (Asisten Belajar Adabiah), chatbot cerdas untuk membantu guru dan siswa SMP Adabiah Padang. Saya bisa membantu seputar pembelajaran, penilaian HOTS, dan kurikulum Merdeka!"
  },
  {
    name: 'bantuan',
    patterns: [/^(tolong|help|bantuan|bisa apa|apa yang bisa|fitur apa)/i],
    response: () => "Saya bisa membantu Anda dengan:\n• 📚 Penjelasan materi pelajaran\n• 📝 Contoh soal HOTS, Literasi, Numerasi\n• 🏫 Informasi kurikulum Merdeka\n• 🖥️ Cara penggunaan sistem SMIA\n• 💬 Pertanyaan umum lainnya\n\nSilakan tanyakan apa saja!"
  },
  {
    name: 'bye',
    patterns: [/^(bye|dadah|sampai jumpa|selamat tinggal|pamit|keluar)/i],
    response: () => "Sampai jumpa! Semoga hari Anda menyenangkan 😊. Jangan sungkan untuk kembali bertanya ya!"
  }
];

/**
 * Deteksi intent dari pesan pengguna
 */
function detectIntent(pesan) {
  const trimmed = pesan.trim();
  for (const intent of intents) {
    for (const pattern of intent.patterns) {
      if (pattern.test(trimmed)) {
        return { matched: true, response: intent.response() };
      }
    }
  }
  return { matched: false, response: null };
}

function isBankSoalLeakRequest(pesan = '') {
  const text = pesan.toLowerCase();
  const mentionsStoredQuestion = /(bank soal|soal.*tersimpan|instrumen.*tersimpan|soal.*di sistem|soal.*kelas|soal.*ujian|soal.*aktif)/i.test(text);
  const asksAnswer = /(jawaban|kunci|pembahasan|isi soal|bocorkan|lihat soal|tampilkan soal|nomor berapa|pilihan yang benar|benar nya|benarnya)/i.test(text);

  return mentionsStoredQuestion && asksAnswer;
}

function isLikelyEducationTopic(pesan = '') {
  const text = pesan.toLowerCase();
  return /(belajar|pendidikan|sekolah|siswa|guru|materi|pelajaran|matematika|bahasa indonesia|bahasa inggris|ipa|ips|pkn|agama|seni budaya|pjok|prakarya|sains|biologi|fisika|kimia|lingkungan|polusi|pencemaran|udara|air|tanah|emisi|industri|kendaraan|kesehatan|penyakit|pernapasan|masyarakat|artikel|teks|stimulus|hots|literasi|numerasi|asesmen|assessment|instrumen|soal|bank soal|kurikulum|merdeka|nilai|kelas|ujian|tugas|smia|smiasb|cara pakai|penggunaan sistem)/i.test(text);
}

function isSmallTalk(pesan = '') {
  return /^(halo|hai|hi|hello|selamat|assalam|terima kasih|makasih|thanks|bye|dadah)/i.test(pesan.trim());
}

function hasEducationalHistoryContext(history) {
  if (!Array.isArray(history)) return false;
  return history
    .filter(item => item?.dari === 'user')
    .slice(-4)
    .some(item => isLikelyEducationTopic(item?.teks || ''));
}

function getOutOfScopeResponse() {
  return 'Saya fokus membantu pembelajaran dan penggunaan sistem SMIA. Mari kita arahkan ke hal pendidikan: saya bisa bantu menjelaskan HOTS, Literasi, Numerasi, cara membuat atau mengerjakan instrumen, serta penggunaan Bank Soal tanpa membocorkan isi/kunci soal yang tersimpan.';
}

function getBankSoalSafeResponse() {
  return 'Maaf, saya tidak bisa menampilkan isi, kunci jawaban, atau jawaban dari Bank Soal/instrumen yang tersimpan. Saya bisa membantu menjelaskan konsep materinya, memberi contoh soal baru yang setara, atau memandu cara menggunakan fitur Bank Soal dengan benar.';
}

function normalizeCachePrompt(pesan = '') {
  return String(pesan || '')
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:"'`()[\]{}<>/\\|@#$%^&*_+=~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCachePromptHash(normalizedPrompt) {
  return crypto
    .createHash('sha256')
    .update(normalizedPrompt)
    .digest('hex');
}

function hasChatHistoryContext(history) {
  return Array.isArray(history) && history.some(item => item?.dari === 'user');
}

function isTimeSensitivePrompt(pesan = '') {
  return /(sekarang|saat ini|hari ini|besok|kemarin|minggu ini|bulan ini|tahun ini|terbaru|terkini|aktual|update|tanggal|jam berapa|pukul berapa|jadwal|deadline|batas waktu|sedang aktif|masih aktif|dibuka|ditutup)/i.test(pesan);
}

function isUserOrDatabaseDependentPrompt(pesan = '') {
  return /(nilai saya|nilaiku|nilai ku|tugas saya|kelasku|kelas saya|akun saya|profil saya|riwayat|nis|email|password|instrumen aktif|soal aktif|instrumen yang aktif|soal yang aktif|instrumen apa.*aktif|soal apa.*aktif|daftar siswa|jumlah siswa|daftar guru|jumlah guru|siapa saja siswa|siapa saja guru)/i.test(pesan);
}

function isContextDependentPrompt(pesan = '') {
  return /\b(ini|itu|tersebut|tadi|sebelumnya|lanjut|lanjutkan|jelaskan lagi|maksudnya|di atas|soal ini|soal tadi|instrumen ini|pertanyaan ini|jawaban ini|materi ini|nomor ini)\b/i.test(pesan);
}

function isCacheablePrompt(pesan = '', history = [], instrumenId = null) {
  const normalizedPrompt = normalizeCachePrompt(pesan);

  if (normalizedPrompt.length < 10 || normalizedPrompt.length > 300) return false;
  if (hasChatHistoryContext(history) && isContextDependentPrompt(pesan)) return false;
  if (instrumenId && isContextDependentPrompt(pesan)) return false;
  if (isSmallTalk(pesan)) return false;
  if (isBankSoalLeakRequest(pesan)) return false;
  if (!isLikelyEducationTopic(pesan)) return false;
  if (isTimeSensitivePrompt(pesan)) return false;
  if (isUserOrDatabaseDependentPrompt(pesan)) return false;

  return true;
}

function isCacheableGeminiAnswer(text = '') {
  const answer = String(text || '').trim();

  if (answer.length < 20) return false;
  if (isChatbotErrorResponse(answer)) return false;
  if (/(kunci jawaban|jawaban nomor|isi soal tersimpan|bank soal tersimpan|api key|gagal terhubung)/i.test(answer)) return false;

  return true;
}

async function ensureChatbotCacheTable() {
  if (chatbotCacheReady === true) return true;

  try {
    await pool.execute('SELECT 1 FROM chatbot_cache LIMIT 1');
    chatbotCacheReady = true;
    return true;
  } catch {
    // Tabel belum ada atau belum bisa diakses, lanjut coba buat otomatis.
  }

  try {
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS chatbot_cache (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        normalized_prompt_hash CHAR(64) NOT NULL,
        normalized_prompt TEXT NOT NULL,
        balasan MEDIUMTEXT NOT NULL,
        model VARCHAR(80) NULL,
        hit_count INT NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        expires_at DATETIME NULL,
        last_hit_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_chatbot_cache_prompt_hash (normalized_prompt_hash),
        KEY idx_chatbot_cache_expires (expires_at),
        KEY idx_chatbot_cache_last_hit (last_hit_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    chatbotCacheReady = true;
  } catch (err) {
    console.error('Chatbot cache init error:', err.message);
    chatbotCacheReady = false;
  }

  return chatbotCacheReady;
}

async function getCachedGeminiResponse(normalizedPrompt) {
  if (!normalizedPrompt || !(await ensureChatbotCacheTable())) return null;

  try {
    const promptHash = getCachePromptHash(normalizedPrompt);
    const [rows] = await pool.execute(
      `SELECT id, balasan
       FROM chatbot_cache
       WHERE normalized_prompt_hash = ?
         AND normalized_prompt = ?
         AND is_active = 1
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [promptHash, normalizedPrompt]
    );

    if (rows.length === 0) return null;

    await pool.execute(
      `UPDATE chatbot_cache
       SET hit_count = hit_count + 1, last_hit_at = NOW()
       WHERE id = ?`,
      [rows[0].id]
    );

    return rows[0].balasan;
  } catch (err) {
    console.error('Chatbot cache read error:', err.message);
    return null;
  }
}

async function saveGeminiResponseToCache(normalizedPrompt, balasan) {
  if (!normalizedPrompt || !isCacheableGeminiAnswer(balasan) || !(await ensureChatbotCacheTable())) return;

  try {
    const promptHash = getCachePromptHash(normalizedPrompt);
    await pool.execute(
      `INSERT INTO chatbot_cache
        (normalized_prompt_hash, normalized_prompt, balasan, model, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 90 DAY), NOW(), NOW())
       ON DUPLICATE KEY UPDATE
        normalized_prompt = VALUES(normalized_prompt),
        balasan = VALUES(balasan),
        model = VALUES(model),
        expires_at = VALUES(expires_at),
        is_active = 1,
        updated_at = NOW()`,
      [promptHash, normalizedPrompt, balasan, GEMINI_MODEL]
    );
  } catch (err) {
    console.error('Chatbot cache write error:', err.message);
  }
}

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

function isChatbotErrorResponse(text = '') {
  return /kesalahan|gagal terhubung|bermasalah|tidak valid|terlalu banyak permintaan|api key/i.test(String(text || ''));
}

async function resolveChatInstrumenId(user, rawInstrumenId) {
  const instrumenId = Number(rawInstrumenId || 0);
  if (!isSiswa(user)) return null;

  if (Number.isInteger(instrumenId) && instrumenId > 0) {
    const access = await canAccessInstrumen(user, instrumenId, 'view');
    if (access.ok) return instrumenId;
  }

  if (!user?.id_sekolah || !user?.kelas) return null;

  const [rows] = await pool.execute(
    `SELECT *
     FROM instrumen
     WHERE id_sekolah = ?
       AND kelas = ?
       AND status = 'aktif'
     ORDER BY created_at DESC
     LIMIT 5`,
    [user.id_sekolah, user.kelas]
  );

  const openRows = rows.filter(isInstrumenOpenForWork);
  return openRows.length === 1 ? openRows[0].id : null;
}

// ================================
// 🔧 NLP: Proses kalimat promtp AI
// ================================
const singkatanMap = {
  'gk': 'tidak', 'ga': 'tidak', 'gak': 'tidak', 'ngga': 'tidak',
  'yg': 'yang', 'dgn': 'dengan', 'utk': 'untuk', 'krn': 'karena',
  'dr': 'dari', 'pd': 'pada', 'spy': 'supaya', 'bgt': 'banget',
  'sdh': 'sudah', 'blm': 'belum', 'lg': 'lagi', 'aj': 'saja',
  'jg': 'juga', 'tp': 'tapi', 'ttg': 'tentang', 'bs': 'bisa',
  'sm': 'sama', 'nih': '', 'dong': '', 'deh': '', 'sih': '',
  'kalo': 'kalau', 'gimana': 'bagaimana', 'gmn': 'bagaimana',
  'knpa': 'kenapa', 'knp': 'kenapa', 'mksd': 'maksud',
  'trims': 'terima kasih', 'mksh': 'terima kasih',
  'brp': 'berapa', 'hrs': 'harus', 'msh': 'masih'
};

function preprocessTeks(teks) {
  let hasil = teks.toLowerCase().trim();
  hasil = hasil.split(' ').map(kata => singkatanMap[kata] || kata).join(' ');
  hasil = hasil.replace(/(.)\1{2,}/g, '$1$1');
  hasil = hasil.replace(/\s+/g, ' ').trim();
  return hasil.charAt(0).toUpperCase() + hasil.slice(1);
}


// ================================
// 🚀 CALL GEMINI AI
// ================================
async function callGeminiAI(pesan, history = []) {
  if (!GEMINI_API_KEY) {
    return "API key Gemini belum dikonfigurasi. Isi GEMINI_API_KEY di file .env backend lalu restart server.";
  }

  try {
    const contents = [
      ...history.slice(-10).map(h => ({
        role: h.dari === 'user' ? 'user' : 'model',
        parts: [{ text: h.teks }]
      })),
      { role: "user", parts: [{ text: pesan }] }
    ];

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini HTTP Error:", response.status, data);

      if (response.status === 400) {
        return "Request ke Gemini tidak valid. Periksa model atau format pesan.";
      }
      if (response.status === 401 || response.status === 403) {
        return "API key Gemini tidak valid atau tidak memiliki akses. Silakan periksa GEMINI_API_KEY.";
      }
      if (response.status === 429) {
        return "Terlalu banyak permintaan. Silakan tunggu sebentar dan coba lagi.";
      }
      return `Maaf, layanan AI sedang bermasalah (Error ${response.status}). Silakan coba lagi.`;
    }

    if (data.error) {
      console.error("Gemini API Error:", data.error);
      return "Terjadi kesalahan pada layanan AI. Silakan coba beberapa saat lagi.";
    }

    const text = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || '')
      .join('')
      .trim();

    return text || "AI tidak memberikan respons. Silakan coba lagi.";

  } catch (err) {
    console.error("Gemini Fetch Error:", err.message);
    return "Gagal terhubung ke layanan AI. Periksa koneksi internet Anda.";
  }
}


// ================================
// 💬 POST /send — Kirim pesan ke chatbot
// ================================
router.post('/send', authenticate, async (req, res) => {
  const { pesan, history = [], instrumen_id } = req.body;

  if (!pesan || pesan.trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'Pesan tidak boleh kosong.'
    });
  }

  if (pesan.trim().length > 2000) {
    return res.status(400).json({
      success: false,
      message: 'Pesan terlalu panjang. Maksimal 2000 karakter.'
    });
  }

  try {
    let balasan = '';
    const pesanAsli = pesan.trim();

    // ── LANGKAH 1: Deteksi Intent (NLP lokal, tanpa API) ──
    const intentResult = detectIntent(pesanAsli);
    if (intentResult.matched) {
      balasan = intentResult.response;
    } else if (isBankSoalLeakRequest(pesanAsli)) {
      balasan = getBankSoalSafeResponse();
    } else if (!isLikelyEducationTopic(pesanAsli) && !hasEducationalHistoryContext(history) && !isSmallTalk(pesanAsli)) {
      balasan = getOutOfScopeResponse();
    } else {
      // ── LANGKAH 2: Preprocessing teks ──
      const pesanBersih = preprocessTeks(pesanAsli);

      // ── LANGKAH 3: Kirim ke Gemini AI ──
      const cacheAllowed = isCacheablePrompt(pesanAsli, history, instrumen_id);
      const normalizedCachePrompt = cacheAllowed ? normalizeCachePrompt(pesanAsli) : '';
      const cachedBalasan = cacheAllowed
        ? await getCachedGeminiResponse(normalizedCachePrompt)
        : null;

      if (cachedBalasan) {
        balasan = cachedBalasan;
      } else {
        balasan = await callGeminiAI(pesanBersih, history);

        if (cacheAllowed) {
          await saveGeminiResponseToCache(normalizedCachePrompt, balasan);
        }
      }
    }

    // ── LANGKAH 4: Simpan ke database ──
    const columns = await getChatHistoryColumns();
    const hasInstrumenColumn = columns.has('instrumen_id');
    const hasIsErrorColumn = columns.has('is_error');
    const chatInstrumenId = hasInstrumenColumn
      ? await resolveChatInstrumenId(req.user, instrumen_id)
      : null;
    const isError = isChatbotErrorResponse(balasan) ? 1 : 0;

    if (hasInstrumenColumn && hasIsErrorColumn) {
      await pool.execute(
        'INSERT INTO chat_history (user_id, instrumen_id, pesan, balasan, is_error, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
        [req.user.id, chatInstrumenId, pesanAsli, balasan, isError]
      );
    } else if (hasInstrumenColumn) {
      await pool.execute(
        'INSERT INTO chat_history (user_id, instrumen_id, pesan, balasan, created_at) VALUES (?, ?, ?, ?, NOW())',
        [req.user.id, chatInstrumenId, pesanAsli, balasan]
      );
    } else {
      await pool.execute(
        'INSERT INTO chat_history (user_id, pesan, balasan, created_at) VALUES (?, ?, ?, NOW())',
        [req.user.id, pesanAsli, balasan]
      );
    }

    return res.json({
      success: true,
      data: { balasan }
    });

  } catch (err) {
    console.error('Chatbot error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan sistem. Silakan coba lagi.'
    });
  }
});


// ================================
// 📜 GET /history — Ambil riwayat chat
// ================================
router.get('/history', authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const [rows] = await pool.execute(
      `SELECT id, pesan, balasan, created_at 
       FROM chat_history 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT ?`,
      [req.user.id, limit]
    );

    return res.json({
      success: true,
      data: rows.reverse()
    });

  } catch (err) {
    console.error('History error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server.'
    });
  }
});


// ================================
// 🗑 DELETE /history — Hapus riwayat chat
// ================================
router.delete('/history', authenticate, async (req, res) => {
  try {
    const [result] = await pool.execute(
      'DELETE FROM chat_history WHERE user_id = ?',
      [req.user.id]
    );

    return res.json({
      success: true,
      message: `Riwayat chat berhasil dihapus (${result.affectedRows} pesan).`
    });

  } catch (err) {
    console.error('Delete history error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server.'
    });
  }
});

module.exports = router;
