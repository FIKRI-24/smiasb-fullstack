const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const cheerio = require('cheerio');
const JSZip = require('jszip');
const XLSX = require('xlsx');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { syncInstrumenToBankSoal } = require('../utils/bankSoalSync');
const {
  denyAccess,
  appendSekolahScope,
  resolveTargetSekolahId,
  isSuperAdmin,
  isGuru,
  isSiswa,
  canAccessInstrumen,
  normalizeKelas
} = require('../utils/accessControl');
const { getUploadRoot, getUploadDir } = require('../utils/uploadPaths');

// Konfigurasi upload file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, getUploadRoot());
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'instrumen-' + unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Format file tidak diizinkan. Gunakan PDF, DOC, DOCX, XLSX.'));
  }
});

const importImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, getUploadDir('soal'));
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `import-manual-${unique}${path.extname(file.originalname)}`);
  }
});

const uploadImportImage = multer({
  storage: importImageStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Format gambar tidak didukung. Gunakan JPG, PNG, GIF, atau WEBP.'));
  }
});


// ============================================================
// HELPER IMPORT WORD — membaca HTML Word menjadi preview soal
// Catatan: helper ini hanya dipakai oleh fitur import Word.
// Tidak mengubah fungsi instrumen/soal manual yang sudah ada.
// ============================================================
function cleanText(text = '') {
  return String(text)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
}

function safeJsonStringify(value, fallback = null) {
  try {
    if (value === undefined || value === null) return fallback;
    return JSON.stringify(value);
  } catch (err) {
    return fallback;
  }
}

const SAFE_HTML_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'span', 'div',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img', 'figure', 'figcaption'
]);

const SAFE_HTML_STYLES = new Set([
  'color', 'background-color', 'text-align', 'font-size', 'width', 'max-width'
]);

function isSafeHtmlUrl(value = '') {
  const src = String(value || '').trim();
  return /^https?:\/\//i.test(src) || src.startsWith('/uploads/');
}

function sanitizeHtmlStyleValue(property, value) {
  const raw = String(value || '').trim();
  if (!raw || /expression|javascript:|url\s*\(/i.test(raw)) return '';

  if (property === 'text-align') {
    return /^(left|right|center|justify)$/i.test(raw) ? raw.toLowerCase() : '';
  }

  if (property === 'font-size') {
    return /^(\d{1,2}(\.\d+)?)(px|rem|em|%)$/i.test(raw) ? raw : '';
  }

  if (property === 'width' || property === 'max-width') {
    return /^(\d{1,3}(\.\d+)?)(%|px)$/i.test(raw) ? raw : '';
  }

  if (property === 'color' || property === 'background-color') {
    return (
      /^#[0-9a-f]{3,8}$/i.test(raw) ||
      /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.test(raw) ||
      /^hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.test(raw) ||
      /^[a-z]+$/i.test(raw)
    )
      ? raw
      : '';
  }

  return '';
}

function sanitizeHtmlStyle(style = '') {
  return String(style || '')
    .split(';')
    .map((chunk) => {
      const [rawProperty, ...valueParts] = chunk.split(':');
      const property = String(rawProperty || '').trim().toLowerCase();
      if (!SAFE_HTML_STYLES.has(property)) return '';
      const value = sanitizeHtmlStyleValue(property, valueParts.join(':'));
      return value ? `${property}: ${value}` : '';
    })
    .filter(Boolean)
    .join('; ');
}

function sanitizeImportHtmlForSave(html = '') {
  if (!html) return '';
  const $ = cheerio.load(`<body>${html}</body>`, { decodeEntities: false });

  $('script, iframe, object, embed, form, input, button, textarea, select, link, meta').remove();

  $('*').each((_, el) => {
    const tag = (el.tagName || el.name || '').toLowerCase();
    const node = $(el);

    if (tag === 'body') return;

    if (!SAFE_HTML_TAGS.has(tag)) {
      node.replaceWith(node.contents());
      return;
    }

    Object.entries(el.attribs || {}).forEach(([attrName, attrValue]) => {
      const name = String(attrName || '').toLowerCase();
      const value = String(attrValue || '');

      if (name.startsWith('on') || name === 'srcdoc' || /^javascript:/i.test(value)) {
        node.removeAttr(attrName);
        return;
      }

      if (name === 'style') {
        const safeStyle = sanitizeHtmlStyle(value);
        if (safeStyle) node.attr('style', safeStyle);
        else node.removeAttr(attrName);
        return;
      }

      if (tag === 'img' && name === 'src') {
        if (isSafeHtmlUrl(value)) node.attr('src', value);
        else node.removeAttr(attrName);
        return;
      }

      if (tag === 'img' && (name === 'alt' || name === 'title')) return;

      if (name === 'class') {
        const safeClass = value
          .split(/\s+/)
          .filter(item => /^[a-z0-9_-]+$/i.test(item))
          .join(' ');
        if (safeClass) node.attr('class', safeClass);
        else node.removeAttr(attrName);
        return;
      }

      node.removeAttr(attrName);
    });
  });

  return $('body').html() || '';
}

function htmlPlainText(value = '') {
  return cleanText(sanitizeImportHtmlForSave(value).replace(/<[^>]*>/g, ' '));
}

function getImageFileNameFromSrc(src = '') {
  if (!src) return null;
  const cleanSrc = String(src).split('?')[0];
  return path.basename(cleanSrc);
}

function extractBlocksFromHtml(html) {
  const $ = cheerio.load(html || '');
  const blocks = [];

  const root = $('body').length ? $('body') : $.root();
  const pushBlock = (block) => {
    blocks.push({
      id: blocks.length + 1,
      ...block
    });
  };

  root.children().each((_, el) => {
    const tag = (el.tagName || el.name || '').toLowerCase();

    if (tag === 'ol' || tag === 'ul') {
      $(el).children('li').each((__, li) => {
        pushBlock({
          tag: 'li',
          list: tag,
          text: cleanText($(li).text()),
          html: $.html(li)
        });
      });
      return;
    }

    if (tag) {
      pushBlock({
        tag,
        list: null,
        text: cleanText($(el).text()),
        html: $.html(el)
      });
    }
  });

  return blocks.filter(b => b.text || /<img/i.test(b.html || '') || /<table/i.test(b.html || ''));
}

function truncatePreview(value = '', maxLength = 700) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function getTableRowsFromElement($, table) {
  const rows = [];

  $(table).find('tr').each((_, tr) => {
    const cells = [];

    $(tr).find('td, th').each((__, cell) => {
      cells.push(cleanText($(cell).text()));
    });

    if (cells.length > 0) rows.push(cells);
  });

  return rows;
}

function extractDomBlocksFromHtml(html) {
  const $ = cheerio.load(html || '');
  const blocks = [];
  const root = $('body').length ? $('body') : $.root();
  let imageIndex = 0;
  let tableIndex = 0;

  const collectImages = (el) => {
    const images = [];

    $(el).find('img').each((_, img) => {
      const src = $(img).attr('src') || null;

      images.push({
        index: imageIndex,
        src,
        file_name: getImageFileNameFromSrc(src),
        alt: $(img).attr('alt') || null
      });

      imageIndex += 1;
    });

    return images;
  };

  const pushBlock = (block) => {
    blocks.push({
      id: blocks.length + 1,
      ...block
    });
  };

  root.children().each((_, el) => {
    const tag = (el.tagName || el.name || '').toLowerCase();
    if (!tag) return;

    if (tag === 'ol' || tag === 'ul') {
      const parsedStart = parseInt($(el).attr('start') || '1', 10);
      const listStart = Number.isNaN(parsedStart) ? 1 : parsedStart;
      const listType = ($(el).attr('type') || '').toLowerCase();

      $(el).children('li').each((liIndex, li) => {
        pushBlock({
          tag: 'li',
          block_type: 'list_item',
          list: tag,
          list_number: tag === 'ol' ? listStart + liIndex : null,
          list_type: listType,
          in_table: false,
          text: cleanText($(li).text()),
          html: $.html(li),
          images: collectImages(li),
          table_indices: []
        });
      });

      return;
    }

    if (tag === 'table') {
      const currentTableIndex = tableIndex;
      tableIndex += 1;

      pushBlock({
        tag: 'table',
        block_type: 'table',
        list: null,
        list_number: null,
        in_table: true,
        table_index: currentTableIndex,
        text: cleanText($(el).text()),
        html: $.html(el),
        images: collectImages(el),
        rows: getTableRowsFromElement($, el)
      });

      return;
    }

    pushBlock({
      tag,
      block_type: 'block',
      list: null,
      list_number: null,
      in_table: false,
      text: cleanText($(el).text()),
      html: $.html(el),
      images: collectImages(el),
      table_indices: []
    });
  });

  return blocks.filter(b => b.text || (b.images && b.images.length > 0) || b.tag === 'table');
}

function isStandaloneQuestionNumber(text = '', targetSoal = 0) {
  const match = cleanText(text).match(/^(\d{1,3})[\.\)]?$/);
  if (!match) return false;

  const number = parseInt(match[1], 10);
  const target = Number(targetSoal || 0);

  if (Number.isNaN(number) || number < 1) return false;
  if (target > 0 && number > target) return false;

  return number;
}

function stripLeadingQuestionNumber(text = '') {
  return cleanText(text)
    .replace(/^(?:No\.?|Nomor|Soal|Soal\s+nomor|Pertanyaan)\s*[:.\-]?\s*\d{1,3}\s*[\.\):\-]?\s*/i, '')
    .replace(/^\d{1,3}\s*[\.\)]\s*/, '')
    .trim();
}

function stripOptionsFromPrompt(text = '') {
  const cleaned = cleanText(text);
  const optionIndex = cleaned.search(/\bA\s*[\.\)]\s+/i);

  if (optionIndex <= 0) return cleaned;
  return cleaned.slice(0, optionIndex).trim();
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeDocxTarget(target = '') {
  return String(target || '').replace(/^\/+/, '').replace(/^word\//, '');
}

function getXmlAttr($, el, name) {
  return $(el).attr(name) || $(el).attr(name.replace(/^.*:/, '')) || null;
}

function getXmlText($, el) {
  return getXmlElementTextDetails($, el).text;
}

function decodeDocxSymbol(font = '', char = '') {
  const normalizedChar = String(char || '').toUpperCase();
  const normalizedFont = String(font || '').toLowerCase();

  if (['2713', '2714', '2611'].includes(normalizedChar)) return '\u2713';
  if (['2612', '2715', '2716'].includes(normalizedChar)) return '\u2717';

  if (normalizedFont.includes('wingdings') || normalizedFont.includes('webdings')) {
    if (['F0FC', 'F052', '00FC'].includes(normalizedChar)) return '\u2713';
    if (['F0FB', 'F0FD', '00FB', '00FD'].includes(normalizedChar)) return '\u2717';
  }

  return '';
}

function isTruthyXmlVal(value) {
  if (value === undefined || value === null) return true;
  return !/^(?:0|false|off|none)$/i.test(String(value));
}

function getXmlRuns($, el) {
  const runs = [];

  $(el).find('w\\:r, r').each((_, run) => {
    const parts = [];
    const symbols = [];

    $(run).children().each((__, child) => {
      const tagName = (child.tagName || child.name || '').toLowerCase();

      if (tagName === 'w:t' || tagName === 't') {
        parts.push($(child).text());
        return;
      }

      if (tagName === 'w:tab' || tagName === 'tab') {
        parts.push(' ');
        return;
      }

      if (tagName === 'w:br' || tagName === 'br' || tagName === 'w:cr' || tagName === 'cr') {
        parts.push('\n');
        return;
      }

      if (tagName === 'w:sym' || tagName === 'sym') {
        const font = getXmlAttr($, child, 'w:font');
        const char = getXmlAttr($, child, 'w:char');
        const symbolText = decodeDocxSymbol(font, char);

        symbols.push({ font, char, text: symbolText });
        if (symbolText) parts.push(symbolText);
      }
    });

    const text = parts.join('');
    const rPr = $(run).children('w\\:rPr, rPr').first();
    const boldEl = rPr.children('w\\:b, b').first();
    const bold = boldEl.length > 0 && isTruthyXmlVal(getXmlAttr($, boldEl, 'w:val'));

    if (text || symbols.length > 0 || bold) {
      runs.push({
        text,
        clean_text: cleanText(text),
        bold,
        symbols
      });
    }
  });

  return runs;
}

function getXmlElementTextDetails($, el) {
  const runs = getXmlRuns($, el);
  const rawText = runs.map(run => run.text).join('');
  const cleanedText = cleanText(rawText);
  const textLength = runs.reduce((total, run) => total + cleanText(run.text).length, 0);
  const boldLength = runs.reduce((total, run) => (
    run.bold ? total + cleanText(run.text).length : total
  ), 0);
  const symbols = runs.flatMap(run => run.symbols || []);

  return {
    text: cleanedText,
    raw_text: rawText,
    runs,
    symbols,
    has_bold: runs.some(run => run.bold && cleanText(run.text)),
    bold_ratio: textLength > 0 ? boldLength / textLength : 0,
    is_all_bold: textLength > 0 && boldLength / textLength >= 0.82,
    has_checkmark: symbols.some(symbol => symbol.text === '\u2713') || /[\u2713\u2714\u2611]/.test(rawText),
    has_crossmark: symbols.some(symbol => symbol.text === '\u2717') || /[\u2717\u2716\u2612]/.test(rawText)
  };
}

function cellHasCheckmark(cell = {}) {
  const text = String(cell.text || cell.raw_text || '');
  return Boolean(cell.has_checkmark || /[\u2713\u2714\u2611]/.test(text));
}

function stripOptionLabelPrefix(value = '') {
  const cleaned = String(value || '')
    .replace(/^\s*\(?[A-Ea-e]\)?\s*[\.\)]\s*/, '')
    .trim();
  const safe = sanitizeImportHtmlForSave(cleaned);
  const plain = cleanText(safe.replace(/<[^>]*>/g, ''));
  if (!plain && !/<(img|table)\b/i.test(safe)) return null;
  return safe || null;
}

function normalizeImportAnswerArray(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(item => String(item || '').trim().toUpperCase()).filter(Boolean))]
      .filter(item => /^[A-E]$/.test(item))
      .sort();
  }

  if (typeof value === 'string') {
    return normalizeImportAnswerArray(value.split(/[,;\s]+/));
  }

  if (value && typeof value === 'object') {
    const labels = ['A', 'B', 'C', 'D', 'E'];

    return Object.entries(value)
      .filter(([, itemValue]) => itemValue === true || itemValue === 'true' || itemValue === 1 || itemValue === '1')
      .map(([key]) => (/^\d+$/.test(key) ? labels[Number(key)] : key).toUpperCase())
      .filter(item => /^[A-E]$/.test(item))
      .sort();
  }

  return [];
}

function sanitizeImportStatementList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => {
    if (typeof item === 'string') return sanitizeImportHtmlForSave(item);
    if (item && typeof item === 'object') {
      return {
        ...item,
        pernyataan: sanitizeImportHtmlForSave(item.pernyataan || item.text || item.isi || '')
      };
    }
    return '';
  });
}

function sanitizeMatchingPayloadForSave(value = {}) {
  const pasangan = value && typeof value === 'object' ? value : {};
  const kolomKiri = Array.isArray(pasangan.kolom_kiri)
    ? pasangan.kolom_kiri.map(item => sanitizeImportHtmlForSave(item))
    : [];
  const kolomKanan = Array.isArray(pasangan.kolom_kanan)
    ? pasangan.kolom_kanan.map((item, index) => {
        if (typeof item === 'string') {
          return {
            label: String.fromCharCode(97 + index),
            text: sanitizeImportHtmlForSave(item)
          };
        }

        return {
          ...item,
          label: String(item?.label || String.fromCharCode(97 + index)).toLowerCase(),
          text: sanitizeImportHtmlForSave(item?.text || item?.isi || item?.value || '')
        };
      })
    : [];

  return {
    ...pasangan,
    kolom_kiri: kolomKiri,
    kolom_kanan: kolomKanan,
    kunci: pasangan.kunci || {}
  };
}

function getImportChoiceValue(soal = {}, label = '') {
  const pilihanArray = Array.isArray(soal.pilihan) ? soal.pilihan : [];
  const index = 'ABCDE'.indexOf(String(label || '').toUpperCase());
  return stripOptionLabelPrefix(soal[`pilihan_${String(label || '').toLowerCase()}`] || pilihanArray[index] || '');
}

function tableHasAnyText(table = {}) {
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  return rows.some(row => Array.isArray(row) && row.some(cell => cleanText(cell || '')));
}

const LAYOUT_METADATA_ROLE = 'layout_blocks';
const LAYOUT_BLOCK_DEFINITIONS = [
  { type: 'question', id: 'question' },
  { type: 'stimulus', id: 'stimulus' },
  { type: 'image', id: 'images' },
  { type: 'table', id: 'tables' }
];

function isLayoutMetadataBlock(table = {}) {
  return (
    String(table?.role || '').toLowerCase() === LAYOUT_METADATA_ROLE ||
    String(table?.type || '').toLowerCase() === LAYOUT_METADATA_ROLE ||
    Array.isArray(table?.layout_blocks)
  );
}

function sanitizeLayoutBlocksForSave(blocks = []) {
  const allowed = new Map(LAYOUT_BLOCK_DEFINITIONS.map(item => [item.type, item]));
  const seen = new Set();
  const sanitized = [];

  if (Array.isArray(blocks)) {
    blocks.forEach((block) => {
      const type = String(block?.type || '').trim();
      const definition = allowed.get(type);
      if (!definition || seen.has(type)) return;
      seen.add(type);
      sanitized.push({ type, id: block?.id || definition.id });
    });
  }

  if (!seen.has('question')) {
    sanitized.unshift({ type: 'question', id: 'question' });
  }

  return sanitized;
}

function normalizeSupportingTables(soal = {}) {
  const fromSupporting = Array.isArray(soal.supporting_tables) ? soal.supporting_tables : [];
  const fromTabelData = Array.isArray(soal.tabel_data) ? soal.tabel_data : [];
  const source = fromSupporting.length > 0 ? fromSupporting : fromTabelData;

  return source
    .filter(table => !isLayoutMetadataBlock(table))
    .map((table, index) => ({
      index: table.index ?? index,
    table_index: table.table_index ?? table.index ?? index,
    source: table.source || 'auto',
    role: table.role || 'stimulus',
    caption: cleanText(table.caption || ''),
    width: ['50%', '75%', '100%'].includes(table.width) ? table.width : '100%',
    align: ['left', 'center', 'right'].includes(table.align) ? table.align : 'center',
    fontSize: ['12px', '14px', '16px', '18px'].includes(table.fontSize) ? table.fontSize : '14px',
    rows: Array.isArray(table.rows)
      ? table.rows.map(row => Array.isArray(row) ? row.map(cell => sanitizeImportHtmlForSave(String(cell ?? ''))) : [])
      : []
  }))
    .filter(table => table.source !== 'manual' || tableHasAnyText(table));
}

function buildLayoutBlocksForSave(soal = {}, tables = [], images = [], stimulusTambahan = '') {
  const activeTypes = new Set(['question']);
  if (stimulusTambahan) activeTypes.add('stimulus');
  if (images.length > 0 || soal.gambar_soal) activeTypes.add('image');
  if (tables.length > 0) activeTypes.add('table');

  const ordered = sanitizeLayoutBlocksForSave(soal.layout_blocks)
    .filter(block => activeTypes.has(block.type));
  const seen = new Set(ordered.map(block => block.type));

  LAYOUT_BLOCK_DEFINITIONS.forEach((definition) => {
    if (activeTypes.has(definition.type) && !seen.has(definition.type)) {
      ordered.push({ type: definition.type, id: definition.id });
    }
  });

  return ordered;
}

function buildLayoutMetadataForSave(soal = {}, normalizedImages = [], tables = []) {
  const stimulusRaw = String(soal.stimulus_tambahan || '').trim();
  const stimulusTambahan = stimulusRaw
    ? sanitizeImportHtmlForSave(/</.test(stimulusRaw) ? stimulusRaw : escapeHtml(stimulusRaw).replace(/\n/g, '<br>'))
    : '';

  const safeImages = normalizedImages.map((image, index) => ({
    src: image.src || (image.file_name ? `/uploads/soal/${image.file_name}` : null),
    file_name: image.file_name || null,
    caption: cleanText(image.caption || image.alt || ''),
    alt: cleanText(image.alt || image.caption || ''),
    ukuran: image.ukuran || 'sedang',
    width: ['25%', '50%', '75%', '100%'].includes(image.width) ? image.width : '75%',
    align: ['left', 'center', 'right'].includes(image.align) ? image.align : 'center',
    preview_height: image.preview_height || null,
    source: image.source || 'auto',
    index
  }));

  return {
    source: 'layout',
    role: LAYOUT_METADATA_ROLE,
    type: LAYOUT_METADATA_ROLE,
    layout_blocks: buildLayoutBlocksForSave(soal, tables, safeImages, stimulusTambahan),
    stimulus_tambahan: stimulusTambahan,
    gambar: safeImages
  };
}

function getQuestionTablesForSave(soal = {}, normalizedImages = []) {
  const tables = normalizeSupportingTables(soal);
  return [...tables, buildLayoutMetadataForSave(soal, normalizedImages, tables)];
}

function normalizeImportImageForSave(image = {}, index = 0) {
  const src = image.src || image.file_url || '';
  const fileName = image.file_name || getImageFileNameFromSrc(src);

  return {
    src: src || (fileName ? `/uploads/soal/${fileName}` : null),
    file_name: fileName || null,
    caption: cleanText(image.caption || image.alt || ''),
    alt: cleanText(image.alt || image.caption || ''),
    ukuran: image.ukuran || (
      Number(image.preview_height || 0) >= 300
        ? 'besar'
        : Number(image.preview_height || 0) <= 150
          ? 'kecil'
          : 'sedang'
    ),
    width: ['25%', '50%', '75%', '100%'].includes(image.width) ? image.width : '75%',
    align: ['left', 'center', 'right'].includes(image.align) ? image.align : 'center',
    preview_height: image.preview_height || null,
    source: image.source || 'auto',
    index
  };
}

