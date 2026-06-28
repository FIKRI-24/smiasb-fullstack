import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  BarChart3,
  Bot,
  BookOpenCheck,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  MonitorCheck,
  School,
  UserCog,
  UserCircle,
  Users,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import ActionIcon from './ActionIcon'

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin', 'admin_sekolah', 'guru', 'siswa'] },
  { to: '/instrumen', icon: ClipboardList, label: 'Instrumen', roles: ['admin', 'admin_sekolah', 'guru', 'siswa'] },
  { to: '/bank-soal', icon: BookOpenCheck, label: 'Bank Soal', roles: ['admin', 'admin_sekolah', 'guru'] },
  { to: '/chatbot', icon: Bot, label: 'Chatbot', roles: ['admin', 'admin_sekolah', 'guru', 'siswa'] },
  { to: '/laporan', icon: BarChart3, label: 'Laporan', roles: ['admin', 'admin_sekolah', 'guru'] },
  { to: '/monitoring', icon: MonitorCheck, label: 'Monitoring', roles: ['admin', 'admin_sekolah', 'guru'] },
  { to: '/pengguna', icon: Users, label: 'Pengguna', roles: ['admin', 'admin_sekolah'] },
]

const SUPER_ADMIN_NAV_ITEMS = [
  { to: '/super-admin/dashboard', icon: LayoutDashboard, label: 'Dashboard Global' },
  { to: '/super-admin/sekolah', icon: School, label: 'Kelola Sekolah' },
  { to: '/super-admin/admin-sekolah', icon: UserCog, label: 'Kelola Admin Sekolah' },
  { to: '/super-admin/guru', icon: GraduationCap, label: 'Data Guru' },
  { to: '/super-admin/siswa', icon: Users, label: 'Data Siswa' },
  { to: '/super-admin/instrumen', icon: ClipboardList, label: 'Data Instrumen' },
  { to: '/bank-soal', icon: BookOpenCheck, label: 'Bank Soal' },
  { to: '/super-admin/monitoring', icon: MonitorCheck, label: 'Monitoring Global' },
  { to: '/super-admin/laporan', icon: BarChart3, label: 'Laporan Global' },
]

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/super-admin/dashboard': 'Dashboard Super Admin',
  '/super-admin/sekolah': 'Kelola Sekolah',
  '/super-admin/admin-sekolah': 'Kelola Admin Sekolah',
  '/super-admin/guru': 'Data Guru',
  '/super-admin/siswa': 'Data Siswa',
  '/super-admin/instrumen': 'Data Instrumen',
  '/super-admin/monitoring': 'Monitoring Global',
  '/super-admin/laporan': 'Laporan Global',
  '/instrumen': 'Manajemen Instrumen',
  '/bank-soal': 'Bank Soal',
  '/chatbot': 'Chatbot',
  '/laporan': 'Laporan & Statistik',
  '/monitoring': 'Monitoring Hasil Siswa',
  '/pengguna': 'Manajemen Pengguna',
  '/profil': 'Profil Saya',
}

const getPageTitle = (pathname) => {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  if (pathname.startsWith('/soal/')) return 'Kelola Soal'
  if (pathname.startsWith('/kerjakan/')) return 'Kerjakan Soal'
  if (pathname.startsWith('/super-admin/monitoring/')) return 'Detail Monitoring Global'
  if (pathname.startsWith('/guru/monitoring/')) return 'Detail Monitoring Hasil Siswa'
  if (pathname.startsWith('/monitoring/')) return 'Monitoring Hasil Siswa'
  return 'SMIASB'
}

const normalizeRole = (role) => role === 'admin' ? 'admin_sekolah' : role

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const namaSekolah = user?.nama_sekolah?.trim()
  const chatbotLabel = namaSekolah ? `Chatbot ${namaSekolah}` : 'Chatbot'
  const title = location.pathname === '/chatbot' ? chatbotLabel : getPageTitle(location.pathname)

  const currentRole = normalizeRole(user?.peran)
  const isSuperAdmin = currentRole === 'super_admin'
  const visibleNav = isSuperAdmin
    ? SUPER_ADMIN_NAV_ITEMS
    : NAV_ITEMS.filter(item => item.roles.map(normalizeRole).includes(currentRole))

  const handleLogout = async () => {
    logout()
    navigate('/login')
  }

  const initials = user?.nama?.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase() || '?'
  const roleColor = {
    super_admin: 'admin',
    admin_sekolah: 'admin',
    admin: 'admin',
    guru: 'guru',
    siswa: 'siswa'
  }[currentRole] || 'admin'
  const roleBadge = {
    super_admin: 'badge-blue',
    admin_sekolah: 'badge-purple',
    admin: 'badge-purple',
    guru: 'badge-blue',
    siswa: 'badge-teal'
  }[currentRole] || 'badge-purple'

  return (
    <div className="app-wrap">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">SM</div>
          <div>
            <div className="logo-text">{isSuperAdmin ? 'Instrument Assessment' : 'Instrumen Assessment'}</div>
            <div className="logo-sub">
              {isSuperAdmin ? 'Super Admin Panel' : (user?.nama_sekolah || 'Nama Sekolah')}
            </div>
          </div>
        </div>

        <nav className="nav-section">
          <div className="nav-label">Menu Utama</div>
          {visibleNav.map(item => {
            const Icon = item.icon
            const label = item.to === '/chatbot' ? chatbotLabel : item.label
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
              >
                <span className="nav-icon"><Icon size={16} /></span>
                {label}
              </NavLink>
            )
          })}
        </nav>

        <nav className="nav-section">
          <div className="nav-label">Akun</div>
          <NavLink to="/profil" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <span className="nav-icon"><UserCircle size={16} /></span>
            Profil Saya
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className={`avatar ${roleColor}`}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.nama}
              </div>
              <div className="user-role">{user?.peran}</div>
            </div>
          </div>
          <button
            className="btn"
            style={{ width: '100%', marginTop: 10, fontSize: 12, justifyContent: 'center' }}
            onClick={handleLogout}
          >
            <ActionIcon name="logout" />
            Keluar
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--blue-600)',
              display: 'inline-block',
              opacity: 0.7
            }} />
            <span className="topbar-title">{title}</span>
          </div>
          <div className="topbar-right">
            <span className={`badge ${roleBadge}`} style={{ textTransform: 'capitalize' }}>{user?.peran}</span>
            <div
              className={`avatar ${roleColor}`}
              style={{ cursor: 'pointer', border: '2px solid var(--gray-200)' }}
              onClick={() => navigate('/profil')}
              title="Profil saya"
            >
              {initials}
            </div>
          </div>
        </header>

        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
