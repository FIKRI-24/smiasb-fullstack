const express = require('express');
const router = express.Router();
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
  return /(belajar|pendidikan|sekolah|siswa|guru|materi|pelajaran|matematika|bahasa indonesia|bahasa inggris|ipa|ips|pkn|agama|seni budaya|pjok|prakarya|hots|literasi|numerasi|asesmen|assessment|instrumen|soal|bank soal|kurikulum|merdeka|nilai|kelas|ujian|tugas|smia|smiasb|cara pakai|penggunaan sistem)/i.test(text);
}

function isSmallTalk(pesan = '') {
  return /^(halo|hai|hi|hello|selamat|assalam|terima kasih|makasih|thanks|bye|dadah)/i.test(pesan.trim());
}

function getOutOfScopeResponse() {
  return 'Saya fokus membantu pembelajaran dan penggunaan sistem SMIA. Mari kita arahkan ke hal pendidikan: saya bisa bantu menjelaskan HOTS, Literasi, Numerasi, cara membuat atau mengerjakan instrumen, serta penggunaan Bank Soal tanpa membocorkan isi/kunci soal yang tersimpan.';
}

function getBankSoalSafeResponse() {
  return 'Maaf, saya tidak bisa menampilkan isi, kunci jawaban, atau jawaban dari Bank Soal/instrumen yang tersimpan. Saya bisa membantu menjelaskan konsep materinya, memberi contoh soal baru yang setara, atau memandu cara menggunakan fitur Bank Soal dengan benar.';
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
    } else if (!isLikelyEducationTopic(pesanAsli) && !isSmallTalk(pesanAsli)) {
      balasan = getOutOfScopeResponse();
    } else {
      // ── LANGKAH 2: Preprocessing teks ──
      const pesanBersih = preprocessTeks(pesanAsli);

      // ── LANGKAH 3: Kirim ke Gemini AI ──
      balasan = await callGeminiAI(pesanBersih, history);
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
