import { useEffect, useMemo, useState } from 'react'

import { sekolahAPI, superAdminAPI } from '../api'

export default function GuruPage() {
  const [teachers, setTeachers] = useState([])
  const [schools, setSchools] = useState([])
  const [selectedSchool, setSelectedSchool] = useState('')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [detailTeacher, setDetailTeacher] = useState(null)

  const fetchData = async () => {
    setLoading(true)
    setError('')

    try {
      const params = {}
      if (selectedSchool) params.id_sekolah = selectedSchool
      if (appliedSearch) params.search = appliedSearch

      const [teacherRes, schoolRes] = await Promise.all([
        superAdminAPI.getGuru(params),
        sekolahAPI.getAll(),
      ])

      setTeachers(teacherRes.data.data || [])
      setSchools(schoolRes.data.data || [])
    } catch (err) {
      setTeachers([])
      setError(err.response?.data?.message || 'Data guru belum dapat dimuat.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [selectedSchool, appliedSearch])

  const summary = useMemo(() => ({
    total: teachers.length,
    aktif: teachers.filter(teacher => teacher.is_aktif).length,
    instrumen: teachers.reduce((sum, teacher) => sum + Number(teacher.jumlah_instrumen || 0), 0),
  }), [teachers])

  const handleSearch = () => {
    setAppliedSearch(search.trim())
  }

  const openDetail = async (teacher) => {
    setDetailTeacher(teacher)
    setDetailLoading(true)
    setDetailError('')

    try {
      const res = await superAdminAPI.getGuruDetail(teacher.id_user)
      setDetailTeacher(res.data.data)
    } catch (err) {
      setDetailError(err.response?.data?.message || 'Detail guru belum dapat dimuat.')
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    setDetailTeacher(null)
    setDetailError('')
    setDetailLoading(false)
  }

  return (
    <div className="school-page">
      <section className="school-header">
        <div>
          <div className="dashboard-eyebrow">Super Admin</div>
          <h2>Data Guru</h2>
          <p>Melihat data guru berdasarkan sekolah yang menggunakan sistem instrumen.</p>
        </div>
      </section>

      <section className="school-summary-grid">
        <SummaryCard label="Total Guru" value={summary.total} note="pada filter saat ini" />
        <SummaryCard label="Guru Aktif" value={summary.aktif} note="akun aktif" />
        <SummaryCard label="Total Instrumen" value={summary.instrumen} note="dibuat oleh guru" />
      </section>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="school-table-card">
        <div className="school-table-head teacher-table-head">
          <div>
            <h3>Daftar Guru</h3>
            <p>{teachers.length} guru pada filter saat ini</p>
          </div>

          <div className="teacher-controls">
            <div className="admin-school-filter">
              <label htmlFor="teacher-school-filter">Filter sekolah</label>
              <select
                id="teacher-school-filter"
                className="select"
                value={selectedSchool}
                onChange={event => setSelectedSchool(event.target.value)}
              >
                <option value="">Semua sekolah</option>
                {schools.map(school => (
                  <option key={school.id} value={school.id}>
                    {school.nama_sekolah}
                  </option>
                ))}
              </select>
            </div>

            <div className="teacher-search">
              <label htmlFor="teacher-search">Cari guru</label>
              <div className="teacher-search-row">
                <input
                  id="teacher-search"
                  className="input"
                  placeholder="Nama, email, atau mapel"
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
        ) : teachers.length === 0 ? (
          <div className="empty">
            <div className="empty-text">Tabel akan terisi setelah admin sekolah menambahkan guru.</div>
          </div>
        ) : (
          <div className="school-table-wrap">
            <table className="teacher-table">
              <thead>
                <tr>
                  <th>Sekolah</th>
                  <th>Nama Guru</th>
                  <th>Email/Username</th>
                  <th>Mata Pelajaran</th>
                  <th>NIP</th>
                  <th>Jumlah Instrumen</th>
                  <th>Instrumen Aktif</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map(teacher => (
                  <tr key={teacher.id_user}>
                    <td>
                      <div className="school-name-cell">{teacher.nama_sekolah || 'Belum terhubung ke sekolah'}</div>
                    </td>
                    <td>
                      <div className="school-name-cell">{teacher.nama}</div>
                    </td>
                    <td>{teacher.email || '-'}</td>
                    <td>{teacher.mata_pelajaran || '-'}</td>
                    <td>{teacher.nip || '-'}</td>
                    <td>{formatNumber(teacher.jumlah_instrumen)}</td>
                    <td>{formatNumber(teacher.jumlah_instrumen_aktif)}</td>
                    <td>
                      <StatusBadge active={teacher.is_aktif} />
                    </td>
                    <td>
                      <div className="school-actions teacher-actions">
                        <button className="btn btn-sm" onClick={() => openDetail(teacher)}>Detail</button>
                        <button className="btn btn-sm" onClick={() => openDetail(teacher)}>Lihat Instrumen Guru</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detailTeacher && (
        <TeacherDetailModal
          teacher={detailTeacher}
          loading={detailLoading}
          error={detailError}
          onClose={closeDetail}
        />
      )}
    </div>
  )
}

function SummaryCard({ label, value, note }) {
  return (
    <div className="school-summary-card">
      <div className="school-summary-label">{label}</div>
      <div className="school-summary-value">{formatNumber(value)}</div>
      <div className="school-summary-note">{note}</div>
    </div>
  )
}

function TeacherDetailModal({ teacher, loading, error, onClose }) {
  const latest = teacher.instrumen_terbaru || []

  return (
    <div className="modal-overlay" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="modal teacher-modal">
        <div className="modal-title">Detail Guru</div>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="school-detail-grid">
          <DetailItem label="Nama Guru" value={teacher.nama} />
          <DetailItem label="Sekolah" value={teacher.nama_sekolah} />
          <DetailItem label="Email/Username" value={teacher.email} />
          <DetailItem label="Mata Pelajaran" value={teacher.mata_pelajaran} />
          <DetailItem label="NIP" value={teacher.nip} />
          <DetailItem label="Status" value={teacher.is_aktif ? 'Aktif' : 'Nonaktif'} />
          <DetailItem label="Jumlah Instrumen" value={formatNumber(teacher.jumlah_instrumen)} />
          <DetailItem label="Rata-rata Nilai" value={formatScore(teacher.rata_rata_nilai_instrumen)} />
          <DetailItem label="Total Pengerjaan" value={formatNumber(teacher.total_pengerjaan)} />
        </div>

        <div className="teacher-detail-section">
          <div className="teacher-detail-head">
            <h3>Instrumen Terbaru</h3>
            <p>Daftar instrumen terakhir yang dibuat guru ini</p>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}>
              <div className="spinner spinner-dark" />
            </div>
          ) : latest.length === 0 ? (
            <div className="super-empty compact">Belum ada instrumen yang dibuat guru ini.</div>
          ) : (
            <div className="teacher-latest-list">
              {latest.map(item => (
                <div className="teacher-latest-item" key={item.id}>
                  <div>
                    <strong>{item.judul || '-'}</strong>
                    <span>{item.jenis || '-'} - Kelas {item.kelas || '-'}</span>
                  </div>
                  <div className="teacher-latest-meta">
                    <StatusBadge active={item.status === 'aktif'} label={item.status || 'draft'} />
                    <span>{formatNumber(item.total_pengerjaan)} pengerjaan</span>
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

function StatusBadge({ active, label }) {
  const text = label || (active ? 'Aktif' : 'Nonaktif')

  return (
    <span className={`badge ${active ? 'badge-teal' : 'badge-red'}`}>
      <span className={`dot ${active ? 'dot-green' : 'dot-red'}`} />
      {text}
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
