import { useState, useEffect } from 'react'
import { instrumenAPI } from '../api'
import { useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { KELAS } from '../constants/classes'
import { sanitizeRichHtml, stripHtml } from '../utils/sanitizeHtml'
import {
  BookOpenCheck,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Clock3,
  CopyPlus,
  FilePlus2,
  FileText,
  Filter,
  Italic,
  Layers3,
  List,
  ListOrdered,
  Pencil,
  PlayCircle,
  Search,
  ArrowDown,
  ArrowUp,
  Trash2,
  Underline,
  Upload,
} from 'lucide-react'


const JENIS = ['HOTS','Literasi','Numerasi']
const STATUS = ['draft','aktif','nonaktif']
const MAPEL = ['Matematika','Bahasa Indonesia','Bahasa Inggris','IPA','IPS','PKn','Agama Islam','Seni Budaya','PJOK','Prakarya']
const jenisColor = { HOTS:'blue', Literasi:'teal', Numerasi:'amber' }
const statusColor = { aktif:'teal', draft:'amber', nonaktif:'coral' }
const API_ASSET_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '')
const isAdminRole = (peran) => ['admin', 'admin_sekolah', 'super_admin'].includes(peran)
const IMPORT_DRAFT_PREFIX = 'smiasb_import_draft'
const IMPORT_DRAFT_TTL_MS = 60 * 60 * 1000

const toAssetUrl = (src) => {
  if (!src) return ''
  if (String(src).startsWith('http')) return src
  return `${API_ASSET_URL}${String(src).startsWith('/') ? src : `/${src}`}`
}

const sanitizeWordHtml = (html = '') => {
  if (!html || typeof window === 'undefined' || !window.DOMParser) return ''

  const parser = new window.DOMParser()
  const doc = parser.parseFromString(String(html), 'text/html')

  doc.querySelectorAll('[src]').forEach(el => {
    const src = el.getAttribute('src') || ''
    if (src.startsWith('/uploads/')) el.setAttribute('src', toAssetUrl(src))
  })

  return sanitizeRichHtml(doc.body.innerHTML)
}

const EDITOR_FONT_SIZES = [
  { label: 'Kecil', value: '2' },
  { label: 'Normal', value: '3' },
  { label: 'Besar', value: '5' }
]

const escapeEditorHtml = (value = '') => (
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
)

const prepareRichHtmlInput = (value = '') => {
  const source = String(value || '')
  return /<[a-z][\s\S]*>/i.test(source)
    ? source
    : escapeEditorHtml(source).replace(/\r?\n/g, '<br>')
}

function RichTextEditor({ value = '', onChange, minHeight = 110, compact = false, placeholder = '' }) {
  const editorRef = useRef(null)
  const lastValueRef = useRef('')

  useEffect(() => {
    const safeValue = sanitizeRichHtml(prepareRichHtmlInput(value))
    if (
      editorRef.current &&
      document.activeElement !== editorRef.current &&
      safeValue !== lastValueRef.current
    ) {
      editorRef.current.innerHTML = safeValue
      lastValueRef.current = safeValue
    }
  }, [value])

  const emitValue = () => {
    if (!editorRef.current) return
    const safeValue = sanitizeRichHtml(editorRef.current.innerHTML)
    lastValueRef.current = safeValue
    onChange?.(safeValue)
  }

  const runCommand = (command, commandValue = null) => {
    editorRef.current?.focus()
    document.execCommand('styleWithCSS', false, true)
    document.execCommand(command, false, commandValue)
    emitValue()
  }

  const toolbarButton = (label, icon, command, commandValue = null, title = label) => (
    <button
      type="button"
      className="btn btn-sm"
      title={title}
      onMouseDown={e => e.preventDefault()}
      onClick={() => runCommand(command, commandValue)}
      style={{
        padding: compact ? '5px 7px' : '6px 8px',
        minWidth: compact ? 30 : 34,
        background: '#FFFFFF',
        border: '1px solid #CBD5E1'
      }}
    >
      {icon || label}
    </button>
  )

  return (
    <div
      style={{
        border: '1px solid #CBD5E1',
        borderRadius: 10,
        background: '#FFFFFF',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 4,
          flexWrap: 'wrap',
          padding: compact ? 6 : 8,
          borderBottom: '1px solid #E2E8F0',
          background: '#F8FAFC'
        }}
      >
        {toolbarButton('B', <Bold size={14} />, 'bold', null, 'Bold')}
        {toolbarButton('I', <Italic size={14} />, 'italic', null, 'Italic')}
        {toolbarButton('U', <Underline size={14} />, 'underline', null, 'Underline')}

        <input
          type="color"
          title="Warna teks"
          onMouseDown={e => e.stopPropagation()}
          onChange={e => runCommand('foreColor', e.target.value)}
          style={{ width: 34, height: 31, border: '1px solid #CBD5E1', borderRadius: 8, background: '#fff' }}
        />

        <select
          className="input"
          title="Ukuran font"
          onMouseDown={e => e.stopPropagation()}
          onChange={e => {
            if (e.target.value) runCommand('fontSize', e.target.value)
            e.target.value = ''
          }}
          style={{ width: compact ? 86 : 104, height: 31, padding: '4px 6px', fontSize: 12 }}
          defaultValue=""
        >
          <option value="">Ukuran</option>
          {EDITOR_FONT_SIZES.map(size => (
            <option key={size.value} value={size.value}>{size.label}</option>
          ))}
        </select>

        {toolbarButton('L', <AlignLeft size={14} />, 'justifyLeft', null, 'Rata kiri')}
        {toolbarButton('C', <AlignCenter size={14} />, 'justifyCenter', null, 'Rata tengah')}
        {toolbarButton('R', <AlignRight size={14} />, 'justifyRight', null, 'Rata kanan')}
        {toolbarButton('J', <AlignJustify size={14} />, 'justifyFull', null, 'Justify')}
        {toolbarButton('Bullets', <List size={14} />, 'insertUnorderedList', null, 'Bullet list')}
        {toolbarButton('Nomor', <ListOrdered size={14} />, 'insertOrderedList', null, 'Numbered list')}
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emitValue}
        onBlur={emitValue}
        data-placeholder={placeholder}
        style={{
          minHeight,
          padding: compact ? 8 : 10,
          outline: 'none',
          lineHeight: 1.6,
          fontSize: 14,
          overflowX: 'auto'
        }}
      />
    </div>
  )
}

const renderSafeHtml = (html = '', options = {}) => {
  const safe = sanitizeRichHtml(prepareRichHtmlInput(html))
  const text = stripHtml(safe).trim()

  if (!safe && !text) {
    return options.fallback ? <span style={{ color: '#94A3B8' }}>{options.fallback}</span> : null
  }

  return (
    <div
      style={{
        lineHeight: options.lineHeight || 1.6,
        fontSize: options.fontSize || 14
      }}
      dangerouslySetInnerHTML={{ __html: safe || text }}
    />
  )
}

const emptyForm = { 
  judul:'', 
  deskripsi:'', 
  jenis:'HOTS', 
  mata_pelajaran:'', 
  kelas:'', 
  jumlah_soal:'', 
  durasi_menit: 60, 
  status:'draft',
  gunakan_batas_waktu: 0,
  batas_waktu: ''
}

const emptyDuplicateForm = {
  kelas_tujuan: '',
  judul_baru: '',
  status: 'draft',
  acak_soal: true
}

export default function InstrumenPage() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterJenis, setFilterJenis] = useState('Semua')
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 })
  const navigate = useNavigate()

  // ========== TAMBAHAN: STATE UNTUK EDIT BATAS WAKTU ==========
  const [showBatasWaktuModal, setShowBatasWaktuModal] = useState(false)
  const [editBatasWaktuItem, setEditBatasWaktuItem] = useState(null)
  const [editBatasWaktuForm, setEditBatasWaktuForm] = useState({
    gunakan_batas_waktu: 0,
    batas_waktu: ''
  })

  // ========== TAMBAHAN: STATE IMPORT WORD / EXCEL ==========
  const [showImportModal, setShowImportModal] = useState(false)
  const [importItem, setImportItem] = useState(null)
  const [importMode, setImportMode] = useState('word')
  const [importFile, setImportFile] = useState(null)
  const [importPreview, setImportPreview] = useState([])
  const [importSummary, setImportSummary] = useState(null)
  const [importDocument, setImportDocument] = useState(null)
  const [importTab, setImportTab] = useState('document')
  const [parserInfo, setParserInfo] = useState(null)
  const [importQualityReport, setImportQualityReport] = useState(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importSaving, setImportSaving] = useState(false)
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')
  const [studentPreviewIndex, setStudentPreviewIndex] = useState(null)
  const importFileInputRef = useRef(null)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [duplicateItem, setDuplicateItem] = useState(null)
  const [duplicateForm, setDuplicateForm] = useState(emptyDuplicateForm)
  const [duplicateSaving, setDuplicateSaving] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState('')

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
            width: 360,
            background: '#ffffff',
            color: '#111827',
            borderRadius: 16,
            boxShadow: '0 20px 45px rgba(15, 23, 42, 0.22)',
            border: '1px solid #E5E7EB',
            padding: 16
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
            {title}
          </div>

          <div style={{ fontSize: 13, color: '#4B5563', lineHeight: 1.5, marginBottom: 14 }}>
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

  const getImportDraftKey = (instrumenId, mode = importMode) => (
    instrumenId ? `${IMPORT_DRAFT_PREFIX}_${instrumenId}_${mode}` : ''
  )

  const hasImportSessionContent = () => (
    importPreview.length > 0 || Boolean(importSummary) || Boolean(importDocument)
  )

  const hasImportDraftContent = (draft = {}) => {
    const state = draft.state || {}
    return (
      Array.isArray(state.importPreview) && state.importPreview.length > 0
    ) || Boolean(state.importSummary) || Boolean(state.importDocument)
  }

  const clearImportDraft = (instrumenId, mode = importMode) => {
    const key = getImportDraftKey(instrumenId, mode)
    if (!key || typeof window === 'undefined') return
    window.localStorage.removeItem(key)
  }

  const readImportDraft = (instrumenId, mode = importMode) => {
    const key = getImportDraftKey(instrumenId, mode)
    if (!key || typeof window === 'undefined') return null

    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) return null

      const draft = JSON.parse(raw)
      const savedAt = Number(draft.savedAt || 0)
      const isExpired = !savedAt || Date.now() - savedAt > IMPORT_DRAFT_TTL_MS
      if (isExpired || !hasImportDraftContent(draft)) {
        window.localStorage.removeItem(key)
        return null
      }

      return draft
    } catch {
      window.localStorage.removeItem(key)
      return null
    }
  }

  const writeImportDraft = () => {
    if (!showImportModal || !importItem || !hasImportSessionContent() || typeof window === 'undefined') return

    const key = getImportDraftKey(importItem.id, importMode)
    if (!key) return

    const now = Date.now()
    const draft = {
      version: 1,
      mode: importMode,
      savedAt: now,
      expiresAt: now + IMPORT_DRAFT_TTL_MS,
      state: {
        importPreview,
        importSummary,
        importDocument,
        importTab,
        parserInfo,
        importQualityReport
      }
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(draft))
    } catch {
      // localStorage can fail when the preview is very large; the UI still works in-memory.
    }
  }

  const resetImportSession = (mode = 'word') => {
    setImportMode(mode)
    setImportFile(null)
    setImportPreview([])
    setImportSummary(null)
    setImportDocument(null)
    setImportTab('document')
    setParserInfo(null)
    setImportQualityReport(null)
    setImportError('')
    setImportSuccess('')
    setStudentPreviewIndex(null)
    if (importFileInputRef.current) importFileInputRef.current.value = ''
  }

  const restoreImportDraft = (item, mode, draft) => {
    const state = draft.state || {}
    setImportItem(item)
    setImportMode(mode)
    setImportFile(null)
    setImportPreview(normalizeImportPreviewList(state.importPreview || []))
    setImportSummary(state.importSummary || null)
    setImportDocument(state.importDocument || null)
    setImportTab(state.importTab || (mode === 'excel' ? 'questions' : 'document'))
    setParserInfo(state.parserInfo || null)
    setImportQualityReport(state.importQualityReport || null)
    setImportError('')
    setImportSuccess('Draft preview sebelumnya dilanjutkan. Draft otomatis berlaku 1 jam sejak terakhir tersimpan.')
    setStudentPreviewIndex(null)
    setShowImportModal(true)
    if (importFileInputRef.current) importFileInputRef.current.value = ''
  }

  const openImportSession = async (item, mode = 'word') => {
    if (item.status === 'aktif') {
      toast.error('Instrumen sudah aktif. Ubah status ke draft/nonaktif dulu sebelum import soal.')
      return
    }

    const draft = readImportDraft(item.id, mode)
    if (draft) {
      const resume = await confirmToast(
        'Draft preview sebelumnya ditemukan dan belum lebih dari 1 jam. Lanjutkan edit draft itu atau mulai ulang import?',
        {
          title: 'Lanjutkan draft?',
          confirmText: 'Lanjutkan Draft',
          cancelText: 'Mulai Ulang'
        }
      )

      if (resume) {
        restoreImportDraft(item, mode, draft)
        return
      }

      clearImportDraft(item.id, mode)
    }

    setImportItem(item)
    resetImportSession(mode)
    setShowImportModal(true)
  }

  useEffect(() => {
    writeImportDraft()
  }, [
    showImportModal,
    importItem,
    importMode,
    importPreview,
    importSummary,
    importDocument,
    importTab,
    parserInfo,
    importQualityReport
  ])

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!showImportModal || !hasImportSessionContent()) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [showImportModal, importPreview, importSummary, importDocument])

  const canEdit = isAdminRole(user?.peran) || user?.peran === 'guru' 

  const fetchData = async (page = 1) => {
    setLoading(true)
    try {
      const params = { page, limit: 10 }
      if (filterJenis !== 'Semua') params.jenis = filterJenis
      if (search) params.search = search
      const res = await instrumenAPI.getAll(params)
      setItems(res.data.data)
      setPagination(res.data.pagination)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData(1) }, [filterJenis])

  const setFormField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openAdd = () => {
    setEditItem(null)
    setForm(emptyForm)
    setFile(null)
    setError('')
    setShowModal(true)
  }

  const openEdit = (item) => {
    setEditItem(item)
    let formattedBatasWaktu = ''
    if (item.batas_waktu) {
      const date = new Date(item.batas_waktu)
      formattedBatasWaktu = date.toISOString().slice(0, 16)
    }
    
    setForm({
      judul: item.judul, 
      deskripsi: item.deskripsi || '',
      jenis: item.jenis, 
      mata_pelajaran: item.mata_pelajaran,
      kelas: item.kelas, 
      jumlah_soal: item.jumlah_soal,
      durasi_menit: item.durasi_menit || 60,
      status: item.status,
      gunakan_batas_waktu: item.gunakan_batas_waktu || 0,
      batas_waktu: formattedBatasWaktu
    })
    setFile(null)
    setError('')
    setShowModal(true)
  }

  // ========== TAMBAHAN: FUNGSI OPEN MODAL EDIT BATAS WAKTU ==========
  const openEditBatasWaktu = (item) => {
    let formattedBatasWaktu = ''
    if (item.batas_waktu) {
      const date = new Date(item.batas_waktu)
      formattedBatasWaktu = date.toISOString().slice(0, 16)
    }
    
    setEditBatasWaktuItem(item)
    setEditBatasWaktuForm({
      gunakan_batas_waktu: item.gunakan_batas_waktu || 0,
      batas_waktu: formattedBatasWaktu
    })
    setError('')
    setShowBatasWaktuModal(true)
  }

  // ========== TAMBAHAN: FUNGSI SIMPAN EDIT BATAS WAKTU ==========
  const handleSaveBatasWaktu = async () => {
    if (editBatasWaktuForm.gunakan_batas_waktu === 1 && !editBatasWaktuForm.batas_waktu) {
      setError('Silakan pilih tanggal dan waktu batas pengerjaan.')
      return
    }
    
    setSaving(true)
    setError('')
    
    try {
      await instrumenAPI.patchBatasWaktu(editBatasWaktuItem.id, {
        gunakan_batas_waktu: editBatasWaktuForm.gunakan_batas_waktu,
        batas_waktu: editBatasWaktuForm.batas_waktu || null
      })
      
      setShowBatasWaktuModal(false)
      fetchData(pagination.page)
      toast.success('Batas waktu berhasil diperbarui')
    } catch (err) {
      const message = err.response?.data?.message || 'Gagal memperbarui batas waktu.'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  // ========== TAMBAHAN: HELPER IMPORT WORD ==========
  const openImportWord = (item) => {
    openImportSession(item, 'word')
  }

  const openImportExcel = (item) => {
    openImportSession(item, 'excel')
  }

  const closeImportWord = () => {
    if (importLoading || importSaving) return
    writeImportDraft()
    if (hasImportSessionContent()) {
      toast.success('Draft preview disimpan sementara selama 1 jam.')
    }
    setShowImportModal(false)
    setImportItem(null)
    resetImportSession('word')
  }

  const handleImportFileChange = async (event) => {
    const nextFile = event.target.files?.[0] || null

    if (nextFile && hasImportSessionContent()) {
      const ok = await confirmToast(
        'Mengganti file akan menghapus draft preview yang sedang diedit. Lanjutkan?',
        {
          title: 'Ganti file import?',
          confirmText: 'Ganti File',
          cancelText: 'Batal',
          danger: true
        }
      )

      if (!ok) {
        event.target.value = ''
        return
      }

      clearImportDraft(importItem?.id, importMode)
    }

    setImportFile(nextFile)
    setImportPreview([])
    setImportSummary(null)
    setImportDocument(null)
    setParserInfo(null)
    setImportQualityReport(null)
    setImportTab('document')
    setImportError('')
    setImportSuccess('')
    setStudentPreviewIndex(null)
  }

  const canDuplicateItem = () => (
    user?.peran === 'guru' || user?.peran === 'admin' || user?.peran === 'admin_sekolah'
  )

  const normalizeKelasValue = (value) => String(value || '').trim().toUpperCase()

  const buildDuplicateTitle = (item, kelas) => {
    const baseTitle = String(item?.judul || '').trim()
    const targetClass = String(kelas || '').trim()
    return targetClass ? `${baseTitle} - ${targetClass}` : baseTitle
  }

  const findSimilarDuplicateInstrument = (formData = duplicateForm) => {
    if (!duplicateItem) return null
    const targetTitle = String(formData.judul_baru || '').trim()
    const targetClass = normalizeKelasValue(formData.kelas_tujuan)

    if (!targetTitle || !targetClass) return null

    return items.find(item => (
      Number(item.id) !== Number(duplicateItem.id) &&
      normalizeKelasValue(item.kelas) === targetClass &&
      String(item.judul || '').trim().toLowerCase() === targetTitle.toLowerCase()
    )) || null
  }

  const setDuplicateFormField = (field, value) => {
    setDuplicateForm(prev => {
      if (field !== 'kelas_tujuan') {
        const nextForm = { ...prev, [field]: value }

        if (normalizeKelasValue(nextForm.kelas_tujuan) === normalizeKelasValue(duplicateItem?.kelas)) {
          setDuplicateWarning('Kelas tujuan tidak boleh sama dengan kelas asal.')
        } else if (findSimilarDuplicateInstrument(nextForm)) {
          setDuplicateWarning('Instrumen serupa sudah ada untuk kelas ini.')
        } else {
          setDuplicateWarning('')
        }

        return nextForm
      }

      const previousDefaultTitle = buildDuplicateTitle(duplicateItem, prev.kelas_tujuan)
      const shouldUpdateTitle = !prev.judul_baru || prev.judul_baru === previousDefaultTitle
      const nextForm = {
        ...prev,
        kelas_tujuan: value,
        judul_baru: shouldUpdateTitle ? buildDuplicateTitle(duplicateItem, value) : prev.judul_baru
      }

      if (normalizeKelasValue(value) === normalizeKelasValue(duplicateItem?.kelas)) {
        setDuplicateWarning('Kelas tujuan tidak boleh sama dengan kelas asal.')
      } else if (findSimilarDuplicateInstrument(nextForm)) {
        setDuplicateWarning('Instrumen serupa sudah ada untuk kelas ini.')
      } else {
        setDuplicateWarning('')
      }

      return nextForm
    })
  }

  const openDuplicateInstrument = (item) => {
    setDuplicateItem(item)
    setDuplicateForm(emptyDuplicateForm)
    setDuplicateWarning('')
    setError('')
    setShowDuplicateModal(true)
  }

  const closeDuplicateInstrument = () => {
    if (duplicateSaving) return
    setShowDuplicateModal(false)
    setDuplicateItem(null)
    setDuplicateForm(emptyDuplicateForm)
    setDuplicateWarning('')
  }

  const getPilihanLabels = (soal) => {
    return ['A', 'B', 'C', 'D', 'E'].filter(label => {
      const key = `pilihan_${label.toLowerCase()}`
      return soal[key] !== undefined && soal[key] !== null && String(soal[key]).trim() !== ''
    })
  }

  const getMissingKeyList = (list = importPreview) => {
    return normalizeImportPreviewList(list).filter((soal) => {
      if (soal.tipe_soal === 'pilihan_ganda' || soal.tipe_soal === 'sebab_akibat') {
        return !soal.jawaban_benar
      }

      if (soal.tipe_soal === 'ganda_kompleks') {
        return normalizeJawabanKompleks(soal.jawaban_benar_json).length === 0
      }

      if (soal.tipe_soal === 'benar_salah') {
        const pernyataan = Array.isArray(soal.pernyataan_checklist) ? soal.pernyataan_checklist : []
        const jawaban = soal.jawaban_benar_json && typeof soal.jawaban_benar_json === 'object'
          ? soal.jawaban_benar_json
          : {}

        return pernyataan.length > 0 && Object.keys(jawaban).length < pernyataan.length
      }

      if (soal.tipe_soal === 'menjodohkan') {
        const kiri = soal.pasangan_menjodohkan?.kolom_kiri || []
        const kunci = soal.pasangan_menjodohkan?.kunci || {}

        return kiri.length > 0 && Object.keys(kunci).length < kiri.length
      }

      return false
    })
  }

  const getQualityCount = (report, key) => (
    Array.isArray(report?.[key]) ? report[key].length : 0
  )

  const getQualityWarningCount = (report = importQualityReport) => (
    getQualityCount(report, 'missing_images_warning') +
    getQualityCount(report, 'missing_tables_warning') +
    getQualityCount(report, 'unmapped_images') +
    getQualityCount(report, 'unmapped_tables') +
    getQualityCount(report, 'low_confidence_questions')
  )

  const clearQualityWarningsForQuestion = (soalIndex, fields = []) => {
    const nomor = importPreview[soalIndex]?.nomor
    if (!nomor) return

    setImportQualityReport(prev => {
      if (!prev) return prev
      const next = { ...prev }

      fields.forEach(field => {
        if (Array.isArray(next[field])) {
          next[field] = next[field].filter(item => Number(item.nomor) !== Number(nomor))
        }
      })

      return next
    })
  }

  const updateImportSoal = (index, field, value) => {
    setImportPreview(prev => prev.map((soal, i) => {
      if (i !== index) return soal
      return { ...soal, [field]: value }
    }))
  }

  const moveImportLayoutBlock = (index, blockType, direction) => {
    setImportPreview(prev => prev.map((soal, i) => {
      if (i !== index) return soal

      const blocks = buildQuestionLayoutBlocks(soal)
      const currentIndex = blocks.findIndex(block => block.type === blockType)
      const targetIndex = currentIndex + direction

      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= blocks.length) return soal

      const nextBlocks = [...blocks]
      const [moved] = nextBlocks.splice(currentIndex, 1)
      nextBlocks.splice(targetIndex, 0, moved)

      return {
        ...soal,
        layout_blocks: nextBlocks
      }
    }))
  }

  const toggleGandaKompleks = (index, label) => {
    setImportPreview(prev => prev.map((soal, i) => {
      if (i !== index) return soal

      const current = Array.isArray(soal.jawaban_benar_json)
        ? soal.jawaban_benar_json
        : []

      const exists = current.includes(label)
      const next = exists
        ? current.filter(item => item !== label)
        : [...current, label]

      return {
        ...soal,
        jawaban_benar_json: next.sort()
      }
    }))
  }

  const updateBenarSalah = (index, pernyataanIndex, value) => {
    setImportPreview(prev => prev.map((soal, i) => {
      if (i !== index) return soal

      return {
        ...soal,
        jawaban_benar_json: {
          ...(soal.jawaban_benar_json || {}),
          [String(pernyataanIndex)]: value === 'Benar'
        }
      }
    }))
  }

  const updateMenjodohkan = (index, kiriIndex, label) => {
    setImportPreview(prev => prev.map((soal, i) => {
      if (i !== index) return soal

      return {
        ...soal,
        pasangan_menjodohkan: {
          ...(soal.pasangan_menjodohkan || {}),
          kunci: {
            ...(soal.pasangan_menjodohkan?.kunci || {}),
            [String(kiriIndex)]: label
          }
        }
      }
    }))
  }
const TIPE_SOAL_OPTIONS = [
  'pilihan_ganda',
  'sebab_akibat',
  'ganda_kompleks',
  'benar_salah',
  'menjodohkan'
]

const PILIHAN_LABELS = ['A', 'B', 'C', 'D', 'E']
const PILIHAN_WAJIB_LABELS = ['A', 'B', 'C', 'D']
const UKURAN_GAMBAR_IMPORT = {
  kecil: 140,
  sedang: 220,
  besar: 320
}
const IMAGE_WIDTH_OPTIONS = ['25%', '50%', '75%', '100%']
const ALIGN_OPTIONS = ['left', 'center', 'right']
const TABLE_WIDTH_OPTIONS = ['50%', '75%', '100%']
const TABLE_FONT_SIZE_OPTIONS = ['12px', '14px', '16px', '18px']
const LAYOUT_METADATA_ROLE = 'layout_blocks'
const LAYOUT_BLOCK_DEFINITIONS = [
  { type: 'question', id: 'question', label: 'Pertanyaan' },
  { type: 'stimulus', id: 'stimulus', label: 'Stimulus Tambahan' },
  { type: 'image', id: 'images', label: 'Gambar Pendukung' },
  { type: 'table', id: 'tables', label: 'Tabel Pendukung' }
]
const LAYOUT_BLOCK_LABELS = LAYOUT_BLOCK_DEFINITIONS.reduce((acc, item) => ({
  ...acc,
  [item.type]: item.label
}), {})

const stripChoicePrefix = (value = '') => (
  String(value || '')
    .replace(/^\(?[A-Ea-e]\)?\s*[\.\)]\s*/, '')
    .trim()
)

