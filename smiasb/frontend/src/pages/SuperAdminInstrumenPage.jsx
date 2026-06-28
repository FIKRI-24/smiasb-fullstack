import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { sekolahAPI, superAdminAPI } from '../api'
import ActionIcon from '../components/ActionIcon'

const JENIS = ['Literasi', 'Numerasi', 'HOTS']
const STATUS = ['draft', 'aktif', 'nonaktif']

export default function SuperAdminInstrumenPage() {
  const navigate = useNavigate()
  const [instruments, setInstruments] = useState([])
  const [schools, setSchools] = useState([])
  const [selectedSchool, setSelectedSchool] = useState('')
  const [selectedJenis, setSelectedJenis] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedTeacher, setSelectedTeacher] = useState('')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [detailInstrument, setDetailInstrument] = useState(null)

  const fetchData = async () => {
    setLoading(true)
    setError('')

    try {
      const params = {}
      if (selectedSchool) params.id_sekolah = selectedSchool
      if (selectedJenis) params.jenis = selectedJenis
      if (selectedStatus) params.status = selectedStatus
      if (selectedClass) params.kelas = selectedClass
      if (selectedTeacher) params.guru = selectedTeacher
      if (appliedSearch) params.search = appliedSearch

      const [instrumentRes, schoolRes] = await Promise.all([
        superAdminAPI.getInstrumen(params),
        sekolahAPI.getAll(),
      ])

      setInstruments(instrumentRes.data.data || [])
      setSchools(schoolRes.data.data || [])
    } catch (err) {
      setInstruments([])
      setError(err.response?.data?.message || 'Data instrumen belum dapat dimuat.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [selectedSchool, selectedJenis, selectedStatus, selectedClass, selectedTeacher, appliedSearch])

  const classOptions = useMemo(() => {
    const classes = new Set()
    instruments.forEach(item => {
      if (item.kelas) classes.add(item.kelas)
    })
    return Array.from(classes).sort((a, b) => a.localeCompare(b, 'id-ID'))
  }, [instruments])

  const teacherOptions = useMemo(() => {
    const teachers = new Map()
    instruments.forEach(item => {
      if (item.id_guru && item.nama_guru) {
        teachers.set(String(item.id_guru), item.nama_guru)
      }
    })

    return Array.from(teachers.entries())
      .map(([id, nama]) => ({ id, nama }))
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id-ID'))
  }, [instruments])

  const summary = useMemo(() => {
    let totalPengerjaan = 0
    let totalNilai = 0
    let totalKetuntasan = 0

    instruments.forEach(item => {
      const jumlah = Number(item.jumlah_pengerjaan || 0)
      const rata = item.rata_rata_nilai === null || item.rata_rata_nilai === undefined
        ? null
        : Number(item.rata_rata_nilai)
      const ketuntasan = item.ketuntasan === null || item.ketuntasan === undefined
        ? null
        : Number(item.ketuntasan)

      if (jumlah > 0) {
        totalPengerjaan += jumlah
        if (rata !== null) totalNilai += rata * jumlah
        if (ketuntasan !== null) totalKetuntasan += ketuntasan * jumlah
      }
    })

    return {
      total: instruments.length,
      aktif: instruments.filter(item => item.status === 'aktif').length,
      pengerjaan: totalPengerjaan,
      rataRata: totalPengerjaan > 0 ? totalNilai / totalPengerjaan : null,
      ketuntasan: totalPengerjaan > 0 ? totalKetuntasan / totalPengerjaan : null,
    }
  }, [instruments])

  const handleSchoolChange = (value) => {
    setSelectedSchool(value)
    setSelectedClass('')
    setSelectedTeacher('')
  }

  const handleSearch = () => {
    setAppliedSearch(search.trim())
  }

  const openDetail = async (instrument) => {
    setDetailInstrument(instrument)
    setDetailLoading(true)
    setDetailError('')

    try {
      const res = await superAdminAPI.getInstrumenDetail(instrument.id)
      setDetailInstrument(res.data.data)
    } catch (err) {
      setDetailError(err.response?.data?.message || 'Detail instrumen belum dapat dimuat.')
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    setDetailInstrument(null)
    setDetailError('')
    setDetailLoading(false)
  }

  const goToMonitoring = (instrument) => {
    navigate(`/super-admin/monitoring/${instrument.id}`)
  }

  return (
    <div className="school-page super-instrument-page">
      <section className="school-header">
        <div>
          <div className="dashboard-eyebrow">Super Admin</div>
          <h2>Data Instrumen</h2>
          <p>Melihat instrumen dari seluruh sekolah berdasarkan sekolah, jenis, status, kelas, dan guru.</p>
        </div>
      </section>

      <section className="school-summary-grid instrument-summary-grid">
        <SummaryCard label="Total Instrumen" value={summary.total} note="pada filter saat ini" />
        <SummaryCard label="Instrumen Aktif" value={summary.aktif} note="siap dikerjakan" />
        <SummaryCard label="Total Pengerjaan" value={summary.pengerjaan} note="hasil siswa tersimpan" />
        <SummaryCard label="Rata-rata Nilai" value={summary.rataRata} note="berdasarkan pengerjaan" score />
        <SummaryCard label="Ketuntasan Rata-rata" value={summary.ketuntasan} note="nilai minimal 75" percent />
      </section>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="school-table-card">
        <div className="school-table-head instrument-table-head">
          <div>
            <h3>Daftar Instrumen</h3>
            <p>{instruments.length} instrumen pada filter saat ini</p>
          </div>

          <div className="instrument-controls">
            <div className="admin-school-filter">
              <label htmlFor="instrument-school-filter">Filter sekolah</label>
              <select
                id="instrument-school-filter"
                className="select"
                value={selectedSchool}
                onChange={event => handleSchoolChange(event.target.value)}
              >
                <option value="">Semua sekolah</option>
                {schools.map(school => (
                  <option key={school.id} value={school.id}>
                    {school.nama_sekolah}
                  </option>
                ))}
              </select>
            </div>

            <div className="instrument-filter">
              <label htmlFor="instrument-jenis-filter">Filter jenis</label>
              <select
                id="instrument-jenis-filter"
                className="select"
                value={selectedJenis}
                onChange={event => setSelectedJenis(event.target.value)}
              >
                <option value="">Semua jenis</option>
                {JENIS.map(jenis => (
                  <option key={jenis} value={jenis}>{jenis}</option>
                ))}
              </select>
            </div>

            <div className="instrument-filter">
              <label htmlFor="instrument-status-filter">Filter status</label>
              <select
                id="instrument-status-filter"
                className="select"
                value={selectedStatus}
                onChange={event => setSelectedStatus(event.target.value)}
              >
                <option value="">Semua status</option>
                {STATUS.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>

            <div className="instrument-filter">
              <label htmlFor="instrument-class-filter">Filter kelas</label>
              <select
                id="instrument-class-filter"
                className="select"
                value={selectedClass}
                onChange={event => setSelectedClass(event.target.value)}
              >
                <option value="">Semua kelas</option>
                {classOptions.map(kelas => (
                  <option key={kelas} value={kelas}>{kelas}</option>
                ))}
              </select>
            </div>

            <div className="instrument-filter teacher-picker">
              <label htmlFor="instrument-teacher-filter">Filter guru</label>
              <select
                id="instrument-teacher-filter"
                className="select"
                value={selectedTeacher}
                onChange={event => setSelectedTeacher(event.target.value)}
              >
                <option value="">Semua guru</option>
                {teacherOptions.map(teacher => (
                  <option key={teacher.id} value={teacher.id}>{teacher.nama}</option>
                ))}
              </select>
            </div>

            <div className="instrument-search">
              <label htmlFor="instrument-search">Cari instrumen</label>
              <div className="teacher-search-row">
                <input
                  id="instrument-search"
                  className="input"
                  placeholder="Judul, mapel, guru, sekolah"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  onKeyDown={event => event.key === 'Enter' && handleSearch()}
                />
                <button className="btn" onClick={handleSearch}>
                  <ActionIcon name="search" />
                  Cari
                </button>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner spinner-dark" />
          </div>
        ) : instruments.length === 0 ? (
          <div className="empty">
            <div className="empty-text">Data instrumen akan tampil setelah guru membuat instrumen.</div>
          </div>
        ) : (
          <div className="school-table-wrap">
            <table className="super-instrument-table">
              <thead>
                <tr>
                  <th>Sekolah</th>
                  <th>Judul Instrumen</th>
                  <th>Jenis</th>
                  <th>Mata Pelajaran</th>
                  <th>Kelas</th>
                  <th>Guru Pembuat</th>
                  <th>Jumlah Soal</th>
                  <th>Status</th>
                  <th>Pengerjaan</th>
                  <th>Rata-rata Nilai</th>
                  <th>Ketuntasan</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {instruments.map(instrument => (
                  <tr key={instrument.id}>
                    <td>
                      <div className="school-name-cell">{instrument.nama_sekolah || 'Belum terhubung ke sekolah'}</div>
                    </td>
                    <td>
                      <div className="instrument-title-cell">{instrument.judul || '-'}</div>
                      <div className="instrument-sub-cell">
                        {formatNumber(instrument.sudah_mengerjakan)} sudah, {formatNumber(instrument.belum_mengerjakan)} belum
                      </div>
                    </td>
                    <td><JenisBadge jenis={instrument.jenis} /></td>
                    <td>{instrument.mata_pelajaran || '-'}</td>
                    <td>{instrument.kelas || '-'}</td>
                    <td>{instrument.nama_guru || '-'}</td>
                    <td>{formatNumber(instrument.jumlah_soal)}</td>
                    <td><StatusBadge status={instrument.status} /></td>
                    <td>{formatNumber(instrument.jumlah_pengerjaan)}</td>
                    <td>{formatScore(instrument.rata_rata_nilai)}</td>
                    <td>{formatPercent(instrument.ketuntasan)}</td>
                    <td>
                      <div className="school-actions instrument-actions">
                        <button className="btn btn-sm" onClick={() => openDetail(instrument)}>
                          <ActionIcon name="detail" size={14} />
                          Detail
                        </button>
                        <button className="btn btn-sm" onClick={() => goToMonitoring(instrument)}>
                          <ActionIcon name="preview" size={14} />
                          Lihat Monitoring
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detailInstrument && (
        <InstrumentDetailModal
          instrument={detailInstrument}
          loading={detailLoading}
          error={detailError}
          onClose={closeDetail}
          onOpenMonitoring={goToMonitoring}
        />
      )}
    </div>
  )
}

function SummaryCard({ label, value, note, score = false, percent = false }) {
  const displayValue = percent ? formatPercent(value) : score ? formatScore(value) : formatNumber(value)

  return (
    <div className="school-summary-card">
      <div className="school-summary-label">{label}</div>
      <div className="school-summary-value">{displayValue}</div>
      <div className="school-summary-note">{note}</div>
    </div>
  )
}

function InstrumentDetailModal({ instrument, loading, error, onClose, onOpenMonitoring }) {
  const results = instrument.hasil_siswa || []

  return (
    <div className="modal-overlay" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="modal instrument-modal">
        <div className="modal-title">Detail Instrumen</div>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="school-detail-grid">
          <DetailItem label="Judul Instrumen" value={instrument.judul} wide />
          <DetailItem label="Sekolah" value={instrument.nama_sekolah} />
          <DetailItem label="Guru Pembuat" value={instrument.nama_guru} />
          <DetailItem label="Jenis" value={instrument.jenis} />
          <DetailItem label="Mata Pelajaran" value={instrument.mata_pelajaran} />
          <DetailItem label="Kelas" value={instrument.kelas} />
          <DetailItem label="Status" value={instrument.status} />
          <DetailItem label="Jumlah Soal" value={formatNumber(instrument.jumlah_soal)} />
          <DetailItem label="Jumlah Pengerjaan" value={formatNumber(instrument.jumlah_pengerjaan)} />
          <DetailItem label="Rata-rata Nilai" value={formatScore(instrument.rata_rata_nilai)} />
          <DetailItem label="Ketuntasan" value={formatPercent(instrument.ketuntasan)} />
          <DetailItem label="Siswa Kelas" value={formatNumber(instrument.jumlah_siswa_kelas)} />
          <DetailItem label="Belum Mengerjakan" value={formatNumber(instrument.belum_mengerjakan)} />
        </div>

        <div className="teacher-detail-section">
          <div className="teacher-detail-head">
            <h3>Hasil Siswa</h3>
            <p>Daftar ringkas siswa yang sudah mengerjakan instrumen ini</p>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}>
              <div className="spinner spinner-dark" />
            </div>
          ) : results.length === 0 ? (
            <div className="super-empty compact">Belum ada siswa yang mengerjakan instrumen ini.</div>
          ) : (
            <div className="instrument-result-list">
              {results.map(item => (
                <div className="instrument-result-item" key={item.id}>
                  <div>
                    <strong>{item.nama_siswa || '-'}</strong>
                    <span>NIS {item.nis || '-'} - Kelas {item.kelas || '-'}</span>
                  </div>
                  <div className="instrument-result-meta">
                    <span>Nilai {formatScore(item.nilai)}</span>
                    <span>{formatDateTime(item.waktu_selesai)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            <ActionIcon name="cancel" />
            Tutup
          </button>
          <button className="btn btn-primary" onClick={() => onOpenMonitoring(instrument)}>
            <ActionIcon name="preview" />
            Lihat Monitoring
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailItem({ label, value, wide = false }) {
  return (
    <div className={wide ? 'school-detail-item wide' : 'school-detail-item'}>
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  )
}

function JenisBadge({ jenis }) {
  const color = {
    HOTS: 'badge-blue',
    Literasi: 'badge-teal',
    Numerasi: 'badge-amber',
  }[jenis] || 'badge-gray'

  return <span className={`badge ${color}`}>{jenis || '-'}</span>
}

function StatusBadge({ status }) {
  const color = {
    aktif: 'badge-teal',
    draft: 'badge-amber',
    nonaktif: 'badge-red',
  }[status] || 'badge-gray'

  return (
    <span className={`badge ${color}`}>
      <span className={`dot ${status === 'aktif' ? 'dot-green' : status === 'nonaktif' ? 'dot-red' : 'dot-amber'}`} />
      {status || '-'}
    </span>
  )
}

function formatNumber(value) {
  return new Intl.NumberFormat('id-ID').format(Number(value || 0))
}

function formatScore(value) {
  if (value === null || value === undefined || value === '') return '-'
  return Number(value).toLocaleString('id-ID', { maximumFractionDigits: 1 })
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return '-'
  return `${Number(value).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
