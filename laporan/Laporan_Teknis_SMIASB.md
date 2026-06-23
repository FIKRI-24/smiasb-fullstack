# Laporan Teknis Sistem Manajemen Instrumen Assessment Berbasis Web Terintegrasi Chatbot

**Nama sistem:** SMIASB

**Teknologi utama:** React, Node.js, Express.js, MySQL

Dokumen ini menjelaskan fitur sistem, alur kerja, package yang digunakan, serta logika backend dan frontend.

# 1. Pendahuluan

SMIASB adalah sistem manajemen instrumen assessment berbasis web yang digunakan untuk membantu sekolah mengelola instrumen penilaian, soal, pengerjaan siswa, pemantauan hasil, laporan, dan bantuan pembelajaran melalui chatbot. Sistem ini dirancang dengan pendekatan multi-role sehingga setiap jenis pengguna memiliki ruang kerja dan hak akses berbeda.

Secara umum sistem mendukung role super_admin, admin/admin_sekolah, guru, dan siswa. Super admin berfokus pada pengelolaan multi sekolah dan laporan global. Admin sekolah mengelola pengguna, instrumen, monitoring, dan laporan sekolah. Guru mengelola instrumen/soal serta memantau hasil. Siswa mengerjakan instrumen dan dapat menggunakan chatbot sebagai asisten pembelajaran.

Fitur chatbot berperan sebagai asisten pembelajaran yang membantu menjelaskan konsep HOTS, Literasi, Numerasi, penggunaan sistem, serta memberi panduan belajar tanpa membocorkan isi/kunci soal yang tersimpan di Bank Soal atau instrumen.

# 2. Arsitektur Sistem

Arsitektur sistem menggunakan pemisahan frontend dan backend. Frontend dibangun dengan React dan Vite, sedangkan backend memakai Node.js dan Express.js. Database menggunakan MySQL melalui mysql2/promise. Frontend berkomunikasi dengan backend melalui REST API berbasis JSON. Autentikasi memakai JWT; token dikirim melalui header Authorization: Bearer pada request yang membutuhkan login.

```
Browser / React Frontend
        |  Axios REST API + JWT Bearer Token
        v
Node.js / Express Backend
        |  Query SQL via mysql2/promise
        v
MySQL Database
        |
        +-- Integrasi eksternal: Google Identity Services, SMTP Email, Gemini API
```

| Lapisan | Teknologi | Peran |
| --- | --- | --- |
| Frontend | React, Vite, axios, react-router-dom | Menampilkan UI, mengelola state/session, memanggil API backend. |
| Backend | Node.js, Express.js | Menyediakan REST API, validasi request, autentikasi, business logic. |
| Database | MySQL | Menyimpan user, sekolah, instrumen, soal, hasil, jawaban, bank soal, chat, dan reset password. |
| Integrasi | Google, SMTP, Gemini API | Login Google guru, OTP email guru, dan chatbot AI. |

# 3. Struktur Folder Project

| Area | Folder/File | Fungsi |
| --- | --- | --- |
| Backend | backend/server.js | Entry point Express, konfigurasi CORS, static upload, mounting route API. |
| Backend | backend/config/database.js | Membuat pool koneksi MySQL dari environment variable. |
| Backend | backend/routes | Kumpulan route API: auth, users, instrumen, soal, laporan, chatbot, bank soal, sekolah, super-admin. |
| Backend | backend/middleware/auth.js | Middleware autentikasi JWT dan otorisasi role. |
| Backend | backend/utils/accessControl.js | Helper scope sekolah, role, dan akses instrumen. |
| Backend | backend/migrations | SQL migration untuk multi sekolah, role, normalisasi kelas, bank soal, dan chat history. |
| Frontend | frontend/src/App.jsx | Routing halaman dan PrivateRoute/PublicRoute berdasarkan role. |
| Frontend | frontend/src/api/index.js | Service axios dan daftar API client frontend. |
| Frontend | frontend/src/context/AuthContext.jsx | Manajemen session, token, user aktif, login/logout. |
| Frontend | frontend/src/pages | Halaman utama: Login, Dashboard, Instrumen, Soal, Kerjakan Soal, Monitoring, Laporan, Chatbot, Pengguna, Bank Soal, Super Admin. |
| Frontend | frontend/src/components/Layout.jsx | Layout aplikasi, sidebar, navigasi berbasis role, topbar. |

