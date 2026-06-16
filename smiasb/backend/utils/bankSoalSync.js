const crypto = require('crypto');
const { pool } = require('../config/database');

const LAYOUT_METADATA_KEYS = new Set(['layout_blocks']);

function safeJsonParse(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeText(value = '') {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalize(value) {
  if (value === undefined || value === null || value === '') return null;

  const parsed = typeof value === 'string'
    ? safeJsonParse(value, value)
    : value;

  if (Array.isArray(parsed)) {
    return parsed.map(item => canonicalize(item));
  }

  if (parsed && typeof parsed === 'object') {
    return Object.keys(parsed)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalize(parsed[key]);
        return acc;
      }, {});
  }

  if (typeof parsed === 'string') return normalizeText(parsed);
  return parsed;
}

function stableStringify(value) {
  const canonical = canonicalize(value);
  return canonical === null ? null : JSON.stringify(canonical);
}

function isLayoutMetadataBlock(tableItem = {}) {
  const role = String(tableItem?.role || '').toLowerCase();
  const type = String(tableItem?.type || '').toLowerCase();

  return (
    LAYOUT_METADATA_KEYS.has(role) ||
    LAYOUT_METADATA_KEYS.has(type) ||
    Array.isArray(tableItem?.layout_blocks)
  );
}

function getTableMetadata(tabelData) {
  const parsed = safeJsonParse(tabelData, []);
  if (!Array.isArray(parsed)) {
    return {
      stimulus_tambahan: null,
      layout_blocks: null,
      supporting_tables: null,
      media: null
    };
  }

  const layoutMetadata = parsed.find(isLayoutMetadataBlock) || null;
  const supportingTables = parsed.filter(item => !isLayoutMetadataBlock(item));
  const media = Array.isArray(layoutMetadata?.gambar) ? layoutMetadata.gambar : null;

  return {
    stimulus_tambahan: layoutMetadata?.stimulus_tambahan || null,
    layout_blocks: Array.isArray(layoutMetadata?.layout_blocks)
      ? JSON.stringify(layoutMetadata.layout_blocks)
      : null,
    supporting_tables: supportingTables.length > 0 ? JSON.stringify(supportingTables) : null,
    media: media && media.length > 0 ? JSON.stringify(media) : null
  };
}

function createQuestionHash(soal, metadata = {}) {
  const payload = {
    id_sekolah: metadata.id_sekolah,
    kelas: metadata.kelas,
    pertanyaan: soal.pertanyaan,
    stimulus_tambahan: metadata.stimulus_tambahan,
    tipe_soal: soal.tipe_soal,
    pilihan_a: soal.pilihan_a,
    pilihan_b: soal.pilihan_b,
    pilihan_c: soal.pilihan_c,
    pilihan_d: soal.pilihan_d,
    pilihan_e: soal.pilihan_e,
    jawaban_benar: soal.jawaban_benar,
    jawaban_benar_json: canonicalize(soal.jawaban_benar_json),
    pasangan_menjodohkan: canonicalize(soal.pasangan_menjodohkan),
    pernyataan_checklist: canonicalize(soal.pernyataan_checklist),
    layout_blocks: canonicalize(metadata.layout_blocks),
    tabel_data: canonicalize(soal.tabel_data),
    supporting_tables: canonicalize(metadata.supporting_tables)
  };

  return crypto
    .createHash('sha256')
    .update(stableStringify(payload) || '')
    .digest('hex');
}

async function syncInstrumenToBankSoal(instrumenId, options = {}) {
  const executor = options.conn || pool;
  const [instrumenRows] = await executor.execute(
    'SELECT * FROM instrumen WHERE id = ?',
    [instrumenId]
  );
  const instrumen = instrumenRows[0];

  if (!instrumen) {
    return {
      added: 0,
      skipped: 0,
      total: 0,
      warning: 'Instrumen tidak ditemukan.'
    };
  }

  if (!instrumen.id_sekolah) {
    return {
      added: 0,
      skipped: 0,
      total: 0,
      warning: 'Instrumen tidak memiliki id_sekolah.'
    };
  }

  const [soalRows] = await executor.execute(
    'SELECT * FROM soal WHERE instrumen_id = ? ORDER BY nomor ASC, id ASC',
    [instrumenId]
  );

  let added = 0;
  let skipped = 0;

  for (const soal of soalRows) {
    const metadata = {
      ...getTableMetadata(soal.tabel_data),
      id_sekolah: instrumen.id_sekolah,
      kelas: instrumen.kelas || null
    };
    const questionHash = createQuestionHash(soal, metadata);

    const [result] = await executor.execute(
      `INSERT INTO bank_soal
        (id_sekolah, source_instrumen_id, source_soal_id, kelas, mata_pelajaran, jenis_instrumen,
         materi, topik, question_hash, pertanyaan, stimulus_tambahan, layout_blocks,
         supporting_tables, media, gambar_soal, tabel_data, pilihan_a, pilihan_b, pilihan_c,
         pilihan_d, pilihan_e, jawaban_benar, jawaban_benar_json, tipe_soal, kategori_instrumen,
         bobot, pasangan_menjodohkan, pernyataan_checklist, created_by, usage_count, is_aktif)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
       ON DUPLICATE KEY UPDATE
         updated_at = updated_at`,
      [
        instrumen.id_sekolah,
        instrumen.id,
        soal.id,
        instrumen.kelas || null,
        instrumen.mata_pelajaran || null,
        instrumen.jenis || soal.kategori_instrumen || 'HOTS',
        null,
        null,
        questionHash,
        soal.pertanyaan,
        metadata.stimulus_tambahan,
        metadata.layout_blocks,
        metadata.supporting_tables,
        metadata.media,
        soal.gambar_soal || null,
        soal.tabel_data || null,
        soal.pilihan_a || null,
        soal.pilihan_b || null,
        soal.pilihan_c || null,
        soal.pilihan_d || null,
        soal.pilihan_e || null,
        soal.jawaban_benar || null,
        soal.jawaban_benar_json || null,
        soal.tipe_soal || 'pilihan_ganda',
        soal.kategori_instrumen || instrumen.jenis || 'HOTS',
        Number(soal.bobot || 1),
        soal.pasangan_menjodohkan || null,
        soal.pernyataan_checklist || null,
        instrumen.dibuat_oleh || null
      ]
    );

    if (result.affectedRows === 1) added += 1;
    else skipped += 1;
  }

  return {
    added,
    skipped,
    total: soalRows.length
  };
}

module.exports = {
  syncInstrumenToBankSoal,
  createQuestionHash
};