function escapeHtmlAttribute(value = '') {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function renderImportSupportImageHtml(image = {}) {
  const src = image.src || (image.file_name ? `/uploads/soal/${image.file_name}` : '');
  if (!src) return '';

  const size = image.ukuran || 'sedang';
  const maxHeight = size === 'besar' ? 320 : size === 'kecil' ? 140 : 220;
  const caption = cleanText(image.caption || image.alt || '');
  const width = ['25%', '50%', '75%', '100%'].includes(image.width) ? image.width : '75%';
  const align = ['left', 'center', 'right'].includes(image.align) ? image.align : 'center';

  return [
    `<figure class="import-support-image import-support-image-${escapeHtmlAttribute(size)}" style="text-align:${escapeHtmlAttribute(align)};width:${escapeHtmlAttribute(width)};max-width:100%;">`,
    `<img src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(caption || 'Gambar pendukung soal')}" style="width:100%;max-width:100%;max-height:${maxHeight}px;object-fit:contain;" />`,
    caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '',
    '</figure>'
  ].join('');
}

function buildPertanyaanWithImportSupport(soal = {}, basePertanyaan = '') {
  const safeBasePertanyaan = sanitizeImportHtmlForSave(basePertanyaan || soal.raw_text || `Soal nomor ${soal.nomor || ''}`.trim());
  const stimulusRaw = String(soal.stimulus_tambahan || '').trim();
  const stimulusTambahan = stimulusRaw
    ? sanitizeImportHtmlForSave(/</.test(stimulusRaw) ? stimulusRaw : escapeHtml(stimulusRaw).replace(/\n/g, '<br>'))
    : '';
  const parts = [safeBasePertanyaan];
  const images = Array.isArray(soal.gambar)
    ? soal.gambar.map(normalizeImportImageForSave).filter(image => image.src || image.file_name)
    : [];

  if (stimulusTambahan) {
    parts.push(`<div class="import-stimulus-tambahan">${stimulusTambahan}</div>`);
  }

  // gambar_soal di database hanya satu field. Field itu tetap diisi gambar
  // pertama untuk kompatibilitas, tetapi semua gambar juga disisipkan ke
  // pertanyaan agar caption, ukuran, dan gambar tambahan tidak hilang.
  images.forEach((image) => {
    const html = renderImportSupportImageHtml(image);
    if (html) parts.push(html);
  });

  return parts.filter(Boolean).join('\n');
}

function validateImportPreviewBeforeSave(soalPreview = []) {
  const errors = [];

  soalPreview.forEach((soal, index) => {
    const nomor = soal.nomor || index + 1;
    const tipe = soal.tipe_soal || 'pilihan_ganda';
    const pertanyaan = htmlPlainText(soal.pertanyaan || '');
    const hasAD = ['A', 'B', 'C', 'D'].every(label => getImportChoiceValue(soal, label));

    if (!pertanyaan) {
      errors.push(`Soal nomor ${nomor} belum memiliki pertanyaan.`);
    }

    (Array.isArray(soal.supporting_tables) ? soal.supporting_tables : []).forEach((table, tableIndex) => {
      if (table.source === 'manual' && !tableHasAnyText(table)) {
        errors.push(`Soal nomor ${nomor} memiliki tabel manual kosong pada tabel ${tableIndex + 1}.`);
      }
    });

    if (tipe === 'pilihan_ganda') {
      if (!hasAD) errors.push(`Soal nomor ${nomor} minimal harus memiliki pilihan A-D.`);
      if (!soal.jawaban_benar) errors.push(`Soal nomor ${nomor} belum memiliki kunci jawaban.`);
    }

    if (tipe === 'ganda_kompleks') {
      if (!hasAD) errors.push(`Soal nomor ${nomor} minimal harus memiliki pilihan A-D.`);
      if (normalizeImportAnswerArray(soal.jawaban_benar_json).length === 0) {
        errors.push(`Soal nomor ${nomor} belum memiliki minimal satu jawaban benar.`);
      }
    }

    if (tipe === 'benar_salah') {
      const pernyataan = Array.isArray(soal.pernyataan_checklist) ? soal.pernyataan_checklist : [];
      const jawaban = soal.jawaban_benar_json && typeof soal.jawaban_benar_json === 'object' && !Array.isArray(soal.jawaban_benar_json)
        ? soal.jawaban_benar_json
        : {};

      if (pernyataan.length === 0) {
        errors.push(`Soal nomor ${nomor} belum memiliki pernyataan benar-salah.`);
      }

      pernyataan.forEach((item, itemIndex) => {
        const text = typeof item === 'string' ? item : item?.pernyataan;
        const key = String(itemIndex);

        if (!htmlPlainText(text || '')) {
          errors.push(`Soal nomor ${nomor} memiliki pernyataan benar-salah kosong pada baris ${itemIndex + 1}.`);
        }

        if (!Object.prototype.hasOwnProperty.call(jawaban, key) || jawaban[key] === null || jawaban[key] === '') {
          errors.push(`Soal nomor ${nomor} belum memiliki jawaban benar/salah untuk baris ${itemIndex + 1}.`);
        }
      });
    }

    if (tipe === 'menjodohkan') {
      const pasangan = soal.pasangan_menjodohkan || {};
      const kiri = Array.isArray(pasangan.kolom_kiri) ? pasangan.kolom_kiri : [];
      const kanan = Array.isArray(pasangan.kolom_kanan) ? pasangan.kolom_kanan : [];
      const kunci = pasangan.kunci || {};

      if (kiri.length === 0 || kanan.length === 0) {
        errors.push(`Soal nomor ${nomor} belum memiliki item kiri dan pilihan kanan menjodohkan.`);
      }

      kiri.forEach((item, itemIndex) => {
        if (!htmlPlainText(item || '')) {
          errors.push(`Soal nomor ${nomor} memiliki item kiri kosong pada baris ${itemIndex + 1}.`);
        }

        if (!kunci[String(itemIndex)]) {
          errors.push(`Soal nomor ${nomor} belum memiliki kunci menjodohkan untuk baris ${itemIndex + 1}.`);
        }
      });

      kanan.forEach((item, itemIndex) => {
        const text = typeof item === 'string' ? item : item?.text;
        if (!htmlPlainText(text || '')) {
          errors.push(`Soal nomor ${nomor} memiliki pilihan kanan kosong pada opsi ${itemIndex + 1}.`);
        }
      });
    }

    if (tipe === 'sebab_akibat') {
      if (!htmlPlainText(soal.pilihan_a || '')) {
        errors.push(`Soal nomor ${nomor} belum memiliki bagian pernyataan.`);
      }

      if (!htmlPlainText(soal.pilihan_b || '')) {
        errors.push(`Soal nomor ${nomor} belum memiliki bagian sebab.`);
      }

      if (!soal.jawaban_benar) errors.push(`Soal nomor ${nomor} belum memiliki kunci jawaban.`);
      if (String(soal.jawaban_benar || '').trim().toUpperCase() === 'E') {
        errors.push(`Soal nomor ${nomor} memiliki kunci E. Tipe sebab-akibat hanya memakai A-D.`);
      }
    }
  });

  return errors;
}

function buildImportQualityReport(soalPreview = [], options = {}) {
  const targetCount = Number(options.targetCount || 0);
  const assetMapping = options.assetMapping || null;
  const missingImagesWarning = [];
  const missingTablesWarning = [];
  const emptyOptions = [];
  const emptyKeys = [];
  const lowConfidenceQuestions = [];

  soalPreview.forEach((soal, index) => {
    const nomor = soal.nomor || index + 1;
    const tipe = soal.tipe_soal || 'pilihan_ganda';
    const textForCue = `${soal.pertanyaan || ''} ${soal.raw_text || ''}`;
    const pilihanMissing = ['A', 'B', 'C', 'D'].filter(label => !getImportChoiceValue(soal, label));
    const needsChoices = ['pilihan_ganda', 'ganda_kompleks', 'sebab_akibat'].includes(tipe);
    const tablesForQuestion = normalizeSupportingTables(soal);

    if (hasImageStimulusCue(textForCue) && (!Array.isArray(soal.gambar) || soal.gambar.length === 0)) {
      missingImagesWarning.push({
        nomor,
        tipe_soal: tipe,
        message: 'Soal menyebut gambar/grafik/infografis, tetapi belum ada gambar yang terpetakan.'
      });
    }

    if (hasTableStimulusCue(textForCue) && tablesForQuestion.length === 0) {
      missingTablesWarning.push({
        nomor,
        tipe_soal: tipe,
        message: 'Soal menyebut tabel/data, tetapi belum ada tabel yang terpetakan.'
      });
    }

    if (needsChoices && pilihanMissing.length > 0) {
      emptyOptions.push({
        nomor,
        tipe_soal: tipe,
        missing_labels: pilihanMissing
      });
    }

    if ((tipe === 'pilihan_ganda' || tipe === 'sebab_akibat') && !soal.jawaban_benar) {
      emptyKeys.push({
        nomor,
        tipe_soal: tipe,
        field: 'jawaban_benar'
      });
    }

    if (tipe === 'ganda_kompleks' && normalizeImportAnswerArray(soal.jawaban_benar_json).length === 0) {
      emptyKeys.push({
        nomor,
        tipe_soal: tipe,
        field: 'jawaban_benar_json'
      });
    }

    if (tipe === 'benar_salah') {
      const pernyataan = Array.isArray(soal.pernyataan_checklist) ? soal.pernyataan_checklist : [];
      const jawaban = soal.jawaban_benar_json && typeof soal.jawaban_benar_json === 'object' && !Array.isArray(soal.jawaban_benar_json)
        ? soal.jawaban_benar_json
        : {};
      const missingRows = pernyataan
        .map((_, itemIndex) => itemIndex)
        .filter(itemIndex => (
          !Object.prototype.hasOwnProperty.call(jawaban, String(itemIndex)) ||
          jawaban[String(itemIndex)] === null ||
          jawaban[String(itemIndex)] === ''
        ));

      if (pernyataan.length === 0 || missingRows.length > 0) {
        emptyKeys.push({
          nomor,
          tipe_soal: tipe,
          field: 'jawaban_benar_json',
          missing_rows: missingRows
        });
      }
    }

    if (tipe === 'menjodohkan') {
      const pasangan = soal.pasangan_menjodohkan || {};
      const kiri = Array.isArray(pasangan.kolom_kiri) ? pasangan.kolom_kiri : [];
      const kunci = pasangan.kunci || {};
      const missingRows = kiri
        .map((_, itemIndex) => itemIndex)
        .filter(itemIndex => !kunci[String(itemIndex)]);

      if (kiri.length === 0 || missingRows.length > 0) {
        emptyKeys.push({
          nomor,
          tipe_soal: tipe,
          field: 'pasangan_menjodohkan.kunci',
          missing_rows: missingRows
        });
      }
    }

    if (
      Number(soal.confidence || 0) < 0.75 ||
      soal.status_parse === 'perlu_dicek' ||
      (Array.isArray(soal.debug_extract?.warnings) && soal.debug_extract.warnings.length > 0)
    ) {
      lowConfidenceQuestions.push({
        nomor,
        tipe_soal: tipe,
        confidence: Number(soal.confidence || 0),
        status_parse: soal.status_parse || null,
        warnings: soal.debug_extract?.warnings || []
      });
    }
  });

  const unmappedImages = (assetMapping?.imageDebug || [])
    .filter(item => item.mapped_to_question_number === null && !item.duplicate_removed)
    .map(item => ({
      image_id: item.image_id,
      rel_id: item.rel_id,
      media_path: item.media_path,
      block_index: item.block_index,
      mapping_reason: item.mapping_reason
    }));

  const unmappedTables = (assetMapping?.tableDebug || [])
    .filter(item => item.mapped_to_question_number === null && !item.duplicate_removed)
    .map(item => ({
      table_id: item.table_id,
      table_index: item.table_index,
      block_index: item.block_index,
      mapping_reason: item.mapping_reason,
      preview: item.preview
    }));

  const saveBlockedReasons = validateImportPreviewBeforeSave(soalPreview);

  return {
    total_soal_target: targetCount,
    total_soal_detected: soalPreview.length,
    missing_images_warning: missingImagesWarning,
    missing_tables_warning: missingTablesWarning,
    unmapped_images: unmappedImages,
    unmapped_tables: unmappedTables,
    empty_options: emptyOptions,
    empty_keys: emptyKeys,
    low_confidence_questions: lowConfidenceQuestions,
    save_blocked_reasons: saveBlockedReasons
  };
}

function readDocxRelationshipsXml(relsXml = '') {
  const $ = cheerio.load(relsXml || '', { xmlMode: true });
  const rels = {};

  $('Relationship').each((_, rel) => {
    const id = $(rel).attr('Id');
    const target = $(rel).attr('Target');
    if (!id || !target) return;
    rels[id] = normalizeDocxTarget(target);
  });

  return rels;
}

function readDocxNumberingXml(numberingXml = '') {
  const $ = cheerio.load(numberingXml || '', { xmlMode: true });
  const abstractNums = {};
  const nums = {};

  $('w\\:abstractNum, abstractNum').each((_, abstractNum) => {
    const abstractNumId = getXmlAttr($, abstractNum, 'w:abstractNumId');
    if (!abstractNumId) return;

    const levels = {};

    $(abstractNum).find('w\\:lvl, lvl').each((__, lvl) => {
      const ilvl = getXmlAttr($, lvl, 'w:ilvl') || '0';
      const numFmt = getXmlAttr($, $(lvl).find('w\\:numFmt, numFmt').first(), 'w:val') || 'decimal';
      const start = parseInt(getXmlAttr($, $(lvl).find('w\\:start, start').first(), 'w:val') || '1', 10);

      levels[String(ilvl)] = {
        numFmt,
        start: Number.isNaN(start) ? 1 : start
      };
    });

    abstractNums[String(abstractNumId)] = { levels };
  });

  $('w\\:num, num').each((_, num) => {
    const numId = getXmlAttr($, num, 'w:numId');
    const abstractNumId = getXmlAttr($, $(num).find('w\\:abstractNumId, abstractNumId').first(), 'w:val');
    if (!numId || !abstractNumId) return;

    const overrides = {};
    $(num).find('w\\:lvlOverride, lvlOverride').each((__, override) => {
      const ilvl = getXmlAttr($, override, 'w:ilvl') || '0';
      const startOverride = parseInt(
        getXmlAttr($, $(override).find('w\\:startOverride, startOverride').first(), 'w:val') || '',
        10
      );

      if (!Number.isNaN(startOverride)) {
        overrides[String(ilvl)] = startOverride;
      }
    });

    nums[String(numId)] = {
      abstractNumId: String(abstractNumId),
      overrides
    };
  });

  return { abstractNums, nums };
}

function getParagraphNumbering($, paragraph, numberingState, numberingInfo) {
  const numPr = $(paragraph).children('w\\:pPr, pPr').first().children('w\\:numPr, numPr').first();
  if (!numPr.length) return null;

  const numId = getXmlAttr($, numPr.children('w\\:numId, numId').first(), 'w:val');
  const ilvl = getXmlAttr($, numPr.children('w\\:ilvl, ilvl').first(), 'w:val') || '0';

  if (!numId) return null;

  const num = numberingInfo.nums[String(numId)] || null;
  const abstractNum = num ? numberingInfo.abstractNums[num.abstractNumId] : null;
  const level = abstractNum?.levels?.[String(ilvl)] || {};
  const numFmt = level.numFmt || 'decimal';
  const key = `${numId}:${ilvl}`;

  if (numberingState[key] === undefined) {
    numberingState[key] = num?.overrides?.[String(ilvl)] || level.start || 1;
  } else {
    numberingState[key] += 1;
  }

  return {
    numId: String(numId),
    ilvl: String(ilvl),
    numFmt,
    number: numberingState[key]
  };
}

function extractImagesFromXmlElement($, el, rels, savedImages, imageCursor) {
  const images = [];

  $(el).find('a\\:blip, blip').each((_, blip) => {
    const relId = getXmlAttr($, blip, 'r:embed') || getXmlAttr($, blip, 'r:link');
    const mediaTarget = relId ? rels[relId] || null : null;
    const saved = savedImages[imageCursor.value] || null;

    images.push({
      index: imageCursor.value,
      relationship_id: relId || null,
      media_target: mediaTarget,
      src: saved?.file_url || null,
      file_name: saved?.file_name || (mediaTarget ? path.basename(mediaTarget) : null),
      alt: null
    });

    imageCursor.value += 1;
  });

  return images;
}

function buildParagraphHtml(text, images = []) {
  const imageHtml = images
    .map(image => image.src ? `<img src="${escapeHtml(image.src)}" />` : '')
    .filter(Boolean)
    .join('');

  return `<p>${escapeHtml(text)}${imageHtml}</p>`;
}

function buildTableHtml(rows = [], images = []) {
  const rowHtml = rows.map((row) => {
    const cellHtml = row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('');
    return `<tr>${cellHtml}</tr>`;
  }).join('');
  const imageHtml = images
    .map(image => image.src ? `<img src="${escapeHtml(image.src)}" />` : '')
    .filter(Boolean)
    .join('');

  return `<table>${rowHtml}</table>${imageHtml}`;
}

function extractTableDetailsFromXml($, table) {
  const rows = [];
  const cellData = [];

  $(table).children('w\\:tr, tr').each((_, tr) => {
    const cells = [];
    const metaCells = [];

    $(tr).children('w\\:tc, tc').each((__, tc) => {
      const details = getXmlElementTextDetails($, tc);

      cells.push(details.text);
      metaCells.push({
        text: details.text,
        raw_text: details.raw_text,
        runs: details.runs,
        symbols: details.symbols,
        has_bold: details.has_bold,
        bold_ratio: details.bold_ratio,
        is_all_bold: details.is_all_bold,
        has_checkmark: details.has_checkmark,
        has_crossmark: details.has_crossmark
      });
    });

    if (cells.length > 0) {
      rows.push(cells);
      cellData.push(metaCells);
    }
  });

  return { rows, cell_data: cellData };
}

function extractTableRowsFromXml($, table) {
  return extractTableDetailsFromXml($, table).rows;
}

function buildStructuredSegmentDebug(rawText, rawHtml, blocks, candidates, starts, segments, targetSoal) {
  const selectedKeys = new Set(starts.map(start => `${start.block_id}:${start.nomor}`));
  const imageMapping = [];
  const tableMapping = [];
  const assignedImages = new Set();
  const assignedTables = new Set();

  segments.forEach((segment) => {
    segment.blocks.forEach((block) => {
      (block.images || []).forEach((image) => {
        assignedImages.add(image.index);
        imageMapping.push({
          image_index: image.index,
          file_name: image.file_name,
          src: image.src,
          segment_number: segment.nomor,
          block_id: block.id,
          status: 'auto',
          reason: 'Posisi gambar berada di antara awal soal ini dan awal soal berikutnya.'
        });
      });

      if (block.tag === 'table') {
        assignedTables.add(block.table_index);
        tableMapping.push({
          table_index: block.table_index,
          segment_number: segment.nomor,
          block_id: block.id,
          status: 'auto',
          preview: truncatePreview((block.rows || []).map(row => row.join(' | ')).join(' / '), 240),
          reason: 'Posisi tabel berada di antara awal soal ini dan awal soal berikutnya.'
        });
      }
    });
  });

  blocks.forEach((block) => {
    (block.images || []).forEach((image) => {
      if (assignedImages.has(image.index)) return;

      imageMapping.push({
        image_index: image.index,
        file_name: image.file_name,
        src: image.src,
        segment_number: null,
        block_id: block.id,
        status: 'perlu_dicek',
        reason: 'Gambar berada di luar rentang segment soal yang terdeteksi.'
      });
    });

    if (block.tag === 'table' && !assignedTables.has(block.table_index)) {
      tableMapping.push({
        table_index: block.table_index,
        segment_number: null,
        block_id: block.id,
        status: 'perlu_dicek',
        preview: truncatePreview((block.rows || []).map(row => row.join(' | ')).join(' / '), 240),
        reason: 'Tabel berada di luar rentang segment soal yang terdeteksi.'
      });
    }
  });

  return {
    raw_text_preview: truncatePreview(rawText, 4000),
    raw_html_preview: truncatePreview(rawHtml, 4000),
    target_soal: Number(targetSoal || 0),
    detected_starts: starts.map(start => ({
      nomor: start.nomor,
      block_id: start.block_id,
      block_index: start.block_index,
      source: start.source,
      confidence: start.confidence,
      preview: truncatePreview(start.text, 180)
    })),
    start_reasons: candidates.map(candidate => ({
      nomor: candidate.nomor,
      block_id: candidate.block_id,
      block_index: candidate.block_index,
      source: candidate.source,
      selected: selectedKeys.has(`${candidate.block_id}:${candidate.nomor}`),
      note: candidate.note,
      preview: truncatePreview(candidate.text, 180)
    })),
    segment_numbers: segments.map(segment => segment.nomor),
    segment_previews: segments.map(segment => ({
      nomor: segment.nomor,
      block_ids: segment.blocks.map(block => block.id),
      preview: truncatePreview(segment.raw_text, 350)
    })),
    image_mapping: imageMapping,
    table_mapping: tableMapping
  };
}

function isLegacyQuestionStart(text = '') {
  const t = cleanText(text);

  return (
    /^Ayo Mengamati!/i.test(t) ||
    /^Ayo Analisis!/i.test(t) ||
    /^Ayo Analisis Hasil Eksperimen!/i.test(t) ||
    /^Ayo Tentukan Langkahmu!/i.test(t) ||
    /^Bacalah pernyataan berikut ini dengan cermat!/i.test(t) ||
    /^Perhatikan gambar dibawah ini!/i.test(t) ||
    /^Perhatikan infografik dibawah ini!/i.test(t) ||
    /^Perhatikan ingografik dibawah ini!/i.test(t) ||
    /^Seorang pasien mengalami kondisi medis/i.test(t) ||
    /^Seorang dokter sedang mendiagnosis/i.test(t) ||
    /^Berdasarkan teks di atas/i.test(t)
  );
}

function isAnswerOptionText(text = '') {
  const t = cleanText(text);
  return /^[A-Ea-e]\s*[\.\)]\s+/.test(t) || /^\([A-Ea-e]\)\s+/.test(t);
}

function isKunciOrInstruction(text = '') {
  const t = cleanText(text);
  return /^(Kunci Jawaban|Jawaban|Pembahasan|Petunjuk|Instruksi)\b/i.test(t);
}

function getQuestionStartMeta(block = {}, nextBlock = null) {
  const t = cleanText(block.text || '');
  const tag = String(block.tag || '').toLowerCase();

  if (!t || tag === 'table' || isAnswerOptionText(t) || isKunciOrInstruction(t)) {
    return { isStart: false };
  }

  if (isLegacyQuestionStart(t)) {
    return {
      isStart: true,
      source: 'legacy',
      status_parse: 'auto',
      confidence: 0.88,
      note: 'Awal soal terdeteksi dari frasa pembuka yang sudah dikenal.'
    };
  }

  const nextText = cleanText(nextBlock?.text || '');
  const nextLooksLikeOption = isAnswerOptionText(nextText);
  const isHeading = /^h[1-6]$/.test(tag);
  const hasQuestionCue = /\b(jelaskan|analisis|tentukan|pilih|berdasarkan|mengapa|bagaimana|perhatikan|bacalah|berikut|sebab|akibat)\b/i.test(t);

  const numberedWithPunctuation = /^\s*\d{1,2}[\.\)\-]\s+/.test(t);
  const numberedLabel = /^\s*(No\.?|Nomor|Soal|Soal\s+nomor|Pertanyaan)\s*[:.\-]?\s*\d{1,2}\b/i.test(t);
  const plainNumberPrefix = /^\s*\d{1,2}\s+/.test(t);

  if (numberedWithPunctuation || numberedLabel || (plainNumberPrefix && (nextLooksLikeOption || hasQuestionCue || isHeading))) {
    let confidence = 0.58;
    const notes = ['Awal soal terdeteksi dari pola nomor, perlu dicek guru.'];

    if (numberedWithPunctuation || numberedLabel) confidence += 0.12;
    if (nextLooksLikeOption) {
      confidence += 0.12;
      notes.push('Blok berikutnya tampak seperti pilihan A/B/C/D/E.');
    }
    if (isHeading) {
      confidence += 0.08;
      notes.push('Blok menggunakan tag heading dari dokumen Word.');
    }
    if (hasQuestionCue) confidence += 0.05;

    return {
      isStart: true,
      source: 'fallback_numbered',
      status_parse: 'perlu_dicek',
      confidence: Math.min(confidence, 0.82),
      note: notes.join(' ')
    };
  }

  return { isStart: false };
}

function isQuestionStart(text = '', block = null, nextBlock = null) {
  return getQuestionStartMeta(block || { text }, nextBlock).isStart;
}

function hasQuestionCue(text = '') {
  return /\b(jelaskan|analisis|tentukan|pilih|berdasarkan|mengapa|bagaimana|perhatikan|bacalah|berikut|sebab|akibat|fungsi|proses|hubungan)\b/i.test(text);
}

function getDomQuestionStartMeta(block = {}, nextBlock = null, targetSoal = 0) {
  const text = cleanText(block.text || '');
  const tag = String(block.tag || '').toLowerCase();
  const target = Number(targetSoal || 0);

  if (
    !text ||
    block.in_table ||
    tag === 'table' ||
    tag === 'tr' ||
    block.block_type === 'table' ||
    isAnswerOptionText(text) ||
    isKunciOrInstruction(text)
  ) {
    return { isStart: false };
  }

  const parseNumber = (value) => {
    const number = parseInt(value, 10);
    if (Number.isNaN(number) || number < 1) return null;
    if (target > 0 && number > target) return null;
    return number;
  };

  const labelMatch = text.match(/^(?:No\.?|Nomor|Soal|Soal\s+nomor)\s*[:.\-]?\s*(\d{1,3})\b/i);
  if (labelMatch) {
    const number = parseNumber(labelMatch[1]);
    if (number) {
      return {
        isStart: true,
        nomor: number,
        source: 'dom_number_label',
        status_parse: 'auto',
        confidence: 0.9,
        note: `Awal soal ${number} dari label nomor utama di luar tabel.`
      };
    }
  }

  const standaloneNumber = isStandaloneQuestionNumber(text, target);
  if (standaloneNumber) {
    const nextText = cleanText(nextBlock?.text || '');
    const nextIsUsable =
      !nextBlock?.in_table &&
      nextBlock?.tag !== 'table' &&
      !isKunciOrInstruction(nextText) &&
      !isAnswerOptionText(nextText);

    if (nextIsUsable || target > 0) {
      return {
        isStart: true,
        nomor: standaloneNumber,
        source: 'dom_standalone_number',
        status_parse: 'auto',
        confidence: nextIsUsable ? 0.92 : 0.78,
        note: `Awal soal ${standaloneNumber} dari blok nomor utama terpisah di luar tabel.`
      };
    }
  }

  const prefixMatch = text.match(/^(\d{1,3})(?:[\.\)]|:|\s+-\s+)\s*(.+)$/);
  if (prefixMatch) {
    const number = parseNumber(prefixMatch[1]);
    const afterNumber = cleanText(prefixMatch[2] || '');

    if (number && afterNumber) {
      return {
        isStart: true,
        nomor: number,
        source: 'dom_number_prefix',
        status_parse: 'auto',
        confidence: 0.88,
        note: `Awal soal ${number} dari nomor utama di awal blok luar tabel.`
      };
    }
  }

  const barePrefixMatch = text.match(/^(\d{1,3})\s+(.+)$/);
  if (barePrefixMatch) {
    const number = parseNumber(barePrefixMatch[1]);
    const afterNumber = cleanText(barePrefixMatch[2] || '');
    const nextText = cleanText(nextBlock?.text || '');

    if (number && afterNumber && (target > 0 || hasQuestionCue(afterNumber) || hasQuestionCue(nextText))) {
      return {
        isStart: true,
        nomor: number,
        source: 'dom_number_space_prefix',
        status_parse: 'perlu_dicek',
        confidence: 0.72,
        note: `Awal soal ${number} dari angka di awal blok luar tabel, perlu dicek.`
      };
    }
  }

  const isNumericOrderedList =
    block.list === 'ol' &&
    block.list_number &&
    (!block.list_type || ['1', 'decimal'].includes(block.list_type));

  if (isNumericOrderedList) {
    const number = parseNumber(block.list_number);

    if (number && (target > 0 || hasQuestionCue(text))) {
      return {
        isStart: true,
        nomor: number,
        source: 'dom_ordered_list',
        status_parse: target > 0 ? 'auto' : 'perlu_dicek',
        confidence: target > 0 ? 0.86 : 0.68,
        note: `Awal soal ${number} dari urutan list bernomor utama di luar tabel.`
      };
    }
  }

  return { isStart: false };
}

function selectSequentialStarts(candidates = [], targetSoal = 0) {
  const target = Number(targetSoal || 0);
  const selected = [];
  let lastNumber = 0;
  let lastBlockIndex = -1;
  const usedNumbers = new Set();

  for (const candidate of candidates) {
    if (candidate.block_index <= lastBlockIndex) continue;

    if (target > 0) {
      if (candidate.nomor < 1 || candidate.nomor > target) continue;
      if (candidate.nomor <= lastNumber) continue;
      if (usedNumbers.has(candidate.nomor)) continue;

      selected.push(candidate);
      lastBlockIndex = candidate.block_index;
      lastNumber = candidate.nomor;
      usedNumbers.add(candidate.nomor);

      if (selected.length >= target) break;
      continue;
    }

    if (selected.length === 0 || candidate.nomor > selected[selected.length - 1].nomor) {
      selected.push(candidate);
      lastBlockIndex = candidate.block_index;
    }
  }

  return selected;
}