# 4. Package Backend

| Package | Fungsi dalam sistem |
| --- | --- |
| express | Framework server HTTP dan routing REST API. |
| mysql2 | Koneksi dan query MySQL dengan Promise API. |
| bcryptjs | Hashing dan verifikasi password. |
| jsonwebtoken | Pembuatan dan verifikasi JWT. |
| cors | Mengatur komunikasi frontend-backend lintas origin. |
| dotenv | Membaca konfigurasi environment dari file .env. |
| express-validator | Validasi request body pada endpoint tertentu. |
| multer | Upload file instrumen, gambar soal, foto user, dan asset import. |
| mammoth | Konversi file Word menjadi HTML pada fitur import Word. |
| xlsx | Membaca/menulis file Excel untuk import/export data. |
| nodemailer | Mengirim OTP reset password guru melalui SMTP. |
| google-auth-library | Memverifikasi Google ID token pada Login Google khusus guru. |
| node-fetch | Tersedia sebagai dependency untuk kebutuhan HTTP request; chatbot route menggunakan fetch runtime Node. |
| cheerio | Parsing HTML/DOM server-side, relevan untuk proses import/olah konten. |
| nodemon | Dev dependency untuk menjalankan server development dengan auto restart. |

# 5. Package Frontend

| Package | Fungsi dalam sistem |
| --- | --- |
| react dan react-dom | Membangun antarmuka pengguna berbasis komponen. |
| vite dan @vitejs/plugin-react | Development server dan build frontend. |
| react-router-dom | Routing halaman dan proteksi route berbasis role. |
| axios | HTTP client untuk komunikasi REST API ke backend. |
| lucide-react | Icon UI untuk menu, tombol, dan dashboard. |
| react-hot-toast | Notifikasi/toast untuk aksi pengguna. |
| recharts | Visualisasi chart pada halaman laporan/dashboard. |
| xlsx | Dukungan pengolahan/export spreadsheet pada sisi frontend bila dibutuhkan. |

# 6. Role dan Hak Akses Sistem

| Role | Tugas utama | Catatan akses |
| --- | --- | --- |
| super_admin | Mengelola sekolah, admin sekolah, data guru/siswa global, instrumen global, monitoring global, laporan global. | Memiliki panel khusus /super-admin dan dapat memakai route admin tertentu melalui middleware. |
| admin/admin_sekolah | Mengelola pengguna sekolah, instrumen, bank soal, monitoring, laporan, dan reset password siswa. | Role admin lama dinormalisasi menjadi admin_sekolah. Scope data dibatasi id_sekolah. |
| guru | Membuat dan mengelola instrumen/soal, import soal, melihat monitoring dan laporan. | Akun guru menggunakan email valid untuk login email/password, Google Login, dan OTP. |
| siswa | Login memakai NIS/username dan password, melihat instrumen aktif sesuai kelas, mengerjakan soal, menggunakan chatbot. | Siswa tidak diwajibkan memiliki email asli; reset password melalui admin sekolah. |

Middleware auth membaca JWT, mengambil ulang user dari tabel users, memastikan akun aktif, lalu menyimpan data user pada req.user. Fungsi authorize memeriksa role yang diizinkan dan tetap mendukung kompatibilitas role admin lama dengan admin_sekolah. Helper accessControl membatasi data berdasarkan id_sekolah, pemilik instrumen, role guru/siswa, status instrumen, serta kecocokan kelas siswa dengan instrumen.

# 7. Fitur Authentication

