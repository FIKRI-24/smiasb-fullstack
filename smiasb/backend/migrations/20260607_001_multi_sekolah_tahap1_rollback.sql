-- Rollback Tahap 1 Multi Sekolah.
-- Jalankan hanya jika perlu membatalkan struktur multi sekolah tahap 1.
-- Data lama utama tidak dihapus, tetapi nilai mapping id_sekolah dan tabel sekolah akan hilang.

ALTER TABLE jawaban_siswa
  DROP COLUMN IF EXISTS id_sekolah;

ALTER TABLE hasil_siswa
  DROP COLUMN IF EXISTS id_sekolah;

ALTER TABLE instrumen
  DROP COLUMN IF EXISTS id_sekolah;

ALTER TABLE users
  DROP COLUMN IF EXISTS id_sekolah;

DROP TABLE IF EXISTS sekolah;
