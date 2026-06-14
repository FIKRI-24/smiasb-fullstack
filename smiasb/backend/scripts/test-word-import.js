const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const parser = require('../routes/instrumen')._parser;

const downloadsDir = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Downloads');

const defaultFixtures = [
  {
    label: 'Peredaran Darah',
    target: 15,
    candidates: ['SOAL LITERASI SAINS_Sistem Peredaran Darah.docx']
  },
  {
    label: 'Pencernaan',
    target: 15,
    candidates: [
      'SOAL LITERASI SAINS_Sistem Pencernaan.docx',
      'SOAL LITERASI SAINS-Sistem Pencernaan.docx'
    ]
  },
  {
    label: 'Pernapasan',
    target: 15,
    candidates: ['SOAL LITERASI SAINS_Sistem Pernapasan.docx'],
    expectedImages: {
      1: { min: 1 },
      4: { exact: 1 },
      5: { min: 1 }
    }
  }
];

function resolveDefaultFixture(fixture) {
  const found = fixture.candidates
    .map(fileName => path.join(downloadsDir, fileName))
    .find(filePath => fs.existsSync(filePath));

  return found ? { ...fixture, file: found } : null;
}

function getFixturesFromInput() {
  const argFiles = process.argv.slice(2);
  const envFiles = String(process.env.WORD_IMPORT_FIXTURES || '')
    .split(path.delimiter)
    .map(item => item.trim())
    .filter(Boolean);
  const files = argFiles.length > 0 ? argFiles : envFiles;

  if (files.length > 0) {
    return files.map(file => ({
      label: path.basename(file, path.extname(file)),
      file: path.resolve(file),
      target: Number(process.env.WORD_IMPORT_TARGET || 15)
    }));
  }

  return defaultFixtures
    .map(resolveDefaultFixture)
    .filter(Boolean);
}

async function parseWordFixture(fixture) {
  const savedImages = [];
  const html = (await mammoth.convertToHtml({ path: fixture.file }, {
    convertImage: mammoth.images.imgElement(async (image) => {
      const ext = image.contentType === 'image/png'
        ? 'png'
        : image.contentType === 'image/gif'
          ? 'gif'
          : image.contentType === 'image/webp'
            ? 'webp'
            : 'jpg';
      const fileName = `fixture-${savedImages.length + 1}.${ext}`;
      const url = `/uploads/soal/${fileName}`;

      savedImages.push({
        file_name: fileName,
        file_url: url,
        mime_type: image.contentType
      });

      return { src: url };
    })
  })).value || '';

  const blocks = await parser.extractDocxBlocksFromOOXML(fixture.file, savedImages);
  const docxResult = parser.splitQuestionSegmentsFromBlocks(blocks, fixture.target, 'ooxml_numbering');
  const result = parser.buildSoalPreviewResultFromHtml(html, {
    targetCount: fixture.target,
    docxResult
  });

  return {
    fixture,
    savedImages,
    result
  };
}

function getChoice(soal, label) {
  return String(soal[`pilihan_${label.toLowerCase()}`] || '').trim();
}

function validateQuestion(soal) {
  const errors = [];
  const nomor = soal.nomor;
  const tipe = soal.tipe_soal || 'pilihan_ganda';
  const hasAD = ['A', 'B', 'C', 'D'].every(label => getChoice(soal, label));

  if (!String(soal.pertanyaan || '').trim()) {
    errors.push(`Soal ${nomor}: pertanyaan kosong`);
  }

  if (['pilihan_ganda', 'sebab_akibat'].includes(tipe)) {
    if (!hasAD) errors.push(`Soal ${nomor}: pilihan A-D belum lengkap`);
    if (!soal.jawaban_benar) errors.push(`Soal ${nomor}: kunci pilihan belum ada`);
  }

  if (tipe === 'ganda_kompleks') {
    if (!hasAD) errors.push(`Soal ${nomor}: pilihan A-D ganda kompleks belum lengkap`);
    if (!Array.isArray(soal.jawaban_benar_json) || soal.jawaban_benar_json.length === 0) {
      errors.push(`Soal ${nomor}: kunci ganda kompleks belum ada`);
    }
  }

  if (tipe === 'benar_salah') {
    const pernyataan = Array.isArray(soal.pernyataan_checklist) ? soal.pernyataan_checklist : [];
    const jawaban = soal.jawaban_benar_json || {};

    if (pernyataan.length === 0) errors.push(`Soal ${nomor}: tabel benar-salah belum terbaca`);
    pernyataan.forEach((_, index) => {
      if (jawaban[String(index)] !== true && jawaban[String(index)] !== false) {
        errors.push(`Soal ${nomor}: status benar-salah baris ${index + 1} kosong`);
      }
    });
  }

  if (tipe === 'menjodohkan') {
    const pasangan = soal.pasangan_menjodohkan || {};
    const kiri = Array.isArray(pasangan.kolom_kiri) ? pasangan.kolom_kiri : [];
    const kanan = Array.isArray(pasangan.kolom_kanan) ? pasangan.kolom_kanan : [];
    const kunci = pasangan.kunci || {};

    if (kiri.length === 0 || kanan.length === 0) errors.push(`Soal ${nomor}: data menjodohkan belum terbaca`);
    kiri.forEach((_, index) => {
      if (!kunci[String(index)]) errors.push(`Soal ${nomor}: kunci menjodohkan baris ${index + 1} kosong`);
    });
  }

  return errors;
}

