import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  GraduationCap,
  MonitorCheck,
  UserCog,
  Users,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { laporanAPI } from '../api'
import { useAuth } from '../context/AuthContext'

const JENIS_OPTIONS = ['Semua', 'HOTS', 'Literasi', 'Numerasi']

const JENIS_STYLE = {
  HOTS: { badge: 'blue', color: '#185FA5', soft: '#E6F1FB' },
  Literasi: { badge: 'teal', color: '#0F6E56', soft: '#E1F5EE' },
  Numerasi: { badge: 'amber', color: '#854F0B', soft: '#FAEEDA' },
}

const STATUS_STYLE = {
  aktif: { badge: 'teal', dot: 'green' },
  draft: { badge: 'amber', dot: 'amber' },
  nonaktif: { badge: 'coral', dot: 'red' },
}

const isAdminRole = (peran) => ['admin', 'admin_sekolah', 'super_admin'].includes(peran)

const DEFAULT_DISTRIBUSI = [
  { jenis: 'HOTS', jumlah: 9 },
  { jenis: 'Literasi', jumlah: 8 },
  { jenis: 'Numerasi', jumlah: 7 },
]

const DEFAULT_AKTIVITAS = [
  { nama: 'Ahmad Fauzi', peran: 'guru', aksi: 'Upload instrumen HOTS', created_at: new Date(Date.now() - 7200000) },
  { nama: 'Siti Rahmah', peran: 'guru', aksi: 'Buat instrumen Literasi', created_at: new Date(Date.now() - 18000000) },
  { nama: 'Admin', peran: 'admin', aksi: 'Tambah akun guru', created_at: new Date(Date.now() - 86400000) },
]

const DEFAULT_TERBARU = [
  { judul: 'Soal HOTS Matematika Kelas 8', jenis: 'HOTS', pembuat: 'Ahmad Fauzi', status: 'aktif', created_at: new Date() },
  { judul: 'Literasi Membaca Bahasa Indonesia', jenis: 'Literasi', pembuat: 'Siti Rahmah', status: 'aktif', created_at: new Date() },
  { judul: 'Numerasi Dasar Kelas 9', jenis: 'Numerasi', pembuat: 'Admin', status: 'draft', created_at: new Date() },
]

