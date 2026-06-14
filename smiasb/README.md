# SMIASB - Sistem Manajemen Instrumen Assessment Berbasis Web

SMIASB adalah aplikasi web untuk mengelola instrumen assessment, pengerjaan siswa, monitoring hasil, dan laporan penelitian. Sistem saat ini sudah mendukung multi sekolah dengan pemisahan akses berdasarkan role dan `id_sekolah`.

Proyek ini dibuat untuk kebutuhan skripsi dan implementasi/pilot penggunaan instrumen assessment pada beberapa sekolah.

## Ringkasan Sistem

Role utama:

| Role | Fungsi Utama |
| --- | --- |
| `super_admin` | Mengelola semua sekolah, admin sekolah, guru, siswa, instrumen, monitoring global, dan laporan global. |
| `admin_sekolah` | Mengelola data sekolahnya sendiri, guru, siswa, instrumen sekolah, laporan, dan monitoring. |
| `guru` | Membuat instrumen, import soal dari Word, mengelola soal, melihat monitoring, dan laporan instrumen yang dibuat. |
| `siswa` | Melihat instrumen aktif sesuai kelas dan mengerjakan assessment. |

Fitur utama:

- Multi sekolah berbasis `id_sekolah`.
- Login JWT dan route guard berbasis role.
- Dashboard admin sekolah/guru/siswa.
- Dashboard global super admin.
- Kelola sekolah.
- Kelola admin sekolah.
- Kelola guru per sekolah.
- Kelola siswa per sekolah dan kelas.
- Kelola instrumen per sekolah.
- Import Word untuk soal.
- Preview dan simpan hasil import Word.
- Editor soal manual.
- Pengerjaan instrumen oleh siswa.
- Scoring otomatis.
- Monitoring hasil siswa.
- Monitoring global super admin.
- Laporan admin/guru.
- Laporan global super admin.
- Export Excel laporan global.
- Chatbot ASBA.
- Profil dan ganti password.

## Struktur Proyek

```text
smiasb/
  backend/
    config/
      database.js
    middleware/
      auth.js
    migrations/
      20260607_001_multi_sekolah_tahap1.sql
      20260607_002_role_login_multi_sekolah.sql
    routes/
      auth.js
      chatbot.js
      instrumen.js
      laporan.js
      sekolah.js
      soal.js
      super-admin.js
      users.js
    scripts/
      test-word-import.js
    uploads/
    utils/
      accessControl.js
    server.js
    package.json

  frontend/
    src/
      api/
        index.js
      components/
        Layout.jsx
      context/
        AuthContext.jsx
      pages/
        AdminSekolahPage.jsx
        ChatbotPage.jsx
        Dashboard.jsx
        GuruPage.jsx
        InstrumenPage.jsx
        KerjakanSoalPage.jsx
        LaporanPage.jsx
        LoginPage.jsx
        MonitoringListPage.jsx
        MonitoringPage.jsx
        PenggunaPage.jsx
        ProfilPage.jsx
        RegisterPage.jsx
        SekolahPage.jsx
        SiswaPage.jsx
        SuperAdminDashboard.jsx
        SuperAdminInstrumenPage.jsx
        SuperAdminLaporanPage.jsx
        SuperAdminMonitoringPage.jsx
      App.jsx
      index.css
      main.jsx
    package.json
    vite.config.js
```

## Alur Penggunaan

### Super Admin

1. Login sebagai `super_admin`.
2. Buka Dashboard Global untuk melihat ringkasan lintas sekolah.
3. Kelola data sekolah.
4. Kelola admin sekolah untuk masing-masing sekolah.
5. Pantau data guru, siswa, dan instrumen seluruh sekolah.
6. Buka Monitoring Global untuk melihat progres pengerjaan instrumen.
7. Buka Laporan Global untuk rekap nilai, ketuntasan, instrumen, siswa, analisis tipe soal, rekomendasi, dan export Excel.

### Admin Sekolah

1. Login sebagai `admin_sekolah`.
2. Mengelola pengguna di sekolahnya sendiri.
3. Melihat instrumen, laporan, dan monitoring yang terscope ke sekolahnya.
4. Tidak bisa mengakses data sekolah lain.