Login normal berada pada endpoint POST /auth/login. Frontend mengirim identifier dan password. Backend menerima identifier/email/nis, lalu menentukan pencarian berdasarkan apakah input mengandung @. Jika input bukan email, backend memprioritaskan NIS siswa atau email/username user lain. Password diverifikasi menggunakan bcrypt. Jika berhasil, backend membuat JWT dengan payload user standar dan frontend menyimpan token di localStorage melalui AuthContext.

- Login siswa: menggunakan NIS/username dan password. Kode backend mencari users.nis untuk peran siswa ketika identifier bukan email.
- Login admin sekolah: memakai akun yang disediakan sistem; secara teknis identifier tersimpan pada kolom email/username.
- Login guru: memakai email dan password. Email guru juga menjadi kunci untuk Google Login dan OTP.
- Login super_admin: memakai akun super admin dan diarahkan ke dashboard global.
- Endpoint /auth/me digunakan frontend untuk memvalidasi token dan mengambil ulang data user aktif.

| Endpoint Auth | Fungsi |
| --- | --- |
| POST /auth/register | Register siswa dengan nama, kelas, NIS, dan password. |
| POST /auth/login | Login normal semua role sesuai identifier/password. |
| POST /auth/google-login | Login Google khusus guru. |
| POST /auth/forgot-password | Memulai reset password guru OTP atau request reset siswa ke admin. |
| POST /auth/reset-password-otp | Reset password guru menggunakan OTP. |
| POST /auth/logout | Mencatat logout user. |
| GET /auth/me | Mengambil profil user dari token. |
| PUT /auth/change-password | Ganti password dari profil user login. |

# 8. Fitur Login dengan Google Khusus Guru

Login Google diterapkan sebagai endpoint terpisah sehingga tidak mengganggu login lama siswa, admin sekolah, atau super admin. Frontend memuat Google Identity Services menggunakan VITE_GOOGLE_CLIENT_ID, lalu tombol Google menghasilkan credential/ID token. Token ini dikirim ke backend pada endpoint POST /auth/google-login.

1. Guru klik tombol Login dengan Google pada halaman login.
2. Frontend menggunakan Google Client ID dari environment frontend.
3. Google mengembalikan credential/ID token.
4. Frontend mengirim credential ke backend.
5. Backend memverifikasi ID token menggunakan google-auth-library dan GOOGLE_CLIENT_ID.
6. Backend memeriksa email_verified dari payload Google.
7. Backend mengambil email payload Google, menormalisasi lowercase, lalu mencocokkan dengan users.email dan peran guru.
8. Jika user guru aktif ditemukan, backend membuat JWT sistem dengan format response login biasa.
9. Jika email tidak ditemukan, bukan guru, atau nonaktif, login ditolak dengan pesan akun guru belum terdaftar oleh admin sekolah.

Sistem tidak melakukan auto-register dari Google. Keputusan ini penting agar kontrol pembuatan akun tetap berada pada admin sekolah dan supaya akun siswa/admin tidak dapat masuk melalui Google. Verifikasi token harus dilakukan di backend karena frontend tidak dapat dipercaya sepenuhnya untuk menentukan validitas token atau role user.

# 9. Fitur Lupa Password Guru dengan OTP

Guru dapat melakukan reset password mandiri melalui OTP email. Endpoint /auth/forgot-password mendeteksi input email guru aktif, membuat OTP 6 digit, menyimpan hash OTP ke tabel password_reset_otps, lalu mengirim OTP melalui SMTP menggunakan nodemailer. Dalam mode development, jika SMTP belum tersedia dan RESET_OTP_CONSOLE aktif atau NODE_ENV bukan production, OTP dapat ditampilkan di terminal backend untuk testing lokal.

- OTP dibuat menggunakan crypto.randomInt dan disimpan sebagai hash SHA-256 berbasis user, OTP, dan JWT secret.
- OTP berlaku 10 menit, hanya dapat dipakai sekali, dan memiliki batas percobaan maksimal.
- Reset password guru memakai endpoint /auth/reset-password-otp.
- Password baru di-hash dengan bcrypt sebelum disimpan ke tabel users.
- Variabel environment terkait: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM, RESET_OTP_CONSOLE, NODE_ENV, JWT_SECRET.

