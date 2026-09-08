/**
 * Axborot tizimiga o'zgartirish kiritish bo'yicha so'rovlar (Buyurtmalar / TZ) sahifasi.
 *
 * Asos: «AXBOROT TIZIMIGA O'ZGARTIRISH KIRITISH BO'YICHA SO'ROV BLANKASI» (Буюртма.docx).
 * - Sohaviy boshqarmalar: yangi TZ yaratish, loyihani tanlash, TZ faylini yuklash.
 * - Loyiha haqida ma'lumotlar: loyiha nomi, holati, PM, muddatlar, foiz va havolalar.
 * - Muhimlilik turi va qanchada tugashi: PM o'zi vaqtni va muddatni belgilaydi.
 * - Rasmiy Word (.docx) blanki va biriktirilgan TZ fayllarini yuklab olish.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, listOf, pagesOf, totalOf } from "@/api/client";
import type { ChangeRequestItem, OrderStats, Project, UserBrief } from "@/api/types";
import { useFetch } from "@/api/useFetch";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import {
  IconDownload,
  IconOrder,
  IconPaperclip,
  IconPlus,
  IconProject,
} from "@/components/icons";
import { toEditOrder, toNewOrder, useGo } from "@/nav";
import {
  Card,
  Empty,
  ErrorMsg,
  Loading,
  Pager,
  Progress,
  fmtDate,
} from "@/components/ui";

const PER_PAGE = 10;

export const ORDER_TYPE_CONFIG: Record<
  string,
  { label: string; icon: string; bg: string; color: string; border: string; desc: string }
> = {
  NEW: {
    label: "Yangi loyiha",
    icon: "🚀",
    bg: "rgba(16, 185, 129, 0.12)",
    color: "#059669",
    border: "rgba(16, 185, 129, 0.3)",
    desc: "Noldan boshlanadigan yangi dasturiy ta'minot yoki axborot tizimi",
  },
  CONTINUATION: {
    label: "Davom ettiriladigan",
    icon: "🔄",
    bg: "rgba(37, 99, 235, 0.12)",
    color: "#2563eb",
    border: "rgba(37, 99, 235, 0.3)",
    desc: "Mavjud tizimni davom ettirish / navbatdagi bosqich",
  },
  NEEDS_CLASSIFICATION: {
    label: "Turlash kerak bo'lgan",
    icon: "🏷️",
    bg: "rgba(217, 119, 6, 0.12)",
    color: "#d97706",
    border: "rgba(217, 119, 6, 0.3)",
    desc: "Boshqarma taklifi / PM tomonidan tahlil va turlash talab etiladi",
  },
  MODERNIZATION: {
    label: "Modernizatsiya",
    icon: "⚡",
    bg: "rgba(139, 92, 246, 0.12)",
    color: "#7c3aed",
    border: "rgba(139, 92, 246, 0.3)",
    desc: "Amaldagi funksionallikni kengaytirish va yangilash",
  },
  MAINTENANCE: {
    label: "Texnik xizmat",
    icon: "🛠️",
    bg: "rgba(100, 116, 139, 0.12)",
    color: "#475569",
    border: "rgba(100, 116, 139, 0.3)",
    desc: "Xatoliklarni tuzatish va tizimni qo'llab-quvvatlash",
  },
};

export function OrderTypeBadge({ type }: { type?: string }) {
  const cfg = ORDER_TYPE_CONFIG[type || "NEW"] || ORDER_TYPE_CONFIG.NEW;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 6,
        fontSize: 11.5,
        fontWeight: 600,
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        whiteSpace: "nowrap",
      }}
      title={cfg.desc}
    >
      <span>{cfg.icon}</span>
      <span>{cfg.label}</span>
    </span>
  );
}

export const ORDER_STATUS_CONFIG: Record<
  ChangeRequestItem["status"],
  {
    label: string;
    icon: string;
    bg: string;
    color: string;
    border: string;
    badgeClass: string;
    desc: string;
    step: number;
  }
> = {
  NEW: {
    label: "Yangi (Yuborilgan)",
    icon: "📝",
    bg: "rgba(234, 179, 8, 0.12)",
    color: "#b45309",
    border: "rgba(234, 179, 8, 0.35)",
    badgeClass: "badge-warning",
    desc: "Talabnoma boshqarma tomonidan yuborilgan, PM ko'rib chiqishi kutilmoqda",
    step: 1,
  },
  ACCEPTED: {
    label: "Qabul qilindi",
    icon: "📋",
    bg: "rgba(59, 130, 246, 0.12)",
    color: "#1d4ed8",
    border: "rgba(59, 130, 246, 0.35)",
    badgeClass: "badge-brand",
    desc: "Loyiha menejeri (PM) talabnomani qabul qildi va o'rganmoqda",
    step: 2,
  },
  ASSIGNED_TO_DEV: {
    label: "Dasturchiga topshirildi",
    icon: "💻",
    bg: "rgba(99, 102, 241, 0.14)",
    color: "#4338ca",
    border: "rgba(99, 102, 241, 0.38)",
    badgeClass: "badge-brand",
    desc: "Vazifa dasturchiga topshirildi va amaliy ijroga biriktirildi",
    step: 3,
  },
  IN_PROGRESS: {
    label: "Jarayonda",
    icon: "⚙️",
    bg: "rgba(14, 165, 233, 0.12)",
    color: "#0369a1",
    border: "rgba(14, 165, 233, 0.35)",
    badgeClass: "badge-brand",
    desc: "Dasturchi va jamoa amaliy ish olib bormoqda / kod yozilmoqda",
    step: 4,
  },
  TESTING: {
    label: "Test qilinmoqda",
    icon: "🧪",
    bg: "rgba(217, 119, 6, 0.12)",
    color: "#c2410c",
    border: "rgba(217, 119, 6, 0.35)",
    badgeClass: "badge-warning",
    desc: "O'zgartirish testdan o'tkazilmoqda va buyurtmachi sinoviga tayyorlanmoqda",
    step: 5,
  },
  COMPLETED: {
    label: "Bajarildi",
    icon: "✅",
    bg: "rgba(16, 185, 129, 0.12)",
    color: "#047857",
    border: "rgba(16, 185, 129, 0.35)",
    badgeClass: "badge-ok",
    desc: "Ish muvaffaqiyatli yakunlandi va tizimga joriy etildi",
    step: 6,
  },
  REJECTED: {
    label: "Rad etildi",
    icon: "❌",
    bg: "rgba(239, 68, 68, 0.12)",
    color: "#b91c1c",
    border: "rgba(239, 68, 68, 0.35)",
    badgeClass: "badge-danger",
    desc: "Talabnoma asosli sabablarga ko'ra rad etildi",
    step: -1,
  },
};

export function OrderStatusBadge({
  status,
  label,
}: {
  status: ChangeRequestItem["status"];
  label?: string;
}) {
  const cfg = ORDER_STATUS_CONFIG[status] || ORDER_STATUS_CONFIG.NEW;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        whiteSpace: "nowrap",
      }}
      title={cfg.desc}
    >
      <span>{cfg.icon}</span>
      <span>{label || cfg.label}</span>
    </span>
  );
}

export function OrderProgressStepper({ item }: { item: ChangeRequestItem }) {
  if (item.status === "REJECTED") {
    return (
      <div
        style={{
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: 8,
          padding: "14px 16px",
          marginBottom: 16,
        }}
      >
        <div className="row middle" style={{ gap: 8, color: "#991b1b", fontWeight: 700, fontSize: 13.5 }}>
          <span style={{ fontSize: 18 }}>❌</span>
          <span>Ushbu talabnoma rad etilgan</span>
        </div>
        {item.pm_notes && (
          <div style={{ marginTop: 6, fontSize: 12.5, color: "#7f1d1d", whiteSpace: "pre-wrap" }}>
            <strong>Sabab / Izoh:</strong> {item.pm_notes}
          </div>
        )}
      </div>
    );
  }

  const currentStep = item.stage_index && item.stage_index > 0
    ? item.stage_index
    : (ORDER_STATUS_CONFIG[item.status]?.step || 1);

  const steps = [
    {
      num: 1,
      title: "Yuborildi",
      icon: "📝",
      sub: item.department || "Boshqarma",
    },
    {
      num: 2,
      title: "PM ko'rib chiqdi",
      icon: "📋",
      sub: item.assigned_pm_name ? `PM: ${item.assigned_pm_name}` : "Loyiha menejeri",
    },
    {
      num: 3,
      title: "Dasturchiga topshirildi",
      icon: "💻",
      sub: item.assigned_developer_name ? `👨‍💻 ${item.assigned_developer_name}` : "Ijrochi tayinlanmoqda",
    },
    {
      num: 4,
      title: "Jarayonda",
      icon: "⚙️",
      sub: item.pm_estimated_duration ? `⏱ ${item.pm_estimated_duration}` : "Amaliy ishlab chiqish",
    },
    {
      num: 5,
      title: "Testda",
      icon: "🧪",
      sub: "Sinov va tekshirish",
    },
    {
      num: 6,
      title: "Bajarildi",
      icon: "✅",
      sub: "Foydalanishga topshirildi",
    },
  ];

  return (
    <div
      style={{
        background: "var(--surface, #f8fafc)",
        border: "1px solid var(--border-color, #e2e8f0)",
        borderRadius: 8,
        padding: "14px 16px",
        marginBottom: 16,
      }}
    >
      <div className="row between middle" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>
          📌 Ishning joriy holati va bosqichlari:{" "}
          <span style={{ color: ORDER_STATUS_CONFIG[item.status]?.color }}>
            {item.status_display || ORDER_STATUS_CONFIG[item.status]?.label}
          </span>
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--brand, #2563eb)" }}>
          Bosqich {Math.min(currentStep, 6)} / 6
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 6,
        }}
      >
        {steps.map((st) => {
          const isPassed = currentStep > st.num;
          const isCurrent = currentStep === st.num;

          const stepBg = isCurrent
            ? "#eff6ff"
            : isPassed
            ? "#f0fdf4"
            : "#f8fafc";
          const stepBorder = isCurrent
            ? "#3b82f6"
            : isPassed
            ? "#86efac"
            : "var(--border-color, #e2e8f0)";
          const stepColor = isCurrent
            ? "#1d4ed8"
            : isPassed
            ? "#15803d"
            : "var(--muted, #64748b)";

          return (
            <div
              key={st.num}
              style={{
                background: stepBg,
                border: `1.5px solid ${stepBorder}`,
                borderRadius: 6,
                padding: "8px 6px",
                textAlign: "center",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ fontSize: 16, marginBottom: 2 }}>
                {isPassed ? "✓" : st.icon}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: isCurrent || isPassed ? 700 : 500,
                  color: stepColor,
                  lineHeight: 1.2,
                }}
              >
                {st.title}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--muted, #64748b)",
                  marginTop: 3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={st.sub}
              >
                {st.sub}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ChangeRequests() {
  const { user } = useAuth();
  const go = useGo();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");

  // Modal oynasi (faqat batafsil ko'rish va PM qarori uchun)
  const [viewingItem, setViewingItem] = useState<ChangeRequestItem | null>(null);

  // PM qarorini belgilash holatlari (view modal ichida)
  const [pmDecisionForm, setPmDecisionForm] = useState<{
    status: ChangeRequestItem["status"];
    pm_estimated_duration: string;
    pm_deadline: string;
    pm_notes: string;
    assigned_developer: number | null;
  }>({
    status: "ACCEPTED",
    pm_estimated_duration: "",
    pm_deadline: "",
    pm_notes: "",
    assigned_developer: null,
  });
  const [pmSaveLoading, setPmSaveLoading] = useState(false);
  const [pmSaveError, setPmSaveError] = useState<string | null>(null);
  const [pmSaveSuccess, setPmSaveSuccess] = useState<string | null>(null);

  // Ma'lumotlarni olish
  const { data, error, loading, reload } = useFetch<{ count: number; results: ChangeRequestItem[] } | ChangeRequestItem[]>(
    "/orders/",
    {
      page,
      search: search || undefined,
      status: statusFilter || undefined,
      priority: priorityFilter || undefined,
      project: projectFilter || undefined,
      order_type: typeFilter || undefined,
    }
  );

  const { data: statsData } = useFetch<OrderStats>("/orders/stats/");
  const { data: projectsData } = useFetch<{ count: number; results: Project[] } | Project[]>("/projects/", { scope: "visible" });
  const { data: usersData } = useFetch<{ count: number; results: UserBrief[] } | UserBrief[]>("/users/", { is_active: true });

  const items: ChangeRequestItem[] = useMemo(() => (data ? listOf<ChangeRequestItem>(data) : []), [data]);
  const projects: Project[] = useMemo(() => (projectsData ? listOf<Project>(projectsData) : []), [projectsData]);
  const usersList: UserBrief[] = useMemo(() => (usersData ? listOf<UserBrief>(usersData) : []), [usersData]);
  const developersList = useMemo(
    () => usersList.filter((u) => !u.is_sohaviy_boshqarma && u.specialty !== "SOHAVIY"),
    [usersList]
  );

  const total = totalOf(data);
  const pages = pagesOf(data, PER_PAGE);

  // Foydalanuvchi roli tekshiruvi
  const isPMOrAdmin = Boolean(
    user?.is_platform_admin ||
    user?.is_boss ||
    user?.is_manager ||
    user?.global_role === "MANAGER" ||
    user?.specialty === "PM"
  );

  const canAccess = Boolean(
    user?.can_access_orders ||
    user?.is_sohaviy_boshqarma ||
    user?.is_platform_admin ||
    user?.is_manager ||
    user?.is_boss
  );

  // Word (.docx) yuklab olish
  const handleDownloadDocx = (id: number, requestNo: string) => {
    const token = localStorage.getItem("tf_access");
    fetch(`/api/orders/${id}/export-docx/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error("Faylni yuklab bo'lmadi");
        return res.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Buyurtma_TZ_${requestNo}.docx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch((e) => alert("Word faylini yuklab olishda xatolik: " + e.message));
  };

  // Batafsil ko'rishni ochish
  const handleOpenView = (item: ChangeRequestItem) => {
    setViewingItem(item);
    setPmDecisionForm({
      status: item.status,
      pm_estimated_duration: item.pm_estimated_duration || "",
      pm_deadline: item.pm_deadline || "",
      pm_notes: item.pm_notes || "",
      assigned_developer: item.assigned_developer || null,
    });
    setPmSaveError(null);
    setPmSaveSuccess(null);
  };

  // PM qarorini saqlash
  const handleSavePMDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingItem) return;
    setPmSaveLoading(true);
    setPmSaveError(null);
    setPmSaveSuccess(null);

    try {
      const updated = await api.post<ChangeRequestItem>(
        `/orders/${viewingItem.id}/set-pm-decision/`,
        pmDecisionForm
      );
      setViewingItem(updated);
      setPmSaveSuccess("PM qarori va bajarilish muddatlari muvaffaqiyatli saqlandi!");
      reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "PM qarorini saqlashda xatolik yuz berdi.";
      setPmSaveError(msg);
    } finally {
      setPmSaveLoading(false);
    }
  };

  if (user && !canAccess) {
    return (
      <div className="card" style={{ maxWidth: 640, margin: "60px auto", padding: 36, textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🏛️</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Kirish huquqi cheklangan</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.6, marginBottom: 24, fontSize: 14 }}>
          Axborot tizimiga o'zgartirish kiritish buyurtmalari (TZ / Change Requests) bo'limi faqat{" "}
          <strong>Sohaviy boshqarmalar</strong>, <strong>Loyiha menejerlari (PM)</strong> hamda tizim rahbariyati uchun ochiq.
        </p>
        <Link to="/panel" className="btn btn-primary" style={{ padding: "8px 20px" }}>
          Bosh sahifaga qaytish
        </Link>
      </div>
    );
  }

  return (
    <>
      <PageHead
        title={
          <span className="row middle" style={{ gap: 8 }}>
            <IconOrder size={20} />
            <strong>Axborot tizimiga o'zgartirish kiritish so'rovlari (TZ / Buyurtmalar)</strong>
          </span>
        }
        actions={
          <div className="row middle" style={{ gap: 10 }}>
            {total > 0 && <span className="badge badge-brand">{total} ta buyurtma</span>}
            <button className="btn btn-primary btn-sm" onClick={() => go(toNewOrder())}>
              <IconPlus size={15} /> Yangi TZ / Buyurtma yaratish
            </button>
          </div>
        }
      />

      <div className="content">
        {/* Yuqori ko'rsatkichlar kartalari */}
        <div className="row" style={{ gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <div
            className="card"
            style={{
              flex: 1,
              minWidth: 140,
              padding: "14px 16px",
              cursor: "pointer",
              border: !statusFilter ? "2px solid var(--brand)" : undefined,
            }}
            onClick={() => { setStatusFilter(""); setPage(1); }}
            title="Barcha buyurtmalarni ko'rish"
          >
            <span className="muted" style={{ fontSize: 12 }}>Jami so'rovlar</span>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--brand)" }}>
              {statsData?.total ?? total}
            </div>
          </div>
          <div
            className="card"
            style={{
              flex: 1,
              minWidth: 140,
              padding: "14px 16px",
              cursor: "pointer",
              border: statusFilter === "NEW" ? "2px solid #d97706" : undefined,
            }}
            onClick={() => { setStatusFilter("NEW"); setPage(1); }}
            title="Yangi yuborilgan buyurtmalar"
          >
            <span className="muted" style={{ fontSize: 12 }}>📝 Yangi (Kutilmoqda)</span>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#d97706" }}>
              {statsData?.new ?? 0}
            </div>
          </div>
          <div
            className="card"
            style={{
              flex: 1,
              minWidth: 140,
              padding: "14px 16px",
              cursor: "pointer",
              border: statusFilter === "ASSIGNED_TO_DEV" ? "2px solid #4f46e5" : undefined,
            }}
            onClick={() => { setStatusFilter("ASSIGNED_TO_DEV"); setPage(1); }}
            title="Dasturchiga topshirilgan ishlar"
          >
            <span className="muted" style={{ fontSize: 12 }}>💻 Dasturchiga topshirildi</span>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#4f46e5" }}>
              {statsData?.assigned_to_dev ?? 0}
            </div>
          </div>
          <div
            className="card"
            style={{
              flex: 1,
              minWidth: 140,
              padding: "14px 16px",
              cursor: "pointer",
              border: statusFilter === "IN_PROGRESS" ? "2px solid #0284c7" : undefined,
            }}
            onClick={() => { setStatusFilter("IN_PROGRESS"); setPage(1); }}
            title="Jarayonda bo'lgan ishlar"
          >
            <span className="muted" style={{ fontSize: 12 }}>⚙️ Jarayonda</span>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#0284c7" }}>
              {(statsData?.in_progress_strict ?? 0) || (statsData?.in_progress ?? 0)}
            </div>
          </div>
          <div
            className="card"
            style={{
              flex: 1,
              minWidth: 140,
              padding: "14px 16px",
              cursor: "pointer",
              border: statusFilter === "TESTING" ? "2px solid #c2410c" : undefined,
            }}
            onClick={() => { setStatusFilter("TESTING"); setPage(1); }}
            title="Test qilinayotgan ishlar"
          >
            <span className="muted" style={{ fontSize: 12 }}>🧪 Testda</span>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#c2410c" }}>
              {statsData?.testing ?? 0}
            </div>
          </div>
          <div
            className="card"
            style={{
              flex: 1,
              minWidth: 140,
              padding: "14px 16px",
              cursor: "pointer",
              border: statusFilter === "COMPLETED" ? "2px solid #16a34a" : undefined,
            }}
            onClick={() => { setStatusFilter("COMPLETED"); setPage(1); }}
            title="Bajarilgan ishlar"
          >
            <span className="muted" style={{ fontSize: 12 }}>✅ Bajarilgan</span>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#16a34a" }}>
              {statsData?.completed ?? 0}
            </div>
          </div>
        </div>

        {/* Qidiruv va filtrlar */}
        <div className="card" style={{ padding: "12px 16px", marginBottom: 16 }}>
          <div className="row middle between" style={{ gap: 12, flexWrap: "wrap" }}>
            <div className="row middle" style={{ gap: 10, flex: 1, minWidth: 260 }}>
              <input
                type="text"
                placeholder="Raqam, tizim, loyiha, modul, bo'linma, dasturchi yoki tavsif bo'yicha qidiruv..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                style={{ flex: 1, minWidth: 200 }}
              />
            </div>
            <div className="row middle" style={{ gap: 10, flexWrap: "wrap" }}>
              {/* Loyiha turi filtri */}
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Barcha loyiha turlari</option>
                <option value="NEW">🚀 Yangi loyiha</option>
                <option value="CONTINUATION">🔄 Davom ettiriladigan</option>
                <option value="NEEDS_CLASSIFICATION">🏷️ Turlash kerak bo'lgan</option>
                <option value="MODERNIZATION">⚡ Modernizatsiya</option>
                <option value="MAINTENANCE">🛠️ Texnik xizmat</option>
              </select>

              {/* Loyiha filtri */}
              <select
                value={projectFilter}
                onChange={(e) => {
                  setProjectFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Barcha loyihalar</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.key})
                  </option>
                ))}
              </select>

              {/* Holat filtri */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Barcha holatlar</option>
                <option value="NEW">📝 Yangi (Yuborilgan)</option>
                <option value="ACCEPTED">📋 Qabul qilindi</option>
                <option value="ASSIGNED_TO_DEV">💻 Dasturchiga topshirildi</option>
                <option value="IN_PROGRESS">⚙️ Jarayonda</option>
                <option value="TESTING">🧪 Test qilinmoqda</option>
                <option value="COMPLETED">✅ Bajarildi</option>
                <option value="REJECTED">❌ Rad etildi</option>
              </select>

              {/* Ustuvorlik / Muhimlilik filtri */}
              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Barcha muhimlilik</option>
                <option value="URGENT">Shoshilinch / O'ta muhim</option>
                <option value="HIGH">Yuqori</option>
                <option value="MEDIUM">O'rta</option>
                <option value="LOW">Past</option>
              </select>

              {(search || statusFilter || priorityFilter || projectFilter || typeFilter) && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("");
                    setPriorityFilter("");
                    setProjectFilter("");
                    setTypeFilter("");
                    setPage(1);
                  }}
                >
                  Tozalash
                </button>
              )}
            </div>
          </div>
        </div>

        <ErrorMsg error={error} />

        {/* Asosiy jadval */}
        {loading ? (
          <Loading />
        ) : items.length ? (
          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 40, textAlign: "center" }}>#</th>
                    <th>Talabnoma №</th>
                    <th>Loyiha va Tizim</th>
                    <th style={{ width: 140 }}>Loyiha turi</th>
                    <th>Talab qilinayotgan o'zgartirish</th>
                    <th>Bo'linma / Mas'ul</th>
                    <th>Mas'ul dasturchi</th>
                    <th>Muhimlilik</th>
                    <th>Qanchada tugashi / PM muddati</th>
                    <th>Holati va Bosqich</th>
                    <th>TZ Fayli</th>
                    <th className="right">Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const rowNum = (page - 1) * PER_PAGE + idx + 1;
                    return (
                      <tr key={item.id}>
                        <td className="mono muted" style={{ textAlign: "center", fontSize: 12 }}>
                          {rowNum}
                        </td>
                        <td>
                          <button
                            className="btn btn-link"
                            style={{ fontWeight: 700, padding: 0 }}
                            onClick={() => handleOpenView(item)}
                          >
                            {item.request_no}
                          </button>
                        </td>
                        <td>
                          {item.project_detail ? (
                            <div>
                              <span
                                className="badge"
                                style={{
                                  backgroundColor: item.project_detail.color || "var(--brand)",
                                  color: "#fff",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                }}
                              >
                                {item.project_detail.key}
                              </span>{" "}
                              <strong style={{ fontSize: 13 }}>{item.project_detail.name}</strong>
                              <div className="muted" style={{ fontSize: 11 }}>
                                {item.system_name} {item.module ? `(${item.module})` : ""}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <strong style={{ fontSize: 13 }}>{item.system_name}</strong>
                              <div className="muted" style={{ fontSize: 11 }}>
                                {item.module || "Umumiy modul"}
                              </div>
                            </div>
                          )}
                        </td>
                        <td>
                          <OrderTypeBadge type={item.order_type} />
                        </td>
                        <td style={{ maxWidth: 260 }}>
                          <div
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={item.requested_change}
                          >
                            {item.requested_change}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: 12.5 }}>{item.department}</div>
                          <span className="muted" style={{ fontSize: 11 }}>
                            {item.responsible_person}
                          </span>
                        </td>
                        <td>
                          {item.assigned_developer_name ? (
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 12.5, color: "#4338ca" }}>
                                👨‍💻 {item.assigned_developer_name}
                              </div>
                              {item.assigned_developer_detail?.email && (
                                <div className="muted" style={{ fontSize: 11 }}>
                                  {item.assigned_developer_detail.email}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="muted" style={{ fontSize: 11.5, fontStyle: "italic" }}>
                              Tayinlanmagan
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              item.priority === "URGENT"
                                ? "badge-danger"
                                : item.priority === "HIGH"
                                ? "badge-warning"
                                : item.priority === "MEDIUM"
                                ? "badge-brand"
                                : ""
                            }`}
                          >
                            {item.priority_display || item.priority}
                          </span>
                        </td>
                        <td>
                          {item.pm_estimated_duration || item.pm_deadline ? (
                            <div>
                              {item.pm_estimated_duration && (
                                <div style={{ fontWeight: 600, fontSize: 12, color: "var(--brand)" }}>
                                  ⏱ {item.pm_estimated_duration}
                                </div>
                              )}
                              {item.pm_deadline && (
                                <div className="muted" style={{ fontSize: 11 }}>
                                  📅 {fmtDate(item.pm_deadline)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="muted" style={{ fontSize: 11.5, fontStyle: "italic" }}>
                              Kutilmoqda (PM belgilaydi)
                            </span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 140 }}>
                            <OrderStatusBadge status={item.status} label={item.status_display} />
                            {item.status !== "REJECTED" && (
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div
                                  style={{
                                    flex: 1,
                                    height: 5,
                                    borderRadius: 3,
                                    backgroundColor: "#e2e8f0",
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      height: "100%",
                                      width: `${Math.min(100, Math.round(((item.stage_index || 1) / 6) * 100))}%`,
                                      backgroundColor:
                                        item.status === "COMPLETED"
                                          ? "#10b981"
                                          : item.status === "TESTING"
                                          ? "#f59e0b"
                                          : item.status === "ASSIGNED_TO_DEV"
                                          ? "#6366f1"
                                          : "#3b82f6",
                                      transition: "width 0.3s ease",
                                    }}
                                  />
                                </div>
                                <span style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600 }}>
                                  {item.stage_index || 1}/6
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          {item.tz_file_url ? (
                            <a
                              href={item.tz_file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-xs btn-outline row middle"
                              style={{ gap: 4, padding: "3px 8px", fontSize: 11.5 }}
                              title={`Yuklab olish: ${item.tz_file_name || "TZ fayli"} (${item.tz_file_size_display || ""})`}
                            >
                              <IconPaperclip size={13} />
                              <span>Fayl</span>
                            </a>
                          ) : (
                            <span className="muted" style={{ fontSize: 12 }}>—</span>
                          )}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="btn btn-sm"
                              title="Batafsil ko'rish va PM qarori"
                              onClick={() => handleOpenView(item)}
                            >
                              Ko'rish
                            </button>
                            <button
                              className="btn btn-sm btn-ghost"
                              title="Rasmiy Word (.docx) blankini yuklab olish"
                              onClick={() => handleDownloadDocx(item.id, item.request_no)}
                            >
                              <IconDownload size={14} /> Word
                            </button>
                            <button
                              className="btn btn-sm btn-ghost"
                              title="Tahrirlash"
                              onClick={() => go(toEditOrder(item.id))}
                            >
                              Tahrir
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div
                className="card-body row between middle"
                style={{
                  borderTop: "1px solid var(--border-color)",
                  padding: "12px 16px",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  {total} tadan {(page - 1) * PER_PAGE + 1}—{Math.min(page * PER_PAGE, total)} tasi
                </p>
                <Pager page={page} pages={pages} onPick={setPage} />
              </div>
            )}
          </div>
        ) : (
          <Card>
            <Empty
              icon="📄"
              title="Hozircha buyurtmalar (TZ) yo'q"
              text="Axborot tizimiga yangi o'zgartirish yoki funksiya kiritish bo'yicha talabnoma va TZ fayli yarating."
            />
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button className="btn btn-primary" onClick={() => go(toNewOrder())}>
                <IconPlus size={15} /> Birinchi TZ / Buyurtmani yaratish
              </button>
            </div>
          </Card>
        )}
      </div>

      {/* 1. BATAFSIL KO'RISH MODAL (Буюртма.docx blankasi, Loyiha ma'lumoti va PM Paneli) */}
      {viewingItem && (
        <div className="modal-overlay" onClick={() => setViewingItem(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 880, width: "95%", maxHeight: "92vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle">
              <div className="row middle" style={{ gap: 8, flexWrap: "wrap" }}>
                <span className="badge badge-brand">{viewingItem.request_no}</span>
                <strong>{viewingItem.system_name} — {viewingItem.module || "Tizim"}</strong>
                {viewingItem.project_detail && (
                  <span
                    className="badge"
                    style={{
                      backgroundColor: viewingItem.project_detail.color || "var(--brand)",
                      color: "#fff",
                      fontSize: 11,
                    }}
                  >
                    📁 {viewingItem.project_detail.name}
                  </span>
                )}
              </div>
              <div className="row middle" style={{ gap: 8 }}>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => handleDownloadDocx(viewingItem.id, viewingItem.request_no)}
                >
                  <IconDownload size={14} /> Word (.docx)
                </button>
                {viewingItem.tz_file_url && (
                  <a
                    href={viewingItem.tz_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm btn-outline row middle"
                    style={{ gap: 4 }}
                  >
                    <IconPaperclip size={14} /> TZ Fayli
                  </a>
                )}
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    const oid = viewingItem.id;
                    setViewingItem(null);
                    go(toEditOrder(oid));
                  }}
                >
                  Tahrirlash
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setViewingItem(null)}>
                  ✕
                </button>
              </div>
            </div>

            <div className="modal-body" style={{ padding: 20 }}>
              {/* Ish jarayoni va bosqichlar zanjiri (Visual Stepper) */}
              <OrderProgressStepper item={viewingItem} />

              {/* Rasmiy Blank Sarlavhasi */}
              <div
                style={{
                  background: "var(--brand-dark, #1e3a8a)",
                  color: "#fff",
                  padding: "12px 16px",
                  borderRadius: 6,
                  textAlign: "center",
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  AXBOROT TIZIMIGA O'ZGARTIRISH KIRITISH BO'YICHA SO'ROV BLANKASI
                </div>
                <div style={{ fontSize: 12, opacity: 0.85, fontStyle: "italic" }}>
                  Har bir yangi funksiya yoki o'zgartirish (TZ) uchun alohida to'ldiriladi
                </div>
              </div>

              {/* A. TEGISHLI LOYIHA (PROJECT) MA'LUMOTLARI */}
              {viewingItem.project_detail ? (
                <div
                  style={{
                    background: "var(--surface, #f8fafc)",
                    border: "1px solid var(--border-color)",
                    borderRadius: 6,
                    padding: 14,
                    marginBottom: 16,
                  }}
                >
                  <div className="row between middle" style={{ marginBottom: 10 }}>
                    <div className="row middle" style={{ gap: 8 }}>
                      <IconProject size={18} />
                      <strong style={{ fontSize: 14, color: "var(--brand)" }}>
                        Tegishli Loyiha (Project) Ma'lumotlari
                      </strong>
                    </div>
                    <Link
                      to={`/loyiha/${viewingItem.project_detail.id}`}
                      className="btn btn-xs btn-outline"
                    >
                      Loyihaga o'tish →
                    </Link>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: 12,
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <span className="muted" style={{ fontSize: 11.5 }}>Loyiha nomi va Kaliti:</span>
                      <div>
                        <strong>{viewingItem.project_detail.name}</strong>{" "}
                        <span className="badge badge-brand">{viewingItem.project_detail.key}</span>
                      </div>
                    </div>
                    <div>
                      <span className="muted" style={{ fontSize: 11.5 }}>Loyiha Menejeri (PM):</span>
                      <div>
                        <strong>{viewingItem.project_detail.manager_name || "Menejer biriktirilmagan"}</strong>
                        {viewingItem.project_detail.manager_email && (
                          <div className="muted" style={{ fontSize: 11 }}>
                            {viewingItem.project_detail.manager_email}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="muted" style={{ fontSize: 11.5 }}>Loyiha holati va Muddat:</span>
                      <div>
                        <span className="badge badge-ok">{viewingItem.project_detail.status_display}</span>
                        {viewingItem.project_detail.due_date && (
                          <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                            (Muddat: {fmtDate(viewingItem.project_detail.due_date)})
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="muted" style={{ fontSize: 11.5 }}>Bajarilish holati:</span>
                      <div className="row middle" style={{ gap: 8, marginTop: 4 }}>
                        <div style={{ flex: 1 }}>
                          <Progress value={viewingItem.project_detail.progress || 0} />
                        </div>
                        <span style={{ fontWeight: 700, fontSize: 12 }}>
                          {viewingItem.project_detail.progress}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {viewingItem.project_detail.description && (
                    <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--muted)" }}>
                      <strong>Loyiha tavsifi:</strong> {viewingItem.project_detail.description}
                    </div>
                  )}
                </div>
              ) : null}

              {/* B. BIRIKTIRILGAN TZ FAYLI */}
              {viewingItem.tz_file_url && (
                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: 6,
                    padding: 12,
                    marginBottom: 16,
                  }}
                  className="row between middle"
                >
                  <div className="row middle" style={{ gap: 10 }}>
                    <span style={{ fontSize: 24 }}>📄</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#166534" }}>
                        Biriktirilgan TZ (Texnik topshiriq) hujjati
                      </div>
                      <div style={{ fontSize: 12, color: "#15803d" }}>
                        {viewingItem.tz_file_name || "Texnik topshiriq fayli"} •{" "}
                        {viewingItem.tz_file_size_display || ""}
                      </div>
                    </div>
                  </div>
                  <a
                    href={viewingItem.tz_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm btn-primary"
                    style={{ backgroundColor: "#16a34a", borderColor: "#16a34a" }}
                  >
                    <IconDownload size={14} /> Faylni yuklab olish
                  </a>
                </div>
              )}

              {/* Metama'lumotlar to'ri */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                  background: "var(--surface, #f8fafc)",
                  padding: 14,
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  marginBottom: 16,
                  fontSize: 13,
                }}
              >
                <div>
                  <span className="muted">Tizim nomi:</span>
                  <div><strong>{viewingItem.system_name}</strong></div>
                </div>
                <div>
                  <span className="muted">Modul:</span>
                  <div><strong>{viewingItem.module || "-"}</strong></div>
                </div>
                <div>
                  <span className="muted">Loyiha turi:</span>
                  <div style={{ marginTop: 2 }}>
                    <OrderTypeBadge type={viewingItem.order_type} />
                  </div>
                </div>
                <div>
                  <span className="muted">Talabnoma raqami:</span>
                  <div><strong>{viewingItem.request_no}</strong></div>
                </div>
                <div>
                  <span className="muted">Sana:</span>
                  <div><strong>{fmtDate(viewingItem.request_date)}</strong></div>
                </div>
                <div>
                  <span className="muted">Buyurtmachi bo'linma:</span>
                  <div><strong>{viewingItem.department}</strong></div>
                </div>
                <div>
                  <span className="muted">Mas'ul shaxs:</span>
                  <div><strong>{viewingItem.responsible_person}</strong></div>
                </div>
                <div>
                  <span className="muted">Muhimlilik turi:</span>
                  <div>
                    <span
                      className={`badge ${
                        viewingItem.priority === "URGENT"
                          ? "badge-danger"
                          : viewingItem.priority === "HIGH"
                          ? "badge-warning"
                          : viewingItem.priority === "MEDIUM"
                          ? "badge-brand"
                          : ""
                      }`}
                    >
                      {viewingItem.priority_display || viewingItem.priority}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="muted">Kerakli muddat (so'ralgan):</span>
                  <div><strong>{viewingItem.due_date ? fmtDate(viewingItem.due_date) : "-"}</strong></div>
                </div>
              </div>

              {/* C. 1-Bo'lim: Tizimga qo'shimcha va o'zgartirish kiritish */}
              <div className="section-box" style={{ marginBottom: 16 }}>
                <div
                  style={{
                    background: "var(--brand, #2563eb)",
                    color: "#fff",
                    padding: "6px 12px",
                    fontWeight: 700,
                    fontSize: 13,
                    borderRadius: "4px 4px 0 0",
                  }}
                >
                  1. TIZIMGA QO'SHIMCHA VA O'ZGARTIRISH KIRITISH
                </div>
                <div
                  style={{
                    border: "1px solid var(--border-color)",
                    borderTop: "none",
                    padding: 14,
                    borderRadius: "0 0 4px 4px",
                  }}
                >
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
                      1.1 Joriy holat (nima ishlamayapti / nimani o'zgartirish kerak):
                    </div>
                    <div className="tl-detail" style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
                      {viewingItem.current_state || "-"}
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
                      1.2 Talab qilinayotgan o'zgartirish (aniq va batafsil tavsif):
                    </div>
                    <div className="tl-detail" style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
                      {viewingItem.requested_change || "-"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
                      1.3 Sabab / maqsad (qonun talabi, biznes ehtiyoji, xato va h.k.):
                    </div>
                    <div className="tl-detail" style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
                      {viewingItem.reason || "-"}
                    </div>
                  </div>
                </div>
              </div>

              {/* D. 2-Bo'lim: Ta'sir doirasi */}
              <div className="section-box" style={{ marginBottom: 16 }}>
                <div
                  style={{
                    background: "var(--brand, #2563eb)",
                    color: "#fff",
                    padding: "6px 12px",
                    fontWeight: 700,
                    fontSize: 13,
                    borderRadius: "4px 4px 0 0",
                  }}
                >
                  2. TA'SIR DOIRASI
                </div>
                <div
                  style={{
                    border: "1px solid var(--border-color)",
                    borderTop: "none",
                    padding: 14,
                    borderRadius: "0 0 4px 4px",
                  }}
                >
                  <div style={{ marginBottom: 10 }}>
                    <strong>2.1 Qaysi modul / funksionallikka ta'sir qiladi:</strong>{" "}
                    <span>{viewingItem.affected_modules || "-"}</span>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <strong>2.2 Bog'liq tizimlar / integratsiyalar:</strong>{" "}
                    <span>{viewingItem.dependent_systems || "-"}</span>
                  </div>
                  <div>
                    <strong>2.3 O'zgarish xarakteri:</strong>{" "}
                    <span className="badge badge-brand">
                      {viewingItem.change_nature_display || viewingItem.change_nature}
                    </span>
                  </div>
                </div>
              </div>

              {/* E. 3-Bo'lim: Qo'shimcha materiallar */}
              <div className="section-box" style={{ marginBottom: 16 }}>
                <div
                  style={{
                    background: "var(--brand, #2563eb)",
                    color: "#fff",
                    padding: "6px 12px",
                    fontWeight: 700,
                    fontSize: 13,
                    borderRadius: "4px 4px 0 0",
                  }}
                >
                  3. QO'SHIMCHA MATERIALLAR (ILOVALAR)
                </div>
                <div
                  style={{
                    border: "1px solid var(--border-color)",
                    borderTop: "none",
                    padding: 14,
                    borderRadius: "0 0 4px 4px",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {viewingItem.additional_materials || "Mavjud emas"}
                </div>
              </div>

              {/* F. 4-Bo'lim: Test qilish */}
              <div className="section-box" style={{ marginBottom: 16 }}>
                <div
                  style={{
                    background: "var(--brand, #2563eb)",
                    color: "#fff",
                    padding: "6px 12px",
                    fontWeight: 700,
                    fontSize: 13,
                    borderRadius: "4px 4px 0 0",
                  }}
                >
                  4. O'ZGARISHNI TEST QILISH (BUYURTMACHI TOMONIDAN TEST QILINADI)
                </div>
                <div
                  style={{
                    border: "1px solid var(--border-color)",
                    borderTop: "none",
                    padding: 14,
                    borderRadius: "0 0 4px 4px",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {viewingItem.test_result || "Hali test qilinmagan"}
                </div>
              </div>

              {/* G. 5-Bo'lim: Tasdiqlash va PM Qarori */}
              <div className="section-box" style={{ marginBottom: 16 }}>
                <div
                  style={{
                    background: "var(--brand, #2563eb)",
                    color: "#fff",
                    padding: "6px 12px",
                    fontWeight: 700,
                    fontSize: 13,
                    borderRadius: "4px 4px 0 0",
                  }}
                >
                  5. TASDIQLASH VA IJRO (PM TOMONIDAN BELGILANADI)
                </div>
                <div
                  style={{
                    border: "1px solid var(--border-color)",
                    borderTop: "none",
                    padding: 14,
                    borderRadius: "0 0 4px 4px",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 16,
                  }}
                >
                  <div>
                    <span className="muted" style={{ fontSize: 12 }}>Buyurtmachi:</span>
                    <div><strong>{viewingItem.client_signer || viewingItem.responsible_person}</strong></div>
                  </div>
                  <div>
                    <span className="muted" style={{ fontSize: 12 }}>Ijrochi / Mas'ul PM:</span>
                    <div>
                      <strong>
                        {viewingItem.assigned_pm_name || viewingItem.executor_signer || "Biriktirilmagan"}
                      </strong>
                    </div>
                  </div>
                  <div>
                    <span className="muted" style={{ fontSize: 12 }}>Mas'ul Dasturchi (Ijrochi):</span>
                    <div>
                      <strong>
                        {viewingItem.assigned_developer_name ? `👨‍💻 ${viewingItem.assigned_developer_name}` : "Hali biriktirilmagan"}
                      </strong>
                    </div>
                  </div>
                  <div>
                    <span className="muted" style={{ fontSize: 12 }}>Qanchada tugashi (PM bahosi):</span>
                    <div>
                      <strong>
                        {viewingItem.pm_estimated_duration || viewingItem.estimated_resources || "Ko'rib chiqilmoqda"}
                      </strong>
                    </div>
                  </div>
                  <div>
                    <span className="muted" style={{ fontSize: 12 }}>PM belgilagan yakuniy muddat:</span>
                    <div>
                      <strong>
                        {viewingItem.pm_deadline ? fmtDate(viewingItem.pm_deadline) : "Hali belgilanmagan"}
                      </strong>
                    </div>
                  </div>
                  {viewingItem.pm_notes && (
                    <div style={{ gridColumn: "span 2" }}>
                      <span className="muted" style={{ fontSize: 12 }}>PM xulosasi va ko'rsatmalari:</span>
                      <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
                        {viewingItem.pm_notes}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* H. PM MAXSUS BOSHQARUV PANELI (PM O'ZI VAQT VA MUDDATNI BELGILAYDI) */}
              {isPMOrAdmin && (
                <div
                  style={{
                    background: "#eff6ff",
                    border: "2px solid #3b82f6",
                    borderRadius: 6,
                    padding: 16,
                    marginBottom: 10,
                  }}
                >
                  <div className="row middle" style={{ gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 20 }}>⚡</span>
                    <strong style={{ fontSize: 14, color: "#1d4ed8" }}>
                      Loyiha Menejeri (PM) qarori va muddat belgilash paneli
                    </strong>
                  </div>

                  {pmSaveSuccess && (
                    <div
                      style={{
                        background: "#dcfce7",
                        color: "#15803d",
                        padding: "8px 12px",
                        borderRadius: 4,
                        marginBottom: 12,
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      ✓ {pmSaveSuccess}
                    </div>
                  )}
                  {pmSaveError && <ErrorMsg error={pmSaveError} />}

                  <form onSubmit={handleSavePMDecision}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
                      <div className="field">
                        <label style={{ fontWeight: 600, fontSize: 12 }}>Buyurtma holati *</label>
                        <select
                          value={pmDecisionForm.status}
                          onChange={(e) =>
                            setPmDecisionForm({
                              ...pmDecisionForm,
                              status: e.target.value as ChangeRequestItem["status"],
                            })
                          }
                          required
                        >
                          <option value="NEW">📝 Yangi (Yuborilgan)</option>
                          <option value="ACCEPTED">📋 Qabul qilindi (Tasdiqlandi)</option>
                          <option value="ASSIGNED_TO_DEV">💻 Dasturchiga topshirildi</option>
                          <option value="IN_PROGRESS">⚙️ Jarayonda (Ishlanmoqda)</option>
                          <option value="TESTING">🧪 Test qilinmoqda</option>
                          <option value="COMPLETED">✅ Bajarildi (Yakunlandi)</option>
                          <option value="REJECTED">❌ Rad etildi</option>
                        </select>
                      </div>
                      <div className="field">
                        <label style={{ fontWeight: 600, fontSize: 12 }}>Mas'ul dasturchi (Ijrochi)</label>
                        <select
                          value={pmDecisionForm.assigned_developer || ""}
                          onChange={(e) =>
                            setPmDecisionForm({
                              ...pmDecisionForm,
                              assigned_developer: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        >
                          <option value="">-- Dasturchini tanlang --</option>
                          {developersList.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.full_name} ({d.email})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label style={{ fontWeight: 600, fontSize: 12 }}>
                          Qanchada tugashi (PM bahosi)
                        </label>
                        <input
                          type="text"
                          placeholder="masalan: 10 ish kuni, 3 hafta, 1 oy"
                          value={pmDecisionForm.pm_estimated_duration}
                          onChange={(e) =>
                            setPmDecisionForm({
                              ...pmDecisionForm,
                              pm_estimated_duration: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="field">
                        <label style={{ fontWeight: 600, fontSize: 12 }}>
                          PM belgilagan yakuniy muddat
                        </label>
                        <input
                          type="date"
                          value={pmDecisionForm.pm_deadline}
                          onChange={(e) =>
                            setPmDecisionForm({
                              ...pmDecisionForm,
                              pm_deadline: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="field" style={{ marginBottom: 12 }}>
                      <label style={{ fontWeight: 600, fontSize: 12 }}>
                        PM xulosasi va jamoa uchun topshiriq ko'rsatmalari
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Ushbu buyurtma bo'yicha menejer xulosasi yoki ijrochilar uchun ko'rsatma..."
                        value={pmDecisionForm.pm_notes}
                        onChange={(e) =>
                          setPmDecisionForm({
                            ...pmDecisionForm,
                            pm_notes: e.target.value,
                          })
                        }
                      />
                    </div>

                    <div className="row end">
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        disabled={pmSaveLoading}
                      >
                        {pmSaveLoading ? "Saqlanmoqda..." : "PM Qarori va Muddatni Tasdiqlash"}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>

            <div className="modal-footer row between middle" style={{ padding: "12px 20px" }}>
              <button
                className="btn btn-outline"
                onClick={() => handleDownloadDocx(viewingItem.id, viewingItem.request_no)}
              >
                <IconDownload size={15} /> Rasmiy Word (.docx) yuklab olish
              </button>
              <button className="btn btn-ghost" onClick={() => setViewingItem(null)}>
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