function buildDomSegmentDebug(html, blocks, candidates, starts, segments, targetSoal) {
  const $ = cheerio.load(html || '');
  const rawText = cleanText($('body').length ? $('body').text() : $.root().text());
  const selectedKeys = new Set(starts.map(start => `${start.block_id}:${start.nomor}`));
  const imageMapping = [];
  const tableMapping = [];
  const assignedImages = new Set();
  const assignedTables = new Set();

  segments.forEach((segment) => {
    segment.blocks.forEach((block) => {
      (block.images || []).forEach((image) => {
        assignedImages.add(image.index);
        imageMapping.push({
          image_index: image.index,
          file_name: image.file_name,
          src: image.src,
          segment_number: segment.nomor,
          block_id: block.id,
          status: 'auto',
          reason: 'Posisi gambar berada di antara awal soal ini dan awal soal berikutnya.'
        });
      });

      if (block.tag === 'table') {
        assignedTables.add(block.table_index);
        tableMapping.push({
          table_index: block.table_index,
          segment_number: segment.nomor,
          block_id: block.id,
          status: 'auto',
          preview: truncatePreview((block.rows || []).map(row => row.join(' | ')).join(' / '), 240),
          reason: 'Posisi tabel berada di antara awal soal ini dan awal soal berikutnya.'
        });
      }
    });
  });

  blocks.forEach((block) => {
    (block.images || []).forEach((image) => {
      if (assignedImages.has(image.index)) return;

      imageMapping.push({
        image_index: image.index,
        file_name: image.file_name,
        src: image.src,
        segment_number: null,
        block_id: block.id,
        status: 'perlu_dicek',
        reason: 'Gambar berada di luar rentang segment soal yang terdeteksi.'
      });
    });

    if (block.tag === 'table' && !assignedTables.has(block.table_index)) {
      tableMapping.push({
        table_index: block.table_index,
        segment_number: null,
        block_id: block.id,
        status: 'perlu_dicek',
        preview: truncatePreview((block.rows || []).map(row => row.join(' | ')).join(' / '), 240),
        reason: 'Tabel berada di luar rentang segment soal yang terdeteksi.'
      });
    }
  });

  return {
    raw_text_preview: truncatePreview(rawText, 4000),
    raw_html_preview: truncatePreview(html, 4000),
    target_soal: Number(targetSoal || 0),
    detected_starts: starts.map(start => ({
      nomor: start.nomor,
      block_id: start.block_id,
      block_index: start.block_index,
      source: start.source,
      confidence: start.confidence,
      preview: truncatePreview(start.text, 180)
    })),
    start_reasons: candidates.map(candidate => ({
      nomor: candidate.nomor,
      block_id: candidate.block_id,
      block_index: candidate.block_index,
      source: candidate.source,
      selected: selectedKeys.has(`${candidate.block_id}:${candidate.nomor}`),
      note: candidate.note,
      preview: truncatePreview(candidate.text, 180)
    })),
    segment_numbers: segments.map(segment => segment.nomor),
    segment_previews: segments.map(segment => ({
      nomor: segment.nomor,
      block_ids: segment.blocks.map(block => block.id),
      preview: truncatePreview(segment.raw_text, 350)
    })),
    image_mapping: imageMapping,
    table_mapping: tableMapping
  };
}

function splitQuestionSegmentsFromHtml(html, targetSoal = 0) {
  const blocks = extractDomBlocksFromHtml(html);
  const candidates = [];

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const nextBlock = blocks[index + 1] || null;
    const meta = getDomQuestionStartMeta(block, nextBlock, targetSoal);

    if (!meta.isStart) continue;

    candidates.push({
      ...meta,
      block_id: block.id,
      block_index: index,
      text: block.text
    });
  }

  const starts = selectSequentialStarts(candidates, targetSoal);
  const segments = [];

  for (let index = 0; index < starts.length; index++) {
    const start = starts[index];
    const nextStart = starts[index + 1] || null;
    const segmentBlocks = blocks.slice(
      start.block_index,
      nextStart ? nextStart.block_index : blocks.length
    );
    const rawHtml = segmentBlocks.map(block => block.html).join('\n');
    const rawText = cleanText(segmentBlocks.map(block => block.text).join(' '));

    segments.push({
      nomor: start.nomor,
      blocks: segmentBlocks,
      raw_html: rawHtml,
      raw_text: rawText,
      startMeta: {
        isStart: true,
        source: start.source,
        status_parse: start.status_parse,
        confidence: start.confidence,
        note: start.note
      }
    });
  }

  return {
    blocks,
    candidates,
    starts,
    segments,
    debug: buildDomSegmentDebug(html, blocks, candidates, starts, segments, targetSoal)
  };
}

function isOptionLikeBlock(block = {}) {
  const text = cleanText(block.text || '');
  const numFmt = String(block.numbering?.numFmt || block.list_type || '').toLowerCase();

  if (isAnswerOptionText(text)) return true;
  if (/^[A-Ea-e]\s*[\.\)]?\s*$/.test(text)) return true;
  if (['lowerletter', 'upperletter', 'lowerroman', 'upperroman'].includes(numFmt)) return true;
  if (block.in_table || block.is_inside_table || block.tag === 'table') return false;

  return false;
}

function getBlockQuestionStartMeta(block = {}, nextBlock = null, targetSoal = 0) {
  const text = cleanText(block.text || '');
  const target = Number(targetSoal || 0);

  if (isOptionLikeBlock(block)) {
    return {
      isStart: false,
      ignored_option: true,
      reason: 'Blok tampak sebagai pilihan jawaban, bukan awal soal.'
    };
  }

  if (
    block.numbering &&
    block.numbering.ilvl === '0' &&
    String(block.numbering.numFmt || '').toLowerCase() === 'decimal'
  ) {
    const number = Number(block.numbering.number || 0);

    if (number >= 1 && (!target || number <= target)) {
      return {
        isStart: true,
        nomor: number,
        source: 'ooxml_numbering',
        status_parse: 'auto',
        confidence: 0.96,
        numbering_key: `${block.numbering.numId}:${block.numbering.ilvl}:${block.numbering.numFmt}`,
        note: `Awal soal ${number} dari automatic numbering OOXML.`
      };
    }
  }

  const meta = getDomQuestionStartMeta(block, nextBlock, targetSoal);

  if (meta.isStart) {
    return {
      ...meta,
      source: meta.source || 'fallback',
      numbering_key: block.numbering
        ? `${block.numbering.numId}:${block.numbering.ilvl}:${block.numbering.numFmt}`
        : null
    };
  }

  if (isLegacyQuestionStart(text)) {
    return {
      isStart: true,
      nomor: null,
      source: 'legacy_phrase',
      status_parse: 'perlu_dicek',
      confidence: 0.78,
      numbering_key: null,
      note: 'Awal soal dari frasa pembuka fallback.'
    };
  }

  return { isStart: false };
}

function buildStartsFromPrimaryNumbering(candidates = [], targetSoal = 0) {
  const target = Number(targetSoal || 0);
  const groups = {};

  candidates.forEach((candidate) => {
    if (!candidate.numbering_key || candidate.source !== 'ooxml_numbering') return;
    if (!groups[candidate.numbering_key]) groups[candidate.numbering_key] = [];
    groups[candidate.numbering_key].push(candidate);
  });

  let best = null;

  Object.entries(groups).forEach(([key, group]) => {
    const ordered = group
      .slice()
      .sort((a, b) => a.block_index - b.block_index);
    const selected = selectSequentialStarts(ordered, target);
    const numbers = selected.map(item => item.nomor);
    const maxNumber = numbers.length ? Math.max(...numbers) : 0;
    const hasOne = numbers.includes(1);
    const score =
      (hasOne ? 1000 : 0) +
      (target > 0 ? selected.length * 10 + Math.min(maxNumber, target) : selected.length * 10 + maxNumber) -
      Math.max(group.length - selected.length, 0);

    if (!best || score > best.score) {
      best = { key, selected, score, maxNumber };
    }
  });

  if (!best || best.selected.length === 0) return null;
  return best.selected;
}

function splitQuestionSegmentsFromBlocks(blocks = [], targetSoal = 0, strategy = 'ooxml_numbering') {
  const candidates = [];
  const optionBlocksIgnored = [];

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const nextBlock = blocks[index + 1] || null;
    const meta = getBlockQuestionStartMeta(block, nextBlock, targetSoal);

    if (meta.ignored_option || isOptionLikeBlock(block)) {
      if (cleanText(block.text || '')) {
        optionBlocksIgnored.push({
          block_id: block.id,
          block_index: index,
          text: truncatePreview(block.text, 160),
          reason: meta.reason || 'Pilihan jawaban tidak boleh menjadi awal soal.'
        });
      }
    }

    if (!meta.isStart) continue;

    candidates.push({
      ...meta,
      block_id: block.id,
      block_index: index,
      text: block.text || String(block.list_number || '')
    });
  }

  let starts = buildStartsFromPrimaryNumbering(candidates, targetSoal);

  if (!starts || starts.length === 0) {
    const numberedCandidates = candidates
      .filter(candidate => candidate.nomor)
      .sort((a, b) => a.block_index - b.block_index);
    starts = selectSequentialStarts(numberedCandidates, targetSoal);
  }

  if ((!starts || starts.length === 0) && candidates.some(candidate => candidate.source === 'legacy_phrase')) {
    starts = candidates
      .filter(candidate => candidate.source === 'legacy_phrase')
      .map((candidate, index) => ({
        ...candidate,
        nomor: index + 1,
        source: 'legacy_phrase'
      }));
  }

  const segments = [];

  for (let index = 0; index < starts.length; index++) {
    const start = starts[index];
    const nextStart = starts[index + 1] || null;
    const segmentBlocks = blocks.slice(
      start.block_index,
      nextStart ? nextStart.block_index : blocks.length
    );
    const rawHtml = segmentBlocks.map(block => block.html).join('\n');
    const rawText = cleanText(segmentBlocks.map(block => block.text).join(' '));

    segments.push({
      nomor: start.nomor || index + 1,
      blocks: segmentBlocks,
      raw_html: rawHtml,
      raw_text: rawText,
      startMeta: {
        isStart: true,
        source: start.source || strategy,
        status_parse: start.status_parse,
        confidence: start.confidence,
        note: start.note
      }
    });
  }

  const rawText = cleanText(blocks.map(block => block.text).join(' '));
  const rawHtml = blocks.map(block => block.html).join('\n');
  const warnings = [];

  if (targetSoal > 0 && segments.length < targetSoal) {
    warnings.push('Parser belum mampu memisahkan seluruh soal secara otomatis. Silakan cek Preview Dokumen Word dan gunakan Tambah Soal Manual.');
  }

  const debug = {
    ...buildStructuredSegmentDebug(rawText, rawHtml, blocks, candidates, starts || [], segments, targetSoal),
    strategy,
    total_blocks: blocks.length,
    total_segments: segments.length,
    option_blocks_ignored: optionBlocksIgnored,
    warnings
  };

  return {
    blocks,
    candidates,
    starts: starts || [],
    segments,
    debug
  };
}

async function extractDocxBlocksFromOOXML(filePath, savedImages = []) {
  if (!filePath || !fs.existsSync(filePath)) return [];

  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const documentXml = await zip.file('word/document.xml')?.async('string');

  if (!documentXml) return [];

  const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
  const numberingXml = await zip.file('word/numbering.xml')?.async('string');
  const rels = readDocxRelationshipsXml(relsXml || '');
  const numberingInfo = readDocxNumberingXml(numberingXml || '');
  const $ = cheerio.load(documentXml, { xmlMode: true });
  const blocks = [];
  const numberingState = {};
  const imageCursor = { value: 0 };
  let tableIndex = 0;

  const pushBlock = (block) => {
    const normalized = {
      id: blocks.length + 1,
      order: blocks.length,
      type: block.type || block.block_type || block.tag,
      is_inside_table: Boolean(block.is_inside_table || block.in_table),
      image_refs: block.image_refs || block.images || [],
      table_data: block.table_data || block.rows || null,
      style: block.style || {},
      ...block
    };

    blocks.push(normalized);
  };

  $('w\\:body, body').first().children().each((_, child) => {
    const tagName = (child.tagName || child.name || '').toLowerCase();

    if (tagName === 'w:p' || tagName === 'p') {
      const textDetails = getXmlElementTextDetails($, child);
      const text = textDetails.text;
      const images = extractImagesFromXmlElement($, child, rels, savedImages, imageCursor);
      const numbering = getParagraphNumbering($, child, numberingState, numberingInfo);
      const pPr = $(child).children('w\\:pPr, pPr').first();
      const styleId = getXmlAttr($, pPr.children('w\\:pStyle, pStyle').first(), 'w:val');

      if (!text && images.length === 0 && !numbering) return;

      pushBlock({
        tag: 'p',
        type: numbering ? 'list_item' : (images.length > 0 && !text ? 'image' : 'paragraph'),
        block_type: numbering ? 'list_item' : 'paragraph',
        list: numbering ? 'ol' : null,
        list_number: numbering?.number || null,
        list_type: numbering?.numFmt || null,
        numbering,
        in_table: false,
        is_inside_table: false,
        text,
        runs: textDetails.runs,
        raw_xml_text: textDetails.raw_text,
        has_bold: textDetails.has_bold,
        bold_ratio: textDetails.bold_ratio,
        is_all_bold: textDetails.is_all_bold,
        symbols: textDetails.symbols,
        has_checkmark: textDetails.has_checkmark,
        html: buildParagraphHtml(text, images),
        images,
        image_refs: images,
        table_indices: [],
        table_data: null,
        style: {
          pStyle: styleId || null
        }
      });

      return;
    }

    if (tagName === 'w:tbl' || tagName === 'tbl') {
      const tableDetails = extractTableDetailsFromXml($, child);
      const rows = tableDetails.rows;
      const text = cleanText(rows.map(row => row.join(' ')).join(' '));
      const images = extractImagesFromXmlElement($, child, rels, savedImages, imageCursor);
      const currentTableIndex = tableIndex;
      tableIndex += 1;

      if (!text && images.length === 0) return;

      pushBlock({
        tag: 'table',
        type: 'table',
        block_type: 'table',
        list: null,
        list_number: null,
        list_type: null,
        numbering: null,
        in_table: true,
        is_inside_table: true,
        table_index: currentTableIndex,
        text,
        html: buildTableHtml(rows, images),
        images,
        image_refs: images,
        rows,
        table_data: rows,
        cell_data: tableDetails.cell_data,
        style: {}
      });
    }
  });

  return blocks;
}

async function splitQuestionSegmentsFromDocx(docxPath, targetSoal = 0, savedImages = []) {
  const emptyResult = {
    blocks: [],
    candidates: [],
    starts: [],
    segments: [],
    debug: buildStructuredSegmentDebug('', '', [], [], [], [], targetSoal)
  };

  if (!docxPath || !fs.existsSync(docxPath)) {
    return emptyResult;
  }

  const blocksFromOOXML = await extractDocxBlocksFromOOXML(docxPath, savedImages);
  return splitQuestionSegmentsFromBlocks(blocksFromOOXML, targetSoal, 'ooxml_numbering');

  try {
    const zip = await JSZip.loadAsync(fs.readFileSync(docxPath));
    const documentXml = await zip.file('word/document.xml')?.async('string');

    if (!documentXml) return emptyResult;

    const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
    const numberingXml = await zip.file('word/numbering.xml')?.async('string');
    const rels = readDocxRelationshipsXml(relsXml || '');
    const numberingInfo = readDocxNumberingXml(numberingXml || '');
    const $ = cheerio.load(documentXml, { xmlMode: true });
    const blocks = [];
    const numberingState = {};
    const imageCursor = { value: 0 };
    let tableIndex = 0;

    const pushBlock = (block) => {
      blocks.push({
        id: blocks.length + 1,
        ...block
      });
    };

    $('w\\:body, body').first().children().each((_, child) => {
      const tagName = (child.tagName || child.name || '').toLowerCase();

      if (tagName === 'w:p' || tagName === 'p') {
        const text = getXmlText($, child);
        const images = extractImagesFromXmlElement($, child, rels, savedImages, imageCursor);
        const numbering = getParagraphNumbering($, child, numberingState, numberingInfo);

        if (!text && images.length === 0 && !numbering) return;

        pushBlock({
          tag: 'p',
          block_type: 'paragraph',
          list: numbering ? 'ol' : null,
          list_number: numbering?.number || null,
          list_type: numbering?.numFmt || null,
          numbering,
          in_table: false,
          text,
          html: buildParagraphHtml(text, images),
          images,
          table_indices: []
        });

        return;
      }

      if (tagName === 'w:tbl' || tagName === 'tbl') {
        const rows = extractTableRowsFromXml($, child);
        const text = cleanText(rows.map(row => row.join(' ')).join(' '));
        const images = extractImagesFromXmlElement($, child, rels, savedImages, imageCursor);
        const currentTableIndex = tableIndex;
        tableIndex += 1;

        if (!text && images.length === 0) return;

        pushBlock({
          tag: 'table',
          block_type: 'table',
          list: null,
          list_number: null,
          list_type: null,
          in_table: true,
          table_index: currentTableIndex,
          text,
          html: buildTableHtml(rows, images),
          images,
          rows
        });
      }
    });

    const candidates = [];

    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index];
      const nextBlock = blocks[index + 1] || null;
      let meta = getDomQuestionStartMeta(block, nextBlock, targetSoal);

      if (
        !meta.isStart &&
        block.numbering &&
        block.numbering.ilvl === '0' &&
        String(block.numbering.numFmt || '').toLowerCase() === 'decimal'
      ) {
        const number = block.numbering.number;
        const target = Number(targetSoal || 0);

        if (number >= 1 && (!target || number <= target)) {
          meta = {
            isStart: true,
            nomor: number,
            source: 'docx_numbering',
            status_parse: 'auto',
            confidence: 0.94,
            note: `Awal soal ${number} dari Word numbering asli di luar tabel.`
          };
        }
      }

      if (!meta.isStart) continue;

      candidates.push({
        ...meta,
        block_id: block.id,
        block_index: index,
        text: block.text || String(block.list_number || '')
      });
    }

    const starts = selectSequentialStarts(candidates, targetSoal);
    const segments = [];

    for (let index = 0; index < starts.length; index++) {
      const start = starts[index];
      const nextStart = starts[index + 1] || null;
      const segmentBlocks = blocks.slice(
        start.block_index,
        nextStart ? nextStart.block_index : blocks.length
      );
      const rawHtml = segmentBlocks.map(block => block.html).join('\n');
      const rawText = cleanText(segmentBlocks.map(block => block.text).join(' '));

      segments.push({
        nomor: start.nomor,
        blocks: segmentBlocks,
        raw_html: rawHtml,
        raw_text: rawText,
        startMeta: {
          isStart: true,
          source: start.source,
          status_parse: start.status_parse,
          confidence: start.confidence,
          note: start.note
        }
      });
    }

    const rawText = cleanText(blocks.map(block => block.text).join(' '));
    const rawHtml = blocks.map(block => block.html).join('\n');

    return {
      blocks,
      candidates,
      starts,
      segments,
      debug: buildStructuredSegmentDebug(rawText, rawHtml, blocks, candidates, starts, segments, targetSoal)
    };
  } catch (err) {
    return {
      ...emptyResult,
      error: err.message,
      debug: {
        ...emptyResult.debug,
        error: err.message
      }
    };
  }
}

function extractTablesFromHtml(rawHtml) {
  const $ = cheerio.load(rawHtml || '');
  const tables = [];

  $('table').each((tableIndex, table) => {
    const rows = [];

    $(table).find('tr').each((_, tr) => {
      const cells = [];
      $(tr).find('td, th').each((__, cell) => {
        cells.push(cleanText($(cell).text()));
      });

      if (cells.length > 0) rows.push(cells);
    });

    if (rows.length > 0) {
      tables.push({
        index: tableIndex,
        rows
      });
    }
  });

  return tables;
}

function extractImages(rawHtml) {
  const $ = cheerio.load(rawHtml || '');
  const images = [];

  $('img').each((_, img) => {
    const src = $(img).attr('src') || null;
    images.push({
      src,
      file_name: getImageFileNameFromSrc(src),
      alt: $(img).attr('alt') || null
    });
  });

  return images;
}

function hasAssetStimulusCue(text = '', kinds = ['image', 'table']) {
  const cleaned = cleanText(text);
  if (!cleaned) return false;

  const kindList = Array.isArray(kinds) ? kinds : [kinds];
  const words = [];

  if (kindList.includes('image')) {
    words.push('gambar', 'grafik', 'infografis', 'infografik', 'diagram', 'ilustrasi', 'foto', 'bagan', 'kurva', 'spirogram');
  }

  if (kindList.includes('table')) {
    words.push('tabel', 'table', 'data');
  }

  if (words.length === 0) return false;

  const wordPattern = words.join('|');
  const cueBeforeAsset = new RegExp(`\\b(?:perhatikan|berdasarkan|amati|cermati|lihat|gunakan)\\b[\\s\\S]{0,90}\\b(?:${wordPattern})\\b`, 'i');
  const assetBeforeReference = new RegExp(`\\b(?:${wordPattern})\\b[\\s\\S]{0,90}\\b(?:berikut|di\\s*bawah|dibawah|di\\s*atas|tersebut|ini)\\b`, 'i');

  return cueBeforeAsset.test(cleaned) || assetBeforeReference.test(cleaned);
}

function hasImageStimulusCue(text = '') {
  return hasAssetStimulusCue(text, ['image']);
}

function hasTableStimulusCue(text = '') {
  return hasAssetStimulusCue(text, ['table']);
}

function getImageIdentity(image = {}) {
  if (image.hash) return `hash:${image.hash}`;
  if (image.base64_hash) return `base64:${image.base64_hash}`;
  if (image.relationship_id) return `rel:${image.relationship_id}`;
  if (image.media_target) return `media:${image.media_target}`;
  if (image.file_name) return `file:${image.file_name}`;
  if (image.src) return `src:${image.src}`;
  return image.index !== undefined && image.index !== null ? `idx:${image.index}` : '';
}

function normalizePreviewImage(image = {}) {
  return {
    src: image.src || null,
    file_name: image.file_name || (image.media_target ? path.basename(image.media_target) : null),
    alt: image.alt || null,
    relationship_id: image.relationship_id || null,
    media_target: image.media_target || null,
    index: image.index ?? null
  };
}

function findSegmentStartForBlock(starts = [], blockIndex = -1) {
  let selected = null;

  for (const start of starts) {
    if (start.block_index > blockIndex) break;
    selected = start;
  }

  return selected;
}

function findNextStartForBlock(starts = [], blockIndex = -1) {
  return starts.find(start => start.block_index > blockIndex) || null;
}

function looksLikeTwoColumnPairTable(block = {}) {
  const rows = block.rows || block.table_data || [];
  const dataRows = rows.filter(row => Array.isArray(row) && row.filter(cell => cleanText(cell)).length >= 2);

  if (dataRows.length < 3) return false;

  const headerText = cleanText((rows[0] || []).join(' ')).toLowerCase();
  if (headerText.includes('benar') && headerText.includes('salah')) return false;

  return dataRows.every(row => row.length >= 2);
}

function hasMatchingCueInBlockRange(blocks = [], fromIndex = 0, toIndex = blocks.length) {
  const text = cleanText(
    blocks
      .slice(Math.max(0, fromIndex), Math.max(fromIndex, toIndex))
      .map(block => block.text || '')
      .join(' ')
  );

  return extractMatchingKeyCandidates(text).length > 0 ||
    /\b(jodohkan|menjodohkan|pasangkan|hubungkan|mencocokkan|hubungan\s+antara)\b/i.test(text);
}

function hasNearbyForwardAssetCue(blocks = [], assetBlockIndex = -1, nextStart = null, kind = 'image') {
  if (!nextStart) return false;
  if (nextStart.block_index - assetBlockIndex > 4) return false;

  const from = Math.max(0, assetBlockIndex - 3);
  const to = Math.min(nextStart.block_index, assetBlockIndex + 2);

  for (let index = from; index <= to; index++) {
    if (hasAssetStimulusCue(blocks[index]?.text || '', [kind])) return true;
  }

  return false;
}

function mapAssetBlockToQuestion(blocks = [], starts = [], blockIndex = -1, kind = 'image', assetBlock = null) {
  const firstStart = starts[0] || null;
  const currentStart = findSegmentStartForBlock(starts, blockIndex);
  const nextStart = findNextStartForBlock(starts, blockIndex);
  const tableRole = kind === 'table' ? classifyTableBlock(assetBlock || blocks[blockIndex] || {}) : null;
  const isLikelyCurrentMatchingTable =
    kind === 'table' &&
    currentStart &&
    looksLikeTwoColumnPairTable(assetBlock || blocks[blockIndex] || {}) &&
    hasMatchingCueInBlockRange(
      blocks,
      currentStart.block_index,
      nextStart ? nextStart.block_index : blocks.length
    );
  const isStructuredAnswerTable = tableRole === 'benar_salah' || tableRole === 'menjodohkan' || isLikelyCurrentMatchingTable;

  if (!firstStart) {
    return {
      mappedQuestion: null,
      mappingReason: 'no_question_start_found',
      status: 'perlu_dicek',
      confidence: 0.3
    };
  }

  if (blockIndex < firstStart.block_index) {
    const hasCue = hasNearbyForwardAssetCue(blocks, blockIndex, firstStart, kind) ||
      hasAssetStimulusCue(blocks[blockIndex]?.text || '', [kind]);

    return {
      mappedQuestion: firstStart.nomor,
      mappingReason: hasCue
        ? `${kind}_before_first_question_with_stimulus_cue`
        : `${kind}_before_first_question_mapped_to_question_1`,
      status: hasCue ? 'auto' : 'perlu_dicek',
      confidence: hasCue ? 0.9 : 0.72
    };
  }

  if (!isStructuredAnswerTable && hasNearbyForwardAssetCue(blocks, blockIndex, nextStart, kind)) {
    return {
      mappedQuestion: nextStart.nomor,
      mappingReason: `${kind}_with_stimulus_cue_before_next_question`,
      status: 'auto',
      confidence: 0.9
    };
  }

  if (currentStart) {
    return {
      mappedQuestion: currentStart.nomor,
      mappingReason: `${kind}_between_question_starts`,
      status: 'auto',
      confidence: 0.86
    };
  }

  return {
    mappedQuestion: null,
    mappingReason: 'no_question_range_found',
    status: 'perlu_dicek',
    confidence: 0.35
  };
}

