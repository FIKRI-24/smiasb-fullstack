import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { userAPI } from '../api'
import ActionIcon from '../components/ActionIcon'

export default function ProfilPublikPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [profil, setProfil] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await userAPI.getById(id)
        setProfil(res.data.data)
      } catch {
        navigate('/dashboard')
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [id])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
      <div className="spinner spinner-dark" />
    </div>
  )

  if (!profil) return null

  const roleColor = {
    super_admin: 'var(--purple-600)',
    admin_sekolah: 'var(--purple-600)',
    admin: 'var(--purple-600)',
    guru: 'var(--blue-600)',
    siswa: 'var(--teal-600)'
  }[profil.peran] || 'var(--blue-600)'
  const roleBadge = {
    super_admin: 'badge-purple',
    admin_sekolah: 'badge-purple',
    admin: 'badge-purple',
    guru: 'badge-blue',
    siswa: 'badge-teal'
  }[profil.peran] || 'badge-purple'
  const initials = profil.nama?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
  const fotoUrl = profil.foto ? `http://localhost:5000${profil.foto}` : null

  return (
    <div style={{ maxWidth: 480 }}>

      {/* Modal foto besar */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            {fotoUrl ? (
              <img
                src={fotoUrl}
                alt={profil.nama}
                style={{
                  width: 280,
                  height: 280,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: `4px solid ${roleColor}`,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                }}
              />
            ) : (
              <div style={{
                width: 280,
                height: 280,
                borderRadius: '50%',
                background: roleColor,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 80,
                fontWeight: 700,
                border: `4px solid ${roleColor}`,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
              }}>
                {initials}
              </div>
            )}
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>{profil.nama}</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Klik di luar untuk menutup</div>
          </div>
        </div>
      )}

      {/* Card profil */}
      <div className="card">
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--gray-600)',
            cursor: 'pointer',
            fontSize: 13,
            marginBottom: 16,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}
        >
          <ActionIcon name="back" size={14} />
          Kembali
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingBottom: 20 }}>
          {/* Avatar - klik untuk buka modal */}
          <div
            onClick={() => setShowModal(true)}
            style={{ cursor: 'pointer' }}
            title="Lihat foto profil"
          >
            {fotoUrl ? (
              <img
                src={fotoUrl}
                alt={profil.nama}
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: `3px solid ${roleColor}`,
                  transition: 'opacity 0.2s'
                }}
                onError={(e) => { e.target.style.display = 'none' }}
              />
            ) : (
              <div style={{
                width: 100,
                height: 100,
                borderRadius: '50%',
                background: roleColor,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 36,
                fontWeight: 700,
                border: `3px solid ${roleColor}`
              }}>
                {initials}
              </div>
            )}
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{profil.nama}</div>
            <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 4 }}>
              {profil.peran === 'siswa' ? `NIS: ${profil.nis || '-'}` : profil.email}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              <span className={`badge ${roleBadge}`} style={{ textTransform: 'capitalize' }}>{profil.peran}</span>
              {profil.mata_pelajaran && <span className="badge badge-gray">{profil.mata_pelajaran}</span>}
              {profil.kelas && <span className="badge badge-gray">Kelas {profil.kelas}</span>}
            </div>
          </div>
        </div>

        {/* Info tambahan */}
        <div style={{ borderTop: '1px solid var(--gray-200)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {profil.nip && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span style={{ color: 'var(--gray-500)' }}>NIP</span>
              <span style={{ fontWeight: 500 }}>{profil.nip}</span>
            </div>
          )}
          {profil.nis && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span style={{ color: 'var(--gray-500)' }}>NIS</span>
              <span style={{ fontWeight: 500 }}>{profil.nis}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span style={{ color: 'var(--gray-500)' }}>Status</span>
            <span style={{
              fontWeight: 500,
              color: profil.is_aktif ? 'var(--teal-600)' : 'var(--red-500)'
            }}>
              {profil.is_aktif ? 'Aktif' : 'Nonaktif'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