# 10. Fitur Lupa Password Siswa

Siswa tidak menggunakan OTP email karena sistem tidak mewajibkan siswa memiliki email asli. Ketika siswa menekan lupa password dan memasukkan NIS/email yang cocok, backend mencatat permintaan ke tabel password_reset_requests. Admin sekolah kemudian melihat request tersebut pada halaman Pengguna dan dapat mengubah password siswa melalui fitur edit password. Setelah password diedit, request dapat ditandai selesai.

Alur ini mempertahankan fleksibilitas demo/operasional sekolah karena akun siswa cukup memakai NIS dan password tanpa email asli.

# 11. Fitur Manajemen Pengguna

Manajemen pengguna berada pada route /api/users dan halaman Pengguna. Admin sekolah dapat melihat daftar user sekolah, menambah guru/siswa/admin sekolah sesuai role yang tersedia, mengedit data user, mengaktifkan/nonaktifkan akun, menghapus akun, mengubah password guru/siswa, melihat permintaan reset password siswa, dan menandai request selesai.

- Guru wajib memiliki email valid. Email guru dipakai untuk login email/password, Login Google, dan OTP reset password.
- Email guru dicek duplikat terhadap user lain berdasarkan LOWER(email).
- Siswa tetap wajib NIS dan tidak wajib email asli.
- Admin/admin_sekolah tetap dapat memakai email/username dummy atau kosong sesuai kebutuhan sistem.
- NIS siswa yang sudah ada tidak dapat diubah; aturan ini menjaga identitas login siswa tetap stabil.

| Endpoint Users | Fungsi |
| --- | --- |
| GET /users | Daftar pengguna dengan filter role/search dan scope sekolah. |
| GET /users/password-reset-requests | Daftar request reset password siswa. |
| PATCH /users/password-reset-requests/:id/resolve | Menandai request reset password selesai. |
| GET /users/:id | Detail user. |
| POST /users | Tambah user. Guru wajib email valid; siswa wajib NIS. |
| PUT /users/:id | Edit profil/data user termasuk email guru. |
| PATCH /users/:id/toggle | Aktif/nonaktif user. |
| PATCH /users/:id/password | Edit password guru/siswa oleh admin. |
| DELETE /users/:id | Hapus user. |
| POST /users/:id/upload-foto | Upload foto profil. |

# 12. Fitur Manajemen Instrumen Assessment

Fitur instrumen berada pada route /api/instrumen dan halaman InstrumenPage. Sistem mendukung pembuatan instrumen dengan judul, deskripsi, jenis instrumen, mata pelajaran, kelas, target jumlah soal, status, upload file, dan batas waktu pengerjaan. Guru dan admin sekolah dapat mengelola instrumen sesuai hak akses, sedangkan siswa hanya melihat instrumen aktif sesuai kelas dan status aksesnya.

- Membuat, melihat, memperbarui, menghapus, dan mengunduh file instrumen.
- Mengatur status draft/aktif/nonaktif serta batas waktu pengerjaan.
- Menduplikasi instrumen ke kelas lain.
- Menghapus/reset semua soal dalam instrumen sekaligus menghapus jawaban dan hasil terkait.
- Import soal dari Word: backend memakai mammoth untuk convert Word ke HTML, memetakan teks/gambar/tabel, menghasilkan preview, lalu menyimpan soal hasil preview.
- Import soal dari Excel: backend menerima file .xlsx dan membuat preview sesuai format yang dikenali.
- Preview import dapat memuat layout block, stimulus, tabel pendukung, gambar, pilihan jawaban, tipe soal, dan laporan kualitas import.