function getTableIdentity(block = {}) {
  if (block.table_index !== undefined && block.table_index !== null) return `table:${block.table_index}`;
  const rows = block.rows || block.table_data || [];
  return rows.length > 0
    ? `rows:${rows.map(row => row.join('|')).join('||')}`
    : `block:${block.id || block.order || ''}`;
}

function normalizePreviewTable(block = {}, index = 0, mapping = {}) {
  return {
    index,
    table_index: block.table_index ?? index,
    rows: block.rows || block.table_data || [],
    block_index: mapping.blockIndex ?? block.order ?? null,
    block_id: block.id || null,
    mapped_question: mapping.mappedQuestion ?? null,
    mapping_reason: mapping.mappingReason || null,
    role: mapping.role || classifyTableBlock(block),
    preview: truncatePreview((block.rows || block.table_data || []).map(row => row.join(' | ')).join(' / '), 240)
  };
}

function buildPreviewAssetMapping(docxResult = null) {
  const blocks = docxResult?.blocks || [];
  const starts = (docxResult?.starts || [])
    .slice()
    .sort((a, b) => a.block_index - b.block_index);
  const imagesByQuestion = {};
  const tablePreviewsByQuestion = {};
  const tableBlocksByQuestion = {};
  const imageQuestionByIndex = {};
  const tableQuestionByBlockIndex = {};
  const warningsByQuestion = {};
  const seenImagesByQuestion = {};
  const seenTablesByQuestion = {};
  const imageDebug = [];
  const tableDebug = [];

  if (blocks.length === 0 || starts.length === 0) {
    return {
      imagesByQuestion,
      tablePreviewsByQuestion,
      tableBlocksByQuestion,
      imageQuestionByIndex,
      tableQuestionByBlockIndex,
      warningsByQuestion,
      imageDebug,
      tableDebug,
      debug: imageDebug
    };
  }

  const addWarning = (questionNumber, message) => {
    if (!questionNumber) return;
    if (!warningsByQuestion[questionNumber]) warningsByQuestion[questionNumber] = [];
    if (!warningsByQuestion[questionNumber].includes(message)) warningsByQuestion[questionNumber].push(message);
  };

  blocks.forEach((block, blockIndex) => {
    (block.images || []).forEach((image) => {
      const mapping = mapAssetBlockToQuestion(blocks, starts, blockIndex, 'image', block);
      const mappedQuestion = mapping.mappedQuestion;
      const identity = getImageIdentity(image);

      if (mappedQuestion === null) {
        imageDebug.push({
          image_id: image.index ?? identity ?? null,
          rel_id: image.relationship_id || null,
          media_path: image.media_target || null,
          file_name: image.file_name || null,
          block_index: blockIndex,
          block_id: block.id || null,
          mapped_to_question_number: null,
          mapping_reason: mapping.mappingReason,
          duplicate_removed: false,
          confidence: mapping.confidence,
          status: mapping.status
        });
        return;
      }

      if (!imagesByQuestion[mappedQuestion]) imagesByQuestion[mappedQuestion] = [];
      if (!seenImagesByQuestion[mappedQuestion]) seenImagesByQuestion[mappedQuestion] = new Set();

      const duplicateRemoved = Boolean(identity && seenImagesByQuestion[mappedQuestion].has(identity));

      imageDebug.push({
        image_id: image.index ?? identity ?? null,
        rel_id: image.relationship_id || null,
        media_path: image.media_target || null,
        file_name: image.file_name || null,
        block_index: blockIndex,
        block_id: block.id || null,
        mapped_to_question_number: mappedQuestion,
        mapping_reason: duplicateRemoved ? 'duplicate_image_removed' : mapping.mappingReason,
        duplicate_removed: duplicateRemoved,
        confidence: mapping.confidence,
        image_index: image.index ?? null,
        src: image.src || null,
        segment_number: mappedQuestion,
        status: duplicateRemoved ? 'duplicate_removed' : mapping.status,
        reason: duplicateRemoved ? 'Gambar duplikat di soal yang sama dihapus.' : mapping.mappingReason
      });

      if (duplicateRemoved) return;

      if (mapping.status === 'perlu_dicek') {
        addWarning(mappedQuestion, 'Mapping gambar perlu dicek guru karena posisinya tidak sepenuhnya jelas.');
      }

      if (identity) seenImagesByQuestion[mappedQuestion].add(identity);
      if (image.index !== undefined && image.index !== null) imageQuestionByIndex[image.index] = mappedQuestion;
      imagesByQuestion[mappedQuestion].push(normalizePreviewImage(image));
    });

    if (block.tag === 'table' || block.block_type === 'table') {
      const mapping = mapAssetBlockToQuestion(blocks, starts, blockIndex, 'table', block);
      const mappedQuestion = mapping.mappedQuestion;
      const identity = getTableIdentity(block);
      const tableId = block.table_index ?? identity ?? null;

      if (mappedQuestion === null) {
        tableDebug.push({
          table_id: tableId,
          table_index: block.table_index ?? null,
          block_index: blockIndex,
          block_id: block.id || null,
          mapped_to_question_number: null,
          mapping_reason: mapping.mappingReason,
          duplicate_removed: false,
          confidence: mapping.confidence,
          status: mapping.status,
          preview: truncatePreview((block.rows || block.table_data || []).map(row => row.join(' | ')).join(' / '), 240)
        });
        return;
      }

      if (!tablePreviewsByQuestion[mappedQuestion]) tablePreviewsByQuestion[mappedQuestion] = [];
      if (!tableBlocksByQuestion[mappedQuestion]) tableBlocksByQuestion[mappedQuestion] = [];
      if (!seenTablesByQuestion[mappedQuestion]) seenTablesByQuestion[mappedQuestion] = new Set();

      const duplicateRemoved = Boolean(identity && seenTablesByQuestion[mappedQuestion].has(identity));

      tableDebug.push({
        table_id: tableId,
        table_index: block.table_index ?? null,
        block_index: blockIndex,
        block_id: block.id || null,
        mapped_to_question_number: mappedQuestion,
        mapping_reason: duplicateRemoved ? 'duplicate_table_removed' : mapping.mappingReason,
        duplicate_removed: duplicateRemoved,
        confidence: mapping.confidence,
        status: duplicateRemoved ? 'duplicate_removed' : mapping.status,
        preview: truncatePreview((block.rows || block.table_data || []).map(row => row.join(' | ')).join(' / '), 240)
      });

      if (duplicateRemoved) return;

      if (mapping.status === 'perlu_dicek') {
        addWarning(mappedQuestion, 'Mapping tabel perlu dicek guru karena posisinya tidak sepenuhnya jelas.');
      }

      if (identity) seenTablesByQuestion[mappedQuestion].add(identity);
      tableQuestionByBlockIndex[blockIndex] = mappedQuestion;
      tableBlocksByQuestion[mappedQuestion].push({
        ...block,
        _mapped_block_index: blockIndex,
        _mapped_question: mappedQuestion,
        _mapping_reason: mapping.mappingReason
      });
      tablePreviewsByQuestion[mappedQuestion].push(normalizePreviewTable(block, tablePreviewsByQuestion[mappedQuestion].length, {
        blockIndex,
        mappedQuestion,
        mappingReason: mapping.mappingReason
      }));
    }
  });

  return {
    imagesByQuestion,
    tablePreviewsByQuestion,
    tableBlocksByQuestion,
    imageQuestionByIndex,
    tableQuestionByBlockIndex,
    warningsByQuestion,
    imageDebug,
    tableDebug,
    debug: imageDebug
  };
}

function buildPreviewImageMapping(docxResult = null) {
  const mapping = buildPreviewAssetMapping(docxResult);

  return {
    imagesByQuestion: mapping.imagesByQuestion,
    debug: mapping.imageDebug
  };
}

function getTextLinesFromHtml(rawHtml = '') {
  const $ = cheerio.load(rawHtml || '');

  $('br').replaceWith('\n');
  $('p, li, tr, h1, h2, h3, h4, h5, h6').each((_, el) => {
    $(el).append('\n');
  });

  return $.root().text()
    .split(/\n+/)
    .map(line => cleanText(line))
    .filter(Boolean);
}

function normalizeOptionText(label, value) {
  const cleaned = cleanText(value)
    .replace(/^\(?[A-Ea-e]\)?\s*[\.\)]\s*/, '')
    .replace(/\bJawaban\s*:.*$/i, '')
    .replace(/\bKunci\s+Jawaban\s*:.*$/i, '')
    .trim();

  if (!cleaned) return null;
  return cleaned;
}

function extractOptionTextsFromQuestion(question) {
  const pilihan = [];
  const seen = new Set();

  const addOption = (label, value) => {
    const option = normalizeOptionText(label, value);
    if (!option) return;

    const key = option.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    pilihan.push(option);
  };

  for (let i = 1; i < (question.blocks || []).length; i++) {
    const block = question.blocks[i];
    const match = cleanText(block.text || '').match(/^([A-Ea-e])\s*[\.\)]\s*(.+)$/);

    if (!match) continue;
    if (isQuestionStart(block.text)) continue;
    if (/^Kunci Jawaban/i.test(block.text)) continue;

    addOption(match[1], match[2]);
  }

  getTextLinesFromHtml(question.raw_html || '').forEach((line) => {
    const match = line.match(/^([A-Ea-e])\s*[\.\)]\s*(.+)$/);
    if (!match) return;

    addOption(match[1], match[2]);
  });

  if (pilihan.length < 4) {
    const compact = cleanText(question.raw_text || '');
    const regex = /\b([A-Ea-e])\s*[\.\)]\s*(.+?)(?=\s+[A-Ea-e]\s*[\.\)]|$)/g;
    let match;

    while ((match = regex.exec(compact)) !== null) {
      addOption(match[1], match[2]);
    }
  }

  return pilihan.slice(0, 5);
}

function htmlHasBenarSalahTable(rawHtml = '') {
  const $ = cheerio.load(rawHtml || '');
  let found = false;

  $('table').each((_, table) => {
    const firstRowsText = $(table).find('tr').slice(0, 2).map((__, tr) => cleanText($(tr).text())).get().join(' ').toLowerCase();

    if (firstRowsText.includes('benar') && firstRowsText.includes('salah')) {
      found = true;
      return false;
    }
  });

  return found;
}

function detectTipeSoal(question) {
  const rawText = String(question.raw_text || '');
  const text = rawText.toLowerCase();

  if (/\bsebab\b/i.test(rawText)) {
    return 'sebab_akibat';
  }

  if (
    htmlHasBenarSalahTable(question.raw_html || '') ||
    /benar\s*\/\s*salah/i.test(rawText) ||
    /\bbenar\b[\s\S]{0,80}\bsalah\b/i.test(rawText)
  ) {
    return 'benar_salah';
  }

  if (
    /\b(jodohkan|menjodohkan|pasangkan|hubungkan|mencocokkan)\b/i.test(rawText) ||
    /\b1\s*[-–]\s*[a-zA-Z]\b[\s,;.]+2\s*[-–]\s*[a-zA-Z]\b/.test(rawText) ||
    (text.includes('kunci jawaban') && text.includes('hubungan') && /<table/i.test(question.raw_html || ''))
  ) {
    return 'menjodohkan';
  }

  if (
    /jawaban\s+lebih\s+dari\s+satu/i.test(rawText) ||
    /berikanlah\s+tanda\s+centang/i.test(rawText) ||
    /pilihlah\s+pernyataan\s+yang\s+benar/i.test(rawText) ||
    /pernyataan\s+yang\s+benar/i.test(rawText)
  ) {
    return 'ganda_kompleks';
  }

  if (extractOptionTextsFromQuestion(question).length >= 4) {
    return 'pilihan_ganda';
  }

  return 'pilihan_ganda';
}

function extractPilihanFromQuestion(question) {
  return extractOptionTextsFromQuestion(question);
}

function extractGandaKompleks(question) {
  return extractOptionTextsFromQuestion(question);
}

function extractBenarSalah(question) {
  const $ = cheerio.load(question.raw_html || '');
  const pernyataan = [];
  const jawaban = {};

  $('table').each((_, table) => {
    const headerText = cleanText($(table).find('tr').first().text()).toLowerCase();

    if (!headerText.includes('benar') || !headerText.includes('salah')) {
      return;
    }

    $(table).find('tr').each((rowIndex, tr) => {
      if (rowIndex === 0) return;

      const cells = $(tr).find('td, th');
      if (cells.length < 4) return;

      const isiPernyataan = cleanText($(cells[1]).text());
      const benarCell = cleanText($(cells[2]).text());
      const salahCell = cleanText($(cells[3]).text());

      if (!isiPernyataan) return;

      const idx = pernyataan.length;
      pernyataan.push(isiPernyataan);

      if (salahCell.includes('✓') || salahCell.includes('√') || /salah/i.test(salahCell)) {
        jawaban[String(idx)] = false;
      } else if (benarCell.includes('✓') || benarCell.includes('√') || /benar/i.test(benarCell)) {
        jawaban[String(idx)] = true;
      } else {
        jawaban[String(idx)] = null;
      }
    });
  });

  return {
    pernyataan_checklist: pernyataan,
    jawaban_benar_json: jawaban
  };
}

function normalizeKunciMenjodohkan(rawKunci = '') {
  const kunci = {};
  const cleaned = String(rawKunci)
    .replace(/\./g, ',')
    .replace(/;/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  const parts = cleaned.split(',').map(v => v.trim()).filter(Boolean);

  parts.forEach(item => {
    // Mendukung format: 1-b, 2-d, 3-a, 4-c, atau 4b
    const match = item.match(/(\d+)\s*-?\s*([a-zA-Z])/);
    if (!match) return;

    const nomorIndex = parseInt(match[1], 10) - 1;
    const label = match[2].toLowerCase();

    if (!Number.isNaN(nomorIndex) && nomorIndex >= 0) {
      kunci[String(nomorIndex)] = label;
    }
  });

  return kunci;
}

function extractMenjodohkan(question) {
  const $ = cheerio.load(question.raw_html || '');
  const kolomKiri = [];
  const kolomKanan = [];
  const labels = 'abcdefghijklmnopqrstuvwxyz'.split('');

  $('table').first().find('tr').each((rowIndex, tr) => {
    if (rowIndex === 0) return;

    const cells = $(tr).find('td, th');
    if (cells.length < 2) return;

    const kiri = cleanText($(cells[0]).text());
    const kanan = cleanText($(cells[1]).text());

    if (kiri) kolomKiri.push(kiri);
    if (kanan) {
      kolomKanan.push({
        label: labels[kolomKanan.length] || String(kolomKanan.length + 1),
        text: kanan
      });
    }
  });

  let kunci = {};
  const matchKunci = (question.raw_text || '').match(/Kunci Jawaban\s*:\s*(.+)$/i);
  if (matchKunci) {
    kunci = normalizeKunciMenjodohkan(matchKunci[1]);
  }

  return {
    kolom_kiri: kolomKiri,
    kolom_kanan: kolomKanan,
    kunci
  };
}

// OOXML-aware field extractor. These declarations intentionally override the
// older HTML-first helpers above while preserving the existing segment splitter.
function normalizeOptionText(label, value) {
  const cleaned = cleanText(value)
    .replace(/^\(?[A-Ea-e]\)?\s*[\.\)]\s*/, '')
    .replace(/\bJawaban\s*:.*$/i, '')
    .replace(/\bKunci\s+Jawaban\s*:.*$/i, '')
    .trim();

  if (!cleaned) return null;
  return cleaned;
}

function alphaLabelFromNumber(number) {
  const index = Number(number || 0);
  if (index < 1 || index > 26) return null;
  return String.fromCharCode(64 + index);
}

function getOptionLabelFromNumbering(block = {}) {
  const numFmt = String(block.numbering?.numFmt || block.list_type || '').toLowerCase();
  if (!['upperletter', 'lowerletter'].includes(numFmt)) return null;

  const label = alphaLabelFromNumber(block.numbering?.number || block.list_number);
  if (!label || !/^[A-E]$/.test(label)) return null;
  return label;
}

function splitExplicitOptionsFromText(text = '') {
  const source = String(text || '').replace(/\u00a0/g, ' ');
  const matches = [];
  const regex = /([A-Ea-e])\s*[\.\)]\s*/g;
  let match;

  while ((match = regex.exec(source)) !== null) {
    const previous = match.index > 0 ? source[match.index - 1] : '';
    const label = match[1];
    const hasReasonablePrefix =
      match.index === 0 ||
      /\s|[\(\[\{,;:!?]/.test(previous) ||
      label === label.toUpperCase();

    if (!hasReasonablePrefix) continue;

    matches.push({
      label: label.toUpperCase(),
      index: match.index,
      valueStart: regex.lastIndex
    });
  }

  return matches.map((item, index) => ({
    label: item.label,
    text: cleanText(source.slice(item.valueStart, matches[index + 1]?.index ?? source.length)),
    source: 'explicit_text'
  })).filter(item => item.text);
}

function isOptionBlock(block = {}) {
  return Boolean(getOptionLabelFromNumbering(block) || splitExplicitOptionsFromText(block.text || '').length > 0);
}

function addOptionItem(items, seenLabels, option) {
  const label = String(option.label || '').toUpperCase();
  const text = normalizeOptionText(label, option.text || option.value || '');

  if (!label || !text || seenLabels.has(label)) return;

  seenLabels.add(label);
  items.push({
    label,
    text,
    block_id: option.block?.id || null,
    block_index: option.block_index ?? null,
    source: option.source || 'unknown',
    is_bold: Boolean(option.block?.is_all_bold || Number(option.block?.bold_ratio || 0) >= 0.72),
    bold_ratio: Number(option.block?.bold_ratio || 0)
  });
}

function extractOptionDataFromQuestion(question) {
  const items = [];
  const seenLabels = new Set();
  const optionBlockIds = [];
  let optionSource = null;

  (question.blocks || []).forEach((block, blockIndex) => {
    if (block.tag === 'table' || block.block_type === 'table') return;

    const text = cleanText(block.text || '');
    if (!text) return;

    const explicitOptions = splitExplicitOptionsFromText(text);
    const numberedLabel = getOptionLabelFromNumbering(block);

    if (explicitOptions.length > 0) {
      explicitOptions.forEach(option => addOptionItem(items, seenLabels, {
        ...option,
        block,
        block_index: blockIndex
      }));
      optionBlockIds.push(block.id);
      optionSource = optionSource || 'explicit_text';
      return;
    }

    if (numberedLabel) {
      addOptionItem(items, seenLabels, {
        label: numberedLabel,
        text,
        block,
        block_index: blockIndex,
        source: 'ooxml_numbering'
      });
      optionBlockIds.push(block.id);
      optionSource = optionSource || 'ooxml_numbering';
    }
  });

  if (items.length < 4 && optionSource !== 'ooxml_numbering') {
    getTextLinesFromHtml(question.raw_html || '').forEach((line) => {
      splitExplicitOptionsFromText(line).forEach(option => addOptionItem(items, seenLabels, {
        ...option,
        source: 'explicit_html_line'
      }));
    });
  }

  if (items.length < 4 && optionSource !== 'ooxml_numbering') {
    splitExplicitOptionsFromText(cleanText(question.raw_text || '')).forEach(option => addOptionItem(items, seenLabels, {
      ...option,
      source: 'explicit_raw_text'
    }));
  }

  const ordered = items
    .filter(item => /^[A-E]$/.test(item.label))
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, 5);

  return {
    items: ordered,
    pilihan: ordered.map(item => item.text),
    option_blocks: [...new Set(optionBlockIds.filter(Boolean))],
    option_source: optionSource || ordered[0]?.source || null,
    answer_keys: ordered.filter(item => item.is_bold).map(item => item.label)
  };
}

function extractOptionTextsFromQuestion(question) {
  return extractOptionDataFromQuestion(question).pilihan;
}

function extractPilihanFromQuestion(question) {
  return extractOptionTextsFromQuestion(question);
}

function extractGandaKompleks(question) {
  return extractOptionTextsFromQuestion(question);
}

function getBenarSalahTableBlock(question) {
  return (question.blocks || []).find((block) => {
    const rows = block.rows || block.table_data || [];
    if (block.tag !== 'table' || rows.length === 0) return false;

    const headerText = cleanText((rows[0] || []).join(' ')).toLowerCase();
    return headerText.includes('pernyataan') && headerText.includes('benar') && headerText.includes('salah');
  }) || null;
}

function hasStandaloneSebabMarker(question) {
  return (question.blocks || []).some((block) => {
    if (block.tag === 'table' || isOptionBlock(block)) return false;

    const text = cleanText(block.text || '');
    if (!text) return false;
    if (/^SEBAB$/i.test(text)) return true;
    return /(?:^|[\s.!?:;])SEBAB(?:$|[\s.!?:;])/i.test(text) && !/sebab\s*[-\u2013\u2014]\s*akibat/i.test(text);
  });
}

function extractMatchingKeyCandidates(rawText = '') {
  const candidates = [];
  const text = String(rawText || '').replace(/\u00a0/g, ' ');
  const regex = /(?:Kunci\s+Jawaban\s*:?\s*)?((?:\d+\s*[-\u2013\u2014]\s*[a-zA-Z]\s*[\.,;]?\s*){2,})/gi;
  let match;

  while ((match = regex.exec(text)) !== null) {
    candidates.push(cleanText(match[1]));
  }

  return candidates;
}

function getLikelyMatchingTableBlock(question) {
  const tables = (question.blocks || []).filter(block => block.tag === 'table' && (block.rows || []).length >= 2);

  return tables.find((block) => {
    const rows = block.rows || [];
    const header = cleanText((rows[0] || []).join(' ')).toLowerCase();
    const hasTwoColumns = rows.some(row => row.length >= 2);

    if (!hasTwoColumns) return false;
    if (header.includes('benar') && header.includes('salah')) return false;
    if (/\b(komponen|karakteristik|pasangan|pernyataan|analisis|alasan|hubungan)\b/i.test(header)) return true;

    return extractMatchingKeyCandidates(question.raw_text || '').length > 0;
  }) || null;
}

function questionHasMatchingCue(question) {
  const rawText = String(question.raw_text || '');

  return (
    /\b(jodohkan|menjodohkan|pasangkan|hubungkan|mencocokkan)\b/i.test(rawText) ||
    (extractMatchingKeyCandidates(rawText).length > 0 && Boolean(getLikelyMatchingTableBlock(question)))
  );
}

function detectTipeSoal(question) {
  const rawText = String(question.raw_text || '');
  const optionData = extractOptionDataFromQuestion(question);

  if (
    getBenarSalahTableBlock(question) ||
    htmlHasBenarSalahTable(question.raw_html || '') ||
    /benar\s*\/\s*salah/i.test(rawText) ||
    (/benar\s+atau\s+salah/i.test(rawText) && /tanda\s+centang|tentukan/i.test(rawText))
  ) {
    return 'benar_salah';
  }

  if (questionHasMatchingCue(question)) {
    return 'menjodohkan';
  }

  if (
    /jawaban\s+benar\s+lebih\s+dari\s+satu/i.test(rawText) ||
    /jawaban\s+lebih\s+dari\s+satu/i.test(rawText) ||
    /berikanlah\s+tanda\s+centang/i.test(rawText) ||
    /pilihlah\s+pernyataan\s+yang\s+benar/i.test(rawText) ||
    /pernyataan\s+yang\s+benar/i.test(rawText)
  ) {
    return 'ganda_kompleks';
  }

  if (hasStandaloneSebabMarker(question)) {
    return 'sebab_akibat';
  }

  if (optionData.pilihan.length >= 4) {
    return 'pilihan_ganda';
  }

  return 'pilihan_ganda';
}

function extractBenarSalah(question) {
  const pernyataan = [];
  const jawaban = {};
  const tableBlock = getBenarSalahTableBlock(question);

  if (tableBlock) {
    const rows = tableBlock.rows || tableBlock.table_data || [];
    const cellData = tableBlock.cell_data || [];
    const header = (rows[0] || []).map(cell => cleanText(cell).toLowerCase());
    const pernyataanIndex = Math.max(header.findIndex(cell => cell.includes('pernyataan')), 1);
    const benarIndex = header.findIndex(cell => cell.includes('benar'));
    const salahIndex = header.findIndex(cell => cell.includes('salah'));

    rows.slice(1).forEach((row, rowOffset) => {
      const isiPernyataan = cleanText(row[pernyataanIndex] || row[1] || '');
      if (!isiPernyataan) return;

      const idx = pernyataan.length;
      const metaRow = cellData[rowOffset + 1] || [];
      const benarCell = metaRow[benarIndex] || { text: row[benarIndex] || '' };
      const salahCell = metaRow[salahIndex] || { text: row[salahIndex] || '' };

      pernyataan.push(isiPernyataan);

      if (salahIndex >= 0 && cellHasCheckmark(salahCell)) {
        jawaban[String(idx)] = false;
      } else if (benarIndex >= 0 && cellHasCheckmark(benarCell)) {
        jawaban[String(idx)] = true;
      } else {
        jawaban[String(idx)] = null;
      }
    });

    return {
      pernyataan_checklist: pernyataan,
      jawaban_benar_json: jawaban,
      detected: pernyataan.length > 0 && Object.values(jawaban).some(value => value !== null)
    };
  }

  const $ = cheerio.load(question.raw_html || '');

  $('table').each((_, table) => {
    const headerText = cleanText($(table).find('tr').first().text()).toLowerCase();

    if (!headerText.includes('benar') || !headerText.includes('salah')) return;

    $(table).find('tr').each((rowIndex, tr) => {
      if (rowIndex === 0) return;

      const cells = $(tr).find('td, th');
      if (cells.length < 4) return;

      const isiPernyataan = cleanText($(cells[1]).text());
      const benarCell = cleanText($(cells[2]).text());
      const salahCell = cleanText($(cells[3]).text());

      if (!isiPernyataan) return;

      const idx = pernyataan.length;
      pernyataan.push(isiPernyataan);

      if (/[\u2713\u2714\u221a]/.test(salahCell) || /salah/i.test(salahCell)) {
        jawaban[String(idx)] = false;
      } else if (/[\u2713\u2714\u221a]/.test(benarCell) || /benar/i.test(benarCell)) {
        jawaban[String(idx)] = true;
      } else {
        jawaban[String(idx)] = null;
      }
    });
  });

  return {
    pernyataan_checklist: pernyataan,
    jawaban_benar_json: jawaban,
    detected: pernyataan.length > 0 && Object.values(jawaban).some(value => value !== null)
  };
}

function normalizeKunciMenjodohkan(rawKunci = '') {
  const kunci = {};
  const cleaned = String(rawKunci).replace(/\s+/g, ' ').trim();
  const regex = /(\d+)\s*[-\u2013\u2014]\s*([a-zA-Z])/g;
  let match;

  while ((match = regex.exec(cleaned)) !== null) {
    const nomorIndex = parseInt(match[1], 10) - 1;
    const label = match[2].toLowerCase();

    if (!Number.isNaN(nomorIndex) && nomorIndex >= 0) {
      kunci[String(nomorIndex)] = label;
    }
  }

  return kunci;
}

function extractMenjodohkan(question) {
  const kolomKiri = [];
  const kolomKanan = [];
  const labels = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const tableBlock = getLikelyMatchingTableBlock(question);
  const rows = tableBlock?.rows || [];

  rows.forEach((row, rowIndex) => {
    if (rowIndex === 0 || row.length < 2) return;

    const kiri = cleanText(row[0]);
    const kanan = cleanText(row[1]);

    if (kiri) kolomKiri.push(kiri);
    if (kanan) {
      kolomKanan.push({
        label: labels[kolomKanan.length] || String(kolomKanan.length + 1),
        text: kanan
      });
    }
  });

  const keyCandidates = extractMatchingKeyCandidates(question.raw_text || '');
  const kunci = keyCandidates.length > 0
    ? normalizeKunciMenjodohkan(keyCandidates[keyCandidates.length - 1])
    : {};

  return {
    kolom_kiri: kolomKiri,
    kolom_kanan: kolomKanan,
    kunci,
    key_candidates: keyCandidates
  };
}

function classifyTableBlock(block = {}) {
  const rows = block.rows || block.table_data || [];
  const headerText = cleanText((rows[0] || []).join(' ')).toLowerCase();

  if (headerText.includes('pernyataan') && headerText.includes('benar') && headerText.includes('salah')) {
    return 'benar_salah';
  }

  if (rows.some(row => row.length >= 2) && /\b(komponen|karakteristik|pasangan|pernyataan|analisis|alasan|hubungan|kiri|kanan)\b/i.test(headerText)) {
    return 'menjodohkan';
  }

  return 'stimulus';
}

function tableBlockToPreview(block = {}, index = 0) {
  return {
    index,
    table_index: block.table_index ?? index,
    block_index: block._mapped_block_index ?? block.order ?? null,
    block_id: block.id || null,
    mapped_question: block._mapped_question ?? null,
    mapping_reason: block._mapping_reason || null,
    role: classifyTableBlock(block),
    rows: block.rows || block.table_data || []
  };
}

function extractTablesForQuestion(question, tipeSoal, optionData = null) {
  const tableBlocks = (question.blocks || [])
    .map((block, blockIndex) => ({ block, blockIndex }))
    .filter(item => item.block.tag === 'table' || item.block.block_type === 'table');

  const firstOptionIndex = (optionData?.items || [])
    .map(item => item.block_index)
    .filter(index => index !== null && index !== undefined)
    .sort((a, b) => a - b)[0];

  const visibleTables =
    tipeSoal === 'benar_salah' || tipeSoal === 'menjodohkan'
      ? tableBlocks
      : tableBlocks.filter(item => firstOptionIndex === undefined || item.blockIndex < firstOptionIndex);

  return visibleTables.map((item, index) => tableBlockToPreview(item.block, index));
}

function segmentQuestionBlocks(blocks, strategy = 'legacy') {
  const questions = [];
  let current = null;

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const nextBlock = blocks[index + 1] || null;
    const startMeta = strategy === 'fallback'
      ? getQuestionStartMeta(block, nextBlock)
      : (
          isLegacyQuestionStart(block.text)
            ? {
                isStart: true,
                source: 'legacy',
                status_parse: 'auto',
                confidence: 0.88,
                note: 'Awal soal terdeteksi dari frasa pembuka yang sudah dikenal.'
              }
            : { isStart: false }
        );

    if (startMeta.isStart) {
      if (current) questions.push(current);

      current = {
        nomor: questions.length + 1,
        blocks: [block],
        startMeta
      };
    } else if (current) {
      current.blocks.push(block);
    }
  }

  if (current) questions.push(current);

  return questions;
}