const getChoiceText = (soal, label) => {
  const key = `pilihan_${label.toLowerCase()}`
  return stripChoicePrefix(soal[key])
}

const getVisibleChoiceLabels = (soal) => {
  const selected = Array.isArray(soal.jawaban_benar_json)
    ? soal.jawaban_benar_json
    : []
  const hasE = Boolean(getChoiceText(soal, 'E')) || soal.jawaban_benar === 'E' || selected.includes('E')

  return hasE ? PILIHAN_LABELS : PILIHAN_WAJIB_LABELS
}

const normalizeJawabanKompleks = (value) => {
  if (Array.isArray(value)) {
    return [...new Set(value.map(item => String(item || '').trim().toUpperCase()).filter(Boolean))]
      .filter(item => PILIHAN_LABELS.includes(item))
      .sort()
  }

  if (typeof value === 'string') {
    return normalizeJawabanKompleks(value.split(/[,;\s]+/))
  }

  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([, itemValue]) => itemValue === true || itemValue === 'true' || itemValue === 1 || itemValue === '1')
      .map(([key]) => key)
      .map(key => (/^\d+$/.test(key) ? PILIHAN_LABELS[Number(key)] : key).toUpperCase())
      .filter(item => PILIHAN_LABELS.includes(item))
      .sort()
  }

  return []
}

const normalizeHtmlField = (value = '') => sanitizeRichHtml(prepareRichHtmlInput(value)).trim()

const isHtmlEmpty = (value = '') => {
  const safe = normalizeHtmlField(value)
  return !stripHtml(safe).trim() && !/<(img|table)\b/i.test(safe)
}

const tableHasAnyText = (table = {}) => (
  Array.isArray(table.rows) &&
  table.rows.some(row => Array.isArray(row) && row.some(cell => stripHtml(String(cell || '')).trim()))
)

const isLayoutMetadataTable = (table = {}) => (
  String(table?.role || '').toLowerCase() === LAYOUT_METADATA_ROLE ||
  String(table?.type || '').toLowerCase() === LAYOUT_METADATA_ROLE ||
  Array.isArray(table?.layout_blocks)
)

const normalizeSupportingTable = (table = {}, index = 0) => ({
  index: table.index ?? index,
  table_index: table.table_index ?? table.index ?? index,
  source: table.source || 'auto',
  role: table.role || 'stimulus',
  caption: table.caption || '',
  width: TABLE_WIDTH_OPTIONS.includes(table.width) ? table.width : '100%',
  align: ALIGN_OPTIONS.includes(table.align) ? table.align : 'center',
  fontSize: TABLE_FONT_SIZE_OPTIONS.includes(table.fontSize) ? table.fontSize : '14px',
  rows: Array.isArray(table.rows) && table.rows.length > 0
    ? table.rows.map(row => Array.isArray(row) ? row.map(cell => String(cell ?? '')) : ['', ''])
    : [['', ''], ['', '']]
})

const normalizeSupportingTables = (soal = {}) => {
  const source = Array.isArray(soal.supporting_tables) && soal.supporting_tables.length > 0
    ? soal.supporting_tables
    : Array.isArray(soal.tabel_data)
      ? soal.tabel_data
      : []

  return source
    .filter(table => !isLayoutMetadataTable(table))
    .map((table, index) => normalizeSupportingTable(table, index))
}

const getLayoutMetadata = (soal = {}) => {
  const candidates = [
    ...(Array.isArray(soal.tabel_data) ? soal.tabel_data : []),
    ...(Array.isArray(soal.supporting_tables) ? soal.supporting_tables : [])
  ]

  return candidates.find(isLayoutMetadataTable) || null
}

const normalizeLayoutBlocks = (blocks = []) => {
  const seen = new Set()
  return (Array.isArray(blocks) ? blocks : [])
    .map(block => {
      const type = String(block?.type || '').trim()
      const definition = LAYOUT_BLOCK_DEFINITIONS.find(item => item.type === type)
      if (!definition || seen.has(type)) return null
      seen.add(type)
      return { type: definition.type, id: block?.id || definition.id }
    })
    .filter(Boolean)
}

const hasLayoutBlockContent = (soal = {}, type = '') => {
  if (type === 'question') return true
  if (type === 'stimulus') return !isHtmlEmpty(soal.stimulus_tambahan || getLayoutMetadata(soal)?.stimulus_tambahan || '')
  if (type === 'image') {
    const metadataImages = getLayoutMetadata(soal)?.gambar
    return (
      (Array.isArray(soal.gambar) && soal.gambar.length > 0) ||
      (Array.isArray(metadataImages) && metadataImages.length > 0) ||
      Boolean(soal.gambar_soal)
    )
  }
  if (type === 'table') return normalizeSupportingTables(soal).length > 0
  return false
}

const buildQuestionLayoutBlocks = (soal = {}) => {
  const metadata = getLayoutMetadata(soal)
  const sourceBlocks = normalizeLayoutBlocks(
    Array.isArray(soal.layout_blocks) ? soal.layout_blocks : metadata?.layout_blocks
  )
  const activeDefinitions = LAYOUT_BLOCK_DEFINITIONS.filter(block => hasLayoutBlockContent(soal, block.type))
  const activeTypes = new Set(activeDefinitions.map(block => block.type))
  const ordered = sourceBlocks.filter(block => activeTypes.has(block.type))
  const existingTypes = new Set(ordered.map(block => block.type))

  activeDefinitions.forEach((definition) => {
    if (!existingTypes.has(definition.type)) {
      ordered.push({ type: definition.type, id: definition.id })
    }
  })

  return ordered.some(block => block.type === 'question')
    ? ordered
    : [{ type: 'question', id: 'question' }, ...ordered]
}

const buildLayoutMetadataTable = (soal = {}) => ({
  source: 'layout',
  role: LAYOUT_METADATA_ROLE,
  type: LAYOUT_METADATA_ROLE,
  layout_blocks: buildQuestionLayoutBlocks(soal),
  stimulus_tambahan: normalizeHtmlField(soal.stimulus_tambahan || ''),
  gambar: Array.isArray(soal.gambar)
    ? soal.gambar.map(item => normalizeImportImage(item))
    : []
})

const normalizeImportImage = (gambar = {}) => {
  const ukuran = gambar.ukuran || (
    Number(gambar.preview_height || 0) >= 300
      ? 'besar'
      : Number(gambar.preview_height || 0) <= 150 && Number(gambar.preview_height || 0) > 0
        ? 'kecil'
        : 'sedang'
  )

  return {
    ...gambar,
    caption: gambar.caption || gambar.alt || '',
    alt: gambar.alt || gambar.caption || '',
    ukuran,
    preview_height: gambar.preview_height || UKURAN_GAMBAR_IMPORT[ukuran] || 220,
    width: IMAGE_WIDTH_OPTIONS.includes(gambar.width) ? gambar.width : (
      ukuran === 'besar' ? '100%' : ukuran === 'kecil' ? '50%' : '75%'
    ),
    align: ALIGN_OPTIONS.includes(gambar.align) ? gambar.align : 'center',
    source: gambar.source || 'auto'
  }
}

const normalizeMenjodohkanPayload = (pasangan = {}) => {
  const kolomKiri = Array.isArray(pasangan.kolom_kiri)
    ? pasangan.kolom_kiri.map(item => normalizeHtmlField(item))
    : []
  const kolomKanan = Array.isArray(pasangan.kolom_kanan)
    ? pasangan.kolom_kanan.map((item, index) => {
        if (typeof item === 'string') {
          return {
            label: String.fromCharCode(97 + index),
            text: normalizeHtmlField(item)
          }
        }

        return {
          label: String(item?.label || String.fromCharCode(97 + index)).toLowerCase(),
          text: normalizeHtmlField(item?.text || '')
        }
      })
    : []
  const validLabels = new Set(kolomKanan.map(item => item.label))
  const kunci = Object.entries(pasangan.kunci || {}).reduce((acc, [key, value]) => {
    const normalized = String(value || '').trim().toLowerCase()
    if (validLabels.has(normalized)) acc[String(key)] = normalized
    return acc
  }, {})

  return {
    ...pasangan,
    kolom_kiri: kolomKiri,
    kolom_kanan: kolomKanan,
    kunci
  }
}