| Endpoint Instrumen | Fungsi |
| --- | --- |
| GET /instrumen | Daftar instrumen sesuai role/scope. |
| GET /instrumen/:id | Detail instrumen dan soal. |
| POST /instrumen | Membuat instrumen baru. |
| PUT /instrumen/:id | Memperbarui instrumen. |
| DELETE /instrumen/:id | Menghapus instrumen. |
| PATCH /instrumen/:id/batas-waktu | Mengatur batas waktu. |
| POST /instrumen/:id/import-word/preview | Preview import Word. |
| POST /instrumen/:id/import-word/save | Simpan soal hasil preview Word. |
| POST /instrumen/:id/import-excel/preview | Preview import Excel. |
| POST /instrumen/:id/duplicate-to-class | Duplikasi instrumen ke kelas lain. |

# 13. Fitur Pengelolaan Soal dan Pengerjaan Siswa

Route /api/soal menangani CRUD soal, akses soal untuk siswa, submit jawaban, dan hasil/monitoring. Soal terhubung ke instrumen melalui instrumen_id. Siswa hanya dapat mengerjakan instrumen aktif yang sesuai kelas dan masih dalam waktu pengerjaan. Setelah submit, backend menghitung benar/salah, menyimpan jawaban_siswa, lalu menyimpan rekap hasil_siswa.

- Tipe soal yang ditemukan: pilihan_ganda, sebab_akibat, ganda_kompleks, benar_salah, menjodohkan.
- Soal dapat memiliki gambar, tabel pendukung, stimulus, pilihan jawaban, jawaban benar, tipe soal, bobot, dan metadata layout.
- Backend menghitung skor berdasarkan total benar dan bobot/total soal sesuai logic di route soal.
- Monitoring dapat menampilkan siswa sudah/belum mengerjakan, analisis butir, analisis tipe soal, dan rekomendasi.

# 14. Fitur Bank Soal

Fitur Bank Soal menggunakan tabel bank_soal yang dibuat melalui migration. Bank Soal menyimpan salinan soal per sekolah, termasuk sumber instrumen/soal, kelas, mata pelajaran, jenis instrumen, hash pertanyaan, konten soal, gambar, tabel, pilihan, jawaban, tipe soal, dan usage_count. Route /api/bank-soal mendukung daftar, ringkasan statistik, detail, penggunaan ulang soal ke instrumen, dan soft delete.

- Bank Soal dikelompokkan berdasarkan id_sekolah, kelas, mata_pelajaran, jenis_instrumen, dan tipe_soal.
- Question hash mencegah duplikasi soal yang sama pada sekolah yang sama.
- Fitur use menyalin soal dari bank_soal ke tabel soal pada instrumen tujuan.
- Sistem memeriksa kompatibilitas kelas, mata pelajaran, dan jenis instrumen sebelum menyalin soal.
- Soft delete dilakukan dengan mengubah is_aktif menjadi 0, bukan menghapus fisik langsung.

# 15. Fitur Monitoring dan Laporan

Monitoring dan laporan mengambil data dari instrumen, soal, users, hasil_siswa, jawaban_siswa, chat_history, sekolah, dan activity_log. Halaman MonitoringPage menampilkan detail hasil per instrumen, termasuk siswa sudah/belum mengerjakan, analisis butir, analisis tipe soal, dan rekomendasi. Halaman LaporanPage menampilkan dashboard statistik, grafik, laporan instrumen, dan rekapan chatbot siswa.

- Laporan dashboard menghitung total instrumen, instrumen aktif, jumlah guru/siswa, rata-rata nilai, distribusi jenis instrumen, aktivitas, dan data ringkas lain.
- Laporan chatbot siswa membaca chat_history dan dapat difilter berdasarkan tanggal, kelas, instrumen, siswa, status, dan pencarian.
- Super admin memiliki laporan global dan export Excel melalui route /api/super-admin/laporan/export-excel.
- Frontend memakai Recharts untuk visualisasi grafik pada laporan.

# 16. Fitur Chatbot

Chatbot berada pada route /api/chatbot dan halaman ChatbotPage. Chatbot bernama ASBA/ASB berfungsi sebagai asisten pembelajaran untuk membantu guru dan siswa memahami HOTS, Literasi, Numerasi, cara penggunaan sistem, dan materi pendidikan. Backend melakukan intent detection ringan berbasis regex sebelum memanggil Gemini API.

