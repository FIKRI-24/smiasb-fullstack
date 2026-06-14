-- Tahap 2 Multi Sekolah - role dan seed super admin.
-- Aman dijalankan ulang: update role lama hanya jika masih ada, seed super admin hanya jika belum ada.

ALTER TABLE users
  MODIFY peran ENUM('admin', 'super_admin', 'admin_sekolah', 'guru', 'siswa') NOT NULL DEFAULT 'siswa';

UPDATE users
SET peran = 'admin_sekolah'
WHERE peran = 'admin';

INSERT INTO users (
  nama,
  email,
  password,
  peran,
  mata_pelajaran,
  nip,
  kelas,
  nis,
  id_sekolah,
  is_aktif
)
SELECT
  'Super Admin',
  'superadmin',
  '$2a$10$VCFHt.U9AjTP.nCz4n8rT.fPtx1EnQRwzRwsCJUtK2Oq8kUwxWy2e',
  'super_admin',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  1
WHERE NOT EXISTS (
  SELECT 1
  FROM users
  WHERE peran = 'super_admin'
     OR email = 'superadmin'
);
