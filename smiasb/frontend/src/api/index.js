import axios from 'axios';

const SESSION_EXPIRED_MESSAGE = 'Sesi Anda telah berakhir, silakan login kembali.';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 15000,
});

// Tambah token ke setiap request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('smiasb_token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401 - logout otomatis
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const requestUrl = err.config?.url || '';
      const isAuthRequest = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register');

      localStorage.removeItem('smiasb_token');
      localStorage.removeItem('smiasb_user');

      if (!isAuthRequest) {
        localStorage.setItem('smiasb_session_message', SESSION_EXPIRED_MESSAGE);

        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject(err);
  }
);

export default api;

// ============================================================
// Auth
// ============================================================
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  googleLogin: (data) => api.post('/auth/google-login', data),
  register: (data) => api.post('/auth/register', data),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  resetPasswordOtp: (data) => api.post('/auth/reset-password-otp', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.put('/auth/change-password', data),
};

// ============================================================
// Instrumen
// ============================================================
export const instrumenAPI = {
  getAll: (params) => api.get('/instrumen', { params }),

  getById: (id) => api.get(`/instrumen/${id}`),

  create: (data) =>
    api.post('/instrumen', data, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }),

  update: (id, data) =>
    api.put(`/instrumen/${id}`, data, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }),

  delete: (id) => api.delete(`/instrumen/${id}`),

  download: (id) =>
    api.get(`/instrumen/${id}/download`, {
      responseType: 'blob',
    }),

  patchBatasWaktu: (id, data) =>
    api.patch(`/instrumen/${id}/batas-waktu`, data),

  duplicateToClass: (id, data) =>
    api.post(`/instrumen/${id}/duplicate-to-class`, data),

  // ============================================================
  // Import Word - Preview
  // Upload file .docx lalu backend membaca isi Word,
  // memecah menjadi soal, mengambil gambar, tabel, dan tipe soal.
  // Belum menyimpan ke database.
  // ============================================================
  previewImportWord: (id, formData) =>
    api.post(`/instrumen/${id}/import-word/preview`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000,
    }),

  previewImportExcel: (id, formData) =>
    api.post(`/instrumen/${id}/import-excel/preview`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000,
    }),

  uploadImportWordImage: (id, formData) =>
    api.post(`/instrumen/${id}/import-word/upload-image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000,
    }),

  // ============================================================
  // Import Word - Save
  // Menyimpan hasil preview soal ke database.
  // Body:
  // {
  //   soal_preview: [...]
  // }
  // ============================================================
  saveImportWord: (id, data) =>
    api.post(`/instrumen/${id}/import-word/save`, data, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    }),

  // ============================================================
  // Reset semua soal pada instrumen
  // Dipakai kalau ingin menghapus soal hasil import/manual
  // sebelum import ulang.
  // ============================================================
  resetSoal: (id) =>
    api.delete(`/instrumen/${id}/reset-soal`),
};

// ============================================================
// Bank Soal
// ============================================================
export const bankSoalAPI = {
  getSummary: (params) => api.get('/bank-soal/summary', { params }),

  getList: (params) => api.get('/bank-soal', { params }),

  getDetail: (id, params) => api.get(`/bank-soal/${id}`, { params }),

  useToInstrumen: (instrumenId, bankSoalIds, options = {}) =>
    api.post('/bank-soal/use', {
      instrumen_id: instrumenId,
      bank_soal_ids: bankSoalIds,
      ...options,
    }),

  delete: (id) => api.delete(`/bank-soal/${id}`),
};

// ============================================================
// Users
// ============================================================
export const userAPI = {
  getAll: (params) => api.get('/users', { params }),

  getById: (id) => api.get(`/users/${id}`),

  create: (data) => api.post('/users', data),

  update: (id, data) => api.put(`/users/${id}`, data),

  toggle: (id) => api.patch(`/users/${id}/toggle`),

  editPassword: (id, password) =>
    api.patch(`/users/${id}/password`, { password }),

  getPasswordResetRequests: () => api.get('/users/password-reset-requests'),

  resolvePasswordResetRequest: (id) =>
    api.patch(`/users/password-reset-requests/${id}/resolve`),

  delete: (id) => api.delete(`/users/${id}`),
};

// ============================================================
// Sekolah
// ============================================================
export const sekolahAPI = {
  getAll: () => api.get('/sekolah'),

  getById: (id) => api.get(`/sekolah/${id}`),

  create: (data) => api.post('/sekolah', data),

  update: (id, data) => api.put(`/sekolah/${id}`, data),

  updateStatus: (id, status) => api.patch(`/sekolah/${id}/status`, status ? { status } : {}),

  delete: (id) => api.delete(`/sekolah/${id}`),
};

// ============================================================
// Super Admin
// ============================================================
export const superAdminAPI = {
  getAdminSekolah: (params) => api.get('/super-admin/admin-sekolah', { params }),

  createAdminSekolah: (data) => api.post('/super-admin/admin-sekolah', data),

  updateAdminSekolah: (id, data) => api.put(`/super-admin/admin-sekolah/${id}`, data),

  updateAdminSekolahStatus: (id, status) =>
    api.patch(`/super-admin/admin-sekolah/${id}/status`, status ? { status } : {}),

  resetAdminSekolahPassword: (id, password_baru) =>
    api.patch(`/super-admin/admin-sekolah/${id}/reset-password`, { password_baru }),

  getGuru: (params) => api.get('/super-admin/guru', { params }),

  getGuruDetail: (id) => api.get(`/super-admin/guru/${id}`),

  getSiswa: (params) => api.get('/super-admin/siswa', { params }),

  getSiswaDetail: (id) => api.get(`/super-admin/siswa/${id}`),

  getSiswaKelasSummary: (params) => api.get('/super-admin/siswa/kelas-summary', { params }),

  getInstrumen: (params) => api.get('/super-admin/instrumen', { params }),

  getInstrumenDetail: (id) => api.get(`/super-admin/instrumen/${id}`),

  getMonitoring: (params) => api.get('/super-admin/monitoring', { params }),

  getLaporanGlobal: (params) => api.get('/super-admin/laporan', { params }),

  exportLaporanExcel: (params) =>
    api.get('/super-admin/laporan/export-excel', {
      params,
      responseType: 'blob',
    }),
};

// ============================================================
// Chatbot
// ============================================================
export const chatbotAPI = {
  send: (pesan, history, options = {}) =>
    api.post('/chatbot/send', { pesan, history, ...options }),

  getHistory: () => api.get('/chatbot/history'),

  clearHistory: () => api.delete('/chatbot/history'),
};

// ============================================================
// Laporan
// ============================================================
export const laporanAPI = {
  dashboard: (params) => api.get('/laporan/dashboard', { params }),

  instrumen: () => api.get('/laporan/instrumen'),

  dashboardFull: () => api.get('/laporan/dashboard-full'),

  superAdminDashboard: (params) => api.get('/laporan/super-admin-dashboard', { params }),

  chatbotSiswa: (params) => api.get('/laporan/chatbot-siswa', { params }),

  chatbotSiswaTopSiswa: (params) => api.get('/laporan/chatbot-siswa/top-siswa', { params }),

  chatbotSiswaTopPertanyaan: (params) => api.get('/laporan/chatbot-siswa/top-pertanyaan', { params }),

  chatbotSiswaDetail: (id, params) => api.get(`/laporan/chatbot-siswa/${id}`, { params }),
};