function validateParsedFixture(parsed) {
  const { fixture, savedImages, result } = parsed;
  const questions = result.soal_preview || [];
  const quality = result.import_quality_report || {};
  const errors = [];
  const imageDebug = result.parser_debug?.image_mapping_debug || result.parser_debug?.image_mapping || [];
  const mappedImageCount = questions.reduce((total, soal) => total + (Array.isArray(soal.gambar) ? soal.gambar.length : 0), 0);
  const mappedDebugImageCount = imageDebug.filter(item => item.mapped_to_question_number !== null && !item.duplicate_removed).length;

  if (questions.length !== fixture.target) {
    errors.push(`Terdeteksi ${questions.length} soal, target ${fixture.target}`);
  }

  if ((quality.save_blocked_reasons || []).length > 0) {
    errors.push(...quality.save_blocked_reasons.map(reason => `Save blocked: ${reason}`));
  }

  if ((quality.unmapped_images || []).length > 0) {
    errors.push(`${quality.unmapped_images.length} gambar belum terpetakan`);
  }

  if ((quality.unmapped_tables || []).length > 0) {
    errors.push(`${quality.unmapped_tables.length} tabel belum terpetakan`);
  }

  if (savedImages.length > 0 && mappedImageCount !== mappedDebugImageCount) {
    errors.push(`Jumlah gambar preview (${mappedImageCount}) tidak sama dengan debug mapped (${mappedDebugImageCount})`);
  }

  questions.forEach((soal) => {
    errors.push(...validateQuestion(soal));
  });

  Object.entries(fixture.expectedImages || {}).forEach(([nomor, expectation]) => {
    const soal = questions.find(item => Number(item.nomor) === Number(nomor));
    const count = Array.isArray(soal?.gambar) ? soal.gambar.length : 0;

    if (expectation.exact !== undefined && count !== expectation.exact) {
      errors.push(`Soal ${nomor}: jumlah gambar ${count}, harus ${expectation.exact}`);
    }

    if (expectation.min !== undefined && count < expectation.min) {
      errors.push(`Soal ${nomor}: jumlah gambar ${count}, minimal ${expectation.min}`);
    }
  });

  return {
    label: fixture.label,
    file: fixture.file,
    total: questions.length,
    parser_strategy: result.parser_strategy,
    images_in_word: savedImages.length,
    images_in_preview: mappedImageCount,
    benar_salah: questions.filter(soal => soal.tipe_soal === 'benar_salah').length,
    menjodohkan: questions.filter(soal => soal.tipe_soal === 'menjodohkan').length,
    warnings: {
      missing_images: (quality.missing_images_warning || []).length,
      unmapped_images: (quality.unmapped_images || []).length,
      unmapped_tables: (quality.unmapped_tables || []).length,
      low_confidence: (quality.low_confidence_questions || []).length
    },
    errors
  };
}

(async () => {
  const fixtures = getFixturesFromInput();

  if (fixtures.length === 0) {
    console.error('Tidak ada fixture Word ditemukan. Isi WORD_IMPORT_FIXTURES atau berikan path file .docx sebagai argumen.');
    process.exitCode = 1;
    return;
  }

  const summaries = [];

  for (const fixture of fixtures) {
    if (!fs.existsSync(fixture.file)) {
      summaries.push({
        label: fixture.label,
        file: fixture.file,
        errors: ['File fixture tidak ditemukan']
      });
      continue;
    }

    const parsed = await parseWordFixture(fixture);
    summaries.push(validateParsedFixture(parsed));
  }

  console.log(JSON.stringify(summaries, null, 2));

  if (summaries.some(summary => summary.errors.length > 0)) {
    process.exitCode = 1;
  }
})();