function shouldUseFallbackParser(legacyQuestions, fallbackQuestions, targetCount = 0) {
  const target = Number(targetCount || 0);
  const minimumExpected = target > 0 ? Math.min(target, 5) : 5;

  if (fallbackQuestions.length <= legacyQuestions.length) return false;
  if (legacyQuestions.length < minimumExpected) return true;

  return false;
}

function getFirstExplicitOptionIndex(text = '') {
  const source = String(text || '').replace(/\u00a0/g, ' ');
  const regex = /([A-Ea-e])\s*[\.\)]\s*/g;
  let match;

  while ((match = regex.exec(source)) !== null) {
    const previous = match.index > 0 ? source[match.index - 1] : '';
    const label = match[1];
    const remainingText = cleanText(source.slice(regex.lastIndex));
    const hasReasonablePrefix =
      match.index === 0 ||
      /\s|[\(\[\{,;:!?]/.test(previous) ||
      label === label.toUpperCase();

    if (!remainingText) continue;
    if (hasReasonablePrefix) return match.index;
  }

  return -1;
}

function getQuestionPromptDataFromBlocks(q, targetCount = 0) {
  const parts = [];
  const blockIds = [];

  for (const block of q.blocks || []) {
    if (!block) continue;

    if (block.tag === 'table' || block.block_type === 'table') {
      if (parts.length > 0) break;
      continue;
    }

    let text = cleanText(block.text || '');
    if (!text) continue;
    if (isStandaloneQuestionNumber(text, targetCount)) continue;
    if (isKunciOrInstruction(text) || extractMatchingKeyCandidates(text).length > 0) break;

    const optionIndex = getFirstExplicitOptionIndex(text);
    if (isOptionBlock(block) || isAnswerOptionText(text) || optionIndex === 0) break;

    if (optionIndex > 0) {
      text = text.slice(0, optionIndex);
    }

    text = stripOptionsFromPrompt(stripLeadingQuestionNumber(text));
    if (!text) continue;

    parts.push(text);
    if (block.id) blockIds.push(block.id);
  }

  const text = cleanText(parts.join(' '));
  if (text) {
    return {
      text,
      block_ids: blockIds
    };
  }

  const fallbackText = stripOptionsFromPrompt(stripLeadingQuestionNumber(q.raw_text || ''));
  return {
    text: fallbackText || `Soal nomor ${q.nomor || ''}`.trim(),
    block_ids: []
  };
}

function getQuestionPromptFromBlocks(q, targetCount = 0) {
  return getQuestionPromptDataFromBlocks(q, targetCount).text;
}

function splitSebabAkibatParts(question) {
  const statementParts = [];
  const reasonParts = [];
  let mode = 'statement';

  for (const block of question.blocks || []) {
    if (!block || block.tag === 'table' || block.block_type === 'table') continue;
    if (isOptionBlock(block)) break;

    const text = cleanText(block.text || '');
    if (!text || extractMatchingKeyCandidates(text).length > 0) continue;
    if (/^pilihlah\s+jawaban/i.test(text)) continue;

    if (/^SEBAB$/i.test(text)) {
      mode = 'reason';
      continue;
    }

    if (!/sebab\s*[-\u2013\u2014]\s*akibat/i.test(text)) {
      const sebabMatch = text.match(/\bSEBAB\b/i);

      if (sebabMatch) {
        const before = cleanText(text.slice(0, sebabMatch.index));
        const after = cleanText(text.slice(sebabMatch.index + sebabMatch[0].length));

        if (before) statementParts.push(before);
        if (after) reasonParts.push(after);
        mode = 'reason';
        continue;
      }
    }

    if (mode === 'reason') reasonParts.push(text);
    else statementParts.push(text);
  }

  return {
    pernyataan: cleanText(statementParts.join(' ')),
    sebab: cleanText(reasonParts.join(' '))
  };
}

function buildPertanyaanSebabAkibatFromQuestion(question, fallbackPrompt = '') {
  const parts = splitSebabAkibatParts(question);

  if (!parts.pernyataan || !parts.sebab) {
    return fallbackPrompt || question.raw_text || '';
  }

  return `Pernyataan:
${parts.pernyataan}

SEBAB:
${parts.sebab}

Pilihlah jawaban yang paling tepat dari pernyataan di atas.`;
}

function buildLegacyParserDebug(html, questions = [], strategy = 'legacy_phrase', targetSoal = 0) {
  const $ = cheerio.load(html || '');
  const rawText = cleanText($('body').length ? $('body').text() : $.root().text());
  const imageMapping = [];
  const tableMapping = [];

  questions.forEach((q) => {
    const rawHtml = q.blocks.map(block => block.html).join('\n');
    const rawTextSegment = cleanText(q.blocks.map(block => block.text).join(' '));

    extractImages(rawHtml).forEach((image, imageIndex) => {
      imageMapping.push({
        image_index: null,
        local_image_index: imageIndex,
        file_name: image.file_name,
        src: image.src,
        segment_number: q.nomor,
        block_id: q.blocks[0]?.id || null,
        status: 'auto',
        reason: `Gambar berada di segment ${strategy}.`
      });
    });

    extractTablesFromHtml(rawHtml).forEach((table) => {
      tableMapping.push({
        table_index: null,
        local_table_index: table.index,
        segment_number: q.nomor,
        block_id: q.blocks[0]?.id || null,
        status: 'auto',
        preview: truncatePreview(table.rows.map(row => row.join(' | ')).join(' / '), 240),
        reason: `Tabel berada di segment ${strategy}.`
      });
    });

    q._debugRawText = rawTextSegment;
  });

  return {
    raw_text_preview: truncatePreview(rawText, 4000),
    raw_html_preview: truncatePreview(html, 4000),
    target_soal: Number(targetSoal || 0),
    detected_starts: questions.map(q => ({
      nomor: q.nomor,
      block_id: q.blocks[0]?.id || null,
      source: q.startMeta?.source || strategy,
      confidence: q.startMeta?.confidence || null,
      preview: truncatePreview(q.blocks[0]?.text || '', 180)
    })),
    start_reasons: questions.map(q => ({
      nomor: q.nomor,
      block_id: q.blocks[0]?.id || null,
      source: q.startMeta?.source || strategy,
      selected: true,
      note: q.startMeta?.note || `Awal soal dari strategi ${strategy}.`,
      preview: truncatePreview(q.blocks[0]?.text || '', 180)
    })),
    segment_numbers: questions.map(q => q.nomor),
    segment_previews: questions.map(q => ({
      nomor: q.nomor,
      block_ids: q.blocks.map(block => block.id).filter(Boolean),
      preview: truncatePreview(q._debugRawText || '', 350)
    })),
    image_mapping: imageMapping,
    table_mapping: tableMapping
  };
}

function chooseParserQuestions(domResult, legacyQuestions, fallbackQuestions, targetCount = 0, docxResult = null) {
  const target = Number(targetCount || 0);
  const useFallback = shouldUseFallbackParser(legacyQuestions, fallbackQuestions, target);
  let selectedQuestions = useFallback ? fallbackQuestions : legacyQuestions;
  let selectedStrategy = useFallback ? 'fallback_numbered' : 'legacy_phrase';

  const domCount = domResult.segments.length;
  const docxCount = docxResult?.segments?.length || 0;
  const selectedCount = selectedQuestions.length;

  if (target > 0 && docxCount >= target) {
    return {
      questions: docxResult.segments,
      strategy: 'ooxml_numbering',
      usedFallback: false
    };
  }

  if (target > 0 && selectedCount >= target) {
    return {
      questions: selectedQuestions,
      strategy: selectedStrategy,
      usedFallback: selectedStrategy === 'fallback_numbered'
    };
  }

  if (target > 0) {
    if (docxCount >= target) {
      selectedQuestions = docxResult.segments;
      selectedStrategy = 'ooxml_numbering';
    } else if (domCount >= target) {
      selectedQuestions = domResult.segments;
      selectedStrategy = 'dom_numbered';
    } else {
      if (docxCount > selectedQuestions.length) {
        selectedQuestions = docxResult.segments;
        selectedStrategy = 'ooxml_numbering';
      }

      if (domCount > selectedQuestions.length) {
        selectedQuestions = domResult.segments;
        selectedStrategy = 'dom_numbered';
      }
    }
  } else {
    if (docxCount > selectedQuestions.length) {
      selectedQuestions = docxResult.segments;
      selectedStrategy = 'ooxml_numbering';
    }

    if (domCount > selectedQuestions.length) {
      selectedQuestions = domResult.segments;
      selectedStrategy = 'dom_numbered';
    }
  }

  return {
    questions: selectedQuestions,
    strategy: selectedStrategy,
    usedFallback: selectedStrategy === 'fallback_numbered'
  };
}

function buildQuestionBlocksWithMappedTables(baseBlocks = [], mappedTableBlocks = [], tableQuestionByBlockIndex = {}, questionNumber = null) {
  const blocksById = new Map();

  (baseBlocks || []).forEach((block) => {
    if (!block) return;

    const isTable = block.tag === 'table' || block.block_type === 'table';
    const blockIndex = block.order ?? (block.id ? block.id - 1 : null);
    const mappedQuestion = blockIndex !== null && blockIndex !== undefined
      ? tableQuestionByBlockIndex[String(blockIndex)] ?? tableQuestionByBlockIndex[blockIndex]
      : null;

    if (isTable && mappedQuestion && Number(mappedQuestion) !== Number(questionNumber)) {
      return;
    }

    blocksById.set(block.id || `base-${blocksById.size}`, block);
  });

  (mappedTableBlocks || []).forEach((block) => {
    if (!block) return;
    blocksById.set(block.id || `mapped-table-${blocksById.size}`, block);
  });

  return [...blocksById.values()].sort((a, b) => {
    const orderA = a.order ?? (a.id ? a.id - 1 : 0);
    const orderB = b.order ?? (b.id ? b.id - 1 : 0);
    return orderA - orderB;
  });
}

function buildSoalPreviewResultFromHtml(html, options = {}) {
  const targetCount = Number(options.targetCount || 0);
  const blocks = extractBlocksFromHtml(html);
  const legacyQuestions = segmentQuestionBlocks(blocks, 'legacy');
  const fallbackQuestions = segmentQuestionBlocks(blocks, 'fallback');
  const domResult = splitQuestionSegmentsFromHtml(html, targetCount);
  const docxResult = options.docxResult || null;
  const legacyDebug = buildLegacyParserDebug(html, legacyQuestions, 'legacy_phrase', targetCount);
  const fallbackDebug = buildLegacyParserDebug(html, fallbackQuestions, 'fallback_numbered', targetCount);
  const docxDebug = docxResult?.debug || buildStructuredSegmentDebug('', '', [], [], [], [], targetCount);
  const choice = chooseParserQuestions(domResult, legacyQuestions, fallbackQuestions, targetCount, docxResult);
  const questions = choice.questions;
  const parserStrategy = choice.strategy;
  const selectedDebug =
    parserStrategy === 'ooxml_numbering'
      ? docxDebug
      : parserStrategy === 'dom_numbered'
      ? domResult.debug
      : (parserStrategy === 'fallback_numbered' ? fallbackDebug : legacyDebug);
  const previewAssetMapping =
    parserStrategy === 'ooxml_numbering'
      ? buildPreviewAssetMapping(docxResult)
      : null;

  const soalPreview = questions.map((q) => {
    const mappedTableBlocks = previewAssetMapping?.tableBlocksByQuestion?.[q.nomor] || [];
    const questionBlocks = previewAssetMapping
      ? buildQuestionBlocksWithMappedTables(
          q.blocks || [],
          mappedTableBlocks,
          previewAssetMapping.tableQuestionByBlockIndex || {},
          q.nomor
        )
      : (q.blocks || []);
    const rawHtml = questionBlocks.map(b => b.html).join('\n') || q.raw_html || (q.blocks || []).map(b => b.html).join('\n');
    const rawText = cleanText(questionBlocks.map(b => b.text).join(' ')) || q.raw_text || cleanText((q.blocks || []).map(b => b.text).join(' '));
    const startMeta = q.startMeta || {};
    const parserNotes = [startMeta.note].filter(Boolean);

    if (parserStrategy === 'fallback_numbered' && startMeta.source !== 'legacy') {
      parserNotes.push('Deteksi fallback hanya bantuan awal, pastikan kembali pemetaan soal.');
    }

    const question = {
      nomor: q.nomor,
      blocks: questionBlocks,
      raw_html: rawHtml,
      raw_text: rawText
    };

    const optionData = extractOptionDataFromQuestion(question);
    const keyCandidates = extractMatchingKeyCandidates(rawText);
    const tipeSoal = detectTipeSoal(question);
    const mappedImages = previewAssetMapping?.imagesByQuestion?.[q.nomor];
    const images = previewAssetMapping ? (mappedImages || []) : extractImages(rawHtml);
    const tables = extractTablesForQuestion(question, tipeSoal, optionData);
    const promptData = getQuestionPromptDataFromBlocks(
      {
        ...q,
        raw_text: rawText
      },
      targetCount
    );

    const pertanyaanFinal =
      tipeSoal === 'sebab_akibat'
        ? buildPertanyaanSebabAkibatFromQuestion(question, promptData.text)
        : promptData.text;

    const debugExtract = {
      nomor: q.nomor,
      tipe_soal: tipeSoal,
      total_blocks: (q.blocks || []).length,
      question_blocks: promptData.block_ids,
      option_blocks: optionData.option_blocks,
      option_source: optionData.option_source,
      table_count: tables.length,
      image_count: images.length || (q.blocks || []).reduce((total, block) => total + (block.images || []).length, 0),
      image_mapping: (previewAssetMapping?.imageDebug || []).filter(item => item.mapped_to_question_number === q.nomor),
      table_mapping: (previewAssetMapping?.tableDebug || []).filter(item => item.mapped_to_question_number === q.nomor),
      key_candidates: keyCandidates,
      answer_key_found: false,
      true_false_detected: false,
      matching_key_detected: false,
      warnings: []
    };

    const hasil = {
      nomor: q.nomor,
      tipe_soal: tipeSoal,
      kategori_instrumen: null,
      pertanyaan: pertanyaanFinal,
      gambar: images,
      tabel_data: tables,
      supporting_tables: tables,
      stimulus_tambahan: '',
      raw_text: rawText,
      raw_html: rawHtml,
      source_block_ids: questionBlocks.map(b => b.id).filter(Boolean),
      bobot: 1,
      status_parse: startMeta.status_parse || 'perlu_dicek',
      confidence: Number(startMeta.confidence || 0.5),
      parser_notes: parserNotes,
      parser_strategy: parserStrategy
    };

    const addWarning = (message, confidenceCap = 0.72) => {
      if (!debugExtract.warnings.includes(message)) debugExtract.warnings.push(message);
      if (!hasil.parser_notes.includes(message)) hasil.parser_notes.push(message);
      hasil.status_parse = 'perlu_dicek';
      hasil.confidence = Math.min(Number(hasil.confidence || 0.5), confidenceCap);
    };

    (previewAssetMapping?.warningsByQuestion?.[q.nomor] || []).forEach(message => addWarning(message, 0.78));

    if (hasImageStimulusCue(`${pertanyaanFinal} ${rawText}`) && images.length === 0) {
      addWarning('Soal menyebut gambar/grafik/infografis, tetapi gambar belum terpetakan ke soal ini.', 0.68);
    }

    if (hasTableStimulusCue(`${pertanyaanFinal} ${rawText}`) && tables.length === 0) {
      addWarning('Soal menyebut tabel/data, tetapi tabel belum terpetakan ke soal ini.', 0.68);
    }

    if (tipeSoal === 'pilihan_ganda' || tipeSoal === 'sebab_akibat') {
      const pilihan = optionData.pilihan;

      hasil.pilihan_a = pilihan[0] || null;
      hasil.pilihan_b = pilihan[1] || null;
      hasil.pilihan_c = pilihan[2] || null;
      hasil.pilihan_d = pilihan[3] || null;
      hasil.pilihan_e = tipeSoal === 'sebab_akibat' ? null : (pilihan[4] || null);
      hasil.jawaban_benar = optionData.answer_keys[0] || null;

      if (tipeSoal === 'sebab_akibat' && hasil.jawaban_benar === 'E') {
        hasil.jawaban_benar = null;
        addWarning('Kunci E terdeteksi, tetapi tipe sebab-akibat hanya memakai A-D.', 0.62);
      }

      debugExtract.answer_key_found = Boolean(hasil.jawaban_benar);

      if (pilihan.length < 4) {
        addWarning(
          pilihan.length === 0
            ? 'Pilihan jawaban gagal diekstrak'
            : 'Pilihan A-D belum terdeteksi lengkap dalam segment ini.',
          pilihan.length === 0 ? 0.4 : 0.62
        );
      }

      if (!hasil.jawaban_benar) {
        addWarning('Kunci jawaban dari bold Word belum terdeteksi.', 0.78);
      }
    }

    if (tipeSoal === 'ganda_kompleks') {
      const pilihan = optionData.pilihan;

      hasil.pilihan = pilihan;
      hasil.pilihan_a = pilihan[0] || null;
      hasil.pilihan_b = pilihan[1] || null;
      hasil.pilihan_c = pilihan[2] || null;
      hasil.pilihan_d = pilihan[3] || null;
      hasil.pilihan_e = pilihan[4] || null;
      hasil.jawaban_benar_json = optionData.answer_keys;
      debugExtract.answer_key_found = optionData.answer_keys.length > 0;

      if (pilihan.length < 4) {
        addWarning(
          pilihan.length === 0
            ? 'Pilihan jawaban gagal diekstrak'
            : 'Pilihan A-D belum terdeteksi lengkap dalam segment ini.',
          pilihan.length === 0 ? 0.4 : 0.62
        );
      }

      if (optionData.answer_keys.length === 0) {
        addWarning('Kunci jawaban ganda kompleks dari bold Word belum terdeteksi.', 0.78);
      }
    }

    if (tipeSoal === 'benar_salah') {
      const bs = extractBenarSalah(question);

      hasil.pernyataan_checklist = bs.pernyataan_checklist;
      hasil.jawaban_benar_json = bs.jawaban_benar_json;
      debugExtract.true_false_detected = Boolean(bs.detected);
      debugExtract.answer_key_found = Boolean(bs.detected);

      if (!bs.detected) {
        addWarning('Status Benar/Salah belum terdeteksi dari tanda centang.', 0.45);
      }
    }

    if (tipeSoal === 'menjodohkan') {
      hasil.pasangan_menjodohkan = extractMenjodohkan(question);
      debugExtract.key_candidates = hasil.pasangan_menjodohkan.key_candidates || keyCandidates;
      debugExtract.matching_key_detected = Object.keys(hasil.pasangan_menjodohkan.kunci || {}).length > 0;
      debugExtract.answer_key_found = debugExtract.matching_key_detected;

      if (!debugExtract.matching_key_detected) {
        addWarning('Kunci menjodohkan belum terdeteksi.', 0.7);
      }
    }

    hasil.debug_extract = debugExtract;

    return hasil;
  });

  return {
    soal_preview: soalPreview,
    parser_strategy: parserStrategy,
    import_quality_report: buildImportQualityReport(soalPreview, {
      targetCount,
      assetMapping: previewAssetMapping
    }),
    parser_debug: {
      strategy: parserStrategy,
      selected_strategy: parserStrategy,
      target_soal: targetCount,
      total_blocks: selectedDebug.total_blocks ?? 0,
      total_segments: soalPreview.length,
      raw_text_preview: selectedDebug.raw_text_preview,
      raw_html_preview: selectedDebug.raw_html_preview,
      detected_starts: selectedDebug.detected_starts,
      start_reasons: selectedDebug.start_reasons,
      segment_numbers: selectedDebug.segment_numbers,
      segment_previews: selectedDebug.segment_previews,
      option_blocks_ignored: selectedDebug.option_blocks_ignored || [],
      image_mapping: previewAssetMapping?.imageDebug || selectedDebug.image_mapping,
      image_mapping_debug: previewAssetMapping?.imageDebug || [],
      table_mapping_debug: previewAssetMapping?.tableDebug || [],
      table_mapping: previewAssetMapping?.tableDebug || selectedDebug.table_mapping,
      warnings: selectedDebug.warnings || (
        targetCount > 0 && soalPreview.length < targetCount
          ? ['Parser belum mampu memisahkan seluruh soal secara otomatis. Silakan cek Preview Dokumen Word dan gunakan Tambah Soal Manual.']
          : []
      ),
      strategies: {
        ooxml_numbering: docxDebug,
        dom_numbered: domResult.debug,
        legacy_phrase: legacyDebug,
        fallback_numbered: fallbackDebug
      }
    }
  };
}

function buildSoalPreviewFromHtml(html, options = {}) {
  return buildSoalPreviewResultFromHtml(html, options).soal_preview;
}
function buildPertanyaanSebabAkibat(soal) {
  const editedPernyataan = sanitizeImportHtmlForSave(soal.pilihan_a || '');
  const editedSebab = sanitizeImportHtmlForSave(soal.pilihan_b || '');

  if (htmlPlainText(editedPernyataan) && htmlPlainText(editedSebab)) {
    return [
      '<p>Bacalah pernyataan berikut ini dengan cermat!</p>',
      `<p><strong>Pernyataan:</strong><br>${editedPernyataan}</p>`,
      `<p><strong>SEBAB:</strong><br>${editedSebab}</p>`,
      '<p>Pilihlah jawaban yang paling tepat dari pernyataan di atas.</p>'
    ].join('\n');
  }

  const existingPertanyaan = String(soal.pertanyaan || '').trim();

  if (/Pernyataan\s*:/i.test(existingPertanyaan) && /\bSEBAB\s*:/i.test(existingPertanyaan)) {
    return existingPertanyaan;
  }

  const rawText = String(soal.raw_text || soal.pertanyaan || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!rawText) {
    return soal.pertanyaan || '';
  }

  const lower = rawText.toLowerCase();
  const sebabIndex = lower.indexOf('sebab');

  if (sebabIndex === -1 || /sebab\s*[-\u2013\u2014]\s*akibat/i.test(rawText)) {
    return soal.pertanyaan || rawText;
  }

  let pilihIndex = lower.indexOf('pilihlah jawaban');

  let pembuka = soal.pertanyaan || 'Bacalah pernyataan berikut ini dengan cermat!';

  let pernyataan = rawText.substring(0, sebabIndex).trim();
  pernyataan = pernyataan
    .replace(/^Bacalah pernyataan berikut ini dengan cermat!\s*/i, '')
    .trim();

  let sebab = '';

  if (pilihIndex !== -1 && pilihIndex > sebabIndex) {
    sebab = rawText.substring(sebabIndex + 5, pilihIndex).trim();
  } else {
    sebab = rawText.substring(sebabIndex + 5).trim();
  }

  return `${pembuka}

Pernyataan:
${pernyataan}

SEBAB:
${sebab}

Pilihlah jawaban yang paling tepat dari pernyataan di atas.`;
}
async function validateImportAccess(req, instrumenId) {
  const access = await canAccessInstrumen(req.user, instrumenId, 'import');
  if (!access.ok) return access;

  const instrumen = access.instrumen;

  if (instrumen.status === 'aktif') {
    return {
      ok: false,
      status: 400,
      message: 'Instrumen sudah aktif. Ubah status ke draft/nonaktif dulu sebelum import soal.'
    };
  }

  return {
    ok: true,
    instrumen
  };
}

const EXCEL_IMPORT_SHEETS = {
  SOAL: 'SOAL',
  BENAR_SALAH: 'BENAR_SALAH',
  MENJODOHKAN: 'MENJODOHKAN',
  TABEL_PENDUKUNG: 'TABEL_PENDUKUNG',
  MEDIA: 'MEDIA'
};

const EXCEL_IMPORT_TYPES = new Set([
  'pilihan_ganda',
  'ganda_kompleks',
  'sebab_akibat',
  'benar_salah',
  'menjodohkan'
]);

const EXCEL_IMPORT_SOAL_HEADER_ALIASES = {
  nomor: ['nomor', 'no', 'no_soal', 'nomor_soal', 'no soal', 'nomor soal', 'soal_nomor', 'nomor_soal'],
  pertanyaan: ['pertanyaan', 'soal', 'teks_soal', 'teks soal', 'question', 'pertanyaan_soal', 'isi_soal', 'isi soal'],
  tipe_soal: ['tipe', 'tipe_soal', 'tipe soal', 'jenis', 'jenis_soal', 'jenis soal', 'type'],
  pilihan_a: ['a', 'opsi_a', 'opsi a', 'pilihan_a', 'pilihan a', 'option_a', 'option a'],
  pilihan_b: ['b', 'opsi_b', 'opsi b', 'pilihan_b', 'pilihan b', 'option_b', 'option b'],
  pilihan_c: ['c', 'opsi_c', 'opsi c', 'pilihan_c', 'pilihan c', 'option_c', 'option c'],
  pilihan_d: ['d', 'opsi_d', 'opsi d', 'pilihan_d', 'pilihan d', 'option_d', 'option d'],
  pilihan_e: ['e', 'opsi_e', 'opsi e', 'pilihan_e', 'pilihan e', 'option_e', 'option e'],
  kunci: ['kunci', 'jawaban', 'jawaban_benar', 'kunci_jawaban', 'jawaban benar', 'kunci jawaban', 'answer']
};

const SEBAB_AKIBAT_OPTIONS = {
  pilihan_c: 'Pernyataan benar dan alasan salah.',
  pilihan_d: 'Pernyataan salah dan alasan benar.'
};

function normalizeExcelHeader(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function mapExcelHeaderAlias(value = '') {
  const normalized = normalizeExcelHeader(value);
  if (!normalized) return null;
  for (const [key, aliases] of Object.entries(EXCEL_IMPORT_SOAL_HEADER_ALIASES)) {
    if (aliases.includes(normalized)) return key;
  }
  return null;
}

function buildExcelHeaderMap(row = []) {
  const headerMap = {};
  if (!Array.isArray(row)) return headerMap;

  row.forEach((cell, index) => {
    const key = mapExcelHeaderAlias(cell);
    if (key && headerMap[key] === undefined) {
      headerMap[key] = index;
    }
  });

  return headerMap;
}

function scoreExcelHeaderMap(headerMap) {
  if (!headerMap.pertanyaan) return 0;

  let score = 10;
  if (headerMap.nomor !== undefined) score += 4;
  if (headerMap.tipe_soal !== undefined) score += 2;

  const choiceFields = ['pilihan_a', 'pilihan_b', 'pilihan_c', 'pilihan_d', 'pilihan_e'];
  score += choiceFields.reduce((sum, field) => sum + (headerMap[field] !== undefined ? 1 : 0), 0);
  if (headerMap.kunci !== undefined) score += 2;

  return score;
}

function findExcelSheetHeaderCandidate(rawRows = [], maxRows = 10) {
  const limit = Math.min(maxRows, rawRows.length);
  let bestCandidate = null;

  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const row = rawRows[rowIndex];
    const headerMap = buildExcelHeaderMap(row || []);
    const score = scoreExcelHeaderMap(headerMap);

    if (score > 0) {
      const labels = (Array.isArray(row) ? row : [])
        .map(cell => normalizeExcelHeader(cell))
        .filter(Boolean);

      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = {
          rowIndex,
          headerMap,
          score,
          labels
        };
      }
    }
  }

  return bestCandidate;
}

function parseExcelSheetFromRawRows(rawRows = [], headerRowIndex = 0, headerMap = {}) {
  const rows = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < rawRows.length; rowIndex += 1) {
    const row = rawRows[rowIndex];
    if (!Array.isArray(row)) continue;

    const normalized = {};
    Object.entries(headerMap).forEach(([key, colIndex]) => {
      normalized[key] = row[colIndex] !== undefined ? row[colIndex] : '';
    });

    normalized.__row_number = rowIndex + 1;

    const hasContent = Object.entries(normalized)
      .filter(([key]) => key !== '__row_number')
      .some(([, value]) => cleanText(value) !== '');

    if (hasContent) rows.push(normalized);
  }

  return rows;
}

