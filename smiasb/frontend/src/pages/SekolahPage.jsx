import { useEffect, useMemo, useState } from 'react'

import { sekolahAPI } from '../api'
import { confirmToast, toast } from '../utils/notify'

const emptyForm = {
  nama_sekolah: '',
  npsn: '',
  alamat: '',
  status: 'aktif',
}

export default function SekolahPage() {
  const [schools, setSchools] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [modalMode, setModalMode] = useState(null)
  const [activeSchool, setActiveSchool] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const fetchSchools = async () => {
    setLoading(true)
    try {
      const res = await sekolahAPI.getAll()
      setSchools(res.data.data || [])
    } catch (err) {
      setSchools([])
      setError(err.response?.data?.message || 'Data sekolah belum dapat dimuat.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSchools()
  }, [])

  const summary = useMemo(() => ({
    total: schools.length,
    aktif: schools.filter(item => item.status === 'aktif').length,
    nonaktif: schools.filter(item => item.status === 'nonaktif').length,
  }), [schools])

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  const openCreateModal = () => {
    setError('')
    setActiveSchool(null)
    setForm(emptyForm)
    setModalMode('create')
  }

  const openEditModal = (school) => {
    setError('')
    setActiveSchool(school)
    setForm({
      nama_sekolah: school.nama_sekolah || '',
      npsn: school.npsn || '',
      alamat: school.alamat || '',
      status: school.status || 'aktif',
    })
    setModalMode('edit')
  }

  const openDetailModal = (school) => {
    setError('')
    setActiveSchool(school)
    setModalMode('detail')
  }

  const closeModal = () => {
    if (saving) return
    setModalMode(null)
    setActiveSchool(null)
    setForm(emptyForm)
    setError('')
  }

  const handleSave = async () => {
    if (!form.nama_sekolah.trim()) {
      setError('Nama sekolah wajib diisi.')
      return
    }

    setSaving(true)
    setError('')

    const payload = {
      nama_sekolah: form.nama_sekolah.trim(),
      npsn: form.npsn.trim() || null,
      alamat: form.alamat.trim() || null,
      status: form.status,
    }

    try {
      if (modalMode === 'edit' && activeSchool?.id) {
        await sekolahAPI.update(activeSchool.id, payload)
      } else {
        await sekolahAPI.create(payload)
      }

      closeModal()
      await fetchSchools()
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan data sekolah.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async (school) => {
    const nextStatus = school.status === 'aktif' ? 'nonaktif' : 'aktif'
    const actionText = nextStatus === 'aktif' ? 'mengaktifkan' : 'menonaktifkan'

    const ok = await confirmToast(`${school.nama_sekolah} akan ${actionText === 'mengaktifkan' ? 'diaktifkan' : 'dinonaktifkan'}.`, {
      title: nextStatus === 'aktif' ? 'Aktifkan Sekolah' : 'Nonaktifkan Sekolah',
      confirmText: nextStatus === 'aktif' ? 'Aktifkan' : 'Nonaktifkan',
      tone: nextStatus === 'aktif' ? 'primary' : 'danger',
    })
    if (!ok) return

    try {
      await sekolahAPI.updateStatus(school.id, nextStatus)
      toast.success('Status sekolah berhasil diperbarui.')
      await fetchSchools()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal memperbarui status sekolah.')
    }
  }

  return (
    <div className="school-page">
      <section className="school-header">
        <div>
          <div className="dashboard-eyebrow">Super Admin</div>
          <h2>Kelola Sekolah</h2>
          <p>Kelola data sekolah yang menggunakan sistem instrumen.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal}>
          Tambah Sekolah
        </button>
      </section>

      <section className="school-summary-grid">
        <SummaryCard label="Total Sekolah" value={summary.total} note="terdaftar" />
        <SummaryCard label="Sekolah Aktif" value={summary.aktif} note="dapat menggunakan sistem" />
        <SummaryCard label="Sekolah Nonaktif" value={summary.nonaktif} note="dinonaktifkan sementara" />
      </section>

      {error && !modalMode && <div className="alert alert-error">{error}</div>}

      <section className="school-table-card">
        <div className="school-table-head">
          <div>
            <h3>Daftar Sekolah</h3>
            <p>{schools.length} sekolah tercatat di sistem</p>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner spinner-dark" />
          </div>
        ) : schools.length === 0 ? (
          <div className="empty">
            <div className="empty-text">Belum ada sekolah yang tercatat.</div>
          </div>
        ) : (
          <div className="school-table-wrap">
            <table className="school-table">
              <thead>
                <tr>
                  <th>Nama Sekolah</th>
                  <th>NPSN</th>
                  <th>Alamat</th>
                  <th>Status</th>
                  <th>Jumlah Guru</th>
                  <th>Jumlah Siswa</th>
                  <th>Jumlah Instrumen</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {schools.map(school => (
                  <tr key={school.id}>
                    <td>
                      <div className="school-name-cell">{school.nama_sekolah}</div>
                    </td>
                    <td>{school.npsn || '-'}</td>
                    <td>
                      <div className="school-address-cell" title={school.alamat || '-'}>
                        {school.alamat || '-'}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={school.status} />
                    </td>
                    <td>{formatNumber(school.jumlah_guru)}</td>
                    <td>{formatNumber(school.jumlah_siswa)}</td>
                    <td>
                      <div className="school-count-stack">
                        <strong>{formatNumber(school.jumlah_instrumen)}</strong>
                        <span>{formatNumber(school.jumlah_instrumen_aktif)} aktif</span>
                      </div>
                    </td>
                    <td>
                      <div className="school-actions">
                        <button className="btn btn-sm" onClick={() => openDetailModal(school)}>Detail</button>
                        <button className="btn btn-sm" onClick={() => openEditModal(school)}>Edit</button>
                        <button
                          className={school.status === 'aktif' ? 'btn btn-sm btn-danger' : 'btn btn-sm'}
                          onClick={() => handleToggleStatus(school)}
                        >
                          {school.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}
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

      {modalMode && (
        <SekolahModal
          mode={modalMode}
          form={form}
          school={activeSchool}
          saving={saving}
          error={error}
          onClose={closeModal}
          onChange={set}
          onSave={handleSave}
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

function StatusBadge({ status }) {
  const active = status === 'aktif'

  return (
    <span className={`badge ${active ? 'badge-teal' : 'badge-red'}`}>
      <span className={`dot ${active ? 'dot-green' : 'dot-red'}`} />
      {active ? 'Aktif' : 'Nonaktif'}
    </span>
  )
}

function SekolahModal({ mode, form, school, saving, error, onClose, onChange, onSave }) {
  const isDetail = mode === 'detail'
  const title = isDetail
    ? 'Detail Sekolah'
    : mode === 'edit'
      ? 'Edit Sekolah'
      : 'Tambah Sekolah'

  return (
    <div className="modal-overlay" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="modal school-modal">
        <div className="modal-title">{title}</div>
        {error && <div className="alert alert-error">{error}</div>}

        {isDetail ? (
          <div className="school-detail-grid">
            <DetailItem label="Nama Sekolah" value={school?.nama_sekolah} />
            <DetailItem label="NPSN" value={school?.npsn} />
            <DetailItem label="Alamat" value={school?.alamat} wide />
            <DetailItem label="Status" value={school?.status === 'aktif' ? 'Aktif' : 'Nonaktif'} />
            <DetailItem label="Jumlah Guru" value={formatNumber(school?.jumlah_guru)} />
            <DetailItem label="Jumlah Siswa" value={formatNumber(school?.jumlah_siswa)} />
            <DetailItem label="Jumlah Instrumen" value={formatNumber(school?.jumlah_instrumen)} />
            <DetailItem label="Instrumen Aktif" value={formatNumber(school?.jumlah_instrumen_aktif)} />
          </div>
        ) : (
          <>
            <div className="form-group">
              <label className="form-label">Nama Sekolah</label>
              <input
                className="input"
                placeholder="Nama sekolah"
                value={form.nama_sekolah}
                onChange={event => onChange('nama_sekolah', event.target.value)}
                autoFocus
              />
            </div>

            <div className="two-col">
              <div className="form-group">
                <label className="form-label">NPSN</label>
                <input
                  className="input"
                  placeholder="Opsional"
                  value={form.npsn}
                  onChange={event => onChange('npsn', event.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="select"
                  value={form.status}
                  onChange={event => onChange('status', event.target.value)}
                >
                  <option value="aktif">Aktif</option>
                  <option value="nonaktif">Nonaktif</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Alamat</label>
              <textarea
                className="textarea"
                placeholder="Opsional"
                value={form.alamat}
                onChange={event => onChange('alamat', event.target.value)}
              />
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={saving}>
            {isDetail ? 'Tutup' : 'Batal'}
          </button>
          {!isDetail && (
            <button className="btn btn-primary" onClick={onSave} disabled={saving}>
              {saving ? <><span className="spinner" /> Menyimpan...</> : 'Simpan'}
            </button>
          )}
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

function formatNumber(value) {
  return new Intl.NumberFormat('id-ID').format(Number(value || 0))
}
