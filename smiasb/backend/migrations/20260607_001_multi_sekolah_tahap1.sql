-- Tahap 1 Multi Sekolah - struktur dasar dan mapping data lama.
-- Aman dijalankan ulang: memakai IF NOT EXISTS dan update hanya untuk id_sekolah yang masih NULL.
-- Target: MariaDB/MySQL database SMIASB.

CREATE TABLE IF NOT EXISTS sekolah (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama_sekolah VARCHAR(150) NOT NULL,
  npsn VARCHAR(20) NULL,
  alamat TEXT NULL,
  status ENUM('aktif', 'nonaktif') NOT NULL DEFAULT 'aktif',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_sekolah_nama (nama_sekolah)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO sekolah (nama_sekolah, npsn, alamat, status)
SELECT 'SMPS Adabiah Padang', NULL, NULL, 'aktif'
WHERE NOT EXISTS (
  SELECT 1 FROM sekolah WHERE nama_sekolah = 'SMPS Adabiah Padang'
);

INSERT INTO sekolah (nama_sekolah, npsn, alamat, status)
SELECT 'SMPN 12 Padang', NULL, NULL, 'aktif'
WHERE NOT EXISTS (
  SELECT 1 FROM sekolah WHERE nama_sekolah = 'SMPN 12 Padang'
);

INSERT INTO sekolah (nama_sekolah, npsn, alamat, status)
SELECT 'MTsN 6 Padang', NULL, NULL, 'aktif'
WHERE NOT EXISTS (
  SELECT 1 FROM sekolah WHERE nama_sekolah = 'MTsN 6 Padang'
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS id_sekolah INT NULL AFTER id;

ALTER TABLE instrumen
  ADD COLUMN IF NOT EXISTS id_sekolah INT NULL AFTER id;

ALTER TABLE hasil_siswa
  ADD COLUMN IF NOT EXISTS id_sekolah INT NULL AFTER id;

ALTER TABLE jawaban_siswa
  ADD COLUMN IF NOT EXISTS id_sekolah INT NULL AFTER id;

SET @default_id_sekolah := (
  SELECT id
  FROM sekolah
  WHERE nama_sekolah = 'SMPS Adabiah Padang'
  ORDER BY id ASC
  LIMIT 1
);

UPDATE users
SET id_sekolah = @default_id_sekolah
WHERE id_sekolah IS NULL
  AND peran IN ('admin', 'guru', 'siswa');

UPDATE instrumen i
LEFT JOIN users u ON u.id = i.dibuat_oleh
SET i.id_sekolah = COALESCE(u.id_sekolah, @default_id_sekolah)
WHERE i.id_sekolah IS NULL;

UPDATE hasil_siswa hs
LEFT JOIN instrumen i ON i.id = hs.instrumen_id
LEFT JOIN users u ON u.id = hs.siswa_id
SET hs.id_sekolah = COALESCE(i.id_sekolah, u.id_sekolah, @default_id_sekolah)
WHERE hs.id_sekolah IS NULL;

UPDATE jawaban_siswa js
LEFT JOIN instrumen i ON i.id = js.instrumen_id
LEFT JOIN users u ON u.id = js.siswa_id
SET js.id_sekolah = COALESCE(i.id_sekolah, u.id_sekolah, @default_id_sekolah)
WHERE js.id_sekolah IS NULL;
