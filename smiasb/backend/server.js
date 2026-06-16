require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');


const { testConnection } = require('./config/database');
const { getUploadRoot } = require('./utils/uploadPaths');

// Import routes
const authRoutes = require('./routes/auth');
const instrumenRoutes = require('./routes/instrumen');
const userRoutes = require('./routes/users');
const chatbotRoutes = require('./routes/chatbot');
const laporanRoutes = require('./routes/laporan');
const soalRoutes = require('./routes/soal');
const sekolahRoutes = require('./routes/sekolah');
const superAdminRoutes = require('./routes/super-admin');
const bankSoalRoutes = require('./routes/bank-soal');

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  'https://smiasb.adabiah.sch.id',
  'https://gallant-charm-production-6c69.up.railway.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files untuk upload
app.use('/uploads/users', express.static(path.join(getUploadRoot(), 'users')));
app.use('/uploads', express.static(getUploadRoot()));


app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'SMIASB API berjalan dengan baik',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});


app.use('/api/auth', authRoutes);
app.use('/api/instrumen', instrumenRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/laporan', laporanRoutes);
app.use('/api/soal', soalRoutes);
app.use('/api/sekolah', sekolahRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/bank-soal', bankSoalRoutes);


app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} tidak ditemukan.` });
});


app.use((err, req, res, next) => {
  console.error('Global error:', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'Ukuran file terlalu besar. Maksimal 10MB.' });
  }
  res.status(500).json({ success: false, message: 'Terjadi kesalahan internal server.' });
});


async function start() {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`\n🚀 SMIASB Backend berjalan di http://localhost:${PORT}`);
    console.log(`📋 Docs API: http://localhost:${PORT}/api/health`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
  });
}



start();
