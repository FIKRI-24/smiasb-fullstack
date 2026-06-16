import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, Power, Trash2 } from 'lucide-react'
import { userAPI } from '../api'
import { KELAS } from '../constants/classes'
import { confirmToast, toast } from '../utils/notify'

const PERAN = ['admin_sekolah','guru','siswa']
const MAPEL = ['Matematika','Bahasa Indonesia','Bahasa Inggris','IPA','IPS','PKn','Agama Islam','Seni Budaya','PJOK','Prakarya']
const roleColor = { super_admin:'purple', admin:'purple', admin_sekolah:'purple', guru:'blue', siswa:'teal' }
const roleBadge = { super_admin:'badge-purple', admin:'badge-purple', admin_sekolah:'badge-purple', guru:'badge-blue', siswa:'badge-teal' }
const emptyForm = { nama:'', email:'', password:'', peran:'guru', mata_pelajaran:'', nip:'', kelas:'', nis:'' }

export default function PenggunaPage() {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Semua')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [passwordModalUser, setPasswordModalUser] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState('')

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

  useEffect(() => { fetch() }, [tab])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleAdd = async () => {
    if (!form.nama || !form.password) {
      setError('Nama dan password wajib diisi.')
      return
    }
    if (form.peran !== 'siswa' && !form.email.includes('@')) {
      setError('Email wajib diisi dengan format yang valid.')
      return
    }
    if (form.peran === 'siswa' && !form.nis.trim()) {
      setError('NIS siswa wajib diisi.')
      return
    }
    setSaving(true); setError('')
    try {
      await userAPI.create({
        ...form,
        email: form.peran === 'siswa' ? '' : form.email.trim(),
        nis: form.peran === 'siswa' ? form.nis.trim() : ''
      })
      setShowModal(false)
      setForm(emptyForm)
      fetch()
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menambah pengguna.')
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
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Gagal memperbarui password.')
    } finally {
      setPasswordSaving(false)
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
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-title">Tambah pengguna baru</div>
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label className="form-label">Peran</label>
              <div className="role-tabs" style={{marginBottom:0}}>
                {PERAN.map(r => (
                  <button key={r} type="button" className={'role-tab'+(form.peran===r?' active':'')} onClick={() => set('peran', r)} style={{textTransform:'capitalize'}}>
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
                  <label className="form-label">Email</label>
                  <input className="input" type="email" placeholder="email@adabiah.sch.id" value={form.email} onChange={e => set('email', e.target.value)} />
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
                  <input className="input" placeholder="NIS siswa" value={form.nis} onChange={e => set('nis', e.target.value)} />
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Password awal</label>
              <input className="input" type="password" placeholder="Min. 6 karakter" value={form.password} onChange={e => set('password', e.target.value)} />
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={() => setShowModal(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
                {saving ? <><span className="spinner" /> Menyimpan...</> : 'Tambah pengguna'}
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
              <button className="btn" onClick={closePasswordModal} disabled={passwordSaving}>Batal</button>
              <button className="btn btn-primary" onClick={handleEditPassword} disabled={passwordSaving}>
                {passwordSaving ? <><span className="spinner" /> Menyimpan...</> : 'Simpan Password'}
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
        <button className="btn btn-primary btn-sm" style={{marginBottom:8}} onClick={() => { setForm(emptyForm); setError(''); setShowModal(true) }}>
          + Tambah pengguna
        </button>
      </div>

      {/* Search */}
      <div style={{display:'flex',gap:8,marginBottom:14}}>
        <div className="search-input-wrap">
          <span className="search-icon">Cari</span>
          <input className="input" placeholder="Cari nama, email, atau NIS..." value={search} onChange={e => setSearch(e.target.value)} style={{paddingLeft:34,width:240}} onKeyDown={e => e.key==='Enter' && fetch()} />
        </div>
        <button className="btn" onClick={fetch}>Cari</button>
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
                        <button className="btn btn-sm" onClick={() => handleToggle(u.id)} title={u.is_aktif ? 'Nonaktifkan' : 'Aktifkan'}>
                          <Power size={14} style={{marginRight: 6}} />
                          {u.is_aktif ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => openPasswordModal(u)}
                          title="Edit password"
                          disabled={!['guru', 'siswa'].includes(u.peran)}
                        >
                          <KeyRound size={14} style={{marginRight: 6}} />
                          Edit Password
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u.id)} title="Hapus">
                          <Trash2 size={14} style={{marginRight: 6}} />
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
