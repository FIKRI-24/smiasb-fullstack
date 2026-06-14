const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticate } = require('../middleware/auth');

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
6. Menjawab pertanyaan umum lainnya dengan ramah dan membantu

Aturan menjawab:
- Gunakan bahasa Indonesia yang ramah, sopan, dan mudah dipahami
- Jawaban singkat dan padat (2-5 kalimat), kecuali jika pengguna meminta penjelasan panjang
- Jika tidak tahu, akui dengan jujur dan sarankan mencari sumber lain`;


// ================================
// 🧩 NLP: INTENT DETECTION
// Deteksi maksud pengguna sebelum dikirim ke AI
// ================================
const intents = [
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
  const { pesan, history = [] } = req.body;

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
    } else {
      // ── LANGKAH 2: Preprocessing teks ──
      const pesanBersih = preprocessTeks(pesanAsli);

      // ── LANGKAH 3: Kirim ke Gemini AI ──
      balasan = await callGeminiAI(pesanBersih, history);
    }

    // ── LANGKAH 4: Simpan ke database ──
    await pool.execute(
      'INSERT INTO chat_history (user_id, pesan, balasan, created_at) VALUES (?, ?, ?, NOW())',
      [req.user.id, pesanAsli, balasan]
    );

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
