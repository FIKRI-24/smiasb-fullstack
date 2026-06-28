import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { userAPI } from '../api'
import ActionIcon from '../components/ActionIcon'
import { KELAS } from '../constants/classes'
import { confirmToast, toast } from '../utils/notify'

const PERAN = ['admin_sekolah','guru','siswa']
const MAPEL = ['Matematika','Bahasa Indonesia','Bahasa Inggris','IPA','IPS','PKn','Agama Islam','Seni Budaya','PJOK','Prakarya']
const roleColor = { super_admin:'purple', admin:'purple', admin_sekolah:'purple', guru:'blue', siswa:'teal' }
const roleBadge = { super_admin:'badge-purple', admin:'badge-purple', admin_sekolah:'badge-purple', guru:'badge-blue', siswa:'badge-teal' }
const emptyForm = { nama:'', email:'', password:'', peran:'guru', mata_pelajaran:'', nip:'', kelas:'', nis:'' }
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())

export default function PenggunaPage() {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Semua')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editingUser, setEditingUser] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [passwordModalUser, setPasswordModalUser] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [resetRequests, setResetRequests] = useState([])
  const [loadingResetRequests, setLoadingResetRequests] = useState(false)

  const fetch = async () => {
    setLoading(true)
    try {
      const params = {}
      if (tab !== 'Semua') params.peran = tab
      if (search) params.search = search
      const res = await userAPI.getAll(params)
      setUsers(res.data.data)
    } catch { setUsers([]) }
    finally { setLoading(false) }
  }

  const fetchResetRequests = async () => {
    setLoadingResetRequests(true)
    try {
      const res = await userAPI.getPasswordResetRequests()
      setResetRequests(res.data.data || [])
    } catch {
      setResetRequests([])
    } finally {
      setLoadingResetRequests(false)
    }
  }

  useEffect(() => { fetch() }, [tab])
  useEffect(() => { fetchResetRequests() }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const isEditMode = Boolean(editingUser)

  const closeUserModal = (force = false) => {
    if (saving && !force) return
    setShowModal(false)
    setEditingUser(null)
    setForm(emptyForm)
    setError('')
  }

  const openAddModal = () => {
    setEditingUser(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  const openEditModal = (user) => {
    setEditingUser(user)
    setForm({
      ...emptyForm,
      nama: user.nama || '',
      email: user.email || '',
      password: '',
      peran: user.peran === 'admin' ? 'admin_sekolah' : user.peran,
      mata_pelajaran: user.mata_pelajaran || '',
      nip: user.nip || '',
      kelas: user.kelas || '',
      nis: user.nis || '',
    })
    setError('')
    setShowModal(true)
  }

  const validateUserForm = () => {
    if (!form.nama.trim()) {
      return 'Nama wajib diisi.'
    }
    if (!isEditMode && form.password.length < 6) {
      return 'Password awal minimal 6 karakter.'
    }
    if (form.peran === 'guru' && !isValidEmail(form.email)) {
      return 'Email guru wajib diisi dengan format yang valid.'
    }
    if (!isEditMode && form.peran === 'siswa' && !form.nis.trim()) {
      return 'NIS siswa wajib diisi.'
    }

    return ''
  }

  const handleSaveUser = async () => {
    const validationMessage = validateUserForm()

    if (validationMessage) {
      setError(validationMessage)
      return
    }

    setSaving(true); setError('')
    try {
      if (isEditMode) {
        await userAPI.update(editingUser.id, {
          nama: form.nama.trim(),
          email: form.peran === 'siswa' ? undefined : form.email.trim(),
          mata_pelajaran: form.peran === 'guru' ? form.mata_pelajaran : '',
          nip: form.peran === 'guru' ? form.nip : '',
          kelas: form.peran === 'siswa' ? form.kelas : '',
          nis: form.peran === 'siswa' ? form.nis.trim() : ''
        })
      } else {
        await userAPI.create({
          ...form,
          nama: form.nama.trim(),
          email: form.peran === 'siswa' ? '' : form.email.trim(),
          nis: form.peran === 'siswa' ? form.nis.trim() : ''
        })
      }

      closeUserModal(true)
      fetch()
    } catch (err) {
      const validationError = err.response?.data?.errors?.[0]?.msg
      setError(validationError || err.response?.data?.message || 'Gagal menyimpan pengguna.')
    } finally { setSaving(false) }
  }

  const handleToggle = async (id) => {
    try {
      await userAPI.toggle(id)
      toast.success('Status pengguna berhasil diperbarui.')
      fetch()
    }
    catch {
      toast.error('Gagal mengubah status.')
    }
  }

  const openPasswordModal = (user) => {
    setPasswordModalUser(user)
    setNewPassword('')
    setPasswordError('')
  }

  const openPasswordModalFromRequest = (request) => {
    openPasswordModal({
      id: request.user_id,
      nama: request.nama || request.identifier,
      peran: request.peran
    })
  }

  const closePasswordModal = () => {
    if (passwordSaving) return
    setPasswordModalUser(null)
    setNewPassword('')
    setPasswordError('')
  }

  const handleEditPassword = async () => {
    if (!passwordModalUser) return
    if (newPassword.trim().length < 6) {
      setPasswordError('Password baru minimal 6 karakter.')
      return
    }

    setPasswordSaving(true)
    setPasswordError('')
    try {
      await userAPI.editPassword(passwordModalUser.id, newPassword.trim())
      toast.success('Password pengguna berhasil diperbarui.')
      setPasswordModalUser(null)
      setNewPassword('')
      setPasswordError('')
      fetchResetRequests()
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Gagal memperbarui password.')
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleResolveResetRequest = async (id) => {
    try {
      await userAPI.resolvePasswordResetRequest(id)
      toast.success('Permintaan reset password ditandai selesai.')
      fetchResetRequests()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal memperbarui permintaan reset.')
    }
  }

  const handleDelete = async (id) => {
    const ok = await confirmToast('Data pengguna akan dihapus dari sistem.', {
      title: 'Hapus Pengguna',
      confirmText: 'Hapus',
      tone: 'danger',
    })
    if (!ok) return

    try {
      await userAPI.delete(id)
      toast.success('Pengguna berhasil dihapus.')
      fetch()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menghapus pengguna.')
    }
  }

  const counts = {
    Semua: users.length,
    admin_sekolah: users.filter(u => u.peran === 'admin' || u.peran === 'admin_sekolah').length,
    guru: users.filter(u => u.peran === 'guru').length,
    siswa: users.filter(u => u.peran === 'siswa').length,
  }

  return (
    <div>
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeUserModal()}>
          <div className="modal">
            <div className="modal-title">{isEditMode ? 'Edit pengguna' : 'Tambah pengguna baru'}</div>
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label className="form-label">Peran</label>
              <div className="role-tabs" style={{marginBottom:0}}>
                {PERAN.map(r => (
                  <button
                    key={r}
                    type="button"
                    className={'role-tab'+(form.peran===r?' active':'')}
                    onClick={() => !isEditMode && set('peran', r)}
                    disabled={isEditMode}
                    style={{textTransform:'capitalize', cursor: isEditMode ? 'not-allowed' : 'pointer', opacity: isEditMode && form.peran !== r ? 0.55 : 1}}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="two-col">
              <div className="form-group">
                <label className="form-label">Nama lengkap</label>
                <input className="input" placeholder="Nama lengkap" value={form.nama} onChange={e => set('nama', e.target.value)} />
              </div>
              {form.peran !== 'siswa' && (
                <div className="form-group">
                  <label className="form-label">{form.peran === 'guru' ? 'Email guru' : 'Email / username'}</label>
                  <input
                    className="input"
                    type={form.peran === 'guru' ? 'email' : 'text'}
                    placeholder={form.peran === 'guru' ? 'email@adabiah.sch.id' : 'Opsional'}
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                  />
                </div>
              )}
            </div>

            {form.peran === 'guru' && (
              <div className="two-col">
                <div className="form-group">
                  <label className="form-label">Mata pelajaran</label>
                  <select className="select" value={form.mata_pelajaran} onChange={e => set('mata_pelajaran', e.target.value)}>
                    <option value="">-- Pilih mapel --</option>
                    {MAPEL.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">NIP</label>
                  <input className="input" placeholder="NIP guru" value={form.nip} onChange={e => set('nip', e.target.value)} />
                </div>
              </div>
            )}

            {form.peran === 'siswa' && (
              <div className="two-col">
                <div className="form-group">
                  <label className="form-label">Kelas</label>
                  <select className="select" value={form.kelas} onChange={e => set('kelas', e.target.value)}>
                    <option value="">-- Pilih kelas --</option>
                    {KELAS.map(k => <option key={k}>{k}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">NIS</label>
                  <input
                    className="input"
                    placeholder="NIS siswa"
                    value={form.nis}
                    onChange={e => set('nis', e.target.value)}
                    disabled={isEditMode && Boolean(editingUser?.nis)}
                    style={isEditMode && editingUser?.nis ? { opacity: 0.65, cursor: 'not-allowed' } : undefined}
                  />
                </div>
              </div>
            )}

            {!isEditMode && (
              <div className="form-group">
                <label className="form-label">Password awal</label>
                <input className="input" type="password" placeholder="Min. 6 karakter" value={form.password} onChange={e => set('password', e.target.value)} />
              </div>
            )}

            <div className="modal-actions">
              <button className="btn" onClick={() => closeUserModal()} disabled={saving}><ActionIcon name="cancel" /> Batal</button>
              <button className="btn btn-primary" onClick={handleSaveUser} disabled={saving}>
                {saving ? <><span className="spinner" /> Menyimpan...</> : <><ActionIcon name={isEditMode ? 'save' : 'add'} /> {isEditMode ? 'Simpan perubahan' : 'Tambah pengguna'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordModalUser && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closePasswordModal()}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-title">Edit Password</div>
            {passwordError && <div className="alert alert-error">{passwordError}</div>}

            <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--gray-600)' }}>
              Pengguna: <strong>{passwordModalUser.nama}</strong>
            </div>

            <div className="form-group">
              <label className="form-label">Password baru</label>
              <input
                className="input"
                type="password"
                placeholder="Min. 6 karakter"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleEditPassword()}
                autoFocus
              />
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={closePasswordModal} disabled={passwordSaving}><ActionIcon name="cancel" /> Batal</button>
              <button className="btn btn-primary" onClick={handleEditPassword} disabled={passwordSaving}>
                {passwordSaving ? <><span className="spinner" /> Menyimpan...</> : <><ActionIcon name="save" /> Simpan Password</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{display:'flex',alignItems:'center',borderBottom:'var(--border)',marginBottom:16}}>
        <div style={{display:'flex',flex:1}}>
          {['Semua','admin_sekolah','guru','siswa'].map(t => (
            <div key={t} className={'tab'+(tab===t?' active':'')} onClick={() => setTab(t)} style={{textTransform:'capitalize'}}>
              {t} <span style={{fontSize:11,background:'var(--gray-100)',borderRadius:20,padding:'1px 6px',marginLeft:4}}>{counts[t]||0}</span>
            </div>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" style={{marginBottom:8}} onClick={openAddModal}>
          <ActionIcon name="add" />
          Tambah pengguna
        </button>
      </div>

      <div className="card card-0" style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: resetRequests.length > 0 ? 12 : 0 }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Permintaan reset password</div>
            <div style={{ fontSize: 12, color: 'var(--gray-600)' }}>
              Permintaan dari guru atau siswa yang menekan Lupa password di halaman login.
            </div>
          </div>
          <button className="btn btn-sm" type="button" onClick={fetchResetRequests} disabled={loadingResetRequests}>
            {loadingResetRequests ? 'Memuat...' : <><ActionIcon name="refresh" /> Segarkan</>}
          </button>
        </div>

        {loadingResetRequests ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--gray-600)' }}>
            <span className="spinner spinner-dark" /> Memuat permintaan...
          </div>
        ) : resetRequests.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--gray-600)' }}>Tidak ada permintaan reset password yang menunggu.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {resetRequests.map(request => (
              <div
                key={request.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  border: 'var(--border)',
                  borderRadius: 8,
                  background: 'var(--gray-50)'
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{request.nama || request.identifier}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 3 }}>
                    {request.peran === 'siswa'
                      ? `Siswa - NIS: ${request.nis || request.identifier} - Kelas ${request.kelas || '-'}`
                      : `Guru - ${request.email || request.identifier}`}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 3 }}>
                    Diajukan: {new Date(request.created_at).toLocaleString('id-ID')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    className="btn btn-sm btn-primary"
                    type="button"
                    onClick={() => openPasswordModalFromRequest(request)}
                    disabled={!request.user_id}
                  >
                    <ActionIcon name="key" size={14} />
                    Edit Password
                  </button>
                  <button className="btn btn-sm" type="button" onClick={() => handleResolveResetRequest(request.id)}>
                    <ActionIcon name="check" size={14} />
                    Tandai selesai
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Search */}
      <div style={{display:'flex',gap:8,marginBottom:14}}>
        <div className="search-input-wrap">
          <span className="search-icon">Cari</span>
          <input className="input" placeholder="Cari nama, email, atau NIS..." value={search} onChange={e => setSearch(e.target.value)} style={{paddingLeft:34,width:240}} onKeyDown={e => e.key==='Enter' && fetch()} />
        </div>
        <button className="btn" onClick={fetch}><ActionIcon name="search" /> Cari</button>
      </div>

      <div className="card card-0">
        {loading ? (
          <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner spinner-dark" /></div>
        ) : users.length === 0 ? (
          <div className="empty"><div className="empty-icon"></div><div className="empty-text">Tidak ada pengguna ditemukan</div></div>
        ) : (
          <table>
            <thead>
              <tr><th>Pengguna</th><th>Peran</th><th>Detail</th><th>Status</th><th>Bergabung</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              {users.map(u => {
                const initials = u.nama.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
                const fotoUrl = u.foto ? `http://localhost:5000${u.foto}` : null
                return (
                  <tr key={u.id}>
                    <td>
                      {/* Avatar dan nama bisa diklik */}
                      <div
                        style={{display:'flex',alignItems:'center',gap:10, cursor:'pointer'}}
                        onClick={() => navigate(`/profil/${u.id}`)}
                        title="Lihat profil"
                      >
                        {fotoUrl ? (
                          <img
                            src={fotoUrl}
                            alt={u.nama}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              objectFit: 'cover',
                              flexShrink: 0
                            }}
                            onError={(e) => {
                              e.target.style.display = 'none'
                              e.target.nextSibling.style.display = 'flex'
                            }}
                          />
                        ) : null}
                        <div
                          className={`avatar ${roleColor[u.peran]}`}
                          style={{
                            width:32,
                            height:32,
                            fontSize:11,
                            display: fotoUrl ? 'none' : 'flex'
                          }}
                        >
                          {initials}
                        </div>
                        <div>
                          <div style={{fontWeight:500, color:'var(--primary)'}}>{u.nama}</div>
                          <div style={{fontSize:12,color:'var(--gray-600)'}}>
                            {u.peran === 'siswa' ? `NIS: ${u.nis || '-'}` : u.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td><span className={`badge ${roleBadge[u.peran]}`} style={{textTransform:'capitalize'}}>{u.peran}</span></td>
                    <td style={{fontSize:12,color:'var(--gray-600)'}}>{u.mata_pelajaran || u.kelas || '-'}</td>
                    <td>
                      <span className={`badge ${u.is_aktif ? 'badge-teal' : 'badge-red'}`}>
                        <span className={`dot ${u.is_aktif ? 'dot-green' : 'dot-red'}`} />
                        {u.is_aktif ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td style={{fontSize:12,color:'var(--gray-600)'}}>{new Date(u.created_at).toLocaleDateString('id-ID',{month:'short',year:'numeric'})}</td>
                    <td>
                      <div style={{display:'flex',gap:5}}>
                        <button className="btn btn-sm" onClick={() => openEditModal(u)} title="Edit pengguna">
                          <ActionIcon name="edit" size={14} />
                          Edit
                        </button>
                        <button className="btn btn-sm" onClick={() => handleToggle(u.id)} title={u.is_aktif ? 'Nonaktifkan' : 'Aktifkan'}>
                          <ActionIcon name={u.is_aktif ? 'cancel' : 'check'} size={14} />
                          {u.is_aktif ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => openPasswordModal(u)}
                          title="Edit password"
                          disabled={!['guru', 'siswa'].includes(u.peran)}
                        >
                          <ActionIcon name="key" size={14} />
                          Edit Password
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u.id)} title="Hapus">
                          <ActionIcon name="delete" size={14} />
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
