import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Medal,
  TrendingDown,
  UserX,
  Users,
  X
} from "lucide-react";
import api from "../api";
import { sanitizeRichHtml, stripHtml } from "../utils/sanitizeHtml";
import { toast } from "../utils/notify";

const API_ASSET_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/api\/?$/, "");
const PASSING_SCORE = 75;

const TAB_ITEMS = [
  { key: "sudah", label: "Sudah Mengerjakan" },
  { key: "belum", label: "Belum Mengerjakan" },
  { key: "butir", label: "Analisis Butir" },
  { key: "tipe", label: "Analisis Tipe" },
  { key: "rekomendasi", label: "Rekomendasi" }
];

const statusBadgeClass = (percent) => (
  percent >= 100 ? "badge-teal" : percent > 0 ? "badge-amber" : "badge-red"
);

const statusText = (ratio) => {
  if (ratio >= 1) return "Benar";
  if (ratio > 0) return `Sebagian (${Math.round(ratio * 100)}%)`;
  return "Salah";
};

const tipeLabel = (tipe = "") => String(tipe || "-").replace(/_/g, " ");

const formatNumber = (value) => {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
};

const clampPercent = (value) => Math.max(0, Math.min(100, Number(value || 0)));

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const formatDuration = (siswa = {}) => {
  let seconds = Number(siswa.durasi_detik || 0);

  if (!seconds && siswa.waktu_mulai && siswa.waktu_selesai) {
    const start = new Date(siswa.waktu_mulai).getTime();
    const end = new Date(siswa.waktu_selesai).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
      seconds = Math.floor((end - start) / 1000);
    }
  }

  if (!seconds) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  if (hours > 0) return `${hours} jam ${minutes} menit ${rest} detik`;
  if (minutes > 0) return `${minutes} menit ${rest} detik`;
  return `${rest} detik`;
};

const decodeHtmlEntities = (value = "") => {
  if (typeof document === "undefined") {
    return String(value || "")
      .replace(/&(?:amp;)+nbsp;/gi, " ")
      .replace(/&nbsp;/gi, " ");
  }

  let output = String(value || "");
  for (let i = 0; i < 3; i += 1) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = output;
    const decoded = textarea.value || "";
    if (decoded === output) break;
    output = decoded;
  }

  return output
    .replace(/\u00a0/g, " ")
    .replace(/&(?:amp;)+nbsp;/gi, " ")
    .replace(/&nbsp;/gi, " ");
};

const getSafeHtml = (value = "") => {
  const decoded = decodeHtmlEntities(value);
  return sanitizeRichHtml(decoded) || stripHtml(decoded);
};

