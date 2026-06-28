import { useEffect, useMemo, useState } from 'react'
import { BookOpenCheck, Search } from 'lucide-react'

import { bankSoalAPI, sekolahAPI } from '../api'
import ActionIcon from '../components/ActionIcon'
import { useAuth } from '../context/AuthContext'
import { sanitizeRichHtml, stripHtml } from '../utils/sanitizeHtml'
import { confirmToast, toast } from '../utils/notify'

const API_ASSET_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '')

const JENIS_OPTIONS = ['Literasi', 'Numerasi', 'HOTS']
const TIPE_OPTIONS = [
  { value: 'pilihan_ganda', label: 'Pilihan Ganda' },
  { value: 'ganda_kompleks', label: 'Ganda Kompleks' },
  { value: 'benar_salah', label: 'Benar/Salah' },
  { value: 'menjodohkan', label: 'Menjodohkan' },
  { value: 'sebab_akibat', label: 'Sebab-Akibat' },
]

const emptyFilters = {
  search: '',
  kelas: '',
  mata_pelajaran: '',
  jenis_instrumen: '',
  tipe_soal: '',
  materi: '',
  id_sekolah: '',
}

function normalizeRole(role) {
  return role === 'admin' ? 'admin_sekolah' : role
}

function parseJson(value, fallback = null) {
  try {
    if (!value) return fallback
    return typeof value === 'string' ? JSON.parse(value) : value
  } catch {
    return fallback
  }
}

function truncateText(value = '', max = 140) {
  const text = stripHtml(String(value || '')).replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text || '-'
  return `${text.slice(0, max).trim()}...`
}

function getTipeLabel(value = '') {
  return TIPE_OPTIONS.find(item => item.value === value)?.label || value || '-'
}

function getJenisBadge(value = '') {
  if (value === 'Literasi') return 'badge-blue'
  if (value === 'Numerasi') return 'badge-teal'
  if (value === 'HOTS') return 'badge-amber'
  return 'badge-gray'
}

function getTipeBadge(value = '') {
  if (value === 'pilihan_ganda') return 'badge-blue'
  if (value === 'ganda_kompleks') return 'badge-purple'
  if (value === 'benar_salah') return 'badge-teal'
  if (value === 'menjodohkan') return 'badge-amber'
  if (value === 'sebab_akibat') return 'badge-coral'
  return 'badge-gray'
}

function getImageSrc(gambar) {
  if (!gambar) return ''
  const value = typeof gambar === 'string'
    ? gambar
    : gambar.file_name || gambar.src || gambar.url || gambar.path || ''

  if (!value) return ''
  if (value.startsWith('http')) return value
  if (value.startsWith('/uploads')) return `${API_ASSET_URL}${value}`
  return `${API_ASSET_URL}/uploads/soal/${value}`
}

function isLayoutMetadataBlock(item = {}) {
  const role = String(item?.role || '').toLowerCase()
  const type = String(item?.type || '').toLowerCase()
  return role === 'layout_blocks' || type === 'layout_blocks' || Array.isArray(item?.layout_blocks)
}

function isStimulusBlock(item = {}) {
  const role = String(item?.role || '').toLowerCase()
  const type = String(item?.type || '').toLowerCase()
  return role === 'stimulus' || type === 'stimulus'
}

function normalizePlainText(value = '') {
  return stripHtml(String(value || '')).replace(/\s+/g, ' ').trim()
}

function getSingleCellText(item = {}) {
  if (!Array.isArray(item?.rows) || item.rows.length !== 1) return ''
  const firstRow = item.rows[0]
  if (!Array.isArray(firstRow) || firstRow.length !== 1) return ''
  return normalizePlainText(firstRow[0])
}

function getTableCollections(detail = {}) {
  const supportingTables = parseJson(detail.supporting_tables, null)
  const tableData = parseJson(detail.tabel_data, null)

  return [
    ...(Array.isArray(supportingTables) ? supportingTables : []),
    ...(Array.isArray(tableData) ? tableData : []),
    ...(!Array.isArray(supportingTables) && supportingTables ? [supportingTables] : []),
    ...(!Array.isArray(tableData) && tableData ? [tableData] : []),
  ]
}

