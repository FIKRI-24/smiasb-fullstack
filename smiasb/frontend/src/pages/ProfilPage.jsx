import { useRef, useState } from 'react'
import { authAPI, userAPI } from '../api'
import { useAuth } from '../context/AuthContext'
import { confirmToast } from '../utils/notify'

export default function ProfilPage() {
  const { user, login } = useAuth()
  const [form, setForm] = useState({
    nama: user?.nama || '',
    mata_pelajaran: user?.mata_pelajaran || '',
    nip: user?.nip || '',
    kelas: user?.kelas || '',
    nis: user?.nis || '',
  })
  const [passForm, setPassForm] = useState({ password_lama: '', password_baru: '', konfirmasi: '' })
  const [saving, setSaving] = useState(false)
  const [savingPass, setSavingPass] = useState(false)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [msgPass, setMsgPass] = useState({ type: '', text: '' })
  const [msgFoto, setMsgFoto] = useState({ type: '', text: '' })
  const [showFotoModal, setShowFotoModal] = useState(false)
  const fileInputRef = useRef(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setP = (k, v) => setPassForm(f => ({ ...f, [k]: v }))

  const handleSaveProfil = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg({ type: '', text: '' })
    try {
      await userAPI.update(user.id, form)
      const res = await authAPI.me()
      const updated = res.data.data
      const savedToken = localStorage.getItem('smiasb_token')
      login(savedToken, updated)
      setMsg({ type: 'success', text: 'Profil berhasil diperbarui.' })
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Gagal memperbarui profil.' })
    } finally {
      setSaving(false)
    }
  }

  const handleChangePass = async (e) => {
    e.preventDefault()
    if (passForm.password_baru !== passForm.konfirmasi) {
      setMsgPass({ type: 'error', text: 'Konfirmasi password tidak cocok.' })
      return
    }
    if (passForm.password_baru.length < 6) {
      setMsgPass({ type: 'error', text: 'Password baru minimal 6 karakter.' })
      return
    }

    setSavingPass(true)
    setMsgPass({ type: '', text: '' })
    try {
      await authAPI.changePassword({
        password_lama: passForm.password_lama,
        password_baru: passForm.password_baru,
      })
      setMsgPass({ type: 'success', text: 'Password berhasil diubah.' })
      setPassForm({ password_lama: '', password_baru: '', konfirmasi: '' })
    } catch (err) {
      setMsgPass({ type: 'error', text: err.response?.data?.message || 'Gagal mengubah password.' })
    } finally {
      setSavingPass(false)
    }
  }

  const handleUploadFoto = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      setMsgFoto({ type: 'error', text: 'Hanya file gambar (JPEG, JPG, PNG, GIF)' })
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      setMsgFoto({ type: 'error', text: 'Ukuran file maksimal 2MB' })
      return
    }

    setUploadingFoto(true)
    setMsgFoto({ type: '', text: '' })

    const formData = new FormData()
    formData.append('foto', file)

    try {
      const savedToken = localStorage.getItem('smiasb_token')
      const response = await fetch(`http://localhost:5000/api/users/${user.id}/upload-foto`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedToken}` },
        body: formData,
      })

      const result = await response.json()

      if (result.success) {
        const res = await authAPI.me()
        const updated = res.data.data
        const latestToken = localStorage.getItem('smiasb_token')
        login(latestToken, updated)
        setMsgFoto({ type: 'success', text: 'Foto profil berhasil diupload.' })
        if (fileInputRef.current) fileInputRef.current.value = ''
      } else {
        setMsgFoto({ type: 'error', text: result.message || 'Gagal upload foto' })
      }
    } catch (err) {
      setMsgFoto({ type: 'error', text: 'Terjadi kesalahan saat upload foto' })
    } finally {
      setUploadingFoto(false)
    }
  }

  const handleHapusFoto = async () => {
    const ok = await confirmToast('Foto profil akan dihapus dari akun Anda.', {
      title: 'Hapus Foto Profil',
      confirmText: 'Hapus',
      tone: 'danger',
    })
    if (!ok) return

    setUploadingFoto(true)
    setMsgFoto({ type: '', text: '' })

    try {
      const savedToken = localStorage.getItem('smiasb_token')
      const response = await fetch(`http://localhost:5000/api/users/${user.id}/foto`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${savedToken}` },
      })

      const result = await response.json()

      if (result.success) {
        const res = await authAPI.me()
        const updated = res.data.data
        const latestToken = localStorage.getItem('smiasb_token')
        login(latestToken, updated)
        setShowFotoModal(false)
        setMsgFoto({ type: 'success', text: 'Foto profil berhasil dihapus.' })
      } else {
        setMsgFoto({ type: 'error', text: result.message || 'Gagal hapus foto' })
      }
    } catch (err) {
      setMsgFoto({ type: 'error', text: 'Terjadi kesalahan saat hapus foto' })
    } finally {
      setUploadingFoto(false)
    }
  }

  const initials = user?.nama?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
  const roleColor = {
    super_admin: 'var(--purple-600)',
    admin_sekolah: 'var(--purple-600)',
    admin: 'var(--purple-600)',
    guru: 'var(--blue-600)',
    siswa: 'var(--teal-600)'
  }[user?.peran] || 'var(--blue-600)'
  const roleBadge = {
    super_admin: 'badge-purple',
    admin_sekolah: 'badge-purple',
    admin: 'badge-purple',
    guru: 'badge-blue',
    siswa: 'badge-teal'
  }[user?.peran] || 'badge-purple'
  const fotoUrl = user?.foto ? `http://localhost:5000${user.foto}` : null
  const userIdentifier = user?.peran === 'siswa' ? `NIS: ${user?.nis || '-'}` : user?.email

  return (
    <div className="profile-page">
      {showFotoModal && (
        <div className="profile-photo-modal" onClick={() => setShowFotoModal(false)}>
          <div className="profile-photo-dialog" onClick={e => e.stopPropagation()}>
            {fotoUrl ? (
              <img className="profile-photo-large" src={fotoUrl} alt={user?.nama} style={{ borderColor: roleColor }} />
            ) : (
              <div className="profile-photo-large profile-photo-initial" style={{ background: roleColor, borderColor: roleColor }}>
                {initials}
              </div>
            )}

            <div className="profile-photo-name">{user?.nama}</div>
            <div className="profile-photo-actions">
              <label className="btn btn-primary" style={{ cursor: uploadingFoto ? 'not-allowed' : 'pointer' }}>
                Ganti Foto
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif"
                  onChange={(e) => {
                    setShowFotoModal(false)
                    handleUploadFoto(e)
                  }}
                  disabled={uploadingFoto}
                  style={{ display: 'none' }}
                />
              </label>

              {fotoUrl && (
                <button className="btn btn-danger" type="button" onClick={handleHapusFoto} disabled={uploadingFoto}>
                  Hapus Foto
                </button>
              )}
            </div>
            <div className="profile-photo-hint">Klik area gelap untuk menutup</div>
          </div>
        </div>
      )}

      <section className="profile-hero">
        <div className="profile-hero-main">
          <div className="profile-avatar-wrap">
            <button className="profile-avatar-trigger" type="button" onClick={() => setShowFotoModal(true)} title="Lihat foto profil">
              {fotoUrl ? (
                <img className="profile-avatar-img" src={fotoUrl} alt={user?.nama} style={{ borderColor: roleColor }} />
              ) : (
                <span className="profile-avatar-fallback" style={{ background: roleColor, borderColor: roleColor }}>
                  {initials}
                </span>
              )}
            </button>

            <label className="profile-upload-button" title="Upload foto" style={{ cursor: uploadingFoto ? 'not-allowed' : 'pointer', opacity: uploadingFoto ? 0.6 : 1 }}>
              {uploadingFoto ? '...' : '+'}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif"
                onChange={handleUploadFoto}
                disabled={uploadingFoto}
                style={{ display: 'none' }}
              />
            </label>
          </div>

          <div className="profile-identity">
            <div className="profile-overline">Profil Saya</div>
            <h2>{user?.nama}</h2>
            <div className="profile-meta">{userIdentifier}</div>
            <div className="profile-badges">
              <span className={`badge ${roleBadge}`} style={{ textTransform: 'capitalize' }}>{user?.peran}</span>
              {user?.mata_pelajaran && <span className="badge badge-gray">{user.mata_pelajaran}</span>}
              {user?.kelas && <span className="badge badge-gray">Kelas {user.kelas}</span>}
            </div>
          </div>
        </div>

        {fotoUrl && (
          <button className="btn btn-danger btn-sm profile-remove-photo" type="button" onClick={handleHapusFoto} disabled={uploadingFoto}>
            Hapus Foto
          </button>
        )}

        {msgFoto.text && (
          <div className={`alert alert-${msgFoto.type === 'success' ? 'success' : 'error'} profile-photo-alert`}>
            {uploadingFoto && <span className="spinner" style={{ marginRight: 8 }} />}
            {msgFoto.text}
          </div>
        )}
      </section>

      <section className="profile-content-grid">
        <div className="profile-panel">
          <div className="profile-panel-head">
            <div>
              <div className="profile-panel-title">Edit profil</div>
              <div className="profile-panel-sub">Perbarui identitas akun yang tampil di sistem.</div>
            </div>
          </div>

          {msg.text && <div className={`alert alert-${msg.type === 'success' ? 'success' : 'error'}`}>{msg.text}</div>}

          <form onSubmit={handleSaveProfil}>
            <div className="form-group">
              <label className="form-label">Nama lengkap</label>
              <input className="input" value={form.nama} onChange={e => set('nama', e.target.value)} />
            </div>

            {user?.peran === 'guru' && (
              <div className="two-col">
                <div className="form-group">
                  <label className="form-label">Mata pelajaran</label>
                  <input className="input" value={form.mata_pelajaran} onChange={e => set('mata_pelajaran', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">NIP</label>
                  <input className="input" value={form.nip} onChange={e => set('nip', e.target.value)} />
                </div>
              </div>
            )}

            {user?.peran === 'siswa' && (
              <div className="two-col">
                <div className="form-group">
                  <label className="form-label">Kelas</label>
                  <input className="input" value={form.kelas} onChange={e => set('kelas', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">NIS</label>
                  <input className="input" value={form.nis} onChange={e => set('nis', e.target.value)} />
                </div>
              </div>
            )}

            {user?.peran !== 'siswa' && (
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="input" value={user?.email} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
                <div className="profile-help-text">Email tidak dapat diubah. Hubungi admin jika perlu.</div>
              </div>
            )}

            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? <><span className="spinner" /> Menyimpan...</> : 'Simpan perubahan'}
            </button>
          </form>
        </div>

        <div className="profile-panel">
          <div className="profile-panel-head">
            <div>
              <div className="profile-panel-title">Ganti password</div>
              <div className="profile-panel-sub">Gunakan password yang mudah diingat namun tetap aman.</div>
            </div>
          </div>

          {msgPass.text && <div className={`alert alert-${msgPass.type === 'success' ? 'success' : 'error'}`}>{msgPass.text}</div>}

          <form onSubmit={handleChangePass}>
            <div className="form-group">
              <label className="form-label">Password lama</label>
              <input className="input" type="password" placeholder="Masukkan password lama" value={passForm.password_lama} onChange={e => setP('password_lama', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Password baru</label>
              <input className="input" type="password" placeholder="Min. 6 karakter" value={passForm.password_baru} onChange={e => setP('password_baru', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Konfirmasi password baru</label>
              <input className="input" type="password" placeholder="Ulangi password baru" value={passForm.konfirmasi} onChange={e => setP('konfirmasi', e.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={savingPass}>
              {savingPass ? <><span className="spinner" /> Mengubah...</> : 'Ubah password'}
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}
