import { useEffect, useMemo, useState } from 'react'

import { sekolahAPI, superAdminAPI } from '../api'

const JENIS = ['Literasi', 'Numerasi', 'HOTS']
const STATUS = ['draft', 'aktif', 'nonaktif']

function getEmptyReport() {
  return {
    summary: {
      kkm: 75,
      total_sekolah: 0,
      total_instrumen: 0,
      total_instrumen_aktif: 0,
      total_siswa: 0,
      total_pengerjaan: 0,
      rata_rata_nilai: null,
      ketuntasan: null,
      siswa_tuntas: 0,
      siswa_belum_tuntas: 0,
    },
    rekap_sekolah: [],
    rekap_instrumen: [],
    rekap_siswa: [],
    analisis_tipe: [],
    rekomendasi: {
      items: [],
      siswa_belum_tuntas: [],
    },
  }
}

export default function SuperAdminLaporanPage() {
  const [report, setReport] = useState(getEmptyReport)
  const [schools, setSchools] = useState([])
  const [selectedSchool, setSelectedSchool] = useState('')
  const [selectedJenis, setSelectedJenis] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedTeacher, setSelectedTeacher] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  const buildParams = () => {
    const params = {}
    if (selectedSchool) params.id_sekolah = selectedSchool
    if (selectedJenis) params.jenis = selectedJenis
    if (selectedStatus) params.status = selectedStatus
    if (selectedClass) params.kelas = selectedClass
    if (selectedTeacher) params.guru = selectedTeacher.trim()
    if (startDate) params.tanggal_mulai = startDate
    if (endDate) params.tanggal_selesai = endDate
    if (appliedSearch) params.search = appliedSearch
    return params
  }

  const fetchData = async () => {
    setLoading(true)
    setError('')

    try {
      const [reportRes, schoolRes] = await Promise.all([
        superAdminAPI.getLaporanGlobal(buildParams()),
        sekolahAPI.getAll(),
      ])

      setReport(reportRes.data.data || getEmptyReport())
      setSchools(schoolRes.data.data || [])
    } catch (err) {
      setReport(getEmptyReport())
      setError(err.response?.data?.message || 'Data laporan global belum dapat dimuat.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [
    selectedSchool,
    selectedJenis,
    selectedStatus,
    selectedClass,
    selectedTeacher,
    startDate,
    endDate,
    appliedSearch,
  ])

  const classOptions = useMemo(() => {
    const classes = new Set()
    report.rekap_instrumen.forEach(item => {
      if (item.kelas) classes.add(item.kelas)
    })
    report.rekap_siswa.forEach(item => {
      if (item.kelas && item.kelas !== 'Belum diisi') classes.add(item.kelas)
    })

    return Array.from(classes).sort((a, b) => a.localeCompare(b, 'id-ID'))
  }, [report])

  const handleSchoolChange = (value) => {
    setSelectedSchool(value)
    setSelectedClass('')
    setSelectedTeacher('')
  }

  const handleSearch = () => {
    setAppliedSearch(search.trim())
  }

  const resetFilters = () => {
    setSelectedSchool('')
    setSelectedJenis('')
    setSelectedStatus('')
    setSelectedClass('')
    setSelectedTeacher('')
    setStartDate('')
    setEndDate('')
    setSearch('')
    setAppliedSearch('')
  }

  const exportExcel = async () => {
    setExporting(true)
    setError('')

    try {
      const res = await superAdminAPI.exportLaporanExcel(buildParams())
      const blob = new Blob([res.data], {
        type: res.headers['content-type'] || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = getDownloadFilename(res.headers['content-disposition'])
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.message || 'Export Excel belum berhasil dibuat.')
    } finally {
      setExporting(false)
    }
  }

  const summary = report.summary || getEmptyReport().summary
  const hasAnyData = summary.total_instrumen > 0 || summary.total_pengerjaan > 0 || report.rekap_sekolah.length > 0

  return (
    <div className="school-page super-laporan-page">
      <section className="school-header laporan-header">
        <div>
          <div className="dashboard-eyebrow">Super Admin</div>
          <h2>Laporan Global</h2>
          <p>Rekap hasil penggunaan instrumen dari seluruh sekolah berdasarkan nilai, ketuntasan, instrumen, dan pengerjaan siswa.</p>
        </div>

        <div className="laporan-export-actions">
          <button className="btn btn-primary" onClick={exportExcel} disabled={loading || exporting}>
            {exporting ? 'Membuat Excel...' : 'Export Excel'}
          </button>
          <button className="btn" disabled title="Export PDF akan ditambahkan pada tahap berikutnya.">
            Export PDF
          </button>
        </div>
      </section>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="school-table-card">
        <div className="school-table-head laporan-table-head">
          <div>
            <h3>Filter Laporan</h3>
            <p>Jika sekolah dikosongkan, laporan menampilkan seluruh sekolah.</p>
          </div>

          <div className="laporan-controls">
            <div className="laporan-filter wide">
              <label htmlFor="laporan-school-filter">Sekolah</label>
              <select
                id="laporan-school-filter"
                className="select"
                value={selectedSchool}
                onChange={event => handleSchoolChange(event.target.value)}
              >
                <option value="">Semua sekolah</option>
                {schools.map(school => (
                  <option key={school.id} value={school.id}>{school.nama_sekolah}</option>
                ))}
              </select>
            </div>

            <div className="laporan-filter">
              <label htmlFor="laporan-jenis-filter">Jenis</label>
              <select
                id="laporan-jenis-filter"
                className="select"
                value={selectedJenis}
                onChange={event => setSelectedJenis(event.target.value)}
              >
                <option value="">Semua jenis</option>
                {JENIS.map(jenis => <option key={jenis} value={jenis}>{jenis}</option>)}
              </select>
            </div>

            <div className="laporan-filter">
              <label htmlFor="laporan-status-filter">Status</label>
              <select
                id="laporan-status-filter"
                className="select"
                value={selectedStatus}
                onChange={event => setSelectedStatus(event.target.value)}
              >
                <option value="">Semua status</option>
                {STATUS.map(status => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>

            <div className="laporan-filter">
              <label htmlFor="laporan-class-filter">Kelas</label>
              <select
                id="laporan-class-filter"
                className="select"
                value={selectedClass}
                onChange={event => setSelectedClass(event.target.value)}
              >
                <option value="">Semua kelas</option>
                {classOptions.map(kelas => <option key={kelas} value={kelas}>{kelas}</option>)}
              </select>
            </div>

            <div className="laporan-filter wide">
              <label htmlFor="laporan-teacher-filter">Guru</label>
              <input
                id="laporan-teacher-filter"
                className="input"
                placeholder="Nama atau ID guru"
                value={selectedTeacher}
                onChange={event => setSelectedTeacher(event.target.value)}
              />
            </div>

            <div className="laporan-filter">
              <label htmlFor="laporan-start-date">Tanggal mulai</label>
              <input
                id="laporan-start-date"
                type="date"
                className="input"
                value={startDate}
                onChange={event => setStartDate(event.target.value)}
              />
            </div>

            <div className="laporan-filter">
              <label htmlFor="laporan-end-date">Tanggal selesai</label>
              <input
                id="laporan-end-date"
                type="date"
                className="input"
                value={endDate}
                onChange={event => setEndDate(event.target.value)}
              />
            </div>

            <div className="laporan-search">
              <label htmlFor="laporan-search">Search</label>
              <div className="teacher-search-row">
                <input
                  id="laporan-search"
                  className="input"
                  placeholder="Judul, sekolah, guru, kelas"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  onKeyDown={event => event.key === 'Enter' && handleSearch()}
                />
                <button className="btn" onClick={handleSearch}>Cari</button>
                <button className="btn" onClick={resetFilters}>Reset</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="school-summary-grid laporan-summary-grid">
        <SummaryCard label="Total Sekolah" value={summary.total_sekolah} note="pada filter saat ini" />
        <SummaryCard label="Total Instrumen" value={summary.total_instrumen} note="seluruh status" />
        <SummaryCard label="Instrumen Aktif" value={summary.total_instrumen_aktif} note="siap dikerjakan" />
        <SummaryCard label="Total Siswa" value={summary.total_siswa} note="siswa aktif" />
        <SummaryCard label="Total Pengerjaan" value={summary.total_pengerjaan} note="hasil siswa tersimpan" />
        <SummaryCard label="Rata-rata Nilai" value={summary.rata_rata_nilai} note="berdasarkan pengerjaan" score />
        <SummaryCard label="Ketuntasan" value={summary.ketuntasan} note={`KKM ${summary.kkm || 75}`} percent />
        <SummaryCard label="Siswa Tuntas" value={summary.siswa_tuntas} note="nilai minimal 75" />
        <SummaryCard label="Belum Tuntas" value={summary.siswa_belum_tuntas} note="nilai di bawah 75" />
      </section>

      {loading ? (
        <section className="school-table-card">
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner spinner-dark" />
          </div>
        </section>
      ) : !hasAnyData ? (
        <section className="school-table-card">
          <div className="empty">
            <div className="empty-text">Belum ada data laporan pada filter ini.</div>
          </div>
        </section>
      ) : (
        <>
          <ReportTableSection
            title="Rekap Per Sekolah"
            description={`${report.rekap_sekolah.length} sekolah pada filter saat ini`}
          >
            {report.rekap_sekolah.length === 0 ? (
              <EmptyReport />
            ) : (
              <div className="school-table-wrap">
                <table className="laporan-school-table">
                  <thead>
                    <tr>
                      <th>Sekolah</th>
                      <th>Jumlah Guru</th>
                      <th>Jumlah Siswa</th>
                      <th>Jumlah Instrumen</th>
                      <th>Instrumen Aktif</th>
                      <th>Total Pengerjaan</th>
                      <th>Rata-rata Nilai</th>
                      <th>Ketuntasan</th>
                      <th>Siswa Tuntas</th>
                      <th>Siswa Belum Tuntas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rekap_sekolah.map(item => (
                      <tr key={item.id_sekolah || item.nama_sekolah}>
                        <td><div className="school-name-cell">{item.nama_sekolah || '-'}</div></td>
                        <td>{formatNumber(item.jumlah_guru)}</td>
                        <td>{formatNumber(item.jumlah_siswa)}</td>
                        <td>{formatNumber(item.jumlah_instrumen)}</td>
                        <td>{formatNumber(item.instrumen_aktif)}</td>
                        <td>{formatNumber(item.total_pengerjaan)}</td>
                        <td>{formatScore(item.rata_rata_nilai)}</td>
                        <td>{formatPercent(item.ketuntasan)}</td>
                        <td>{formatNumber(item.siswa_tuntas)}</td>
                        <td>{formatNumber(item.siswa_belum_tuntas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ReportTableSection>

          <ReportTableSection
            title="Rekap Instrumen"
            description={`${report.rekap_instrumen.length} instrumen pada filter saat ini`}
          >
            {report.rekap_instrumen.length === 0 ? (
              <EmptyReport />
            ) : (
              <div className="school-table-wrap">
                <table className="laporan-instrument-table">
                  <thead>
                    <tr>
                      <th>Sekolah</th>
                      <th>Judul Instrumen</th>
                      <th>Jenis</th>
                      <th>Mapel</th>
                      <th>Kelas</th>
                      <th>Guru</th>
                      <th>Status</th>
                      <th>Jumlah Soal</th>
                      <th>Total Pengerjaan</th>
                      <th>Rata-rata Nilai</th>
                      <th>Ketuntasan</th>
                      <th>Nilai Tertinggi</th>
                      <th>Nilai Terendah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rekap_instrumen.map(item => (
                      <tr key={item.id_instrumen}>
                        <td><div className="school-name-cell">{item.nama_sekolah || '-'}</div></td>
                        <td><div className="instrument-title-cell">{item.judul || '-'}</div></td>
                        <td><JenisBadge jenis={item.jenis} /></td>
                        <td>{item.mata_pelajaran || '-'}</td>
                        <td>{item.kelas || '-'}</td>
                        <td>{item.nama_guru || '-'}</td>
                        <td><StatusBadge status={item.status} /></td>
                        <td>{formatNumber(item.jumlah_soal)}</td>
                        <td>{formatNumber(item.total_pengerjaan)}</td>
                        <td>{formatScore(item.rata_rata_nilai)}</td>
                        <td>{formatPercent(item.ketuntasan)}</td>
                        <td>{formatScore(item.nilai_tertinggi)}</td>
                        <td>{formatScore(item.nilai_terendah)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ReportTableSection>

          <ReportTableSection
            title="Rekap Siswa Ringkas"
            description={`${report.rekap_siswa.length} siswa ditampilkan, dibatasi maksimal 500 baris`}
          >
            {report.rekap_siswa.length === 0 ? (
              <EmptyReport />
            ) : (
              <div className="school-table-wrap">
                <table className="laporan-student-table">
                  <thead>
                    <tr>
                      <th>Sekolah</th>
                      <th>Kelas</th>
                      <th>Nama Siswa</th>
                      <th>Jumlah Instrumen Dikerjakan</th>
                      <th>Rata-rata Nilai</th>
                      <th>Nilai Tertinggi</th>
                      <th>Nilai Terendah</th>
                      <th>Status Ketuntasan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rekap_siswa.map(item => (
                      <tr key={`${item.id_siswa}-${item.nama_sekolah}`}>
                        <td><div className="school-name-cell">{item.nama_sekolah || '-'}</div></td>
                        <td>{item.kelas || '-'}</td>
                        <td>{item.nama_siswa || '-'}</td>
                        <td>{formatNumber(item.jumlah_instrumen_dikerjakan)}</td>
                        <td>{formatScore(item.rata_rata_nilai)}</td>
                        <td>{formatScore(item.nilai_tertinggi)}</td>
                        <td>{formatScore(item.nilai_terendah)}</td>
                        <td><CompletionBadge status={item.status_ketuntasan} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ReportTableSection>

          <ReportTableSection
            title="Analisis Tipe Soal Global"
            description={`${report.analisis_tipe.length} kelompok tipe soal berdasarkan sekolah`}
          >
            {report.analisis_tipe.length === 0 ? (
              <EmptyReport />
            ) : (
              <div className="school-table-wrap">
                <table className="laporan-type-table">
                  <thead>
                    <tr>
                      <th>Sekolah</th>
                      <th>Tipe Soal</th>
                      <th>Total Soal/Butir</th>
                      <th>Rata-rata Persentase Benar</th>
                      <th>Kategori</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.analisis_tipe.map(item => (
                      <tr key={`${item.id_sekolah}-${item.tipe_soal}`}>
                        <td><div className="school-name-cell">{item.nama_sekolah || '-'}</div></td>
                        <td>{formatTipeSoal(item.tipe_soal)}</td>
                        <td>{formatNumber(item.total_soal)}</td>
                        <td>{formatPercent(item.rata_rata_persentase_benar)}</td>
                        <td>{item.kategori || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ReportTableSection>

          <section className="school-table-card">
            <div className="school-table-head">
              <h3>Rekomendasi Global</h3>
              <p>Ringkasan sederhana dari data pada filter saat ini</p>
            </div>
            <div className="laporan-recommendations">
              {(report.rekomendasi?.items || []).map((item, index) => (
                <div className="laporan-recommendation" key={`${item}-${index}`}>
                  {item}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function ReportTableSection({ title, description, children }) {
  return (
    <section className="school-table-card">
      <div className="school-table-head">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {children}
    </section>
  )
}

function EmptyReport() {
  return (
    <div className="empty compact-report-empty">
      <div className="empty-text">Belum ada data laporan pada filter ini.</div>
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

function CompletionBadge({ status }) {
  const isDone = status === 'Tuntas'
  return (
    <span className={`badge ${isDone ? 'badge-teal' : 'badge-amber'}`}>
      <span className={`dot ${isDone ? 'dot-green' : 'dot-amber'}`} />
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

function formatTipeSoal(value) {
  return String(value || '-').replace(/_/g, ' ')
}

function getDownloadFilename(disposition) {
  const match = /filename="?([^"]+)"?/i.exec(disposition || '')
  if (match?.[1]) return match[1]

  const date = new Date()
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `laporan-global-smiasb-${yyyy}${mm}${dd}.xlsx`
}
