import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authAPI } from '../api'
import { KELAS } from '../constants/classes'
import { useAuth } from '../context/AuthContext'

export default function RegisterPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    nama: '',
    password: '',
    konfirmasi: '',
    kelas: '',
    nis: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  const validate = () => {
    if (!form.nama.trim()) return 'Nama lengkap wajib diisi.'
    if (!form.kelas) return 'Kelas wajib dipilih.'
    if (!form.nis.trim()) return 'NIS wajib diisi.'
    if (form.password.length < 6) return 'Password minimal 6 karakter.'
    if (form.password !== form.konfirmasi) return 'Konfirmasi password tidak cocok.'
    return null
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setLoading(true)

    try {
      const res = await authAPI.register({
        nama: form.nama.trim(),
        password: form.password,
        peran: 'siswa',
        kelas: form.kelas,
        nis: form.nis.trim()
      })
      const { token } = res.data.data
      login(token)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || 'Pendaftaran gagal. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ width: 460 }}>
        <div className="auth-logo">
          <div className="logo-icon" style={{ width: 40, height: 40, fontSize: 15 }}>SM</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>SMIASB</div>
            <div style={{ fontSize: 12, color: 'var(--gray-600)' }}>SMP Adabiah Padang</div>
          </div>
        </div>

        <div className="auth-title">Buat akun baru</div>
        <div className="auth-sub">Daftar sebagai siswa</div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nama lengkap</label>
            <input
              className="input"
              placeholder="Budi Santoso"
              value={form.nama}
              onChange={event => set('nama', event.target.value)}
            />
          </div>

          <div className="two-col">
            <div className="form-group">
              <label className="form-label">Kelas</label>
              <select
                className="select"
                value={form.kelas}
                onChange={event => set('kelas', event.target.value)}
              >
                <option value="">-- Pilih kelas --</option>
                {KELAS.map(kelas => (
                  <option key={kelas} value={kelas}>{kelas}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">NIS</label>
              <input
                className="input"
                placeholder="2024001..."
                value={form.nis}
                onChange={event => set('nis', event.target.value)}
              />
            </div>
          </div>

          <div className="two-col">
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="input"
                type="password"
                placeholder="Min. 6 karakter"
                value={form.password}
                onChange={event => set('password', event.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Konfirmasi password</label>
              <input
                className="input"
                type="password"
                placeholder="Ulangi password"
                value={form.konfirmasi}
                onChange={event => set('konfirmasi', event.target.value)}
              />
            </div>
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: '10px', marginTop: 4 }}
          >
            {loading ? <span className="spinner" /> : 'Daftar sekarang'}
          </button>
        </form>

        <div className="divider" />

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--gray-600)' }}>
          Sudah punya akun?{' '}
          <Link to="/login" style={{ color: 'var(--blue-600)', fontWeight: 500, textDecoration: 'none' }}>
            Masuk
          </Link>
        </p>
      </div>
    </div>
  )
}