function describeWorkbookSheetHeaders(workbook) {
  return workbook.SheetNames.map(sheetName => {
    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
    const firstRows = rawRows.slice(0, 3).filter(Array.isArray).map(row =>
      row.map(cell => normalizeExcelHeader(cell)).filter(Boolean).join(', ') || '(kosong)'
    );
    return `${sheetName}: ${firstRows.join(' | ')}`;
  });
}

function getWorkbookSheetName(workbook, expectedName) {
  const normalizedExpected = normalizeExcelHeader(expectedName);
  return workbook.SheetNames.find(name => normalizeExcelHeader(name) === normalizedExpected) || null;
}

function readExcelSheet(workbook, expectedName) {
  const requiredName = expectedName === EXCEL_IMPORT_SHEETS.SOAL ? EXCEL_IMPORT_SHEETS.SOAL : expectedName;
  const exactSheetName = getWorkbookSheetName(workbook, requiredName);
  const sheetNames = workbook.SheetNames || [];

  const loadSheet = (sheetName) => {
    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
    const candidate = findExcelSheetHeaderCandidate(rawRows, 10);

    if (candidate) {
      return {
        sheetName,
        rows: parseExcelSheetFromRawRows(rawRows, candidate.rowIndex, candidate.headerMap),
        headers: candidate.labels,
        headerRowIndex: candidate.rowIndex
      };
    }

    if (rawRows.length > 0) {
      const fallbackMap = buildExcelHeaderMap(rawRows[0] || []);
      return {
        sheetName,
        rows: parseExcelSheetFromRawRows(rawRows, 0, fallbackMap),
        headers: (Array.isArray(rawRows[0]) ? rawRows[0] : [])
          .map(cell => normalizeExcelHeader(cell))
          .filter(Boolean),
        headerRowIndex: 0
      };
    }

    return { sheetName, rows: [], headers: [], headerRowIndex: null };
  };

  if (exactSheetName) {
    return loadSheet(exactSheetName);
  }

  if (expectedName !== EXCEL_IMPORT_SHEETS.SOAL) {
    return { sheetName: null, rows: [] };
  }

  let best = null;
  sheetNames.forEach(sheetName => {
    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
    const candidate = findExcelSheetHeaderCandidate(rawRows, 10);
    if (candidate && (!best || candidate.score > best.score)) {
      best = { sheetName, rawRows, ...candidate };
    }
  });

  if (best) {
    return {
      sheetName: best.sheetName,
      rows: parseExcelSheetFromRawRows(best.rawRows, best.rowIndex, best.headerMap),
      headers: best.labels,
      headerRowIndex: best.rowIndex
    };
  }

  return {
    sheetName: null,
    rows: [],
    headerInfo: describeWorkbookSheetHeaders(workbook)
  };
}

function getExcelText(row, key) {
  return cleanText(row?.[key]);
}

function getExcelHtml(row, key) {
  const value = row?.[key];
  if (value === undefined || value === null) return '';
  return sanitizeImportHtmlForSave(String(value).trim());
}

function parseExcelNumber(value) {
  const number = Number(String(value || '').trim());
  return Number.isInteger(number) && number > 0 ? number : null;
}

function parseExcelBobot(value) {
  const number = Number(String(value || '').trim());
  return Number.isFinite(number) && number > 0 ? number : 1;
}

function pushExcelIssue(target, issue) {
  target.push({
    sheet: issue.sheet || EXCEL_IMPORT_SHEETS.SOAL,
    row: issue.row || null,
    nomor: issue.nomor || null,
    field: issue.field || null,
    message: issue.message
  });
}

function parseExcelChoiceKey(value) {
  const key = String(value || '').trim().toUpperCase();
  return /^[A-E]$/.test(key) ? key : null;
}

function parseExcelChoiceKeys(value) {
  return [...new Set(String(value || '')
    .split(/[,;\s]+/)
    .map(item => item.trim().toUpperCase())
    .filter(item => /^[A-E]$/.test(item)))]
    .sort();
}

function combineExcelStimulus(row) {
  const judul = getExcelHtml(row, 'judul_stimulus');
  const tambahan = getExcelHtml(row, 'stimulus_tambahan');
  const parts = [];

  if (judul) parts.push(`<p><strong>${judul}</strong></p>`);
  if (tambahan) parts.push(tambahan);

  return sanitizeImportHtmlForSave(parts.join('\n'));
}

function parseExcelLayoutBlocks(value = '') {
  const mapped = String(value || '')
    .split(',')
    .map(item => normalizeExcelHeader(item))
    .map(item => ({
      stimulus: 'stimulus',
      gambar: 'image',
      image: 'image',
      media: 'image',
      tabel: 'table',
      table: 'table',
      pertanyaan: 'question',
      question: 'question',
      soal: 'question'
    }[item]))
    .filter(Boolean)
    .map(type => ({ type }));

  return mapped.length > 0 ? sanitizeLayoutBlocksForSave(mapped) : [];
}

function buildExcelSupportingTables(rows = []) {
  const byTable = new Map();

  rows.forEach(row => {
    const tableName = getExcelText(row, 'nama_tabel') || 'Tabel Pendukung';
    const key = tableName.toLowerCase();
    const baris = parseExcelNumber(row.baris);
    const kolom = parseExcelNumber(row.kolom);
    const isiCell = getExcelHtml(row, 'isi_cell');

    if (!baris || !kolom) return;

    if (!byTable.has(key)) {
      byTable.set(key, {
        source: 'excel',
        role: 'stimulus',
        caption: tableName,
        width: '100%',
        align: 'center',
        fontSize: '14px',
        rows: []
      });
    }

    const table = byTable.get(key);
    while (table.rows.length < baris) table.rows.push([]);
    while (table.rows[baris - 1].length < kolom) table.rows[baris - 1].push('');
    table.rows[baris - 1][kolom - 1] = isiCell;
  });

  return [...byTable.values()].map((table, index) => {
    const colCount = Math.max(1, ...table.rows.map(row => row.length));
    const rows = table.rows.map(row => {
      const next = [...row];
      while (next.length < colCount) next.push('');
      return next;
    });

    return {
      ...table,
      index,
      table_index: index,
      rows
    };
  });
}

function groupExcelRowsByNomor(rows = [], sheet, soalMap, expectedType, errors) {
  const grouped = new Map();

  rows.forEach(row => {
    const nomor = parseExcelNumber(row.nomor_soal);

    if (!nomor) {
      pushExcelIssue(errors, {
        sheet,
        row: row.__row_number,
        field: 'nomor_soal',
        message: `${sheet} baris ${row.__row_number}: nomor_soal kosong atau tidak valid.`
      });
      return;
    }

    const soal = soalMap.get(nomor);
    if (!soal) {
      pushExcelIssue(errors, {
        sheet,
        row: row.__row_number,
        nomor,
        field: 'nomor_soal',
        message: `${sheet} baris ${row.__row_number}: nomor_soal ${nomor} tidak ditemukan di sheet SOAL.`
      });
      return;
    }

    if (expectedType && soal.tipe_soal !== expectedType) {
      pushExcelIssue(errors, {
        sheet,
        row: row.__row_number,
        nomor,
        field: 'nomor_soal',
        message: `${sheet} baris ${row.__row_number}: nomor_soal ${nomor} bukan tipe ${expectedType}.`
      });
      return;
    }

    if (!grouped.has(nomor)) grouped.set(nomor, []);
    grouped.get(nomor).push(row);
  });

  return grouped;
}

function applyExcelBenarSalah(soal, rows, errors) {
  const pernyataan = [];
  const jawaban = {};

  rows
    .sort((a, b) => Number(a.nomor_pernyataan || 0) - Number(b.nomor_pernyataan || 0))
    .forEach((row, index) => {
      const text = getExcelHtml(row, 'pernyataan');
      const rawJawaban = getExcelText(row, 'jawaban').toLowerCase();

      if (!text) {
        pushExcelIssue(errors, {
          sheet: EXCEL_IMPORT_SHEETS.BENAR_SALAH,
          row: row.__row_number,
          nomor: soal.nomor,
          field: 'pernyataan',
          message: `Soal nomor ${soal.nomor}: pernyataan benar_salah kosong pada sheet BENAR_SALAH.`
        });
      }

      if (!['benar', 'salah'].includes(rawJawaban)) {
        pushExcelIssue(errors, {
          sheet: EXCEL_IMPORT_SHEETS.BENAR_SALAH,
          row: row.__row_number,
          nomor: soal.nomor,
          field: 'jawaban',
          message: `Soal nomor ${soal.nomor}: jawaban benar_salah harus Benar atau Salah.`
        });
      }

      pernyataan.push(text);
      jawaban[String(index)] = rawJawaban === 'benar';
    });

  soal.pernyataan_checklist = pernyataan;
  soal.pernyataan_benar_salah = pernyataan;
  soal.jawaban_benar_json = jawaban;
}

function applyExcelMenjodohkan(soal, rows, errors) {
  const kiriByNomor = new Map();
  const kananByKode = new Map();
  const kunciByKiri = new Map();

  rows.forEach(row => {
    const nomorKiri = parseExcelNumber(row.nomor_kiri);
    const teksKiri = getExcelHtml(row, 'teks_kiri');
    const kodeKanan = getExcelText(row, 'kode_kanan').toLowerCase();
    const teksKanan = getExcelHtml(row, 'teks_kanan');
    const kunci = getExcelText(row, 'kunci').toLowerCase();

    if (nomorKiri && teksKiri && !kiriByNomor.has(nomorKiri)) {
      kiriByNomor.set(nomorKiri, teksKiri);
    }

    if (kodeKanan && teksKanan && !kananByKode.has(kodeKanan)) {
      kananByKode.set(kodeKanan, {
        label: kodeKanan,
        text: teksKanan
      });
    }

    if (nomorKiri && kunci) {
      kunciByKiri.set(nomorKiri, kunci);
    }
  });

  const kolomKiri = [...kiriByNomor.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, text]) => text);
  const kolomKanan = [...kananByKode.values()].sort((a, b) => a.label.localeCompare(b.label));
  const validKanan = new Set(kolomKanan.map(item => item.label));
  const kunci = {};

  [...kiriByNomor.keys()].sort((a, b) => a - b).forEach((nomorKiri, index) => {
    const key = kunciByKiri.get(nomorKiri);
    if (!key) {
      pushExcelIssue(errors, {
        sheet: EXCEL_IMPORT_SHEETS.MENJODOHKAN,
        nomor: soal.nomor,
        field: 'kunci',
        message: `Soal nomor ${soal.nomor}: kunci menjodohkan untuk item kiri ${nomorKiri} kosong.`
      });
      return;
    }

    if (!validKanan.has(key)) {
      pushExcelIssue(errors, {
        sheet: EXCEL_IMPORT_SHEETS.MENJODOHKAN,
        nomor: soal.nomor,
        field: 'kunci',
        message: `Soal nomor ${soal.nomor}: kunci menjodohkan "${key}" tidak ada di kode_kanan.`
      });
      return;
    }

    kunci[String(index)] = key;
  });

  soal.pasangan_menjodohkan = {
    kolom_kiri: kolomKiri,
    kolom_kanan: kolomKanan,
    kunci
  };
}

function buildExcelQuestionPreview(row, instrumen, errors, seenNomor) {
  let nomor = parseExcelNumber(row.nomor);
  const rawTipe = getExcelText(row, 'tipe_soal').toLowerCase();
  const rowErrors = [];
  const rowWarnings = [];
  const autoNomor = row.__row_number || seenNomor.size + 1;
  const nomorLabel = nomor || autoNomor || '-';

  if (!nomor) {
    nomor = autoNomor;
    pushExcelIssue(rowWarnings, {
      row: row.__row_number,
      nomor,
      field: 'nomor',
      message: `Soal baris ${row.__row_number}: nomor tidak ditemukan, diisi otomatis.`
    });
  } else if (seenNomor.has(nomor)) {
    pushExcelIssue(rowErrors, {
      row: row.__row_number,
      nomor,
      field: 'nomor',
      message: `Soal nomor ${nomor}: nomor duplikat di sheet SOAL.`
    });
  }

  let tipeSoal = 'pilihan_ganda';
  if (EXCEL_IMPORT_TYPES.has(rawTipe)) {
    tipeSoal = rawTipe;
  } else if (rawTipe) {
    pushExcelIssue(rowWarnings, {
      row: row.__row_number,
      nomor,
      field: 'tipe_soal',
      message: `Soal nomor ${nomorLabel}: tipe_soal "${rawTipe}" tidak dikenali, default ke pilihan_ganda.`
    });
  } else {
    pushExcelIssue(rowWarnings, {
      row: row.__row_number,
      nomor,
      field: 'tipe_soal',
      message: `Soal nomor ${nomorLabel}: tipe_soal tidak ditemukan, default ke pilihan_ganda.`
    });
  }

  const pertanyaan = getExcelHtml(row, 'pertanyaan');
  if (!pertanyaan && tipeSoal !== 'sebab_akibat') {
    pushExcelIssue(rowErrors, {
      row: row.__row_number,
      nomor,
      field: 'pertanyaan',
      message: `Soal nomor ${nomorLabel}: pertanyaan kosong.`
    });
  }

  const soal = {
    id_temp: `excel-${nomor || row.__row_number}`,
    nomor: nomor,
    tipe_soal: tipeSoal,
    kategori_instrumen: instrumen.jenis || 'HOTS',
    pertanyaan: pertanyaan || 'Bacalah pernyataan berikut ini dengan cermat!',
    stimulus_tambahan: combineExcelStimulus(row),
    pilihan_a: getExcelHtml(row, 'pilihan_a'),
    pilihan_b: getExcelHtml(row, 'pilihan_b'),
    pilihan_c: getExcelHtml(row, 'pilihan_c'),
    pilihan_d: getExcelHtml(row, 'pilihan_d'),
    pilihan_e: getExcelHtml(row, 'pilihan_e'),
    jawaban_benar: null,
    jawaban_benar_json: null,
    maksimal_pilihan: parseExcelNumber(row.maksimal_pilihan),
    pembahasan: getExcelHtml(row, 'pembahasan'),
    bobot: parseExcelBobot(row.bobot),
    layout_blocks: parseExcelLayoutBlocks(row.layout),
    supporting_tables: [],
    tabel_data: [],
    media: [],
    gambar: [],
    source: 'excel',
    status_parse: 'auto',
    confidence: 1,
    parser_notes: ['Soal dibaca dari template Excel SMIASB.'],
    errors: rowErrors,
    warnings: rowWarnings
  };

  if (soal.tipe_soal === 'pilihan_ganda') {
    ['pilihan_a', 'pilihan_b', 'pilihan_c', 'pilihan_d'].forEach(field => {
      if (!soal[field]) {
        pushExcelIssue(rowErrors, {
          row: row.__row_number,
          nomor,
          field,
          message: `Soal nomor ${nomorLabel}: ${field} wajib diisi.`
        });
      }
    });

    const key = parseExcelChoiceKey(row.kunci);
    if (!key) {
      pushExcelIssue(rowWarnings, {
        row: row.__row_number,
        nomor,
        field: 'kunci',
        message: `Soal nomor ${nomorLabel}: kunci jawaban belum terdeteksi dan perlu dilengkapi manual.`
      });
    }

    if (key === 'E' && !soal.pilihan_e) {
      pushExcelIssue(rowErrors, {
        row: row.__row_number,
        nomor,
        field: 'pilihan_e',
        message: `Soal nomor ${nomorLabel}: kunci E dipilih tetapi pilihan_e kosong.`
      });
    }

    soal.jawaban_benar = key || null;
  }

  if (soal.tipe_soal === 'ganda_kompleks') {
    ['pilihan_a', 'pilihan_b', 'pilihan_c', 'pilihan_d'].forEach(field => {
      if (!soal[field]) {
        pushExcelIssue(rowErrors, {
          row: row.__row_number,
          nomor,
          field,
          message: `Soal nomor ${nomorLabel}: ${field} wajib diisi.`
        });
      }
    });

    const keys = parseExcelChoiceKeys(row.kunci);
    if (keys.length === 0) {
      pushExcelIssue(rowWarnings, {
        row: row.__row_number,
        nomor,
        field: 'kunci',
        message: `Soal nomor ${nomorLabel}: kunci jawaban belum terdeteksi dan perlu dilengkapi manual.`
      });
    }

    if (keys.includes('E') && !soal.pilihan_e) {
      pushExcelIssue(rowErrors, {
        row: row.__row_number,
        nomor,
        field: 'pilihan_e',
        message: `Soal nomor ${nomorLabel}: kunci E dipilih tetapi pilihan_e kosong.`
      });
    }

    soal.jawaban_benar_json = keys.length > 0 ? keys : null;
    soal.maksimal_pilihan = soal.maksimal_pilihan || (keys.length > 0 ? keys.length : null) || null;
  }

  if (soal.tipe_soal === 'sebab_akibat') {
    const pernyataan = getExcelHtml(row, 'pernyataan');
    const sebab = getExcelHtml(row, 'sebab');

    if (!pernyataan) {
      pushExcelIssue(rowErrors, {
        row: row.__row_number,
        nomor,
        field: 'pernyataan',
        message: `Soal nomor ${nomorLabel}: pernyataan wajib diisi untuk tipe sebab_akibat.`
      });
    }

    if (!sebab) {
      pushExcelIssue(rowErrors, {
        row: row.__row_number,
        nomor,
        field: 'sebab',
        message: `Soal nomor ${nomorLabel}: sebab wajib diisi untuk tipe sebab_akibat.`
      });
    }

    const key = parseExcelChoiceKey(row.kunci);
    if (!key) {
      pushExcelIssue(rowWarnings, {
        row: row.__row_number,
        nomor,
        field: 'kunci',
        message: `Soal nomor ${nomorLabel}: kunci sebab_akibat belum terdeteksi dan perlu dilengkapi manual.`
      });
    }
    if (key === 'E') {
      pushExcelIssue(rowErrors, {
        row: row.__row_number,
        nomor,
        field: 'kunci',
        message: `Soal nomor ${nomorLabel}: kunci sebab_akibat hanya boleh A/B/C/D.`
      });
    }

    soal.pertanyaan = pertanyaan || 'Bacalah pernyataan berikut ini dengan cermat!';
    soal.pilihan_a = pernyataan;
    soal.pilihan_b = sebab;
    soal.pilihan_c = getExcelHtml(row, 'pilihan_c') || SEBAB_AKIBAT_OPTIONS.pilihan_c;
    soal.pilihan_d = getExcelHtml(row, 'pilihan_d') || SEBAB_AKIBAT_OPTIONS.pilihan_d;
    soal.pilihan_e = null;
    soal.jawaban_benar = key || null;

    if (getExcelHtml(row, 'pilihan_a') || getExcelHtml(row, 'pilihan_b')) {
      pushExcelIssue(rowWarnings, {
        row: row.__row_number,
        nomor,
        field: 'pilihan_a/pilihan_b',
        message: `Soal nomor ${nomorLabel}: untuk sebab_akibat, kolom pernyataan dan sebab dipakai sebagai isi utama agar kompatibel dengan editor lama.`
      });
    }
  }

  if (soal.tipe_soal === 'benar_salah') {
    soal.pernyataan_checklist = [];
    soal.pernyataan_benar_salah = [];
    soal.jawaban_benar_json = {};
  }

  if (soal.tipe_soal === 'menjodohkan') {
    soal.pasangan_menjodohkan = {
      kolom_kiri: [],
      kolom_kanan: [],
      kunci: {}
    };
  }

  if (rowErrors.length > 0) {
    soal.status_parse = 'perlu_dicek';
    soal.confidence = 0.65;
  }

  errors.push(...rowErrors);
  if (nomor) seenNomor.add(nomor);
  return soal;
}

