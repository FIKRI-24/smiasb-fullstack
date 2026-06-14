
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../api'
import { useAuth } from '../context/AuthContext'

const getRedirectPath = (peran) => {
  const role = peran === 'admin' ? 'admin_sekolah' : peran
  if (role === 'super_admin') return '/super-admin/dashboard'
  if (role === 'admin_sekolah') return '/dashboard'
  if (role === 'guru') return '/dashboard'
  if (role === 'siswa') return '/dashboard'
  return '/dashboard'
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ identifier: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    const sessionMessage = localStorage.getItem('iap_session_message')
    if (sessionMessage) {
      setError(sessionMessage)
      localStorage.removeItem('iap_session_message')
    }
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.identifier.trim() || !form.password) {
      setError('Email/NIS dan password wajib diisi.')
      return
    }
    setLoading(true)
    try {
      const res = await authAPI.login({
        identifier: form.identifier.trim(),
        password: form.password,
      })
      const { token, user } = res.data.data
      await login(token, user)
      navigate(getRedirectPath(user?.peran), { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'Login gagal. Periksa email/NIS dan password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Keyframe untuk spinner */}
      <style>{`
        @keyframes iap-spin {
          to { transform: rotate(360deg); }
        }
        .iap-login-root {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: linear-gradient(180deg, #eef5fd 0%, #e1ecfb 100%);
          overflow: auto;
        }
        .iap-login-card {
          width: min(100%, 1120px);
          min-height: 680px;
          background: #ffffff;
          border-radius: 30px;
          display: flex;
          overflow: hidden;
          box-shadow: 0 30px 90px rgba(15, 23, 42, 0.12);
          border: 1px solid rgba(15, 23, 42, 0.08);
        }
        .iap-login-panel {
          width: 430px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 44px 40px;
          background: #ffffff;
        }
        .iap-login-hero {
          flex: 1;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(145deg, #deeefa 0%, #c2ddf5 40%, #b0d0ee 100%);
          overflow: hidden;
          padding: 32px;
        }
        .iap-login-hero svg {
          width: 100%;
          max-width: 520px;
          z-index: 1;
        }
        .iap-login-panel > .iap-brand {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 38px;
        }
        .iap-login-panel .iap-brand-icon {
          width: 44px;
          height: 44px;
          background: #1A56C4;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.02em;
        }
        .iap-login-panel .iap-brand-title {
          font-size: 15px;
          font-weight: 700;
          color: #111827;
          line-height: 1.2;
        }
        .iap-login-panel .iap-brand-sub {
          font-size: 12px;
          color: #6B7280;
          line-height: 1.4;
        }
        .iap-login-panel .iap-avatar {
          width: 70px;
          height: 70px;
          border-radius: 50%;
          background: #1A56C4;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
        }
        .iap-login-panel .iap-avatar svg {
          width: 34px;
          height: 34px;
        }
        .iap-login-panel .iap-heading {
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          color: #24314A;
          letter-spacing: 0.12em;
          text-align: center;
          margin-bottom: 32px;
        }
        .iap-login-panel .iap-field-label {
          display: block;
          font-size: 11px;
          font-weight: 600;
          color: #6B7280;
          margin-bottom: 8px;
        }
        .iap-field {
          display: flex;
          align-items: center;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          padding: 0 14px;
          min-height: 46px;
          background: #F8FAFC;
          transition: border-color 0.15s, background 0.15s;
        }
        .iap-field:focus-within {
          border-color: #1A56C4 !important;
          background: #ffffff !important;
        }
        .iap-input {
          flex: 1;
          border: none;
          background: none;
          font-size: 13px;
          color: #111827;
          outline: none;
          font-family: inherit;
        }
        .iap-input::placeholder { color: #9CA3AF; font-size: 13px; }
        .iap-eye { background: none; border: none; padding: 0; cursor: pointer; display: flex; align-items: center; margin-left: 6px; line-height: 0; }
        .iap-login-panel .iap-footer {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 24px;
        }
        .iap-forgot {
          font-size: 12px;
          color: #6B7280;
          cursor: pointer;
          transition: color 0.15s;
        }
        .iap-forgot:hover { color: #1A56C4; }
        .iap-btn {
          width: 100%;
          height: 46px;
          background: #1A56C4;
          color: #fff;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s, opacity 0.15s;
          letter-spacing: 0.02em;
        }
        .iap-btn:hover { background: #1347A8; }
        .iap-btn:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }
        .iap-spinner {
          width: 18px;
          height: 18px;
          border: 2.5px solid rgba(255,255,255,0.35);
          border-top-color: #fff;
          border-radius: 50%;
          animation: iap-spin 0.7s linear infinite;
          display: inline-block;
        }
        @media (max-width: 960px) {
          .iap-login-card { flex-direction: column; min-height: auto; }
          .iap-login-panel { width: 100%; padding: 32px 28px; }
          .iap-login-hero { min-height: 340px; }
          .iap-login-panel .iap-heading { margin-bottom: 28px; }
        }
        @media (max-width: 640px) {
          .iap-login-root { padding: 18px; }
          .iap-login-panel { padding: 24px 18px; }
          .iap-login-hero { padding: 22px; }
        }
      `}</style>

      <div className="iap-login-root">
        <div className="iap-login-card">

        {/* ── KIRI ── */}
        <div className="iap-login-panel">

          <div className="iap-brand">
            <div className="iap-brand-icon">IAP</div>
            <div>
              <div className="iap-brand-title">Instrument Assessment</div>
              <div className="iap-brand-sub">Platform Penilaian Multi Sekolah</div>
            </div>
          </div>

          <div className="iap-avatar">
              <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
                <circle cx="17" cy="12" r="6.5" fill="white" fillOpacity="0.92" />
                <path d="M4 30c0-7.18 5.82-13 13-13s13 5.82 13 13" stroke="white" strokeWidth="2.4" strokeLinecap="round" fill="none" />
                <path d="M12 10l5-4.5 5 4.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
          </div>
          <div className="iap-heading">Masuk ke Sistem</div>

          {/* Error */}
          {error && (
            <div style={{
              background: '#FEF2F2', border: '1px solid #FCA5A5',
              color: '#B91C1C', borderRadius: 8,
              padding: '10px 14px', fontSize: 12,
              marginBottom: 16, lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            {/* Identifier */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>
                Email / Username / NIS
              </label>
              <div className="iap-field" style={{
                display: 'flex', alignItems: 'center',
                border: '1px solid #E5E7EB', borderRadius: 8,
                padding: '0 14px', height: 42, background: '#F9FAFB',
                transition: 'border-color 0.15s',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 10, flexShrink: 0 }}>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <input
                  className="iap-input"
                  type="text"
                  placeholder="Email, username, atau NIS"
                  value={form.identifier}
                  onChange={e => set('identifier', e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>
                Password
              </label>
              <div className="iap-field" style={{
                display: 'flex', alignItems: 'center',
                border: '1px solid #E5E7EB', borderRadius: 8,
                padding: '0 14px', height: 42, background: '#F9FAFB',
                transition: 'border-color 0.15s',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 10, flexShrink: 0 }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  className="iap-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Masukkan password"
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                />
                <button
                  type="button"
                  className="iap-eye"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Sembunyikan' : 'Tampilkan'}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Lupa password */}
            <div className="iap-footer">
              <span className="iap-forgot">Lupa password?</span>
            </div>

            {/* Tombol masuk */}
            <button
              type="submit"
              disabled={loading}
              className="iap-btn"
              style={{
                width: '100%', height: 44,
                background: '#1A56C4',
                color: '#fff', border: 'none',
                borderRadius: 8, fontSize: 14, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.75 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s, opacity 0.15s',
                letterSpacing: '0.02em',
              }}
            >
              {loading ? <span className="iap-spinner" /> : 'Masuk'}
            </button>
          </form>
        </div>

        {/* ── KANAN ── */}
        <div className="iap-login-hero">
          {/* Blob dekoratif */}
          <div style={{
            position: 'absolute', top: '8%', right: '12%',
            width: 260, height: 220,
            background: 'rgba(255,255,255,0.22)',
            borderRadius: '60% 40% 55% 45% / 50% 60% 40% 50%',
          }} />
          <div style={{
            position: 'absolute', bottom: '10%', left: '8%',
            width: 180, height: 160,
            background: 'rgba(255,255,255,0.18)',
            borderRadius: '45% 55% 60% 40% / 55% 45% 55% 45%',
          }} />

          {/* Ilustrasi SVG */}
          <svg
            viewBox="0 0 460 460"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: '62%', maxWidth: 480, minWidth: 280, zIndex: 1 }}
          >
            <defs>
              <linearGradient id="gt" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6BBCF0" />
                <stop offset="100%" stopColor="#3898E0" />
              </linearGradient>
              <linearGradient id="gf" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#1A56C4" />
                <stop offset="100%" stopColor="#1348A8" />
              </linearGradient>
              <linearGradient id="gs" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#0D3A8C" />
                <stop offset="100%" stopColor="#0A2E70" />
              </linearGradient>
              <linearGradient id="g2t" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#90CCF0" />
                <stop offset="100%" stopColor="#5AAEE0" />
              </linearGradient>
              <linearGradient id="g2f" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#2C9ADE" />
                <stop offset="100%" stopColor="#228AC8" />
              </linearGradient>
              <linearGradient id="g2s" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#1270A8" />
                <stop offset="100%" stopColor="#0A5080" />
              </linearGradient>
              <linearGradient id="g3t" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#B8DFF5" />
                <stop offset="100%" stopColor="#8ACAE8" />
              </linearGradient>
              <linearGradient id="gramp" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#2C9ADE" />
                <stop offset="100%" stopColor="#1A56C4" />
              </linearGradient>
            </defs>

            {/* Ramp bawah */}
            <path d="M110 360 Q175 330 250 350 Q318 368 395 338 L405 375 Q328 405 250 386 Q172 368 100 398 Z" fill="url(#gramp)" opacity="0.75" />

            {/* ── GEDUNG UTAMA (tengah-kiri) ── */}
            {/* Atap */}
            <polygon points="200,95 255,118 255,148 200,125" fill="url(#gt)" />
            {/* Depan */}
            <polygon points="200,125 255,148 255,295 200,272" fill="url(#gf)" />
            {/* Samping */}
            <polygon points="255,148 292,130 292,272 255,295" fill="url(#gs)" />
            {/* Jendela depan */}
            {[145, 172, 199, 226, 253].map((y, i) => (
              <g key={i}>
                <rect x="210" y={y} width="11" height="14" rx="1" fill={i % 2 === 0 ? '#A8D8F8' : '#fff'} opacity="0.8" />
                <rect x="228" y={y} width="11" height="14" rx="1" fill={i % 2 !== 0 ? '#C8E8FF' : '#A8D8F8'} opacity="0.75" />
              </g>
            ))}
            {/* Jendela samping */}
            {[155, 178, 201, 224, 247].map((y, i) => (
              <rect key={i} x="263" y={y} width="9" height="11" rx="1" fill="#7BBCE0" opacity="0.6" />
            ))}

            {/* ── GEDUNG KIRI (pendek) ── */}
            <polygon points="120,205 168,186 168,208 120,227" fill="url(#g2t)" />
            <polygon points="120,227 168,208 168,308 120,326" fill="url(#g2f)" />
            <polygon points="168,208 196,197 196,292 168,308" fill="url(#g2s)" />
            {[228, 254, 280].map((y, i) => (
              <g key={i}>
                <rect x="130" y={y} width="9" height="11" rx="1" fill="#A8D8F8" opacity="0.8" />
                <rect x="147" y={y} width="9" height="11" rx="1" fill="#C8E8FF" opacity="0.7" />
              </g>
            ))}
            <rect x="176" y="210" width="8" height="10" rx="1" fill="#7BBCE0" opacity="0.6" />
            <rect x="176" y="233" width="8" height="10" rx="1" fill="#7BBCE0" opacity="0.55" />

            {/* ── GEDUNG SILINDER KANAN ── */}
            <ellipse cx="330" cy="162" rx="30" ry="11" fill="url(#g3t)" />
            <rect x="300" y="162" width="60" height="128" fill="url(#g2f)" opacity="0.88" />
            <rect x="342" y="162" width="18" height="128" fill="url(#g2s)" opacity="0.65" />
            <ellipse cx="330" cy="290" rx="30" ry="10" fill="#1270A8" opacity="0.45" />
            {[170, 192, 214, 236, 258].map((y, i) => (
              <g key={i}>
                <rect x="308" y={y} width="8" height="10" rx="1" fill="#C8E8FF" opacity="0.8" />
                <rect x="322" y={y} width="8" height="10" rx="1" fill="#fff" opacity={0.5 + i * 0.05} />
              </g>
            ))}

            {/* Tangga penghubung */}
            {[0, 1, 2, 3, 4].map(i => (
              <rect key={i} x={163 + i * 6} y={258 - i * 7} width="16" height="5" rx="1" fill="#6BBCF0" opacity={0.88 - i * 0.06} />
            ))}

            {/* Platform terbang atas gedung utama */}
            <polygon points="194,82 258,106 290,90 226,66" fill="#B0D8F0" opacity="0.55" />

            {/* Buku di atas silinder */}
            <rect x="314" y="150" width="28" height="7" rx="2" fill="#1A56C4" opacity="0.95" />
            <rect x="317" y="143" width="22" height="7" rx="2" fill="#2E7DD4" opacity="0.9" />
            <rect x="320" y="136" width="16" height="7" rx="2" fill="#6BBCF0" opacity="0.9" />

            {/* Panah atas (kiri bawah gedung kiri) */}
            <polygon points="114,292 107,279 111,279 111,267 118,267 118,279 122,279" fill="#2C9ADE" opacity="0.85" />
            {/* Panah atas (kiri tengah) */}
            <polygon points="156,162 149,149 153,149 153,137 160,137 160,149 164,149" fill="#1A56C4" opacity="0.8" />

            {/* Dokumen melayang */}
            <g transform="translate(362,212)" opacity="0.8">
              <rect x="0" y="0" width="32" height="22" rx="3" fill="#fff" opacity="0.85" />
              <rect x="5" y="5" width="16" height="2.5" rx="1" fill="#5BAAE8" />
              <rect x="5" y="10" width="12" height="2.5" rx="1" fill="#5BAAE8" />
              <rect x="5" y="15" width="14" height="2.5" rx="1" fill="#5BAAE8" />
            </g>

            {/* Orang di tangga */}
            <circle cx="180" cy="236" r="5" fill="#0A2E70" opacity="0.85" />
            <line x1="180" y1="241" x2="180" y2="254" stroke="#0A2E70" strokeWidth="3" opacity="0.85" />
            <line x1="175" y1="247" x2="185" y2="244" stroke="#0A2E70" strokeWidth="2.2" opacity="0.8" />

            {/* Orang di bawah */}
            <circle cx="166" cy="322" r="5" fill="#1A56C4" opacity="0.9" />
            <line x1="166" y1="327" x2="166" y2="340" stroke="#1A56C4" strokeWidth="3" opacity="0.9" />
            <line x1="161" y1="333" x2="171" y2="330" stroke="#1A56C4" strokeWidth="2.2" opacity="0.85" />

            {/* Tanaman kanan */}
            <ellipse cx="378" cy="308" rx="18" ry="26" fill="#34D88A" opacity="0.5" transform="rotate(-12 378 308)" />
            <ellipse cx="393" cy="300" rx="14" ry="20" fill="#28B872" opacity="0.42" transform="rotate(8 393 300)" />
            {/* Tanaman kiri */}
            <ellipse cx="96" cy="188" rx="13" ry="20" fill="#34D88A" opacity="0.48" transform="rotate(-8 96 188)" />

            {/* Topi wisuda */}
            <g transform="translate(221,68)" opacity="0.9">
              <polygon points="15,0 30,7 15,14 0,7" fill="#0A2E70" />
              <rect x="11" y="7" width="8" height="10" fill="#1A56C4" />
              <line x1="30" y1="7" x2="30" y2="17" stroke="#0A2E70" strokeWidth="1.8" />
              <circle cx="30" cy="18" r="2.5" fill="#1A56C4" />
            </g>

            {/* Label bawah */}
            <text
              x="230" y="428"
              textAnchor="middle"
              fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              fontSize="12"
              fill="#1A56C4"
              fontWeight="700"
              opacity="0.75"
              letterSpacing="0.04em"
            >
              Instrument Assessment Platform
            </text>
          </svg>

          {/* Dots navigasi */}
          <div style={{
            position: 'absolute', bottom: 24,
            left: 0, right: 0,
            display: 'flex', justifyContent: 'center', gap: 6,
          }}>
            {[true, false, false].map((active, i) => (
              <div key={i} style={{
                height: 7,
                width: active ? 22 : 7,
                borderRadius: active ? 4 : '50%',
                background: active ? '#1A56C4' : '#94C4E0',
                transition: 'all 0.3s',
              }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  </>
  )
}