function extractStimulusText(detail = {}) {
  const directStimulus = normalizePlainText(detail.stimulus_tambahan || '')
  if (directStimulus) return detail.stimulus_tambahan

  const stimulusBlock = getTableCollections(detail).find(item => (
    isStimulusBlock(item) && getSingleCellText(item)
  ))

  return stimulusBlock ? getSingleCellText(stimulusBlock) : ''
}

function isDisplayableSupportItem(item) {
  if (!item) return false
  if (typeof item === 'string') return normalizePlainText(item).length > 0
  if (typeof item !== 'object') return true
  if (isLayoutMetadataBlock(item)) return false

  if (Array.isArray(item.rows)) {
    return item.rows.some(row => {
      const cells = Array.isArray(row) ? row : [row]
      return cells.some(cell => normalizePlainText(cell))
    })
  }

  return Object.keys(item).length > 0
}

const HIDDEN_SUPPORT_KEYS = new Set([
  'id',
  'id_sekolah',
  'source_instrumen_id',
  'source_soal_id',
  'question_hash',
  'created_by',
  'created_at',
  'updated_at',
  'is_aktif',
])

const SUPPORT_META_KEYS = new Set(['role', 'type', 'caption', 'title', 'label', 'source', 'index', 'table_index'])

function getSupportTitle(item, index) {
  if (item && typeof item === 'object') {
    const title = item.caption || item.title || item.label
    if (title) return stripHtml(String(title))
    if (item.role) return `Konten ${stripHtml(String(item.role))}`
  }

  return `Konten pendukung ${index + 1}`
}

function normalizeRows(rows = []) {
  if (!Array.isArray(rows)) return []

  return rows
    .map(row => (Array.isArray(row) ? row : [row]))
    .filter(row => row.some(cell => normalizePlainText(cell)))
}

function formatSupportValue(value) {
  if (value == null || value === '') return '-'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

function renderRichText(value = '') {
  const source = String(value || '').trim()
  if (!source) return <span className="bank-soal-muted">-</span>

  return (
    <div
      className="bank-soal-rich-text"
      dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(source) }}
    />
  )
}

function renderAnswer(value, jsonValue) {
  if (value) return value

  const parsed = parseJson(jsonValue, jsonValue)
  if (!parsed) return '-'
  if (Array.isArray(parsed)) return parsed.join(', ')
  if (typeof parsed === 'object') {
    return Object.entries(parsed)
      .map(([key, val]) => `${Number(key) + 1 || key}: ${String(val)}`)
      .join(', ')
  }

  return String(parsed)
}

