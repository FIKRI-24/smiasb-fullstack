-- Normalisasi format kelas yang jelas ke bentuk standar:
-- VII-A, VII-B, VIII-A, VIII-B, IX-A, dst.
-- Aman dijalankan ulang. Hanya mengubah pola yang yakin:
-- tingkat VII/VIII/IX + separator spasi/underscore/strip + huruf kelas.

UPDATE users SET kelas = 'VII-A' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^VII[ _-]+A$';
UPDATE users SET kelas = 'VII-B' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^VII[ _-]+B$';
UPDATE users SET kelas = 'VII-C' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^VII[ _-]+C$';

UPDATE users SET kelas = 'VIII-A' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^VIII[ _-]+A$';
UPDATE users SET kelas = 'VIII-B' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^VIII[ _-]+B$';
UPDATE users SET kelas = 'VIII-C' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^VIII[ _-]+C$';
UPDATE users SET kelas = 'VIII-D' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^VIII[ _-]+D$';
UPDATE users SET kelas = 'VIII-E' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^VIII[ _-]+E$';

UPDATE users SET kelas = 'IX-A' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^IX[ _-]+A$';
UPDATE users SET kelas = 'IX-B' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^IX[ _-]+B$';
UPDATE users SET kelas = 'IX-C' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^IX[ _-]+C$';

UPDATE instrumen SET kelas = 'VII-A' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^VII[ _-]+A$';
UPDATE instrumen SET kelas = 'VII-B' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^VII[ _-]+B$';
UPDATE instrumen SET kelas = 'VII-C' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^VII[ _-]+C$';

UPDATE instrumen SET kelas = 'VIII-A' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^VIII[ _-]+A$';
UPDATE instrumen SET kelas = 'VIII-B' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^VIII[ _-]+B$';
UPDATE instrumen SET kelas = 'VIII-C' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^VIII[ _-]+C$';
UPDATE instrumen SET kelas = 'VIII-D' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^VIII[ _-]+D$';
UPDATE instrumen SET kelas = 'VIII-E' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^VIII[ _-]+E$';

UPDATE instrumen SET kelas = 'IX-A' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^IX[ _-]+A$';
UPDATE instrumen SET kelas = 'IX-B' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^IX[ _-]+B$';
UPDATE instrumen SET kelas = 'IX-C' WHERE kelas IS NOT NULL AND UPPER(TRIM(kelas)) REGEXP '^IX[ _-]+C$';