export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedJenis, setSelectedJenis] = useState('Semua')

  useEffect(() => {
    laporanAPI.dashboard()
      .then(res => setData(res.data.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const stats = data?.stats || { totalInstrumen: 0, instrumenAktif: 0, totalGuru: 0, totalSiswa: 0 }

  const distribusiData = useMemo(() => {
    const source = data?.distribusi?.length > 0 ? data.distribusi : DEFAULT_DISTRIBUSI
    return source.map(item => ({
      ...item,
      jumlah: Number(item.jumlah || 0),
    }))
  }, [data])

  const aktivitasData = useMemo(() => {
    return data?.aktivitas?.length > 0 ? data.aktivitas.slice(0, 6) : DEFAULT_AKTIVITAS
  }, [data])

  const terbaruData = useMemo(() => {
    return data?.terbaru?.length > 0 ? data.terbaru : DEFAULT_TERBARU
  }, [data])

  const distribusiTotal = distribusiData.reduce((total, item) => total + item.jumlah, 0)
  const activeRate = stats.totalInstrumen > 0
    ? Math.round((stats.instrumenAktif / stats.totalInstrumen) * 100)
    : 0
  const siswaPerGuru = stats.totalGuru > 0
    ? Math.round(stats.totalSiswa / stats.totalGuru)
    : 0

  const filteredTerbaru = selectedJenis === 'Semua'
    ? terbaruData
    : terbaruData.filter(item => item.jenis === selectedJenis)
  const isAdmin = isAdminRole(user?.peran)

  const statCards = [
    {
      label: 'Total Instrumen',
      value: stats.totalInstrumen,
      note: 'semua arsip soal',
      icon: ClipboardList,
      tone: 'blue',
    },
    {
      label: 'Instrumen Aktif',
      value: stats.instrumenAktif,
      note: `${activeRate}% dari total`,
      icon: CheckCircle2,
      tone: 'teal',
    },
    {
      label: 'Total Guru',
      value: stats.totalGuru,
      note: 'akun aktif',
      icon: GraduationCap,
      tone: 'purple',
    },
    {
      label: 'Total Siswa',
      value: stats.totalSiswa,
      note: siswaPerGuru ? `sekitar ${siswaPerGuru} siswa/guru` : 'akun aktif',
      icon: Users,
      tone: 'amber',
    },
  ]

  const quickActions = [
    { label: 'Instrumen', to: '/instrumen', icon: FileText },
    { label: 'Pengguna', to: '/pengguna', icon: UserCog, adminOnly: true },
    { label: 'Monitoring', to: '/monitoring', icon: MonitorCheck },
    { label: 'Laporan', to: '/laporan', icon: BarChart3 },
  ].filter(item => !item.adminOnly || isAdmin)

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <div className="spinner spinner-dark" style={{ width: 32, height: 32 }} />
      </div>
    )
  }

  return (
    <div className="dashboard-page">
      <section className="dashboard-header">
        <div>
          <div className="dashboard-eyebrow">{isAdmin ? 'Dashboard Admin' : 'Dashboard'}</div>
          <h2>Selamat datang, {getFirstName(user?.nama)}</h2>
          <div className="dashboard-date">
            <CalendarDays size={15} />
            {new Date().toLocaleDateString('id-ID', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
        </div>

        <div className="dashboard-header-side">
          <div className="dashboard-health">
            <span className="dashboard-health-value">{activeRate}%</span>
            <span className="dashboard-health-label">instrumen aktif</span>
          </div>
          <div className="dashboard-actions">
            {quickActions.map(item => {
              const Icon = item.icon
              return (
                <Link key={item.to} className="dashboard-action" to={item.to}>
                  <Icon size={15} />
                  <span>{item.label}</span>
                  <ArrowUpRight size={13} />
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      <section className="dashboard-stat-grid">
        {statCards.map(card => (
          <MetricCard key={card.label} {...card} />
        ))}
      </section>

      <section className={'dashboard-grid' + (!isAdmin ? ' no-activity' : '')}>
        <div className="dashboard-panel dashboard-panel-wide">
          <div className="dashboard-panel-head">
            <div>
              <h3>Komposisi Instrumen</h3>
              <p>{distribusiTotal} instrumen dalam tiga kategori utama</p>
            </div>
            <SegmentedJenis value={selectedJenis} onChange={setSelectedJenis} />
          </div>

          <div className="dashboard-chart-wrap">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={distribusiData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <XAxis dataKey="jenis" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip cursor={{ fill: 'rgba(12, 26, 46, 0.04)' }} content={<DashboardTooltip />} />
                <Bar dataKey="jumlah" radius={[7, 7, 2, 2]} barSize={42}>
                  {distribusiData.map(item => (
                    <Cell
                      key={item.jenis}
                      fill={JENIS_STYLE[item.jenis]?.color || '#185FA5'}
                      opacity={selectedJenis === 'Semua' || selectedJenis === item.jenis ? 1 : 0.28}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="dashboard-distribution-list">
            {distribusiData.map(item => {
              const pct = distribusiTotal > 0 ? Math.round((item.jumlah / distribusiTotal) * 100) : 0
              const style = JENIS_STYLE[item.jenis] || JENIS_STYLE.HOTS

              return (
                <button
                  type="button"
                  key={item.jenis}
                  className={'dashboard-dist-item' + (selectedJenis === item.jenis ? ' active' : '')}
                  onClick={() => setSelectedJenis(selectedJenis === item.jenis ? 'Semua' : item.jenis)}
                >
                  <span className="dashboard-dist-dot" style={{ background: style.color }} />
                  <span className="dashboard-dist-name">{item.jenis}</span>
                  <span className="dashboard-dist-count">{item.jumlah}</span>
                  <span className="dashboard-dist-percent">{pct}%</span>
                </button>
              )
            })}
          </div>
        </div>

        {isAdmin && (
          <div className="dashboard-panel">
            <div className="dashboard-panel-head">
              <div>
                <h3>Aktivitas Terbaru</h3>
                <p>catatan perubahan sistem</p>
              </div>
              <Activity size={18} className="dashboard-muted-icon" />
            </div>

            <div className="dashboard-activity-list">
              {aktivitasData.map((item, index) => (
                <ActivityRow key={`${item.created_at}-${index}`} item={item} />
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="dashboard-panel">
        <div className="dashboard-panel-head dashboard-panel-head-table">
          <div>
            <h3>Instrumen Terbaru</h3>
            <p>
              {selectedJenis === 'Semua'
                ? `${terbaruData.length} entri terakhir`
                : `${filteredTerbaru.length} entri ${selectedJenis}`}
            </p>
          </div>
          <SegmentedJenis value={selectedJenis} onChange={setSelectedJenis} compact />
        </div>

        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Judul</th>
                <th>Jenis</th>
                <th>Status</th>
                <th>Pembuat</th>
                <th>Dibuat</th>
              </tr>
            </thead>
            <tbody>
              {filteredTerbaru.map((item, index) => {
                const jenis = JENIS_STYLE[item.jenis] || JENIS_STYLE.HOTS
                const status = STATUS_STYLE[item.status] || STATUS_STYLE.draft
                return (
                  <tr key={`${item.id || item.judul}-${index}`}>
                    <td>
                      <div className="dashboard-title-cell">
                        <span className="dashboard-title-mark" style={{ background: jenis.soft, color: jenis.color }}>
                          {getInitial(item.jenis)}
                        </span>
                        <span>{item.judul}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${jenis.badge}`}>{item.jenis || '-'}</span>
                    </td>
                    <td>
                      <span className={`badge badge-${status.badge}`}>
                        <span className={`dot dot-${status.dot}`} />
                        {item.status || 'draft'}
                      </span>
                    </td>
                    <td>{item.pembuat || item.mata_pelajaran || '-'}</td>
                    <td>{formatDate(item.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {filteredTerbaru.length === 0 && (
          <div className="empty">
            <div className="empty-text">Belum ada instrumen pada kategori ini</div>
          </div>
        )}
      </section>
    </div>
  )
}

function MetricCard({ label, value, note, icon: Icon, tone }) {
  return (
    <div className={`dashboard-stat-card tone-${tone}`}>
      <div className="dashboard-stat-icon">
        <Icon size={18} />
      </div>
      <div>
        <div className="dashboard-stat-label">{label}</div>
        <div className="dashboard-stat-value">{value}</div>
        <div className="dashboard-stat-note">{note}</div>
      </div>
    </div>
  )
}

function SegmentedJenis({ value, onChange, compact = false }) {
  return (
    <div className={'dashboard-segmented' + (compact ? ' compact' : '')}>
      {JENIS_OPTIONS.map(item => (
        <button
          type="button"
          key={item}
          className={value === item ? 'active' : ''}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </div>
  )
}

function DashboardTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null

  return (
    <div className="dashboard-tooltip">
      <div className="dashboard-tooltip-label">{label}</div>
      <div className="dashboard-tooltip-value">{payload[0].value} instrumen</div>
    </div>
  )
}

function ActivityRow({ item }) {
  const initials = getInitials(item.nama)
  const roleClass = isAdminRole(item.peran) ? 'admin' : item.peran === 'siswa' ? 'siswa' : 'guru'

  return (
    <div className="dashboard-activity-row">
      <div className={`dashboard-activity-avatar ${roleClass}`}>{initials}</div>
      <div className="dashboard-activity-content">
        <div className="dashboard-activity-name">{item.nama || 'Pengguna'}</div>
        <div className="dashboard-activity-action">{item.aksi || item.detail || '-'}</div>
      </div>
      <div className="dashboard-activity-time">{getTimeAgo(new Date(item.created_at))}</div>
    </div>
  )
}

function getFirstName(name) {
  return name?.split(' ')[0] || 'Admin'
}

function getInitial(value) {
  return value?.charAt(0)?.toUpperCase() || '-'
}

function getInitials(name = '') {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map(word => word[0])
    .join('')
    .slice(0, 2)

  return initials.toUpperCase() || '?'
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getTimeAgo(date) {
  if (!date || Number.isNaN(date.getTime())) return '-'

  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return 'baru saja'
  if (diff < 3600) return Math.floor(diff / 60) + ' mnt lalu'
  if (diff < 86400) return Math.floor(diff / 3600) + ' jam lalu'
  return Math.floor(diff / 86400) + ' hari lalu'
}
