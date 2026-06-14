import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { sekolahAPI, superAdminAPI } from '../api'

const JENIS = ['Literasi', 'Numerasi', 'HOTS']
const STATUS = ['draft', 'aktif', 'nonaktif']

export default function SuperAdminMonitoringPage() {
  const navigate = useNavigate()
  const [monitoring, setMonitoring] = useState([])
  const [schools, setSchools] = useState([])
  const [selectedSchool, setSelectedSchool] = useState('')
  const [selectedJenis, setSelectedJenis] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedTeacher, setSelectedTeacher] = useState('')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

      const [monitoringRes, schoolRes] = await Promise.all([
        superAdminAPI.getMonitoring(params),
        sekolahAPI.getAll(),
      ])

      setMonitoring(monitoringRes.data.data || [])
      setSchools(schoolRes.data.data || [])
    } catch (err) {
      setMonitoring([])
      setError(err.response?.data?.message || 'Data monitoring global belum dapat dimuat.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [selectedSchool, selectedJenis, selectedStatus, selectedClass, selectedTeacher, appliedSearch])

  const classOptions = useMemo(() => {
    const classes = new Set()
    monitoring.forEach(item => {
      if (item.kelas) classes.add(item.kelas)
    })
    return Array.from(classes).sort((a, b) => a.localeCompare(b, 'id-ID'))
  }, [monitoring])

  const teacherOptions = useMemo(() => {
    const teachers = new Map()
    monitoring.forEach(item => {
      if (item.id_guru && item.nama_guru) {
        teachers.set(String(item.id_guru), item.nama_guru)
      }
    })

    return Array.from(teachers.entries())
      .map(([id, nama]) => ({ id, nama }))
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id-ID'))
  }, [monitoring])

  const summary = useMemo(() => {
    let target = 0
    let sudah = 0
    let belum = 0
    let totalPengerjaan = 0
    let totalNilai = 0
    let totalKetuntasan = 0

    monitoring.forEach(item => {
      const rowTarget = Number(item.jumlah_siswa_kelas || 0)
      const rowSudah = Number(item.sudah_mengerjakan || item.total_pengerjaan || 0)
      const rowBelum = Number(item.belum_mengerjakan || 0)
      const rowPengerjaan = Number(item.total_pengerjaan || 0)
      const rata = item.rata_rata_nilai === null || item.rata_rata_nilai === undefined
        ? null
        : Number(item.rata_rata_nilai)
      const ketuntasan = item.ketuntasan === null || item.ketuntasan === undefined
        ? null
        : Number(item.ketuntasan)

      target += rowTarget
      sudah += rowSudah
      belum += rowBelum
      totalPengerjaan += rowPengerjaan
      if (rowPengerjaan > 0 && rata !== null) totalNilai += rata * rowPengerjaan
      if (rowPengerjaan > 0 && ketuntasan !== null) totalKetuntasan += ketuntasan * rowPengerjaan
    })

    return {
      totalInstrumen: monitoring.length,
      aktif: monitoring.filter(item => item.status === 'aktif').length,
      target,
      sudah,
      belum,
      rataRata: totalPengerjaan > 0 ? totalNilai / totalPengerjaan : null,
      ketuntasan: totalPengerjaan > 0 ? totalKetuntasan / totalPengerjaan : null,
    }
  }, [monitoring])

  const handleSchoolChange = (value) => {
    setSelectedSchool(value)
    setSelectedClass('')
    setSelectedTeacher('')
  }

  const handleSearch = () => {
    setAppliedSearch(search.trim())
  }

  const openDetail = (item) => {
    navigate(`/super-admin/monitoring/${item.id_instrumen || item.id}`)
  }

  const openBelumMengerjakan = (item) => {
    navigate(`/super-admin/monitoring/${item.id_instrumen || item.id}?view=belum`)
  }

  return (
    <div className="school-page super-monitoring-page">
      <section className="school-header">
        <div>
          <div className="dashboard-eyebrow">Super Admin</div>
          <h2>Monitoring Global</h2>
          <p>Pantau pengerjaan instrumen dari seluruh sekolah berdasarkan sekolah, kelas, guru, dan jenis instrumen.</p>
        </div>
      </section>

      <section className="school-summary-grid monitoring-summary-grid">
        <SummaryCard label="Total Instrumen" value={summary.totalInstrumen} note="pada filter saat ini" />
        <SummaryCard label="Instrumen Aktif" value={summary.aktif} note="siap dikerjakan" />
        <SummaryCard label="Total Siswa Target" value={summary.target} note="sesuai kelas instrumen" />
        <SummaryCard label="Sudah Mengerjakan" value={summary.sudah} note="hasil siswa tersimpan" />
        <SummaryCard label="Belum Mengerjakan" value={summary.belum} note="target yang belum selesai" />
        <SummaryCard label="Rata-rata Nilai" value={summary.rataRata} note="global/filter" score />
        <SummaryCard label="Ketuntasan" value={summary.ketuntasan} note="nilai minimal 75" percent />
      </section>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="school-table-card">
        <div className="school-table-head monitoring-table-head">
          <div>
            <h3>Daftar Monitoring</h3>
            <p>{monitoring.length} instrumen pada filter saat ini</p>
          </div>

          <div className="monitoring-controls">
            <div className="admin-school-filter">
              <label htmlFor="monitoring-school-filter">Filter sekolah</label>
              <select
                id="monitoring-school-filter"
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

            <div className="monitoring-filter">
              <label htmlFor="monitoring-jenis-filter">Filter jenis</label>
              <select
                id="monitoring-jenis-filter"
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

            <div className="monitoring-filter">
              <label htmlFor="monitoring-status-filter">Filter status</label>
              <select
                id="monitoring-status-filter"
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

            <div className="monitoring-filter">
              <label htmlFor="monitoring-class-filter">Filter kelas</label>
              <select
                id="monitoring-class-filter"
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

            <div className="monitoring-filter teacher-picker">
              <label htmlFor="monitoring-teacher-filter">Filter guru</label>
              <select
                id="monitoring-teacher-filter"
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

            <div className="monitoring-search">
              <label htmlFor="monitoring-search">Cari monitoring</label>
              <div className="teacher-search-row">
                <input
                  id="monitoring-search"
                  className="input"
                  placeholder="Judul, sekolah, guru, kelas"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  onKeyDown={event => event.key === 'Enter' && handleSearch()}
                />
                <button className="btn" onClick={handleSearch}>Cari</button>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner spinner-dark" />
          </div>
        ) : monitoring.length === 0 ? (
          <div className="empty">
            <div className="empty-text">
              Belum ada data pengerjaan siswa.<br />
              Data monitoring akan muncul setelah siswa mengerjakan instrumen.
            </div>
          </div>
        ) : (
          <div className="school-table-wrap">
            <table className="super-monitoring-table">
              <thead>
                <tr>
                  <th>Sekolah</th>
                  <th>Instrumen</th>
                  <th>Jenis</th>
                  <th>Kelas</th>
                  <th>Guru</th>
                  <th>Status</th>
                  <th>Target Siswa</th>
                  <th>Sudah Mengerjakan</th>
                  <th>Belum Mengerjakan</th>
                  <th>Rata-rata Nilai</th>
                  <th>Ketuntasan</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {monitoring.map(item => (
                  <tr key={item.id_instrumen || item.id}>
                    <td>
                      <div className="school-name-cell">{item.nama_sekolah || 'Belum terhubung ke sekolah'}</div>
                    </td>
                    <td>
                      <div className="instrument-title-cell">{item.judul || '-'}</div>
                      <div className="instrument-sub-cell">
                        {item.mata_pelajaran || '-'}
                        {item.terakhir_dikerjakan ? ` - Terakhir ${formatDateTime(item.terakhir_dikerjakan)}` : ''}
                      </div>
                    </td>
                    <td><JenisBadge jenis={item.jenis} /></td>
                    <td>{item.kelas || '-'}</td>
                    <td>{item.nama_guru || '-'}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td>{formatNumber(item.jumlah_siswa_kelas)}</td>
                    <td>{formatNumber(item.sudah_mengerjakan)}</td>
                    <td>{formatNumber(item.belum_mengerjakan)}</td>
                    <td>{formatScore(item.rata_rata_nilai)}</td>
                    <td>{formatPercent(item.ketuntasan)}</td>
                    <td>
                      <div className="school-actions monitoring-actions">
                        <button className="btn btn-sm" onClick={() => openDetail(item)}>Detail Monitoring</button>
                        <button className="btn btn-sm" onClick={() => openBelumMengerjakan(item)}>Lihat Belum Mengerjakan</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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

  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