const normalizeImportSoalPreview = (soal = {}) => {
  const next = { ...soal }
  const supportingTables = normalizeSupportingTables(next)

  PILIHAN_LABELS.forEach(label => {
    const key = `pilihan_${label.toLowerCase()}`
    const cleaned = stripChoicePrefix(next[key])
    next[key] = isHtmlEmpty(cleaned) ? '' : normalizeHtmlField(cleaned)
  })

  next.gambar = Array.isArray(next.gambar)
    ? next.gambar.map(item => normalizeImportImage(item))
    : []
  next.supporting_tables = supportingTables
  next.tabel_data = supportingTables
  next.pertanyaan = normalizeHtmlField(next.pertanyaan || '')
  next.stimulus_tambahan = normalizeHtmlField(next.stimulus_tambahan || '')
  next.layout_blocks = buildQuestionLayoutBlocks(next)

  if (next.tipe_soal === 'ganda_kompleks') {
    next.jawaban_benar_json = normalizeJawabanKompleks(next.jawaban_benar_json)

    if (next.jawaban_benar_json.length === 0) {
      next.status_parse = 'perlu_dicek'
      next.confidence = Math.min(Number(next.confidence || 0.5), 0.78)
      next.parser_notes = [
        ...(Array.isArray(next.parser_notes) ? next.parser_notes : []),
        'Kunci ganda kompleks belum terdeteksi.'
      ].filter((item, index, arr) => arr.indexOf(item) === index)
    }
  }

  if (next.tipe_soal === 'menjodohkan') {
    next.pasangan_menjodohkan = normalizeMenjodohkanPayload(next.pasangan_menjodohkan || {})
  }

  if (next.tipe_soal === 'benar_salah') {
    next.pernyataan_checklist = Array.isArray(next.pernyataan_checklist)
      ? next.pernyataan_checklist.map(item => (
          typeof item === 'string'
            ? normalizeHtmlField(item)
            : { ...item, pernyataan: normalizeHtmlField(item?.pernyataan || item?.text || '') }
        ))
      : []
  }

  return next
}

const normalizeImportPreviewList = (list = []) => (
  list.map(item => normalizeImportSoalPreview(item))
)

const buildSaveImportPayload = (list = []) => (
  normalizeImportPreviewList(list).map((soal) => {
    const next = { ...soal }
    const supportingTables = normalizeSupportingTables(next)
      .filter(table => table.source !== 'manual' || tableHasAnyText(table))

    PILIHAN_LABELS.forEach(label => {
      const key = `pilihan_${label.toLowerCase()}`
      const cleaned = stripChoicePrefix(next[key])
      next[key] = isHtmlEmpty(cleaned) ? '' : normalizeHtmlField(cleaned)
    })

    next.gambar = Array.isArray(next.gambar)
      ? next.gambar.map(item => normalizeImportImage(item))
      : []
    next.supporting_tables = supportingTables
    next.pertanyaan = normalizeHtmlField(next.pertanyaan || '')
    next.stimulus_tambahan = normalizeHtmlField(next.stimulus_tambahan || '')
    next.layout_blocks = buildQuestionLayoutBlocks(next)
    next.tabel_data = [...supportingTables, buildLayoutMetadataTable(next)]

    if (next.tipe_soal === 'ganda_kompleks') {
      next.jawaban_benar_json = normalizeJawabanKompleks(next.jawaban_benar_json)
    }

    if (next.tipe_soal === 'menjodohkan') {
      next.pasangan_menjodohkan = normalizeMenjodohkanPayload(next.pasangan_menjodohkan || {})
    }

    if (next.tipe_soal === 'benar_salah') {
      next.pernyataan_checklist = Array.isArray(next.pernyataan_checklist)
        ? next.pernyataan_checklist.map(item => (
            typeof item === 'string'
              ? normalizeHtmlField(item)
              : { ...item, pernyataan: normalizeHtmlField(item?.pernyataan || item?.text || '') }
          ))
        : []
    }

    return next
  })
)

const normalizeSoalForType = (soal, tipeSoal) => {
  const next = {
    ...soal,
    tipe_soal: tipeSoal
  }

  if (tipeSoal === 'pilihan_ganda' || tipeSoal === 'ganda_kompleks') {
    PILIHAN_WAJIB_LABELS.forEach(label => {
      const key = `pilihan_${label.toLowerCase()}`
      next[key] = next[key] || ''
    })
  }

  if (tipeSoal === 'sebab_akibat') {
    next.pilihan_a = next.pilihan_a || ''
    next.pilihan_b = next.pilihan_b || ''
    next.pilihan_c = next.pilihan_c || 'Pernyataan benar, alasan salah'
    next.pilihan_d = next.pilihan_d || 'Pernyataan salah, alasan benar'
    next.pilihan_e = ''
    if (next.jawaban_benar === 'E') next.jawaban_benar = ''
  }

  if (tipeSoal === 'ganda_kompleks' && !Array.isArray(next.jawaban_benar_json)) {
    next.jawaban_benar_json = []
  }

  if (tipeSoal === 'benar_salah') {
    next.pernyataan_checklist = Array.isArray(next.pernyataan_checklist)
      ? next.pernyataan_checklist
      : []
    next.jawaban_benar_json = next.jawaban_benar_json && typeof next.jawaban_benar_json === 'object' && !Array.isArray(next.jawaban_benar_json)
      ? next.jawaban_benar_json
      : {}
  }

  if (tipeSoal === 'menjodohkan') {
    next.pasangan_menjodohkan = next.pasangan_menjodohkan || {
      kolom_kiri: [],
      kolom_kanan: [],
      kunci: {}
    }
  }

  return next
}

const getParseStatusMeta = (status = '') => {
  if (status === 'manual') {
    return { label: 'Manual', background: '#E0F2FE', color: '#075985' }
  }

  if (status === 'auto') {
    return { label: 'Auto Detect', background: '#DCFCE7', color: '#166534' }
  }

  return { label: 'Perlu Dicek', background: '#FEF3C7', color: '#92400E' }
}

const createManualImportSoal = (nomor, kategori) => ({
  id_temp: `manual-${Date.now()}-${nomor}`,
  nomor,
  tipe_soal: 'pilihan_ganda',
  kategori_instrumen: kategori || 'HOTS',
  pertanyaan: '',
  pilihan: {
    A: '',
    B: '',
    C: '',
    D: '',
    E: ''
  },
  pilihan_a: '',
  pilihan_b: '',
  pilihan_c: '',
  pilihan_d: '',
  pilihan_e: '',
  jawaban_benar: '',
  gambar: [],
  tabel_data: [],
  stimulus_tambahan: '',
  layout_blocks: [{ type: 'question', id: 'question' }],
  bobot: 1,
  status_parse: 'manual',
  confidence: 1,
  parser_notes: ['Soal dibuat manual dari halaman preview']
})

const validateImportPreview = (list = []) => {
  const errors = []
  const normalizedList = normalizeImportPreviewList(list)

  normalizedList.forEach((soal, index) => {
    const nomor = soal.nomor || index + 1
    const tipe = soal.tipe_soal
    const pertanyaan = stripHtml(sanitizeRichHtml(soal.pertanyaan || '')).trim()

    if (isHtmlEmpty(soal.pertanyaan || '')) {
      errors.push(`Soal nomor ${nomor} belum memiliki pertanyaan.`)
    }

    if (!tipe) {
      errors.push(`Soal nomor ${nomor} belum memiliki tipe soal.`)
      return
    }

    normalizeSupportingTables(soal).forEach((table, tableIndex) => {
      if (table.source === 'manual' && !tableHasAnyText(table)) {
        errors.push(`Soal nomor ${nomor} memiliki tabel manual kosong pada tabel ${tableIndex + 1}.`)
      }
    })

    if (tipe === 'pilihan_ganda') {
      const pilihanWajib = PILIHAN_WAJIB_LABELS.filter(label => !isHtmlEmpty(getChoiceText(soal, label)))

      if (pilihanWajib.length < 4) {
        errors.push(`Soal nomor ${nomor} minimal harus memiliki pilihan A-D.`)
      }

      if (!soal.jawaban_benar) {
        errors.push(`Soal nomor ${nomor} belum memiliki kunci jawaban.`)
      }

      if (soal.jawaban_benar === 'E') {
        errors.push(`Soal nomor ${nomor} memiliki kunci E. Tipe sebab-akibat hanya memakai A-D.`)
      }
    }

    if (tipe === 'sebab_akibat') {
      if (isHtmlEmpty(soal.pilihan_a || '')) {
        errors.push(`Soal nomor ${nomor} belum memiliki bagian pernyataan.`)
      }

      if (isHtmlEmpty(soal.pilihan_b || '')) {
        errors.push(`Soal nomor ${nomor} belum memiliki bagian sebab.`)
      }

      if (!soal.jawaban_benar) {
        errors.push(`Soal nomor ${nomor} belum memiliki kunci jawaban.`)
      }
    }

    if (tipe === 'ganda_kompleks') {
      const pilihanTerisi = PILIHAN_WAJIB_LABELS.filter(label => !isHtmlEmpty(getChoiceText(soal, label)))

      if (pilihanTerisi.length < 4) {
        errors.push(`Soal nomor ${nomor} minimal harus memiliki pilihan A-D.`)
      }

      if (normalizeJawabanKompleks(soal.jawaban_benar_json).length === 0) {
        errors.push(`Soal nomor ${nomor} belum memiliki minimal satu jawaban benar.`)
      }
    }

    if (tipe === 'benar_salah') {
      const pernyataan = Array.isArray(soal.pernyataan_checklist)
        ? soal.pernyataan_checklist
        : []
      const jawaban = soal.jawaban_benar_json && typeof soal.jawaban_benar_json === 'object'
        ? soal.jawaban_benar_json
        : {}

      if (pernyataan.length === 0) {
        errors.push(`Soal nomor ${nomor} belum memiliki pernyataan benar-salah.`)
      }

      pernyataan.forEach((item, itemIndex) => {
        const teks = typeof item === 'string' ? item : item?.pernyataan
        const key = String(itemIndex)

        if (isHtmlEmpty(teks || '')) {
          errors.push(`Soal nomor ${nomor} memiliki pernyataan benar-salah kosong pada baris ${itemIndex + 1}.`)
        }

        if (!Object.prototype.hasOwnProperty.call(jawaban, key) || jawaban[key] === null || jawaban[key] === '') {
          errors.push(`Soal nomor ${nomor} belum memiliki jawaban benar/salah untuk baris ${itemIndex + 1}.`)
        }
      })
    }

    if (tipe === 'menjodohkan') {
      const pasangan = soal.pasangan_menjodohkan || {}
      const kiri = Array.isArray(pasangan.kolom_kiri) ? pasangan.kolom_kiri : []
      const kanan = Array.isArray(pasangan.kolom_kanan) ? pasangan.kolom_kanan : []
      const kunci = pasangan.kunci || {}

      if (kiri.length === 0 || kanan.length === 0) {
        errors.push(`Soal nomor ${nomor} belum memiliki pasangan menjodohkan.`)
      }

      kiri.forEach((item, itemIndex) => {
        if (isHtmlEmpty(item || '')) {
          errors.push(`Soal nomor ${nomor} memiliki item kiri kosong pada baris ${itemIndex + 1}.`)
        }

        if (!kunci[String(itemIndex)]) {
          errors.push(`Soal nomor ${nomor} belum memiliki kunci menjodohkan untuk baris ${itemIndex + 1}.`)
        }
      })
      kanan.forEach((item, itemIndex) => {
        const kananText = typeof item === 'string' ? item : item?.text

        if (isHtmlEmpty(kananText || '')) {
          errors.push(`Soal nomor ${nomor} memiliki pilihan kanan kosong pada opsi ${itemIndex + 1}.`)
        }
      })
    }
  })

  return errors
}

const updatePilihanImport = (index, label, value) => {
  setImportPreview(prev => prev.map((soal, i) => {
    if (i !== index) return soal
    const cleanedValue = stripChoicePrefix(value)

    return {
      ...soal,
      [`pilihan_${label.toLowerCase()}`]: cleanedValue,
      pilihan: soal.pilihan && !Array.isArray(soal.pilihan)
        ? { ...soal.pilihan, [label]: cleanedValue }
        : soal.pilihan
    }
  }))
}

const addChoiceImport = (index) => {
  setImportPreview(prev => prev.map((soal, i) => {
    if (i !== index) return soal
    return {
      ...soal,
      pilihan_e: soal.pilihan_e || '<p><br></p>'
    }
  }))
}

const removeChoiceImport = async (index, label) => {
  if (PILIHAN_WAJIB_LABELS.includes(label)) {
    updatePilihanImport(index, label, '')
    return
  }

  const ok = await confirmToast(
    `Pilihan ${label} akan dihapus dari preview soal.`,
    {
      title: 'Hapus pilihan?',
      confirmText: 'Hapus',
      cancelText: 'Batal',
      danger: true
    }
  )

  if (!ok) return

  setImportPreview(prev => prev.map((soal, i) => {
    if (i !== index) return soal
    const next = {
      ...soal,
      [`pilihan_${label.toLowerCase()}`]: ''
    }

    if (next.jawaban_benar === label) next.jawaban_benar = ''
    if (Array.isArray(next.jawaban_benar_json)) {
      next.jawaban_benar_json = next.jawaban_benar_json.filter(item => item !== label)
    }

    return next
  }))
}

const updateImportTipeSoal = async (index, tipeSoal) => {
  const currentType = importPreview[index]?.tipe_soal || 'pilihan_ganda'
  if (currentType === tipeSoal) return

  const ok = await confirmToast(
    'Data tipe soal sebelumnya mungkin perlu disesuaikan. Lanjutkan?',
    {
      title: 'Ubah tipe soal?',
      confirmText: 'Lanjutkan',
      cancelText: 'Batal'
    }
  )

  if (!ok) return

  setImportPreview(prev => prev.map((soal, i) => {
    if (i !== index) return soal
    return normalizeSoalForType(soal, tipeSoal)
  }))
}

const addManualImportSoal = () => {
  setImportPreview(prev => [
    ...prev,
    createManualImportSoal(prev.length + 1, importItem?.jenis)
  ])
  setImportTab('questions')
}

const copyImportText = async (text, label = 'Teks') => {
  const value = String(text || '').trim()

  if (!value) {
    toast.error(`${label} kosong.`)
    return
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = value
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }

    toast.success(`${label} disalin.`)
  } catch {
    toast.error(`Gagal menyalin ${label.toLowerCase()}.`)
  }
}

const updateGambarImport = (soalIndex, gambarIndex, field, value) => {
  setImportPreview(prev => prev.map((soal, i) => {
    if (i !== soalIndex) return soal

    const gambar = Array.isArray(soal.gambar) ? [...soal.gambar] : []
    const nextValue = field === 'ukuran'
      ? {
          ukuran: value,
          preview_height: UKURAN_GAMBAR_IMPORT[value] || 220
        }
      : { [field]: value }
    gambar[gambarIndex] = {
      ...(gambar[gambarIndex] || {}),
      ...nextValue
    }

    return { ...soal, gambar }
  }))
}

const uploadManualImportImage = async (soalIndex, file) => {
  if (!file || !importItem) return

  const fd = new FormData()
  fd.append('gambar', file)

  setImportError('')

  try {
    const res = await instrumenAPI.uploadImportWordImage(importItem.id, fd)
    const uploaded = res.data.data

    setImportPreview(prev => prev.map((soal, index) => {
      if (index !== soalIndex) return soal

      const gambar = Array.isArray(soal.gambar) ? [...soal.gambar] : []
      gambar.push(normalizeImportImage({
        src: uploaded.src,
        file_name: uploaded.file_name,
        source: 'manual',
        caption: '',
        ukuran: 'sedang',
        width: '75%',
        align: 'center'
      }))

      return { ...soal, gambar }
    }))

    clearQualityWarningsForQuestion(soalIndex, ['missing_images_warning'])
    toast.success('Gambar manual ditambahkan ke soal')
  } catch (err) {
    const message = err.response?.data?.message || 'Gagal upload gambar manual.'
    setImportError(message)
    toast.error(message)
  }
}

const removeGambarImport = async (soalIndex, gambarIndex) => {
  const ok = await confirmToast(
    'Gambar akan dihapus dari preview soal sebelum disimpan.',
    {
      title: 'Hapus gambar?',
      confirmText: 'Hapus',
      cancelText: 'Batal',
      danger: true
    }
  )

  if (!ok) return

  setImportPreview(prev => prev.map((soal, i) => {
    if (i !== soalIndex) return soal

    const gambar = Array.isArray(soal.gambar) ? soal.gambar : []

    return {
      ...soal,
      gambar: gambar.filter((_, idx) => idx !== gambarIndex)
    }
  }))

  toast.success('Gambar dihapus dari preview')
}

const moveGambarImport = (fromSoalIndex, gambarIndex, toSoalIndex) => {
  if (fromSoalIndex === toSoalIndex || toSoalIndex < 0) return

  setImportPreview(prev => {
    const next = prev.map(soal => ({
      ...soal,
      gambar: Array.isArray(soal.gambar) ? [...soal.gambar] : []
    }))

    const image = next[fromSoalIndex]?.gambar?.[gambarIndex]
    if (!image || !next[toSoalIndex]) return prev

    next[fromSoalIndex].gambar.splice(gambarIndex, 1)
    next[toSoalIndex].gambar.push({
      ...image,
      moved_from_nomor: next[fromSoalIndex].nomor || fromSoalIndex + 1
    })

    return next
  })

  clearQualityWarningsForQuestion(toSoalIndex, ['missing_images_warning'])
  toast.success(`Gambar dipindahkan ke soal ${importPreview[toSoalIndex]?.nomor || toSoalIndex + 1}`)
}

