import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  CheckCircle2,
  FileText,
  Filter,
  Layers,
  Search,
  UserRound,
  Users
} from "lucide-react";
import ActionIcon from "../components/ActionIcon";
import api from "../api";

const normalizeJenis = (value) => {
  const label = String(value || "").trim();
  if (!label) return "-";
  const upper = label.toUpperCase();
  if (upper.includes("HOTS")) return "HOTS";
  if (upper.includes("LITERASI")) return "Literasi";
  if (upper.includes("NUMERASI")) return "Numerasi";
  return label;
};

const badgeClassByJenis = (jenis) => {
  switch (normalizeJenis(jenis)) {
    case "Literasi":
      return "monitoring-list-badge--literasi";
    case "Numerasi":
      return "monitoring-list-badge--numerasi";
    case "HOTS":
      return "monitoring-list-badge--hots";
    default:
      return "monitoring-list-badge--jenis";
  }
};

const MonitoringSummaryCard = ({ label, value, note, icon: Icon, tone }) => (
  <div className={`monitoring-list-summary-card tone-${tone}`}>
    <div className="monitoring-list-summary-icon">
      <Icon size={20} />
    </div>
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <span>{note}</span>
    </div>
  </div>
);

const MonitoringListPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [instrumenList, setInstrumenList] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterJenis, setFilterJenis] = useState("Semua");

  useEffect(() => {
    fetchInstrumen();
  }, []);

  const fetchInstrumen = async () => {
    try {
      const res = await api.get("/instrumen?status=aktif");
      setInstrumenList(res.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const jenisOptions = useMemo(() => {
    const jenisSet = new Set();
    instrumenList.forEach((item) => {
      const jenis = normalizeJenis(item.jenis);
      if (jenis && jenis !== "-") jenisSet.add(jenis);
    });
    return ["Semua", ...Array.from(jenisSet).sort()];
  }, [instrumenList]);

  const filteredInstrumen = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return instrumenList.filter((item) => {
      const judul = String(item.judul || "").toLowerCase();
      const mapel = String(item.mata_pelajaran || "").toLowerCase();
      const kelas = String(item.kelas || "").toLowerCase();
      const jenis = normalizeJenis(item.jenis).toLowerCase();

      const matchesSearch =
        !query ||
        judul.includes(query) ||
        mapel.includes(query) ||
        kelas.includes(query);

      const matchesJenis =
        filterJenis === "Semua" ||
        normalizeJenis(item.jenis) === filterJenis;

      return matchesSearch && matchesJenis;
    });
  }, [instrumenList, searchQuery, filterJenis]);

  const summary = useMemo(() => {
    const totalInstrumen = instrumenList.length;
    const totalTargetSoal = instrumenList.reduce(
      (sum, item) => sum + Number(item.jumlah_soal || 0),
      0
    );
    const totalKelas = new Set(
      instrumenList
        .map((item) => (item.kelas || "").toString().trim())
        .filter(Boolean)
    ).size;

    return {
      totalInstrumen,
      totalAktif: totalInstrumen,
      totalTargetSoal,
      totalKelas,
    };
  }, [instrumenList]);

  if (loading) {
    return (
      <div className="page-content monitoring-list-page">
        <div className="monitoring-list-loading-wrapper">
          <div className="spinner spinner-dark" />
          <div className="monitoring-list-loading-text">Memuat data instrumen aktif...</div>
        </div>
      </div>
    );
  }

  const hasInstrumen = instrumenList.length > 0;
  const noResults = hasInstrumen && filteredInstrumen.length === 0;

  return (
    <div className="page-content monitoring-list-page">
      <section className="monitoring-list-hero">
        <div>
          <div className="monitoring-list-eyebrow">Monitoring</div>
          <h1>Monitoring Hasil Siswa</h1>
          <p>Pantau hasil pengerjaan instrumen siswa berdasarkan kelas dan mata pelajaran.</p>
        </div>
      </section>

      <section className="monitoring-list-summary-grid">
        <MonitoringSummaryCard
          label="Total Instrumen"
          value={summary.totalInstrumen}
          note="Instrumen aktif yang tersedia untuk monitoring."
          icon={FileText}
          tone="blue"
        />
        <MonitoringSummaryCard
          label="Instrumen Aktif"
          value={summary.totalAktif}
          note="Semua instrumen siap dipantau."
          icon={CheckCircle2}
          tone="green"
        />
        <MonitoringSummaryCard
          label="Total Target Soal"
          value={summary.totalTargetSoal}
          note="Jumlah soal dari seluruh instrumen aktif."
          icon={BookOpen}
          tone="amber"
        />
        <MonitoringSummaryCard
          label="Total Kelas"
          value={summary.totalKelas}
          note="Kelas unik yang terhubung dengan instrumen."
          icon={Layers}
          tone="purple"
        />
      </section>

      <section className="monitoring-list-filter-bar">
        <div className="monitoring-list-filter-item">
          <label htmlFor="monitoring-search">
            <Search size={14} />
            Cari instrumen
          </label>
          <div className="monitoring-list-input-wrap">
            <Search size={16} />
            <input
              id="monitoring-search"
              type="search"
              value={searchQuery}
              placeholder="Cari judul, mata pelajaran, atau kelas"
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="monitoring-list-filter-item">
          <label htmlFor="monitoring-filter-jenis">
            <Filter size={14} />
            Filter jenis
          </label>
          <div className="monitoring-list-input-wrap">
            <Filter size={16} />
            <select
              id="monitoring-filter-jenis"
              value={filterJenis}
              onChange={(e) => setFilterJenis(e.target.value)}
            >
              {jenisOptions.map((jenis) => (
                <option key={jenis} value={jenis}>{jenis}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {noResults ? (
        <div className="monitoring-list-empty">
          <div className="monitoring-list-empty-icon">•</div>
          <div className="monitoring-list-empty-title">Tidak ada instrumen yang sesuai</div>
          <div className="monitoring-list-empty-text">
            Tidak ada instrumen yang sesuai dengan pencarian atau filter.
          </div>
        </div>
      ) : !hasInstrumen ? (
        <div className="monitoring-list-empty">
          <div className="monitoring-list-empty-icon">•</div>
          <div className="monitoring-list-empty-title">Belum ada instrumen yang dapat dimonitor</div>
          <div className="monitoring-list-empty-text">
            Silakan aktifkan instrumen terlebih dahulu agar bisa dimonitor.
          </div>
        </div>
      ) : (
        <div className="monitoring-list-grid">
          {filteredInstrumen.map((item) => {
            const jenis = normalizeJenis(item.jenis);
            return (
              <div
                key={item.id}
                className="monitoring-list-card"
                onClick={() => navigate(`/monitoring/${item.id}`)}
              >
                <div className="monitoring-list-card-header">
                  <div className="monitoring-list-badges">
                    <span className="monitoring-list-badge monitoring-list-badge--active">Aktif</span>
                    <span className={`monitoring-list-badge ${badgeClassByJenis(jenis)}`}>
                      {jenis}
                    </span>
                  </div>
                </div>

                <h3 className="monitoring-list-card-title">{item.judul || "-"}</h3>

                <div className="monitoring-list-card-meta">
                  <span><BookOpen size={14} /> {item.mata_pelajaran || "-"}</span>
                  <span><Users size={14} /> Kelas {item.kelas || "-"}</span>
                  <span><UserRound size={14} /> Guru Pembuat: {item.pembuat || "-"}</span>
                </div>

                <div className="monitoring-list-card-stats">
                  <div>
                    <span>Target soal</span>
                    <strong>{Number(item.jumlah_soal || 0)}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>Aktif</strong>
                  </div>
                </div>

                <div className="monitoring-list-card-footer">
                  <div className="monitoring-list-card-info">
                    Siap dipantau
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm monitoring-list-card-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/monitoring/${item.id}`);
                    }}
                  >
                    <ActionIcon name="detail" />
                    Lihat Hasil
                    <ActionIcon name="next" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MonitoringListPage;