- NLP ringan yang ditemukan: regex intent detection, filtering topik pendidikan, safety guardrail untuk mencegah bocoran Bank Soal, normalisasi teks, ekspansi singkatan, dan heuristic context resolution.
- Jika pertanyaan cocok intent lokal, sistem menjawab tanpa API Gemini.
- Jika pertanyaan berpotensi membocorkan isi/kunci soal tersimpan, sistem menolak dengan aman.
- Jika pertanyaan relevan pendidikan dan tidak dijawab lokal/cache, backend memanggil Gemini API menggunakan GEMINI_API_KEY dan GEMINI_MODEL.
- Riwayat chat disimpan pada chat_history. Jika kolom instrumen_id tersedia, chat siswa dapat dikaitkan dengan instrumen aktif.
- Exact Match Caching menyimpan prompt ternormalisasi dan jawaban Gemini di chatbot_cache untuk prompt yang aman dan stabil.

Laporan ini tidak menampilkan nilai GEMINI_API_KEY. Variabel yang relevan cukup disebut sebagai GEMINI_API_KEY dan GEMINI_MODEL.

# 17. Alur Data Backend ke Frontend

Frontend memanggil API melalui axios wrapper di src/api/index.js. Interceptor request menambahkan token dari localStorage sebagai Bearer token. Backend menerima request, middleware authenticate memvalidasi JWT dan mengambil user dari database. Route/controller menjalankan query SQL sesuai scope role dan mengembalikan response JSON. Frontend lalu menyimpan state dan menampilkan data ke halaman.

| Contoh alur | Urutan proses |
| --- | --- |
| Login normal | LoginPage -> authAPI.login -> POST /auth/login -> bcrypt compare -> generate JWT -> AuthContext menyimpan token -> /auth/me mengambil user aktif. |
| Guru Login Google | LoginPage memuat GIS -> credential Google -> POST /auth/google-login -> verifyIdToken -> cocokkan users.email role guru -> generate JWT. |
| Guru lupa password OTP | LoginPage forgot -> POST /auth/forgot-password -> OTP hash disimpan -> nodemailer/console dev -> POST /auth/reset-password-otp -> bcrypt hash password baru. |
| Membuat instrumen | InstrumenPage -> instrumenAPI.create -> POST /instrumen -> validasi role/scope -> insert instrumen -> daftar instrumen diperbarui. |
| Siswa mengerjakan instrumen | KerjakanSoalPage -> GET /soal/kerjakan/:id -> siswa submit -> POST /soal/submit -> insert jawaban_siswa dan hasil_siswa. |
| Guru melihat laporan | LaporanPage/MonitoringPage -> laporanAPI atau api monitoring -> backend query hasil_siswa/jawaban_siswa/users/instrumen -> chart/tabel ditampilkan. |

# 18. Struktur Database dan Relasi

Sebagian migration yang tersedia adalah migration tambahan; tabel dasar seperti users, instrumen, soal, hasil_siswa, dan jawaban_siswa sudah digunakan luas di kode tetapi definisi CREATE TABLE awal tidak ditemukan dalam analisa file migration saat ini. Maka struktur berikut ditulis berdasarkan migration dan query kode.

