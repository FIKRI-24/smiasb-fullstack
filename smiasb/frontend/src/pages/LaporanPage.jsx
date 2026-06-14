import { useState, useEffect } from 'react'
import { laporanAPI } from '../api'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie, Legend
} from 'recharts'
import {
  FileText, CheckCircle, Users, UserCheck,
  TrendingUp, MessageCircle, AlertCircle,
  Calendar, BookOpen, BarChart3, PieChart as PieChartIcon,
  Download, RefreshCw, ChevronRight, Search,
  Filter, Info, Bell, TrendingDown, Clock, Award,
  Sparkles, Activity, Zap, ShieldCheck,
  MoreVertical, Moon, UserCircle
} from 'lucide-react'

export default function LaporanPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState('bulan')
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const [showDateFilter, setShowDateFilter] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedJenis, setSelectedJenis] = useState('all')
  const [notifications, setNotifications] = useState([])
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [compareMode, setCompareMode] = useState(false)

  useEffect(() => {
    fetchData()
    showNotification('Dashboard laporan siap digunakan', 'info')
  }, [])

  useEffect(() => {
    let interval
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchData()
        showNotification('Data otomatis diperbaharui', 'success')
      }, 30000)
    }
    return () => clearInterval(interval)
  }, [autoRefresh])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await laporanAPI.dashboardFull()
      setData(res.data.data)
      setLastUpdate(new Date())
      checkAnomalies(res.data.data)
    } catch (err) {
      console.error(err)
      setData(null)
      showNotification('Gagal memuat data laporan', 'error')
    } finally {
      setLoading(false)
    }
  }

  const checkAnomalies = (payload) => {
    if (payload?.stats?.totalInstrumen < 10) {
      showNotification('Total instrumen masih rendah. Tambahkan instrumen baru.', 'warning')
    }
    if (payload?.chatbot?.errorAI > 50) {
      showNotification('Error AI tinggi. Sistem perlu dicek.', 'error')
    }
  }

  const showNotification = (message, type = 'info') => {
    const id = Date.now() + Math.random()
    setNotifications(prev => [{ id, message, type }, ...prev].slice(0, 5))
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 5000)
  }

  const formatNumber = (num) => new Intl.NumberFormat('id-ID').format(num || 0)

  const stats = data?.stats || {}
  const instrumen = data?.instrumen || {}
  const chatbot = data?.chatbot || {}
  const insight = data?.insight || []

  const perJenis = instrumen.distribusi || []
  const totalInstrumen = perJenis.reduce((a, b) => a + Number(b.jumlah || 0), 0)
  const hardest = chatbot.topQuestions?.[0]

  const filteredTopQuestions = (chatbot.topQuestions || []).filter(q => {
    const matchSearch = (q.pesan || '').toLowerCase().includes(searchTerm.toLowerCase())
    const matchJenis = selectedJenis === 'all' || q.jenis === selectedJenis
    return matchSearch && matchJenis
  })

  const COLORS = ['#465fff', '#7592ff', '#12b76a', '#f79009', '#f04438', '#7a5af8', '#06aed4', '#17b26a']

  const exportToCSV = () => {
    const statsData = [
      ['Metrik', 'Nilai'],
      ['Total Instrumen', stats.totalInstrumen || 0],
      ['Instrumen Aktif', stats.instrumenAktif || 0],
      ['Total Guru', stats.totalGuru || 0],
      ['Total Siswa', stats.totalSiswa || 0],
      ['Total Chat', chatbot.totalChat || 0],
      ['Pertanyaan Unik', chatbot.uniqueQuestion || 0],
      ['Error AI', chatbot.errorAI || 0]
    ]

    const statsCSV = statsData.map(row => row.join(',')).join('\n')
    const blob = new Blob([statsCSV], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `laporan_dashboard_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(link.href)

    showNotification('Laporan berhasil diexport ke CSV', 'success')
  }

  const healthScore = Math.max(0, Math.min(100, 100 - Number(chatbot.errorAI || 0)))
  const activeRatio = Number(stats.totalInstrumen || 0) > 0
    ? Math.round((Number(stats.instrumenAktif || 0) / Number(stats.totalInstrumen || 1)) * 100)
    : 0

  const chartData = chatbot.dailyActivity || []

  if (loading) {
    return (
      <div className="tail-loading">
        <div className="tail-loading-card">
          <div className="loading-icon"><RefreshCw size={28} /></div>
          <h3>Memuat Dashboard Laporan</h3>
          <p>Menyiapkan grafik, insight, dan statistik terbaru...</p>
        </div>
        <style>{pageStyle}</style>
      </div>
    )
  }

  return (
    <div className="tailadmin-page">
      {notifications.length > 0 && (
        <div className="notification-stack">
          {notifications.map(notif => (
            <div key={notif.id} className={`notif-card notif-${notif.type}`}>
              <div className="notif-dot" />
              <Bell size={15} />
              <span>{notif.message}</span>
            </div>
          ))}
        </div>
      )}

      <main className="tail-main">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-search">
              <Search size={17} />
              <input
                type="text"
                placeholder="Search or type command..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <kbd>Ctrl+K</kbd>
            </div>
          </div>

          <div className="topbar-right">
            <button className={autoRefresh ? 'small-action active' : 'small-action'} onClick={() => setAutoRefresh(!autoRefresh)}>
              <Clock size={16} />
              Auto {autoRefresh ? 'ON' : 'OFF'}
            </button>
            <button className="small-action" onClick={fetchData}>
              <RefreshCw size={16} />
              Refresh
            </button>
            <button className="small-action primary" onClick={exportToCSV}>
              <Download size={16} />
              Export CSV
            </button>
            <button className="round-btn"><Moon size={17} /></button>
            <button className="round-btn"><Bell size={17} /></button>
            <div className="user-chip">
              <div className="avatar"><UserCircle size={22} /></div>
              <span>Admin</span>
            </div>
          </div>
        </header>

        <section className="page-title-row">
          <div>
            <span className="eyebrow"><Sparkles size={14} /> Smart Analytics Dashboard</span>
            <h1>Dashboard Laporan</h1>
            <p>Pantau performa instrumen, aktivitas chatbot, insight sistem, dan tren penggunaan dalam satu tampilan.</p>
          </div>
          <div className="meta-box">
            <span><Clock size={14} /> Update terakhir {lastUpdate.toLocaleTimeString('id-ID')}</span>
            <span><ShieldCheck size={14} /> Health score {healthScore}%</span>
            <span><Activity size={14} /> Aktivasi {activeRatio}%</span>
          </div>
        </section>

        <section className="filter-bar">
          <select value={selectedJenis} onChange={(e) => setSelectedJenis(e.target.value)}>
            <option value="all">Semua Jenis</option>
            {perJenis.map(j => (
              <option key={j.jenis} value={j.jenis}>{j.jenis}</option>
            ))}
          </select>

          <button className={showDateFilter ? 'filter-btn active' : 'filter-btn'} onClick={() => setShowDateFilter(!showDateFilter)}>
            <Filter size={16} />
            Filter Tanggal
          </button>

          <button className={compareMode ? 'filter-btn active' : 'filter-btn'} onClick={() => setCompareMode(!compareMode)}>
            <TrendingUp size={16} />
            Compare
          </button>
        </section>

        {showDateFilter && (
          <section className="date-filter-panel">
            <div className="date-title"><Calendar size={17} /> Rentang tanggal laporan</div>
            <label>
              Dari
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              />
            </label>
            <label>
              Sampai
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              />
            </label>
            <button
              className="reset-btn"
              onClick={() => {
                setDateRange({ start: '', end: '' })
                showNotification('Filter tanggal direset', 'info')
              }}
            >
              Reset
            </button>
          </section>
        )}

        <section className="metric-row">
          <MetricCard
            title="Total Instrumen"
            value={formatNumber(stats.totalInstrumen)}
            subtitle={`${formatNumber(stats.instrumenAktif)} instrumen aktif`}
            icon={<FileText size={21} />}
            growth={compareMode ? '+12%' : '+20%'}
            tooltip="Total seluruh instrumen yang tersedia"
          />
          <MetricCard
            title="Instrumen Aktif"
            value={formatNumber(stats.instrumenAktif)}
            subtitle={`Aktivasi ${activeRatio}%`}
            icon={<CheckCircle size={21} />}
            growth={compareMode ? '+5%' : '+4%'}
            tooltip="Instrumen yang sedang aktif digunakan"
          />
          <MetricCard
            title="Total Guru"
            value={formatNumber(stats.totalGuru)}
            subtitle="Pengguna tenaga pendidik"
            icon={<Users size={21} />}
            growth={compareMode ? '+8%' : '+7%'}
            tooltip="Jumlah guru yang terdaftar"
          />
          <MetricCard
            title="Total Siswa"
            value={formatNumber(stats.totalSiswa)}
            subtitle="Peserta didik terdaftar"
            icon={<UserCheck size={21} />}
            growth={compareMode ? '+15%' : '+9%'}
            tooltip="Jumlah siswa yang terdaftar"
          />
        </section>

        <section className="analytics-card">
          <div className="card-header">
            <div>
              <h2>Analytics</h2>
              <p>Visitor analytics of last 30 days</p>
            </div>
            <div className="period-tabs">
              {['minggu', 'bulan', 'tahun'].map(period => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className={selectedPeriod === period ? 'active' : ''}
                >
                  {period === 'minggu' ? 'Weekly' : period === 'bulan' ? 'Monthly' : 'Annually'}
                </button>
              ))}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={290}>
            <BarChart data={chartData} margin={{ top: 12, right: 12, left: -24, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="tanggal" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#98a2b3' }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#98a2b3' }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" radius={[7, 7, 0, 0]} fill="#465fff" barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="dashboard-grid">
          <ChartCard
            icon={<PieChartIcon size={17} />}
            title="Distribusi Berdasarkan Jenis"
            subtitle={`${formatNumber(totalInstrumen)} total instrumen terklasifikasi`}
          >
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={perJenis}
                  dataKey="jumlah"
                  nameKey="jenis"
                  cx="50%"
                  cy="50%"
                  innerRadius={54}
                  outerRadius={86}
                  paddingAngle={4}
                  labelLine={false}
                >
                  {perJenis.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            icon={<BarChart3 size={17} />}
            title="Top Pertanyaan Chatbot"
            subtitle={`${filteredTopQuestions.length} pertanyaan sesuai filter`}
          >
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={filteredTopQuestions} layout="vertical" margin={{ top: 4, right: 18, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#98a2b3' }} />
                <YAxis
                  dataKey="pesan"
                  type="category"
                  width={142}
                  tick={{ fontSize: 11, fill: '#667085' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => val?.length > 24 ? val.slice(0, 24) + '...' : val}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" radius={[0, 7, 7, 0]} fill="#465fff" barSize={15} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="side-stack">
            <div className="mini-card">
              <div className="mini-header">
                <div>
                  <span>Active Users</span>
                  <h3>{formatNumber(chatbot.totalChat)}</h3>
                </div>
                <MoreVertical size={18} />
              </div>
              <p>Live visitors dari aktivitas chatbot</p>
              <div className="mini-list">
                <MiniStat icon={<MessageCircle size={16} />} label="Total Chat" value={formatNumber(chatbot.totalChat)} />
                <MiniStat icon={<BookOpen size={16} />} label="Pertanyaan Unik" value={formatNumber(chatbot.uniqueQuestion)} />
                <MiniStat icon={<AlertCircle size={16} />} label="Error AI" value={formatNumber(chatbot.errorAI)} danger />
              </div>
            </div>

            {hardest && (
              <div className="priority-card">
                <div className="priority-icon"><Award size={20} /></div>
                <div>
                  <span>Top Priority Question</span>
                  <h3>{hardest.pesan}</h3>
                  <p><Zap size={14} /> {hardest.total}x ditanyakan</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="insight-panel">
          <div className="card-header">
            <div>
              <h2>Insight & Rekomendasi</h2>
              <p>Ringkasan saran otomatis berdasarkan data laporan.</p>
            </div>
          </div>

          <div className="insight-grid">
            {insight.length > 0 ? insight.map((item, idx) => (
              <div className="insight-card" key={idx}>
                <div className="insight-number">{idx + 1}</div>
                <p>{item}</p>
                <ChevronRight size={16} />
              </div>
            )) : (
              <div className="empty-insight">
                <Sparkles size={26} />
                <p>Belum ada insight yang tersedia dari sistem.</p>
              </div>
            )}
          </div>
        </section>

        <footer className="dashboard-footer">
          <span>Dashboard Laporan - Data diperbaharui secara real-time</span>
          <div>
            <span>Data Points: {(chatbot.dailyActivity?.length || 0) + perJenis.length}</span>
            <span>Auto-refresh: {autoRefresh ? 'Active' : 'Inactive'}</span>
            <span>{new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        </footer>
      </main>

      <style>{pageStyle}</style>
    </div>
  )
}

function MetricCard({ title, value, subtitle, icon, growth, tooltip }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const positive = String(growth || '').startsWith('+')

  return (
    <div className="metric-card">
      <div className="metric-top">
        <div className="metric-icon">{icon}</div>
        <div className="metric-info">
          <Info
            size={15}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          />
          {showTooltip && tooltip && <div className="tooltip-box">{tooltip}</div>}
        </div>
      </div>
      <p>{title}</p>
      <div className="metric-value-row">
        <h2>{value}</h2>
        {growth && (
          <span className={positive ? 'growth positive' : 'growth negative'}>
            {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {growth}
          </span>
        )}
      </div>
      <small>{subtitle}</small>
    </div>
  )
}

function ChartCard({ icon, title, subtitle, children }) {
  return (
    <div className="chart-card">
      <div className="chart-title-row">
        <div className="chart-icon">{icon}</div>
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function MiniStat({ icon, label, value, danger }) {
  return (
    <div className="mini-stat">
      <div className={danger ? 'mini-icon danger' : 'mini-icon'}>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null

  return (
    <div className="custom-tooltip">
      <strong>{label || payload[0]?.name}</strong>
      {payload.map((item, idx) => (
        <div key={idx}>
          <span style={{ background: item.color || '#465fff' }} />
          {item.name}: {item.value}
        </div>
      ))}
    </div>
  )
}

const pageStyle = `
  * { box-sizing: border-box; }

  .tailadmin-page {
    width: 100%;
    max-width: 100%;
    min-height: calc(100vh - 80px);
    background: #f9fafb;
    color: #101828;
    overflow-x: hidden;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }


  .tail-main {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    margin: 0 auto;
    padding: 22px 22px 28px;
  }

  .topbar {
    position: sticky;
    top: 0;
    z-index: 50;
    min-height: 68px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin: 0 0 22px;
    padding: 13px 16px;
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid #eef2f7;
    border-radius: 16px;
    backdrop-filter: blur(12px);
    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.03);
  }

  .topbar-left,
  .topbar-right {
    display: flex;
    align-items: center;
    gap: 11px;
  }

  .topbar-left { min-width: 260px; flex: 1; }

  .topbar-right {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .icon-btn,
  .round-btn {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border: 1px solid #eef2f7;
    border-radius: 999px;
    background: #ffffff;
    color: #667085;
    cursor: pointer;
  }

  .topbar-search {
    width: min(420px, 100%);
    height: 42px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    border: 1px solid #eef2f7;
    border-radius: 10px;
    background: #ffffff;
    color: #98a2b3;
  }

  .topbar-search input {
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    font-size: 13px;
    color: #101828;
  }

  .topbar-search kbd {
    min-width: 32px;
    padding: 3px 6px;
    border-radius: 7px;
    background: #f2f4f7;
    color: #98a2b3;
    font-size: 11px;
    text-align: center;
  }

  .small-action,
  .filter-btn,
  .reset-btn {
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 12px;
    border: 1px solid #eef2f7;
    border-radius: 10px;
    background: #ffffff;
    color: #344054;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    transition: .18s ease;
  }

  .small-action:hover,
  .filter-btn:hover,
  .reset-btn:hover,
  .icon-btn:hover,
  .round-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 24px rgba(16, 24, 40, 0.07);
  }

  .small-action.primary,
  .small-action.active,
  .filter-btn.active {
    border-color: #465fff;
    color: #ffffff;
    background: #465fff;
    box-shadow: 0 12px 26px rgba(70, 95, 255, 0.22);
  }

  .user-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding-left: 4px;
    color: #344054;
    font-size: 13px;
    font-weight: 800;
  }

  .avatar {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: #f0f3ff;
    color: #465fff;
  }

  .page-title-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 20px;
    margin-bottom: 18px;
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 8px;
    color: #465fff;
    font-size: 12px;
    font-weight: 900;
  }

  .page-title-row h1 {
    margin: 0;
    color: #101828;
    font-size: clamp(25px, 3vw, 34px);
    line-height: 1.1;
    letter-spacing: -0.035em;
  }

  .page-title-row p {
    max-width: 650px;
    margin: 8px 0 0;
    color: #667085;
    font-size: 14px;
    line-height: 1.55;
  }

  .meta-box {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .meta-box span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid #eef2f7;
    border-radius: 999px;
    background: #ffffff;
    color: #667085;
    font-size: 12px;
    font-weight: 750;
  }

  .filter-bar,
  .date-filter-panel {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 18px;
  }

  .filter-bar select,
  .date-filter-panel input {
    height: 40px;
    border: 1px solid #eef2f7;
    border-radius: 10px;
    background: #ffffff;
    color: #344054;
    outline: none;
    padding: 0 12px;
    font-size: 13px;
    font-weight: 700;
  }

  .date-filter-panel {
    padding: 14px;
    border: 1px solid #eef2f7;
    border-radius: 14px;
    background: #ffffff;
  }

  .date-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #344054;
    font-size: 13px;
    font-weight: 900;
    margin-right: 4px;
  }

  .date-filter-panel label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #667085;
    font-size: 12px;
    font-weight: 800;
  }

  .metric-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 18px;
    margin-bottom: 18px;
  }

  .metric-card,
  .analytics-card,
  .chart-card,
  .mini-card,
  .priority-card,
  .insight-panel {
    border: 1px solid #eef2f7;
    border-radius: 16px;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.03);
  }

  .metric-card {
    min-height: 132px;
    padding: 18px;
    transition: .18s ease;
  }

  .metric-card:hover,
  .analytics-card:hover,
  .chart-card:hover,
  .mini-card:hover,
  .priority-card:hover,
  .insight-panel:hover {
    transform: translateY(-2px);
    box-shadow: 0 16px 32px rgba(16, 24, 40, 0.08);
  }

  .metric-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }

  .metric-icon {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 11px;
    color: #465fff;
    background: #f0f3ff;
  }

  .metric-info {
    position: relative;
    color: #98a2b3;
    cursor: help;
  }

  .tooltip-box {
    position: absolute;
    right: 0;
    top: -36px;
    z-index: 60;
    padding: 7px 9px;
    border-radius: 8px;
    background: #101828;
    color: #ffffff;
    white-space: nowrap;
    font-size: 11px;
    box-shadow: 0 12px 24px rgba(16, 24, 40, 0.20);
  }

  .metric-card p {
    margin: 0 0 7px;
    color: #667085;
    font-size: 12px;
    font-weight: 800;
  }

  .metric-value-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .metric-card h2 {
    margin: 0;
    color: #101828;
    font-size: 27px;
    line-height: 1;
    letter-spacing: -0.04em;
  }

  .metric-card small {
    display: block;
    margin-top: 9px;
    color: #667085;
    font-size: 12px;
  }

  .growth {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 7px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 900;
  }

  .growth.positive {
    color: #12b76a;
    background: #ecfdf3;
  }

  .growth.negative {
    color: #f04438;
    background: #fef3f2;
  }

  .analytics-card,
  .chart-card,
  .mini-card,
  .insight-panel {
    padding: 18px;
  }

  .card-header,
  .chart-title-row,
  .mini-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 14px;
  }

  .card-header h2,
  .chart-card h3,
  .mini-header h3,
  .insight-panel h2 {
    margin: 0;
    color: #101828;
    font-size: 18px;
    letter-spacing: -0.02em;
  }

  .card-header p,
  .chart-card p,
  .mini-card p,
  .insight-panel p {
    margin: 5px 0 0;
    color: #667085;
    font-size: 12px;
    line-height: 1.5;
  }

  .period-tabs {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 10px;
    background: #f9fafb;
    border: 1px solid #eef2f7;
  }

  .period-tabs button {
    min-height: 30px;
    border: 0;
    border-radius: 8px;
    padding: 0 10px;
    background: transparent;
    color: #667085;
    cursor: pointer;
    font-size: 12px;
    font-weight: 850;
  }

  .period-tabs button.active {
    background: #ffffff;
    color: #101828;
    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.08);
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 310px;
    gap: 18px;
    margin-top: 18px;
  }

  .chart-title-row {
    justify-content: flex-start;
  }

  .chart-icon {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 11px;
    color: #465fff;
    background: #f0f3ff;
  }

  .side-stack {
    display: grid;
    gap: 18px;
  }

  .mini-header {
    margin-bottom: 10px;
  }

  .mini-header span {
    color: #667085;
    font-size: 12px;
    font-weight: 800;
  }

  .mini-header h3 {
    margin-top: 6px;
    font-size: 28px;
  }

  .mini-list {
    display: grid;
    gap: 9px;
    margin-top: 15px;
  }

  .mini-stat {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border: 1px solid #eef2f7;
    border-radius: 12px;
    background: #fcfcfd;
  }

  .mini-icon {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    color: #465fff;
    background: #f0f3ff;
  }

  .mini-icon.danger {
    color: #f04438;
    background: #fef3f2;
  }

  .mini-stat span {
    color: #667085;
    font-size: 12px;
    font-weight: 750;
  }

  .mini-stat strong {
    color: #101828;
    font-size: 13px;
  }

  .priority-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
  }

  .priority-icon {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 12px;
    color: #f79009;
    background: #fffaeb;
  }

  .priority-card span {
    color: #f79009;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: .04em;
  }

  .priority-card h3 {
    margin: 6px 0;
    color: #101828;
    font-size: 14px;
    line-height: 1.4;
  }

  .priority-card p {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin: 0;
    color: #667085;
    font-size: 12px;
    font-weight: 800;
  }

  .insight-panel {
    margin-top: 18px;
  }

  .insight-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
  }

  .insight-card {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: flex-start;
    gap: 11px;
    min-height: 72px;
    padding: 14px;
    border: 1px solid #eef2f7;
    border-radius: 14px;
    background: #fcfcfd;
  }

  .insight-card p {
    margin: 0;
    color: #344054;
    font-size: 13px;
    line-height: 1.55;
  }

  .insight-number {
    width: 27px;
    height: 27px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    color: #ffffff;
    background: #465fff;
    font-size: 12px;
    font-weight: 900;
  }

  .empty-insight {
    grid-column: 1 / -1;
    min-height: 110px;
    display: grid;
    place-items: center;
    gap: 6px;
    color: #667085;
    border: 1px dashed #d0d5dd;
    border-radius: 14px;
    background: #fcfcfd;
  }

  .custom-tooltip {
    padding: 11px 12px;
    border-radius: 12px;
    background: rgba(16, 24, 40, 0.94);
    color: #ffffff;
    border: 1px solid rgba(255,255,255,0.12);
    box-shadow: 0 16px 34px rgba(16, 24, 40, 0.20);
    font-size: 12px;
  }

  .custom-tooltip strong {
    display: block;
    margin-bottom: 6px;
  }

  .custom-tooltip div {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: 4px;
    color: #eaecf0;
  }

  .custom-tooltip span {
    width: 8px;
    height: 8px;
    display: inline-block;
    border-radius: 999px;
  }

  .notification-stack {
    position: fixed;
    right: 22px;
    top: 84px;
    z-index: 9999;
    display: grid;
    gap: 10px;
  }

  .notif-card {
    min-width: 290px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 12px 13px;
    border: 1px solid #eef2f7;
    border-radius: 12px;
    background: #ffffff;
    color: #344054;
    box-shadow: 0 18px 36px rgba(16, 24, 40, 0.12);
    font-size: 13px;
    font-weight: 700;
    animation: slideIn .22s ease;
  }

  .notif-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #465fff;
  }

  .notif-success .notif-dot { background: #12b76a; }
  .notif-error .notif-dot { background: #f04438; }
  .notif-warning .notif-dot { background: #f79009; }

  @keyframes slideIn {
    from { transform: translateX(30px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  .dashboard-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: 22px 4px 2px;
    color: #667085;
    font-size: 12px;
  }

  .dashboard-footer div {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
  }

  .tail-loading {
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: #f9fafb;
    color: #344054;
    font-family: Inter, system-ui, sans-serif;
  }

  .tail-loading-card {
    width: min(420px, calc(100% - 32px));
    padding: 30px;
    text-align: center;
    border: 1px solid #eef2f7;
    border-radius: 18px;
    background: #ffffff;
    box-shadow: 0 18px 36px rgba(16, 24, 40, 0.08);
  }

  .loading-icon {
    width: 58px;
    height: 58px;
    display: grid;
    place-items: center;
    margin: 0 auto 14px;
    border-radius: 16px;
    color: #ffffff;
    background: #465fff;
    animation: spinPulse 1.2s infinite ease-in-out;
  }

  .tail-loading-card h3 {
    margin: 0 0 8px;
    color: #101828;
    font-size: 18px;
  }

  .tail-loading-card p {
    margin: 0;
    color: #667085;
    font-size: 13px;
  }

  @keyframes spinPulse {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @media (max-width: 1280px) {
    .dashboard-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .side-stack {
      grid-column: 1 / -1;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 1120px) {

    .topbar {
      height: auto;
      min-height: 72px;
      align-items: flex-start;
      padding-block: 14px;
    }

    .metric-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .tail-main {
      padding: 14px 14px 22px;
    }

    .topbar {
      margin: 0 0 22px;
      padding-inline: 14px;
      flex-direction: column;
      align-items: stretch;
    }

    .topbar-left {
      min-width: 0;
    }

    .topbar-left,
    .topbar-right,
    .page-title-row,
    .card-header {
      flex-direction: column;
      align-items: stretch;
    }

    .metric-row,
    .dashboard-grid,
    .side-stack {
      grid-template-columns: 1fr;
    }

    .small-action,
    .filter-btn,
    .filter-bar select,
    .period-tabs,
    .topbar-search {
      width: 100%;
    }

    .period-tabs button {
      flex: 1;
    }

    .meta-box {
      justify-content: flex-start;
    }
  }
`
