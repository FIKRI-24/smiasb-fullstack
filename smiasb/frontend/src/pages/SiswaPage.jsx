import { useEffect, useMemo, useState } from 'react'

import { sekolahAPI, superAdminAPI } from '../api'

export default function SiswaPage() {
  const [students, setStudents] = useState([])
  const [schools, setSchools] = useState([])
  const [classSummary, setClassSummary] = useState([])
  const [selectedSchool, setSelectedSchool] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [detailStudent, setDetailStudent] = useState(null)

  const fetchData = async () => {
    setLoading(true)
    setError('')

    try {
      const studentParams = {}
      if (selectedSchool) studentParams.id_sekolah = selectedSchool
      if (selectedClass) studentParams.kelas = selectedClass
      if (selectedStatus) studentParams.status = selectedStatus
      if (appliedSearch) studentParams.search = appliedSearch

      const classParams = {}
      if (selectedSchool) classParams.id_sekolah = selectedSchool
      if (selectedStatus) classParams.status = selectedStatus
      if (appliedSearch) classParams.search = appliedSearch

      const [studentRes, schoolRes, classRes] = await Promise.all([
        superAdminAPI.getSiswa(studentParams),
        sekolahAPI.getAll(),
        superAdminAPI.getSiswaKelasSummary(classParams),
      ])

      setStudents(studentRes.data.data || [])
      setSchools(schoolRes.data.data || [])
      setClassSummary(classRes.data.data || [])
    } catch (err) {
      setStudents([])
      setClassSummary([])
      setError(err.response?.data?.message || 'Data siswa belum dapat dimuat.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [selectedSchool, selectedClass, selectedStatus, appliedSearch])

  const classOptions = useMemo(() => {
    const classes = new Set()

    classSummary.forEach(item => {
      if (item.kelas && item.kelas !== 'Belum diisi') {
        classes.add(item.kelas)
      }
    })

    return Array.from(classes).sort((a, b) => a.localeCompare(b, 'id-ID'))
  }, [classSummary])

  const summary = useMemo(() => {
    const kelasSet = new Set()
    let totalPengerjaan = 0
    let totalNilai = 0

    students.forEach(student => {
      kelasSet.add(`${student.id_sekolah || 'tanpa-sekolah'}:${student.kelas || 'tanpa-kelas'}`)

      const jumlah = Number(student.jumlah_instrumen_dikerjakan || 0)
      const rata = student.rata_rata_nilai === null || student.rata_rata_nilai === undefined
        ? null
        : Number(student.rata_rata_nilai)

      if (jumlah > 0 && rata !== null) {
        totalPengerjaan += jumlah
        totalNilai += rata * jumlah
      }
    })

    return {
      total: students.length,
      aktif: students.filter(student => student.is_aktif).length,
      kelas: kelasSet.size,
      rataRata: totalPengerjaan > 0 ? totalNilai / totalPengerjaan : null,
    }
  }, [students])

  const handleSchoolChange = (value) => {
    setSelectedSchool(value)
    setSelectedClass('')
  }

  const handleSearch = () => {
    setAppliedSearch(search.trim())
  }

  const openDetail = async (student) => {
    setDetailStudent(student)
    setDetailLoading(true)
    setDetailError('')

    try {
      const res = await superAdminAPI.getSiswaDetail(student.id_user)
      setDetailStudent(res.data.data)
    } catch (err) {
      setDetailError(err.response?.data?.message || 'Detail siswa belum dapat dimuat.')
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    setDetailStudent(null)
    setDetailError('')
    setDetailLoading(false)
  }

  return (
    <div className="school-page student-page">
      <section className="school-header">
        <div>
          <div className="dashboard-eyebrow">Super Admin</div>
          <h2>Data Siswa</h2>
          <p>Melihat data siswa berdasarkan sekolah dan kelas.</p>
        </div>
      </section>

      <section className="school-summary-grid student-summary-grid">
        <SummaryCard label="Total Siswa" value={summary.total} note="pada filter saat ini" />
        <SummaryCard label="Siswa Aktif" value={summary.aktif} note="akun aktif" />
        <SummaryCard label="Jumlah Kelas" value={summary.kelas} note="kombinasi sekolah dan kelas" />
        <SummaryCard label="Rata-rata Nilai" value={summary.rataRata} note="berdasarkan pengerjaan" score />
      </section>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="school-table-card">
        <div className="school-table-head student-table-head">
          <div>
            <h3>Daftar Siswa</h3>
            <p>{students.length} siswa pada filter saat ini</p>
          </div>

          <div className="student-controls">
            <div className="admin-school-filter">
              <label htmlFor="student-school-filter">Filter sekolah</label>
              <select
                id="student-school-filter"
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

            <div className="student-filter">
              <label htmlFor="student-class-filter">Filter kelas</label>
              <select
                id="student-class-filter"
                className="select"
                value={selectedClass}
                onChange={event => setSelectedClass(event.target.value)}
              >
                <option value="">Semua kelas</option>
                {classOptions.map(kelas => (
                  <option key={kelas} value={kelas}>
                    {kelas}
                  </option>
                ))}
              </select>
            </div>

            <div className="student-filter">
              <label htmlFor="student-status-filter">Filter status</label>
              <select
                id="student-status-filter"
                className="select"
                value={selectedStatus}
                onChange={event => setSelectedStatus(event.target.value)}
              >
                <option value="">Semua status</option>
                <option value="aktif">Aktif</option>
                <option value="nonaktif">Nonaktif</option>
              </select>
            </div>

            <div className="student-search">
              <label htmlFor="student-search">Cari siswa</label>
              <div className="teacher-search-row">
                <input
                  id="student-search"
                  className="input"
                  placeholder="Nama, email, atau NIS"
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
        ) : students.length === 0 ? (
          <div className="empty">
            <div className="empty-text">Data siswa akan tampil setelah admin sekolah menambahkan siswa.</div>
          </div>
        ) : (
          <div className="school-table-wrap">
            <table className="student-table">
              <thead>
                <tr>
                  <th>Sekolah</th>
                  <th>Kelas</th>
                  <th>Nama Siswa</th>
                  <th>Email/Username</th>
                  <th>NIS</th>
                  <th>Status</th>
                  <th>Instrumen Dikerjakan</th>
                  <th>Rata-rata Nilai</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {students.map(student => (
                  <tr key={student.id_user}>
                    <td>
                      <div className="school-name-cell">{student.nama_sekolah || 'Belum terhubung ke sekolah'}</div>
                    </td>
                    <td>{student.kelas || '-'}</td>
                    <td>
                      <div className="school-name-cell">{student.nama}</div>
                    </td>
                    <td>{student.email || '-'}</td>
                    <td>{student.nis || '-'}</td>
                    <td>
                      <StatusBadge active={student.is_aktif} />
                    </td>
                    <td>{formatNumber(student.jumlah_instrumen_dikerjakan)}</td>
                    <td>{formatScore(student.rata_rata_nilai)}</td>
                    <td>
                      <div className="school-actions student-actions">
                        <button className="btn btn-sm" onClick={() => openDetail(student)}>Detail</button>
                        <button className="btn btn-sm" onClick={() => openDetail(student)}>Lihat Riwayat</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detailStudent && (
        <StudentDetailModal
          student={detailStudent}
          loading={detailLoading}
          error={detailError}
          onClose={closeDetail}
        />
      )}
    </div>
  )
}

function SummaryCard({ label, value, note, score = false }) {
  return (
    <div className="school-summary-card">
      <div className="school-summary-label">{label}</div>
      <div className="school-summary-value">{score ? formatScore(value) : formatNumber(value)}</div>
      <div className="school-summary-note">{note}</div>
    </div>
  )
}

function StudentDetailModal({ student, loading, error, onClose }) {
  const history = student.riwayat_pengerjaan || []

  return (
    <div className="modal-overlay" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="modal student-modal">
        <div className="modal-title">Detail Siswa</div>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="school-detail-grid">
          <DetailItem label="Nama Siswa" value={student.nama} />
          <DetailItem label="Sekolah" value={student.nama_sekolah} />
          <DetailItem label="Kelas" value={student.kelas} />
          <DetailItem label="Email/Username" value={student.email} />
          <DetailItem label="NIS" value={student.nis} />
          <DetailItem label="Status" value={student.is_aktif ? 'Aktif' : 'Nonaktif'} />
          <DetailItem label="Instrumen Dikerjakan" value={formatNumber(student.jumlah_instrumen_dikerjakan)} />
          <DetailItem label="Rata-rata Nilai" value={formatScore(student.rata_rata_nilai)} />
          <DetailItem label="Nilai Tertinggi" value={formatScore(student.nilai_tertinggi)} />
          <DetailItem label="Nilai Terendah" value={formatScore(student.nilai_terendah)} />
        </div>

        <div className="teacher-detail-section">
          <div className="teacher-detail-head">
            <h3>Riwayat Pengerjaan</h3>
            <p>Daftar instrumen yang sudah dikerjakan siswa ini</p>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}>
              <div className="spinner spinner-dark" />
            </div>
          ) : history.length === 0 ? (
            <div className="super-empty compact">Belum ada riwayat pengerjaan.</div>
          ) : (
            <div className="student-history-list">
              {history.map(item => (
                <div className="student-history-item" key={item.id}>
                  <div>
                    <strong>{item.instrumen || '-'}</strong>
                    <span>{item.jenis || '-'} - Kelas {item.kelas || '-'}</span>
                  </div>
                  <div className="student-history-meta">
                    <span>Nilai {formatScore(item.nilai)}</span>
                    <span>{formatDateTime(item.tanggal_mengerjakan)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  )
}

function DetailItem({ label, value }) {
  return (
    <div className="school-detail-item">
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  )
}

function StatusBadge({ active }) {
  return (
    <span className={`badge ${active ? 'badge-teal' : 'badge-red'}`}>
      <span className={`dot ${active ? 'dot-green' : 'dot-red'}`} />
      {active ? 'Aktif' : 'Nonaktif'}
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
