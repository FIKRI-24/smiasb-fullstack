import { useEffect, useMemo, useState } from 'react'

import { sekolahAPI, superAdminAPI } from '../api'
import { confirmToast, toast } from '../utils/notify'

const emptyForm = {
  nama: '',
  email: '',
  password: '',
  id_sekolah: '',
  status: 'aktif',
}

const emptyResetForm = {
  password_baru: '',
  konfirmasi: '',
}

export default function AdminSekolahPage() {
  const [admins, setAdmins] = useState([])
  const [schools, setSchools] = useState([])
  const [selectedSchool, setSelectedSchool] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [modalMode, setModalMode] = useState(null)
  const [activeAdmin, setActiveAdmin] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [resetForm, setResetForm] = useState(emptyResetForm)

  const activeSchools = useMemo(
    () => schools.filter(school => school.status === 'aktif'),
    [schools]
  )

  const fetchData = async () => {
    setLoading(true)
    setError('')

    try {
      const params = selectedSchool ? { id_sekolah: selectedSchool } : undefined
      const [adminRes, schoolRes] = await Promise.all([
        superAdminAPI.getAdminSekolah(params),
        sekolahAPI.getAll(),
      ])

      setAdmins(adminRes.data.data || [])
      setSchools(schoolRes.data.data || [])
    } catch (err) {
      setAdmins([])
      setError(err.response?.data?.message || 'Data admin sekolah belum dapat dimuat.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [selectedSchool])

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const setReset = (key, value) => setResetForm(current => ({ ...current, [key]: value }))

  const openCreateModal = () => {
    setError('')
    setActiveAdmin(null)
    setForm({
      ...emptyForm,
      id_sekolah: selectedSchool || activeSchools[0]?.id || '',
    })
    setModalMode('create')
  }

  const openEditModal = (admin) => {
    setError('')
    setActiveAdmin(admin)
    setForm({
      nama: admin.nama || '',
      email: admin.email || '',
      password: '',
      id_sekolah: admin.id_sekolah || '',
      status: admin.is_aktif ? 'aktif' : 'nonaktif',
    })
    setModalMode('edit')
  }

  const openResetModal = (admin) => {
    setError('')
    setActiveAdmin(admin)
    setResetForm(emptyResetForm)
    setModalMode('reset')
  }

  const closeModal = () => {
    if (saving) return
    setModalMode(null)
    setActiveAdmin(null)
    setForm(emptyForm)
    setResetForm(emptyResetForm)
    setError('')
  }

  const validateForm = () => {
    if (!form.nama.trim()) return 'Nama admin wajib diisi.'
    if (!form.email.trim()) return 'Email/username wajib diisi.'
    if (!form.id_sekolah) return 'Sekolah wajib dipilih.'
    if (modalMode === 'create' && form.password.length < 6) return 'Password minimal 6 karakter.'
    return ''
  }

  const handleSave = async () => {
    const validationMessage = validateForm()
    if (validationMessage) {
      setError(validationMessage)
      return
    }

    setSaving(true)
    setError('')

    const payload = {
      nama: form.nama.trim(),
      email: form.email.trim(),
      id_sekolah: Number(form.id_sekolah),
      status: form.status,
    }

    try {
      if (modalMode === 'edit' && activeAdmin?.id_user) {
        await superAdminAPI.updateAdminSekolah(activeAdmin.id_user, payload)
      } else {
        await superAdminAPI.createAdminSekolah({
          ...payload,
          password: form.password,
        })
      }

      closeModal()
      await fetchData()
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan admin sekolah.')
    } finally {
      setSaving(false)
    }
  }

  const handleResetPassword = async () => {
    if (resetForm.password_baru.length < 6) {
      setError('Password baru minimal 6 karakter.')
      return
    }
    if (resetForm.password_baru !== resetForm.konfirmasi) {
      setError('Konfirmasi password tidak cocok.')
      return
    }

    setSaving(true)
    setError('')

    try {
      await superAdminAPI.resetAdminSekolahPassword(activeAdmin.id_user, resetForm.password_baru)
      closeModal()
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal reset password admin sekolah.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async (admin) => {
    const nextStatus = admin.is_aktif ? 'nonaktif' : 'aktif'
    const actionText = nextStatus === 'aktif' ? 'mengaktifkan' : 'menonaktifkan'

    const ok = await confirmToast(`Akun ${admin.nama} akan ${actionText === 'mengaktifkan' ? 'diaktifkan' : 'dinonaktifkan'}.`, {
      title: nextStatus === 'aktif' ? 'Aktifkan Admin Sekolah' : 'Nonaktifkan Admin Sekolah',
      confirmText: nextStatus === 'aktif' ? 'Aktifkan' : 'Nonaktifkan',
      tone: nextStatus === 'aktif' ? 'primary' : 'danger',
    })
    if (!ok) return

    try {
      await superAdminAPI.updateAdminSekolahStatus(admin.id_user, nextStatus)
      toast.success('Status admin sekolah berhasil diperbarui.')
      await fetchData()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal memperbarui status admin sekolah.')
    }
  }

  return (
    <div className="school-page">
      <section className="school-header">
        <div>
          <div className="dashboard-eyebrow">Super Admin</div>
          <h2>Kelola Admin Sekolah</h2>
          <p>Kelola akun admin yang bertanggung jawab pada masing-masing sekolah.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal}>
          Tambah Admin Sekolah
        </button>
      </section>

      {error && !modalMode && <div className="alert alert-error">{error}</div>}

      <section className="school-table-card">
        <div className="school-table-head admin-school-table-head">
          <div>
            <h3>Daftar Admin Sekolah</h3>
            <p>{admins.length} admin sekolah pada filter saat ini</p>
          </div>
          <div className="admin-school-filter">
            <label htmlFor="admin-school-filter">Filter sekolah</label>
            <select
              id="admin-school-filter"
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
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner spinner-dark" />
          </div>
        ) : admins.length === 0 ? (
          <div className="empty">
            <div className="empty-text">Belum ada admin sekolah pada filter ini.</div>
          </div>
        ) : (
          <div className="school-table-wrap">
            <table className="admin-school-table">
              <thead>
                <tr>
                  <th>Sekolah</th>
                  <th>Nama Admin</th>
                  <th>Email/Username</th>
                  <th>Status</th>
                  <th>Dibuat</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {admins.map(admin => (
                  <tr key={admin.id_user}>
                    <td>
                      <div className="school-name-cell">{admin.nama_sekolah || '-'}</div>
                      <div className="admin-school-counts">
                        {formatNumber(admin.jumlah_guru)} guru, {formatNumber(admin.jumlah_siswa)} siswa
                      </div>
                    </td>
                    <td>
                      <div className="school-name-cell">{admin.nama}</div>
                    </td>
                    <td>{admin.email || '-'}</td>
                    <td>
                      <StatusBadge active={admin.is_aktif} />
                    </td>
                    <td>{formatDate(admin.created_at)}</td>
                    <td>
                      <div className="school-actions">
                        <button className="btn btn-sm" onClick={() => openEditModal(admin)}>Edit</button>
                        <button className="btn btn-sm" onClick={() => openResetModal(admin)}>Reset Password</button>
                        <button
                          className={admin.is_aktif ? 'btn btn-sm btn-danger' : 'btn btn-sm'}
                          onClick={() => handleToggleStatus(admin)}
                        >
                          {admin.is_aktif ? 'Nonaktifkan' : 'Aktifkan'}
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

      {(modalMode === 'create' || modalMode === 'edit') && (
        <AdminSekolahModal
          mode={modalMode}
          form={form}
          schools={activeSchools}
          saving={saving}
          error={error}
          onClose={closeModal}
          onChange={set}
          onSave={handleSave}
        />
      )}

      {modalMode === 'reset' && (
        <ResetPasswordModal
          admin={activeAdmin}
          form={resetForm}
          saving={saving}
          error={error}
          onClose={closeModal}
          onChange={setReset}
          onSave={handleResetPassword}
        />
      )}
    </div>
  )
}

function AdminSekolahModal({ mode, form, schools, saving, error, onClose, onChange, onSave }) {
  const isEdit = mode === 'edit'

  return (
    <div className="modal-overlay" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="modal school-modal">
        <div className="modal-title">{isEdit ? 'Edit Admin Sekolah' : 'Tambah Admin Sekolah'}</div>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="form-group">
          <label className="form-label">Nama Admin</label>
          <input
            className="input"
            placeholder="Nama admin"
            value={form.nama}
            onChange={event => onChange('nama', event.target.value)}
            autoFocus
          />
        </div>

        <div className="two-col">
          <div className="form-group">
            <label className="form-label">Email/Username</label>
            <input
              className="input"
              placeholder="admin@sekolah.sch.id atau username"
              value={form.email}
              onChange={event => onChange('email', event.target.value)}
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

        {!isEdit && (
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="input"
              type="password"
              placeholder="Minimal 6 karakter"
              value={form.password}
              onChange={event => onChange('password', event.target.value)}
            />
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Pilih Sekolah</label>
          <select
            className="select"
            value={form.id_sekolah}
            onChange={event => onChange('id_sekolah', event.target.value)}
          >
            <option value="">-- Pilih sekolah aktif --</option>
            {schools.map(school => (
              <option key={school.id} value={school.id}>
                {school.nama_sekolah}
              </option>
            ))}
          </select>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={saving}>Batal</button>
          <button className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? <><span className="spinner" /> Menyimpan...</> : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ResetPasswordModal({ admin, form, saving, error, onClose, onChange, onSave }) {
  return (
    <div className="modal-overlay" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="modal school-modal">
        <div className="modal-title">Reset Password Admin Sekolah</div>
        <p className="admin-school-reset-note">
          Akun: <strong>{admin?.nama || '-'}</strong>
        </p>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="form-group">
          <label className="form-label">Password Baru</label>
          <input
            className="input"
            type="password"
            placeholder="Minimal 6 karakter"
            value={form.password_baru}
            onChange={event => onChange('password_baru', event.target.value)}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label className="form-label">Konfirmasi Password</label>
          <input
            className="input"
            type="password"
            placeholder="Ulangi password baru"
            value={form.konfirmasi}
            onChange={event => onChange('konfirmasi', event.target.value)}
          />
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={saving}>Batal</button>
          <button className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? <><span className="spinner" /> Menyimpan...</> : 'Reset Password'}
          </button>
        </div>
      </div>
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

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