function DetailTable({ tables }) {
  const normalizedTables = Array.isArray(tables) ? tables : []
  if (!normalizedTables.length) return <span className="bank-soal-muted">Tidak ada tabel pendukung.</span>

  return (
    <div className="bank-soal-detail-tables">
      {normalizedTables.map((table, tableIndex) => {
        if (typeof table === 'string' || typeof table !== 'object') {
          return (
            <div className="bank-soal-table-wrap" key={tableIndex}>
              <div className="bank-soal-table-caption">{getSupportTitle(table, tableIndex)}</div>
              <div className="bank-soal-support-text">{renderRichText(String(table || ''))}</div>
            </div>
          )
        }
        
        if (Array.isArray(table.rows) && table.rows.length) {
          const rows = normalizeRows(table.rows)
          if (!rows.length) return null

          const isSingleTextCell = rows.length === 1 && rows[0].length === 1
          if (isSingleTextCell) {
            return (
              <div className="bank-soal-table-wrap" key={tableIndex}>
                <div className="bank-soal-table-caption">{getSupportTitle(table, tableIndex)}</div>
                <div className="bank-soal-support-text">{renderRichText(rows[0][0])}</div>
              </div>
            )
          }

          const hasHeader = rows.length > 1
          const header = hasHeader ? rows[0] : []
          const bodyRows = hasHeader ? rows.slice(1) : rows

          return (
            <div className="bank-soal-table-wrap" key={tableIndex}>
              <div className="bank-soal-table-caption">{getSupportTitle(table, tableIndex)}</div>
              <table className="table">
                {hasHeader && (
                  <thead>
                    <tr>{header.map((cell, idx) => <th key={idx}>{stripHtml(String(cell || ''))}</th>)}</tr>
                  </thead>
                )}
                <tbody>
                  {bodyRows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, idx) => <td key={idx}>{stripHtml(String(cell || ''))}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }

        if (table && typeof table === 'object') {
          const keys = Object.keys(table).filter(key => (
            !HIDDEN_SUPPORT_KEYS.has(key)
            && !SUPPORT_META_KEYS.has(key)
            && key !== 'rows'
            && key !== 'layout_blocks'
          ))
          if (!keys.length) return null
          return (
            <div className="bank-soal-table-wrap" key={tableIndex}>
              <div className="bank-soal-table-caption">{getSupportTitle(table, tableIndex)}</div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Isi</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map(key => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td>
                        <pre className="bank-soal-support-pre">{stripHtml(formatSupportValue(table[key]))}</pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }

        return null
      })}
    </div>
  )
}

export default function BankSoalPage() {
  const { user } = useAuth()
  const isSuperAdmin = normalizeRole(user?.peran) === 'super_admin'

  const [items, setItems] = useState([])
  const [summary, setSummary] = useState({})
  const [schools, setSchools] = useState([])
  const [filters, setFilters] = useState(emptyFilters)
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters)
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, total_pages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  const buildParams = (extra = {}) => {
    const params = { page, limit: 10, ...extra }
    Object.entries(appliedFilters).forEach(([key, value]) => {
      if (value) params[key] = value
    })
    if (!isSuperAdmin) delete params.id_sekolah
    return params
  }

  const fetchData = async () => {
    setLoading(true)
    setError('')

    try {
      const params = buildParams()
      const summaryParams = { ...params }
      delete summaryParams.page
      delete summaryParams.limit

      const [listRes, summaryRes] = await Promise.all([
        bankSoalAPI.getList(params),
        bankSoalAPI.getSummary(summaryParams),
      ])

      setItems(listRes.data.data || [])
      setMeta(listRes.data.meta || { page, limit: 10, total: 0, total_pages: 1 })
      setSummary(summaryRes.data.data || {})
    } catch (err) {
      setItems([])
      setError(err.response?.data?.message || 'Data Bank Soal belum dapat dimuat.')
    } finally {
      setLoading(false)
    }
  }

  const fetchSchools = async () => {
    if (!isSuperAdmin) return
    try {
      const res = await sekolahAPI.getAll()
      setSchools(res.data.data || [])
    } catch {
      setSchools([])
    }
  }

  useEffect(() => {
    fetchSchools()
  }, [isSuperAdmin])

  useEffect(() => {
    fetchData()
  }, [page, appliedFilters])

  const classOptions = useMemo(() => {
    const values = new Set(items.map(item => item.kelas).filter(Boolean))
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'id-ID'))
  }, [items])

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }))
  }

  const applyFilters = () => {
    setPage(1)
    setAppliedFilters({ ...filters })
  }

  const resetFilters = () => {
    setFilters(emptyFilters)
    setAppliedFilters(emptyFilters)
    setPage(1)
  }

  const openDetail = async (item) => {
    setDetail(item)
    setDetailLoading(true)
    setDetailError('')

    try {
      const res = await bankSoalAPI.getDetail(item.id)
      setDetail(res.data.data)
    } catch (err) {
      setDetailError(err.response?.data?.message || 'Detail soal belum dapat dimuat.')
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    setDetail(null)
    setDetailError('')
    setDetailLoading(false)
  }

  const handleDelete = async (item) => {
    const ok = await confirmToast('Data tidak akan dihapus permanen.', {
      title: 'Nonaktifkan Soal Bank Soal',
      confirmText: 'Nonaktifkan',
      tone: 'danger',
    })
    if (!ok) return

    setDeletingId(item.id)
    setError('')

    try {
      await bankSoalAPI.delete(item.id)
      if (detail?.id === item.id) closeDetail()
      toast.success('Soal berhasil dinonaktifkan dari Bank Soal.')
      fetchData()
    } catch (err) {
      setError(err.response?.data?.message || 'Soal Bank Soal gagal dinonaktifkan.')
      toast.error(err.response?.data?.message || 'Soal Bank Soal gagal dinonaktifkan.')
    } finally {
      setDeletingId(null)
    }
  }

  const tableData = useMemo(() => {
    if (!detail) return []
    const uniqueTables = []
    const seen = new Set()

    getTableCollections(detail)
      .filter(isDisplayableSupportItem)
      .forEach(item => {
        const key = JSON.stringify(item)
        if (seen.has(key)) return
        seen.add(key)
        uniqueTables.push(item)
      })

    return uniqueTables
  }, [detail])

  const stimulusText = useMemo(() => (
    detail ? extractStimulusText(detail) : ''
  ), [detail])

  const mediaData = useMemo(() => {
    if (!detail) return []
    const media = parseJson(detail.media, detail.media)
    const list = Array.isArray(media) ? [...media] : (media ? [media] : [])
    if (detail.gambar_soal && !list.some(item => JSON.stringify(item) === JSON.stringify(detail.gambar_soal))) {
      list.push(detail.gambar_soal)
    }
    return list
  }, [detail])

  return (
    <div className="bank-soal-page">
      <section className="bank-soal-header">
        <div>
          <div className="dashboard-eyebrow">Bank Soal</div>
          <h2>Bank Soal</h2>
          <p>Kumpulan soal yang tersimpan otomatis dari instrumen aktif dan dapat digunakan kembali.</p>
        </div>
      </section>

      <section className="bank-soal-summary-grid">
        <SummaryCard label="Total Soal" value={summary.total_soal || 0} tone="blue" />
        <SummaryCard label="Literasi" value={summary.total_literasi || 0} tone="teal" />
        <SummaryCard label="Numerasi" value={summary.total_numerasi || 0} tone="purple" />
        <SummaryCard label="HOTS" value={summary.total_hots || 0} tone="amber" />
      </section>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="bank-soal-filter-card">
        <div className="bank-soal-filter-head">
          <div>
            <h3>Filter Bank Soal</h3>
            <p>Saring soal berdasarkan kelas, mapel, jenis, tipe soal, dan kata kunci.</p>
          </div>
        </div>

        <div className="bank-soal-filter-grid">
          {isSuperAdmin && (
            <label>
              Sekolah
              <select className="select" value={filters.id_sekolah} onChange={event => handleFilterChange('id_sekolah', event.target.value)}>
                <option value="">Semua sekolah</option>
                {schools.map(school => (
                  <option key={school.id} value={school.id}>{school.nama_sekolah}</option>
                ))}
              </select>
            </label>
          )}

          <label className="bank-soal-search-field">
            Kata kunci
            <div className="search-input-wrap">
              <Search className="bank-soal-search-icon" size={16} />
              <input
                className="input"
                value={filters.search}
                onChange={event => handleFilterChange('search', event.target.value)}
                onKeyDown={event => event.key === 'Enter' && applyFilters()}
                placeholder="Cari pertanyaan atau opsi"
              />
            </div>
          </label>

          <label>
            Kelas
            <input
              className="input"
              list="bank-soal-class-list"
              value={filters.kelas}
              onChange={event => handleFilterChange('kelas', event.target.value)}
              placeholder="Contoh: VII-A"
            />
            <datalist id="bank-soal-class-list">
              {classOptions.map(item => <option key={item} value={item} />)}
            </datalist>
          </label>

          <label>
            Mata Pelajaran
            <input
              className="input"
              value={filters.mata_pelajaran}
              onChange={event => handleFilterChange('mata_pelajaran', event.target.value)}
              placeholder="IPA, Matematika..."
            />
          </label>

          <label>
            Jenis Instrumen
            <select className="select" value={filters.jenis_instrumen} onChange={event => handleFilterChange('jenis_instrumen', event.target.value)}>
              <option value="">Semua jenis</option>
              {JENIS_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label>
            Tipe Soal
            <select className="select" value={filters.tipe_soal} onChange={event => handleFilterChange('tipe_soal', event.target.value)}>
              <option value="">Semua tipe</option>
              {TIPE_OPTIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>

          <label>
            Materi/Topik
            <input
              className="input"
              value={filters.materi}
              onChange={event => handleFilterChange('materi', event.target.value)}
              placeholder="Materi atau topik"
            />
          </label>
        </div>

        <div className="bank-soal-filter-actions">
          <button className="btn btn-primary" onClick={applyFilters}>
            <ActionIcon name="filter" />
            Terapkan Filter
          </button>
          <button className="btn" onClick={resetFilters}>
            <ActionIcon name="reset" />
            Reset Filter
          </button>
        </div>
      </section>

      <section className="bank-soal-table-card">
        <div className="bank-soal-table-head">
          <div>
            <h3>Daftar Soal</h3>
            <p>{meta.total || 0} soal aktif pada Bank Soal</p>
          </div>
        </div>

        {loading ? (
          <div className="bank-soal-loading">
            <div className="spinner spinner-dark" />
            Memuat Bank Soal...
          </div>
        ) : items.length === 0 ? (
          <div className="bank-soal-empty">
            <BookOpenCheck size={38} />
            <h3>Bank Soal masih kosong</h3>
            <p>Soal akan otomatis masuk ke Bank Soal setelah instrumen diaktifkan.</p>
          </div>
        ) : (
          <>
            <div className="bank-soal-table-wrap">
              <table className="bank-soal-table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Preview Pertanyaan</th>
                    <th>Kelas</th>
                    <th>Mata Pelajaran</th>
                    <th>Jenis Instrumen</th>
                    <th>Tipe Soal</th>
                    <th>Materi/Topik</th>
                    <th>Sumber Instrumen</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id}>
                      <td>{((meta.page || page) - 1) * (meta.limit || 10) + index + 1}</td>
                      <td>
                        <div className="bank-soal-question-preview">{truncateText(item.pertanyaan)}</div>
                        {isSuperAdmin && item.nama_sekolah && <div className="bank-soal-muted">{item.nama_sekolah}</div>}
                      </td>
                      <td>{item.kelas || '-'}</td>
                      <td>{item.mata_pelajaran || '-'}</td>
                      <td><span className={`badge ${getJenisBadge(item.jenis_instrumen)}`}>{item.jenis_instrumen || '-'}</span></td>
                      <td><span className={`badge ${getTipeBadge(item.tipe_soal)}`}>{getTipeLabel(item.tipe_soal)}</span></td>
                      <td>{item.materi || item.topik || '-'}</td>
                      <td title={item.source_instrumen_judul || ''}>{truncateText(item.source_instrumen_judul || 'Instrumen asal', 50)}</td>
                      <td>
                        <div className="bank-soal-actions">
                          <button className="btn btn-sm" onClick={() => openDetail(item)}>
                            <ActionIcon name="detail" size={14} />
                            Detail
                          </button>
                          <button className="btn btn-sm btn-danger-soft" onClick={() => handleDelete(item)} disabled={deletingId === item.id}>
                            <ActionIcon name="delete" size={14} />
                            {deletingId === item.id ? 'Memproses...' : 'Nonaktifkan'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bank-soal-pagination">
              <span>Halaman {meta.page || page} dari {Math.max(1, meta.total_pages || 1)}</span>
              <div>
                <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(prev => Math.max(1, prev - 1))}>
                  <ActionIcon name="previous" size={14} />
                  Sebelumnya
                </button>
                <button className="btn btn-sm" disabled={page >= (meta.total_pages || 1)} onClick={() => setPage(prev => prev + 1)}>
                  Berikutnya
                  <ActionIcon name="next" size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {detail && (
        <div className="modal-overlay" onClick={event => event.target === event.currentTarget && closeDetail()}>
          <div className="modal bank-soal-detail-modal">
            <div className="bank-soal-detail-head">
              <div>
                <div className="modal-title">Detail Soal Bank Soal</div>
                <p>Pratinjau lengkap soal yang tersimpan di Bank Soal.</p>
              </div>
              <button className="btn btn-sm" onClick={closeDetail}><ActionIcon name="cancel" size={14} /> Tutup</button>
            </div>

            {detailLoading ? (
              <div className="bank-soal-loading">
                <div className="spinner spinner-dark" />
                Memuat detail...
              </div>
            ) : detailError ? (
              <div className="alert alert-error">{detailError}</div>
            ) : (
              <div className="bank-soal-detail-content">
                <div className="bank-soal-detail-meta">
                  <span className={`badge ${getJenisBadge(detail.jenis_instrumen)}`}>{detail.jenis_instrumen || '-'}</span>
                  <span className={`badge ${getTipeBadge(detail.tipe_soal)}`}>{getTipeLabel(detail.tipe_soal)}</span>
                  <span className="badge badge-gray">Kelas {detail.kelas || '-'}</span>
                  <span className="badge badge-gray">{detail.mata_pelajaran || '-'}</span>
                </div>

                <DetailSection title="Pertanyaan">
                  {renderRichText(detail.pertanyaan)}
                </DetailSection>

                {stimulusText && (
                  <DetailSection title="Stimulus">
                    {renderRichText(stimulusText)}
                  </DetailSection>
                )}

                <DetailSection title="Gambar/Media">
                  {mediaData.length ? (
                    <div className="bank-soal-media-grid">
                      {mediaData.map((media, index) => {
                        const caption = typeof media === 'object' ? (media.caption || media.alt || '') : ''
                        return (
                          <figure key={index}>
                            <img src={getImageSrc(media)} alt={caption || `Media soal ${index + 1}`} />
                            {caption && <figcaption>{stripHtml(caption)}</figcaption>}
                          </figure>
                        )
                      })}
                    </div>
                  ) : (
                    <span className="bank-soal-muted">Tidak ada gambar/media.</span>
                  )}
                </DetailSection>

                <DetailSection title="Tabel Pendukung">
                  <DetailTable tables={tableData} />
                </DetailSection>

                <DetailSection title="Opsi Jawaban">
                  <div className="bank-soal-options">
                    {['a', 'b', 'c', 'd', 'e'].map(label => {
                      const value = detail[`pilihan_${label}`]
                      if (!value) return null
                      return (
                        <div key={label}>
                          <strong>{label.toUpperCase()}.</strong>
                          {renderRichText(value)}
                        </div>
                      )
                    })}
                    {!['a', 'b', 'c', 'd', 'e'].some(label => detail[`pilihan_${label}`]) && (
                      <span className="bank-soal-muted">Tidak ada opsi pilihan.</span>
                    )}
                  </div>
                </DetailSection>

                <DetailSection title="Kunci dan Informasi Soal">
                  <div className="bank-soal-detail-grid">
                    <InfoItem label="Jawaban benar" value={renderAnswer(detail.jawaban_benar, detail.jawaban_benar_json)} />
                    <InfoItem label="Bobot" value={detail.bobot || 1} />
                    <InfoItem label="Materi" value={detail.materi || '-'} />
                    <InfoItem label="Topik" value={detail.topik || '-'} />
                  </div>
                </DetailSection>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, tone }) {
  return (
    <div className="bank-soal-summary-card">
      <div className={`bank-soal-summary-icon ${tone}`}>
        <BookOpenCheck size={18} />
      </div>
      <div>
        <div className="bank-soal-summary-label">{label}</div>
        <div className="bank-soal-summary-value">{value}</div>
      </div>
    </div>
  )
}

function DetailSection({ title, children }) {
  return (
    <section className="bank-soal-detail-section">
      <h4>{title}</h4>
      {children}
    </section>
  )
}

function InfoItem({ label, value }) {
  return (
    <div className="bank-soal-info-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
