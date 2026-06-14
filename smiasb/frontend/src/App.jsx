import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import Dashboard from './pages/Dashboard'
import SuperAdminDashboard from './pages/SuperAdminDashboard'
import SekolahPage from './pages/SekolahPage'
import AdminSekolahPage from './pages/AdminSekolahPage'
import GuruPage from './pages/GuruPage'
import SiswaPage from './pages/SiswaPage'
import SuperAdminInstrumenPage from './pages/SuperAdminInstrumenPage'
import SuperAdminMonitoringPage from './pages/SuperAdminMonitoringPage'
import SuperAdminLaporanPage from './pages/SuperAdminLaporanPage'
import InstrumenPage from './pages/InstrumenPage'
import PenggunaPage from './pages/PenggunaPage'
import ChatbotPage from './pages/ChatbotPage'
import LaporanPage from './pages/LaporanPage'
import ProfilPage from './pages/ProfilPage'
import SoalPage from './pages/SoalPage'
import BankSoalPage from './pages/BankSoalPage'
import KerjakanSoalPage from './pages/KerjakanSoalPage'
import MonitoringPage from './pages/MonitoringPage'
import MonitoringListPage from './pages/MonitoringListPage'
import ProfilPublikPage from './pages/ProfilPublikPage'

const normalizeRole = (role) => role === 'admin' ? 'admin_sekolah' : role
const getHomePath = (role) => normalizeRole(role) === 'super_admin' ? '/super-admin/dashboard' : '/dashboard'

function PrivateRoute({ children, roles }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner spinner-dark" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.map(normalizeRole).includes(normalizeRole(user.peran))) {
    return <Navigate to={getHomePath(user.peran)} replace />
  }

  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) return null
  if (user) return <Navigate to={getHomePath(user.peran)} replace />

  return children
}

function HomeRedirect() {
  const { user } = useAuth()
  return <Navigate to={getHomePath(user?.peran)} replace />
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<HomeRedirect />} />
          <Route path="dashboard" element={
            <PrivateRoute roles={['admin_sekolah', 'guru', 'siswa']}><Dashboard /></PrivateRoute>
          } />
          <Route path="super-admin/dashboard" element={
            <PrivateRoute roles={['super_admin']}><SuperAdminDashboard /></PrivateRoute>
          } />
          <Route path="super-admin/sekolah" element={
            <PrivateRoute roles={['super_admin']}><SekolahPage /></PrivateRoute>
          } />
          <Route path="super-admin/admin-sekolah" element={
            <PrivateRoute roles={['super_admin']}><AdminSekolahPage /></PrivateRoute>
          } />
          <Route path="super-admin/guru" element={
            <PrivateRoute roles={['super_admin']}><GuruPage /></PrivateRoute>
          } />
          <Route path="super-admin/siswa" element={
            <PrivateRoute roles={['super_admin']}><SiswaPage /></PrivateRoute>
          } />
          <Route path="super-admin/instrumen" element={
            <PrivateRoute roles={['super_admin']}><SuperAdminInstrumenPage /></PrivateRoute>
          } />
          <Route path="super-admin/monitoring" element={
            <PrivateRoute roles={['super_admin']}><SuperAdminMonitoringPage /></PrivateRoute>
          } />
          <Route path="super-admin/monitoring/:instrumenId" element={
            <PrivateRoute roles={['super_admin']}><MonitoringPage /></PrivateRoute>
          } />
          <Route path="super-admin/laporan" element={
            <PrivateRoute roles={['super_admin']}><SuperAdminLaporanPage /></PrivateRoute>
          } />
          <Route path="instrumen" element={<InstrumenPage />} />

          <Route path="bank-soal" element={
            <PrivateRoute roles={['admin_sekolah', 'guru', 'super_admin']}><BankSoalPage /></PrivateRoute>
          } />

          <Route path="pengguna" element={
            <PrivateRoute roles={['admin_sekolah']}><PenggunaPage /></PrivateRoute>
          } />

          <Route path="chatbot" element={<ChatbotPage />} />

          <Route path="laporan" element={
            <PrivateRoute roles={['admin_sekolah', 'guru']}><LaporanPage /></PrivateRoute>
          } />

          <Route path="profil" element={<ProfilPage />} />

          <Route path="monitoring" element={
            <PrivateRoute roles={['admin_sekolah', 'guru']}><MonitoringListPage /></PrivateRoute>
          } />

          <Route path="soal/:instrumenId" element={
            <PrivateRoute roles={['guru', 'admin_sekolah']}><SoalPage /></PrivateRoute>
          } />

          <Route path="kerjakan/:instrumenId" element={
            <PrivateRoute roles={['siswa']}><KerjakanSoalPage /></PrivateRoute>
          } />
        </Route>

        <Route path="/guru/monitoring/:instrumenId" element={
          <PrivateRoute roles={['admin_sekolah', 'guru']}><MonitoringPage /></PrivateRoute>
        } />

        <Route path="/monitoring/:instrumenId" element={
          <PrivateRoute roles={['admin_sekolah', 'guru']}><MonitoringPage /></PrivateRoute>
        } />

        <Route path="/profil/:id" element={<ProfilPublikPage />} />

        <Route path="*" element={<HomeRedirect />} />
      </Routes>

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#111827',
            color: '#fff',
            borderRadius: '14px',
            padding: '12px 16px',
            fontSize: '14px',
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.25)',
          },
          success: {
            iconTheme: {
              primary: '#10B981',
              secondary: '#ffffff',
            },
          },
          error: {
            iconTheme: {
              primary: '#EF4444',
              secondary: '#ffffff',
            },
          },
        }}
      />
    </>
  )
}