| Tabel | Kegunaan dan relasi berdasarkan analisa kode |
| --- | --- |
| users | Menyimpan akun super_admin, admin_sekolah/admin, guru, siswa. Kolom yang dipakai: id, nama, email, password, peran, id_sekolah, mata_pelajaran, nip, kelas, nis, foto, is_aktif. Relasi ke sekolah via id_sekolah. |
| sekolah | Data sekolah multi-tenant: id, nama_sekolah, npsn, alamat, status. Direlasikan ke users, instrumen, hasil_siswa, jawaban_siswa. |
| instrumen | Data instrumen assessment: sekolah, judul, deskripsi, jenis, mapel, kelas, jumlah_soal, status, file, pembuat, batas waktu. Relasi ke users pembuat dan soal. |
| soal | Butir soal dalam instrumen. Memuat pertanyaan, gambar, tabel, pilihan, jawaban benar, tipe soal, bobot, stimulus/layout. Relasi ke instrumen. |
| hasil_siswa | Rekap hasil pengerjaan siswa per instrumen, termasuk nilai, benar, total soal, waktu. Relasi ke siswa, instrumen, sekolah. |
| jawaban_siswa | Jawaban detail per soal dari siswa, termasuk is_benar. Relasi ke soal, siswa, instrumen, sekolah. |
| bank_soal | Penyimpanan salinan soal per sekolah dengan hash unik, metadata instrumen, tipe soal, pilihan, jawaban, dan usage_count. |
| chat_history | Riwayat pesan chatbot user; migration menambah instrumen_id dan is_error. Relasi opsional ke instrumen. |
| chatbot_cache | Cache exact match untuk jawaban Gemini, dibuat otomatis oleh route chatbot jika belum ada. |
| password_reset_requests | Permintaan reset password siswa yang diproses admin sekolah. Dibuat otomatis oleh route auth/users. |
| password_reset_otps | OTP reset password guru, menyimpan hash OTP, attempt_count, expires_at, used_at. Dibuat otomatis oleh route auth. |
| activity_log | Log aktivitas login/register/logout/reset dan aktivitas lain; definisi CREATE TABLE awal tidak ditemukan, tetapi digunakan pada auth/laporan. |

# 19. Keamanan Sistem

Beberapa mekanisme keamanan sudah tersedia pada kode. Password user di-hash menggunakan bcrypt. JWT digunakan untuk autentikasi session. Middleware role/permission membatasi akses route. Scope sekolah membatasi data multi sekolah. Google ID token diverifikasi di backend dan Google Login dibatasi hanya untuk role guru. Sistem tidak melakukan auto-register akun Google. OTP guru disimpan sebagai hash dan memiliki waktu kedaluwarsa. Data sensitif dikonfigurasi melalui environment variable.

- Jangan menaruh secret seperti JWT_SECRET, DB_PASSWORD, SMTP_PASS, GOOGLE_CLIENT_ID lengkap, atau API key di repository publik.
- Gunakan JWT_SECRET yang kuat dan berbeda antara development dan production.
- Set NODE_ENV=production pada server produksi.
- Nonaktifkan RESET_OTP_CONSOLE pada production; OTP harus dikirim lewat SMTP resmi.
- Gunakan HTTPS saat hosting agar token dan credential tidak lewat jaringan plaintext.
- Tambahkan rate limit untuk login dan forgot password jika belum ada secara global.
- Tambahkan audit log yang konsisten untuk aksi penting seperti login gagal berulang, reset password, dan perubahan role/status.
- Batasi ukuran upload dan validasi ekstensi/MIME file secara ketat; sebagian sudah dilakukan dengan multer.

# 20. Mode Development dan Production

| Aspek | Development | Production |
| --- | --- | --- |
| OTP guru | Boleh tampil di terminal jika RESET_OTP_CONSOLE aktif atau SMTP belum tersedia untuk testing lokal. | Harus dikirim lewat SMTP; RESET_OTP_CONSOLE harus false/tidak aktif. |
| Google Login | GOOGLE_CLIENT_ID dan VITE_GOOGLE_CLIENT_ID memakai client ID untuk localhost. | Client ID harus memiliki Authorized JavaScript origins domain production. |
| Database | Bisa memakai database lokal MySQL. | Gunakan user/password kuat, backup, firewall, dan akses terbatas. |
| CORS | Mengizinkan localhost frontend. | Pastikan hanya domain production resmi yang diizinkan. |
| Secret | Boleh memakai secret development. | Gunakan secret kuat dan jangan commit ke Git. |

