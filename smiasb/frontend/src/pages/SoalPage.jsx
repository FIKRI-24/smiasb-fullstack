import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp } from "lucide-react";
import api, { bankSoalAPI } from "../api";
import toast from 'react-hot-toast'
import { sanitizeRichHtml, stripHtml } from "../utils/sanitizeHtml";

const emptyBankSoalFilters = {
  search: "",
  kelas: "",
  mata_pelajaran: "",
  jenis_instrumen: "",
  tipe_soal: "",
  materi: "",
};

const bankSoalJenisOptions = ["Literasi", "Numerasi", "HOTS"];
const bankSoalTipeOptions = [
  { value: "pilihan_ganda", label: "Pilihan Ganda" },
  { value: "ganda_kompleks", label: "Ganda Kompleks" },
  { value: "benar_salah", label: "Benar/Salah" },
  { value: "menjodohkan", label: "Menjodohkan" },
  { value: "sebab_akibat", label: "Sebab Akibat" },
];
const layoutBlockDefinitions = [
  { type: 'question', id: 'question', label: 'Pertanyaan' },
  { type: 'stimulus', id: 'stimulus', label: 'Stimulus Tambahan' },
  { type: 'image', id: 'images', label: 'Gambar Soal' },
  { type: 'table', id: 'tables', label: 'Tabel Pendukung' }
];
const defaultLayoutBlocks = [{ type: 'question', id: 'question' }];
const layoutBlockLabelMap = layoutBlockDefinitions.reduce((acc, block) => {
  acc[block.type] = block.label;
  return acc;
}, {});