const setSupportingTablesImport = (soalIndex, tables) => {
  const normalized = tables.map((table, index) => normalizeSupportingTable(table, index))

  setImportPreview(prev => prev.map((soal, index) => (
    index === soalIndex
      ? { ...soal, supporting_tables: normalized, tabel_data: normalized }
      : soal
  )))
}

const addSupportingTableImport = (soalIndex) => {
  const soal = importPreview[soalIndex] || {}
  const tables = normalizeSupportingTables(soal)
  tables.push({
    source: 'manual',
    role: 'stimulus',
    caption: '',
    width: '100%',
    align: 'center',
    fontSize: '14px',
    rows: [['', ''], ['', '']]
  })
  setSupportingTablesImport(soalIndex, tables)
  clearQualityWarningsForQuestion(soalIndex, ['missing_tables_warning'])
}

const removeSupportingTableImport = (soalIndex, tableIndex) => {
  const tables = normalizeSupportingTables(importPreview[soalIndex] || {})
  setSupportingTablesImport(soalIndex, tables.filter((_, index) => index !== tableIndex))
}

const updateSupportingTableMeta = (soalIndex, tableIndex, field, value) => {
  const tables = normalizeSupportingTables(importPreview[soalIndex] || {})
  const table = tables[tableIndex]
  if (!table) return

  tables[tableIndex] = {
    ...table,
    [field]: value
  }
  setSupportingTablesImport(soalIndex, tables)
}

const updateSupportingTableCell = (soalIndex, tableIndex, rowIndex, colIndex, value) => {
  const tables = normalizeSupportingTables(importPreview[soalIndex] || {})
  const table = tables[tableIndex]
  if (!table) return

  const rows = table.rows.map(row => [...row])
  rows[rowIndex][colIndex] = value
  tables[tableIndex] = { ...table, rows }
  setSupportingTablesImport(soalIndex, tables)
}

const addSupportingTableRow = (soalIndex, tableIndex) => {
  const tables = normalizeSupportingTables(importPreview[soalIndex] || {})
  const table = tables[tableIndex]
  if (!table) return

  const colCount = Math.max(...table.rows.map(row => row.length), 2)
  tables[tableIndex] = {
    ...table,
    rows: [...table.rows, Array.from({ length: colCount }, () => '')]
  }
  setSupportingTablesImport(soalIndex, tables)
}

const removeSupportingTableRow = (soalIndex, tableIndex, rowIndex) => {
  const tables = normalizeSupportingTables(importPreview[soalIndex] || {})
  const table = tables[tableIndex]
  if (!table || table.rows.length <= 1) return

  tables[tableIndex] = {
    ...table,
    rows: table.rows.filter((_, index) => index !== rowIndex)
  }
  setSupportingTablesImport(soalIndex, tables)
}

const addSupportingTableColumn = (soalIndex, tableIndex) => {
  const tables = normalizeSupportingTables(importPreview[soalIndex] || {})
  const table = tables[tableIndex]
  if (!table) return

  tables[tableIndex] = {
    ...table,
    rows: table.rows.map(row => [...row, ''])
  }
  setSupportingTablesImport(soalIndex, tables)
}

const removeSupportingTableColumn = (soalIndex, tableIndex, colIndex) => {
  const tables = normalizeSupportingTables(importPreview[soalIndex] || {})
  const table = tables[tableIndex]
  if (!table || Math.max(...table.rows.map(row => row.length)) <= 1) return

  tables[tableIndex] = {
    ...table,
    rows: table.rows.map(row => row.filter((_, index) => index !== colIndex))
  }
  setSupportingTablesImport(soalIndex, tables)
}

const pasteTableIntoSupportingTable = (event, soalIndex, tableIndex, rowIndex, colIndex) => {
  const text = event.clipboardData?.getData('text/plain') || ''
  if (!text.includes('\t') && !text.includes('\n')) return

  event.preventDefault()

  const pastedRows = text
    .trim()
    .split(/\r?\n/)
    .map(row => row.split('\t'))
  const tables = normalizeSupportingTables(importPreview[soalIndex] || {})
  const table = tables[tableIndex]
  if (!table) return

  const rows = table.rows.map(row => [...row])
  pastedRows.forEach((pastedRow, pastedRowIndex) => {
    const targetRow = rowIndex + pastedRowIndex
    if (!rows[targetRow]) rows[targetRow] = Array.from({ length: rows[0]?.length || 2 }, () => '')

    pastedRow.forEach((cell, pastedColIndex) => {
      const targetCol = colIndex + pastedColIndex
      while (rows[targetRow].length <= targetCol) rows[targetRow].push('')
      rows[targetRow][targetCol] = cell
    })
  })

  const maxCols = Math.max(...rows.map(row => row.length))
  const normalizedRows = rows.map(row => {
    const next = [...row]
    while (next.length < maxCols) next.push('')
    return next
  })

  tables[tableIndex] = { ...table, rows: normalizedRows }
  setSupportingTablesImport(soalIndex, tables)
}