### Guru

1. Login sebagai `guru`.
2. Membuat instrumen.
3. Import soal dari Word atau menambah soal manual.
4. Mengaktifkan instrumen.
5. Melihat monitoring hasil siswa pada instrumen yang dibuat.
6. Melihat laporan/statistik instrumen.

### Siswa

1. Login sebagai `siswa`.
2. Melihat instrumen aktif sesuai sekolah dan kelas.
3. Mengerjakan instrumen.
4. Melihat hasil sesuai alur sistem.

## Setup Backend

Masuk ke folder backend:

```bash
cd smiasb/backend
npm install
```

Buat file `.env`:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=smiasb_db
JWT_SECRET=ganti_dengan_secret_yang_kuat
GEMINI_API_KEY=isi_jika_menggunakan_chatbot_ai
GEMINI_MODEL=gemini-2.5-flash
NODE_ENV=development
```

Jalankan backend:

```bash
npm run dev
```

Atau mode production:

```bash
npm start
```

Health check:

```text
GET http://localhost:5000/api/health
```

## Setup Database

Gunakan database MySQL/MariaDB dengan nama default:

```sql
CREATE DATABASE smiasb_db;
```

Jika database lama sudah ada, jalankan migration multi sekolah secara berurutan:

```sql
SOURCE smiasb/backend/migrations/20260607_001_multi_sekolah_tahap1.sql;
SOURCE smiasb/backend/migrations/20260607_002_role_login_multi_sekolah.sql;
```

Migration tahap 1 menambahkan tabel `sekolah` dan kolom `id_sekolah` pada data utama.

Migration tahap 2 menambahkan role `super_admin` dan `admin_sekolah`, serta seed akun super admin jika belum ada.

## Setup Frontend

Masuk ke folder frontend:

```bash
cd smiasb/frontend
npm install
npm run dev
```

Default Vite berjalan di:

```text
http://localhost:5173
```

Jika ingin build production:

```bash
npm run build
```

## Akun Default

Akun default tergantung data seed/migration yang sudah dijalankan.

| Role | Identifier | Catatan |
| --- | --- | --- |
| `super_admin` | `superadmin` | Dibuat oleh migration multi sekolah tahap 2 jika belum ada. |
| `admin_sekolah` | `admin@adabiah.sch.id` | Admin sekolah awal dari data lama. |

Segera ganti password default setelah login pertama.

## Route Frontend

### Super Admin

| Route | Halaman |
| --- | --- |
| `/super-admin/dashboard` | Dashboard Global |
| `/super-admin/sekolah` | Kelola Sekolah |
| `/super-admin/admin-sekolah` | Kelola Admin Sekolah |
| `/super-admin/guru` | Data Guru |
| `/super-admin/siswa` | Data Siswa |
| `/super-admin/instrumen` | Data Instrumen |
| `/super-admin/monitoring` | Monitoring Global |
| `/super-admin/monitoring/:instrumenId` | Detail Monitoring Global |
| `/super-admin/laporan` | Laporan Global |

### Admin Sekolah dan Guru

| Route | Halaman |
| --- | --- |
| `/dashboard` | Dashboard |
| `/instrumen` | Manajemen Instrumen |
| `/soal/:instrumenId` | Kelola Soal |
| `/monitoring` | Daftar Monitoring |
| `/monitoring/:instrumenId` | Detail Monitoring |
| `/laporan` | Laporan dan Statistik |
| `/chatbot` | Chatbot ASBA |
| `/profil` | Profil Saya |

### Siswa

| Route | Halaman |
| --- | --- |
| `/dashboard` | Dashboard Siswa |
| `/instrumen` | Instrumen Aktif |
| `/kerjakan/:instrumenId` | Kerjakan Instrumen |
| `/chatbot` | Chatbot ASBA |
| `/profil` | Profil Saya |

## Endpoint Backend Utama

Base URL:

```text
http://localhost:5000/api
```

### Auth

| Method | Endpoint | Akses | Deskripsi |
| --- | --- | --- | --- |
| POST | `/auth/register` | Public | Register siswa. |
| POST | `/auth/login` | Public | Login semua role. |
| POST | `/auth/logout` | Login | Logout. |
| GET | `/auth/me` | Login | Ambil profil login. |
| PUT | `/auth/change-password` | Login | Ganti password. |

### Sekolah

| Method | Endpoint | Akses | Deskripsi |
| --- | --- | --- | --- |
| GET | `/sekolah` | Super Admin | Daftar sekolah. |
| GET | `/sekolah/:id` | Super Admin | Detail sekolah. |
| POST | `/sekolah` | Super Admin | Tambah sekolah. |
| PUT | `/sekolah/:id` | Super Admin | Ubah sekolah. |
| PATCH | `/sekolah/:id/status` | Super Admin | Aktif/nonaktif sekolah. |
| DELETE | `/sekolah/:id` | Super Admin | Hapus sekolah jika aman. |

### Super Admin

| Method | Endpoint | Deskripsi |
| --- | --- | --- |
| GET | `/super-admin/admin-sekolah` | Daftar admin sekolah. |
| POST | `/super-admin/admin-sekolah` | Tambah admin sekolah. |
| PUT | `/super-admin/admin-sekolah/:id` | Ubah admin sekolah. |
| PATCH | `/super-admin/admin-sekolah/:id/status` | Aktif/nonaktif admin sekolah. |
| PATCH | `/super-admin/admin-sekolah/:id/reset-password` | Reset password admin sekolah. |
| GET | `/super-admin/guru` | Daftar guru lintas sekolah. |
| GET | `/super-admin/guru/:id` | Detail guru. |
| GET | `/super-admin/siswa` | Daftar siswa lintas sekolah. |
| GET | `/super-admin/siswa/kelas-summary` | Ringkasan siswa per kelas. |
| GET | `/super-admin/siswa/:id` | Detail siswa. |
| GET | `/super-admin/instrumen` | Daftar instrumen lintas sekolah. |
| GET | `/super-admin/instrumen/:id` | Detail instrumen. |
| GET | `/super-admin/monitoring` | Monitoring global instrumen. |
| GET | `/super-admin/laporan` | Laporan global. |
| GET | `/super-admin/laporan/export-excel` | Export Excel laporan global. |

Filter umum super admin:

```text
id_sekolah
jenis
status
kelas
guru
search
tanggal_mulai
tanggal_selesai
```

### Instrumen

| Method | Endpoint | Akses | Deskripsi |
| --- | --- | --- | --- |
| GET | `/instrumen` | Login | Daftar instrumen sesuai role dan sekolah. |
| GET | `/instrumen/:id` | Login | Detail instrumen. |
| GET | `/instrumen/:id/download` | Login | Download file instrumen. |
| POST | `/instrumen` | Admin Sekolah, Guru | Buat instrumen. |
| PUT | `/instrumen/:id` | Admin Sekolah, Guru | Ubah instrumen. |
| DELETE | `/instrumen/:id` | Admin Sekolah, Guru | Hapus instrumen. |
| DELETE | `/instrumen/:id/reset-soal` | Admin Sekolah, Guru | Reset semua soal pada instrumen. |
| PATCH | `/instrumen/:id/batas-waktu` | Admin Sekolah, Guru | Atur batas waktu. |
| POST | `/instrumen/:id/import-word/preview` | Admin Sekolah, Guru | Preview import Word. |
| POST | `/instrumen/:id/import-word/upload-image` | Admin Sekolah, Guru | Upload gambar hasil import Word. |
| POST | `/instrumen/:id/import-word/save` | Admin Sekolah, Guru | Simpan soal hasil preview Word. |

### Soal dan Pengerjaan

| Method | Endpoint | Akses | Deskripsi |
| --- | --- | --- | --- |
| GET | `/soal/:instrumenId` | Login | Daftar soal sesuai akses. |
| POST | `/soal` | Admin Sekolah, Guru | Tambah soal manual. |
| PUT | `/soal/:id` | Admin Sekolah, Guru | Ubah soal. |
| DELETE | `/soal/:id` | Admin Sekolah, Guru | Hapus soal. |
| GET | `/soal/status/:instrumenId` | Siswa | Cek status pengerjaan siswa. |
| GET | `/soal/kerjakan/:instrumenId` | Siswa | Ambil soal untuk dikerjakan. |
| POST | `/soal/submit` | Siswa | Submit jawaban dan simpan hasil. |
| GET | `/soal/monitoring/:instrumenId` | Admin Sekolah, Guru, Super Admin | Detail monitoring hasil. |
| GET | `/soal/monitoring/:instrumenId/belum-mengerjakan` | Admin Sekolah, Guru, Super Admin | Daftar siswa belum mengerjakan. |

### Laporan

| Method | Endpoint | Akses | Deskripsi |
| --- | --- | --- | --- |
| GET | `/laporan/dashboard` | Login | Statistik dashboard sesuai role. |
| GET | `/laporan/instrumen` | Admin Sekolah, Guru | Statistik instrumen. |
| GET | `/laporan/dashboard-full` | Admin Sekolah, Guru | Laporan lengkap admin/guru. |
| GET | `/laporan/super-admin-dashboard` | Super Admin | Dashboard global lintas sekolah. |

### Pengguna, Profil, dan Foto

| Method | Endpoint | Akses | Deskripsi |
| --- | --- | --- | --- |
| GET | `/users` | Admin Sekolah | Daftar pengguna sekolah. |
| POST | `/users` | Admin Sekolah | Tambah pengguna sekolah. |
| GET | `/users/:id` | Login | Detail pengguna sesuai akses. |
| PUT | `/users/:id` | Login sesuai akses | Ubah profil/pengguna. |
| PATCH | `/users/:id/toggle` | Admin Sekolah | Aktif/nonaktif pengguna. |
| PATCH | `/users/:id/reset-password` | Admin Sekolah | Reset password pengguna. |
| DELETE | `/users/:id` | Admin Sekolah | Hapus pengguna. |
| POST | `/users/:id/upload-foto` | Login sesuai akses | Upload foto profil. |
| DELETE | `/users/:id/foto` | Login sesuai akses | Hapus foto profil. |
| GET | `/users/:id/foto` | Login | Ambil foto profil. |

### Chatbot

| Method | Endpoint | Akses | Deskripsi |
| --- | --- | --- | --- |
| POST | `/chatbot/send` | Login | Kirim pesan ke Chatbot ASBA. |
| GET | `/chatbot/history` | Login | Ambil riwayat chat. |
| DELETE | `/chatbot/history` | Login | Hapus riwayat chat. |

## Fitur Per Role

| Fitur | Super Admin | Admin Sekolah | Guru | Siswa |
| --- | --- | --- | --- | --- |
| Dashboard | Ya | Ya | Ya | Ya |
| Kelola sekolah | Ya | Tidak | Tidak | Tidak |
| Kelola admin sekolah | Ya | Tidak | Tidak | Tidak |
| Kelola guru | Ya | Ya | Tidak | Tidak |
| Kelola siswa | Ya | Ya | Tidak | Tidak |
| Kelola instrumen | Lihat global | Ya | Ya, miliknya | Tidak |
| Import Word | Tidak langsung | Ya | Ya | Tidak |
| Editor soal | Tidak langsung | Ya | Ya | Tidak |
| Kerjakan instrumen | Tidak | Tidak | Tidak | Ya |
| Monitoring instrumen | Global | Sekolah | Miliknya | Tidak |
| Laporan | Global | Sekolah | Miliknya | Tidak |
| Export Excel laporan global | Ya | Tidak | Tidak | Tidak |
| Chatbot ASBA | Tidak | Ya | Ya | Ya |
| Profil | Ya | Ya | Ya | Ya |

## Aturan Akses Multi Sekolah

- Semua data sekolah dipisahkan dengan `id_sekolah`.
- `super_admin` dapat melihat data lintas sekolah.
- `admin_sekolah` hanya dapat mengakses data pada sekolahnya sendiri.
- `guru` hanya dapat mengelola instrumen yang dibuat sendiri dan berada di sekolahnya.
- `siswa` hanya dapat mengerjakan instrumen aktif yang sesuai dengan sekolah dan kelasnya.
- Detail monitoring lama tetap digunakan untuk guru/admin dan juga direuse oleh super admin.

## Export Laporan Global

Endpoint:

```text
GET /api/super-admin/laporan/export-excel
```

Sheet Excel:

- `Ringkasan`
- `Rekap Per Sekolah`
- `Rekap Instrumen`
- `Rekap Siswa`
- `Analisis Tipe Soal`

Filter export mengikuti filter halaman Laporan Global:

- `id_sekolah`
- `jenis`
- `status`
- `kelas`
- `guru`
- `tanggal_mulai`
- `tanggal_selesai`
- `search`

## Testing Manual yang Disarankan

### Role dan Guard

| Skenario | Hasil yang Diharapkan |
| --- | --- |
| Super admin membuka `/super-admin/dashboard` | Berhasil. |
| Admin sekolah membuka `/super-admin/dashboard` | Ditolak atau redirect. |
| Guru membuka data sekolah lain | Ditolak. |
| Siswa membuka instrumen kelas lain | Ditolak. |
| Admin sekolah mengakses endpoint laporan global | HTTP 403. |
| Guru mengakses endpoint laporan global | HTTP 403. |
| Siswa mengakses endpoint laporan global | HTTP 403. |

### Alur Instrumen

| Skenario | Hasil yang Diharapkan |
| --- | --- |
| Guru membuat instrumen | Instrumen tersimpan. |
| Guru import Word preview | Soal terbaca di preview. |
| Guru menyimpan hasil preview | Soal masuk ke database. |
| Guru mengaktifkan instrumen | Siswa kelas terkait bisa melihat instrumen. |
| Siswa submit jawaban | Nilai dan hasil tersimpan. |
| Guru membuka monitoring | Hasil siswa dan analisis tampil. |

### Alur Super Admin

| Skenario | Hasil yang Diharapkan |
| --- | --- |
| Super admin membuka Data Instrumen | Instrumen semua sekolah tampil dengan pembeda sekolah. |
| Super admin membuka Monitoring Global | Monitoring seluruh sekolah tampil. |
| Super admin membuka Detail Monitoring | Detail memakai endpoint monitoring lama. |
| Super admin membuka Laporan Global | Ringkasan dan tabel rekap tampil. |
| Super admin export Excel | File `.xlsx` terunduh dengan sheet yang lengkap. |

## Verifikasi Teknis

Backend:

```bash
cd smiasb/backend
node --check routes/super-admin.js
node --check routes/soal.js
node --check server.js
```

Frontend:

```bash
cd smiasb/frontend
npm run build
```

Tes import Word:

```bash
cd smiasb/backend
npm run test:word-import
```

## Batasan Saat Ini

- Export PDF laporan global belum aktif.
- Retake/remedial siswa belum dibuat sebagai fitur khusus.
- Versioning instrumen setelah siswa mengerjakan belum tersedia.
- Audit log belum menjadi halaman penuh di UI.
- Automated test role/access belum tersedia.
- Import massal guru/siswa dari Excel belum tersedia.

## Rekomendasi Tahap Lanjutan

Prioritas pengembangan berikutnya:

1. Automated testing untuk role dan akses multi sekolah.
2. Audit log aktivitas di UI super admin.
3. Backup dan security hardening production.
4. Export PDF laporan global.
5. Import massal guru/siswa dari Excel.
6. Kebijakan retake/remedial dan versioning instrumen.

## Stack Teknologi

Frontend:

- React 18
- Vite
- React Router
- Axios
- Recharts
- xlsx
- lucide-react
- CSS custom

Backend:

- Node.js
- Express.js
- MySQL/MariaDB
- mysql2
- JWT
- bcryptjs
- multer
- mammoth
- cheerio
- xlsx
- express-validator

AI/Chatbot:

- Google Gemini API jika `GEMINI_API_KEY` tersedia.
- Fallback offline jika API tidak tersedia.

## Catatan Skripsi

Sistem ini dikembangkan dengan pendekatan R&D (Research and Development) menggunakan model SDLC Iterative.

Tahapan umum:

1. Requirement: analisis kebutuhan sistem.
2. Design and Development: perancangan dan pengembangan sistem.
3. Testing: pengujian fungsional dan akses role.
4. Implementation: penerapan pada lingkungan sekolah/pilot.

Dibuat oleh Fikri Arrahman.
