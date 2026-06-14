import { useEffect, useMemo, useState } from 'react'

import { laporanAPI } from '../api'

const JENIS_ORDER = ['Literasi', 'Numerasi', 'HOTS']

const JENIS_STYLE = {
  Literasi: { badge: 'teal', color: '#0F6E56' },
  Numerasi: { badge: 'amber', color: '#854F0B' },
  HOTS: { badge: 'blue', color: '#185FA5' },
  Lainnya: { badge: 'gray', color: '#5F5E5A' },
}

const STATUS_STYLE = {
  aktif: { badge: 'teal', dot: 'green' },
  draft: { badge: 'amber', dot: 'amber' },
  nonaktif: { badge: 'coral', dot: 'red' },
}

const SCHOOL_ORDER = ['SMPS Adabiah Padang', 'SMPN 12 Padang', 'MTsN 6 Padang']

export default function SuperAdminDashboard() {
  const [data, setData] = useState(null)
  const [selectedSchool, setSelectedSchool] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')

    const params = selectedSchool ? { id_sekolah: selectedSchool } : undefined

    laporanAPI.superAdminDashboard(params)
      .then(res => setData(res.data.data))
      .catch(err => {
        setData(null)
        setError(err.response?.data?.message || 'Data dashboard belum dapat dimuat.')
      })
      .finally(() => setLoading(false))
  }, [selectedSchool])

  const stats = data?.stats || {}
  const schools = useMemo(() => sortBySchoolOrder(data?.sekolah || []), [data])
  const perSekolah = useMemo(() => sortBySchoolOrder(data?.perSekolah || []), [data])
  const latest = data?.instrumenTerbaru || []
  const hasGlobalPengerjaan = Number(stats.totalPengerjaan || 0) > 0

  const komposisiJenis = useMemo(() => {
    const fromApi = new Map((data?.komposisiJenis || []).map(item => [item.jenis || 'Lainnya', Number(item.jumlah || 0)]))
    const ordered = JENIS_ORDER.map(jenis => ({ jenis, jumlah: fromApi.get(jenis) || 0 }))
    const otherTotal = [...fromApi.entries()]
      .filter(([jenis]) => !JENIS_ORDER.includes(jenis))
      .reduce((sum, [, jumlah]) => sum + Number(jumlah || 0), 0)

    return otherTotal > 0 ? [...ordered, { jenis: 'Lainnya', jumlah: otherTotal }] : ordered
  }, [data])

  const statsCards = [
    { label: 'Total Sekolah', value: stats.totalSekolah, note: selectedSchool ? 'sekolah terpilih' : 'terdaftar dalam sistem' },
    { label: 'Total Guru', value: stats.totalGuru, note: 'akun guru aktif' },
    { label: 'Total Siswa', value: stats.totalSiswa, note: 'akun siswa aktif' },
    { label: 'Total Instrumen', value: stats.totalInstrumen, note: 'semua instrumen' },
    { label: 'Instrumen Aktif', value: stats.instrumenAktif, note: 'siap dikerjakan siswa' },
    { label: 'Total Pengerjaan', value: stats.totalPengerjaan, note: 'hasil siswa tersimpan' },
    {
      label: 'Rata-rata Nilai',
      value: hasGlobalPengerjaan ? formatScore(stats.rataRataNilai) : '-',
      note: hasGlobalPengerjaan ? 'seluruh hasil siswa' : 'Belum ada data pengerjaan',
    },
    {
      label: 'Ketuntasan Global',
      value: hasGlobalPengerjaan ? formatPercent(stats.ketuntasanGlobal) : '-',
      note: hasGlobalPengerjaan ? 'berdasarkan KKM 75' : 'Belum ada data pengerjaan',
    },
  ]

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <div className="spinner spinner-dark" style={{ width: 32, height: 32 }} />
      </div>
    )
  }

  return (
    <div className="super-dashboard">
      <section className="super-dashboard-header">
        <div>
          <div className="super-eyebrow">DASHBOARD SUPER ADMIN</div>
          <h2>Ringkasan penggunaan sistem instrumen di seluruh sekolah.</h2>
          <p>Memantau sekolah, pengguna, instrumen, pengerjaan, dan capaian nilai secara global.</p>
        </div>

        <div className="super-filter-card">
          <label htmlFor="super-school-filter">Filter sekolah</label>
          <select
            id="super-school-filter"
            className="input"
            value={selectedSchool}
            onChange={event => setSelectedSchool(event.target.value)}
          >
            <option value="">Semua sekolah</option>
            {schools.map(school => (
              <option key={school.id} value={school.id}>
                {school.nama_sekolah}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="super-stat-grid">
        {statsCards.map(card => (
          <div className="super-stat-card" key={card.label}>
            <div className="super-stat-label">{card.label}</div>
            <div className="super-stat-value">{card.value ?? 0}</div>
            <div className="super-stat-note">{card.note}</div>
          </div>
        ))}
      </section>

      <section className="super-compare-grid">
        <ComparisonPanel
          title="Rata-rata Nilai per Sekolah"
          subtitle="Nilai rata-rata dari seluruh pengerjaan siswa"
          data={perSekolah}
          metric="rata_rata_nilai"
          suffix=""
          max={100}
          requiresPengerjaan
          emptyText="Belum ada data nilai siswa."
        />
        <ComparisonPanel
          title="Ketuntasan per Sekolah"
          subtitle="Persentase hasil dengan nilai minimal 75"
          data={perSekolah}
          metric="ketuntasan"
          suffix="%"
          max={100}
          requiresPengerjaan
          emptyText="Belum ada data ketuntasan."
        />
        <ComparisonPanel
          title="Jumlah Instrumen per Sekolah"
          subtitle="Total instrumen yang tercatat di setiap sekolah"
          data={perSekolah}
          metric="total_instrumen"
          suffix=""
          emptyText="Belum ada instrumen yang dibuat."
        />
      </section>

      <section className="super-panel">
        <div className="super-panel-head">
          <div>
            <h3>Komposisi Jenis Instrumen</h3>
            <p>Distribusi Literasi, Numerasi, dan HOTS pada lingkup yang dipilih</p>
          </div>
          <span className="super-panel-total">{formatNumber(totalOf(komposisiJenis))} instrumen</span>
        </div>
        <div className="super-composition">
          {komposisiJenis.map(item => (
            <CompositionItem key={item.jenis} item={item} total={totalOf(komposisiJenis)} />
          ))}
        </div>
        {totalOf(komposisiJenis) === 0 && (
          <EmptyState text="Komposisi akan muncul setelah sekolah membuat instrumen." />
        )}
      </section>

      <section className="super-panel">
        <div className="super-panel-head super-panel-head-table">
          <div>
            <h3>Instrumen Terbaru</h3>
            <p>Daftar instrumen terbaru dari seluruh sekolah atau sekolah terpilih</p>
          </div>
          <span className="super-panel-total">{formatNumber(latest.length)} entri</span>
        </div>

        <div className="super-table-wrap">
          <table className="super-table">
            <thead>
              <tr>
                <th>Sekolah</th>
                <th>Judul</th>
                <th>Jenis</th>
                <th>Kelas</th>
                <th>Guru</th>
                <th>Status</th>
                <th>Rata-rata Nilai</th>
                <th>Ketuntasan</th>
              </tr>
            </thead>
            <tbody>
              {latest.map(item => (
                <InstrumentRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        </div>

        {latest.length === 0 && (
          <EmptyState text="Belum ada instrumen terbaru pada lingkup ini." />
        )}
      </section>
    </div>
  )
}

function ComparisonPanel({ title, subtitle, data, metric, suffix, max, requiresPengerjaan = false, emptyText }) {
  const hasItemData = (item) => !requiresPengerjaan || Number(item.total_pengerjaan || 0) > 0
  const values = data.map(item => hasItemData(item) ? Number(item[metric] || 0) : 0)
  const computedMax = max || Math.max(...values, 1)
  const hasData = data.some(item => hasItemData(item) && (requiresPengerjaan || Number(item[metric] || 0) > 0))

  return (
    <div className="super-panel">
      <div className="super-panel-head">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="super-bar-list">
        {data.map(item => {
          const itemHasData = hasItemData(item)
          const value = itemHasData ? Number(item[metric] || 0) : 0
          const width = itemHasData && computedMax > 0 ? Math.min(100, (value / computedMax) * 100) : 0

          return (
            <div className="super-bar-row" key={`${metric}-${item.id}`}>
              <div className="super-bar-meta">
                <span>{item.nama_sekolah}</span>
                <strong>{itemHasData ? formatMetric(value, suffix) : '-'}</strong>
              </div>
              <div className="super-bar-track">
                <div className="super-bar-fill" style={{ width: `${width}%` }} />
              </div>
            </div>
          )
        })}
      </div>
      {(!data.length || !hasData) && <EmptyState text={emptyText} compact />}
    </div>
  )
}

function CompositionItem({ item, total }) {
  const style = JENIS_STYLE[item.jenis] || JENIS_STYLE.Lainnya
  const percent = total > 0 ? Math.round((Number(item.jumlah || 0) / total) * 100) : 0

  return (
    <div className="super-composition-item">
      <div className="super-composition-top">
        <span className={`badge badge-${style.badge}`}>{item.jenis}</span>
        <strong>{formatNumber(item.jumlah)}</strong>
      </div>
      <div className="super-bar-track">
        <div className="super-bar-fill" style={{ width: `${percent}%`, background: style.color }} />
      </div>
      <div className="super-composition-foot">{percent}% dari total instrumen</div>
    </div>
  )
}

function InstrumentRow({ item }) {
  const jenis = JENIS_STYLE[item.jenis] || JENIS_STYLE.Lainnya
  const status = STATUS_STYLE[item.status] || STATUS_STYLE.draft
  const hasPengerjaan = Number(item.total_pengerjaan || 0) > 0

  return (
    <tr>
      <td>{item.nama_sekolah || '-'}</td>
      <td>
        <div className="super-title-cell">{item.judul || '-'}</div>
      </td>
      <td>
        <span className={`badge badge-${jenis.badge}`}>{item.jenis || '-'}</span>
      </td>
      <td>{item.kelas || '-'}</td>
      <td>{item.guru || '-'}</td>
      <td>
        <span className={`badge badge-${status.badge}`}>
          <span className={`dot dot-${status.dot}`} />
          {item.status || 'draft'}
        </span>
      </td>
      <td>{hasPengerjaan ? formatScore(item.rata_rata_nilai) : '-'}</td>
      <td>{hasPengerjaan ? formatPercent(item.ketuntasan) : '-'}</td>
    </tr>
  )
}

function EmptyState({ text, compact = false }) {
  return (
    <div className={compact ? 'super-empty compact' : 'super-empty'}>
      {text}
    </div>
  )
}

function totalOf(items) {
  return items.reduce((sum, item) => sum + Number(item.jumlah || 0), 0)
}

function formatNumber(value) {
  return new Intl.NumberFormat('id-ID').format(Number(value || 0))
}

function formatScore(value) {
  const number = Number(value || 0)
  return number > 0 ? number.toLocaleString('id-ID', { maximumFractionDigits: 1 }) : '0'
}

function formatPercent(value) {
  const number = Number(value || 0)
  return `${number.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`
}

function formatMetric(value, suffix = '') {
  if (suffix === '%') return formatPercent(value)
  return formatNumber(value)
}

function sortBySchoolOrder(items) {
  return [...items].sort((a, b) => {
    const first = getSchoolIndex(a.nama_sekolah)
    const second = getSchoolIndex(b.nama_sekolah)

    if (first !== second) return first - second
    return String(a.nama_sekolah || '').localeCompare(String(b.nama_sekolah || ''), 'id-ID')
  })
}

function getSchoolIndex(name) {
  const index = SCHOOL_ORDER.indexOf(name)
  return index === -1 ? SCHOOL_ORDER.length : index
}