Environment variable yang ditemukan/relevan antara lain PORT, NODE_ENV, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET, JWT_EXPIRE, GOOGLE_CLIENT_ID, VITE_GOOGLE_CLIENT_ID, GEMINI_API_KEY, GEMINI_MODEL, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM, RESET_OTP_CONSOLE, UPLOAD_PATH, dan MAX_FILE_SIZE. Nilai variabel sengaja tidak ditampilkan.

# 21. Hasil Pengujian yang Disarankan

- Login siswa dummy menggunakan NIS dan password.
- Login admin/admin_sekolah menggunakan akun sistem/username dan password.
- Login guru menggunakan email dan password.
- Login Google guru dengan email yang terdaftar pada users.email.
- Google Login ditolak untuk email yang tidak terdaftar.
- Google Login ditolak untuk email user yang bukan role guru.
- Lupa password guru mode lokal dan mode SMTP production.
- Lupa password siswa masuk ke permintaan reset admin sekolah.
- Tambah guru dengan email valid; tolak guru tanpa email, format salah, atau duplikat.
- Tambah/edit siswa tanpa email asli dan pastikan NIS tidak berubah jika sudah ada.
- CRUD instrumen termasuk batas waktu, status, dan duplikasi kelas.
- Import Word/Excel: preview, validasi, simpan soal, gambar/tabel terlihat benar.
- Pengerjaan instrumen siswa dan submit jawaban.
- Monitoring siswa sudah/belum mengerjakan dan analisis butir.
- Laporan dashboard dan laporan chatbot.
- Chatbot menjawab edukasi, menolak permintaan kunci/isi soal tersimpan, menyimpan riwayat, dan cache aman.

# 22. Kesimpulan

SMIASB sudah memiliki arsitektur web modern dengan React pada frontend, Node.js/Express pada backend, dan MySQL sebagai database. Sistem mendukung multi-role dan multi-sekolah, dengan pemisahan akses untuk super admin, admin sekolah, guru, dan siswa. Fitur manajemen instrumen, soal, pengerjaan siswa, monitoring, laporan, bank soal, dan chatbot menunjukkan sistem sudah berfungsi sebagai platform assessment berbasis web yang cukup lengkap.

Fitur guru sudah diperkuat dengan email valid, Login Google khusus guru, dan lupa password melalui OTP email. Siswa tetap dapat memakai NIS dan tidak diwajibkan email asli, sedangkan reset password siswa dikelola oleh admin sekolah. Untuk menuju production, perhatian utama adalah konfigurasi domain Google OAuth, SMTP resmi, HTTPS, secret yang kuat, CORS domain production, dan rate limiting endpoint sensitif.

# Lampiran A. File Penting yang Dianalisa

- smiasb/backend/server.js
- smiasb/backend/config/database.js
- smiasb/backend/middleware/auth.js
- smiasb/backend/utils/accessControl.js
- smiasb/backend/routes/auth.js
- smiasb/backend/routes/users.js
- smiasb/backend/routes/instrumen.js
- smiasb/backend/routes/soal.js
- smiasb/backend/routes/bank-soal.js
- smiasb/backend/routes/chatbot.js
- smiasb/backend/routes/laporan.js
- smiasb/backend/routes/sekolah.js
- smiasb/backend/routes/super-admin.js
- smiasb/backend/migrations/*.sql
- smiasb/backend/package.json
- smiasb/frontend/package.json
- smiasb/frontend/src/App.jsx
- smiasb/frontend/src/api/index.js
- smiasb/frontend/src/context/AuthContext.jsx
- smiasb/frontend/src/components/Layout.jsx
- smiasb/frontend/src/pages/LoginPage.jsx
- smiasb/frontend/src/pages/PenggunaPage.jsx
- smiasb/frontend/src/pages/InstrumenPage.jsx
- smiasb/frontend/src/pages/SoalPage.jsx
- smiasb/frontend/src/pages/KerjakanSoalPage.jsx
- smiasb/frontend/src/pages/BankSoalPage.jsx
- smiasb/frontend/src/pages/MonitoringPage.jsx
- smiasb/frontend/src/pages/LaporanPage.jsx
- smiasb/frontend/src/pages/ChatbotPage.jsx