const scrollToManualSupport = (index) => {
  document.getElementById(`manual-support-${index}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  })
}

const updateBenarSalahText = (soalIndex, itemIndex, value) => {
  setImportPreview(prev => prev.map((soal, i) => {
    if (i !== soalIndex) return soal

    const pernyataan = Array.isArray(soal.pernyataan_checklist)
      ? [...soal.pernyataan_checklist]
      : []

    pernyataan[itemIndex] = value

    return {
      ...soal,
      pernyataan_checklist: pernyataan
    }
  }))
}

const addBenarSalahItem = (soalIndex) => {
  setImportPreview(prev => prev.map((soal, i) => {
    if (i !== soalIndex) return soal

    const pernyataan = Array.isArray(soal.pernyataan_checklist)
      ? [...soal.pernyataan_checklist]
      : []

    pernyataan.push('')

    return {
      ...soal,
      pernyataan_checklist: pernyataan
    }
  }))
}

const removeBenarSalahItem = (soalIndex, itemIndex) => {
  setImportPreview(prev => prev.map((soal, i) => {
    if (i !== soalIndex) return soal

    const pernyataan = Array.isArray(soal.pernyataan_checklist)
      ? [...soal.pernyataan_checklist]
      : []

    const jawabanLama = soal.jawaban_benar_json || {}
    const pernyataanBaru = pernyataan.filter((_, idx) => idx !== itemIndex)
    const jawabanBaru = {}

    pernyataanBaru.forEach((_, newIndex) => {
      const oldIndex = newIndex >= itemIndex ? newIndex + 1 : newIndex
      if (jawabanLama[String(oldIndex)] !== undefined) {
        jawabanBaru[String(newIndex)] = jawabanLama[String(oldIndex)]
      }
    })

    return {
      ...soal,
      pernyataan_checklist: pernyataanBaru,
      jawaban_benar_json: jawabanBaru
    }
  }))
}

const updateMenjodohkanKiri = (soalIndex, itemIndex, value) => {
  setImportPreview(prev => prev.map((soal, i) => {
    if (i !== soalIndex) return soal

    const pasangan = soal.pasangan_menjodohkan || {}
    const kolomKiri = Array.isArray(pasangan.kolom_kiri)
      ? [...pasangan.kolom_kiri]
      : []

    kolomKiri[itemIndex] = value

    return {
      ...soal,
      pasangan_menjodohkan: {
        ...pasangan,
        kolom_kiri: kolomKiri
      }
    }
  }))
}

const updateMenjodohkanKanan = (soalIndex, itemIndex, value) => {
  setImportPreview(prev => prev.map((soal, i) => {
    if (i !== soalIndex) return soal

    const pasangan = soal.pasangan_menjodohkan || {}
    const kolomKanan = Array.isArray(pasangan.kolom_kanan)
      ? [...pasangan.kolom_kanan]
      : []

    const oldItem = kolomKanan[itemIndex] || {}
    kolomKanan[itemIndex] = {
      label: oldItem.label || String.fromCharCode(97 + itemIndex),
      text: value
    }

    return {
      ...soal,
      pasangan_menjodohkan: {
        ...pasangan,
        kolom_kanan: kolomKanan
      }
    }
  }))
}

const addMenjodohkanKiri = (soalIndex) => {
  setImportPreview(prev => prev.map((soal, i) => {
    if (i !== soalIndex) return soal

    const pasangan = soal.pasangan_menjodohkan || {}
    const kolomKiri = Array.isArray(pasangan.kolom_kiri)
      ? [...pasangan.kolom_kiri]
      : []

    kolomKiri.push('')

    return {
      ...soal,
      pasangan_menjodohkan: {
        ...pasangan,
        kolom_kiri: kolomKiri,
        kolom_kanan: Array.isArray(pasangan.kolom_kanan) ? pasangan.kolom_kanan : [],
        kunci: pasangan.kunci || {}
      }
    }
  }))
}

const addMenjodohkanKanan = (soalIndex) => {
  setImportPreview(prev => prev.map((soal, i) => {
    if (i !== soalIndex) return soal

    const pasangan = soal.pasangan_menjodohkan || {}
    const kolomKanan = Array.isArray(pasangan.kolom_kanan)
      ? [...pasangan.kolom_kanan]
      : []

    kolomKanan.push({
      label: String.fromCharCode(97 + kolomKanan.length),
      text: ''
    })

    return {
      ...soal,
      pasangan_menjodohkan: {
        ...pasangan,
        kolom_kiri: Array.isArray(pasangan.kolom_kiri) ? pasangan.kolom_kiri : [],
        kolom_kanan: kolomKanan,
        kunci: pasangan.kunci || {}
      }
    }
  }))
}

const removeMenjodohkanKiri = (soalIndex, itemIndex) => {
  setImportPreview(prev => prev.map((soal, i) => {
    if (i !== soalIndex) return soal

    const pasangan = soal.pasangan_menjodohkan || {}
    const kolomKiri = Array.isArray(pasangan.kolom_kiri) ? pasangan.kolom_kiri : []
    const kunciLama = pasangan.kunci || {}
    const kunciBaru = {}

    kolomKiri
      .filter((_, idx) => idx !== itemIndex)
      .forEach((_, newIndex) => {
        const oldIndex = newIndex >= itemIndex ? newIndex + 1 : newIndex
        if (kunciLama[String(oldIndex)] !== undefined) {
          kunciBaru[String(newIndex)] = kunciLama[String(oldIndex)]
        }
      })

    return {
      ...soal,
      pasangan_menjodohkan: {
        ...pasangan,
        kolom_kiri: kolomKiri.filter((_, idx) => idx !== itemIndex),
        kunci: kunciBaru
      }
    }
  }))
}

const removeMenjodohkanKanan = (soalIndex, itemIndex) => {
  setImportPreview(prev => prev.map((soal, i) => {
    if (i !== soalIndex) return soal

    const pasangan = soal.pasangan_menjodohkan || {}
    const kolomKanan = Array.isArray(pasangan.kolom_kanan) ? pasangan.kolom_kanan : []
    const oldLabels = kolomKanan.map((item, idx) => item.label || String.fromCharCode(97 + idx))
    const removedLabel = oldLabels[itemIndex]
    const newLabelByOld = {}
    const kolomKananBaru = kolomKanan
      .filter((_, idx) => idx !== itemIndex)
      .map((item, idx) => {
        const oldIndex = idx >= itemIndex ? idx + 1 : idx
        const newLabel = String.fromCharCode(97 + idx)
        newLabelByOld[oldLabels[oldIndex]] = newLabel
        return { ...item, label: newLabel }
      })

    const kunciBaru = Object.entries(pasangan.kunci || {}).reduce((acc, [key, value]) => {
      if (value && value !== removedLabel && newLabelByOld[value]) {
        acc[key] = newLabelByOld[value]
      }
      return acc
    }, {})

    return {
      ...soal,
      pasangan_menjodohkan: {
        ...pasangan,
        kolom_kanan: kolomKananBaru,
        kunci: kunciBaru
      }
    }
  }))
}

const addMenjodohkanItem = (soalIndex) => {
  setImportPreview(prev => prev.map((soal, i) => {
    if (i !== soalIndex) return soal

    const pasangan = soal.pasangan_menjodohkan || {}
    const kolomKiri = Array.isArray(pasangan.kolom_kiri)
      ? [...pasangan.kolom_kiri]
      : []

    const kolomKanan = Array.isArray(pasangan.kolom_kanan)
      ? [...pasangan.kolom_kanan]
      : []

    const nextLabel = String.fromCharCode(97 + kolomKanan.length)

    kolomKiri.push('')
    kolomKanan.push({
      label: nextLabel,
      text: ''
    })

    return {
      ...soal,
      pasangan_menjodohkan: {
        ...pasangan,
        kolom_kiri: kolomKiri,
        kolom_kanan: kolomKanan,
        kunci: pasangan.kunci || {}
      }
    }
  }))
}

const removeMenjodohkanItem = (soalIndex, itemIndex) => {
  setImportPreview(prev => prev.map((soal, i) => {
    if (i !== soalIndex) return soal

    const pasangan = soal.pasangan_menjodohkan || {}
    const kolomKiri = Array.isArray(pasangan.kolom_kiri) ? pasangan.kolom_kiri : []
    const kolomKanan = Array.isArray(pasangan.kolom_kanan) ? pasangan.kolom_kanan : []
    const kunciLama = pasangan.kunci || {}

    const kolomKiriBaru = kolomKiri.filter((_, idx) => idx !== itemIndex)
    const kolomKananBaru = kolomKanan.filter((_, idx) => idx !== itemIndex)
      .map((item, idx) => ({
        ...item,
        label: String.fromCharCode(97 + idx)
      }))

    const kunciBaru = {}
    kolomKiriBaru.forEach((_, newIndex) => {
      const oldIndex = newIndex >= itemIndex ? newIndex + 1 : newIndex
      if (kunciLama[String(oldIndex)] !== undefined) {
        kunciBaru[String(newIndex)] = kunciLama[String(oldIndex)]
      }
    })

    return {
      ...soal,
      pasangan_menjodohkan: {
        ...pasangan,
        kolom_kiri: kolomKiriBaru,
        kolom_kanan: kolomKananBaru,
        kunci: kunciBaru
      }
    }
  }))
}
  const handlePreviewImportWord = async () => {
    if (!importItem) {
      const message = 'Instrumen belum dipilih.'
      setImportError(message)
      toast.error(message)
      return
    }

    if (!importFile) {
      const message = 'Silakan pilih file Word .docx terlebih dahulu.'
      setImportError(message)
      toast.error(message)
      return
    }

    const ext = importFile.name.split('.').pop()?.toLowerCase()
    if (ext !== 'docx') {
      const message = 'File harus berformat .docx.'
      setImportError(message)
      toast.error(message)
      return
    }

    const hadContentBeforePreview = hasImportSessionContent()
    if (hadContentBeforePreview) {
      writeImportDraft()
      const ok = await confirmToast(
        'Preview ulang akan mengganti draft soal yang sedang diedit. Lanjutkan?',
        {
          title: 'Preview ulang?',
          confirmText: 'Preview Ulang',
          cancelText: 'Batal',
          danger: true
        }
      )

      if (!ok) return
    }

    setImportLoading(true)
    setImportError('')
    setImportSuccess('')

    try {
      const fd = new FormData()
      fd.append('file', importFile)
      fd.append('target_soal', importItem.jumlah_soal || '')

      const res = await instrumenAPI.previewImportWord(importItem.id, fd)
      const payload = res.data.data

      setImportPreview(normalizeImportPreviewList(payload.soal_preview || []))
      setImportSummary({
        ...(payload.summary || {}),
        total_soal_terdeteksi: payload.total_soal_terdeteksi || 0,
        images: payload.images || [],
        nama_file: payload.summary?.nama_file || importFile.name
      })
      setImportDocument(payload.document_preview || {
        raw_html: payload.html_preview || '',
        raw_text: payload.text_preview || '',
        blocks: [],
        tables: [],
        images: payload.images || []
      })
      setParserInfo(payload.parser || null)
      setImportQualityReport(payload.import_quality_report || payload.parser?.import_quality_report || null)
      setImportTab('document')

      const successMessage = `Preview berhasil. ${payload.total_soal_terdeteksi || 0} soal terdeteksi dari Word.`
      setImportSuccess(successMessage)
      toast.success(successMessage)
    } catch (err) {
      const message = err.response?.data?.message || 'Gagal membaca file Word.'
      if (!hadContentBeforePreview) {
        setImportPreview([])
        setImportSummary(null)
        setImportDocument(null)
        setParserInfo(null)
        setImportQualityReport(null)
        setImportTab('document')
      }
      setImportError(message)
      toast.error(message)
    } finally {
      setImportLoading(false)
    }
  }

  const handlePreviewImportExcel = async () => {
    if (!importItem) {
      const message = 'Instrumen belum dipilih.'
      setImportError(message)
      toast.error(message)
      return
    }

    if (!importFile) {
      const message = 'Silakan pilih file Excel .xlsx terlebih dahulu.'
      setImportError(message)
      toast.error(message)
      return
    }

    const ext = importFile.name.split('.').pop()?.toLowerCase()
    if (ext !== 'xlsx') {
      const message = 'File harus berformat .xlsx.'
      setImportError(message)
      toast.error(message)
      return
    }

    const hadContentBeforePreview = hasImportSessionContent()
    if (hadContentBeforePreview) {
      writeImportDraft()
      const ok = await confirmToast(
        'Preview ulang akan mengganti draft soal yang sedang diedit. Lanjutkan?',
        {
          title: 'Preview ulang?',
          confirmText: 'Preview Ulang',
          cancelText: 'Batal',
          danger: true
        }
      )

      if (!ok) return
    }

    setImportLoading(true)
    setImportError('')
    setImportSuccess('')

    try {
      const fd = new FormData()
      fd.append('file', importFile)
      fd.append('target_soal', importItem.jumlah_soal || '')

      const res = await instrumenAPI.previewImportExcel(importItem.id, fd)
      const payload = res.data.data

      setImportPreview(normalizeImportPreviewList(payload.soal_preview || []))
      setImportSummary({
        ...(payload.summary || {}),
        total_soal_terdeteksi: payload.total_soal_terdeteksi || 0,
        images: [],
        nama_file: payload.summary?.nama_file || importFile.name
      })
      setImportDocument(payload.document_preview || {
        source: 'excel',
        raw_html: '',
        raw_text: '',
        blocks: [],
        tables: [],
        images: []
      })
      setParserInfo(payload.parser || null)
      setImportQualityReport(payload.import_quality_report || payload.parser?.import_quality_report || null)
      setImportTab('questions')

      const totalErrors = payload.errors?.length || 0
      const totalWarnings = payload.warnings?.length || 0
      const successMessage = totalErrors > 0
        ? `Preview Excel berhasil. ${payload.total_soal_terdeteksi || 0} soal terdeteksi, ${totalErrors} error perlu dicek.`
        : `Preview Excel berhasil. ${payload.total_soal_terdeteksi || 0} soal terdeteksi${totalWarnings ? `, ${totalWarnings} warning` : ''}.`
      setImportSuccess(successMessage)
      toast.success(successMessage)
    } catch (err) {
      const message = err.response?.data?.message || 'Gagal membaca file Excel.'
      if (!hadContentBeforePreview) {
        setImportPreview([])
        setImportSummary(null)
        setImportDocument(null)
        setParserInfo(null)
        setImportQualityReport(null)
        setImportTab('document')
      }
      setImportError(message)
      toast.error(message)
    } finally {
      setImportLoading(false)
    }
  }

  const handleSaveImportWord = async () => {
    if (!importItem) {
      const message = 'Instrumen belum dipilih.'
      setImportError(message)
      toast.error(message)
      return
    }

    if (importPreview.length === 0) {
      const message = 'Belum ada data preview soal untuk disimpan.'
      setImportError(message)
      toast.error(message)
      return
    }

    const normalizedPreview = buildSaveImportPayload(importPreview)
    const validationErrors = validateImportPreview(normalizedPreview)
    if (validationErrors.length > 0) {
      const message = validationErrors.slice(0, 5).join(' ')
      setImportError(message)
      toast.error(message)
      setImportTab('questions')
      return
    }

    const ok = await confirmToast(
      `Simpan ${importPreview.length} soal ke instrumen "${importItem.judul}"?`,
      {
        title: 'Simpan hasil import?',
        confirmText: 'Simpan',
        cancelText: 'Batal'
      }
    )

    if (!ok) return

    setImportSaving(true)
    setImportError('')
    setImportSuccess('')
    setImportPreview(normalizedPreview)

    try {
      const res = await instrumenAPI.saveImportWord(importItem.id, {
        soal_preview: normalizedPreview
      })

      setImportSuccess(res.data.message || 'Soal berhasil disimpan.')
      toast.success(`${res.data.data?.total_disimpan || importPreview.length} soal berhasil disimpan`)
      clearImportDraft(importItem.id, importMode)

      setShowImportModal(false)
      setImportItem(null)
      resetImportSession('word')
      fetchData(pagination.page)
    } catch (err) {
      const message = err.response?.data?.message || 'Gagal menyimpan soal hasil import Word.'
      if (err.response?.data?.import_quality_report) {
        setImportQualityReport(err.response.data.import_quality_report)
      }
      setImportError(message)
      toast.error(message)
    } finally {
      setImportSaving(false)
    }
  }

  const getFlexAlign = (align = 'center') => {
    if (align === 'left') return 'flex-start'
    if (align === 'right') return 'flex-end'
    return 'center'
  }

  const renderImportImagesForStudent = (gambarList = []) => {
    if (!Array.isArray(gambarList) || gambarList.length === 0) return null

    return (
      <div style={{ display: 'grid', gap: 12, marginBottom: 14 }}>
        {gambarList.map((g, imageIndex) => {
          const width = IMAGE_WIDTH_OPTIONS.includes(g.width) ? g.width : '75%'
          const size = g.ukuran || 'sedang'
          const maxHeight = UKURAN_GAMBAR_IMPORT[size] || 220

          return (
            <div
              key={imageIndex}
              style={{
                display: 'flex',
                justifyContent: getFlexAlign(g.align),
                width: '100%'
              }}
            >
              <figure style={{ width, maxWidth: '100%', margin: 0 }}>
                {(g.caption || g.alt) && (
                  <figcaption style={{ marginBottom: 6, fontSize: 12, color: '#64748B', textAlign: g.align || 'center' }}>
                    {g.caption || g.alt}
                  </figcaption>
                )}
                <img
                  src={toAssetUrl(g.src)}
                  alt={g.alt || g.caption || 'Gambar soal'}
                  style={{
                    width: '100%',
                    maxHeight,
                    objectFit: 'contain',
                    borderRadius: 8,
                    border: '1px solid #E2E8F0',
                    background: '#fff'
                  }}
                />
              </figure>
            </div>
          )
        })}
      </div>
    )
  }

  const renderImportTablesForStudent = (tables = []) => {
    if (!Array.isArray(tables) || tables.length === 0) return null

    return (
      <div style={{ display: 'grid', gap: 12, marginBottom: 14 }}>
        {tables.map((table, tableIndex) => {
          const rows = Array.isArray(table.rows) ? table.rows : []
          if (rows.length === 0) return null

          const colCount = Math.max(1, ...rows.map(row => row.length))
          const width = TABLE_WIDTH_OPTIONS.includes(table.width) ? table.width : '100%'
          const fontSize = TABLE_FONT_SIZE_OPTIONS.includes(table.fontSize) ? table.fontSize : '14px'

          return (
            <div
              key={tableIndex}
              style={{
                display: 'flex',
                justifyContent: getFlexAlign(table.align),
                overflowX: 'auto'
              }}
            >
              <figure style={{ width, maxWidth: '100%', margin: 0 }}>
                {table.caption && (
                  <figcaption style={{ marginBottom: 6, fontSize: 12, color: '#64748B', textAlign: table.align || 'center' }}>
                    {table.caption}
                  </figcaption>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize }}>
                  <tbody>
                    {rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {Array.from({ length: colCount }).map((_, cellIndex) => (
                          <td
                            key={cellIndex}
                            style={{
                              border: '1px solid #CBD5E1',
                              padding: 8,
                              verticalAlign: 'top',
                              background: rowIndex === 0 ? '#F8FAFC' : '#FFFFFF',
                              fontWeight: rowIndex === 0 ? 700 : 400
                            }}
                          >
                            {renderSafeHtml(row[cellIndex] || '', { fontSize })}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </figure>
            </div>
          )
        })}
      </div>
    )
  }

  const renderImportLayoutBlockForStudent = (soal = {}, blockType = '') => {
    const tables = normalizeSupportingTables(soal)
    const gambarList = Array.isArray(soal.gambar)
      ? soal.gambar
      : (Array.isArray(getLayoutMetadata(soal)?.gambar) ? getLayoutMetadata(soal).gambar : [])

    if (blockType === 'question') {
      return (
        <div style={{ minWidth: 0 }}>
          {renderSafeHtml(soal.pertanyaan || '', { fallback: 'Pertanyaan belum diisi.' })}
        </div>
      )
    }

    if (blockType === 'stimulus' && soal.stimulus_tambahan) {
      return (
        <div style={{ padding: 12, borderRadius: 8, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          {renderSafeHtml(soal.stimulus_tambahan)}
        </div>
      )
    }

    if (blockType === 'image') return renderImportImagesForStudent(gambarList)
    if (blockType === 'table') return renderImportTablesForStudent(tables)

    return null
  }

  const renderStudentQuestionPreview = (soal = {}) => {
    const layoutBlocks = buildQuestionLayoutBlocks(soal)

    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: '#E5E7EB',
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: '0 0 auto',
              fontWeight: 700
            }}
          >
            {soal.nomor || studentPreviewIndex + 1}
          </div>
          <div style={{ minWidth: 0, flex: 1, display: 'grid', gap: 14 }}>
            {layoutBlocks.map((block) => (
              <div key={block.type}>
                {renderImportLayoutBlockForStudent(soal, block.type)}
              </div>
            ))}
          </div>
        </div>

        {soal.tipe_soal === 'pilihan_ganda' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {getVisibleChoiceLabels(soal).map(label => (
              isHtmlEmpty(getChoiceText(soal, label)) ? null : (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: 8, padding: 10, border: '1px solid #E5E7EB', borderRadius: 8 }}>
                  <strong>{label}.</strong>
                  {renderSafeHtml(getChoiceText(soal, label))}
                </div>
              )
            ))}
          </div>
        )}

        {soal.tipe_soal === 'ganda_kompleks' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {getVisibleChoiceLabels(soal).map(label => (
              isHtmlEmpty(getChoiceText(soal, label)) ? null : (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: 8, padding: 10, border: '1px solid #E5E7EB', borderRadius: 8 }}>
                  <strong>{label}.</strong>
                  {renderSafeHtml(getChoiceText(soal, label))}
                </div>
              )
            ))}
          </div>
        )}

        {soal.tipe_soal === 'sebab_akibat' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ padding: 12, borderRadius: 8, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Pernyataan</div>
              {renderSafeHtml(soal.pilihan_a || '', { fallback: '-' })}
              <div style={{ fontWeight: 700, marginTop: 10, marginBottom: 4 }}>Sebab</div>
              {renderSafeHtml(soal.pilihan_b || '', { fallback: '-' })}
            </div>
            <select className="input" disabled value="">
              <option>-- Pilih jawaban --</option>
              <option>A. Pernyataan benar, alasan benar, berhubungan</option>
              <option>B. Pernyataan benar, alasan benar, tidak berhubungan</option>
              <option>C. Pernyataan benar, alasan salah</option>
              <option>D. Pernyataan salah, alasan benar</option>
            </select>
          </div>
        )}

        {soal.tipe_soal === 'benar_salah' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: 8, border: '1px solid #E5E7EB', background: '#F8FAFC' }}>No</th>
                <th style={{ padding: 8, border: '1px solid #E5E7EB', background: '#F8FAFC' }}>Pernyataan</th>
                <th style={{ padding: 8, border: '1px solid #E5E7EB', background: '#F8FAFC' }}>Benar</th>
                <th style={{ padding: 8, border: '1px solid #E5E7EB', background: '#F8FAFC' }}>Salah</th>
              </tr>
            </thead>
            <tbody>
              {(soal.pernyataan_checklist || []).map((item, itemIndex) => (
                <tr key={itemIndex}>
                  <td style={{ padding: 8, border: '1px solid #E5E7EB', textAlign: 'center' }}>{itemIndex + 1}</td>
                  <td style={{ padding: 8, border: '1px solid #E5E7EB' }}>
                    {renderSafeHtml(typeof item === 'string' ? item : item?.pernyataan || '')}
                  </td>
                  <td style={{ padding: 8, border: '1px solid #E5E7EB', textAlign: 'center' }}><input type="radio" disabled /></td>
                  <td style={{ padding: 8, border: '1px solid #E5E7EB', textAlign: 'center' }}><input type="radio" disabled /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {soal.tipe_soal === 'menjodohkan' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Pernyataan</div>
                {(soal.pasangan_menjodohkan?.kolom_kiri || []).map((item, itemIndex) => (
                  <div key={itemIndex} style={{ padding: 8, borderBottom: '1px solid #E5E7EB' }}>
                    <strong>{itemIndex + 1}.</strong> {renderSafeHtml(item)}
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Pilihan Jawaban</div>
                {(soal.pasangan_menjodohkan?.kolom_kanan || []).map((item, itemIndex) => (
                  <div key={itemIndex} style={{ padding: 8, borderBottom: '1px solid #E5E7EB' }}>
                    <strong>{item.label || String.fromCharCode(97 + itemIndex)}.</strong> {renderSafeHtml(item.text || '')}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const handleSave = async () => {
    if (!form.judul.trim() || !form.mata_pelajaran) {
      setError('Judul dan mata pelajaran wajib diisi, dan kelas wajib di isi.')
      return
    }
    
    if (form.gunakan_batas_waktu === 1 && !form.batas_waktu) {
      setError('Silakan pilih tanggal dan waktu batas pengerjaan.')
      return
    }
    
    setSaving(true)
    setError('')
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          fd.append(k, v)
        }
      })
      if (file) fd.append('file', file)

      if (editItem) {
        await instrumenAPI.update(editItem.id, fd)
        toast.success('Instrumen berhasil diperbarui')
      } else {
        await instrumenAPI.create(fd)
        toast.success('Instrumen berhasil ditambahkan')
      }
      setShowModal(false)
      fetchData(pagination.page)
    } catch (err) {
      const message = err.response?.data?.message || 'Gagal menyimpan instrumen.'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const handleDuplicateInstrument = async () => {
    if (!duplicateItem) return

    const kelasTujuan = String(duplicateForm.kelas_tujuan || '').trim()
    const judulBaru = String(duplicateForm.judul_baru || '').trim() || buildDuplicateTitle(duplicateItem, kelasTujuan)

    if (!kelasTujuan) {
      setDuplicateWarning('Kelas tujuan wajib diisi.')
      toast.error('Kelas tujuan wajib diisi.')
      return
    }

    if (normalizeKelasValue(kelasTujuan) === normalizeKelasValue(duplicateItem.kelas)) {
      setDuplicateWarning('Kelas tujuan tidak boleh sama dengan kelas asal.')
      toast.error('Kelas tujuan tidak boleh sama dengan kelas asal.')
      return
    }

    let similarInstrument = findSimilarDuplicateInstrument({
      ...duplicateForm,
      kelas_tujuan: kelasTujuan,
      judul_baru: judulBaru
    })

    if (!similarInstrument) {
      try {
        const checkRes = await instrumenAPI.getAll({
          page: 1,
          limit: 20,
          kelas: kelasTujuan,
          search: judulBaru
        })
        similarInstrument = (checkRes.data.data || []).find(item => (
          Number(item.id) !== Number(duplicateItem.id) &&
          normalizeKelasValue(item.kelas) === normalizeKelasValue(kelasTujuan) &&
          String(item.judul || '').trim().toLowerCase() === judulBaru.toLowerCase()
        )) || null
      } catch {
        similarInstrument = null
      }
    }

    if (similarInstrument) {
      const message = 'Instrumen dengan judul dan kelas yang sama sudah ada.'
      setDuplicateWarning(message)
      toast.error(message)
      return
    }

    setDuplicateSaving(true)
    setDuplicateWarning('')

    try {
      const res = await instrumenAPI.duplicateToClass(duplicateItem.id, {
        kelas_tujuan: kelasTujuan,
        judul_baru: judulBaru,
        status: duplicateForm.status,
        acak_soal: duplicateForm.acak_soal
      })

      toast.success(res.data.message || 'Instrumen berhasil digunakan untuk kelas lain')

      if (res.data.data?.warning) {
        toast(res.data.data.warning)
      }

      setShowDuplicateModal(false)
      setDuplicateItem(null)
      setDuplicateForm(emptyDuplicateForm)
      fetchData(1)
    } catch (err) {
      const message = err.response?.data?.message || 'Gagal menggunakan instrumen untuk kelas lain.'
      setDuplicateWarning(message)
      toast.error(message)
    } finally {
      setDuplicateSaving(false)
    }
  }

  const handleDelete = async (id) => {
    const ok = await confirmToast(
      'Instrumen yang dihapus tidak dapat dikembalikan. Lanjutkan?',
      {
        title: 'Hapus instrumen?',
        confirmText: 'Ya, hapus',
        cancelText: 'Batal',
        danger: true
      }
    )

    if (!ok) return

    try {
      await instrumenAPI.delete(id)
      toast.success('Instrumen berhasil dihapus')
      fetchData(pagination.page)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menghapus instrumen')
    }
  }

  const handleDownload = async (item) => {
    if (!item.file_path) {
      toast.error('File tidak tersedia')
      return
    }

    try {
      const res = await instrumenAPI.download(item.id)
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = item.file_nama || 'instrumen.pdf'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('File berhasil diunduh')
    } catch {
      toast.error('Gagal mengunduh file')
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    fetchData(1)
  }

  const visibleAktif = items.filter(item => item.status === 'aktif').length
  const visibleDraft = items.filter(item => item.status === 'draft').length
  const pageInfo = pagination.totalPages > 1
    ? `Halaman ${pagination.page} dari ${pagination.totalPages}`
    : `${pagination.total || items.length} instrumen`

  return (
    <div className="instrumen-page">

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-title">
              {editItem ? 'Edit instrumen' : 'Tambah instrumen baru'}
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              <input
                className="input"
                placeholder="Judul"
                value={form.judul}
                onChange={e => setFormField('judul', e.target.value)}
              />

              <textarea
                className="input"
                placeholder="Deskripsi"
                value={form.deskripsi}
                onChange={e => setFormField('deskripsi', e.target.value)}
              />

              <select
                className="input"
                value={form.jenis}
                onChange={e => setFormField('jenis', e.target.value)}
              >
                <option>HOTS</option>
                <option>Literasi</option>
                <option>Numerasi</option>
              </select>

              <select
                className="input"
                value={form.mata_pelajaran}
                onChange={e => setFormField('mata_pelajaran', e.target.value)}
              >
                <option value="">Pilih Mapel</option>
                {MAPEL.map(m => <option key={m}>{m}</option>)}
              </select>

              <select
                className="input"
                value={form.kelas}
                onChange={e => setFormField('kelas', e.target.value)}
              >
                <option value="">Pilih Kelas</option>
                {KELAS.map(k => <option key={k}>{k}</option>)}
              </select>

              <input
                type="number"
                className="input"
                placeholder="Jumlah Soal"
                value={form.jumlah_soal}
                onChange={e => setFormField('jumlah_soal', e.target.value)}
              />

              <input
                type="number"
                className="input"
                placeholder="Durasi ujian (menit)"
                value={form.durasi_menit}
                onChange={e => setFormField('durasi_menit', e.target.value)}
                min="5"
                max="180"
              />

              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 12,
                padding: '8px 0',
                borderTop: '1px solid #e2e8f0',
                borderBottom: '1px solid #e2e8f0'
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.gunakan_batas_waktu === 1}
                    onChange={(e) => setFormField('gunakan_batas_waktu', e.target.checked ? 1 : 0)}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: 500 }}>Aktifkan batas waktu pengerjaan</span>
                </label>
                {form.gunakan_batas_waktu === 1 && (
                  <span style={{ fontSize: 12, color: '#666' }}>
                    (siswa tidak bisa mengerjakan setelah waktu habis)
                  </span>
                )}
              </div>

              {form.gunakan_batas_waktu === 1 && (
                <div style={{ marginLeft: 26 }}>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: '#333' }}>
                    Batas waktu (tenggat)
                  </label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={form.batas_waktu}
                    onChange={(e) => setFormField('batas_waktu', e.target.value)}
                    style={{ width: '100%' }}
                  />
                  <small style={{ fontSize: 11, color: '#666' }}>
                    Contoh: 2026-05-15 23:59 (siswa tidak bisa mengerjakan setelah tanggal & waktu ini)
                  </small>
                </div>
              )}

              <select
                className="input"
                value={form.status}
                onChange={e => setFormField('status', e.target.value)}
              >
                {STATUS.map(s => <option key={s}>{s}</option>)}
              </select>

              <input
                type="file"
                onChange={e => setFile(e.target.files[0])}
              />

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>

                <button className="btn" onClick={() => setShowModal(false)}>
                  Batal
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ========== TAMBAHAN: MODAL EDIT BATAS WAKTU ========== */}
      {showBatasWaktuModal && editBatasWaktuItem && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowBatasWaktuModal(false)}>
          <div className="modal" style={{ maxWidth: 450 }}>
            <div className="modal-title">
              Edit Batas Waktu
            </div>
            
            <div style={{ marginBottom: 12, padding: 8, background: '#FEF3C7', borderRadius: 8, fontSize: 13 }}>
              Instrumen: <strong>{editBatasWaktuItem.judul}</strong>
              <br />
              Catatan: Anda hanya bisa mengedit batas waktu, bukan soal.
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editBatasWaktuForm.gunakan_batas_waktu === 1}
                  onChange={(e) => setEditBatasWaktuForm(prev => ({ 
                    ...prev, 
                    gunakan_batas_waktu: e.target.checked ? 1 : 0,
                    batas_waktu: e.target.checked ? prev.batas_waktu : ''
                  }))}
                  style={{ width: 18, height: 18 }}
                />
                <span>Aktifkan batas waktu pengerjaan</span>
              </label>

              {editBatasWaktuForm.gunakan_batas_waktu === 1 && (
                <div>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Batas waktu (tenggat)</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={editBatasWaktuForm.batas_waktu}
                    onChange={(e) => setEditBatasWaktuForm(prev => ({ ...prev, batas_waktu: e.target.value }))}
                    style={{ width: '100%' }}
                  />
                  <small style={{ fontSize: 11, color: '#666' }}>
                    Siswa tidak bisa mengerjakan setelah tanggal & waktu ini
                  </small>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button className="btn btn-primary" onClick={handleSaveBatasWaktu} disabled={saving}>
                  {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
                <button className="btn" onClick={() => setShowBatasWaktuModal(false)}>
                  Batal
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {showDuplicateModal && duplicateItem && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeDuplicateInstrument()}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-title">Gunakan Instrumen untuk Kelas Lain</div>

            <div
              style={{
                marginBottom: 12,
                padding: 12,
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                borderRadius: 10,
                fontSize: 13,
                color: '#1D4ED8'
              }}
            >
              <div><strong>Instrumen asal:</strong> {duplicateItem.judul}</div>
              <div><strong>Kelas asal:</strong> {duplicateItem.kelas || '-'}</div>
              <div><strong>Jumlah soal:</strong> {duplicateItem.jumlah_soal_terisi ?? duplicateItem.jumlah_soal ?? '-'} soal</div>
            </div>

            {duplicateWarning && (
              <div
                className={duplicateWarning === 'Instrumen serupa sudah ada untuk kelas ini.' ? 'alert' : 'alert alert-error'}
                style={duplicateWarning === 'Instrumen serupa sudah ada untuk kelas ini.'
                  ? { background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }
                  : undefined}
              >
                {duplicateWarning}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label className="form-label">Instrumen asal</label>
                <input className="input" value={duplicateItem.judul || ''} disabled />
              </div>

              <div>
                <label className="form-label">Kelas tujuan</label>
                <select
                  className="input"
                  value={duplicateForm.kelas_tujuan}
                  onChange={e => setDuplicateFormField('kelas_tujuan', e.target.value)}
                >
                  <option value="">Pilih Kelas</option>
                  {KELAS.map(kelas => (
                    <option key={kelas} value={kelas}>{kelas}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Judul baru</label>
                <input
                  className="input"
                  value={duplicateForm.judul_baru}
                  onChange={e => setDuplicateFormField('judul_baru', e.target.value)}
                  placeholder="Judul instrumen salinan"
                />
              </div>

              <div>
                <label className="form-label">Status awal</label>
                <select
                  className="input"
                  value={duplicateForm.status}
                  onChange={e => setDuplicateFormField('status', e.target.value)}
                >
                  <option value="draft">draft</option>
                  <option value="aktif">aktif</option>
                </select>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={duplicateForm.acak_soal}
                  onChange={e => setDuplicateFormField('acak_soal', e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                <span>Acak urutan soal</span>
              </label>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn" onClick={closeDuplicateInstrument} disabled={duplicateSaving}>
                  Batal
                </button>
                <button className="btn btn-primary" onClick={handleDuplicateInstrument} disabled={duplicateSaving}>
                  {duplicateSaving ? 'Menyimpan...' : 'Gunakan untuk Kelas Lain'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

     {/* ========== TAMBAHAN: MODAL IMPORT WORD / EXCEL ========== */}
{showImportModal && importItem && (
  <div className="modal-overlay">
    <div
      className="modal"
      style={{
        maxWidth: 1200,
        width: '96%',
        maxHeight: '92vh',
        overflowY: 'auto'
      }}
    >
      <div className="modal-title">
        {importMode === 'excel' ? 'Import Soal dari Excel' : 'Import Soal dari Word'}
      </div>

      <div
        style={{
          marginBottom: 12,
          padding: 12,
          background: '#EFF6FF',
          border: '1px solid #BFDBFE',
          borderRadius: 10,
          fontSize: 13,
          color: '#1D4ED8'
        }}
      >
        <div><strong>Instrumen:</strong> {importItem.judul}</div>
        <div><strong>Kelas:</strong> {importItem.kelas || '-'}</div>
        <div><strong>Target soal:</strong> {importItem.jumlah_soal || '-'} soal</div>

        {importItem.jumlah_soal_terisi > 0 && (
          <div style={{ marginTop: 6, color: '#B45309' }}>
            Instrumen ini sudah memiliki {importItem.jumlah_soal_terisi} soal.
            Jika ingin import ulang, reset/hapus soal lama dulu agar tidak dobel.
          </div>
        )}
      </div>

      {importError && <div className="alert alert-error">{importError}</div>}

      {importSuccess && (
        <div
          className="alert"
          style={{
            background: '#DCFCE7',
            color: '#166534',
            border: '1px solid #BBF7D0'
          }}
        >
          {importSuccess}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 14
        }}
      >
        <input
          ref={importFileInputRef}
          type="file"
          accept={importMode === 'excel' ? '.xlsx' : '.docx'}
          onChange={handleImportFileChange}
        />

        <button
          className="btn btn-primary"
          onClick={importMode === 'excel' ? handlePreviewImportExcel : handlePreviewImportWord}
          disabled={importLoading || importSaving || importMode === 'excel'}
          title={importMode === 'excel' ? 'Import Excel masih tahap eksperimen. Gunakan Import Word untuk saat ini.' : ''}
        >
          {importLoading
            ? (importMode === 'excel' ? 'Membaca Excel...' : 'Membaca Word...')
            : (importMode === 'excel' ? 'Preview Excel (Eksperimen)' : 'Preview Word')}
        </button>

        <button
          className="btn"
          onClick={closeImportWord}
          disabled={importLoading || importSaving}
        >
          Tutup
        </button>
      </div>


      {(importSummary || parserInfo) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{ padding: '6px 10px', background: '#F8FAFC', borderRadius: 8, fontSize: 12 }}>
            File: {importSummary?.nama_file || importFile?.name || '-'}
          </span>
          <span style={{ padding: '6px 10px', background: '#F8FAFC', borderRadius: 8, fontSize: 12 }}>
            {importSummary?.total_soal_terdeteksi || 0} soal terdeteksi
          </span>
          {parserInfo && (
            <span style={{ padding: '6px 10px', background: '#F8FAFC', borderRadius: 8, fontSize: 12 }}>
              Parser: {parserInfo.status} ({Math.round(Number(parserInfo.confidence || 0) * 100)}%)
            </span>
          )}
          <span style={{ padding: '6px 10px', background: '#F8FAFC', borderRadius: 8, fontSize: 12 }}>
            {importMode === 'excel' ? `${importSummary?.sheet_counts?.MEDIA || 0} baris media` : `${importSummary?.jumlah_gambar || 0} gambar`}
          </span>
          <span style={{ padding: '6px 10px', background: '#F8FAFC', borderRadius: 8, fontSize: 12 }}>
            {importMode === 'excel' ? `${importSummary?.sheet_counts?.TABEL_PENDUKUNG || 0} baris tabel` : `${importSummary?.jumlah_tabel || 0} tabel`}
          </span>
          <span
            style={{
              padding: '6px 10px',
              background: getMissingKeyList().length > 0 ? '#FEF3C7' : '#DCFCE7',
              borderRadius: 8,
              fontSize: 12
            }}
          >
            {getMissingKeyList().length > 0
              ? `${getMissingKeyList().length} kunci belum lengkap`
              : 'Kunci lengkap'}
          </span>
          {importQualityReport && (
            <span
              style={{
                padding: '6px 10px',
                background: getQualityWarningCount(importQualityReport) > 0 ? '#FEF3C7' : '#DCFCE7',
                borderRadius: 8,
                fontSize: 12
              }}
            >
              {getQualityWarningCount(importQualityReport) > 0
                ? `${getQualityWarningCount(importQualityReport)} warning import`
                : 'Mapping media aman'}
            </span>
          )}
          <span style={{ padding: '6px 10px', background: '#F8FAFC', borderRadius: 8, fontSize: 12 }}>
            {importMode === 'excel' ? 'Template Excel SMIASB' : 'Dokumen penuh tersedia di preview Word'}
          </span>
        </div>
      )}

      {importQualityReport && (
        getQualityWarningCount(importQualityReport) > 0 ||
        getQualityCount(importQualityReport, 'empty_options') > 0 ||
        getQualityCount(importQualityReport, 'empty_keys') > 0 ||
        getQualityCount(importQualityReport, 'save_blocked_reasons') > 0
      ) && (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 10,
            background: getQualityCount(importQualityReport, 'save_blocked_reasons') > 0 ? '#FEF2F2' : '#FFF7ED',
            border: getQualityCount(importQualityReport, 'save_blocked_reasons') > 0 ? '1px solid #FECACA' : '1px solid #FED7AA',
            color: getQualityCount(importQualityReport, 'save_blocked_reasons') > 0 ? '#991B1B' : '#9A3412',
            fontSize: 13,
            lineHeight: 1.6
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Laporan Kualitas Import</div>
          <div>
            Target {importQualityReport.total_soal_target || '-'} soal, terdeteksi {importQualityReport.total_soal_detected || 0} soal.
            {' '}Warning media/tabel: {getQualityWarningCount(importQualityReport)}.
            {' '}Opsi kosong: {getQualityCount(importQualityReport, 'empty_options')}.
            {' '}Kunci kosong: {getQualityCount(importQualityReport, 'empty_keys')}.
          </div>
          {(getQualityWarningCount(importQualityReport) > 0 || getQualityCount(importQualityReport, 'empty_options') > 0 || getQualityCount(importQualityReport, 'empty_keys') > 0) && (
            <div style={{ marginTop: 6 }}>
              Ada bagian yang perlu dilengkapi manual sebelum disimpan.
            </div>
          )}
          {getQualityCount(importQualityReport, 'save_blocked_reasons') > 0 && (
            <div style={{ marginTop: 6 }}>
              Save diblokir: {importQualityReport.save_blocked_reasons.slice(0, 3).join(' ')}
            </div>
          )}
        </div>
      )}

      {importMode === 'excel' && importQualityReport && (
        (
          (importQualityReport.validation_errors || []).length > 0 ||
          (importQualityReport.validation_warnings || []).length > 0
        ) && (
          <div
            style={{
              marginBottom: 14,
              padding: 12,
              borderRadius: 10,
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              color: '#334155',
              fontSize: 13,
              lineHeight: 1.6
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Validasi Excel</div>
            {(importQualityReport.validation_errors || []).slice(0, 8).map((item, index) => (
              <div key={`excel-error-${index}`} style={{ color: '#991B1B' }}>
                {item.message || item}
              </div>
            ))}
            {(importQualityReport.validation_warnings || []).slice(0, 5).map((item, index) => (
              <div key={`excel-warning-${index}`} style={{ color: '#9A3412' }}>
                {item.message || item}
              </div>
            ))}
          </div>
        )
      )}

      {import.meta.env.DEV && parserInfo?.debug && (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 10,
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            color: '#334155',
            fontSize: 12,
            lineHeight: 1.6
          }}
        >
          <div><strong>Debug parser:</strong> {parserInfo.debug.strategy || parserInfo.strategy || '-'}</div>
          <div>Target: {parserInfo.debug.target_soal || '-'} soal</div>
          <div>Segment: {parserInfo.debug.total_segments ?? parserInfo.total_detected ?? 0}</div>
          <div>Nomor ditemukan: {(parserInfo.debug.segment_numbers || []).join(', ') || '-'}</div>
          {Array.isArray(parserInfo.debug.warnings) && parserInfo.debug.warnings.length > 0 && (
            <div>Warning: {parserInfo.debug.warnings.join(' ')}</div>
          )}
        </div>
      )}

      {(importDocument || importPreview.length > 0) && (
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #E5E7EB', marginBottom: 14 }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setImportTab('document')}
            style={{
              borderRadius: 0,
              border: 'none',
              borderBottom: importTab === 'document' ? '2px solid #2563EB' : '2px solid transparent',
              background: 'transparent',
              color: importTab === 'document' ? '#2563EB' : '#475569'
            }}
          >
            {importMode === 'excel' ? 'Ringkasan Excel' : 'Preview Dokumen Word'}
          </button>

          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setImportTab('questions')}
            style={{
              borderRadius: 0,
              border: 'none',
              borderBottom: importTab === 'questions' ? '2px solid #2563EB' : '2px solid transparent',
              background: 'transparent',
              color: importTab === 'questions' ? '#2563EB' : '#475569'
            }}
          >
            Preview Soal ({importPreview.length})
          </button>
        </div>
      )}

      {studentPreviewIndex !== null && importPreview[studentPreviewIndex] && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
          onClick={e => {
            if (e.target === e.currentTarget) setStudentPreviewIndex(null)
          }}
        >
          <div
            style={{
              width: 'min(820px, 96vw)',
              maxHeight: '88vh',
              overflow: 'auto',
              background: '#FFFFFF',
              borderRadius: 14,
              boxShadow: '0 24px 60px rgba(15, 23, 42, 0.28)',
              border: '1px solid #E2E8F0'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderBottom: '1px solid #E2E8F0',
                position: 'sticky',
                top: 0,
                background: '#FFFFFF',
                zIndex: 1
              }}
            >
              <div>
                <div style={{ fontWeight: 800 }}>Preview Tampilan Siswa</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>
                  Soal {importPreview[studentPreviewIndex].nomor || studentPreviewIndex + 1} - kunci jawaban tidak ditampilkan
                </div>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setStudentPreviewIndex(null)}>
                Tutup
              </button>
            </div>

            <div style={{ padding: 16 }}>
              {renderStudentQuestionPreview(importPreview[studentPreviewIndex])}
            </div>
          </div>
        </div>
      )}

      {importTab === 'document' && importDocument && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: Number(parserInfo?.total_detected || importSummary?.total_soal_terdeteksi || 0) < 5 ? '#FFF7ED' : '#EFF6FF',
              border: Number(parserInfo?.total_detected || importSummary?.total_soal_terdeteksi || 0) < 5 ? '1px solid #FED7AA' : '1px solid #BFDBFE',
              color: Number(parserInfo?.total_detected || importSummary?.total_soal_terdeteksi || 0) < 5 ? '#9A3412' : '#1D4ED8',
              fontSize: 13,
              lineHeight: 1.6
            }}
          >
            <div><strong>Seluruh isi Word berhasil dibaca.</strong></div>
            <div>
              {importMode === 'excel'
                ? `Total soal dari sheet SOAL: ${parserInfo?.total_detected ?? importSummary?.total_soal_terdeteksi ?? 0}. Validasi Excel ditampilkan di laporan kualitas import.`
                : `Total soal terdeteksi otomatis: ${parserInfo?.total_detected ?? importSummary?.total_soal_terdeteksi ?? 0}. Parser hanya bantuan otomatis. Jika ada soal belum terdeteksi, gunakan tombol Tambah Soal Manual di tab Soal Terdeteksi.`}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => copyImportText(importDocument.raw_text, 'Teks dokumen')}
            >
              {importMode === 'excel' ? 'Salin Ringkasan Excel' : 'Salin Teks Dokumen'}
            </button>

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={addManualImportSoal}
            >
              + Tambah Soal Manual
            </button>
          </div>

          <div
            style={{
              border: '1px solid #E2E8F0',
              borderRadius: 12,
              padding: 16,
              background: '#FFFFFF',
              maxHeight: 520,
              overflow: 'auto',
              lineHeight: 1.7
            }}
          >
            {importDocument.raw_html ? (
              <div
                className="word-preview-content"
                dangerouslySetInnerHTML={{ __html: sanitizeWordHtml(importDocument.raw_html) }}
              />
            ) : (
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
                {importDocument.raw_text || (importMode === 'excel' ? 'Tidak ada ringkasan Excel.' : 'Tidak ada teks dokumen.')}
              </pre>
            )}
          </div>

          <div style={{ color: '#64748B', fontSize: 12 }}>
            {importMode === 'excel'
              ? 'Preview Excel langsung masuk ke editor soal lama. Perbaiki error validasi sebelum tahap save Excel dibuat.'
              : 'Blok teks dari dokumen ini bisa disalin lalu dimasukkan ke soal manual.'}
          </div>
        </div>
      )}

      {importTab === 'questions' && importPreview.length === 0 && (importDocument || importSummary) && (
        <div
          style={{
            padding: 18,
            border: '1px dashed #CBD5E1',
            borderRadius: 12,
            background: '#F8FAFC',
            textAlign: 'center',
            color: '#475569'
          }}
        >
          <div style={{ marginBottom: 10 }}>Belum ada soal terdeteksi otomatis.</div>
          <button type="button" className="btn btn-primary btn-sm" onClick={addManualImportSoal}>
            + Tambah Soal Manual
          </button>
        </div>
      )}

      {importTab === 'questions' && importPreview.length > 0 && (
        <>
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 10,
              background: '#FFF7ED',
              border: '1px solid #FED7AA',
              color: '#9A3412',
              fontSize: 13
            }}
          >
            {importMode === 'excel'
              ? 'Guru dapat mengecek dan mengedit hasil preview Excel. Tahap ini belum menyimpan soal Excel ke database.'
              : 'Guru dapat mengedit isi soal, pilihan jawaban, tipe soal, gambar, dan kunci sebelum soal disimpan ke database.'}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={addManualImportSoal}>
              + Tambah Soal Manual
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {importPreview.map((soal, index) => {
              const gambarList = Array.isArray(soal.gambar) ? soal.gambar : []
              const tabelList = normalizeSupportingTables(soal)
              const parserNotesRaw = [
                ...(Array.isArray(soal.parser_notes) ? soal.parser_notes : []),
                ...(Array.isArray(soal.debug_extract?.warnings) ? soal.debug_extract.warnings : [])
              ].filter((item, itemIndex, arr) => item && arr.indexOf(item) === itemIndex)
              const parserNotes = parserNotesRaw.filter((note) => {
                const text = String(note || '').toLowerCase()
                if (gambarList.length > 0 && text.includes('gambar') && text.includes('belum')) return false
                if (tabelList.length > 0 && text.includes('tabel') && text.includes('belum')) return false
                return true
              })
              const pernyataanList = Array.isArray(soal.pernyataan_checklist) ? soal.pernyataan_checklist : []
              const pasangan = soal.pasangan_menjodohkan || {}
              const kolomKiri = Array.isArray(pasangan.kolom_kiri) ? pasangan.kolom_kiri : []
              const kolomKanan = Array.isArray(pasangan.kolom_kanan) ? pasangan.kolom_kanan : []
              const parseMeta = getParseStatusMeta(soal.status_parse)
              const layoutBlocks = buildQuestionLayoutBlocks(soal)

              return (
                <div
                  key={`${soal.nomor}-${index}`}
                  style={{
                    border: '1px solid #E2E8F0',
                    borderRadius: 14,
                    padding: 14,
                    background: '#FFFFFF'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 10,
                      flexWrap: 'wrap',
                      marginBottom: 12
                    }}
                  >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong>Soal {soal.nomor}</strong>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          background: parseMeta.background,
                          color: parseMeta.color
                        }}
                      >
                        {parseMeta.label}
                      </span>
                      {soal.confidence !== undefined && (
                        <span style={{ fontSize: 12, color: '#64748B' }}>
                          Confidence {Math.round(Number(soal.confidence || 0) * 100)}%
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <select
                        className="input"
                        value={soal.tipe_soal || 'pilihan_ganda'}
                        onChange={e => updateImportTipeSoal(index, e.target.value)}
                        style={{ minWidth: 180 }}
                      >
                        {TIPE_SOAL_OPTIONS.map(tipe => (
                          <option key={tipe} value={tipe}>{tipe}</option>
                        ))}
                      </select>

                      <input
                        type="number"
                        className="input"
                        min="1"
                        value={soal.bobot || 1}
                        onChange={e => updateImportSoal(index, 'bobot', e.target.value)}
                        style={{ width: 90 }}
                        title="Bobot soal"
                      />

                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setStudentPreviewIndex(index)}
                      >
                        Preview Tampilan Siswa
                      </button>
                    </div>
                  </div>

                  <label style={{ fontSize: 13, fontWeight: 700 }}>
                    Pertanyaan / Pernyataan Soal
                  </label>
                  {parserNotes.length > 0 && (
                    <div
                      style={{
                        marginTop: 8,
                        marginBottom: 10,
                        padding: 10,
                        borderRadius: 8,
                        background: '#FFFBEB',
                        border: '1px solid #FDE68A',
                        color: '#92400E',
                        fontSize: 12,
                        lineHeight: 1.5
                      }}
                    >
                      {parserNotes.slice(0, 4).map((note, noteIndex) => (
                        <div key={noteIndex}>{note}</div>
                      ))}
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => scrollToManualSupport(index)}
                        style={{ marginTop: 8, background: '#FDE68A', color: '#92400E' }}
                      >
                        Lengkapi Manual
                      </button>
                    </div>
                  )}
                  <div style={{ marginTop: 6, marginBottom: 12 }}>
                    <RichTextEditor
                      value={soal.pertanyaan || ''}
                      onChange={value => updateImportSoal(index, 'pertanyaan', value)}
                      minHeight={150}
                      placeholder="Tulis pertanyaan atau pernyataan soal"
                    />
                  </div>

                  <div
                    style={{
                      marginBottom: 14,
                      padding: 12,
                      border: '1px solid #DBEAFE',
                      borderRadius: 10,
                      background: '#EFF6FF'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E3A8A' }}>
                          Atur Urutan Tampilan Soal
                        </div>
                        <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                          Jawaban tetap tampil paling bawah.
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 8 }}>
                      {layoutBlocks.map((block, blockIndex) => (
                        <div
                          key={block.type}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '28px 1fr auto auto',
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
                            {LAYOUT_BLOCK_LABELS[block.type] || block.type}
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => moveImportLayoutBlock(index, block.type, -1)}
                            disabled={blockIndex === 0}
                            title="Naikkan blok"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <ArrowUp size={14} /> Naik
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => moveImportLayoutBlock(index, block.type, 1)}
                            disabled={blockIndex === layoutBlocks.length - 1}
                            title="Turunkan blok"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <ArrowDown size={14} /> Turun
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    id={`manual-support-${index}`}
                    style={{
                      marginBottom: 14,
                      padding: 12,
                      border: '1px solid #E2E8F0',
                      borderRadius: 10,
                      background: '#F8FAFC'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        Media dan Tabel Pendukung
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <label className="btn btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
                          + Tambah Gambar
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={e => {
                              const file = e.target.files?.[0]
                              e.target.value = ''
                              uploadManualImportImage(index, file)
                            }}
                          />
                        </label>

                        <button type="button" className="btn btn-sm" onClick={() => addSupportingTableImport(index)}>
                          + Tambah Tabel
                        </button>

                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => updateImportSoal(index, 'stimulus_tambahan', soal.stimulus_tambahan ? soal.stimulus_tambahan : ' ')}
                        >
                          + Tambah Teks Stimulus
                        </button>
                      </div>
                    </div>

                    {(soal.stimulus_tambahan !== undefined && soal.stimulus_tambahan !== '') && (
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
                          Teks Stimulus Tambahan
                        </label>
                        <div style={{ marginTop: 6 }}>
                          <RichTextEditor
                            value={soal.stimulus_tambahan || ''}
                            onChange={value => updateImportSoal(index, 'stimulus_tambahan', value)}
                            minHeight={95}
                            compact
                            placeholder="Tambahkan teks bacaan/stimulus yang belum masuk dari Word"
                          />
                        </div>
                      </div>
                    )}

                    {gambarList.length > 0 && (
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                        {gambarList.map((g, gIndex) => (
                          <div
                            key={gIndex}
                            style={{
                              width: 250,
                              border: '1px solid #CBD5E1',
                              borderRadius: 10,
                              padding: 10,
                              background: '#FFFFFF'
                            }}
                          >
                            <img
                              src={toAssetUrl(g.src)}
                              alt={g.alt || g.caption || `Gambar soal ${soal.nomor}`}
                              style={{
                                width: '100%',
                                height: 160,
                                objectFit: 'contain',
                                borderRadius: 8,
                                background: '#fff',
                                border: '1px solid #E5E7EB'
                              }}
                            />

                            <input
                              className="input"
                              placeholder="Caption gambar"
                              value={g.caption || g.alt || ''}
                              onChange={e => updateGambarImport(index, gIndex, 'caption', e.target.value)}
                              style={{ marginTop: 8, fontSize: 12 }}
                            />

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                              <label style={{ fontSize: 12 }}>
                                Ukuran
                                <select
                                  className="input"
                                  value={g.ukuran || 'sedang'}
                                  onChange={e => updateGambarImport(index, gIndex, 'ukuran', e.target.value)}
                                  style={{ fontSize: 12, marginTop: 4 }}
                                >
                                  <option value="kecil">Kecil</option>
                                  <option value="sedang">Sedang</option>
                                  <option value="besar">Besar</option>
                                </select>
                              </label>

                              <label style={{ fontSize: 12 }}>
                                Posisi
                                <select
                                  className="input"
                                  value={g.align || 'center'}
                                  onChange={e => updateGambarImport(index, gIndex, 'align', e.target.value)}
                                  style={{ fontSize: 12, marginTop: 4 }}
                                >
                                  <option value="left">Kiri</option>
                                  <option value="center">Tengah</option>
                                  <option value="right">Kanan</option>
                                </select>
                              </label>
                            </div>

                            <label style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
                              Lebar gambar: {g.width || '75%'}
                              <input
                                type="range"
                                min="25"
                                max="100"
                                step="25"
                                value={parseInt(g.width || '75%', 10) || 75}
                                onChange={e => updateGambarImport(index, gIndex, 'width', `${e.target.value}%`)}
                                style={{ width: '100%' }}
                              />
                            </label>

                            <label style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
                              Pindahkan ke soal
                              <select
                                className="input"
                                value=""
                                onChange={e => {
                                  const target = Number(e.target.value)
                                  if (!Number.isNaN(target)) moveGambarImport(index, gIndex, target)
                                }}
                                style={{ fontSize: 12, marginTop: 4 }}
                              >
                                <option value="">Pilih tujuan</option>
                                {importPreview.map((targetSoal, targetIndex) => (
                                  targetIndex === index ? null : (
                                    <option key={targetSoal.nomor || targetIndex} value={targetIndex}>
                                      Soal {targetSoal.nomor || targetIndex + 1}
                                    </option>
                                  )
                                ))}
                              </select>
                            </label>

                            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => window.open(toAssetUrl(g.src), '_blank')}
                              >
                                Perbesar
                              </button>

                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => removeGambarImport(index, gIndex)}
                                style={{ background: '#FEE2E2', color: '#991B1B' }}
                              >
                                Hapus
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {tabelList.length > 0 && (
                      <div style={{ display: 'grid', gap: 12 }}>
                        {tabelList.map((table, tableIndex) => {
                          const rows = Array.isArray(table.rows) ? table.rows : []
                          const colCount = Math.max(1, ...rows.map(row => row.length))

                          return (
                            <div
                              key={tableIndex}
                              style={{
                                padding: 10,
                                border: '1px solid #CBD5E1',
                                borderRadius: 10,
                                background: '#FFFFFF'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                                <div style={{ fontSize: 12, color: '#475569' }}>
                                  Tabel {tableIndex + 1} {table.source === 'manual' ? '(manual)' : '(hasil Word)'}
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  <button type="button" className="btn btn-sm" onClick={() => addSupportingTableRow(index, tableIndex)}>
                                    + Tambah Baris
                                  </button>
                                  <button type="button" className="btn btn-sm" onClick={() => addSupportingTableColumn(index, tableIndex)}>
                                    + Tambah Kolom
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm"
                                    onClick={() => removeSupportingTableImport(index, tableIndex)}
                                    style={{ background: '#FEE2E2', color: '#991B1B' }}
                                  >
                                    Hapus Tabel
                                  </button>
                                </div>
                              </div>

                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'minmax(160px, 1fr) 120px 120px 120px',
                                  gap: 8,
                                  marginBottom: 8
                                }}
                              >
                                <input
                                  className="input"
                                  value={table.caption || ''}
                                  onChange={e => updateSupportingTableMeta(index, tableIndex, 'caption', e.target.value)}
                                  placeholder="Caption tabel"
                                  style={{ fontSize: 12 }}
                                />
                                <select
                                  className="input"
                                  value={table.width || '100%'}
                                  onChange={e => updateSupportingTableMeta(index, tableIndex, 'width', e.target.value)}
                                  style={{ fontSize: 12 }}
                                  title="Lebar tabel"
                                >
                                  {TABLE_WIDTH_OPTIONS.map(width => (
                                    <option key={width} value={width}>{width}</option>
                                  ))}
                                </select>
                                <select
                                  className="input"
                                  value={table.align || 'center'}
                                  onChange={e => updateSupportingTableMeta(index, tableIndex, 'align', e.target.value)}
                                  style={{ fontSize: 12 }}
                                  title="Posisi tabel"
                                >
                                  <option value="left">Kiri</option>
                                  <option value="center">Tengah</option>
                                  <option value="right">Kanan</option>
                                </select>
                                <select
                                  className="input"
                                  value={table.fontSize || '14px'}
                                  onChange={e => updateSupportingTableMeta(index, tableIndex, 'fontSize', e.target.value)}
                                  style={{ fontSize: 12 }}
                                  title="Ukuran font tabel"
                                >
                                  {TABLE_FONT_SIZE_OPTIONS.map(size => (
                                    <option key={size} value={size}>{size}</option>
                                  ))}
                                </select>
                              </div>

                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: table.fontSize || 12 }}>
                                  <tbody>
                                    {rows.map((row, rowIndex) => (
                                      <tr key={rowIndex}>
                                        {Array.from({ length: colCount }).map((_, cellIndex) => (
                                          <td key={cellIndex} style={{ border: '1px solid #CBD5E1', padding: 4, verticalAlign: 'top' }}>
                                            <textarea
                                              className="input"
                                              value={row[cellIndex] || ''}
                                              onChange={e => updateSupportingTableCell(index, tableIndex, rowIndex, cellIndex, e.target.value)}
                                              onPaste={e => pasteTableIntoSupportingTable(e, index, tableIndex, rowIndex, cellIndex)}
                                              rows={2}
                                              style={{ minWidth: 130, resize: 'vertical', fontSize: 12, lineHeight: 1.4 }}
                                            />
                                          </td>
                                        ))}
                                        <td style={{ padding: 4, width: 44 }}>
                                          <button
                                            type="button"
                                            className="btn btn-sm"
                                            onClick={() => removeSupportingTableRow(index, tableIndex, rowIndex)}
                                            style={{ background: '#FEE2E2', color: '#991B1B' }}
                                          >
                                            -
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                    <tr>
                                      {Array.from({ length: colCount }).map((_, cellIndex) => (
                                        <td key={cellIndex} style={{ padding: 4 }}>
                                          <button
                                            type="button"
                                            className="btn btn-sm"
                                            onClick={() => removeSupportingTableColumn(index, tableIndex, cellIndex)}
                                            style={{ background: '#FEE2E2', color: '#991B1B' }}
                                          >
                                            Hapus Kolom
                                          </button>
                                        </td>
                                      ))}
                                      <td />
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {soal.tipe_soal === 'pilihan_ganda' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Pilihan Jawaban</div>

                      {getVisibleChoiceLabels(soal).map(label => (
                        <div
                          key={label}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '40px 1fr 92px',
                            gap: 8,
                            alignItems: 'start'
                          }}
                        >
                          <strong>{label}.</strong>
                          <RichTextEditor
                            value={getChoiceText(soal, label)}
                            onChange={value => updatePilihanImport(index, label, value)}
                            minHeight={70}
                            compact
                            placeholder={`Isi pilihan ${label}`}
                          />
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => removeChoiceImport(index, label)}
                            style={{
                              background: label === 'E' ? '#FEE2E2' : '#F8FAFC',
                              color: label === 'E' ? '#991B1B' : '#475569'
                            }}
                          >
                            {label === 'E' ? 'Hapus' : 'Kosongkan'}
                          </button>
                        </div>
                      ))}

                      {!getVisibleChoiceLabels(soal).includes('E') && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => addChoiceImport(index)}
                          style={{ justifySelf: 'start' }}
                        >
                          + Tambah Pilihan E
                        </button>
                      )}

                      <label style={{ fontSize: 13, fontWeight: 700 }}>Kunci Jawaban</label>
                      <select
                        className="input"
                        value={soal.jawaban_benar || ''}
                        onChange={e => updateImportSoal(index, 'jawaban_benar', e.target.value)}
                      >
                        <option value="">Pilih kunci</option>
                        {getVisibleChoiceLabels(soal).map(label => (
                          <option key={label} value={label}>{label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {soal.tipe_soal === 'sebab_akibat' && (
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Pernyataan dan Sebab</div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
                            Pernyataan
                          </label>
                          <RichTextEditor
                            value={soal.pilihan_a || ''}
                            onChange={value => updatePilihanImport(index, 'A', value)}
                            minHeight={90}
                            compact
                            placeholder="Isi pernyataan"
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
                            Sebab
                          </label>
                          <RichTextEditor
                            value={soal.pilihan_b || ''}
                            onChange={value => updatePilihanImport(index, 'B', value)}
                            minHeight={90}
                            compact
                            placeholder="Isi sebab/alasan"
                          />
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gap: 6,
                          padding: 10,
                          borderRadius: 8,
                          background: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          fontSize: 13
                        }}
                      >
                        <div><strong>A.</strong> Pernyataan benar, alasan benar, berhubungan</div>
                        <div><strong>B.</strong> Pernyataan benar, alasan benar, tidak berhubungan</div>
                        <div><strong>C.</strong> Pernyataan benar, alasan salah</div>
                        <div><strong>D.</strong> Pernyataan salah, alasan benar</div>
                      </div>

                      <label style={{ fontSize: 13, fontWeight: 700 }}>Kunci Jawaban</label>
                      <select
                        className="input"
                        value={soal.jawaban_benar || ''}
                        onChange={e => updateImportSoal(index, 'jawaban_benar', e.target.value)}
                      >
                        <option value="">Pilih kunci</option>
                        {PILIHAN_WAJIB_LABELS.map(label => (
                          <option key={label} value={label}>{label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {soal.tipe_soal === 'ganda_kompleks' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        Pilihan dan Kunci Ganda Kompleks
                      </div>

                      {getVisibleChoiceLabels(soal).map(label => (
                        <div
                          key={label}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '28px 35px 1fr 92px',
                            gap: 8,
                            alignItems: 'start',
                            padding: 8,
                            background: '#F8FAFC',
                            borderRadius: 8
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={Array.isArray(soal.jawaban_benar_json) && soal.jawaban_benar_json.includes(label)}
                            onChange={() => toggleGandaKompleks(index, label)}
                          />
                          <strong>{label}.</strong>
                          <RichTextEditor
                            value={getChoiceText(soal, label)}
                            onChange={value => updatePilihanImport(index, label, value)}
                            minHeight={70}
                            compact
                            placeholder={`Isi pilihan ${label}`}
                          />
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => removeChoiceImport(index, label)}
                            style={{
                              background: label === 'E' ? '#FEE2E2' : '#FFFFFF',
                              color: label === 'E' ? '#991B1B' : '#475569'
                            }}
                          >
                            {label === 'E' ? 'Hapus' : 'Kosongkan'}
                          </button>
                        </div>
                      ))}

                      {!getVisibleChoiceLabels(soal).includes('E') && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => addChoiceImport(index)}
                          style={{ justifySelf: 'start' }}
                        >
                          + Tambah Pilihan E
                        </button>
                      )}
                    </div>
                  )}

                  {soal.tipe_soal === 'benar_salah' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>
                          Pernyataan Benar / Salah
                        </div>

                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => addBenarSalahItem(index)}
                        >
                          + Tambah Pernyataan
                        </button>
                      </div>

                      {pernyataanList.map((p, pIndex) => (
                        <div
                          key={pIndex}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '32px 1fr 150px 80px',
                            gap: 8,
                            alignItems: 'start',
                            padding: 8,
                            background: '#F8FAFC',
                            borderRadius: 8
                          }}
                        >
                          <strong>{pIndex + 1}.</strong>

                          <RichTextEditor
                            value={typeof p === 'string' ? p : p?.pernyataan || ''}
                            onChange={value => updateBenarSalahText(index, pIndex, value)}
                            minHeight={70}
                            compact
                            placeholder={`Pernyataan ${pIndex + 1}`}
                          />

                          <select
                            className="input"
                            value={
                              soal.jawaban_benar_json?.[String(pIndex)] === false
                                ? 'Salah'
                                : soal.jawaban_benar_json?.[String(pIndex)] === true
                                  ? 'Benar'
                                  : ''
                            }
                            onChange={e => updateBenarSalah(index, pIndex, e.target.value)}
                          >
                            <option value="">Pilih</option>
                            <option value="Benar">Benar</option>
                            <option value="Salah">Salah</option>
                          </select>

                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => removeBenarSalahItem(index, pIndex)}
                            style={{ background: '#FEE2E2', color: '#991B1B' }}
                          >
                            Hapus
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {soal.tipe_soal === 'menjodohkan' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>
                          Data Menjodohkan
                        </div>

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => addMenjodohkanKiri(index)}
                          >
                            + Tambah Item Kiri
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => addMenjodohkanKanan(index)}
                          >
                            + Tambah Pilihan Kanan
                          </button>
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                          gap: 12
                        }}
                      >
                        <div style={{ display: 'grid', gap: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
                            Kiri
                          </div>

                          {kolomKiri.map((kiri, kiriIndex) => (
                            <div
                              key={`kiri-${kiriIndex}`}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '32px 1fr 80px',
                                gap: 8,
                                alignItems: 'start'
                              }}
                            >
                              <strong>{kiriIndex + 1}.</strong>
                              <RichTextEditor
                                value={kiri || ''}
                                onChange={value => updateMenjodohkanKiri(index, kiriIndex, value)}
                                minHeight={70}
                                compact
                                placeholder={`Item kiri ${kiriIndex + 1}`}
                              />
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => removeMenjodohkanKiri(index, kiriIndex)}
                                style={{ background: '#FEE2E2', color: '#991B1B' }}
                              >
                                Hapus
                              </button>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'grid', gap: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
                            Pilihan Kanan
                          </div>

                          {kolomKanan.map((kanan, kananIndex) => (
                            <div
                              key={`kanan-${kanan.label || kananIndex}`}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '32px 1fr 80px',
                                gap: 8,
                                alignItems: 'start'
                              }}
                            >
                              <strong>{kanan.label || String.fromCharCode(97 + kananIndex)}.</strong>
                              <RichTextEditor
                                value={kanan.text || ''}
                                onChange={value => updateMenjodohkanKanan(index, kananIndex, value)}
                                minHeight={70}
                                compact
                                placeholder={`Pilihan kanan ${kanan.label || String.fromCharCode(97 + kananIndex)}`}
                              />
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => removeMenjodohkanKanan(index, kananIndex)}
                                style={{ background: '#FEE2E2', color: '#991B1B' }}
                              >
                                Hapus
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
                          Kunci Pasangan
                        </div>

                        {kolomKiri.map((_, kiriIndex) => (
                          <div
                            key={`kunci-${kiriIndex}`}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '52px minmax(160px, 240px) 1fr',
                              gap: 8,
                              alignItems: 'center'
                            }}
                          >
                            <strong>{kiriIndex + 1} -</strong>
                            <select
                              className="input"
                              value={pasangan.kunci?.[String(kiriIndex)] || ''}
                              onChange={e => updateMenjodohkan(index, kiriIndex, e.target.value)}
                            >
                              <option value="">Pilih kunci</option>
                              {kolomKanan.map(item => (
                                <option key={item.label} value={item.label}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                            <span style={{ fontSize: 12, color: '#64748B' }}>
                              {stripHtml(kolomKanan.find(item => item.label === pasangan.kunci?.[String(kiriIndex)])?.text || '')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div
            style={{
              display: 'flex',
              gap: 10,
              marginTop: 16,
              justifyContent: 'flex-end',
              position: 'sticky',
              bottom: 0,
              background: '#fff',
              paddingTop: 12,
              borderTop: '1px solid #E5E7EB'
            }}
          >
            <button
              className="btn"
              onClick={closeImportWord}
              disabled={importSaving}
            >
              Batal
            </button>

            <button
              className="btn"
              onClick={addManualImportSoal}
              disabled={importSaving}
            >
              + Tambah Soal Manual
            </button>

            <button
              className="btn btn-primary"
              onClick={handleSaveImportWord}
              disabled={importSaving || importMode === 'excel'}
              title={importMode === 'excel' ? 'Save Import Excel akan ditambahkan pada tahap berikutnya.' : ''}
            >
              {importMode === 'excel'
                ? 'Save Excel belum aktif'
                : (importSaving ? 'Menyimpan soal...' : `Simpan ${importPreview.length} Soal`)}
            </button>
          </div>
        </>
      )}
    </div>
  </div>
)}
      <section className="instrumen-header">
        <div>
          <div className="instrumen-eyebrow">Bank Instrumen</div>
          <h2>Manajemen Instrumen</h2>
          <p>
            Kelola instrumen HOTS, Literasi, dan Numerasi berdasarkan kelas dan mata pelajaran.
          </p>
        </div>

        {canEdit && (
          <button className="btn btn-primary instrumen-primary-action" onClick={openAdd}>
            <FilePlus2 size={16} />
            Tambah instrumen
          </button>
        )}
      </section>

      <section className="instrumen-summary-grid">
        <div className="instrumen-summary-card">
          <div className="instrumen-summary-icon blue"><Layers3 size={18} /></div>
          <div>
            <div className="instrumen-summary-label">Total Data</div>
            <div className="instrumen-summary-value">{pagination.total || items.length}</div>
          </div>
        </div>
        <div className="instrumen-summary-card">
          <div className="instrumen-summary-icon teal"><BookOpenCheck size={18} /></div>
          <div>
            <div className="instrumen-summary-label">Aktif di Halaman Ini</div>
            <div className="instrumen-summary-value">{visibleAktif}</div>
          </div>
        </div>
        <div className="instrumen-summary-card">
          <div className="instrumen-summary-icon amber"><FileText size={18} /></div>
          <div>
            <div className="instrumen-summary-label">Draft di Halaman Ini</div>
            <div className="instrumen-summary-value">{visibleDraft}</div>
          </div>
        </div>
      </section>

      {/* Search & Filter */}
      <div className="instrumen-toolbar">
        <form onSubmit={handleSearch} className="instrumen-search">
          <div className="search-input-wrap">
            <Search size={16} className="instrumen-search-icon" />
            <input
              className="input"
              placeholder="Cari judul, mapel, atau kelas..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm">Cari</button>
        </form>

        <div className="instrumen-filter-wrap">
          <div className="instrumen-filter-label">
            <Filter size={14} />
            Jenis
          </div>
          <div className="instrumen-segmented">
          {['Semua', ...JENIS].map(j => (
            <button
              type="button"
              key={j}
              className={filterJenis === j ? 'active' : ''}
              onClick={() => setFilterJenis(j)}
            >
              {j}
            </button>
          ))}
          </div>
        </div>

      </div>

      {/* Info kelas untuk siswa */}
      {user?.peran === 'siswa' && user?.kelas && (
        <div className="instrumen-class-note">
          <BookOpenCheck size={16} />
          Menampilkan instrumen untuk kelas <strong>{user.kelas}</strong>
        </div>
      )}

      {/* Tabel */}
      <div className="instrumen-table-card">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner spinner-dark" />
          </div>
        ) : items.length === 0 ? (
          <div className="empty">
            <div className="empty-text">
              {user?.peran === 'siswa'
                ? `Tidak ada instrumen aktif untuk kelas ${user?.kelas || 'Anda'} saat ini.`
                : 'Tidak ada instrumen ditemukan'}
            </div>
          </div>
        ) : (
          <table className="instrumen-table">
            <thead>
              <tr>
                <th>Judul</th>
                <th>Jenis</th>
                <th>Mapel</th>
                <th>Kelas</th>
                <th>Soal</th>
                <th>Batas Waktu</th>
                <th>Status</th>
                <th>Dibuat</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td>
                    <div className="instrumen-title-cell">
                      <span className={`instrumen-kind-mark ${jenisColor[item.jenis] || 'blue'}`}>
                        {item.jenis?.charAt(0) || '-'}
                      </span>
                      <span>{item.judul}</span>
                    </div>
                  </td>
                  <td><span className={`badge badge-${jenisColor[item.jenis] || 'blue'}`}>{item.jenis}</span></td>
                  <td>{item.mata_pelajaran}</td>
                  <td>
                    {item.kelas ? (
                      <span className="instrumen-class-badge">
                        {item.kelas}
                      </span>
                    ) : (
                      <span className="instrumen-muted">-</span>
                    )}
                  </td>
                  <td><span className="instrumen-count">{item.jumlah_soal}</span></td>
                  <td>
                    {item.gunakan_batas_waktu === 1 && item.batas_waktu ? (
                      <span className={`instrumen-time ${new Date(item.batas_waktu) < new Date() ? 'expired' : 'active'}`}>
                        <Clock3 size={13} />
                        {new Date(item.batas_waktu).toLocaleString('id-ID')}
                        {new Date(item.batas_waktu) < new Date() && ' (habis)'}
                      </span>
                    ) : (
                      <span className="instrumen-time muted">
                        <Clock3 size={13} />
                        Tidak terbatas
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge badge-${statusColor[item.status] || 'gray'}`}>
                      <span className={`dot dot-${item.status === 'aktif' ? 'green' : item.status === 'draft' ? 'amber' : 'red'}`} />
                      {item.status}
                    </span>
                  </td>
                  <td>{new Date(item.created_at).toLocaleDateString('id-ID')}</td>
                  <td>
                    <div className="instrumen-action-group">

                    {/* SISWA */}
                    {user?.peran === 'siswa' && (
                      <button className="btn btn-primary btn-sm" onClick={() => navigate(`/kerjakan/${item.id}`)}>
                        <PlayCircle size={14} />
                        Kerjakan
                      </button>
                    )}

                    {/* GURU */}
                    {user?.peran === 'guru' && (
                      <>
                        <button className="btn btn-sm" onClick={() => navigate(`/soal/${item.id}`)}>
                          <BookOpenCheck size={14} />
                          Kelola Soal
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={() => openImportWord(item)}>
                          <Upload size={14} />
                          Import Word
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => openImportExcel(item)}
                          disabled
                          title="Import Excel masih tahap eksperimen. Gunakan Import Word untuk saat ini."
                        >
                          <Upload size={14} />
                          Import Excel (Eksperimen)
                        </button>
                        <span style={{ marginLeft: 8, fontSize: 12, color: '#6b7280' }}>
                          Import Excel masih tahap eksperimen. Gunakan Import Word untuk saat ini.
                        </span>
                        {canDuplicateItem(item) && (
                          <button className="btn btn-sm" onClick={() => openDuplicateInstrument(item)}>
                            <CopyPlus size={14} />
                            Gunakan untuk Kelas Lain
                          </button>
                        )}
                        {/* TAMBAHAN: TOMBOL EDIT WAKTU UNTUK GURU */}
                        <button className="btn btn-amber btn-sm" onClick={() => openEditBatasWaktu(item)}>
                          <Clock3 size={14} />
                          Edit Waktu
                        </button>
                      </>
                    )}

                    {/* ADMIN */}
                    {isAdminRole(user?.peran) && (
                      <>
                        <button className="btn btn-sm" onClick={() => navigate(`/soal/${item.id}`)}>
                          <BookOpenCheck size={14} />
                          Kelola Soal
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={() => openImportWord(item)}>
                          <Upload size={14} />
                          Import Word
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => openImportExcel(item)}
                          disabled
                          title="Import Excel masih tahap eksperimen. Gunakan Import Word untuk saat ini."
                        >
                          <Upload size={14} />
                          Import Excel (Eksperimen)
                        </button>
                        <span style={{ marginLeft: 8, fontSize: 12, color: '#6b7280' }}>
                          Import Excel masih tahap eksperimen. Gunakan Import Word untuk saat ini.
                        </span>
                        {canDuplicateItem(item) && (
                          <button className="btn btn-sm" onClick={() => openDuplicateInstrument(item)}>
                            <CopyPlus size={14} />
                            Gunakan untuk Kelas Lain
                          </button>
                        )}
                        <button className="btn btn-sm" onClick={() => openEdit(item)}>
                          <Pencil size={14} />
                          Edit
                        </button>
                        {/* TAMBAHAN: TOMBOL EDIT WAKTU UNTUK ADMIN */}
                        <button className="btn btn-amber btn-sm" onClick={() => openEditBatasWaktu(item)}>
                          <Clock3 size={14} />
                          Edit Waktu
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item.id)}>
                          <Trash2 size={14} />
                          Hapus
                        </button>
                      </>
                    )}

                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
           </table>
        )}
      </div>

      {/* Pagination */}
      <div className="instrumen-pagination">
        <span className="instrumen-page-info">{pageInfo}</span>
        {pagination.totalPages > 1 && (
          <div className="instrumen-page-list">
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                className={`instrumen-page-button ${pagination.page === p ? 'active' : ''}`}
                onClick={() => fetchData(p)}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
