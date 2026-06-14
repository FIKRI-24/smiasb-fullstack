-- Rollback Tahap 2 Multi Sekolah.
-- Menghapus seed super admin default dan mengembalikan admin_sekolah menjadi admin.

DELETE FROM users
WHERE peran = 'super_admin'
  AND email = 'superadmin'
  AND nama = 'Super Admin';

UPDATE users
SET peran = 'admin'
WHERE peran = 'admin_sekolah';

ALTER TABLE users
  MODIFY peran ENUM('admin', 'guru', 'siswa') NOT NULL DEFAULT 'siswa';
