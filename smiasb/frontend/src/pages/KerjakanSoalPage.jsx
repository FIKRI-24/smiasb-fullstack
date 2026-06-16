import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import { sanitizeRichHtml, stripHtml } from '../utils/sanitizeHtml'
import { confirmToast } from '../utils/notify'

const API_ASSET_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '')
const ANSWER_DRAFT_PREFIX = 'smiasb_answer_draft'
const ANSWER_DRAFT_VERSION = 1
const ACTIVE_CHATBOT_INSTRUMENT_KEY = 'smiasb_active_chatbot_instrumen_id'

export default function KerjakanSoalPage() {
  const { instrumenId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [instrumen, setInstrumen] = useState(null)
  const [soal, setSoal] = useState([])
  const [jawaban, setJawaban] = useState({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [hasil, setHasil] = useState(null)
  const [error, setError] = useState('')
  const [sudahMengerjakan, setSudahMengerjakan] = useState(false)
  const [nilaiLama, setNilaiLama] = useState(null)
  const [selectedImage, setSelectedImage] = useState(null)
  const [imageZoom, setImageZoom] = useState(1)
  
  // ========== FITUR COUNTDOWN TIMER ==========
  const [sisaWaktu, setSisaWaktu] = useState(null) // dalam detik
  const [waktuHabis, setWaktuHabis] = useState(false)
  const [timerExpired, setTimerExpired] = useState(false)

  const getAnswerDraftKey = () => (
    user?.id && instrumenId ? `${ANSWER_DRAFT_PREFIX}_${user.id}_${instrumenId}` : ''
  )

  const isDraftAnswerFilled = (soalItem, value) => {
    if (!soalItem) return false
    if (soalItem.tipe_soal === 'ganda_kompleks') {
      return Array.isArray(value) && value.length > 0
    }
    if (soalItem.tipe_soal === 'benar_salah' || soalItem.tipe_soal === 'menjodohkan') {
      return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0
    }
    return value !== undefined && value !== null && String(value) !== ''
  }

  const hasDraftableAnswers = (answers = jawaban, soalList = soal) => (
    Array.isArray(soalList) && soalList.some(item => isDraftAnswerFilled(item, answers?.[item.id]))
  )

  const buildInitialAnswers = (soalList = []) => {
    const initialAnswers = {}
    soalList.forEach(s => {
      if (s.tipe_soal === 'ganda_kompleks') {
        initialAnswers[s.id] = []
      } else if (
        s.tipe_soal === 'benar_salah' ||
        s.tipe_soal === 'menjodohkan'
      ) {
        initialAnswers[s.id] = {}
      } else {
        initialAnswers[s.id] = ''
      }
    })
    return initialAnswers
  }

  const readAnswerDraft = () => {
    const key = getAnswerDraftKey()
    if (!key || typeof window === 'undefined') return null

    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) return null
      const draft = JSON.parse(raw)
      if (draft.version !== ANSWER_DRAFT_VERSION || !draft.answers || typeof draft.answers !== 'object') {
        window.localStorage.removeItem(key)
        return null
      }
      return draft
    } catch {
      window.localStorage.removeItem(key)
      return null
    }
  }

  const writeAnswerDraft = (answers = jawaban, soalList = soal) => {
    const key = getAnswerDraftKey()
    if (!key || typeof window === 'undefined') return

    try {
      if (!hasDraftableAnswers(answers, soalList)) {
        window.localStorage.removeItem(key)
        return
      }

      window.localStorage.setItem(key, JSON.stringify({
        version: ANSWER_DRAFT_VERSION,
        instrumenId,
        siswaId: user?.id,
        savedAt: Date.now(),
        answers
      }))
    } catch {
      // Draft lokal hanya lapisan pengaman; pengerjaan tetap berjalan walau storage penuh/nonaktif.
    }
  }

  const clearAnswerDraft = () => {
    const key = getAnswerDraftKey()
    if (!key || typeof window === 'undefined') return
    window.localStorage.removeItem(key)
  }

  const mergeAnswersWithDraft = (soalList = [], initialAnswers = {}) => {
    const draft = readAnswerDraft()
    const draftAnswers = draft?.answers || {}
    const merged = { ...initialAnswers }

    soalList.forEach(s => {
      const draftValue = draftAnswers[s.id] ?? draftAnswers[String(s.id)]
      if (!isDraftAnswerFilled(s, draftValue)) return

      if (s.tipe_soal === 'ganda_kompleks') {
        merged[s.id] = Array.isArray(draftValue) ? draftValue : []
      } else if (s.tipe_soal === 'benar_salah' || s.tipe_soal === 'menjodohkan') {
        merged[s.id] = draftValue && typeof draftValue === 'object' && !Array.isArray(draftValue)
          ? draftValue
          : {}
      } else {
        merged[s.id] = String(draftValue)
      }
    })

    return merged
  }

  useEffect(() => {
    cekStatusDanAmbilSoal()
  }, [])

  useEffect(() => {
    if (loading || submitting || hasil || sudahMengerjakan || timerExpired || soal.length === 0) return
    writeAnswerDraft(jawaban, soal)
  }, [jawaban, soal, loading, submitting, hasil, sudahMengerjakan, timerExpired, user?.id, instrumenId])

  useEffect(() => {
    const shouldProtect = (
      !loading &&
      !submitting &&
      !hasil &&
      !sudahMengerjakan &&
      !timerExpired &&
      hasDraftableAnswers(jawaban, soal)
    )

    const handleBeforeUnload = (event) => {
      if (!shouldProtect) return
      writeAnswerDraft(jawaban, soal)
      event.preventDefault()
      event.returnValue = ''
    }

    const handleDocumentClick = async (event) => {
      if (!shouldProtect || event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const anchor = event.target?.closest?.('a[href]')
      if (!anchor) return

      const href = anchor.getAttribute('href') || ''
      if (!href || href.startsWith('#') || anchor.target === '_blank') return

      const targetUrl = new URL(href, window.location.href)
      const currentUrl = new URL(window.location.href)
      if (targetUrl.pathname === currentUrl.pathname && targetUrl.search === currentUrl.search) return

      event.preventDefault()
      writeAnswerDraft(jawaban, soal)

      const ok = await confirmToast('Jawaban Anda sudah disimpan sementara. Yakin ingin keluar dari halaman pengerjaan?', {
        title: 'Keluar Halaman?',
        confirmText: 'Keluar',
        cancelText: 'Tetap di Sini',
        tone: 'danger',
      })

      if (!ok) return

      if (targetUrl.origin === currentUrl.origin) {
        navigate(`${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`)
      } else {
        window.location.href = targetUrl.href
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('click', handleDocumentClick, true)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('click', handleDocumentClick, true)
    }
  }, [jawaban, soal, loading, submitting, hasil, sudahMengerjakan, timerExpired, user?.id, instrumenId, navigate])

  // ========== EFFECT UNTUK COUNTDOWN TIMER ==========
  useEffect(() => {
    if (sisaWaktu === null || sisaWaktu <= 0) return
    
    const interval = setInterval(() => {
      setSisaWaktu(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          setWaktuHabis(true)
          setTimerExpired(true)
          // Auto submit ketika waktu habis
          if (!submitting && !hasil && !sudahMengerjakan) {
            handleSubmit(true) // true = forced submit dari timer
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    
    return () => clearInterval(interval)
  }, [sisaWaktu])

  // ========== FORMAT WAKUT (HH:MM:SS) ==========
  const formatWaktu = (detik) => {
    if (detik === null || detik === undefined) return null
    const hours = Math.floor(detik / 3600)
    const minutes = Math.floor((detik % 3600) / 60)
    const seconds = detik % 60
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  // ========== CEK WARNA TIMER (merah jika < 5 menit) ==========
  const getTimerColor = () => {
    if (sisaWaktu === null) return '#333'
    if (sisaWaktu <= 60) return '#dc2626' // merah jika <= 1 menit
    if (sisaWaktu <= 300) return '#f59e0b' // oranye jika <= 5 menit
    return '#059669' // hijau jika masih banyak
  }



  // ========== HELPER DATA IMPORT WORD ==========
  // Data soal manual lama kadang berbentuk string, sedangkan hasil import Word
  // untuk menjodohkan berbentuk object { label, text }. Helper ini membuat UI aman.
  const safeJsonParse = (value, fallback = null) => {
    try {
      if (!value) return fallback
      return typeof value === 'string' ? JSON.parse(value) : value
    } catch {
      return fallback
    }
  }

  const getImageSrc = (gambarSoal) => {
    if (!gambarSoal) return ''

    const value = typeof gambarSoal === 'string'
      ? gambarSoal
      : gambarSoal?.file_name || gambarSoal?.src || ''

    if (!value) return ''
    if (value.startsWith('http')) return value
    if (value.startsWith('/uploads')) return `${API_ASSET_URL}${value}`
    return `${API_ASSET_URL}/uploads/soal/${value}`
  }

  const openImageZoom = (image) => {
    setSelectedImage(image)
    setImageZoom(1)
  }

  const closeImageZoom = () => {
    setSelectedImage(null)
    setImageZoom(1)
  }

  const zoomImageIn = () => {
    setImageZoom(prev => Math.min(3, Number((prev + 0.25).toFixed(2))))
  }

  const zoomImageOut = () => {
    setImageZoom(prev => Math.max(0.5, Number((prev - 0.25).toFixed(2))))
  }

  const resetImageZoom = () => {
    setImageZoom(1)
  }

  const escapeHtmlText = (value = '') => (
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  )

  const HTML_ENTITY_MAP = {
    amp: '&',
    nbsp: ' ',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    '#39': "'",
    lsquo: "'",
    rsquo: "'",
    ldquo: '"',
    rdquo: '"',
    ndash: '-',
    mdash: '-',
    hellip: '...',
    bull: '-'
  }

  const decodeHtmlEntities = (value = '') => {
    let decoded = String(value || '')
    for (let i = 0; i < 3; i += 1) {
      const next = decoded.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (match, entity) => {
        const key = String(entity || '').toLowerCase()
        if (Object.prototype.hasOwnProperty.call(HTML_ENTITY_MAP, key)) {
          return HTML_ENTITY_MAP[key]
        }

        if (key.startsWith('#x')) {
          const codePoint = Number.parseInt(key.slice(2), 16)
          return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
        }

        if (key.startsWith('#')) {
          const codePoint = Number.parseInt(key.slice(1), 10)
          return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
        }

        return match
      })

      if (next === decoded) break
      decoded = next
    }

    return decoded.replace(/\u00A0/g, ' ')
  }

  const normalizeVisibleText = (value = '') => (
    stripHtml(decodeHtmlEntities(String(value || '')))
      .replace(/\u00A0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s+\n/g, '\n')
      .replace(/\n\s+/g, '\n')
      .trim()
  )

  const normalizeComparableText = (value = '') => (
    normalizeVisibleText(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )

  const prepareRichHtmlInput = (value = '') => {
    const source = decodeHtmlEntities(value)
    return /<[a-z][\s\S]*>/i.test(source)
      ? source
      : escapeHtmlText(source).replace(/\r?\n/g, '<br>')
  }

  const removeDuplicateFigureCaptions = (doc) => {
    const removeAdjacentDuplicateText = (mediaEl, captionText) => {
      if (!captionText) return

      const candidates = [
        mediaEl.previousElementSibling,
        mediaEl.nextElementSibling
      ].filter(Boolean)

      candidates.forEach((candidate) => {
        if (candidate.tagName?.toLowerCase() === 'figure') return
        const candidateText = normalizeComparableText(candidate.textContent || '')
        if (candidateText && candidateText === captionText) {
          candidate.remove()
        }
      })
    }

    doc.querySelectorAll('figure').forEach((figure) => {
      const captions = Array.from(figure.querySelectorAll('figcaption'))
      const seenCaptions = new Set()

      captions.forEach((caption) => {
        const captionText = normalizeComparableText(caption.textContent || '')
        if (!captionText) return

        if (seenCaptions.has(captionText)) {
          caption.remove()
          return
        }

        seenCaptions.add(captionText)
      })

      const captionText = normalizeComparableText(figure.querySelector('figcaption')?.textContent || '')
      removeAdjacentDuplicateText(figure, captionText)
    })

    doc.querySelectorAll('img[alt], img[title]').forEach((img) => {
      const labelText = normalizeComparableText(img.getAttribute('alt') || img.getAttribute('title') || '')
      const mediaEl = img.closest('figure') || img
      removeAdjacentDuplicateText(mediaEl, labelText)
    })
  }

  const sanitizeQuestionHtml = (html = '') => {
    if (!html || typeof window === 'undefined' || !window.DOMParser) return ''

    const parser = new window.DOMParser()
    const doc = parser.parseFromString(prepareRichHtmlInput(html), 'text/html')

    doc.querySelectorAll('[src]').forEach(el => {
      const src = el.getAttribute('src') || ''
      el.setAttribute('src', getImageSrc(src))
    })

    removeDuplicateFigureCaptions(doc)

    return sanitizeRichHtml(doc.body.innerHTML)
      .replace(/&nbsp;|\u00A0/g, ' ')
  }

  const renderQuestionText = (text = '') => {
    const source = String(text || '')

    if (/<(div|figure|img|br|p|table|figcaption|span|strong|em|ul|ol|li)\b/i.test(source) || /\r?\n/.test(source)) {
      return (
        <div
          className="question-text"
          style={{ fontWeight: 500, lineHeight: 1.7 }}
          dangerouslySetInnerHTML={{ __html: sanitizeQuestionHtml(source) }}
        />
      )
    }

    return <p className="question-text" style={{ fontWeight: 500 }}>{normalizeVisibleText(source)}</p>
  }

  const renderRichInline = (value = '') => (
    <span dangerouslySetInnerHTML={{ __html: sanitizeQuestionHtml(value) || escapeHtmlText(normalizeVisibleText(value)) }} />
  )

  const isSebabAkibatAnswerTemplate = (value = '') => {
    const text = stripHtml(String(value || ''))
      .replace(/\s+/g, ' ')
      .replace(/^[A-E]\s*[.)-]\s*/i, '')
      .trim()
      .toLowerCase()

    return (
      /^pernyataan benar,?\s+alasan benar\b.*(?:berhubungan|hubungan sebab[-\s]?akibat|menunjukkan hubungan)/i.test(text) ||
      /^pernyataan benar,?\s+alasan benar\b.*tidak\b.*hubungan/i.test(text) ||
      /^pernyataan benar,?\s+alasan salah\b/i.test(text) ||
      /^pernyataan salah,?\s+alasan benar\b/i.test(text) ||
      /^pernyataan salah,?\s+alasan salah\b/i.test(text)
    )
  }

  const getMatchingLabel = (opt, index) => {
    if (opt && typeof opt === 'object') {
      return String(opt.label || String.fromCharCode(97 + index)).toLowerCase()
    }

    if (typeof opt === 'string') {
      const match = opt.trim().match(/^([a-zA-Z])\s*[.)-]/)
      if (match) return match[1].toLowerCase()
    }

    return String.fromCharCode(97 + index)
  }

  const getMatchingText = (opt) => {
    if (opt && typeof opt === 'object') {
      return opt.text || opt.isi || opt.value || ''
    }

    if (typeof opt === 'string') {
      return opt.replace(/^[a-zA-Z]\s*[.)-]\s*/, '')
    }

    return String(opt || '')
  }

  const getStatementText = (item) => {
    if (typeof item === 'string') return item
    if (item && typeof item === 'object') return item.pernyataan || item.text || item.isi || ''
    return String(item || '')
  }

  const normalizeTabelData = (value) => {
    const parsed = safeJsonParse(value, value)
    if (!Array.isArray(parsed)) return []
    return parsed
  }

  const isLayoutMetadataBlock = (tableItem = {}) => (
    String(tableItem?.role || '').toLowerCase() === 'layout_blocks' ||
    String(tableItem?.type || '').toLowerCase() === 'layout_blocks' ||
    Array.isArray(tableItem?.layout_blocks)
  )

  const getLayoutMetadata = (soalItem = {}) => (
    normalizeTabelData(soalItem?.tabel_data).find(isLayoutMetadataBlock) || null
  )

  const flattenTableCells = (tableItem) => {
    if (tableItem?.rows && Array.isArray(tableItem.rows)) {
      return tableItem.rows.flat().map(cell => normalizeComparableText(cell)).filter(Boolean)
    }

    if (tableItem && typeof tableItem === 'object') {
      return Object.entries(tableItem)
        .flatMap(([key, value]) => [key, value])
        .map(cell => normalizeComparableText(cell))
        .filter(Boolean)
    }

    return []
  }

  const countContainedTexts = (haystack = '', values = []) => (
    values.filter(value => value && haystack.includes(value)).length
  )

  const isDuplicateBenarSalahTable = (tableItem, soalItem) => {
    if (soalItem?.tipe_soal !== 'benar_salah') return false

    const statements = (soalItem.pernyataan_checklist || [])
      .map(item => normalizeComparableText(getStatementText(item)))
      .filter(Boolean)

    if (!statements.length) return false

    const cells = flattenTableCells(tableItem)
    const tableText = cells.join(' ')
    const hasAnswerHeaders = tableText.includes('benar') && tableText.includes('salah')
    const statementMatches = countContainedTexts(tableText, statements)

    return hasAnswerHeaders && statementMatches >= Math.max(1, Math.ceil(statements.length * 0.6))
  }

  const isDuplicateMenjodohkanTable = (tableItem, soalItem) => {
    if (soalItem?.tipe_soal !== 'menjodohkan') return false

    const pasangan = soalItem.pasangan_menjodohkan || {}
    const leftItems = (pasangan.kolom_kiri || [])
      .map(item => normalizeComparableText(getStatementText(item)))
      .filter(Boolean)
    const rightItems = (pasangan.kolom_kanan || [])
      .map(item => normalizeComparableText(getMatchingText(item)))
      .filter(Boolean)

    if (!leftItems.length || !rightItems.length) return false

    const tableText = flattenTableCells(tableItem).join(' ')
    const leftMatches = countContainedTexts(tableText, leftItems)
    const rightMatches = countContainedTexts(tableText, rightItems)

    return (
      leftMatches >= Math.max(1, Math.ceil(leftItems.length * 0.6)) &&
      rightMatches >= Math.max(1, Math.ceil(rightItems.length * 0.6))
    )
  }

  const getVisibleTabelData = (soalItem) => (
    normalizeTabelData(soalItem?.tabel_data).filter(tableItem => (
      !isLayoutMetadataBlock(tableItem) &&
      !isDuplicateBenarSalahTable(tableItem, soalItem) &&
      !isDuplicateMenjodohkanTable(tableItem, soalItem)
    ))
  )

  const getSoalGambarList = (soalItem = {}) => {
    const metadata = getLayoutMetadata(soalItem)
    const list = Array.isArray(soalItem.gambar) && soalItem.gambar.length > 0
      ? soalItem.gambar
      : Array.isArray(metadata?.gambar)
        ? metadata.gambar
        : []

    if (list.length > 0) return list
    if (soalItem.gambar_soal && !/import-support-image/i.test(String(soalItem.pertanyaan || ''))) {
      return [soalItem.gambar_soal]
    }
    return []
  }

  const normalizeLayoutBlocks = (blocks = []) => {
    const allowed = new Map([
      ['question', 'question'],
      ['stimulus', 'stimulus'],
      ['image', 'images'],
      ['table', 'tables']
    ])
    const seen = new Set()

    return (Array.isArray(blocks) ? blocks : [])
      .map(block => {
        const type = String(block?.type || '').trim()
        if (!allowed.has(type) || seen.has(type)) return null
        seen.add(type)
        return { type, id: block?.id || allowed.get(type) }
      })
      .filter(Boolean)
  }

  const getQuestionLayoutBlocks = (soalItem = {}, visibleTabelData = getVisibleTabelData(soalItem)) => {
    const metadata = getLayoutMetadata(soalItem)
    const sourceBlocks = normalizeLayoutBlocks(
      Array.isArray(soalItem.layout_blocks) ? soalItem.layout_blocks : metadata?.layout_blocks
    )
    const active = [
      { type: 'question', id: 'question' },
      ...(normalizeVisibleText(soalItem.stimulus_tambahan || metadata?.stimulus_tambahan || '') ? [{ type: 'stimulus', id: 'stimulus' }] : []),
      ...(getSoalGambarList(soalItem).length > 0 ? [{ type: 'image', id: 'images' }] : []),
      ...(visibleTabelData.length > 0 ? [{ type: 'table', id: 'tables' }] : [])
    ]
    const activeTypes = new Set(active.map(block => block.type))
    const ordered = sourceBlocks.filter(block => activeTypes.has(block.type))
    const seen = new Set(ordered.map(block => block.type))

    active.forEach((block) => {
      if (!seen.has(block.type)) ordered.push(block)
    })

    return ordered.some(block => block.type === 'question')
      ? ordered
      : [{ type: 'question', id: 'question' }, ...ordered]
  }

  const renderTabelData = (tabelData) => {
    const tabel = normalizeTabelData(tabelData)
    if (!tabel.length) return null

    const justifyByAlign = (align = 'center') => {
      if (align === 'left') return 'flex-start'
      if (align === 'right') return 'flex-end'
      return 'center'
    }

    return (
      <div style={{ marginBottom: 16, display: 'grid', gap: 12 }}>
        {tabel.map((tableItem, tableIndex) => {
          // Format hasil import Word: { index, rows: [[header...], [row...]] }
          if (tableItem?.rows && Array.isArray(tableItem.rows) && tableItem.rows.length > 0) {
            const rows = tableItem.rows
            const [header, ...bodyRows] = rows
            const width = tableItem.width || '100%'
            const align = tableItem.align || 'center'
            const fontSize = tableItem.fontSize || '14px'

            return (
              <div key={tableIndex} style={{ display: 'flex', justifyContent: justifyByAlign(align), overflowX: 'auto' }}>
                <figure style={{ width, maxWidth: '100%', margin: 0 }}>
                  {tableItem.caption && (
                    <figcaption style={{ marginBottom: 6, fontSize: 12, color: '#64748B', textAlign: align }}>
                      {renderRichInline(tableItem.caption)}
                    </figcaption>
                  )}
                  <table className="table" style={{ fontSize, marginBottom: 10, width: '100%' }}>
                    <thead>
                      <tr>
                        {header.map((col, idx) => (
                          <th key={idx} style={{ padding: 8, border: '1px solid #E5E7EB' }}>
                            {renderRichInline(col)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bodyRows.map((row, rowIdx) => (
                        <tr key={rowIdx}>
                          {row.map((val, colIdx) => (
                            <td key={colIdx} style={{ padding: 8, border: '1px solid #E5E7EB' }}>
                              {renderRichInline(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </figure>
              </div>
            )
          }

          // Format manual lama: [{ kolom1: nilai, kolom2: nilai }]
          if (tableItem && typeof tableItem === 'object') {
            const keys = Object.keys(tableItem)
            if (!keys.length) return null

            return (
              <table key={tableIndex} className="table" style={{ fontSize: 13, marginBottom: 10, width: '100%' }}>
                <thead>
                  <tr>
                    {keys.map(col => <th key={col} style={{ padding: 8, border: '1px solid #E5E7EB' }}>{renderRichInline(col)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {keys.map(col => <td key={col} style={{ padding: 8, border: '1px solid #E5E7EB' }}>{renderRichInline(String(tableItem[col] ?? ''))}</td>)}
                  </tr>
                </tbody>
              </table>
            )
          }

          return null
        })}
      </div>
    )
  }

  const renderGambarData = (soalItem = {}) => {
    const gambarList = getSoalGambarList(soalItem)
    if (!gambarList.length) return null

    const justifyByAlign = (align = 'center') => {
      if (align === 'left') return 'flex-start'
      if (align === 'right') return 'flex-end'
      return 'center'
    }

    return (
      <div style={{ marginBottom: 16, display: 'grid', gap: 12 }}>
        {gambarList.map((gambarItem, gambarIndex) => {
          const isObject = gambarItem && typeof gambarItem === 'object'
          const width = isObject ? (gambarItem.width || '75%') : '100%'
          const align = isObject ? (gambarItem.align || 'center') : 'center'
          const caption = isObject ? (gambarItem.caption || gambarItem.alt || '') : ''
          const size = isObject ? gambarItem.ukuran || 'sedang' : 'sedang'
          const maxHeight = size === 'besar' ? 320 : size === 'kecil' ? 140 : 250
          const imageSrc = getImageSrc(gambarItem)
          const imageAlt = stripHtml(caption || 'Gambar soal').trim() || 'Gambar soal'

          return (
            <div key={gambarIndex} style={{ display: 'flex', justifyContent: justifyByAlign(align), textAlign: align }}>
              <figure style={{ width, maxWidth: '100%', margin: 0 }}>
                <img
                  className="question-image-clickable"
                  src={imageSrc}
                  alt={imageAlt}
                  title="Klik untuk memperbesar gambar"
                  style={{
                    width: isObject ? '100%' : 'auto',
                    maxWidth: '100%',
                    maxHeight,
                    borderRadius: 8,
                    objectFit: 'contain',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                  }}
                  onClick={(event) => openImageZoom({
                    src: event.currentTarget.currentSrc || event.currentTarget.src || imageSrc,
                    alt: imageAlt,
                    caption
                  })}
                  onError={(e) => {
                    e.target.onerror = null
                    e.target.src = 'https://via.placeholder.com/400x200?text=Gambar+Tidak+Ditemukan'
                  }}
                />
                {caption && (
                  <figcaption style={{ marginTop: 6, fontSize: 12, color: '#64748B' }}>
                    {renderRichInline(caption)}
                  </figcaption>
                )}
              </figure>
            </div>
          )
        })}
      </div>
    )
  }

  const renderQuestionLayoutBlock = (soalItem, block, visibleTabelData) => {
    const metadata = getLayoutMetadata(soalItem)

    if (block.type === 'question') return renderQuestionText(soalItem.pertanyaan)
    if (block.type === 'stimulus') return renderQuestionText(soalItem.stimulus_tambahan || metadata?.stimulus_tambahan || '')
    if (block.type === 'image') return renderGambarData(soalItem)
    if (block.type === 'table') return renderTabelData(visibleTabelData)
    return null
  }

  const cekStatusDanAmbilSoal = async () => {
    try {
      const resStatus = await api.get(`/soal/status/${instrumenId}`)
      
      if (resStatus.data.data.sudahMengerjakan) {
        clearAnswerDraft()
        setSudahMengerjakan(true)
        setNilaiLama(resStatus.data.data.nilai)
        setLoading(false)
        return
      }
      
      const resInstrumen = await api.get(`/soal/kerjakan/${instrumenId}`)
      const dataInstrumen = resInstrumen.data.data

      if (dataInstrumen.instrumen.status !== 'aktif') {
        setError('Instrumen belum diaktifkan oleh guru.')
        setLoading(false)
        return
      }
      
      // ========== CEK DAN SET TIMER ==========
      const instrumenData = dataInstrumen.instrumen
      if (instrumenData.gunakan_batas_waktu === 1 && instrumenData.batas_waktu) {
        const waktuBatas = new Date(instrumenData.batas_waktu)
        const sekarang = new Date()
        const sisa = Math.floor((waktuBatas - sekarang) / 1000)
        
        if (sisa <= 0) {
          setWaktuHabis(true)
          setTimerExpired(true)
          setError('Batas waktu pengerjaan sudah habis. Anda tidak dapat mengerjakan instrumen ini.')
          setLoading(false)
          return
        }
        
        setSisaWaktu(sisa)
      }
      
      setInstrumen(instrumenData)
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(ACTIVE_CHATBOT_INSTRUMENT_KEY, String(instrumenId))
      }
      
      const parsedSoal = (dataInstrumen.soal || []).map(s => {
        let pernyataanChecklist = []
        let pasanganMenjodohkan = null
        let tabelData = normalizeTabelData(s.tabel_data)
        let gambarSoal = s.gambar_soal || s.gambar?.[0]?.file_name || s.gambar?.[0]?.src || null

        if (s.pernyataan_checklist) {
          try {
            pernyataanChecklist =
              typeof s.pernyataan_checklist === 'string'
                ? JSON.parse(s.pernyataan_checklist)
                : s.pernyataan_checklist
          } catch {
            pernyataanChecklist = []
          }
        }

        if (s.pasangan_menjodohkan) {
          try {
            pasanganMenjodohkan =
              typeof s.pasangan_menjodohkan === 'string'
                ? JSON.parse(s.pasangan_menjodohkan)
                : s.pasangan_menjodohkan
            if (
              pasanganMenjodohkan &&
              typeof pasanganMenjodohkan === 'object' &&
              !Array.isArray(pasanganMenjodohkan)
            ) {
              pasanganMenjodohkan = { ...pasanganMenjodohkan }
              delete pasanganMenjodohkan.kunci
              delete pasanganMenjodohkan.key_candidates
            }
          } catch {
            pasanganMenjodohkan = null
          }
        }

        return {
          ...s,
          gambar_soal: gambarSoal,
          tabel_data: tabelData,
          pernyataan_checklist: pernyataanChecklist,
          pasangan_menjodohkan: pasanganMenjodohkan
        }
      })

      setSoal(parsedSoal)
      
      const jawabanAwal = mergeAnswersWithDraft(parsedSoal, buildInitialAnswers(parsedSoal))
      setJawaban(jawabanAwal)
      
    } catch (err) {
      console.error(err)
      if (err.response?.status === 403) {
        if (err.response?.data?.expired) {
          setError('Batas waktu pengerjaan sudah habis.')
          setTimerExpired(true)
          setWaktuHabis(true)
        } else {
          setSudahMengerjakan(true)
          setNilaiLama(err.response?.data?.nilai)
        }
      } else {
        setError('Gagal memuat soal. Silakan coba lagi.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (soalId, value, tipeSoal, subIndex = null) => {
    if (waktuHabis) {
      setError('Waktu sudah habis, tidak dapat mengubah jawaban.')
      return
    }
    
   if (tipeSoal === 'ganda_kompleks') {
  const current = jawaban[soalId] || [];

  const soalAktif = soal.find(s => Number(s.id) === Number(soalId));
  const maksimalPilihan = Number(soalAktif?.maksimal_pilihan || 0);

  if (current.includes(value)) {
    setError('');
    setJawaban(prev => ({
      ...prev,
      [soalId]: current.filter(v => v !== value)
    }));
  } else {
    if (maksimalPilihan > 0 && current.length >= maksimalPilihan) {
      setError(`Soal ini hanya boleh memilih maksimal ${maksimalPilihan} jawaban.`);
      return;
    }

    setError('');
    setJawaban(prev => ({
      ...prev,
      [soalId]: [...current, value]
    }));
  }
}
    else if (tipeSoal === 'benar_salah') {
      setJawaban(prev => ({
        ...prev,
        [soalId]: {
          ...(prev[soalId] || {}),
          [subIndex]: value
        }
      }))
    }
    else if (tipeSoal === 'menjodohkan') {
      setJawaban(prev => ({ 
        ...prev, 
        [soalId]: { ...(prev[soalId] || {}), [subIndex]: value }
      }))
    }
    else {
      setJawaban(prev => ({ ...prev, [soalId]: value }))
    }
  }

  const isSoalAnswered = (soalItem, jawabanValue) => {
    if (soalItem.tipe_soal === 'ganda_kompleks') {
      return jawabanValue && jawabanValue.length > 0
    }
    if (soalItem.tipe_soal === 'benar_salah') {
      return (
        jawabanValue &&
        Object.keys(jawabanValue).length === soalItem.pernyataan_checklist.length
      )
    }
    if (soalItem.tipe_soal === 'menjodohkan') {
      // Di response siswa, kunci sudah sengaja dihapus dari backend agar tidak bocor.
      // Jadi jumlah jawaban dicek berdasarkan jumlah kolom kiri, bukan berdasarkan kunci.
      const jumlahPasangan = soalItem.pasangan_menjodohkan?.kolom_kiri?.length || 0
      return jumlahPasangan > 0 && Object.keys(jawabanValue || {}).length === jumlahPasangan
    }
    return jawabanValue && jawabanValue !== ''
  }

  const handleSubmit = async (isAutoSubmit = false) => {
    if (waktuHabis && !isAutoSubmit) {
      setError('Waktu sudah habis, tidak dapat mengirim jawaban.')
      return
    }
    
    const belumDijawab = soal.filter(s => !isSoalAnswered(s, jawaban[s.id]))
    
    if (belumDijawab.length > 0 && !isAutoSubmit) {
      const ok = await confirmToast(`Masih ada ${belumDijawab.length} soal belum dijawab. Tetap submit?`, {
        title: 'Jawaban Belum Lengkap',
        confirmText: 'Tetap Submit',
        tone: 'primary',
      })
      if (!ok) return
    }

    if (!isAutoSubmit) {
      const confirmSubmit = await confirmToast('Anda hanya bisa mengerjakan soal ini satu kali. Yakin ingin mengumpulkan jawaban?', {
        title: 'Kumpulkan Jawaban',
        confirmText: 'Kumpulkan',
        tone: 'danger',
      })
      if (!confirmSubmit) return
    }

    setSubmitting(true)
    setError('')
    
    try {
      const jawabanArray = soal.map(s => ({
        soal_id: s.id,
        jawaban: jawaban[s.id] || (s.tipe_soal === 'ganda_kompleks' ? [] : s.tipe_soal === 'menjodohkan' ? {} : '')
      }))
      
      const res = await api.post('/soal/submit', {
        instrumen_id: instrumenId,
        jawaban: jawabanArray
      })
      
      clearAnswerDraft()
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(ACTIVE_CHATBOT_INSTRUMENT_KEY)
      }
      setHasil(res.data.data)
    } catch (err) {
      console.error(err)
      if (err.response?.status === 403) {
        clearAnswerDraft()
        setError(err.response?.data?.message)
        setSudahMengerjakan(true)
      } else {
        setError(err.response?.data?.message || 'Gagal mengirim jawaban.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const sudahDijawab = soal.filter(s => isSoalAnswered(s, jawaban[s.id])).length

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner spinner-dark" /></div>
  }

  if (sudahMengerjakan) {
    return (
      <div className="page-content">
        <div className="card" style={{ maxWidth: 500, margin: '40px auto', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#DC2626' }}>Akses</div>
          <h2>Akses Ditolak</h2>
          <p>Anda sudah pernah mengerjakan soal ini.</p>
          <div style={{ background: '#ECFDF5', padding: 16, borderRadius: 12, margin: 16 }}>
            <div style={{ fontSize: 36, fontWeight: 700, color: '#10B981' }}>{nilaiLama}</div>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/instrumen')}>Kembali</button>
        </div>
      </div>
    )
  }

  if (timerExpired && !hasil) {
    return (
      <div className="page-content">
        <div className="card" style={{ maxWidth: 500, margin: '40px auto', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#DC2626' }}>Waktu</div>
          <h2>Waktu Habis!</h2>
          <p>Batas waktu pengerjaan instrumen ini sudah berakhir.</p>
          <p style={{ color: '#666', marginTop: 8 }}>Anda tidak dapat mengerjakan instrumen ini lagi.</p>
          <button className="btn btn-primary" onClick={() => navigate('/instrumen')}>Kembali</button>
        </div>
      </div>
    )
  }

  if (hasil) {
    return (
      <div className="page-content">
        <div className="card" style={{ maxWidth: 500, margin: '40px auto', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#185FA5' }}>Hasil</div>
          <h2>Ujian Selesai!</h2>
          <div style={{ fontSize: 48, fontWeight: 700, margin: 20 }}>{hasil.nilai}</div>
          <p>Benar: {hasil.total_benar} dari {hasil.total_soal} butir penilaian</p>
          <button className="btn btn-primary" onClick={() => navigate('/instrumen')}>Kembali</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-content">
      {/* Header dengan Timer */}
      <div className="card-header" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2>{instrumen?.judul}</h2>
            <p style={{ margin: 0 }}>{soal.length} soal - {instrumen?.mata_pelajaran} - Kelas {instrumen?.kelas}</p>
          </div>
          
          {/* ========== COUNTDOWN TIMER ========== */}
          {sisaWaktu !== null && sisaWaktu > 0 && (
            <div style={{ 
              textAlign: 'center',
              padding: '8px 16px',
              borderRadius: 12,
              background: getTimerColor() === '#dc2626' ? '#FEF2F2' : getTimerColor() === '#f59e0b' ? '#FFFBEB' : '#ECFDF5',
              border: `1px solid ${getTimerColor()}`,
              minWidth: 150
            }}>
              <div style={{ fontSize: 12, color: '#666' }}>Sisa Waktu</div>
              <div style={{ 
                fontSize: 24, 
                fontWeight: 'bold', 
                fontFamily: 'monospace',
                color: getTimerColor()
              }}>
                {formatWaktu(sisaWaktu)}
              </div>
            </div>
          )}
          
          <div className="badge badge-gray">{sudahDijawab}/{soal.length} dijawab</div>
        </div>
      </div>

      <div style={{ background: '#FEF3C7', padding: 12, borderRadius: 8, marginBottom: 20 }}><strong>Perhatian!</strong> Anda hanya bisa mengerjakan soal ini SATU KALI.
        {sisaWaktu !== null && sisaWaktu > 0 && (
          <span style={{ display: 'block', marginTop: 4, fontSize: 13 }}>
            Waktu pengerjaan terbatas. Jawaban akan otomatis dikirim jika waktu habis.
          </span>
        )}
      </div>

      {error && <div style={{ background: '#FEE2E2', padding: 12, borderRadius: 8, marginBottom: 16, color: '#DC2626' }}>{error}</div>}

      <div className="exam-instruction-box">
        <h3>Petunjuk Pengerjaan Soal</h3>
        <ol>
          <li>Bacalah setiap soal dengan teliti sebelum menjawab.</li>
          <li>Pastikan jawaban yang dipilih sesuai dengan instruksi pada soal.</li>
          <li>Untuk soal pilihan ganda, pilih satu jawaban yang paling benar.</li>
          <li>Untuk soal ganda kompleks atau benar-salah, perhatikan setiap pernyataan dengan cermat.</li>
          <li>Untuk soal menjodohkan, pasangkan jawaban sesuai dengan pasangan yang tepat.</li>
          <li>Perhatikan waktu pengerjaan yang tersedia pada bagian atas halaman.</li>
          <li>Periksa kembali seluruh jawaban sebelum menekan tombol kumpulkan jawaban.</li>
          <li>Setelah jawaban dikumpulkan, siswa tidak dapat mengubah jawaban lagi.</li>
        </ol>
      </div>

      <div className="student-question-view">
        {soal.map((s, i) => {
          const jawabanValue = jawaban[s.id]
          const visibleTabelData = getVisibleTabelData(s)
          const layoutBlocks = getQuestionLayoutBlocks(s, visibleTabelData)
          const sebabAkibatPernyataan = isSebabAkibatAnswerTemplate(s.pilihan_a) ? '' : (s.pilihan_a || '')
          const sebabAkibatSebab = isSebabAkibatAnswerTemplate(s.pilihan_b) ? '' : (s.pilihan_b || '')
          const showSebabAkibatParts =
            stripHtml(sebabAkibatPernyataan).trim() || stripHtml(sebabAkibatSebab).trim()
          
          return (
            <div key={s.id} className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: isSoalAnswered(s, jawabanValue) ? '#10B981' : '#E5E7EB',
                color: isSoalAnswered(s, jawabanValue) ? '#fff' : '#6B7280',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 12 }}>
                {layoutBlocks.map((block) => (
                  <div key={block.type}>
                    {renderQuestionLayoutBlock(s, block, visibleTabelData)}
                  </div>
                ))}
              </div>
            </div>

            {/* PILIHAN GANDA */}
            {s.tipe_soal === 'pilihan_ganda' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['A', 'B', 'C', 'D', ...(stripHtml(s.pilihan_e || '').trim() ? ['E'] : [])].map(opt => {
                  const teks = s[`pilihan_${opt.toLowerCase()}`]
                  if (!stripHtml(teks || '').trim()) return null
                  const dipilih = jawabanValue === opt
                  return (
                    <label key={opt} onClick={() => handleChange(s.id, opt, s.tipe_soal)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 8,
                        border: dipilih ? '2px solid #3B82F6' : '1px solid #E5E7EB',
                        background: dipilih ? '#EFF6FF' : '#fff', cursor: 'pointer' }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', border: dipilih ? '2px solid #3B82F6' : '1.5px solid #D1D5DB',
                        background: dipilih ? '#3B82F6' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {dipilih && <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff' }} />}
                      </div>
                      <span className="option-text"><strong>{opt}.</strong> {renderRichInline(teks)}</span>
                    </label>
                  )
                })}
              </div>
            )}

            {/* SEBAB AKIBAT */}
            {s.tipe_soal === 'sebab_akibat' && (
              <div>
                {showSebabAkibatParts && (
                  <div style={{ background: '#F3F4F6', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                    {stripHtml(sebabAkibatPernyataan).trim() && (
                      <div style={{ marginBottom: stripHtml(sebabAkibatSebab).trim() ? 8 : 0 }}>
                        <strong>Pernyataan:</strong> {renderRichInline(sebabAkibatPernyataan)}
                      </div>
                    )}
                    {stripHtml(sebabAkibatSebab).trim() && (
                      <div><strong>Sebab:</strong> {renderRichInline(sebabAkibatSebab)}</div>
                    )}
                  </div>
                )}
                <select className="select" value={jawabanValue || ''} 
                  onChange={(e) => handleChange(s.id, e.target.value, s.tipe_soal)}
                  style={{ width: '100%', padding: 10 }}>
                  <option value="">-- Pilih jawaban --</option>
                  <option className="option-text" value="A">A. Pernyataan benar, alasan benar, berhubungan</option>
                  <option className="option-text" value="B">B. Pernyataan benar, alasan benar, tidak berhubungan</option>
                  <option className="option-text" value="C">C. Pernyataan benar, alasan salah</option>
                  <option className="option-text" value="D">D. Pernyataan salah, alasan benar</option>
                </select>
              </div>
            )}

            {/* GANDA KOMPLEKS */}
            {s.tipe_soal === 'ganda_kompleks' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['A', 'B', 'C', 'D', ...(s.pilihan_e ? ['E'] : [])].map(opt => {
                  const teks = s[`pilihan_${opt.toLowerCase()}`]
                  if (!stripHtml(teks || '').trim()) return null
                  const isChecked = jawabanValue?.includes(opt) || false
                  return (
                    <label key={opt} onClick={() => handleChange(s.id, opt, s.tipe_soal)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 8,
                        border: isChecked ? '2px solid #3B82F6' : '1px solid #E5E7EB',
                        background: isChecked ? '#EFF6FF' : '#fff', cursor: 'pointer' }}>
                      <div style={{ width: 22, height: 22, borderRadius: 4, border: isChecked ? '2px solid #3B82F6' : '1.5px solid #D1D5DB',
                        background: isChecked ? '#3B82F6' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isChecked && <span style={{ color: '#fff', fontSize: 12 }}>V</span>}
                      </div>
                      <span className="option-text"><strong>{opt}.</strong> {renderRichInline(teks)}</span>
                    </label>
                  )
                })}
                <small>Pilih maksimal {s.maksimal_pilihan || 'beberapa'} jawaban.
</small>
              </div>
            )}

            {/* BENAR / SALAH TABEL */}
            {s.tipe_soal === 'benar_salah' && s.pernyataan_checklist && (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F3F4F6' }}>
                      <th style={{ padding: 10, border: '1px solid #E5E7EB' }}>No</th>
                      <th style={{ padding: 10, border: '1px solid #E5E7EB' }}>Pernyataan</th>
                      <th style={{ padding: 10, border: '1px solid #E5E7EB', textAlign: 'center' }}>Benar</th>
                      <th style={{ padding: 10, border: '1px solid #E5E7EB', textAlign: 'center' }}>Salah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.pernyataan_checklist.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: 10, border: '1px solid #E5E7EB', textAlign: 'center' }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: 10, border: '1px solid #E5E7EB' }}>
                          {renderRichInline(getStatementText(item))}
                        </td>
                        <td style={{ padding: 10, border: '1px solid #E5E7EB', textAlign: 'center' }}>
                          <input
                            type="radio"
                            name={`bs-${s.id}-${idx}`}
                            checked={jawabanValue?.[idx] === 'Benar'}
                            onChange={() => handleChange(s.id, 'Benar', s.tipe_soal, idx)}
                          />
                        </td>
                        <td style={{ padding: 10, border: '1px solid #E5E7EB', textAlign: 'center' }}>
                          <input
                            type="radio"
                            name={`bs-${s.id}-${idx}`}
                            checked={jawabanValue?.[idx] === 'Salah'}
                            onChange={() => handleChange(s.id, 'Salah', s.tipe_soal, idx)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <small>Pilih Benar atau Salah untuk setiap pernyataan</small>
              </div>
            )}

            {/* MENJODOHKAN */}
            {s.tipe_soal === 'menjodohkan' && s.pasangan_menjodohkan && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <h4 style={{ fontSize: 14, marginBottom: 8 }}>Pernyataan</h4>
                    {s.pasangan_menjodohkan.kolom_kiri?.map((item, idx) => (
                      <div key={idx} style={{ padding: 8, borderBottom: '1px solid #E5E7EB' }}>
                        {idx + 1}. {renderRichInline(getStatementText(item))}
                      </div>
                    ))}
                  </div>
                  <div>
                    <h4 style={{ fontSize: 14, marginBottom: 8 }}>Pilihan Jawaban</h4>
                    {s.pasangan_menjodohkan.kolom_kanan?.map((item, idx) => (
                      <div key={idx} style={{ padding: 8, borderBottom: '1px solid #E5E7EB' }}>
                        {getMatchingLabel(item, idx)}. {renderRichInline(getMatchingText(item))}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="form-label">Pasangkan pernyataan dengan jawaban yang tepat</label>
                  {s.pasangan_menjodohkan.kolom_kiri?.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <span style={{ width: 30 }}>{idx + 1}.</span>
                      <select className="select" value={jawabanValue?.[idx] || ''}
                        onChange={(e) => handleChange(s.id, e.target.value, s.tipe_soal, idx)}
                        style={{ flex: 1 }}>
                        <option className="option-text" value="">-- Pilih --</option>
                        {s.pasangan_menjodohkan.kolom_kanan?.map((opt, optIdx) => {
                          const label = getMatchingLabel(opt, optIdx)
                          const text = stripHtml(getMatchingText(opt))
                          return (
                            <option className="option-text" key={optIdx} value={label}>
                              {label}. {text.length > 70 ? `${text.substring(0, 70)}...` : text}
                            </option>
                          )
                        })}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
      </div>

      {/* Tombol Submit */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <span>{sudahDijawab === soal.length ? 'Semua soal sudah dijawab' : `${soal.length - sudahDijawab} soal belum dijawab`}</span>
        <button className="btn btn-primary" onClick={() => handleSubmit(false)} disabled={submitting || waktuHabis}
          style={{ background: (submitting || waktuHabis) ? '#9CA3AF' : '#3B82F6' }}>
          {submitting ? 'Mengirim...' : waktuHabis ? 'Waktu Habis' : 'Kumpulkan Jawaban'}
        </button>
      </div>

      {selectedImage && (
        <div className="image-zoom-modal" onClick={(event) => event.target === event.currentTarget && closeImageZoom()}>
          <div className="image-zoom-content">
            <div className="image-zoom-toolbar">
              <div>
                <strong>Pratinjau Gambar</strong>
                <span>{Math.round(imageZoom * 100)}%</span>
              </div>
              <div>
                <button type="button" onClick={zoomImageOut} disabled={imageZoom <= 0.5}>-</button>
                <button type="button" onClick={resetImageZoom}>Reset</button>
                <button type="button" onClick={zoomImageIn} disabled={imageZoom >= 3}>+</button>
                <button type="button" className="image-zoom-close" onClick={closeImageZoom}>Tutup</button>
              </div>
            </div>
            <div className="image-zoom-preview">
              <img
                src={selectedImage.src}
                alt={selectedImage.alt || 'Gambar soal'}
                style={{ transform: `scale(${imageZoom})` }}
              />
            </div>
            {selectedImage.caption && (
              <div className="image-zoom-caption">
                {renderRichInline(selectedImage.caption)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