function buildImportQualityReportFromExcel(soalPreview, validationErrors, validationWarnings, targetCount) {
  return {
    source: 'excel',
    total_soal_target: Number(targetCount || 0),
    total_soal_detected: soalPreview.length,
    validation_errors: validationErrors,
    validation_warnings: validationWarnings,
    save_blocked_reasons: validationErrors.map(item => item.message),
    empty_options: validationErrors.filter(item => String(item.field || '').startsWith('pilihan_')),
    empty_keys: validationErrors.filter(item => ['kunci', 'jawaban'].includes(item.field)),
    missing_images_warning: [],
    missing_tables_warning: [],
    unmapped_images: [],
    unmapped_tables: []
  };
}

function buildExcelImportPreview(filePath, instrumen, originalName) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const soalSheet = readExcelSheet(workbook, EXCEL_IMPORT_SHEETS.SOAL);
  const errors = [];
  const warnings = [];

  if (!soalSheet.sheetName) {
    const sheetList = workbook.SheetNames.join(', ');
    const headerInfo = (soalSheet.headerInfo || []).join(' | ');

    return {
      fatal: true,
      message: `Sheet soal tidak ditemukan. Sheet tersedia: ${sheetList}. Deteksi header kandidat: ${headerInfo}. Format minimal yang dibutuhkan: nomor/no, pertanyaan/soal, tipe/jenis, pilihan_a..e, kunci/jawaban.`,
      data: null
    };
  }

  const benarSalahSheet = readExcelSheet(workbook, EXCEL_IMPORT_SHEETS.BENAR_SALAH);
  const menjodohkanSheet = readExcelSheet(workbook, EXCEL_IMPORT_SHEETS.MENJODOHKAN);
  const tabelSheet = readExcelSheet(workbook, EXCEL_IMPORT_SHEETS.TABEL_PENDUKUNG);
  const mediaSheet = readExcelSheet(workbook, EXCEL_IMPORT_SHEETS.MEDIA);
  const seenNomor = new Set();
  const soalPreview = soalSheet.rows.map(row => buildExcelQuestionPreview(row, instrumen, errors, seenNomor));
  const soalMap = new Map(soalPreview.map(soal => [Number(soal.nomor), soal]));

  const benarSalahByNomor = groupExcelRowsByNomor(
    benarSalahSheet.rows,
    EXCEL_IMPORT_SHEETS.BENAR_SALAH,
    soalMap,
    'benar_salah',
    errors
  );
  const menjodohkanByNomor = groupExcelRowsByNomor(
    menjodohkanSheet.rows,
    EXCEL_IMPORT_SHEETS.MENJODOHKAN,
    soalMap,
    'menjodohkan',
    errors
  );
  const tabelByNomor = groupExcelRowsByNomor(
    tabelSheet.rows,
    EXCEL_IMPORT_SHEETS.TABEL_PENDUKUNG,
    soalMap,
    null,
    errors
  );
  const mediaByNomor = groupExcelRowsByNomor(
    mediaSheet.rows,
    EXCEL_IMPORT_SHEETS.MEDIA,
    soalMap,
    null,
    errors
  );

  soalPreview.forEach(soal => {
    if (soal.tipe_soal === 'benar_salah') {
      const rows = benarSalahByNomor.get(Number(soal.nomor)) || [];
      if (rows.length === 0) {
        pushExcelIssue(errors, {
          sheet: EXCEL_IMPORT_SHEETS.BENAR_SALAH,
          nomor: soal.nomor,
          message: `Soal nomor ${soal.nomor}: benar_salah tidak punya data di sheet BENAR_SALAH.`
        });
        soal.errors.push({
          sheet: EXCEL_IMPORT_SHEETS.BENAR_SALAH,
          nomor: soal.nomor,
          message: `Soal nomor ${soal.nomor}: benar_salah tidak punya data di sheet BENAR_SALAH.`
        });
      } else {
        applyExcelBenarSalah(soal, rows, errors);
      }
    }

    if (soal.tipe_soal === 'menjodohkan') {
      const rows = menjodohkanByNomor.get(Number(soal.nomor)) || [];
      if (rows.length === 0) {
        pushExcelIssue(errors, {
          sheet: EXCEL_IMPORT_SHEETS.MENJODOHKAN,
          nomor: soal.nomor,
          message: `Soal nomor ${soal.nomor}: menjodohkan tidak punya data di sheet MENJODOHKAN.`
        });
        soal.errors.push({
          sheet: EXCEL_IMPORT_SHEETS.MENJODOHKAN,
          nomor: soal.nomor,
          message: `Soal nomor ${soal.nomor}: menjodohkan tidak punya data di sheet MENJODOHKAN.`
        });
      } else {
        applyExcelMenjodohkan(soal, rows, errors);
      }
    }

    const tables = buildExcelSupportingTables(tabelByNomor.get(Number(soal.nomor)) || []);
    soal.supporting_tables = tables;
    soal.tabel_data = tables;

    const mediaRows = mediaByNomor.get(Number(soal.nomor)) || [];
    soal.media = mediaRows.map(row => ({
      source: 'excel_metadata',
      jenis_media: getExcelText(row, 'jenis_media'),
      nama_file: getExcelText(row, 'nama_file'),
      caption: getExcelText(row, 'caption'),
      sumber: getExcelText(row, 'sumber'),
      keterangan: getExcelText(row, 'keterangan')
    })).filter(item => item.jenis_media || item.nama_file || item.caption || item.sumber || item.keterangan);

    if (soal.media.length > 0) {
      pushExcelIssue(warnings, {
        sheet: EXCEL_IMPORT_SHEETS.MEDIA,
        nomor: soal.nomor,
        message: `Soal nomor ${soal.nomor}: MEDIA dibaca sebagai metadata. Gambar tetap ditambahkan manual lewat preview editor.`
      });
      soal.warnings.push({
        sheet: EXCEL_IMPORT_SHEETS.MEDIA,
        nomor: soal.nomor,
        message: `Soal nomor ${soal.nomor}: MEDIA dibaca sebagai metadata. Gambar tetap ditambahkan manual lewat preview editor.`
      });
    }

    if (soal.errors.length > 0) {
      soal.status_parse = 'perlu_dicek';
      soal.confidence = Math.min(Number(soal.confidence || 1), 0.65);
    }
  });

  const targetCount = Number(instrumen.jumlah_soal || 0);
  const qualityReport = buildImportQualityReportFromExcel(soalPreview, errors, warnings, targetCount);
  const sheetCounts = {
    SOAL: soalSheet.rows.length,
    BENAR_SALAH: benarSalahSheet.rows.length,
    MENJODOHKAN: menjodohkanSheet.rows.length,
    TABEL_PENDUKUNG: tabelSheet.rows.length,
    MEDIA: mediaSheet.rows.length
  };

  return {
    fatal: false,
    data: {
      instrumen: {
        id: instrumen.id,
        judul: instrumen.judul,
        jenis: instrumen.jenis,
        kelas: instrumen.kelas,
        jumlah_soal_target: instrumen.jumlah_soal
      },
      summary: {
        source: 'excel',
        nama_file: originalName,
        jumlah_sheet: workbook.SheetNames.length,
        sheet_counts: sheetCounts,
        total_soal_terdeteksi: soalPreview.length,
        total_error: errors.length,
        total_warning: warnings.length,
        target_soal: targetCount
      },
      document_preview: {
        source: 'excel',
        raw_html: '',
        raw_text: `Import Excel SMIASB: ${originalName}. Sheet SOAL berisi ${soalPreview.length} soal.`,
        blocks: Object.entries(sheetCounts).map(([sheet, total]) => ({
          tag: 'sheet',
          block_type: 'excel_sheet',
          text: `${sheet}: ${total} baris`
        })),
        tables: [],
        images: [],
        sheet_counts: sheetCounts
      },
      parser: {
        source: 'excel',
        status: errors.length > 0 ? 'needs_review' : 'success',
        total_detected: soalPreview.length,
        confidence: errors.length > 0 ? 0.82 : 1,
        strategy: 'smiasb_excel_template',
        message: errors.length > 0
          ? 'Preview Excel berhasil dibuat, tetapi ada validasi yang perlu diperbaiki.'
          : 'Preview Excel berhasil dibuat dari template SMIASB.',
        debug: {
          sheets: workbook.SheetNames,
          selected_sheet: soalSheet.sheetName,
          selected_headers: soalSheet.headers || [],
          sheet_counts: sheetCounts
        },
        import_quality_report: qualityReport
      },
      import_quality_report: qualityReport,
      total_soal_terdeteksi: soalPreview.length,
      soal_preview: soalPreview,
      errors,
      warnings,
      is_valid: errors.length === 0
    }
  };
}

const DUPLICATE_SOAL_EXCLUDED_COLUMNS = new Set([
  'id',
  'instrumen_id',
  'nomor',
  'created_at',
  'updated_at'
]);

function quoteColumnName(column) {
  if (!/^[A-Za-z0-9_]+$/.test(column)) {
    throw new Error(`Nama kolom tidak valid: ${column}`);
  }

  return `\`${column}\``;
}

function parseDuplicateBoolean(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'ya', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'tidak', 'no', 'off'].includes(normalized)) return false;

  return defaultValue;
}

function normalizeDuplicateStatus(value) {
  const status = String(value || 'draft').trim().toLowerCase();
  return ['draft', 'aktif'].includes(status) ? status : null;
}

function shuffleSoalRows(rows) {
  const shuffled = [...rows];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const unchanged =
    rows.length > 1 &&
    rows.every((row, index) => Number(row.id) === Number(shuffled[index]?.id));

  if (unchanged) {
    shuffled.push(shuffled.shift());
  }

  return shuffled;
}

async function getCopyableSoalColumns(conn) {
  const [columns] = await conn.execute('SHOW COLUMNS FROM soal');

  return columns
    .filter(column => !DUPLICATE_SOAL_EXCLUDED_COLUMNS.has(column.Field))
    .filter(column => !/generated/i.test(String(column.Extra || '')))
    .map(column => column.Field);
}

function normalizeKelasSqlExpression(column) {
  if (!/^[A-Za-z0-9_.]+$/.test(column)) {
    throw new Error(`Nama kolom kelas tidak valid: ${column}`);
  }

  const base = `UPPER(TRIM(REPLACE(${column}, '_', ' ')))`;
  const spacesCollapsed = [
    '     ',
    '    ',
    '   ',
    '  ',
    '  '
  ].reduce((expr, spaces) => `REPLACE(${expr}, '${spaces}', ' ')`, base);
  const spacesToDashes = `REPLACE(${spacesCollapsed}, ' ', '-')`;

  return [
    '--',
    '--',
    '--'
  ].reduce((expr, dashes) => `REPLACE(${expr}, '${dashes}', '-')`, spacesToDashes);
}

function normalizeInstrumenTitle(value = '') {
  return String(value || '').trim().toLowerCase();
}

async function findInstrumenWithSameTitleAndClass(executor, idSekolah, kelas, judul, excludeId = null) {
  const where = [
    'id_sekolah <=> ?',
    `${normalizeKelasSqlExpression('kelas')} = ?`,
    'LOWER(TRIM(judul)) = ?'
  ];
  const params = [
    idSekolah,
    normalizeKelas(kelas),
    normalizeInstrumenTitle(judul)
  ];

  if (excludeId) {
    where.push('id <> ?');
    params.push(excludeId);
  }

  const [rows] = await executor.execute(
    `SELECT id, judul, kelas
     FROM instrumen
     WHERE ${where.join(' AND ')}
     LIMIT 1`,
    params
  );

  return rows[0] || null;
}

// ============================================================
// GET /api/instrumen — daftar semua instrumen
// ============================================================
router.get('/', authenticate, async (req, res) => {
  try {
    const { jenis, status, kelas, mapel, search, id_sekolah } = req.query;
    const parsedPage = Number.parseInt(req.query.page, 10);
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Math.min(
      100,
      Math.max(1, Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10)
    );
    const offset = (page - 1) * limit;

    let where = [];
    let params = [];

    const scope = appendSekolahScope(where, params, req.user, 'i.id_sekolah', id_sekolah);
    if (!scope.ok) return denyAccess(res);

    if (isGuru(req.user)) {
      where.push('i.dibuat_oleh = ?');
      params.push(req.user.id);
    }

    if (isSiswa(req.user)) {
      where.push('i.status = "aktif"');

      const siswaKelas = normalizeKelas(req.user.kelas);
      if (siswaKelas) {
        where.push(`${normalizeKelasSqlExpression('i.kelas')} = ?`);
        params.push(siswaKelas);
      }
    }

    if (jenis) { where.push('i.jenis = ?'); params.push(jenis); }
    if (status && !isSiswa(req.user)) { where.push('i.status = ?'); params.push(status); }
    if (kelas && !isSiswa(req.user)) {
      where.push(`${normalizeKelasSqlExpression('i.kelas')} = ?`);
      params.push(normalizeKelas(kelas));
    }
    if (mapel) { where.push('i.mata_pelajaran LIKE ?'); params.push('%' + mapel + '%'); }
    if (search) {
      where.push('(i.judul LIKE ? OR i.deskripsi LIKE ?)');
      params.push('%' + search + '%', '%' + search + '%');
    }

    const whereStr = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const [rows] = await pool.query(
      `SELECT i.*, u.nama AS pembuat,
        (SELECT COUNT(*) FROM soal WHERE soal.instrumen_id = i.id) as jumlah_soal_terisi
       FROM instrumen i
       LEFT JOIN users u ON i.dibuat_oleh = u.id
       ${whereStr}
       ORDER BY i.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const [total] = await pool.execute(
      `SELECT COUNT(*) as total FROM instrumen i ${whereStr}`,
      params
    );

    return res.json({
      success: true,
      data: rows,
      pagination: {
        total: total[0].total,
        page,
        limit,
        totalPages: Math.ceil(total[0].total / limit)
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// ============================================================
// GET /api/instrumen/:id/download — download file
// ============================================================
router.get('/:id/download', authenticate, async (req, res) => {
  try {
    const access = await canAccessInstrumen(req.user, req.params.id, 'download');
    if (!access.ok) {
      return res.status(access.status || 403).json({
        success: false,
        message: access.message || 'Anda tidak memiliki akses ke data ini'
      });
    }

    const [rows] = await pool.execute(
      'SELECT file_path, file_nama FROM instrumen WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0 || !rows[0].file_path) {
      return res.status(404).json({ success: false, message: 'File tidak ditemukan.' });
    }
    const filePath = path.join(getUploadRoot(), rows[0].file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File tidak ada di server.' });
    }
    res.download(filePath, rows[0].file_nama);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// ============================================================
// GET /api/instrumen/:id — detail instrumen + soal lengkap
// ============================================================
router.get('/:id', authenticate, async (req, res) => {
  try {
    const access = await canAccessInstrumen(req.user, req.params.id, 'view');
    if (!access.ok) {
      return res.status(access.status || 403).json({
        success: false,
        message: access.message || 'Anda tidak memiliki akses ke data ini'
      });
    }

    const [rows] = await pool.execute(
      `SELECT i.*, u.nama AS pembuat,
              i.gunakan_batas_waktu, i.batas_waktu
       FROM instrumen i 
       LEFT JOIN users u ON i.dibuat_oleh = u.id
       WHERE i.id = ?`,
      [req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Instrumen tidak ditemukan.' });
    }

    const instrumen = rows[0];
    const now = new Date();

    // Validasi untuk siswa
    if (req.user.peran === 'siswa') {
      if (instrumen.status !== 'aktif') {
        return res.status(403).json({
          success: false,
          message: 'Instrumen belum dibuka oleh guru'
        });
      }

      if (
        instrumen.kelas &&
        req.user.kelas &&
        normalizeKelas(instrumen.kelas) !== normalizeKelas(req.user.kelas)
      ) {
        return res.status(403).json({
          success: false,
          message: `Instrumen ini hanya untuk kelas ${instrumen.kelas}`
        });
      }

      if (instrumen.waktu_mulai && now < new Date(instrumen.waktu_mulai)) {
        return res.status(403).json({
          success: false,
          message: 'Ujian belum dimulai'
        });
      }

      if (instrumen.waktu_selesai && now > new Date(instrumen.waktu_selesai)) {
        return res.status(403).json({
          success: false,
          message: 'Ujian sudah berakhir'
        });
      }

      // ========== VALIDASI BATAS WAKTU (FITUR BARU) ==========
      if (instrumen.gunakan_batas_waktu === 1 && instrumen.batas_waktu) {
        const waktuBatas = new Date(instrumen.batas_waktu);
        
        if (now > waktuBatas) {
          return res.status(403).json({
            success: false,
            message: 'Maaf, batas waktu pengerjaan instrumen ini sudah habis',
            expired: true,
            batas_waktu: instrumen.batas_waktu
          });
        }
        
        const sisaDetik = Math.floor((waktuBatas - now) / 1000);
        instrumen.sisa_waktu_detik = sisaDetik;
      } else {
        instrumen.sisa_waktu_detik = null;
      }
      // ========== END VALIDASI BATAS WAKTU ==========
    }

    const [soalRows] = await pool.execute(
      `SELECT id, nomor, pertanyaan, pilihan_a, pilihan_b, pilihan_c, pilihan_d, 
              jawaban_benar, tipe_soal, kategori_instrumen
       FROM soal 
       WHERE instrumen_id = ? 
       ORDER BY nomor ASC`,
      [req.params.id]
    );

    return res.json({
      success: true,
      data: {
        ...instrumen,
        soal: soalRows,
        jumlah_soal_terisi: soalRows.length
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// ============================================================
// POST /api/instrumen — buat instrumen baru (guru/admin)
// ============================================================
router.post('/', authenticate, authorize('guru', 'admin'), upload.single('file'), [
  body('judul').trim().notEmpty().withMessage('Judul wajib diisi'),
  body('jenis').isIn(['HOTS', 'Literasi', 'Numerasi']).withMessage('Jenis tidak valid'),
  body('mata_pelajaran').notEmpty().withMessage('Mata pelajaran wajib diisi'),
  body('kelas').notEmpty().withMessage('Kelas wajib diisi'),
  body('jumlah_soal').isInt({ min: 1 }).withMessage('Jumlah soal minimal 1'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { judul, deskripsi, jenis, mata_pelajaran, kelas, jumlah_soal, status, gunakan_batas_waktu, batas_waktu, id_sekolah } = req.body;
  const file_path = req.file ? req.file.filename : null;
  const file_nama = req.file ? req.file.originalname : null;

  try {
    const targetSekolah = resolveTargetSekolahId(req.user, id_sekolah);
    if (!targetSekolah.ok) return denyAccess(res);

    const normalizedInstrumenKelas = normalizeKelas(kelas);
    const existingSameTitleClass = await findInstrumenWithSameTitleAndClass(
      pool,
      targetSekolah.id_sekolah,
      normalizedInstrumenKelas,
      judul
    );

    if (existingSameTitleClass) {
      return res.status(409).json({
        success: false,
        message: 'Instrumen dengan judul dan kelas yang sama sudah ada.'
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO instrumen (id_sekolah, judul, deskripsi, jenis, mata_pelajaran, kelas, jumlah_soal, status, file_path, file_nama, dibuat_oleh, gunakan_batas_waktu, batas_waktu)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [targetSekolah.id_sekolah, judul, deskripsi || null, jenis, mata_pelajaran, normalizedInstrumenKelas,
       parseInt(jumlah_soal), status || 'draft',
       file_path, file_nama, req.user.id,
       gunakan_batas_waktu !== undefined ? gunakan_batas_waktu : 0,
       batas_waktu || null]
    );

    return res.status(201).json({
      success: true,
      message: 'Instrumen berhasil dibuat.',
      data: { id: result.insertId }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// ============================================================
// POST /api/instrumen/:id/duplicate-to-class - gunakan instrumen untuk kelas lain
// ============================================================
router.post('/:id/duplicate-to-class', authenticate, authorize('guru', 'admin'), async (req, res) => {
  let conn;

  try {
    if (isSuperAdmin(req.user)) {
      return denyAccess(res);
    }

    const access = await canAccessInstrumen(req.user, req.params.id, 'manage');
    if (!access.ok) {
      return res.status(access.status || 403).json({
        success: false,
        message: access.message || 'Anda tidak memiliki akses ke data ini'
      });
    }

    const instrumenAsal = access.instrumen;
    const kelasTujuan = normalizeKelas(req.body.kelas_tujuan);
    const judulBaru = String(req.body.judul_baru || '').trim() || `${instrumenAsal.judul} - ${kelasTujuan}`;
    const statusBaru = normalizeDuplicateStatus(req.body.status);
    const acakSoal = parseDuplicateBoolean(req.body.acak_soal, true);

    if (!kelasTujuan) {
      return res.status(400).json({
        success: false,
        message: 'Kelas tujuan wajib diisi.'
      });
    }

    if (normalizeKelas(kelasTujuan) === normalizeKelas(instrumenAsal.kelas)) {
      return res.status(400).json({
        success: false,
        message: 'Kelas tujuan tidak boleh sama dengan kelas asal.'
      });
    }

    if (!statusBaru) {
      return res.status(400).json({
        success: false,
        message: 'Status awal hanya boleh draft atau aktif.'
      });
    }

    const existingSameTitleClass = await findInstrumenWithSameTitleAndClass(
      pool,
      instrumenAsal.id_sekolah,
      kelasTujuan,
      judulBaru,
      instrumenAsal.id
    );

    if (existingSameTitleClass) {
      return res.status(409).json({
        success: false,
        message: 'Instrumen dengan judul dan kelas tujuan yang sama sudah ada.'
      });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [soalAsalRows] = await conn.execute(
      'SELECT * FROM soal WHERE instrumen_id = ? ORDER BY nomor ASC, id ASC',
      [instrumenAsal.id]
    );

    if (soalAsalRows.length === 0) {
      await conn.rollback();
      conn.release();
      conn = null;

      return res.status(400).json({
        success: false,
        message: 'Instrumen asal belum memiliki soal. Tambahkan soal terlebih dahulu sebelum digunakan untuk kelas lain.'
      });
    }

    const targetJumlahSoal = Number(instrumenAsal.jumlah_soal || soalAsalRows.length || 0);

    if (statusBaru === 'aktif' && soalAsalRows.length < targetJumlahSoal) {
      await conn.rollback();
      conn.release();
      conn = null;

      return res.status(400).json({
        success: false,
        message: `Tidak bisa mengaktifkan salinan. Soal belum lengkap (${soalAsalRows.length}/${targetJumlahSoal}).`
      });
    }

    const [instrumenResult] = await conn.execute(
      `INSERT INTO instrumen
       (id_sekolah, judul, deskripsi, jenis, mata_pelajaran, kelas, jumlah_soal, status,
        file_path, file_nama, dibuat_oleh, gunakan_batas_waktu, batas_waktu)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        instrumenAsal.id_sekolah,
        judulBaru,
        instrumenAsal.deskripsi || null,
        instrumenAsal.jenis,
        instrumenAsal.mata_pelajaran,
        kelasTujuan,
        targetJumlahSoal,
        statusBaru,
        null,
        null,
        instrumenAsal.dibuat_oleh || req.user.id,
        Number(instrumenAsal.gunakan_batas_waktu) === 1 ? 1 : 0,
        instrumenAsal.batas_waktu || null
      ]
    );

    const instrumenBaruId = instrumenResult.insertId;
    const soalColumns = await getCopyableSoalColumns(conn);
    const soalUntukDisalin = acakSoal ? shuffleSoalRows(soalAsalRows) : soalAsalRows;

    if (soalColumns.length > 0 && soalUntukDisalin.length > 0) {
      const insertColumns = ['instrumen_id', 'nomor', ...soalColumns];
      const columnSql = insertColumns.map(quoteColumnName).join(', ');
      const placeholderSql = insertColumns.map(() => '?').join(', ');
      const insertSql = `INSERT INTO soal (${columnSql}) VALUES (${placeholderSql})`;

      for (let index = 0; index < soalUntukDisalin.length; index++) {
        const soal = soalUntukDisalin[index];
        const values = [
          instrumenBaruId,
          index + 1,
          ...soalColumns.map(column => (
            Object.prototype.hasOwnProperty.call(soal, column) ? soal[column] : null
          ))
        ];

        await conn.execute(insertSql, values);
      }
    }

    await conn.commit();
    conn.release();
    conn = null;

    let bankSoalSync = null;
    let bankSoalWarning = null;
    if (statusBaru === 'aktif') {
      try {
        bankSoalSync = await syncInstrumenToBankSoal(instrumenBaruId);
      } catch (syncErr) {
        bankSoalWarning = 'Instrumen aktif, tetapi sinkronisasi Bank Soal gagal.';
        console.error('Sync Bank Soal gagal setelah duplikasi instrumen:', syncErr);
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Instrumen berhasil digunakan untuk kelas lain',
      data: {
        instrumen_lama_id: Number(instrumenAsal.id),
        instrumen_baru_id: Number(instrumenBaruId),
        kelas_tujuan: kelasTujuan,
        jumlah_soal_disalin: soalUntukDisalin.length,
        acak_soal: acakSoal,
        bank_soal_added: bankSoalSync?.added || 0,
        bank_soal_skipped: bankSoalSync?.skipped || 0,
        warning: null
      },
      warning: bankSoalWarning
    });
  } catch (err) {
    console.error(err);

    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('Rollback duplicate instrumen gagal:', rollbackErr);
      }
      conn.release();
    }

    return res.status(500).json({
      success: false,
      message: 'Gagal menggunakan instrumen untuk kelas lain.'
    });
  }
});