const RichContent = ({ value, fallback = "-" }) => {
  const safeHtml = getSafeHtml(value);
  if (!safeHtml || !safeHtml.trim()) return <span>{fallback}</span>;

  return (
    <div
      className="monitoring-rich-content"
      style={{ lineHeight: 1.65 }}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
};

const getImageSrc = (gambarSoal) => {
  if (!gambarSoal) return "";
  const value = typeof gambarSoal === "string"
    ? gambarSoal
    : gambarSoal?.file_name || gambarSoal?.src || "";

  if (!value) return "";
  if (value.startsWith("http") || value.startsWith("data:image")) return value;
  if (value.startsWith("/uploads")) return `${API_ASSET_URL}${value}`;
  return `${API_ASSET_URL}/uploads/soal/${value}`;
};

const renderSupportTables = (tabelData) => {
  if (!Array.isArray(tabelData) || tabelData.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
      {tabelData.map((table, tableIndex) => {
        const rows = Array.isArray(table?.rows) ? table.rows : [];
        if (rows.length === 0) return null;

        return (
          <div key={tableIndex} style={{ overflowX: "auto" }}>
            {table.caption && (
              <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>
                <RichContent value={table.caption} />
              </div>
            )}
            <table className="table" style={{ fontSize: 13, width: table.width || "100%" }}>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        style={{
                          border: "1px solid #E5E7EB",
                          padding: 8,
                          background: rowIndex === 0 ? "#F8FAFC" : "#FFFFFF",
                          fontWeight: rowIndex === 0 ? 700 : 400
                        }}
                      >
                        <RichContent value={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
};

const getNilai = (siswa = {}) => Number(siswa.nilai_terhitung ?? siswa.nilai ?? 0);
const getTotalBenar = (siswa = {}) => Number(siswa.total_benar_aktual ?? siswa.total_benar ?? 0);
const getTotalSoal = (siswa = {}) => Number(siswa.total_soal_aktual ?? siswa.total_soal ?? 0);

const MiniMetric = ({ label, value }) => (
  <div className="monitoring-mini-metric">
    <div className="monitoring-mini-label">{label}</div>
    <div className="monitoring-mini-value">{value}</div>
  </div>
);

const MonitoringMetricCard = ({ label, value, note, icon: Icon, tone = "blue" }) => (
  <div className={`monitoring-detail-metric tone-${tone}`}>
    <div className="monitoring-detail-metric-icon">
      <Icon size={18} />
    </div>
    <div>
      <div className="monitoring-detail-metric-label">{label}</div>
      <div className="monitoring-detail-metric-value">{value}</div>
      <div className="monitoring-detail-metric-note">{note}</div>
    </div>
  </div>
);

const MonitoringPanel = ({ title, subtitle, badge, action, children, className = "" }) => (
  <section className={`monitoring-detail-panel ${className}`}>
    <div className="monitoring-detail-panel-head">
      <div>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="monitoring-detail-panel-actions">
        {badge}
        {action}
      </div>
    </div>
    {children}
  </section>
);

const StatusCell = ({ correct }) => (
  <span className={`badge ${correct ? "badge-teal" : "badge-red"}`}>
    {correct ? "Benar" : "Salah"}
  </span>
);

const GeneralAnswerDetail = ({ jawab }) => (
  <div style={{ display: "grid", gap: 10 }}>
    <div style={{ padding: 12, borderRadius: 8, background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
      <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>Jawaban siswa</div>
      <strong>{Array.isArray(jawab.jawaban) ? jawab.jawaban.join(", ") : jawab.jawaban || "-"}</strong>
    </div>
    <div style={{ padding: 12, borderRadius: 8, background: "#FFFFFF", border: "1px dashed #CBD5E1" }}>
      <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>Kunci jawaban</div>
      <strong>{jawab.kunci_display || jawab.jawaban_benar || "-"}</strong>
    </div>
  </div>
);

const GandaKompleksDetail = ({ jawab }) => {
  const rows = Array.isArray(jawab.analisis_subbutir) ? jawab.analisis_subbutir : [];

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="table">
        <thead>
          <tr>
            <th>Opsi</th>
            <th>Teks Opsi</th>
            <th>Dipilih Siswa</th>
            <th>Kunci Benar</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.opsi}>
              <td><strong>{row.opsi}</strong></td>
              <td><RichContent value={row.teks_opsi} /></td>
              <td>{row.dipilih_siswa ? "Ya" : "Tidak"}</td>
              <td>{row.kunci_benar ? "Ya" : "Tidak"}</td>
              <td><StatusCell correct={row.benar} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8, fontSize: 12, color: "#64748B" }}>
        Kunci: <strong>{jawab.kunci_display || "-"}</strong>
      </div>
    </div>
  );
};

const BenarSalahDetail = ({ jawab }) => {
  const rows = Array.isArray(jawab.analisis_subbutir) ? jawab.analisis_subbutir : [];

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="table">
        <thead>
          <tr>
            <th>No</th>
            <th>Pernyataan</th>
            <th>Jawaban Siswa</th>
            <th>Kunci</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.no}>
              <td>{row.no}</td>
              <td><RichContent value={row.pernyataan} /></td>
              <td>{row.jawaban_siswa || "-"}</td>
              <td>{row.kunci || "-"}</td>
              <td><StatusCell correct={row.benar} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const MenjodohkanDetail = ({ jawab }) => {
  const rows = Array.isArray(jawab.analisis_subbutir) ? jawab.analisis_subbutir : [];

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="table">
        <thead>
          <tr>
            <th>No</th>
            <th>Pernyataan/Kiri</th>
            <th>Jawaban Siswa</th>
            <th>Kunci</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.no}>
              <td>{row.no}</td>
              <td><RichContent value={row.pernyataan} /></td>
              <td>
                <strong>{row.jawaban_siswa || "-"}</strong>
                {row.jawaban_siswa_teks && (
                  <div style={{ fontSize: 12, color: "#64748B" }}>
                    <RichContent value={row.jawaban_siswa_teks} />
                  </div>
                )}
              </td>
              <td>
                <strong>{row.kunci || "-"}</strong>
                {row.kunci_teks && (
                  <div style={{ fontSize: 12, color: "#64748B" }}>
                    <RichContent value={row.kunci_teks} />
                  </div>
                )}
              </td>
              <td><StatusCell correct={row.benar} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const AnswerAnalysis = ({ jawab }) => {
  if (jawab.tipe_soal === "ganda_kompleks") return <GandaKompleksDetail jawab={jawab} />;
  if (jawab.tipe_soal === "benar_salah") return <BenarSalahDetail jawab={jawab} />;
  if (jawab.tipe_soal === "menjodohkan") return <MenjodohkanDetail jawab={jawab} />;
  return <GeneralAnswerDetail jawab={jawab} />;
};

export default function MonitoringPage() {
  const { instrumenId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = ["sudah", "belum", "butir", "tipe", "rekomendasi"].includes(searchParams.get("view"))
    ? searchParams.get("view")
    : "sudah";

  const [loading, setLoading] = useState(true);
  const [instrumen, setInstrumen] = useState(null);
  const [hasilSiswa, setHasilSiswa] = useState([]);
  const [statistik, setStatistik] = useState(null);
  const [analisisButir, setAnalisisButir] = useState([]);
  const [analisisTipe, setAnalisisTipe] = useState([]);
  const [rekomendasi, setRekomendasi] = useState(null);
  const [selectedSiswa, setSelectedSiswa] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [belumMengerjakan, setBelumMengerjakan] = useState({
    total_belum_mengerjakan: 0,
    per_rombel: {},
    daftar_siswa: []
  });
  const [loadingBelum, setLoadingBelum] = useState(false);

  const fetchBelumMengerjakan = async () => {
    setLoadingBelum(true);
    try {
      const res = await api.get(`/soal/monitoring/${instrumenId}/belum-mengerjakan`);
      setBelumMengerjakan(res.data.data || {
        total_belum_mengerjakan: 0,
        per_rombel: {},
        daftar_siswa: []
      });
    } catch (err) {
      console.error(err);
      setBelumMengerjakan({
        total_belum_mengerjakan: 0,
        per_rombel: {},
        daftar_siswa: []
      });
    } finally {
      setLoadingBelum(false);
    }
  };

  const fetchData = async () => {
    try {
      const [resInstrumen, resMonitoring] = await Promise.all([
        api.get(`/instrumen/${instrumenId}`),
        api.get(`/soal/monitoring/${instrumenId}`)
      ]);

      const monitoringData = resMonitoring.data.data || {};
      setInstrumen(resInstrumen.data.data);
      setHasilSiswa(monitoringData.hasil || []);
      setStatistik(monitoringData.statistik || null);
      setAnalisisButir(monitoringData.analisis_butir || []);
      setAnalisisTipe(monitoringData.analisis_tipe || []);
      setRekomendasi(monitoringData.rekomendasi || null);
      await fetchBelumMengerjakan();
    } catch (err) {
      console.error(err);
      toast.error("Gagal memuat data monitoring");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalSudahMengerjakan = hasilSiswa.length;
  const totalBelumMengerjakan = belumMengerjakan.total_belum_mengerjakan || 0;
  const totalSiswa = totalSudahMengerjakan + totalBelumMengerjakan;
  const totalTuntas = hasilSiswa.filter((siswa) => getNilai(siswa) >= PASSING_SCORE).length;
  const completionPercent = totalSiswa > 0
    ? Math.round((totalSudahMengerjakan / totalSiswa) * 100)
    : 0;
  const masteryPercent = totalSudahMengerjakan > 0
    ? Math.round((totalTuntas / totalSudahMengerjakan) * 100)
    : 0;

  const rekomendasiGabungan = useMemo(() => {
    const belum = belumMengerjakan.daftar_siswa || [];
    return {
      ...(rekomendasi || {}),
      belum_mengerjakan: belum
    };
  }, [rekomendasi, belumMengerjakan]);

  const lihatDetailSiswa = (siswa) => {
    setSelectedSiswa(siswa);
    setShowModal(true);
  };

  const exportBelumMengerjakan = () => {
    const daftar = belumMengerjakan.daftar_siswa || [];
    if (daftar.length === 0) {
      toast.error("Tidak ada data siswa yang belum mengerjakan");
      return;
    }

    let csv = "No,Nama Siswa,NIS,Kelas\n";
    daftar.forEach((siswa, idx) => {
      csv += `${idx + 1},"${siswa.nama || "-"}","${siswa.nisn || "-"}","${siswa.kelas || "-"}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `siswa_belum_mengerjakan_${instrumen?.judul || "instrumen"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
        <div className="spinner spinner-dark" />
      </div>
    );
  }

  return (
    <div className="page-content monitoring-detail-page">
      <section className="monitoring-detail-hero">
        <div className="monitoring-detail-hero-main">
          <button className="monitoring-detail-back" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
            Kembali
          </button>
          <div>
            <div className="monitoring-detail-eyebrow">Monitoring Detail</div>
            <h1>Monitoring Hasil Siswa</h1>
            <p>{instrumen?.judul || "-"} - {instrumen?.mata_pelajaran || "-"} - Kelas {instrumen?.kelas || "-"}</p>
          </div>
        </div>
        <div className="monitoring-detail-hero-side">
          <div className="monitoring-detail-progress-card">
            <span>Progres pengerjaan</span>
            <strong>{completionPercent}%</strong>
            <div className="monitoring-progress">
              <span style={{ width: `${clampPercent(completionPercent)}%` }} />
            </div>
            <small>{totalSudahMengerjakan} dari {totalSiswa} siswa sudah mengerjakan</small>
          </div>
          <div className="monitoring-detail-progress-card">
            <span>Ketuntasan</span>
            <strong>{masteryPercent}%</strong>
            <div className="monitoring-progress success">
              <span style={{ width: `${clampPercent(masteryPercent)}%` }} />
            </div>
            <small>{totalTuntas} siswa mencapai nilai minimal {PASSING_SCORE}</small>
          </div>
        </div>
      </section>

      {statistik && (
        <section className="monitoring-detail-metric-grid">
          <MonitoringMetricCard label="Total Siswa" value={totalSiswa} note="target dan peserta terdata" icon={Users} tone="blue" />
          <MonitoringMetricCard label="Sudah Mengerjakan" value={totalSudahMengerjakan} note={`${completionPercent}% dari target`} icon={CheckCircle2} tone="teal" />
          <MonitoringMetricCard label="Belum Mengerjakan" value={totalBelumMengerjakan} note="perlu tindak lanjut" icon={UserX} tone="amber" />
          <MonitoringMetricCard label="Rata-rata Nilai" value={formatNumber(statistik.rata_rata)} note={`KKM ${PASSING_SCORE}`} icon={BarChart3} tone="purple" />
          <MonitoringMetricCard label="Nilai Tertinggi" value={formatNumber(statistik.nilai_tertinggi)} note="capaian terbaik" icon={Medal} tone="green" />
          <MonitoringMetricCard label="Nilai Terendah" value={formatNumber(statistik.nilai_terendah)} note="prioritas bantuan" icon={TrendingDown} tone="red" />
        </section>
      )}

      <nav className="monitoring-detail-tabs" aria-label="Tab monitoring detail">
        {TAB_ITEMS.map((item) => {
          const count = item.key === "sudah"
            ? totalSudahMengerjakan
            : item.key === "belum"
              ? totalBelumMengerjakan
              : null;

          return (
            <button
              key={item.key}
              type="button"
              className={activeTab === item.key ? "active" : ""}
              onClick={() => setActiveTab(item.key)}
            >
              {item.label}
              {count !== null && <span>{count}</span>}
            </button>
          );
        })}
      </nav>

      {activeTab === "sudah" && (
        <MonitoringPanel
          title="Daftar Siswa yang Sudah Mengerjakan"
          subtitle="Pantau nilai, durasi, dan status ketuntasan setiap siswa."
          badge={<span className="badge badge-gray">{hasilSiswa.length} siswa</span>}
        >

          {hasilSiswa.length === 0 ? (
            <div className="empty">
              <div className="empty-text">Belum ada siswa yang mengerjakan soal ini.</div>
            </div>
          ) : (
            <div className="monitoring-table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Nama Siswa</th>
                    <th>Nilai</th>
                    <th>Benar</th>
                    <th>Total Butir</th>
                    <th>Status</th>
                    <th>Durasi</th>
                    <th>Waktu Selesai</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {hasilSiswa.map((siswa, idx) => {
                    const nilai = getNilai(siswa);
                    return (
                      <tr key={siswa.siswa_id}>
                        <td>{idx + 1}</td>
                        <td>
                          <strong>{siswa.siswa_nama}</strong>
                          <br />
                          <small className="monitoring-muted">
                            NIS: {siswa.nis || "-"}
                          </small>
                        </td>
                        <td>
                          <span className={`badge ${nilai >= PASSING_SCORE ? "badge-teal" : "badge-red"}`}>
                            {formatNumber(nilai)}
                          </span>
                        </td>
                        <td>{getTotalBenar(siswa)}</td>
                        <td>{getTotalSoal(siswa)}</td>
                        <td>
                          <span className={`badge ${nilai >= PASSING_SCORE ? "badge-teal" : "badge-red"}`}>
                            {nilai >= PASSING_SCORE ? "Tuntas" : "Belum tuntas"}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>{formatDuration(siswa)}</td>
                        <td style={{ fontSize: 12 }}>{formatDateTime(siswa.waktu_selesai)}</td>
                        <td>
                          <button
                            className="btn btn-primary btn-sm monitoring-detail-action"
                            onClick={() => lihatDetailSiswa(siswa)}
                          >
                            <Eye size={13} />
                            Detail
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </MonitoringPanel>
      )}

      {activeTab === "belum" && (
        <MonitoringPanel
          title="Daftar Siswa yang Belum Mengerjakan"
          subtitle="Gunakan daftar ini untuk follow up siswa yang belum menyelesaikan instrumen."
          badge={
            <>
              <span className="badge badge-gray">{totalBelumMengerjakan} siswa</span>
              {totalBelumMengerjakan > 0 && (
                <button className="btn btn-sm monitoring-detail-action" onClick={exportBelumMengerjakan}>
                  <Download size={13} />
                  Export CSV
                </button>
              )}
            </>
          }
        >

          {loadingBelum ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
              <div className="spinner spinner-dark" />
            </div>
          ) : totalBelumMengerjakan === 0 ? (
            <div className="empty">
              <div className="empty-text">Semua siswa sudah mengerjakan instrumen ini.</div>
            </div>
          ) : (
            <>
              {Object.keys(belumMengerjakan.per_rombel || {}).length > 0 && (
                <div className="monitoring-rombel-block">
                  <h4>
                    Ringkasan per Rombel
                  </h4>
                  <div className="monitoring-rombel-grid">
                    {Object.entries(belumMengerjakan.per_rombel).map(([kelas, siswaList]) => (
                      <div key={kelas} className="monitoring-rombel-card">
                        <div>Kelas {kelas}</div>
                        <strong>{siswaList.length}</strong>
                        <span>siswa</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="monitoring-table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Nama Siswa</th>
                      <th>NIS</th>
                      <th>Kelas</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(belumMengerjakan.daftar_siswa || []).map((siswa, idx) => (
                      <tr key={siswa.siswa_id || idx}>
                        <td>{idx + 1}</td>
                        <td><strong>{siswa.nama}</strong></td>
                        <td>{siswa.nisn || "-"}</td>
                        <td>{siswa.kelas || instrumen?.kelas || "-"}</td>
                        <td><span className="badge badge-red">Belum mengerjakan</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </MonitoringPanel>
      )}

      {activeTab === "butir" && (
        <MonitoringPanel
          title="Analisis Butir Soal"
          subtitle="Lihat pola benar-salah untuk menentukan butir yang perlu dibahas ulang."
          badge={<span className="badge badge-gray">{analisisButir.length} butir</span>}
        >
          <div className="monitoring-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nomor Soal</th>
                  <th>Tipe Soal</th>
                  <th>Jumlah Benar</th>
                  <th>Jumlah Salah</th>
                  <th>Persentase Benar</th>
                  <th>Kategori</th>
                </tr>
              </thead>
              <tbody>
                {analisisButir.map((item) => (
                  <tr key={item.soal_id}>
                    <td>{item.nomor_soal}</td>
                    <td>{tipeLabel(item.tipe_soal)}</td>
                    <td>{item.jumlah_benar}</td>
                    <td>{item.jumlah_salah}</td>
                    <td>{formatNumber(item.persentase_benar)}%</td>
                    <td><span className="badge badge-gray">{item.kategori}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </MonitoringPanel>
      )}

      {activeTab === "tipe" && (
        <MonitoringPanel
          title="Analisis Tipe Soal"
          subtitle="Bandingkan performa siswa berdasarkan format soal."
          badge={<span className="badge badge-gray">{analisisTipe.length} tipe</span>}
        >
          <div className="monitoring-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tipe Soal</th>
                  <th>Jumlah Soal</th>
                  <th>Rata-rata Persentase Benar</th>
                  <th>Kategori Pemahaman</th>
                </tr>
              </thead>
              <tbody>
                {analisisTipe.map((item) => (
                  <tr key={item.tipe_soal}>
                    <td>{tipeLabel(item.tipe_soal)}</td>
                    <td>{item.jumlah_soal}</td>
                    <td>{formatNumber(item.rata_rata_persentase_benar)}%</td>
                    <td><span className="badge badge-gray">{item.kategori_pemahaman}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </MonitoringPanel>
      )}

      {activeTab === "rekomendasi" && (
        <div className="monitoring-recommendation-stack">
          <MonitoringPanel
            title="Rekomendasi Remedial"
            subtitle="Daftar saran tindak lanjut yang dibuat dari hasil pengerjaan siswa."
            badge={<AlertTriangle size={18} className="monitoring-panel-icon" />}
          >
            <div className="monitoring-recommendation-list">
              {(rekomendasiGabungan.rekomendasi_remedial || []).map((item, idx) => (
                <div key={idx} className="monitoring-recommendation-item">
                  {item}
                </div>
              ))}
            </div>
          </MonitoringPanel>

          <MonitoringPanel
            title="Siswa yang Perlu Ditindaklanjuti"
            subtitle="Prioritaskan siswa yang belum tuntas dan belum mengerjakan."
          >
            <div className="monitoring-followup-grid">
              <div className="monitoring-followup-card">
                <h4>Belum tuntas</h4>
                {(rekomendasiGabungan.siswa_belum_tuntas || []).length === 0 ? (
                  <div className="monitoring-muted">Tidak ada siswa belum tuntas.</div>
                ) : (
                  (rekomendasiGabungan.siswa_belum_tuntas || []).map((siswa) => (
                    <div key={siswa.siswa_id} className="monitoring-followup-row">
                      <strong>{siswa.nama}</strong> - Nilai {formatNumber(siswa.nilai)}
                    </div>
                  ))
                )}
              </div>
              <div className="monitoring-followup-card">
                <h4>Belum mengerjakan</h4>
                {(rekomendasiGabungan.belum_mengerjakan || []).length === 0 ? (
                  <div className="monitoring-muted">Tidak ada siswa belum mengerjakan.</div>
                ) : (
                  (rekomendasiGabungan.belum_mengerjakan || []).map((siswa) => (
                    <div key={siswa.siswa_id} className="monitoring-followup-row">
                      <strong>{siswa.nama}</strong> - {siswa.kelas || instrumen?.kelas || "-"}
                    </div>
                  ))
                )}
              </div>
            </div>
          </MonitoringPanel>

          <MonitoringPanel
            title="Prioritas Pembahasan"
            subtitle="Soal dengan jumlah kesalahan tinggi untuk dibahas ulang."
            badge={<FileText size={18} className="monitoring-panel-icon" />}
          >
            <div className="monitoring-table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Soal</th>
                    <th>Tipe</th>
                    <th>Jumlah Salah</th>
                    <th>Persentase Benar</th>
                    <th>Kategori</th>
                  </tr>
                </thead>
                <tbody>
                  {(rekomendasiGabungan.soal_paling_banyak_salah || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ color: "#64748B" }}>
                        Tidak ada soal yang dominan salah.
                      </td>
                    </tr>
                  ) : (
                    (rekomendasiGabungan.soal_paling_banyak_salah || []).map((item) => (
                      <tr key={`${item.nomor_soal}-${item.tipe_soal}`}>
                        <td>{item.nomor_soal}</td>
                        <td>{tipeLabel(item.tipe_soal)}</td>
                        <td>{item.jumlah_salah}</td>
                        <td>{formatNumber(item.persentase_benar)}%</td>
                        <td>{item.kategori}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </MonitoringPanel>
        </div>
      )}

      {showModal && selectedSiswa && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div
            className="modal monitoring-detail-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="monitoring-modal-header">
              <div>
                <div className="monitoring-detail-eyebrow">Detail Jawaban</div>
                <h3>{selectedSiswa.siswa_nama}</h3>
              </div>
              <button className="monitoring-modal-close" onClick={() => setShowModal(false)} aria-label="Tutup detail jawaban">
                <X size={18} />
              </button>
            </div>

            <div className="monitoring-modal-body">
              <div className="monitoring-answer-summary">
                <MiniMetric label="Nama siswa" value={selectedSiswa.siswa_nama} />
                <MiniMetric label="Nilai" value={formatNumber(getNilai(selectedSiswa))} />
                <MiniMetric label="Total benar" value={getTotalBenar(selectedSiswa)} />
                <MiniMetric label="Total butir" value={getTotalSoal(selectedSiswa)} />
                <MiniMetric label="Durasi" value={formatDuration(selectedSiswa)} />
                <MiniMetric label="Status" value={getNilai(selectedSiswa) >= PASSING_SCORE ? "Tuntas" : "Belum tuntas"} />
              </div>

              {(selectedSiswa.detail_jawaban || []).length === 0 ? (
                <div className="empty">Belum ada detail jawaban</div>
              ) : (
                (selectedSiswa.detail_jawaban || []).map((jawab, idx) => {
                  const percent = Number(jawab.skor_persen ?? jawab.is_benar * 100 ?? 0);
                  const imageSrc = getImageSrc(jawab.gambar_soal);

                  return (
                    <div
                      key={jawab.soal_id || idx}
                      className={`monitoring-answer-card ${percent >= 100 ? "is-correct" : percent > 0 ? "is-partial" : "is-wrong"}`}
                    >
                      <div className="monitoring-answer-card-head">
                        <div>
                          <strong>Soal {jawab.nomor || idx + 1}</strong>
                          <span>
                            {tipeLabel(jawab.tipe_soal)}
                          </span>
                        </div>
                        <div className="monitoring-answer-badges">
                          <span className={`badge ${statusBadgeClass(percent)}`}>
                            {statusText(Number(jawab.is_benar || 0))}
                          </span>
                          <span className="badge badge-gray">
                            Skor: {jawab.skor_diperoleh}/{jawab.skor_maksimal}
                          </span>
                        </div>
                      </div>

                      <div className="monitoring-answer-question-block">
                        <div className="monitoring-answer-label">Pertanyaan</div>
                        <div className="monitoring-answer-question">
                          <RichContent value={jawab.pertanyaan} />
                          {imageSrc && (
                            <div className="monitoring-answer-image-wrap">
                              <img
                                src={imageSrc}
                                alt="Gambar soal"
                              />
                            </div>
                          )}
                          {renderSupportTables(jawab.tabel_data)}
                        </div>
                      </div>

                      <AnswerAnalysis jawab={jawab} />

                      {jawab.catatan_koreksi && (
                        <div className="monitoring-answer-note">
                          {jawab.catatan_koreksi}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="monitoring-modal-footer">
              <button className="btn" onClick={() => setShowModal(false)}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