const SoalPage = () => {
  const { instrumenId } = useParams();
  const navigate = useNavigate();
  const [instrumen, setInstrumen] = useState(null);
  const [soal, setSoal] = useState([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [editingSoal, setEditingSoal] = useState(null);
  const [siswaStatus, setSiswaStatus] = useState(null);
  const [showSiswaModal, setShowSiswaModal] = useState(false);
  const [selectedSiswa, setSelectedSiswa] = useState(null);
  const [gambarFile, setGambarFile] = useState(null);
  const [previewGambar, setPreviewGambar] = useState(null);
  const [removeGambarSoal, setRemoveGambarSoal] = useState(false);
  const [zoomPreviewImage, setZoomPreviewImage] = useState(null);
  const [zoomPreviewScale, setZoomPreviewScale] = useState(1);
  const [showBankSoalModal, setShowBankSoalModal] = useState(false);
  const [bankSoalItems, setBankSoalItems] = useState([]);
  const [bankSoalMeta, setBankSoalMeta] = useState({ page: 1, total_pages: 1, total: 0 });
  const [bankSoalFilters, setBankSoalFilters] = useState(emptyBankSoalFilters);
  const [appliedBankSoalFilters, setAppliedBankSoalFilters] = useState(emptyBankSoalFilters);
  const [bankSoalPage, setBankSoalPage] = useState(1);
  const [bankSoalLoading, setBankSoalLoading] = useState(false);
  const [bankSoalError, setBankSoalError] = useState("");
  const [selectedBankSoalIds, setSelectedBankSoalIds] = useState([]);
  const [usingBankSoal, setUsingBankSoal] = useState(false);
  const [bankSoalDetail, setBankSoalDetail] = useState(null);
  const [bankSoalAllowCrossClass, setBankSoalAllowCrossClass] = useState(false);

  const [form, setForm] = useState({
    pertanyaan: "",
    pertanyaanBold: false,
    pertanyaanFontSize: '18px',
    pertanyaanAlign: 'left',
    pilihan_a: "", pilihan_b: "", pilihan_c: "", pilihan_d: "", pilihan_e: "",
    jawaban_benar: "A", jawaban_benar_json: [],
    tipe_soal: "pilihan_ganda", kategori_instrumen: "HOTS", bobot: 1,
    tabel_data: "", supporting_tables: [], pernyataan_checklist: [],
    gambar_caption: "",
    stimulus_tambahan: "",
    stimulusBold: false,
    stimulusFontSize: '16px',
    stimulusAlign: 'left',
    layout_blocks: defaultLayoutBlocks,
    pasangan_menjodohkan: { kolom_kiri: [], kolom_kanan: [], kunci: {} }
  });

  
  const fetchData = async () => {
    try {
      const resInstrumen = await api.get(`/instrumen/${instrumenId}`);
      setInstrumen(resInstrumen.data.data);
      const resSoal = await api.get(`/soal/${instrumenId}`);
      setSoal(resSoal.data.data);
      if (resInstrumen.data.data.status === "aktif") {
        try {
          const resSiswaStatus = await api.get(`/soal/monitoring/${instrumenId}`);
          setSiswaStatus(resSiswaStatus.data.data);
        } catch (err) { console.error("Gagal ambil monitoring:", err); }
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const buildDefaultBankSoalFilters = (allowCrossClass = bankSoalAllowCrossClass) => ({
    ...emptyBankSoalFilters,
    kelas: allowCrossClass ? "" : (instrumen?.kelas || ""),
    mata_pelajaran: instrumen?.mata_pelajaran || "",
    jenis_instrumen: instrumen?.jenis || "",
  });

  const fetchBankSoal = async (pageValue = bankSoalPage, filtersValue = appliedBankSoalFilters) => {
    setBankSoalLoading(true);
    setBankSoalError("");

    try {
      const params = { page: pageValue, limit: 10 };
      Object.entries(filtersValue).forEach(([key, value]) => {
        if (value) params[key] = value;
      });
      if (instrumen?.id_sekolah) params.id_sekolah = instrumen.id_sekolah;

      const res = await bankSoalAPI.getList(params);
      setBankSoalItems(res.data.data || []);
      setBankSoalMeta(res.data.meta || { page: pageValue, total_pages: 1, total: 0 });
    } catch (err) {
      console.error(err);
      setBankSoalItems([]);
      setBankSoalError(err.response?.data?.message || "Gagal memuat Bank Soal.");
    } finally {
      setBankSoalLoading(false);
    }
  };

  useEffect(() => {
    if (showBankSoalModal) fetchBankSoal(bankSoalPage, appliedBankSoalFilters);
  }, [showBankSoalModal, bankSoalPage, appliedBankSoalFilters]);

  const openBankSoalModal = () => {
    const defaultFilters = buildDefaultBankSoalFilters(false);
    setBankSoalAllowCrossClass(false);
    setBankSoalFilters(defaultFilters);
    setAppliedBankSoalFilters(defaultFilters);
    setBankSoalPage(1);
    setSelectedBankSoalIds([]);
    setShowBankSoalModal(true);
    setBankSoalError("");
    setBankSoalDetail(null);
  };

  const closeBankSoalModal = () => {
    if (usingBankSoal) return;
    setShowBankSoalModal(false);
    setSelectedBankSoalIds([]);
    setBankSoalDetail(null);
  };

  const handleBankSoalFilterChange = (field, value) => {
    setBankSoalFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleBankSoalCrossClassChange = (checked) => {
    setBankSoalAllowCrossClass(checked);
    setSelectedBankSoalIds([]);
    setBankSoalDetail(null);
    setBankSoalPage(1);
    setBankSoalFilters(prev => ({
      ...prev,
      kelas: checked ? "" : (instrumen?.kelas || ""),
      mata_pelajaran: instrumen?.mata_pelajaran || prev.mata_pelajaran,
      jenis_instrumen: instrumen?.jenis || prev.jenis_instrumen,
    }));
    setAppliedBankSoalFilters(prev => ({
      ...prev,
      kelas: checked ? "" : (instrumen?.kelas || ""),
      mata_pelajaran: instrumen?.mata_pelajaran || prev.mata_pelajaran,
      jenis_instrumen: instrumen?.jenis || prev.jenis_instrumen,
    }));
  };

  const applyBankSoalFilters = () => {
    const nextFilters = {
      ...bankSoalFilters,
      kelas: bankSoalAllowCrossClass ? bankSoalFilters.kelas : (instrumen?.kelas || ""),
      mata_pelajaran: instrumen?.mata_pelajaran || bankSoalFilters.mata_pelajaran,
      jenis_instrumen: instrumen?.jenis || bankSoalFilters.jenis_instrumen,
    };
    setBankSoalFilters(nextFilters);
    setBankSoalPage(1);
    setSelectedBankSoalIds([]);
    setAppliedBankSoalFilters(nextFilters);
  };

  const resetBankSoalFilters = () => {
    const defaultFilters = buildDefaultBankSoalFilters(bankSoalAllowCrossClass);
    setBankSoalFilters(defaultFilters);
    setAppliedBankSoalFilters(defaultFilters);
    setSelectedBankSoalIds([]);
    setBankSoalPage(1);
  };

  const toggleBankSoalSelection = (id) => {
    setSelectedBankSoalIds(prev => (
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    ));
  };

  const addSelectedBankSoalToInstrumen = async () => {
    if (!selectedBankSoalIds.length) {
      toast.error("Pilih minimal satu soal dari Bank Soal.");
      return;
    }

    setUsingBankSoal(true);
    setBankSoalError("");

    try {
      const res = await bankSoalAPI.useToInstrumen(instrumenId, selectedBankSoalIds, {
        allow_cross_class: bankSoalAllowCrossClass,
      });
      const added = res.data.added_count || 0;
      const skipped = res.data.skipped_count || 0;
      const crossClassCount = res.data.cross_class_count || 0;

      if (added > 0) {
        toast.success(skipped > 0
          ? `${added} soal ditambahkan, ${skipped} soal dilewati.`
          : `${added} soal berhasil ditambahkan dari Bank Soal.`
        );
        if (crossClassCount > 0) {
          toast(res.data.warning || `${crossClassCount} soal dari kelas berbeda ditambahkan.`);
        }
      } else {
        toast.error(res.data.message || "Tidak ada soal baru yang ditambahkan.");
      }

      setShowBankSoalModal(false);
      setSelectedBankSoalIds([]);
      setBankSoalDetail(null);
      await fetchData();
    } catch (err) {
      console.error(err);
      const message = err.response?.data?.message || "Gagal menambahkan soal dari Bank Soal.";
      setBankSoalError(message);
      toast.error(message);
    } finally {
      setUsingBankSoal(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => {
      const next = { ...prev, [name]: type === 'checkbox' ? checked : value };
      if (name === 'tipe_soal' && value === 'sebab_akibat') {
        next.pilihan_a = '';
        next.pilihan_b = '';
        next.pilihan_c = '';
        next.pilihan_d = '';
        next.pilihan_e = '';
        if (next.jawaban_benar === 'E') next.jawaban_benar = '';
      }
      return next;
    });
  };

  const escapeHtml = (value = '') => (
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  );

  const formatTextForHtml = (value = '') => escapeHtml(String(value || '')).replace(/\r?\n/g, '<br>');
  const stimulusFontOptions = ['14px', '16px', '18px', '20px', '22px', '24px'];
  const textAlignOptions = ['left', 'center', 'right', 'justify'];

  const parsePlainTextValue = (value = '') => {
    const source = String(value || '');
    if (/<[a-z][\s\S]*>/i.test(source)) {
      return stripHtml(source.replace(/<br\s*\/?>/gi, '\n')).trim();
    }
    return source;
  };

  const parseStyledTextControl = (value = '', defaults = {}) => {
    const source = String(value || '');
    const result = {
      text: parsePlainTextValue(source),
      bold: Boolean(defaults.bold),
      fontSize: defaults.fontSize || '16px',
      align: defaults.align || 'left'
    };

    if (!/<[a-z][\s\S]*>/i.test(source) || typeof window === 'undefined' || !window.DOMParser) {
      return result;
    }

    const doc = new window.DOMParser().parseFromString(source, 'text/html');
    const elements = Array.from(doc.body.querySelectorAll('*'));

    result.bold = elements.some(el => {
      const tag = el.tagName.toLowerCase();
      const weight = String(el.style?.fontWeight || '').toLowerCase();
      return tag === 'strong' || tag === 'b' || weight === 'bold' || Number(weight) >= 600;
    });

    const fontEl = elements.find(el => stimulusFontOptions.includes(el.style?.fontSize));
    if (fontEl) result.fontSize = fontEl.style.fontSize;

    const alignEl = elements.find(el => textAlignOptions.includes(el.style?.textAlign));
    if (alignEl) result.align = alignEl.style.textAlign;

    return result;
  };

  const buildStyledHtml = (text = '', options = {}) => {
    const content = formatTextForHtml(text);
    if (!content) return '';
    const spanStyles = [];
    if (options.fontSize) spanStyles.push(`font-size: ${options.fontSize}`);

    const sizedHtml = spanStyles.length
      ? `<span style="${spanStyles.join('; ')}">${content}</span>`
      : content;
    const innerHtml = options.bold ? `<strong>${sizedHtml}</strong>` : sizedHtml;

    const wrapperStyles = [];
    if (options.align) wrapperStyles.push(`text-align: ${options.align}`);

    const html = wrapperStyles.length
      ? `<div style="${wrapperStyles.join('; ')}">${innerHtml}</div>`
      : innerHtml;

    return sanitizeRichHtml(html);
  };

  const updateSupportTableCaptionStyle = (tableIndex, nextFields) => {
    const table = form.supporting_tables[tableIndex];
    if (!table) return;
    updateSupportTable(tableIndex, { ...table, ...nextFields });
  };

  const createEmptyTable = () => ({
    source: 'manual',
    role: 'stimulus',
    caption: '',
    captionBold: false,
    captionFontSize: '14px',
    captionAlign: 'center',
    width: '100%',
    align: 'center',
    fontSize: '14px',
    rows: [['', ''], ['', '']]
  });

  const parseSupportingTablesFromTabelData = (raw) => {
    let parsed = Array.isArray(raw) ? raw : (() => {
      try { return JSON.parse(String(raw || '')); } catch (e) { return []; }
    })();

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(table => !isLayoutMetadataTable(table))
      .map((table) => {
        const rows = Array.isArray(table.rows) && table.rows.length
          ? table.rows.map(row => Array.isArray(row) ? row.map(cell => String(cell ?? '')) : [])
          : (table && typeof table === 'object' ? [Object.keys(table), Object.values(table).map(value => String(value ?? ''))] : [['', ''], ['', '']]);

        return {
          source: table.source || 'manual',
          role: table.role || 'stimulus',
          caption: parsePlainTextValue(table.caption || ''),
          captionBold: typeof table.captionBold === 'boolean' ? table.captionBold : false,
          captionFontSize: ['12px', '14px', '16px', '18px', '20px', '22px', '24px'].includes(table.captionFontSize) ? table.captionFontSize : '14px',
          captionAlign: ['left', 'center', 'right', 'justify'].includes(table.captionAlign) ? table.captionAlign : 'center',
          width: ['50%', '75%', '100%'].includes(table.width) ? table.width : '100%',
          align: ['left', 'center', 'right'].includes(table.align) ? table.align : 'center',
          fontSize: ['12px', '14px', '16px', '18px'].includes(table.fontSize) ? table.fontSize : '14px',
          rows
        };
      });
  };

  const updateSupportTable = (tableIndex, nextTable) => {
    setForm(prev => ({
      ...prev,
      supporting_tables: prev.supporting_tables.map((table, idx) => idx === tableIndex ? nextTable : table)
    }));
  };

  const addSupportTable = () => {
    setForm(prev => ({ ...prev, supporting_tables: [...(prev.supporting_tables || []), createEmptyTable()] }));
  };

  const removeSupportTable = (tableIndex) => {
    setForm(prev => ({
      ...prev,
      supporting_tables: prev.supporting_tables.filter((_, idx) => idx !== tableIndex)
    }));
  };

  const addTableRow = (tableIndex) => {
    const table = form.supporting_tables[tableIndex];
    const nextRows = [...table.rows, Array(table.rows[0]?.length || 2).fill('')];
    updateSupportTable(tableIndex, { ...table, rows: nextRows });
  };

  const removeTableRow = (tableIndex, rowIndex) => {
    const table = form.supporting_tables[tableIndex];
    if (!table || table.rows.length <= 1) return;
    const nextRows = table.rows.filter((_, idx) => idx !== rowIndex);
    updateSupportTable(tableIndex, { ...table, rows: nextRows });
  };

  const addTableColumn = (tableIndex) => {
    const table = form.supporting_tables[tableIndex];
    const nextRows = table.rows.map(row => [...row, '']);
    updateSupportTable(tableIndex, { ...table, rows: nextRows });
  };

  const removeTableColumn = (tableIndex, colIndex) => {
    const table = form.supporting_tables[tableIndex];
    if (!table || table.rows[0]?.length <= 1) return;
    const nextRows = table.rows.map(row => row.filter((_, idx) => idx !== colIndex));
    updateSupportTable(tableIndex, { ...table, rows: nextRows });
  };

  const updateTableCell = (tableIndex, rowIndex, columnIndex, value) => {
    const table = form.supporting_tables[tableIndex];
    const nextRows = table.rows.map((row, rIdx) => (
      rIdx === rowIndex ? row.map((cell, cIdx) => cIdx === columnIndex ? value : cell) : row
    ));
    updateSupportTable(tableIndex, { ...table, rows: nextRows });
  };

  const pasteIntoSupportTable = (event, tableIndex, rowIndex, columnIndex) => {
    const text = event.clipboardData?.getData('text/plain') || '';
    if (!text.includes('\t') && !text.includes('\n')) return;

    event.preventDefault();

    const pastedRows = text
      .replace(/\r/g, '')
      .replace(/\n$/, '')
      .split('\n')
      .map(row => row.split('\t'));
    const table = form.supporting_tables[tableIndex];
    if (!table) return;

    const rows = table.rows.map(row => [...row]);
    pastedRows.forEach((pastedRow, pastedRowIndex) => {
      const targetRow = rowIndex + pastedRowIndex;
      if (!rows[targetRow]) rows[targetRow] = Array.from({ length: rows[0]?.length || 2 }, () => '');

      pastedRow.forEach((cell, pastedColumnIndex) => {
        const targetColumn = columnIndex + pastedColumnIndex;
        while (rows[targetRow].length <= targetColumn) rows[targetRow].push('');
        rows[targetRow][targetColumn] = cell;
      });
    });

    const maxColumns = Math.max(...rows.map(row => row.length));
    const normalizedRows = rows.map(row => {
      const next = [...row];
      while (next.length < maxColumns) next.push('');
      return next;
    });

    updateSupportTable(tableIndex, { ...table, rows: normalizedRows });
  };

  const pasteIntoChoices = (event, startLabel) => {
    const text = event.clipboardData?.getData('text/plain') || '';
    const normalizedText = text.replace(/\r/g, '').replace(/\n$/, '');
    const lines = normalizedText
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    if (lines.length < 2 && !normalizedText.includes('\t')) return;

    const allowedLabels = form.tipe_soal === 'ganda_kompleks'
      ? ['A', 'B', 'C', 'D', 'E']
      : ['A', 'B', 'C', 'D'];
    const startIndex = allowedLabels.indexOf(String(startLabel || '').toUpperCase());
    if (startIndex < 0) return;

    const parsedItems = [];

    lines.forEach((line) => {
      const cells = line.split('\t').map(cell => cell.trim()).filter(Boolean);
      const source = cells.length > 1 ? cells.join(' ') : line;
      const labelSource = cells[0] || '';
      const valueSource = cells.length > 1 ? cells.slice(1).join(' ') : source;
      const labeledCell = labelSource.match(/^([A-Ea-e])\s*[\.\)]?$/);
      const labeledLine = source.match(/^([A-Ea-e])\s*[\.\)]\s*(.+)$/);

      if (labeledCell && valueSource) {
        parsedItems.push({
          label: labeledCell[1].toUpperCase(),
          value: valueSource.trim()
        });
        return;
      }

      if (labeledLine) {
        parsedItems.push({
          label: labeledLine[1].toUpperCase(),
          value: labeledLine[2].trim()
        });
        return;
      }

      parsedItems.push({ label: null, value: source.trim() });
    });

    const nextValues = {};
    parsedItems.forEach((item, itemIndex) => {
      const label = item.label || allowedLabels[startIndex + itemIndex];
      if (!allowedLabels.includes(label) || !item.value) return;
      nextValues[`pilihan_${label.toLowerCase()}`] = item.value;
    });

    if (Object.keys(nextValues).length === 0) return;

    event.preventDefault();
    setForm(prev => ({ ...prev, ...nextValues }));
  };

  const handleGambarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setGambarFile(file);
      setRemoveGambarSoal(false);
      const reader = new FileReader();
      reader.onloadend = () => setPreviewGambar(reader.result);
      reader.readAsDataURL(file);
      setForm(prev => {
        const blocks = normalizeManualLayoutBlocks(prev.layout_blocks);
        return blocks.some(block => block.type === 'image')
          ? prev
          : { ...prev, layout_blocks: [...blocks, { type: 'image', id: 'images' }] };
      });
    }
  };

  const openPreviewImageZoom = () => {
    if (!previewGambar) return;
    setZoomPreviewImage(previewGambar);
    setZoomPreviewScale(1);
  };

  const closePreviewImageZoom = () => {
    setZoomPreviewImage(null);
    setZoomPreviewScale(1);
  };

  const zoomPreviewIn = () => {
    setZoomPreviewScale(prev => Math.min(3, Number((prev + 0.25).toFixed(2))));
  };

  const zoomPreviewOut = () => {
    setZoomPreviewScale(prev => Math.max(0.5, Number((prev - 0.25).toFixed(2))));
  };

  const isLayoutMetadataTable = (table = {}) => (
    String(table?.role || '').toLowerCase() === 'layout_blocks' ||
    String(table?.type || '').toLowerCase() === 'layout_blocks' ||
    Array.isArray(table?.layout_blocks)
  );

  const getLayoutMetadataFromTabelData = (tabelData) => {
    const parsed = Array.isArray(tabelData) ? tabelData : (() => {
      try { return JSON.parse(String(tabelData || '')); } catch (e) { return null; }
    })();

    if (!Array.isArray(parsed)) return null;
    return parsed.find(isLayoutMetadataTable) || null;
  };

  const stringifyTabelData = (value) => {
    if (Array.isArray(value)) return JSON.stringify(value, null, 2);
    if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value || '');
  };

  const parseTabelDataInput = (value) => {
    if (!value) return null;
    try { return JSON.parse(value); } catch (e) { return null; }
  };

  const normalizeManualLayoutBlocks = (blocks = []) => {
    const allowed = new Map(layoutBlockDefinitions.map(block => [block.type, block]));
    const seen = new Set();
    const normalized = [];

    (Array.isArray(blocks) ? blocks : []).forEach(block => {
      const type = String(block?.type || '').trim();
      const definition = allowed.get(type);
      if (!definition || seen.has(type)) return;
      seen.add(type);
      normalized.push({ type, id: block?.id || definition.id });
    });

    if (!seen.has('question')) normalized.unshift({ type: 'question', id: 'question' });

    return normalized;
  };

  const isDefaultLayoutOrder = (blocks = []) => (
    normalizeManualLayoutBlocks(blocks).map(block => block.type).join('|') ===
    defaultLayoutBlocks.map(block => block.type).join('|')
  );

  const getLayoutBlockDefinition = (type) => (
    layoutBlockDefinitions.find(block => block.type === type)
  );

  const addManualLayoutBlock = (type) => {
    const definition = getLayoutBlockDefinition(type);
    if (!definition || type === 'question') return;

    setForm(prev => {
      const blocks = normalizeManualLayoutBlocks(prev.layout_blocks);
      if (blocks.some(block => block.type === type)) return prev;

      const next = {
        ...prev,
        layout_blocks: [...blocks, { type: definition.type, id: definition.id }]
      };

      if (type === 'table' && (!Array.isArray(prev.supporting_tables) || prev.supporting_tables.length === 0)) {
        next.supporting_tables = [createEmptyTable()];
      }

      return next;
    });

    if (type === 'image') setRemoveGambarSoal(false);
  };

  const removeManualLayoutBlock = (type) => {
    if (type === 'question') return;

    setForm(prev => {
      const next = {
        ...prev,
        layout_blocks: normalizeManualLayoutBlocks(prev.layout_blocks).filter(block => block.type !== type)
      };

      if (type === 'stimulus') {
        next.stimulus_tambahan = '';
        next.stimulusBold = false;
        next.stimulusFontSize = '16px';
        next.stimulusAlign = 'left';
      }

      if (type === 'table') {
        next.supporting_tables = [];
      }

      if (type === 'image') {
        next.gambar_caption = '';
      }

      return next;
    });

    if (type === 'image') {
      setGambarFile(null);
      setPreviewGambar(null);
      setRemoveGambarSoal(Boolean(editingSoal?.gambar_soal));
    }
  };

  const moveManualLayoutBlock = (type, direction) => {
    setForm(prev => {
      const blocks = normalizeManualLayoutBlocks(prev.layout_blocks);
      const index = blocks.findIndex(block => block.type === type);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= blocks.length) return prev;

      const nextBlocks = [...blocks];
      const [moved] = nextBlocks.splice(index, 1);
      nextBlocks.splice(nextIndex, 0, moved);

      return { ...prev, layout_blocks: nextBlocks };
    });
  };

  const buildTabelDataWithLayoutMetadata = () => {
    const existingData = parseTabelDataInput(form.tabel_data);
    const supportingTables = Array.isArray(form.supporting_tables) && form.supporting_tables.length > 0
      ? form.supporting_tables
      : Array.isArray(existingData)
        ? existingData.filter(table => !isLayoutMetadataTable(table))
        : [];

    const blocks = normalizeManualLayoutBlocks(form.layout_blocks);

    const stimulusText = parsePlainTextValue(form.stimulus_tambahan);
    const stimulus = buildStyledHtml(stimulusText, {
      bold: form.stimulusBold,
      fontSize: form.stimulusFontSize,
      align: form.stimulusAlign
    });
    const hasStimulus = stimulusText.trim() !== '';
    const hasImage = blocks.some(block => block.type === 'image') && Boolean(previewGambar) && !removeGambarSoal;
    const shouldIncludeLayout = hasStimulus || hasImage || !isDefaultLayoutOrder(blocks) || supportingTables.length > 0;
    const imageCaptionText = parsePlainTextValue(form.gambar_caption || '');
    const imageCaption = buildStyledHtml(imageCaptionText, {
      fontSize: '14px',
      align: 'left'
    });

    const nextTables = supportingTables.map((table) => ({
      ...table,
      caption: buildStyledHtml(table.caption || '', {
        bold: table.captionBold,
        fontSize: table.captionFontSize,
        align: table.captionAlign
      })
    }));

    if (shouldIncludeLayout) {
      nextTables.push({
        source: 'layout',
        role: 'layout_blocks',
        type: 'layout_blocks',
        layout_blocks: blocks,
        stimulus_tambahan: stimulus,
        gambar: hasImage ? [{
          source: 'manual',
          role: 'image',
          caption: imageCaption,
          alt: imageCaptionText,
          ukuran: 'sedang',
          width: '75%',
          align: 'center'
        }] : []
      });
    }

    return nextTables.length > 0 ? JSON.stringify(nextTables) : '';
  };

  const handlePernyataanChecklistChange = (index, value) => {
    const newPernyataan = [...(form.pernyataan_checklist || [])];
    newPernyataan[index] = value;
    setForm({ ...form, pernyataan_checklist: newPernyataan });
  };
  const addPernyataanChecklist = () => {
    setForm({ ...form, pernyataan_checklist: [...(form.pernyataan_checklist || []), ""] });
  };
  const removePernyataanChecklist = (index) => {
    const newPernyataan = [...(form.pernyataan_checklist || [])];
    newPernyataan.splice(index, 1);
    setForm({ ...form, pernyataan_checklist: newPernyataan });
  };

  const handleKolomKiriChange = (index, value) => {
    const newKolomKiri = [...(form.pasangan_menjodohkan.kolom_kiri || [])];
    newKolomKiri[index] = value;
    setForm({ ...form, pasangan_menjodohkan: { ...form.pasangan_menjodohkan, kolom_kiri: newKolomKiri } });
  };
  const handleKolomKananChange = (index, value) => {
    const newKolomKanan = [...(form.pasangan_menjodohkan.kolom_kanan || [])];
    newKolomKanan[index] = value;
    setForm({ ...form, pasangan_menjodohkan: { ...form.pasangan_menjodohkan, kolom_kanan: newKolomKanan } });
  };
  const handleKunciJodohChange = (index, value) => {
    setForm({ ...form, pasangan_menjodohkan: { ...form.pasangan_menjodohkan, kunci: { ...form.pasangan_menjodohkan.kunci, [index + 1]: value } } });
  };
  const addPasanganJodoh = () => {
    setForm({
      ...form,
      pasangan_menjodohkan: {
        kolom_kiri: [...(form.pasangan_menjodohkan.kolom_kiri || []), ""],
        kolom_kanan: [...(form.pasangan_menjodohkan.kolom_kanan || []), ""],
        kunci: { ...form.pasangan_menjodohkan.kunci, [form.pasangan_menjodohkan.kolom_kiri.length + 1]: "" }
      }
    });
  };
  const removePasanganJodoh = (index) => {
    const newKolomKiri = [...(form.pasangan_menjodohkan.kolom_kiri || [])];
    const newKolomKanan = [...(form.pasangan_menjodohkan.kolom_kanan || [])];
    const newKunci = { ...form.pasangan_menjodohkan.kunci };
    newKolomKiri.splice(index, 1); newKolomKanan.splice(index, 1); delete newKunci[index + 1];
    const reindexedKunci = {};
    Object.keys(newKunci).forEach((key, idx) => { reindexedKunci[idx + 1] = newKunci[key]; });
    setForm({ ...form, pasangan_menjodohkan: { kolom_kiri: newKolomKiri, kolom_kanan: newKolomKanan, kunci: reindexedKunci } });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const targetSoal = instrumen?.jumlah_soal || 0;
    const sudahAda = soal.length;
   if (!editingSoal && sudahAda >= targetSoal) {
  toast.error(`Target tercapai. Anda sudah membuat ${targetSoal} dari ${targetSoal} soal.`)
  return
}

if (!editingSoal && (sudahAda + 1) > targetSoal) {
  toast.error(`Tidak bisa menambah soal. Target hanya ${targetSoal} soal.`)
  return
}

if (form.tipe_soal === "ganda_kompleks" && form.jawaban_benar_json.length === 0) {
  toast.error("Pilih minimal satu jawaban benar untuk soal pilihan ganda kompleks.")
  return
}

if (form.tipe_soal === "benar_salah" && (!form.pernyataan_checklist || form.pernyataan_checklist.length === 0)) {
  toast.error("Minimal satu pernyataan untuk soal benar/salah.")
  return
}

if (form.tipe_soal === "menjodohkan" && (!form.pasangan_menjodohkan.kolom_kiri || form.pasangan_menjodohkan.kolom_kiri.length === 0)) {
  toast.error("Minimal satu pasangan untuk soal menjodohkan.")
  return
}
    try {
      const formData = new FormData();
      formData.append("instrumen_id", instrumenId);
      formData.append("pertanyaan", buildStyledHtml(form.pertanyaan, {
        bold: form.pertanyaanBold,
        fontSize: form.pertanyaanFontSize,
        align: form.pertanyaanAlign
      }));
      formData.append("tipe_soal", form.tipe_soal);
      formData.append("kategori_instrumen", form.kategori_instrumen);
      formData.append("bobot", form.bobot);
      formData.append("pilihan_a", form.pilihan_a);
      formData.append("pilihan_b", form.pilihan_b);
      formData.append("pilihan_c", form.pilihan_c);
      formData.append("pilihan_d", form.pilihan_d);
      formData.append("pilihan_e", form.tipe_soal === "sebab_akibat" ? "" : form.pilihan_e);
      formData.append("jawaban_benar", form.jawaban_benar);
      formData.append("tabel_data", buildTabelDataWithLayoutMetadata());
      if (gambarFile) formData.append("gambar_soal", gambarFile);
      if (removeGambarSoal) formData.append("remove_gambar_soal", "true");
      if (form.tipe_soal === "ganda_kompleks") formData.append("jawaban_benar_json", JSON.stringify(form.jawaban_benar_json));
      if (form.tipe_soal === "benar_salah") {
        const jawabanBenar = form.pernyataan_checklist.map(p => p.isBenar || false);
        formData.append("jawaban_benar_json", JSON.stringify(jawabanBenar));
        formData.append("pernyataan_checklist", JSON.stringify(form.pernyataan_checklist.map(p => p.teks)));
      }
      if (form.tipe_soal === "menjodohkan") {
        formData.append("pasangan_menjodohkan", JSON.stringify({ kolom_kiri: form.pasangan_menjodohkan.kolom_kiri, kolom_kanan: form.pasangan_menjodohkan.kolom_kanan, kunci: form.pasangan_menjodohkan.kunci }));
      }
      if (editingSoal) {
        await api.put(`/soal/${editingSoal.id}`, formData, { headers: { "Content-Type": "multipart/form-data" } });
        toast.success("Soal berhasil diupdate")
        setEditingSoal(null);
      } else {
        await api.post(`/soal`, formData, { headers: { "Content-Type": "multipart/form-data" } });
        toast.success("Soal berhasil ditambahkan")
      }
      resetForm(); fetchData();
    } catch (err) { console.error(err); toast.error(err.response?.data?.message || "Gagal menyimpan soal") }
  };

  const resetForm = () => {
    setForm({
      pertanyaan: "",
      pertanyaanBold: false,
      pertanyaanFontSize: '18px',
      pertanyaanAlign: 'left',
      pilihan_a: "", pilihan_b: "", pilihan_c: "", pilihan_d: "", pilihan_e: "",
      jawaban_benar: "A", jawaban_benar_json: [],
      tipe_soal: "pilihan_ganda", kategori_instrumen: "HOTS", bobot: 1,
      tabel_data: "", supporting_tables: [], pernyataan_checklist: [],
      gambar_caption: "",
      stimulus_tambahan: "",
      stimulusBold: false,
      stimulusFontSize: '16px',
      stimulusAlign: 'left',
      layout_blocks: defaultLayoutBlocks,
      pasangan_menjodohkan: { kolom_kiri: [], kolom_kanan: [], kunci: {} }
    });
    setGambarFile(null); setPreviewGambar(null); setRemoveGambarSoal(false); setEditingSoal(null);
  };

  const handleEdit = (soalItem) => {
    setEditingSoal(soalItem);
    let jawabanBenarJson = [];
    if (soalItem.jawaban_benar_json) { try { jawabanBenarJson = typeof soalItem.jawaban_benar_json === 'string' ? JSON.parse(soalItem.jawaban_benar_json) : soalItem.jawaban_benar_json; } catch(e) { jawabanBenarJson = []; } }
    let pernyataanChecklist = [];
    if (soalItem.pernyataan_checklist) { try { const pernyataan = typeof soalItem.pernyataan_checklist === 'string' ? JSON.parse(soalItem.pernyataan_checklist) : soalItem.pernyataan_checklist; pernyataanChecklist = pernyataan.map((teks, idx) => ({ teks, isBenar: jawabanBenarJson[idx] || false })); } catch(e) {} }
    let pasanganJodoh = { kolom_kiri: [], kolom_kanan: [], kunci: {} };
    if (soalItem.pasangan_menjodohkan) { try { pasanganJodoh = typeof soalItem.pasangan_menjodohkan === 'string' ? JSON.parse(soalItem.pasangan_menjodohkan) : soalItem.pasangan_menjodohkan; } catch(e) {} }
    const layoutMetadata = getLayoutMetadataFromTabelData(soalItem.tabel_data);
    const stimulusControl = parseStyledTextControl(layoutMetadata?.stimulus_tambahan || "", {
      fontSize: '16px',
      align: 'left'
    });
    const supportingTables = parseSupportingTablesFromTabelData(soalItem.tabel_data || []);
    const imageMetadata = Array.isArray(layoutMetadata?.gambar) ? layoutMetadata.gambar[0] : null;
    const initialLayoutBlocks = normalizeManualLayoutBlocks(layoutMetadata?.layout_blocks || defaultLayoutBlocks);
    const ensureInitialBlock = (blocks, type) => {
      const definition = getLayoutBlockDefinition(type);
      if (!definition || blocks.some(block => block.type === type)) return blocks;
      return [...blocks, { type: definition.type, id: definition.id }];
    };
    const layoutBlocksWithContent = [
      [Boolean(stimulusControl.text.trim()), 'stimulus'],
      [Boolean(soalItem.gambar_soal), 'image'],
      [supportingTables.length > 0, 'table']
    ].reduce((blocks, [shouldInclude, type]) => (
      shouldInclude ? ensureInitialBlock(blocks, type) : blocks
    ), initialLayoutBlocks);

    setForm({
      pertanyaan: parsePlainTextValue(soalItem.pertanyaan || ""),
      pertanyaanBold: false,
      pertanyaanFontSize: '18px',
      pertanyaanAlign: 'left',
      pilihan_a: soalItem.pilihan_a || "",
      pilihan_b: soalItem.pilihan_b || "",
      pilihan_c: soalItem.pilihan_c || "",
      pilihan_d: soalItem.pilihan_d || "",
      pilihan_e: soalItem.pilihan_e || "",
      jawaban_benar: soalItem.jawaban_benar || "A",
      jawaban_benar_json: jawabanBenarJson,
      tipe_soal: soalItem.tipe_soal || "pilihan_ganda",
      kategori_instrumen: soalItem.kategori_instrumen || "HOTS",
      bobot: soalItem.bobot || 1,
      tabel_data: stringifyTabelData(soalItem.tabel_data || ""),
      supporting_tables: supportingTables,
      pernyataan_checklist: pernyataanChecklist,
      gambar_caption: parsePlainTextValue(imageMetadata?.caption || imageMetadata?.alt || ""),
      stimulus_tambahan: stimulusControl.text,
      stimulusBold: stimulusControl.bold,
      stimulusFontSize: stimulusControl.fontSize,
      stimulusAlign: stimulusControl.align,
      layout_blocks: layoutBlocksWithContent,
      pasangan_menjodohkan: pasanganJodoh
    });
    if (soalItem.gambar_soal) setPreviewGambar(`${process.env.REACT_APP_API_URL}/uploads/soal/${soalItem.gambar_soal}`);
    else setPreviewGambar(null);
    setGambarFile(null);
    setRemoveGambarSoal(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => { resetForm(); };

  const handleDelete = async (id) => {
  const ok = await confirmToast(
    'Soal yang dihapus tidak dapat dikembalikan. Lanjutkan?',
    {
      title: 'Hapus soal?',
      confirmText: 'Ya, hapus',
      cancelText: 'Batal',
      danger: true
    }
  )

  if (!ok) return

  try {
    await api.delete(`/soal/${id}`)
    fetchData()
    toast.success('Soal berhasil dihapus')
  } catch (err) {
    console.error(err)
    toast.error(err.response?.data?.message || 'Gagal menghapus soal')
  }
}
  const confirmToast = (message, options = {}) => {
  const {
    title = 'Konfirmasi',
    confirmText = 'Ya',
    cancelText = 'Batal',
    danger = false
  } = options

  return new Promise((resolve) => {
    toast.custom((t) => (
      <div
        style={{
          width: 390,
          background: '#ffffff',
          color: '#111827',
          borderRadius: 16,
          boxShadow: '0 20px 45px rgba(15, 23, 42, 0.22)',
          border: '1px solid #E5E7EB',
          padding: 16
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
          {title}
        </div>

        <div
          style={{
            fontSize: 13,
            color: '#4B5563',
            lineHeight: 1.6,
            marginBottom: 14,
            whiteSpace: 'pre-line'
          }}
        >
          {message}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              toast.dismiss(t.id)
              resolve(false)
            }}
            style={{
              border: '1px solid #D1D5DB',
              background: '#fff',
              color: '#374151',
              borderRadius: 10,
              padding: '8px 12px',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={() => {
              toast.dismiss(t.id)
              resolve(true)
            }}
            style={{
              border: 'none',
              background: danger ? '#DC2626' : '#2563EB',
              color: '#fff',
              borderRadius: 10,
              padding: '8px 12px',
              cursor: 'pointer',
              fontWeight: 700
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    ), {
      duration: Infinity,
      position: 'top-center'
    })
  })
}

  const handlePublish = async () => {
  const targetSoal = instrumen?.jumlah_soal || 0
  const sudahAda = soal.length

  if (sudahAda < targetSoal) {
    toast.error(`Belum bisa mengaktifkan. Anda baru membuat ${sudahAda} dari ${targetSoal} soal.`)
    return
  }

  const ok = await confirmToast(
    `Target: ${targetSoal} soal
Sudah dibuat: ${sudahAda} soal

Setelah diaktifkan:
Tidak bisa menambah/mengedit/menghapus soal
Siswa bisa mulai mengerjakan

Yakin ingin mengaktifkan instrumen ini?`,
    {
      title: 'Peringatan akhir',
      confirmText: 'Aktifkan',
      cancelText: 'Batal'
    }
  )

  if (!ok) return

  setPublishing(true)

  try {
    const fd = new FormData()
    fd.append('status', 'aktif')
    fd.append('judul', instrumen.judul)
    fd.append('jenis', instrumen.jenis)
    fd.append('mata_pelajaran', instrumen.mata_pelajaran)
    fd.append('kelas', instrumen.kelas)
    fd.append('jumlah_soal', instrumen.jumlah_soal)

    await api.put(`/instrumen/${instrumenId}`, fd)

    fetchData()
    toast.success('Instrumen berhasil diaktifkan')
  } catch (err) {
    console.error(err)
    toast.error(err.response?.data?.message || 'Gagal mengaktifkan instrumen')
  } finally {
    setPublishing(false)
  }
}
  const handleLihatSiswa = async (siswaId, siswaNama) => {
    try {
      const res = await api.get(`/soal/hasil/${instrumenId}?siswa_id=${siswaId}`);
      setSelectedSiswa({ nama: siswaNama, data: res.data.data });
      setShowSiswaModal(true);
    } catch (err) { console.error(err); toast.error(err); toast.error('gagal mengirim data hasil siswa') }
  };

  const tipeBadge = (tipe) => {
    const map = { pilihan_ganda: "badge badge-blue", sebab_akibat: "badge badge-amber", ganda_kompleks: "badge badge-purple", benar_salah: "badge badge-teal", menjodohkan: "badge badge-coral" };
    return map[tipe] || "badge badge-gray";
  };
  const tipeLabel = (tipe) => {
    const map = { pilihan_ganda: "Pilihan Ganda", sebab_akibat: "Sebab Akibat", ganda_kompleks: "Ganda Kompleks", benar_salah: "Benar/Salah", menjodohkan: "Menjodohkan" };
    return map[tipe] || tipe;
  };
  const kategoriBadge = (kat) => {
    const map = { HOTS: "badge badge-purple", Literasi: "badge badge-teal", Numerasi: "badge badge-coral" };
    return map[kat] || "badge badge-gray";
  };

  const target = instrumen?.jumlah_soal || 0;
  const sudahDiisi = soal.length;
  const persen = target > 0 ? Math.min(Math.round((sudahDiisi / target) * 100), 100) : 0;
  const sudahLengkap = sudahDiisi >= target && target > 0;
  const sudahAktif = instrumen?.status === "aktif";
  const bisaTambah = !sudahAktif && !sudahLengkap;

  // Style helpers
  const card = {
    background: '#fff',
    border: '0.5px solid rgba(0,0,0,0.09)',
    borderRadius: 16,
    padding: '20px 22px',
    marginBottom: 16,
  }
  const sectionTitle = {
    fontSize: 14, fontWeight: 700, color: '#0C1A2E', marginBottom: 16,
    display: 'flex', alignItems: 'center', gap: 8,
  }
  const iconBox = (bg, color) => ({
    width: 28, height: 28, borderRadius: 8, background: bg,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color, fontSize: 13, fontWeight: 700, flexShrink: 0,
  })
  const pill = (bg, color) => ({
    display: 'inline-flex', alignItems: 'center',
    background: bg, color, borderRadius: 20,
    fontSize: 11, fontWeight: 600, padding: '3px 10px',
  })
  const previewBankText = (value = '', max = 110) => {
    const text = stripHtml(String(value || '')).replace(/\s+/g, ' ').trim();
    if (!text) return '-';
    return text.length > max ? `${text.slice(0, max).trim()}...` : text;
  };
  const getPlainQuestionPreview = (value = '', max = 80) => {
    const htmlWithSpacing = String(value || '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(div|p|li|tr|td|th|h[1-6])>/gi, ' ');

    const text = stripHtml(htmlWithSpacing)
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text) return 'Pertanyaan belum tersedia';
    return text.length > max ? `${text.slice(0, max).trim()}...` : text;
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', paddingTop: 80, flexDirection: 'column', gap: 12 }}>
      <div className="spinner spinner-dark" style={{ width: 32, height: 32 }} />
      <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>Memuat data soal...</span>
    </div>
  );

  return (
    <div>

      {/* Header card */}
      <div style={{ ...card, padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>

          {/* Back button */}
          <button
            className="btn btn-sm"
            onClick={() => navigate(-1)}
            style={{ borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.1)', marginTop: 2, flexShrink: 0 }}
            title="Kembali"
          >Kembali</button>

          {/* Judul + meta */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0C1A2E', marginBottom: 5 }}>
              {instrumen?.judul || 'Kelola Soal'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--gray-600)' }}>{instrumen?.mata_pelajaran}</span>
              <span style={{ color: 'var(--gray-200)', fontSize: 12 }}> - </span>
              <span style={{ fontSize: 12, color: 'var(--gray-600)' }}>Kelas {instrumen?.kelas}</span>
              <span style={{ color: 'var(--gray-200)', fontSize: 12 }}> - </span>
              <span className={`badge ${instrumen?.status === 'aktif' ? 'badge-teal' : 'badge-amber'}`}>
                {instrumen?.status}
              </span>
              <span className="badge badge-blue">{instrumen?.jenis}</span>
            </div>
          </div>

          {/* Counter */}
          <div style={{
            textAlign: 'center', background: sudahLengkap ? '#E1F5EE' : '#EBF3FC',
            borderRadius: 12, padding: '10px 18px', flexShrink: 0,
            border: `0.5px solid ${sudahLengkap ? 'rgba(15,110,86,0.2)' : 'rgba(24,95,165,0.15)'}`,
          }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: sudahLengkap ? '#0F6E56' : '#185FA5', lineHeight: 1 }}>
              {sudahDiisi}<span style={{ fontSize: 15, fontWeight: 500, color: 'var(--gray-400)' }}>/{target}</span>
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: sudahLengkap ? '#0F6E56' : '#185FA5', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {sudahLengkap ? 'Lengkap' : 'Soal dibuat'}
            </div>
          </div>
        </div>

        {/* Progress */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
            <span style={{ fontSize: 12, color: 'var(--gray-600)', fontWeight: 500 }}>
              {sudahAktif
                ? 'Instrumen sudah aktif - soal terkunci'
                : sudahLengkap ? 'Semua soal sudah lengkap, siap diaktifkan!'
                  : `Masih perlu ${target - sudahDiisi} soal lagi`}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: sudahLengkap ? '#0F6E56' : '#185FA5' }}>{persen}%</span>
          </div>
          <div style={{ height: 8, background: '#F1EFE8', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 6,
              background: sudahLengkap ? '#0F6E56' : '#185FA5',
              width: `${persen}%`,
              transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
            }} />
          </div>
        </div>

        {/* Aktifkan button */}
        {sudahLengkap && !sudahAktif && (
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="btn"
              onClick={handlePublish}
              disabled={publishing}
              style={{
                background: '#0F6E56', color: '#fff', border: 'none',
                borderRadius: 10, padding: '9px 20px', fontWeight: 600,
                fontSize: 13, gap: 7,
                opacity: publishing ? 0.7 : 1,
              }}
            >
              {publishing
                ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Mengaktifkan...</>
                : 'Aktifkan Instrumen'}
            </button>
          </div>
        )}
      </div>

      {/* Form tambah / edit soal */}
      {!sudahAktif && bisaTambah && (
        <div style={{ ...card, border: editingSoal ? '1.5px solid #185FA5' : '0.5px solid rgba(0,0,0,0.09)' }}>

          {/* Form header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={sectionTitle}>
              <div style={iconBox(editingSoal ? '#EBF3FC' : '#EEEDFE', editingSoal ? '#185FA5' : '#534AB7')}>
                {editingSoal ? 'E' : '+'}
              </div>
              {editingSoal ? `Edit Soal` : `Tambah Soal ${sudahDiisi + 1} dari ${target}`}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {!editingSoal && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={openBankSoalModal}
                  style={{ borderRadius: 8, fontSize: 12, color: '#185FA5', background: '#EBF3FC', border: 'none' }}
                >
                  Ambil dari Bank Soal
                </button>
              )}
              {editingSoal && (
                <button className="btn btn-sm" onClick={handleCancelEdit}
                  style={{ color: 'var(--gray-600)', fontSize: 12 }}>Batal edit
                </button>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit}>

            {/* Pertanyaan */}
            <div className="form-group">
              <label className="form-label">Pertanyaan <span style={{ color: '#A32D2D' }}>*</span></label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 10 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tebal</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" name="pertanyaanBold" checked={form.pertanyaanBold} onChange={handleChange} />
                    <span style={{ fontSize: 13 }}>Bold</span>
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Ukuran font</label>
                  <select name="pertanyaanFontSize" className="select" value={form.pertanyaanFontSize} onChange={handleChange}>
                    <option value="14px">14px</option>
                    <option value="16px">16px</option>
                    <option value="18px">18px</option>
                    <option value="20px">20px</option>
                    <option value="22px">22px</option>
                    <option value="24px">24px</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Rata teks</label>
                  <select name="pertanyaanAlign" className="select" value={form.pertanyaanAlign} onChange={handleChange}>
                    <option value="left">Kiri</option>
                    <option value="center">Tengah</option>
                    <option value="right">Kanan</option>
                    <option value="justify">Rata kanan-kiri</option>
                  </select>
                </div>
              </div>
              <textarea
                name="pertanyaan" className="textarea" rows={4}
                value={form.pertanyaan} onChange={handleChange} required
                placeholder="Tulis pertanyaan soal di sini..."
              />
            </div>

            {/* Tipe + Kategori + Bobot - di atas, biar konteks jelas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 4 }}>
              <div className="form-group">
                <label className="form-label">Tipe Soal</label>
                <select name="tipe_soal" className="select" value={form.tipe_soal} onChange={handleChange}>
                  <option value="pilihan_ganda">Pilihan Ganda (A-D)</option>
                  <option value="sebab_akibat">Sebab Akibat (A-D)</option>
                  <option value="ganda_kompleks">Pilihan Ganda Kompleks</option>
                  <option value="benar_salah">Benar/Salah (Checklist)</option>
                  <option value="menjodohkan">Menjodohkan</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Kategori</label>
                <select name="kategori_instrumen" className="select" value={form.kategori_instrumen} onChange={handleChange}>
                  <option value="HOTS">HOTS</option>
                  <option value="Literasi">Literasi</option>
                  <option value="Numerasi">Numerasi</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Bobot Soal</label>
                <input type="number" name="bobot" className="input" min="1" max="10" value={form.bobot} onChange={handleChange} />
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: '0.5px', background: 'rgba(0,0,0,0.07)', margin: '4px 0 18px' }} />

            {/* Upload Gambar */}
            {normalizeManualLayoutBlocks(form.layout_blocks).some(block => block.type === 'image') && (
            <div className="form-group">
              <label className="form-label">Gambar Soal <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(opsional)</span></label>
              <div style={{
                border: '1.5px dashed rgba(0,0,0,0.15)', borderRadius: 10,
                padding: '14px 16px', background: '#FAFAFA',
                display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
              }}>
                <input type="file" accept="image/*" onChange={handleGambarChange}
                  style={{ fontSize: 13, color: 'var(--gray-600)', flex: 1, minWidth: 180 }} />
                {previewGambar && (
                  <figure style={{ margin: 0, width: 120, maxWidth: '100%' }}>
                    {form.gambar_caption && (
                      <figcaption style={{ marginBottom: 6, fontSize: 12, color: '#64748B', textAlign: 'left' }}>
                        {form.gambar_caption}
                      </figcaption>
                    )}
                    <img
                      src={previewGambar}
                      alt="Preview"
                      className="question-image-clickable"
                      title="Klik untuk memperbesar gambar"
                      onClick={openPreviewImageZoom}
                      style={{ maxWidth: 120, maxHeight: 90, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.1)' }}
                    />
                  </figure>
                )}
              </div>
              <div style={{ marginTop: 10 }}>
                <label className="form-label">Caption Gambar</label>
                <input
                  type="text"
                  name="gambar_caption"
                  className="input"
                  value={form.gambar_caption}
                  onChange={handleChange}
                  placeholder="Caption gambar (opsional)"
                />
              </div>
            </div>
            )}

            {/* Tabel Pendukung */}
            {normalizeManualLayoutBlocks(form.layout_blocks).some(block => block.type === 'table') && (
            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <label className="form-label">Tabel Pendukung</label>
                <button type="button" className="btn btn-sm" style={{ borderRadius: 8, fontSize: 12 }} onClick={addSupportTable}>+ Tambah Tabel</button>
              </div>
              {(form.supporting_tables || []).length === 0 && (
                <div style={{ padding: 14, border: '1px solid rgba(148,163,184,0.4)', borderRadius: 10, background: '#F8FAFC', color: 'var(--gray-600)', fontSize: 13 }}>
                  Belum ada tabel pendukung. Tambahkan tabel untuk membuat dukungan bahan soal dalam format Word.
                </div>
              )}
              {(form.supporting_tables || []).map((table, tableIndex) => (
                <div key={tableIndex} style={{ border: '1px solid rgba(148,163,184,0.3)', borderRadius: 12, padding: 14, marginBottom: 14, background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 600 }}>Tabel {tableIndex + 1}</div>
                    <button type="button" className="btn btn-danger btn-sm" style={{ borderRadius: 8, fontSize: 12 }} onClick={() => removeSupportTable(tableIndex)}>Hapus Tabel</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginTop: 12 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Caption</label>
                      <input
                        type="text"
                        className="input"
                        value={table.caption}
                        onChange={(e) => updateSupportTable(tableIndex, { ...table, caption: e.target.value })}
                        placeholder="Caption tabel (opsional)"
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginTop: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={table.captionBold}
                            onChange={(e) => updateSupportTableCaptionStyle(tableIndex, { captionBold: e.target.checked })}
                          />
                          <span style={{ fontSize: 13 }}>Bold</span>
                        </div>
                        <select
                          className="select"
                          value={table.captionFontSize}
                          onChange={(e) => updateSupportTableCaptionStyle(tableIndex, { captionFontSize: e.target.value })}
                        >
                          <option value="14px">14px</option>
                          <option value="16px">16px</option>
                          <option value="18px">18px</option>
                          <option value="20px">20px</option>
                          <option value="22px">22px</option>
                          <option value="24px">24px</option>
                        </select>
                        <select
                          className="select"
                          value={table.captionAlign}
                          onChange={(e) => updateSupportTableCaptionStyle(tableIndex, { captionAlign: e.target.value })}
                        >
                          <option value="left">Kiri</option>
                          <option value="center">Tengah</option>
                          <option value="right">Kanan</option>
                          <option value="justify">Rata kanan-kiri</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Lebar Tabel</label>
                      <select className="select" value={table.width} onChange={(e) => updateSupportTable(tableIndex, { ...table, width: e.target.value })}>
                        <option value="50%">50%</option>
                        <option value="75%">75%</option>
                        <option value="100%">100%</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Rata Tabel</label>
                      <select className="select" value={table.align} onChange={(e) => updateSupportTable(tableIndex, { ...table, align: e.target.value })}>
                        <option value="left">Kiri</option>
                        <option value="center">Tengah</option>
                        <option value="right">Kanan</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Ukuran Font</label>
                      <select className="select" value={table.fontSize} onChange={(e) => updateSupportTable(tableIndex, { ...table, fontSize: e.target.value })}>
                        <option value="12px">12px</option>
                        <option value="14px">14px</option>
                        <option value="16px">16px</option>
                        <option value="18px">18px</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-sm" style={{ borderRadius: 8, fontSize: 12 }} onClick={() => addTableRow(tableIndex)}>+ Baris</button>
                    <button type="button" className="btn btn-sm" style={{ borderRadius: 8, fontSize: 12 }} onClick={() => addTableColumn(tableIndex)}>+ Kolom</button>
                  </div>

                  <div style={{ overflowX: 'auto', marginTop: 12 }}>
                    <table style={{ width: '100%', minWidth: 320, borderCollapse: 'collapse' }}>
                      <tbody>
                        {table.rows.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {row.map((cell, cellIndex) => (
                              <td key={cellIndex} style={{ border: '1px solid rgba(148,163,184,0.4)', padding: 8, background: '#FAFAFA' }}>
                                <input
                                  type="text"
                                  className="input"
                                  style={{ width: '100%', background: '#fff' }}
                                  value={cell}
                                  onChange={(e) => updateTableCell(tableIndex, rowIndex, cellIndex, e.target.value)}
                                  onPaste={(e) => pasteIntoSupportTable(e, tableIndex, rowIndex, cellIndex)}
                                />
                              </td>
                            ))}
                            <td style={{ border: '1px solid rgba(148,163,184,0.4)', padding: 8, background: '#F8FAFC' }}>
                              <button type="button" className="btn btn-danger btn-sm" style={{ borderRadius: 8, fontSize: 12 }} onClick={() => removeTableRow(tableIndex, rowIndex)}>
                                Hapus baris
                              </button>
                            </td>
                          </tr>
                        ))}
                        <tr>
                          {table.rows[0].map((_, cellIndex) => (
                            <td key={cellIndex} style={{ border: '1px solid transparent', padding: 4 }}>
                              <button type="button" className="btn btn-danger btn-sm" style={{ borderRadius: 8, fontSize: 12 }} onClick={() => removeTableColumn(tableIndex, cellIndex)}>
                                Hapus kolom
                              </button>
                            </td>
                          ))}
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
            )}

            {/* Stimulus Tambahan */}
            {normalizeManualLayoutBlocks(form.layout_blocks).some(block => block.type === 'stimulus') && (
            <div className="form-group">
              <label className="form-label">
                Stimulus Tambahan <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(opsional)</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 10 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tebal</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" name="stimulusBold" checked={form.stimulusBold} onChange={handleChange} />
                    <span style={{ fontSize: 13 }}>Bold</span>
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Ukuran font</label>
                  <select name="stimulusFontSize" className="select" value={form.stimulusFontSize} onChange={handleChange}>
                    <option value="14px">14px</option>
                    <option value="16px">16px</option>
                    <option value="18px">18px</option>
                    <option value="20px">20px</option>
                    <option value="22px">22px</option>
                    <option value="24px">24px</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Rata teks</label>
                  <select name="stimulusAlign" className="select" value={form.stimulusAlign} onChange={handleChange}>
                    <option value="left">Kiri</option>
                    <option value="center">Tengah</option>
                    <option value="right">Kanan</option>
                    <option value="justify">Rata kanan-kiri</option>
                  </select>
                </div>
              </div>
              <textarea name="stimulus_tambahan" className="textarea" rows={4}
                placeholder="Tambahkan teks stimulus atau bacaan pendukung untuk soal ini"
                value={form.stimulus_tambahan} onChange={handleChange}
              />
              <p style={{ marginTop: 6, fontSize: 12, color: 'var(--gray-500)' }}>
                Stimulus tambahan disimpan dalam metadata layout yang sama dengan Preview Word.
              </p>
            </div>
            )}

            <div className="form-group">
              <label className="form-label">Urutan Tampilan Soal</label>
              <div
                style={{
                  display: 'grid',
                  gap: 8,
                  padding: 12,
                  border: '1px solid #DBEAFE',
                  borderRadius: 10,
                  background: '#EFF6FF'
                }}
              >
                {normalizeManualLayoutBlocks(form.layout_blocks).map((block, blockIndex, blocks) => (
                  <div
                    key={block.type}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '28px 1fr auto auto auto',
                      gap: 8,
                      alignItems: 'center',
                      padding: 8,
                      borderRadius: 8,
                      border: '1px solid #BFDBFE',
                      background: '#FFFFFF'
                    }}
                  >
                    <strong style={{ color: '#1D4ED8', textAlign: 'center' }}>{blockIndex + 1}</strong>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {layoutBlockLabelMap[block.type] || block.type}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => moveManualLayoutBlock(block.type, -1)}
                      disabled={blockIndex === 0}
                      title="Naikkan blok"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <ArrowUp size={14} /> Naik
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => moveManualLayoutBlock(block.type, 1)}
                      disabled={blockIndex === blocks.length - 1}
                      title="Turunkan blok"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <ArrowDown size={14} /> Turun
                    </button>
                    {block.type === 'question' ? (
                      <span style={{ fontSize: 12, color: '#64748B', textAlign: 'center' }}>Wajib</span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => removeManualLayoutBlock(block.type)}
                        title="Hapus blok"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                ))}
                {layoutBlockDefinitions.some(definition => (
                  definition.type !== 'question' &&
                  !normalizeManualLayoutBlocks(form.layout_blocks).some(block => block.type === definition.type)
                )) && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {layoutBlockDefinitions
                      .filter(definition => (
                        definition.type !== 'question' &&
                        !normalizeManualLayoutBlocks(form.layout_blocks).some(block => block.type === definition.type)
                      ))
                      .map(definition => (
                        <button
                          key={definition.type}
                          type="button"
                          className="btn btn-sm"
                          onClick={() => addManualLayoutBlock(definition.type)}
                          style={{ borderRadius: 8, fontSize: 12 }}
                        >
                          + Tambah {definition.label}
                        </button>
                      ))}
                  </div>
                )}
                <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>
                  Atur blok yang dipakai pada soal ini. Jawaban tetap tampil paling bawah.
                </p>
              </div>
            </div>

            {/* Pilihan jawaban - untuk PG dan Ganda Kompleks */}
            {['pilihan_ganda', 'ganda_kompleks'].includes(form.tipe_soal) && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Pilihan Jawaban
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 4 }}>
                  {['a', 'b', 'c', 'd'].map(opt => (
                    <div key={opt} className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          width: 20, height: 20, borderRadius: 6,
                          background: 'var(--blue-50)', color: 'var(--blue-800)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700,
                        }}>{opt.toUpperCase()}</span>
                        Pilihan {opt.toUpperCase()}
                      </label>
                      <input
                        name={`pilihan_${opt}`}
                        className="input"
                        value={form[`pilihan_${opt}`]}
                        onChange={handleChange}
                        onPaste={(e) => pasteIntoChoices(e, opt)}
                        placeholder={`Isi pilihan ${opt.toUpperCase()}...`}
                      />
                    </div>
                  ))}
                </div>
                {form.tipe_soal === 'ganda_kompleks' && (
                  <div className="form-group" style={{ marginTop: 10 }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--amber-50)', color: 'var(--amber-700)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>E</span>
                      Pilihan E <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(opsional)</span>
                    </label>
                    <input
                      name="pilihan_e"
                      className="input"
                      value={form.pilihan_e}
                      onChange={handleChange}
                      onPaste={(e) => pasteIntoChoices(e, 'E')}
                      placeholder="Isi pilihan E..."
                    />
                  </div>
                )}
              </div>
            )}

            {/* Benar/Salah */}
            {form.tipe_soal === 'benar_salah' && (
              <div className="form-group">
                <label className="form-label">Daftar Pernyataan</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  {(form.pernyataan_checklist || []).map((item, idx) => (
                    <div key={idx} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: '#FAFAFA', border: '0.5px solid rgba(0,0,0,0.09)',
                      borderRadius: 10, padding: '8px 12px',
                    }}>
                      <span style={{ ...pill('#EBF3FC', '#185FA5'), minWidth: 24, justifyContent: 'center' }}>{idx + 1}</span>
                      <input type="text" className="input" style={{ flex: 1, background: '#fff' }}
                        placeholder={`Pernyataan ${idx + 1}`}
                        value={item.teks || ''}
                        onChange={(e) => {
                          const newList = [...form.pernyataan_checklist];
                          newList[idx] = { ...newList[idx], teks: e.target.value };
                          setForm({ ...form, pernyataan_checklist: newList });
                        }}
                      />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                        <input type="checkbox" checked={item.isBenar || false}
                          onChange={(e) => {
                            const newList = [...form.pernyataan_checklist];
                            newList[idx] = { ...newList[idx], isBenar: e.target.checked };
                            setForm({ ...form, pernyataan_checklist: newList });
                          }}
                        />
                        Benar
                      </label>
                      <button type="button" className="btn btn-danger btn-sm" style={{ borderRadius: 8, padding: '4px 10px' }}
                        onClick={() => removePernyataanChecklist(idx)}>Hapus</button>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn btn-sm"
                  style={{ borderRadius: 8, fontSize: 12 }}
                  onClick={addPernyataanChecklist}>+ Tambah Pernyataan</button>
              </div>
            )}

            {/* Menjodohkan */}
            {form.tipe_soal === 'menjodohkan' && (
              <div className="form-group">
                <label className="form-label">Pasangan Menjodohkan</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  {(form.pasangan_menjodohkan.kolom_kiri || []).map((_, idx) => (
                    <div key={idx} style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr 0.6fr auto',
                      gap: 8, alignItems: 'center',
                      background: '#FAFAFA', border: '0.5px solid rgba(0,0,0,0.09)',
                      borderRadius: 10, padding: '10px 12px',
                    }}>
                      <input type="text" className="input" style={{ background: '#fff' }}
                        placeholder={`Pernyataan ${idx + 1}`}
                        value={form.pasangan_menjodohkan.kolom_kiri[idx] || ''}
                        onChange={(e) => handleKolomKiriChange(idx, e.target.value)}
                      />
                      <input type="text" className="input" style={{ background: '#fff' }}
                        placeholder={`Jawaban ${idx + 1}`}
                        value={form.pasangan_menjodohkan.kolom_kanan[idx] || ''}
                        onChange={(e) => handleKolomKananChange(idx, e.target.value)}
                      />
                      <select className="select" style={{ background: '#fff' }}
                        value={form.pasangan_menjodohkan.kunci?.[idx + 1] || ''}
                        onChange={(e) => handleKunciJodohChange(idx, e.target.value)}
                      >
                        <option value="">Kunci</option>
                        {form.pasangan_menjodohkan.kolom_kanan.map((_, optIdx) => (
                          <option key={optIdx} value={String.fromCharCode(97 + optIdx)}>
                            {String.fromCharCode(97 + optIdx)}. {form.pasangan_menjodohkan.kolom_kanan[optIdx]?.substring(0, 20)}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="btn btn-danger btn-sm" style={{ borderRadius: 8, padding: '4px 10px', whiteSpace: 'nowrap' }}
                        onClick={() => removePasanganJodoh(idx)}>Hapus</button>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn btn-sm" style={{ borderRadius: 8, fontSize: 12 }}
                  onClick={addPasanganJodoh}>+ Tambah Pasangan</button>
              </div>
            )}

            {/* Jawaban benar - Pilihan Ganda */}
            {form.tipe_soal === 'pilihan_ganda' && (
              <div className="form-group">
                <label className="form-label">Jawaban Benar</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['A', 'B', 'C', 'D'].map(opt => (
                    <label key={opt} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', borderRadius: 10, cursor: 'pointer',
                      background: form.jawaban_benar === opt ? '#EBF3FC' : '#F8F9FA',
                      border: `0.5px solid ${form.jawaban_benar === opt ? '#185FA5' : 'rgba(0,0,0,0.1)'}`,
                      fontWeight: form.jawaban_benar === opt ? 600 : 400,
                      color: form.jawaban_benar === opt ? '#0C447C' : 'var(--gray-600)',
                      fontSize: 13, transition: 'all .15s',
                    }}>
                      <input type="radio" name="jawaban_benar" value={opt}
                        checked={form.jawaban_benar === opt}
                        onChange={handleChange}
                        style={{ accentColor: '#185FA5' }}
                      />
                      Pilihan {opt}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Jawaban benar - Sebab Akibat */}
            {form.tipe_soal === 'sebab_akibat' && (
              <div className="form-group">
                <label className="form-label">Jawaban Benar</label>
                <select name="jawaban_benar" className="select" value={form.jawaban_benar} onChange={handleChange}>
                  <option value="A">A - Pernyataan benar, alasan benar, berhubungan</option>
                  <option value="B">B - Pernyataan benar, alasan benar, tidak berhubungan</option>
                  <option value="C">C - Pernyataan benar, alasan salah</option>
                  <option value="D">D - Pernyataan salah, alasan benar</option>
                </select>
              </div>
            )}

            {/* Jawaban benar - Ganda Kompleks */}
            {form.tipe_soal === 'ganda_kompleks' && (
              <div className="form-group">
                <label className="form-label">Jawaban Benar <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(bisa lebih dari satu)</span></label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['A', 'B', 'C', 'D', ...(form.pilihan_e ? ['E'] : [])].map(opt => {
                    const pilihanTeks = form[`pilihan_${opt.toLowerCase()}`];
                    if (!pilihanTeks) return null;
                    const checked = form.jawaban_benar_json?.includes(opt) || false;
                    return (
                      <label key={opt} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '7px 14px', borderRadius: 10, cursor: 'pointer',
                        background: checked ? '#EBF3FC' : '#F8F9FA',
                        border: `0.5px solid ${checked ? '#185FA5' : 'rgba(0,0,0,0.1)'}`,
                        color: checked ? '#0C447C' : 'var(--gray-600)',
                        fontWeight: checked ? 600 : 400, fontSize: 13, transition: 'all .15s',
                      }}>
                        <input type="checkbox" checked={checked}
                          style={{ accentColor: '#185FA5' }}
                          onChange={(e) => {
                            const current = form.jawaban_benar_json || [];
                            const newValue = e.target.checked ? [...current, opt] : current.filter(v => v !== opt);
                            setForm({ ...form, jawaban_benar_json: newValue });
                          }}
                        />
                        <strong>{opt}.</strong> {pilihanTeks.substring(0, 40)}{pilihanTeks.length > 40 ? '...' : ''}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Aksi form */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '0.5px solid rgba(0,0,0,0.07)' }}>
              {editingSoal && (
                <button type="button" className="btn" onClick={handleCancelEdit}
                  style={{ borderRadius: 10, fontSize: 13 }}>Batal</button>
              )}
              <button type="submit" className="btn btn-primary"
                style={{ borderRadius: 10, fontSize: 13, padding: '9px 20px' }}>
                {editingSoal ? 'Update Soal' : '+ Tambah Soal'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Daftar Soal */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px 14px', borderBottom: '0.5px solid rgba(0,0,0,0.07)',
        }}>
          <div style={sectionTitle}>
            <div style={iconBox('#EEEDFE', '#534AB7')}>List</div>
            Daftar Soal
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={pill('#EBF3FC', '#185FA5')}>{sudahDiisi} soal</span>
            <span style={pill(sudahLengkap ? '#E1F5EE' : '#FAEEDA', sudahLengkap ? '#0F6E56' : '#854F0B')}>
              target {target}
            </span>
          </div>
        </div>

        {soal.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--gray-400)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Belum ada soal</div>
            <div style={{ fontSize: 13 }}>Belum ada soal - tambahkan soal pertama di atas</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#FAFAFA' }}>
                  {['No', 'Pertanyaan', 'Tipe', 'Kategori', 'Bobot', 'Aksi'].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left',
                      fontSize: 10.5, fontWeight: 700, color: 'var(--gray-600)',
                      borderBottom: '0.5px solid rgba(0,0,0,0.08)',
                      textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {soal.map((item, index) => (
                  <tr key={item.id}
                    style={{ transition: 'background .1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', width: 40 }}>
                      <span style={{ ...pill('#EBF3FC', '#185FA5'), minWidth: 24, justifyContent: 'center', fontWeight: 700 }}>
                        {index + 1}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', maxWidth: 320 }}>
                      <div
                        title={getPlainQuestionPreview(item.pertanyaan, 220)}
                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#1a1a1a', fontWeight: 500 }}
                      >
                        {getPlainQuestionPreview(item.pertanyaan)}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', whiteSpace: 'nowrap' }}>
                      <span className={tipeBadge(item.tipe_soal)}>{tipeLabel(item.tipe_soal)}</span>
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', whiteSpace: 'nowrap' }}>
                      <span className={kategoriBadge(item.kategori_instrumen)}>{item.kategori_instrumen}</span>
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', textAlign: 'center' }}>
                      <span style={{ fontWeight: 700, color: '#185FA5' }}>{item.bobot || 1}</span>
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '0.5px solid rgba(0,0,0,0.06)', whiteSpace: 'nowrap' }}>
                      {!sudahAktif ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-sm"
                            style={{ borderRadius: 8, fontSize: 12, color: '#185FA5', background: '#EBF3FC', border: 'none' }}
                            onClick={() => handleEdit(item)}>Edit</button>
                          <button className="btn btn-sm btn-danger"
                            style={{ borderRadius: 8, fontSize: 12 }}
                            onClick={() => handleDelete(item.id)}>Hapus</button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          Terkunci
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showBankSoalModal && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && closeBankSoalModal()}>
          <div className="modal bank-soal-picker-modal">
            <div className="bank-soal-picker-head">
              <div>
                <div className="modal-title">Ambil Soal dari Bank Soal</div>
                <p>Pilih soal dari Bank Soal sekolah ini untuk ditambahkan ke instrumen.</p>
              </div>
              <button type="button" className="btn btn-sm" onClick={closeBankSoalModal} disabled={usingBankSoal}>
                Tutup
              </button>
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 12,
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={bankSoalAllowCrossClass}
                onChange={(event) => handleBankSoalCrossClassChange(event.target.checked)}
                disabled={usingBankSoal}
              />
              <span>Tampilkan soal dari kelas lain</span>
            </label>

            <div className="bank-soal-picker-filters">
              <label>
                Search pertanyaan
                <input
                  className="input"
                  value={bankSoalFilters.search}
                  onChange={(event) => handleBankSoalFilterChange('search', event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && applyBankSoalFilters()}
                  placeholder="Cari pertanyaan atau opsi"
                />
              </label>
              <label>
                Kelas
                <input
                  className="input"
                  value={bankSoalFilters.kelas}
                  onChange={(event) => handleBankSoalFilterChange('kelas', event.target.value)}
                  disabled={!bankSoalAllowCrossClass}
                  placeholder="Contoh: VIII-A"
                />
              </label>
              <label>
                Mata Pelajaran
                <input
                  className="input"
                  value={bankSoalFilters.mata_pelajaran}
                  onChange={(event) => handleBankSoalFilterChange('mata_pelajaran', event.target.value)}
                  disabled
                  placeholder="IPA, Matematika..."
                />
              </label>
              <label>
                Jenis Instrumen
                <select
                  className="select"
                  value={bankSoalFilters.jenis_instrumen}
                  onChange={(event) => handleBankSoalFilterChange('jenis_instrumen', event.target.value)}
                  disabled
                >
                  <option value="">Semua jenis</option>
                  {bankSoalJenisOptions.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>
                Tipe Soal
                <select
                  className="select"
                  value={bankSoalFilters.tipe_soal}
                  onChange={(event) => handleBankSoalFilterChange('tipe_soal', event.target.value)}
                >
                  <option value="">Semua tipe</option>
                  {bankSoalTipeOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label>
                Materi/Topik
                <input
                  className="input"
                  value={bankSoalFilters.materi}
                  onChange={(event) => handleBankSoalFilterChange('materi', event.target.value)}
                  placeholder="Materi atau topik"
                />
              </label>
            </div>

            <div className="bank-soal-picker-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={applyBankSoalFilters}>
                Terapkan Filter
              </button>
              <button type="button" className="btn btn-sm" onClick={resetBankSoalFilters}>
                Reset
              </button>
            </div>

            {bankSoalError && <div className="alert alert-error">{bankSoalError}</div>}

            <div className="bank-soal-picker-body">
              {bankSoalLoading ? (
                <div className="bank-soal-picker-state">
                  <div className="spinner spinner-dark" />
                  <span>Memuat Bank Soal...</span>
                </div>
              ) : bankSoalItems.length === 0 ? (
                <div className="bank-soal-picker-empty">
                  <strong>Bank Soal masih kosong.</strong>
                  <span>Soal akan otomatis masuk setelah instrumen diaktifkan.</span>
                </div>
              ) : (
                <>
                  <div className="bank-soal-picker-table-wrap">
                    <table className="bank-soal-picker-table">
                      <thead>
                        <tr>
                          <th>Pilih</th>
                          <th>Preview Pertanyaan</th>
                          <th>Kelas</th>
                          <th>Mata Pelajaran</th>
                          <th>Jenis</th>
                          <th>Tipe</th>
                          <th>Materi/Topik</th>
                          <th>Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bankSoalItems.map(item => {
                          const isChecked = selectedBankSoalIds.includes(item.id);
                          return (
                            <tr key={item.id} className={isChecked ? 'selected' : ''}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleBankSoalSelection(item.id)}
                                />
                              </td>
                              <td>
                                <div className="bank-soal-picker-question">{previewBankText(item.pertanyaan)}</div>
                              </td>
                              <td>{item.kelas || '-'}</td>
                              <td>{item.mata_pelajaran || '-'}</td>
                              <td><span className={kategoriBadge(item.jenis_instrumen)}>{item.jenis_instrumen || '-'}</span></td>
                              <td><span className={tipeBadge(item.tipe_soal)}>{tipeLabel(item.tipe_soal)}</span></td>
                              <td>{item.materi || item.topik || '-'}</td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => setBankSoalDetail(bankSoalDetail?.id === item.id ? null : item)}
                                >
                                  {bankSoalDetail?.id === item.id ? 'Tutup' : 'Detail'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {bankSoalDetail && (
                    <div className="bank-soal-picker-detail">
                      <div>
                        <strong>Detail ringkas soal</strong>
                        <p>{previewBankText(bankSoalDetail.pertanyaan, 260)}</p>
                      </div>
                      <div className="bank-soal-picker-detail-grid">
                        {['a', 'b', 'c', 'd', 'e'].map(label => {
                          const value = bankSoalDetail[`pilihan_${label}`];
                          if (!value) return null;
                          return (
                            <div key={label}>
                              <b>{label.toUpperCase()}.</b> {previewBankText(value, 120)}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="bank-soal-picker-pagination">
                    <span>
                      Halaman {bankSoalMeta.page || bankSoalPage} dari {Math.max(1, bankSoalMeta.total_pages || 1)}
                    </span>
                    <div>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={bankSoalPage <= 1}
                        onClick={() => setBankSoalPage(prev => Math.max(1, prev - 1))}
                      >
                        Sebelumnya
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={bankSoalPage >= (bankSoalMeta.total_pages || 1)}
                        onClick={() => setBankSoalPage(prev => prev + 1)}
                      >
                        Berikutnya
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="bank-soal-picker-footer">
              <span>{selectedBankSoalIds.length} soal dipilih</span>
              <div>
                <button type="button" className="btn" onClick={closeBankSoalModal} disabled={usingBankSoal}>
                  Batal
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={addSelectedBankSoalToInstrumen}
                  disabled={usingBankSoal || selectedBankSoalIds.length === 0}
                >
                  {usingBankSoal ? 'Menambahkan...' : 'Tambahkan ke Instrumen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {zoomPreviewImage && (
        <div className="image-zoom-modal" onClick={(event) => event.target === event.currentTarget && closePreviewImageZoom()}>
          <div className="image-zoom-content">
            <div className="image-zoom-toolbar">
              <strong>Preview Gambar</strong>
              <div>
                <span>{Math.round(zoomPreviewScale * 100)}%</span>
                <button type="button" onClick={zoomPreviewOut} disabled={zoomPreviewScale <= 0.5}>-</button>
                <button type="button" onClick={() => setZoomPreviewScale(1)}>Reset</button>
                <button type="button" onClick={zoomPreviewIn} disabled={zoomPreviewScale >= 3}>+</button>
                <button type="button" className="image-zoom-close" onClick={closePreviewImageZoom}>Tutup</button>
              </div>
            </div>
            <div className="image-zoom-preview">
              {form.gambar_caption && (
                <div style={{ alignSelf: 'stretch', marginBottom: 8, fontSize: 13, color: '#64748B', textAlign: 'left' }}>
                  {form.gambar_caption}
                </div>
              )}
              <img
                src={zoomPreviewImage}
                alt="Preview gambar soal"
                style={{ transform: `scale(${zoomPreviewScale})` }}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SoalPage;