// ============================================================
// PUT /api/instrumen/:id — update instrumen (termasuk status/aktifkan)
// ============================================================
router.put('/:id', authenticate, authorize('guru', 'admin'), upload.single('file'), async (req, res) => {
  const { judul, deskripsi, jenis, mata_pelajaran, kelas, jumlah_soal, status, gunakan_batas_waktu, batas_waktu } = req.body;

  try {
    const [existing] = await pool.execute(
      'SELECT * FROM instrumen WHERE id = ?',
      [req.params.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Instrumen tidak ditemukan.' });
    }

    const access = await canAccessInstrumen(req.user, req.params.id, 'manage');
    if (!access.ok) return denyAccess(res);

    const [countResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM soal WHERE instrumen_id = ?',
      [req.params.id]
    );
    const jumlahSoalSaatIni = countResult[0].total;
    const targetSoal = parseInt(jumlah_soal) || existing[0].jumlah_soal;

    if (status === 'aktif' && jumlahSoalSaatIni < targetSoal) {
      return res.status(400).json({
        success: false,
        message: `Tidak bisa mengaktifkan! Soal belum lengkap (${jumlahSoalSaatIni}/${targetSoal}). Silakan tambah ${targetSoal - jumlahSoalSaatIni} soal lagi.`
      });
    }

    const file_path = req.file ? req.file.filename : existing[0].file_path;
    const file_nama = req.file ? req.file.originalname : existing[0].file_nama;
    const normalizedInstrumenKelas =
      kelas !== undefined && kelas !== null && String(kelas).trim() !== ''
        ? normalizeKelas(kelas)
        : existing[0].kelas;
    const nextJudul = judul || existing[0].judul;
    const existingSameTitleClass = await findInstrumenWithSameTitleAndClass(
      pool,
      existing[0].id_sekolah,
      normalizedInstrumenKelas,
      nextJudul,
      req.params.id
    );

    if (existingSameTitleClass) {
      return res.status(409).json({
        success: false,
        message: 'Instrumen dengan judul dan kelas yang sama sudah ada.'
      });
    }

    await pool.execute(
      `UPDATE instrumen SET 
        judul=?, deskripsi=?, jenis=?, mata_pelajaran=?, kelas=?,
        jumlah_soal=?, status=?, file_path=?, file_nama=?,
        gunakan_batas_waktu=?, batas_waktu=?, updated_at=NOW() 
       WHERE id=?`,
      [judul || existing[0].judul, deskripsi || existing[0].deskripsi,
       jenis || existing[0].jenis, mata_pelajaran || existing[0].mata_pelajaran,
       normalizedInstrumenKelas, targetSoal,
       status || existing[0].status, file_path, file_nama,
       gunakan_batas_waktu !== undefined ? gunakan_batas_waktu : existing[0].gunakan_batas_waktu,
       batas_waktu !== undefined ? batas_waktu : existing[0].batas_waktu,
       req.params.id]
    );

    let bankSoalSync = null;
    let bankSoalWarning = null;
    const shouldSyncBankSoal = status === 'aktif' && existing[0].status !== 'aktif';

    if (shouldSyncBankSoal) {
      try {
        bankSoalSync = await syncInstrumenToBankSoal(req.params.id);
      } catch (syncErr) {
        bankSoalWarning = 'Instrumen aktif, tetapi sinkronisasi Bank Soal gagal.';
        console.error('Sync Bank Soal gagal setelah aktivasi instrumen:', syncErr);
      }
    }

    return res.json({ 
      success: true, 
      message: status === 'aktif' ? 'Instrumen berhasil diaktifkan!' : 'Instrumen berhasil diperbarui.',
      data: {
        status: status || existing[0].status,
        jumlah_soal_terisi: jumlahSoalSaatIni,
        target_soal: targetSoal,
        bank_soal_added: bankSoalSync?.added || 0,
        bank_soal_skipped: bankSoalSync?.skipped || 0
      },
      warning: bankSoalWarning
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// ============================================================
// DELETE /api/instrumen/:id/reset-soal — reset semua soal
// ============================================================
router.delete('/:id/reset-soal', authenticate, authorize('guru', 'admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const access = await canAccessInstrumen(req.user, id, 'manage');
    if (!access.ok) return denyAccess(res);

    await pool.execute('DELETE FROM jawaban_siswa WHERE instrumen_id = ?', [id]);
    await pool.execute('DELETE FROM hasil_siswa WHERE instrumen_id = ?', [id]);
    await pool.execute('DELETE FROM soal WHERE instrumen_id = ?', [id]);
    await pool.execute('UPDATE instrumen SET status = "draft" WHERE id = ?', [id]);

    return res.json({
      success: true,
      message: 'Semua soal, jawaban siswa, dan hasil telah dihapus. Status direset ke draft.'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Gagal mereset soal.' });
  }
});

// ============================================================
// DELETE /api/instrumen/:id — hapus instrumen
// ============================================================
router.delete('/:id', authenticate, authorize('guru', 'admin'), async (req, res) => {
  try {
    const [existing] = await pool.execute(
      'SELECT * FROM instrumen WHERE id = ?',
      [req.params.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Instrumen tidak ditemukan.' });
    }
    const access = await canAccessInstrumen(req.user, req.params.id, 'manage');
    if (!access.ok) return denyAccess(res);

    if (existing[0].file_path) {
      const filePath = path.join(getUploadRoot(), existing[0].file_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await pool.execute('DELETE FROM instrumen WHERE id = ?', [req.params.id]);
    return res.json({ success: true, message: 'Instrumen berhasil dihapus.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
  }
});

// ============================================================
// PATCH /api/instrumen/:id/batas-waktu - update hanya batas waktu (bisa untuk instrumen aktif)
// ============================================================
router.patch('/:id/batas-waktu', authenticate, authorize('guru', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { gunakan_batas_waktu, batas_waktu } = req.body;

    // Cek apakah instrumen ada
    const [existing] = await pool.execute(
      'SELECT * FROM instrumen WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Instrumen tidak ditemukan.' });
    }

    const access = await canAccessInstrumen(req.user, id, 'manage');
    if (!access.ok) return denyAccess(res);

    // Update hanya batas waktu (tidak mengubah field lain)
    await pool.execute(
      `UPDATE instrumen SET 
        gunakan_batas_waktu = ?,
        batas_waktu = ?,
        updated_at = NOW()
       WHERE id = ?`,
      [
        gunakan_batas_waktu !== undefined ? gunakan_batas_waktu : existing[0].gunakan_batas_waktu,
        batas_waktu !== undefined ? batas_waktu : existing[0].batas_waktu,
        id
      ]
    );

    return res.json({
      success: true,
      message: 'Batas waktu berhasil diperbarui.',
      data: {
        gunakan_batas_waktu: gunakan_batas_waktu !== undefined ? gunakan_batas_waktu : existing[0].gunakan_batas_waktu,
        batas_waktu: batas_waktu || null
      }
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Gagal memperbarui batas waktu.' });
  }
});

// ============================================================
// POST /api/instrumen/:id/import-word/preview
// Preview isi file Word + ekstrak gambar + pecah menjadi soal.
// BELUM menyimpan ke tabel soal.
// ============================================================
router.post('/:id/import-excel/preview', authenticate, authorize('guru', 'admin'), upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'File Excel wajib diupload.'
      });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext !== '.xlsx') {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

      return res.status(400).json({
        success: false,
        message: 'Import Excel SMIASB hanya menerima file .xlsx.'
      });
    }

    const access = await validateImportAccess(req, id);
    if (!access.ok) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

      return res.status(access.status).json({
        success: false,
        message: access.message
      });
    }

    const result = buildExcelImportPreview(req.file.path, access.instrumen, req.file.originalname);

    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    if (result.fatal) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }

    return res.json({
      success: true,
      message: result.data.is_valid
        ? 'Preview Excel berhasil dibaca.'
        : 'Preview Excel berhasil dibaca, tetapi ada validasi yang perlu diperbaiki.',
      data: result.data
    });
  } catch (err) {
    console.error('ERROR IMPORT EXCEL PREVIEW:', err);

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return res.status(500).json({
      success: false,
      message: 'Gagal membaca file Excel.',
      error: err.message
    });
  }
});

router.post('/:id/import-word/upload-image', authenticate, authorize('guru', 'admin'), uploadImportImage.single('gambar'), async (req, res) => {
  try {
    const { id } = req.params;

    const access = await validateImportAccess(req, id);
    if (!access.ok) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

      return res.status(access.status).json({
        success: false,
        message: access.message
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'File gambar wajib diupload.'
      });
    }

    return res.json({
      success: true,
      message: 'Gambar manual berhasil diupload.',
      data: {
        file_name: req.file.filename,
        src: `/uploads/soal/${req.file.filename}`,
        mime_type: req.file.mimetype,
        source: 'manual'
      }
    });
  } catch (err) {
    console.error('ERROR IMPORT WORD UPLOAD IMAGE:', err);

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return res.status(500).json({
      success: false,
      message: err.message || 'Gagal upload gambar manual.'
    });
  }
});

router.post('/:id/import-word/preview', authenticate, authorize('guru', 'admin'), upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'File Word wajib diupload.'
      });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();

    if (ext !== '.docx') {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

      return res.status(400).json({
        success: false,
        message: 'Untuk import otomatis, gunakan file .docx.'
      });
    }

    const access = await validateImportAccess(req, id);

    if (!access.ok) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

      return res.status(access.status).json({
        success: false,
        message: access.message
      });
    }

    const instrumen = access.instrumen;

    // Folder gambar soal hasil ekstrak Word
    const imageDir = getUploadDir('soal');

    const savedImages = [];

    // Convert DOCX ke HTML + simpan gambar ke uploads/soal
    const result = await mammoth.convertToHtml(
      { path: req.file.path },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const base64 = await image.read('base64');

          let extImage = 'png';
          if (image.contentType === 'image/jpeg') extImage = 'jpg';
          if (image.contentType === 'image/png') extImage = 'png';
          if (image.contentType === 'image/gif') extImage = 'gif';
          if (image.contentType === 'image/webp') extImage = 'webp';

          const fileName = `word-soal-${Date.now()}-${Math.round(Math.random() * 1e9)}.${extImage}`;
          const filePath = path.join(imageDir, fileName);

          fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));

          const url = `/uploads/soal/${fileName}`;

          savedImages.push({
            file_name: fileName,
            file_url: url,
            mime_type: image.contentType
          });

          return { src: url };
        })
      }
    );

    const html = result.value || '';
    const $ = cheerio.load(html);

    const plainText = $('body').text()
      .replace(/\s+/g, ' ')
      .trim();

    const paragraphCount = $('p').length;
    const imageCount = $('img').length;
    const tableCount = $('table').length;
    const documentBlocks = extractBlocksFromHtml(html);
    const documentTables = extractTablesFromHtml(html);
    const targetFromFrontend = Number(req.body.target_soal || req.body.targetSoal || req.body.jumlah_soal || 0);
    const targetCount = targetFromFrontend || Number(instrumen.jumlah_soal || 0);
    const ooxmlBlocks = await extractDocxBlocksFromOOXML(req.file.path, savedImages);
    const docxResult = splitQuestionSegmentsFromBlocks(ooxmlBlocks, targetCount, 'ooxml_numbering');
    const previewResult = buildSoalPreviewResultFromHtml(html, {
      targetCount,
      docxResult
    });
    const parserDebug = previewResult.parser_debug;
    const importQualityReport = previewResult.import_quality_report;
    const soalPreview = previewResult.soal_preview.map((soal) => ({
      ...soal,
      kategori_instrumen: instrumen.jenis || soal.kategori_instrumen
    }));
    const averageConfidence = soalPreview.length > 0
      ? soalPreview.reduce((total, soal) => total + Number(soal.confidence || 0), 0) / soalPreview.length
      : 0;
    const parserStatus = soalPreview.length === 0
      ? 'failed'
      : (targetCount > 0 && soalPreview.length >= targetCount ? 'success' : 'partial');

    // Hapus file DOCX sementara setelah berhasil dibaca
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    return res.json({
      success: true,
      message: 'Preview Word berhasil dibaca.',
      data: {
        instrumen: {
          id: instrumen.id,
          judul: instrumen.judul,
          jenis: instrumen.jenis,
          kelas: instrumen.kelas,
          jumlah_soal_target: instrumen.jumlah_soal
        },
        summary: {
          nama_file: req.file.originalname,
          jumlah_paragraf: paragraphCount,
          jumlah_gambar: imageCount,
          jumlah_tabel: tableCount,
          jumlah_blok: documentBlocks.length,
          panjang_teks: plainText.length,
          target_soal: targetCount
        },
        images: savedImages,
        document_preview: {
          raw_html: html,
          raw_text: plainText,
          blocks: documentBlocks,
          tables: documentTables,
          images: savedImages,
          debug: parserDebug
        },
        parser: {
          status: parserStatus,
          total_detected: soalPreview.length,
          confidence: Number(averageConfidence.toFixed(2)),
          strategy: previewResult.parser_strategy,
          debug: parserDebug,
          import_quality_report: importQualityReport,
          message: 'Parser hanya bantuan otomatis. Cek Preview Dokumen Word untuk melihat isi lengkap.'
        },
        import_quality_report: importQualityReport,
        total_soal_terdeteksi: soalPreview.length,
        soal_preview: soalPreview,
        html_preview: html,
        text_preview: plainText.slice(0, 1500),
        debug_parser: parserDebug,
        warnings: [
          ...(parserDebug.warnings || []),
          ...((importQualityReport?.missing_images_warning || []).map(item => item.message)),
          ...((importQualityReport?.missing_tables_warning || []).map(item => item.message)),
          ...((importQualityReport?.unmapped_images || []).map(() => 'Ada gambar yang belum terpetakan ke soal.')),
          ...((importQualityReport?.unmapped_tables || []).map(() => 'Ada tabel yang belum terpetakan ke soal.')),
          ...(result.messages || [])
        ]
      }
    });

  } catch (err) {
    console.error('ERROR IMPORT WORD PREVIEW:', err);

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return res.status(500).json({
      success: false,
      message: 'Gagal membaca file Word.',
      error: err.message
    });
  }
});

// ============================================================
// POST /api/instrumen/:id/import-word/save
// Simpan soal hasil preview ke tabel soal.
// Body JSON:
// {
//   "soal_preview": [...],
//   "replace_existing": false,
//   "auto_update_jumlah_soal": true
// }
// ============================================================
router.post('/:id/import-word/save', authenticate, authorize('guru', 'admin'), async (req, res) => {
  let conn;

  try {
    const { id } = req.params;
    let { soal_preview, replace_existing = false, auto_update_jumlah_soal = true } = req.body;

    if (typeof soal_preview === 'string') {
      try {
        soal_preview = JSON.parse(soal_preview);
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: 'Format soal_preview tidak valid. Pastikan berupa array JSON.'
        });
      }
    }

    if (!Array.isArray(soal_preview) || soal_preview.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Data soal_preview wajib diisi dan harus berupa array.'
      });
    }

    const access = await validateImportAccess(req, id);

    if (!access.ok) {
      return res.status(access.status).json({
        success: false,
        message: access.message
      });
    }

    const instrumen = access.instrumen;

    const [hasilRows] = await pool.execute(
      'SELECT COUNT(*) AS total FROM hasil_siswa WHERE instrumen_id = ?',
      [id]
    );

    if (hasilRows[0].total > 0) {
      return res.status(400).json({
        success: false,
        message: 'Instrumen ini sudah memiliki hasil siswa. Import ulang soal tidak diizinkan agar data nilai tidak rusak.'
      });
    }

    const [existingSoalRows] = await pool.execute(
      'SELECT COUNT(*) AS total FROM soal WHERE instrumen_id = ?',
      [id]
    );

    if (existingSoalRows[0].total > 0 && !replace_existing) {
      return res.status(400).json({
        success: false,
        message: `Instrumen sudah memiliki ${existingSoalRows[0].total} soal. Kirim replace_existing=true jika ingin mengganti semua soal.`
      });
    }

    const missingKeys = [];

    soal_preview.forEach((soal, index) => {
      const nomor = soal.nomor || index + 1;

      if (
        (soal.tipe_soal === 'pilihan_ganda' || soal.tipe_soal === 'sebab_akibat') &&
        !soal.jawaban_benar
      ) {
        missingKeys.push({
          nomor,
          tipe_soal: soal.tipe_soal,
          field: 'jawaban_benar'
        });
      }

      if (soal.tipe_soal === 'ganda_kompleks') {
        const jawabanJson = soal.jawaban_benar_json;

        if (
          !jawabanJson ||
          (Array.isArray(jawabanJson) && jawabanJson.length === 0)
        ) {
          missingKeys.push({
            nomor,
            tipe_soal: soal.tipe_soal,
            field: 'jawaban_benar_json'
          });
        }
      }

      if (soal.tipe_soal === 'benar_salah') {
        const jawabanJson = soal.jawaban_benar_json;

        if (
          !jawabanJson ||
          (typeof jawabanJson === 'object' && Object.keys(jawabanJson).length === 0)
        ) {
          missingKeys.push({
            nomor,
            tipe_soal: soal.tipe_soal,
            field: 'jawaban_benar_json'
          });
        }
      }

      if (
        soal.tipe_soal === 'menjodohkan' &&
        (
          !soal.pasangan_menjodohkan ||
          !soal.pasangan_menjodohkan.kunci ||
          Object.keys(soal.pasangan_menjodohkan.kunci).length === 0
        )
      ) {
        missingKeys.push({
          nomor,
          tipe_soal: soal.tipe_soal,
          field: 'pasangan_menjodohkan.kunci'
        });
      }
    });

    const validationErrors = validateImportPreviewBeforeSave(soal_preview);
    const importQualityReport = buildImportQualityReport(soal_preview, {
      targetCount: Number(instrumen.jumlah_soal || 0)
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: validationErrors.slice(0, 5).join(' '),
        errors: validationErrors,
        import_quality_report: importQualityReport
      });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    if (replace_existing) {
      await conn.execute('DELETE FROM jawaban_siswa WHERE instrumen_id = ?', [id]);
      await conn.execute('DELETE FROM hasil_siswa WHERE instrumen_id = ?', [id]);
      await conn.execute('DELETE FROM soal WHERE instrumen_id = ?', [id]);
    }

    if (auto_update_jumlah_soal) {
      await conn.execute(
        'UPDATE instrumen SET jumlah_soal = ?, updated_at = NOW() WHERE id = ?',
        [soal_preview.length, id]
      );
    } else if (soal_preview.length > Number(instrumen.jumlah_soal || 0)) {
      await conn.rollback();

      return res.status(400).json({
        success: false,
        message: `Jumlah soal hasil import (${soal_preview.length}) melebihi target instrumen (${instrumen.jumlah_soal}).`
      });
    }

    const inserted = [];

    for (let index = 0; index < soal_preview.length; index++) {
      const soal = soal_preview[index];

      const tipeSoal = soal.tipe_soal || 'pilihan_ganda';
      const nomor = soal.nomor || index + 1;
      const normalizedImages = Array.isArray(soal.gambar)
        ? soal.gambar.map(normalizeImportImageForSave).filter(image => image.file_name || image.src)
        : [];

      const gambarPertama =
        normalizedImages.length > 0
          ? (normalizedImages[0].file_name || getImageFileNameFromSrc(normalizedImages[0].src))
          : (soal.gambar_soal || null);

      const pilihanArray = Array.isArray(soal.pilihan) ? soal.pilihan : [];

      const pilihanA = stripOptionLabelPrefix(soal.pilihan_a || pilihanArray[0] || '');
      const pilihanB = stripOptionLabelPrefix(soal.pilihan_b || pilihanArray[1] || '');
      const pilihanC = stripOptionLabelPrefix(soal.pilihan_c || pilihanArray[2] || '');
      const pilihanD = stripOptionLabelPrefix(soal.pilihan_d || pilihanArray[3] || '');
      const pilihanE = tipeSoal === 'sebab_akibat'
        ? null
        : stripOptionLabelPrefix(soal.pilihan_e || pilihanArray[4] || '');

      const tabelDataForSave = getQuestionTablesForSave(soal, normalizedImages);
      const tabelData = tabelDataForSave ? safeJsonStringify(tabelDataForSave) : null;

      const jawabanBenarValue =
        tipeSoal === 'ganda_kompleks'
          ? normalizeImportAnswerArray(soal.jawaban_benar_json)
          : soal.jawaban_benar_json;

      const jawabanBenarJson =
        jawabanBenarValue !== undefined &&
        jawabanBenarValue !== null
          ? safeJsonStringify(jawabanBenarValue)
          : null;

      const pasanganMenjodohkan = soal.pasangan_menjodohkan
        ? safeJsonStringify(sanitizeMatchingPayloadForSave(soal.pasangan_menjodohkan))
        : null;

      const pernyataanChecklist = soal.pernyataan_checklist
        ? safeJsonStringify(sanitizeImportStatementList(soal.pernyataan_checklist))
        : null;

      const pertanyaanBase =
        tipeSoal === 'sebab_akibat'
          ? buildPertanyaanSebabAkibat(soal)
          : (soal.pertanyaan || soal.raw_text || `Soal nomor ${nomor}`);
      const hasLayoutBlocks = Array.isArray(soal.layout_blocks) && soal.layout_blocks.length > 0;
      const pertanyaan = hasLayoutBlocks
        ? sanitizeImportHtmlForSave(pertanyaanBase)
        : buildPertanyaanWithImportSupport(
            {
              ...soal,
              gambar: normalizedImages
            },
            pertanyaanBase
          );

      // FIX ERROR: kategori dan bobot wajib didefinisikan sebelum dipakai di INSERT
      const kategori = soal.kategori_instrumen || instrumen.jenis || 'HOTS';
      const bobot = Number(soal.bobot || 1);

      const [result] = await conn.execute(
        `INSERT INTO soal 
        (instrumen_id, nomor, pertanyaan, gambar_soal, tabel_data,
         pilihan_a, pilihan_b, pilihan_c, pilihan_d, pilihan_e,
         jawaban_benar, jawaban_benar_json, tipe_soal, kategori_instrumen, bobot,
         pasangan_menjodohkan, pernyataan_checklist)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          nomor,
          pertanyaan,
          gambarPertama,
          tabelData,
          pilihanA,
          pilihanB,
          pilihanC,
          pilihanD,
          pilihanE,
          soal.jawaban_benar || null,
          jawabanBenarJson,
          tipeSoal,
          kategori,
          bobot,
          pasanganMenjodohkan,
          pernyataanChecklist
        ]
      );

      inserted.push({
        id: result.insertId,
        nomor,
        tipe_soal: tipeSoal
      });
    }

    await conn.commit();

    return res.status(201).json({
      success: true,
      message: `${inserted.length} soal berhasil disimpan dari hasil import Word.`,
      data: {
        instrumen_id: Number(id),
        total_disimpan: inserted.length,
        soal: inserted,
        missing_keys: missingKeys,
        catatan:
          missingKeys.length > 0
            ? 'Beberapa soal belum memiliki kunci jawaban. Lengkapi melalui halaman edit soal sebelum instrumen diaktifkan.'
            : 'Semua soal memiliki kunci jawaban dari data preview.'
      }
    });

  } catch (err) {
    console.error('ERROR IMPORT WORD SAVE:', err);

    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {}
    }

    return res.status(500).json({
      success: false,
      message: 'Gagal menyimpan soal hasil import Word.',
      error: err.message
    });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
module.exports._parser = {
  buildSoalPreviewResultFromHtml,
  splitQuestionSegmentsFromHtml,
  splitQuestionSegmentsFromDocx,
  extractDocxBlocksFromOOXML,
  splitQuestionSegmentsFromBlocks,
  buildPreviewAssetMapping,
  buildImportQualityReport
};
