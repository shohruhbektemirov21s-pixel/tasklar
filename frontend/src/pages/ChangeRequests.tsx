/**
 * Axborot tizimiga o'zgartirish kiritish bo'yicha so'rovlar (Buyurtmalar / TZ) sahifasi.
 *
 * Asos: «AXBOROT TIZIMIGA O'ZGARTIRISH KIRITISH BO'YICHA SO'ROV BLANKASI» (Буюртма.docx).
 * - Sohaviy boshqarmalar: yangi TZ yaratish, loyihani tanlash, TZ faylini yuklash.
 * - Loyiha haqida ma'lumotlar: loyiha nomi, holati, PM, muddatlar, foiz va havolalar.
 * - Muhimlilik turi va qanchada tugashi: PM o'zi vaqtni va muddatni belgilaydi.
 * - Rasmiy Word (.docx) blanki va biriktirilgan TZ fayllarini yuklab olish.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, listOf, pagesOf, totalOf } from "@/api/client";
import { uploadVersion, approveVersion, rejectVersion } from "@/api/orders";
import type { ChangeRequestItem, OrderStats, Project, UserBrief } from "@/api/types";
import { useFetch } from "@/api/useFetch";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import {
  IconCalendar,
  IconDownload,
  IconOrder,
  IconPaperclip,
  IconPlus,
  IconProject,
  IconSearch,
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

import { tx } from "@/i18n";

const PER_PAGE = 10;

export const ORDER_TYPE_CONFIG: Record<
  string,
  { label: string; icon: string; bg: string; color: string; border: string; desc: string }
> = {
  NEW: {
    get label() { return tx("orders.yangi_loyiha"); },
    icon: "🚀",
    bg: "rgba(16, 185, 129, 0.12)",
    color: "#059669",
    border: "rgba(16, 185, 129, 0.3)",
    desc: "Noldan boshlanadigan yangi dasturiy ta'minot yoki axborot tizimi",
  },
  CONTINUATION: {
    get label() { return tx("orders.davom_ettiriladigan"); },
    icon: "🔄",
    bg: "rgba(37, 99, 235, 0.12)",
    color: "#2563eb",
    border: "rgba(37, 99, 235, 0.3)",
    desc: "Mavjud tizimni davom ettirish / navbatdagi bosqich",
  },
  NEEDS_CLASSIFICATION: {
    get label() { return tx("orders.turlash_kerak"); },
    icon: "🏷️",
    bg: "rgba(217, 119, 6, 0.12)",
    color: "#d97706",
    border: "rgba(217, 119, 6, 0.3)",
    desc: "Boshqarma taklifi / PM tomonidan tahlil va turlash talab etiladi",
  },
  MODERNIZATION: {
    get label() { return tx("orders.modernizatsiya"); },
    icon: "⚡",
    bg: "rgba(139, 92, 246, 0.12)",
    color: "#7c3aed",
    border: "rgba(139, 92, 246, 0.3)",
    desc: "Amaldagi funksionallikni kengaytirish va yangilash",
  },
  MAINTENANCE: {
    get label() { return tx("orders.texnik_xizmat"); },
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
  READY_FOR_REVIEW: {
    label: "Boshqarma tasdig'ida",
    icon: "📑",
    bg: "rgba(168, 85, 247, 0.12)",
    color: "#7e22ce",
    border: "rgba(168, 85, 247, 0.35)",
    badgeClass: "badge-brand",
    desc: "PM ishni yakunladi va hisobot hujjatini topshirdi. Boshqarma tasdiqlashi kutilmoqda",
    step: 6,
  },
  COMPLETED: {
    label: "Bajarildi (Tasdiqlangan)",
    icon: "✅",
    bg: "rgba(16, 185, 129, 0.12)",
    color: "#047857",
    border: "rgba(16, 185, 129, 0.35)",
    badgeClass: "badge-ok",
    desc: "Ish muvaffaqiyatli yakunlandi va boshqarma tomonidan tasdiqlandi",
    step: 7,
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
  CANCELLED: {
    label: "Bekor qilingan (Atmen)",
    icon: "🚫",
    bg: "rgba(100, 116, 139, 0.12)",
    color: "#475569",
    border: "rgba(100, 116, 139, 0.35)",
    badgeClass: "badge-ghost",
    desc: "Yangi versiya tasdiqlangani sababli ushbu eski TZ bekor qilingan (atmen)",
    step: -2,
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
      title: "Tasdiqlashda",
      icon: "📑",
      sub: "Boshqarma tasdig'i",
    },
    {
      num: 7,
      title: "Bajarildi",
      icon: "✅",
      sub: "Qabul qilindi va yopildi",
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

function KpiCardSkeleton() {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 14,
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
      }}
    >
      <div
        className="skeleton-box"
        style={{ width: 46, height: 46, borderRadius: "50%", flexShrink: 0 }}
      />
      <div style={{ flex: 1 }}>
        <div className="skeleton-box" style={{ width: "65%", height: 14, marginBottom: 8 }} />
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div className="skeleton-box" style={{ width: 48, height: 26 }} />
          <div className="skeleton-box" style={{ width: 36, height: 14 }} />
        </div>
      </div>
    </div>
  );
}

function TableRowSkeleton({ rowNum }: { rowNum: number }) {
  return (
    <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
      <td style={{ textAlign: "center", padding: "16px 18px" }}>
        <span style={{ fontSize: 13, color: "#cbd5e1", fontWeight: 600 }}>{rowNum}</span>
      </td>
      <td style={{ padding: "16px 18px" }}>
        <div className="skeleton-box" style={{ width: 110, height: 26, borderRadius: 9999 }} />
      </td>
      <td style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="skeleton-box" style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton-box" style={{ width: "80%", height: 15, marginBottom: 6 }} />
            <div className="skeleton-box" style={{ width: "50%", height: 12 }} />
          </div>
        </div>
      </td>
      <td style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="skeleton-box" style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton-box" style={{ width: "75%", height: 14, marginBottom: 6 }} />
            <div className="skeleton-box" style={{ width: "55%", height: 12 }} />
          </div>
        </div>
      </td>
      <td style={{ padding: "16px 18px" }}>
        <div className="skeleton-box" style={{ width: "90%", height: 14 }} />
      </td>
      <td style={{ padding: "16px 18px" }}>
        <div className="skeleton-box" style={{ width: 85, height: 14, marginBottom: 5 }} />
        <div className="skeleton-box" style={{ width: 65, height: 12 }} />
      </td>
      <td style={{ padding: "16px 18px" }}>
        <div className="skeleton-box" style={{ width: 95, height: 24, borderRadius: 9999 }} />
      </td>
      <td style={{ textAlign: "right", padding: "16px 18px" }}>
        <div className="skeleton-box" style={{ width: 28, height: 20, marginLeft: "auto", borderRadius: 4 }} />
      </td>
    </tr>
  );
}

export default function ChangeRequests() {
  const { user } = useAuth();
  const go = useGo();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [deadlineFilter, setDeadlineFilter] = useState<string>("");
  const [activeActionMenuId, setActiveActionMenuId] = useState<number | null>(null);

  // Search debounce (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const handleClickOutside = () => setActiveActionMenuId(null);
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  const getRemainingDaysText = (deadline?: string | null, status?: string): { text: string; isOverdue: boolean } | null => {
    if (!deadline || status === "COMPLETED" || status === "REJECTED") return null;
    const target = new Date(deadline);
    const now = new Date();
    const targetDate = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((targetDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays > 0) return { text: `(${diffDays} kun qoldi)`, isOverdue: false };
    if (diffDays === 0) return { text: "(Bugun oxirgi kun)", isOverdue: false };
    return { text: "(Muddati o'tgan)", isOverdue: true };
  };

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

  // Ma'lumotlarni olish (barcha filterlar server-side ishlaydi)
  const { data, error, loading, reload } = useFetch<{ count: number; results: ChangeRequestItem[] } | ChangeRequestItem[]>(
    "/orders/",
    {
      page,
      search: debouncedSearch || undefined,
      status: statusFilter || undefined,
      priority: priorityFilter || undefined,
      project: projectFilter || undefined,
      order_type: typeFilter || undefined,
      deadline: deadlineFilter || undefined,
    }
  );

  const { data: statsData, loading: statsLoading } = useFetch<OrderStats>("/orders/stats/");
  const { data: projectsData } = useFetch<{ count: number; results: Project[] } | Project[]>("/projects/", { scope: "visible" });
  const { data: usersData } = useFetch<{ count: number; results: UserBrief[] } | UserBrief[]>("/users/", { is_active: true });

  const items: ChangeRequestItem[] = useMemo(() => (data ? listOf<ChangeRequestItem>(data) : []), [data]);
  const displayItems = items;
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

  const isSohaviyOrAdmin = Boolean(
    user?.is_sohaviy_boshqarma ||
    user?.is_platform_admin ||
    user?.is_boss
  );

  // Tugatilgan ish hujjati topshirish (PM uchun)
  const [completionModalItem, setCompletionModalItem] = useState<ChangeRequestItem | null>(null);
  const [completionFile, setCompletionFile] = useState<File | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [completionSubmitting, setCompletionSubmitting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);

  // Boshqarma kamchilik/xatolik bilan qaytarish modali
  const [rejectModalItem, setRejectModalItem] = useState<ChangeRequestItem | null>(null);
  const [rejectFeedbackNote, setRejectFeedbackNote] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Boshqarma tasdiqlash holati
  const [approvingId, setApprovingId] = useState<number | null>(null);

  // Yangi versiya yuborish (Boshqarma uchun)
  const [uploadVersionModalItem, setUploadVersionModalItem] = useState<ChangeRequestItem | null>(null);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionChangeNote, setVersionChangeNote] = useState("");
  const [versionRequestedChange, setVersionRequestedChange] = useState("");
  const [versionSubmitting, setVersionSubmitting] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);

  const handleOpenUploadVersion = (item: ChangeRequestItem) => {
    setUploadVersionModalItem(item);
    setVersionFile(null);
    setVersionChangeNote("");
    setVersionRequestedChange(item.requested_change || "");
    setVersionError(null);
  };

  const handleUploadVersionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadVersionModalItem) return;
    if (!versionFile) {
      setVersionError("Yangi TZ faylini tanlang.");
      return;
    }
    if (!versionChangeNote.trim()) {
      setVersionError("Ushbu versiyadagi o'zgarishlar tavsifini (sababini) yozing.");
      return;
    }

    setVersionSubmitting(true);
    setVersionError(null);
    try {
      const fd = new FormData();
      fd.append("tz_file", versionFile);
      fd.append("change_note", versionChangeNote.trim());
      if (versionRequestedChange.trim()) {
        fd.append("requested_change", versionRequestedChange.trim());
      }
      const updated = await uploadVersion(uploadVersionModalItem.id, fd);
      reload();
      if (viewingItem && viewingItem.id === updated.id) {
        setViewingItem(updated);
      }
      setUploadVersionModalItem(null);
      alert(tx("orders.version_uploaded_success"));
    } catch (err: any) {
      setVersionError(err?.message || "Yangi versiyani yuklashda xatolik yuz berdi");
    } finally {
      setVersionSubmitting(false);
    }
  };

  // PM yangi versiyani tasdiqlashi (Approve version)
  const [approveVersionModalItem, setApproveVersionModalItem] = useState<ChangeRequestItem | null>(null);
  const [approveVersionTarget, setApproveVersionTarget] = useState<number | null>(null);
  const [approveDecisionNote, setApproveDecisionNote] = useState("");
  const [approveEstimatedDuration, setApproveEstimatedDuration] = useState("");
  const [approveDeadline, setApproveDeadline] = useState("");
  const [approveDeveloper, setApproveDeveloper] = useState<number | null>(null);
  const [approveSubmitting, setApproveSubmitting] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const handleOpenApproveVersion = (item: ChangeRequestItem, verNum?: number) => {
    setApproveVersionModalItem(item);
    setApproveVersionTarget(verNum || item.pending_version?.version || null);
    setApproveDecisionNote("");
    setApproveEstimatedDuration(item.pm_estimated_duration || "");
    setApproveDeadline(item.pm_deadline || "");
    setApproveDeveloper(item.assigned_developer || null);
    setApproveError(null);
  };

  const handleApproveVersionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approveVersionModalItem) return;
    setApproveSubmitting(true);
    setApproveError(null);
    try {
      const updated = await approveVersion(approveVersionModalItem.id, {
        version: approveVersionTarget || undefined,
        decision_note: approveDecisionNote.trim(),
        pm_estimated_duration: approveEstimatedDuration.trim() || undefined,
        pm_deadline: approveDeadline || undefined,
        assigned_developer: approveDeveloper,
      });
      reload();
      if (viewingItem && viewingItem.id === updated.id) {
        setViewingItem(updated);
      }
      setApproveVersionModalItem(null);
      alert(tx("orders.version_approved_success"));
    } catch (err: any) {
      setApproveError(err?.message || "Versiyani tasdiqlashda xatolik yuz berdi");
    } finally {
      setApproveSubmitting(false);
    }
  };

  // PM yangi versiyani rad etishi (Reject version)
  const [rejectVersionModalItem, setRejectVersionModalItem] = useState<ChangeRequestItem | null>(null);
  const [rejectVersionTarget, setRejectVersionTarget] = useState<number | null>(null);
  const [rejectVersionReason, setRejectVersionReason] = useState("");
  const [rejectVersionSubmitting, setRejectVersionSubmitting] = useState(false);
  const [rejectVersionError, setRejectVersionError] = useState<string | null>(null);

  const handleOpenRejectVersion = (item: ChangeRequestItem, verNum?: number) => {
    setRejectVersionModalItem(item);
    setRejectVersionTarget(verNum || item.pending_version?.version || null);
    setRejectVersionReason("");
    setRejectVersionError(null);
  };

  const handleRejectVersionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectVersionModalItem) return;
    if (!rejectVersionReason.trim()) {
      setRejectVersionError("Rad etish sababini kiritish majburiy!");
      return;
    }
    setRejectVersionSubmitting(true);
    setRejectVersionError(null);
    try {
      const updated = await rejectVersion(rejectVersionModalItem.id, {
        version: rejectVersionTarget || undefined,
        decision_note: rejectVersionReason.trim(),
      });
      reload();
      if (viewingItem && viewingItem.id === updated.id) {
        setViewingItem(updated);
      }
      setRejectVersionModalItem(null);
      alert(tx("orders.version_rejected_success"));
    } catch (err: any) {
      setRejectVersionError(err?.message || "Versiyani rad etishda xatolik yuz berdi");
    } finally {
      setRejectVersionSubmitting(false);
    }
  };

  // PM buyurtmani o'z zimmasiga olishi (Claim)
  const [claimingId, setClaimingId] = useState<number | null>(null);

  const handleClaimOrder = async (item: ChangeRequestItem) => {
    if (
      !window.confirm(
        `«${item.request_no}» raqamli buyurtmani o'z zimmangizga olishni (PM sifatida qabul qilishni) tasdiqlaysizmi?\n\nSiz qabul qilganingizdan so'ng boshqa PM bu buyurtmani ololmaydi.`
      )
    ) {
      return;
    }
    setClaimingId(item.id);
    try {
      const updated = await api.post<ChangeRequestItem>(
        `/orders/${item.id}/claim-order/`,
        {}
      );
      if (viewingItem && viewingItem.id === item.id) {
        setViewingItem(updated);
      }
      reload();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Buyurtmani qabul qilishda xatolik yuz berdi.");
    } finally {
      setClaimingId(null);
    }
  };

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

  const canEditOrder = (item: ChangeRequestItem) => {
    if (user?.is_platform_admin || user?.is_boss) return true;
    if (isPMOrAdmin) {
      return !item.assigned_pm || item.assigned_pm === user?.id;
    }
    // Boshqarma faqat NEW va PM biriktirilmagan buyurtmani tahrirlay oladi
    return item.status === "NEW" && !item.assigned_pm;
  };

  // PM qarorini saqlash
  const handleSavePMDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingItem) return;

    if (pmDecisionForm.status === "REJECTED" && !pmDecisionForm.pm_notes.trim()) {
      setPmSaveError("Buyurtmani rad etish (atkaz qilish) uchun sabab va izoh kiritish majburiy!");
      return;
    }

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

  // Tugatilgan ish hujjati topshirish (PM)
  const handleSubmitCompletion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completionModalItem) return;
    setCompletionSubmitting(true);
    setCompletionError(null);

    try {
      const formData = new FormData();
      if (completionFile) {
        formData.append("completion_file", completionFile);
      }
      if (completionNote.trim()) {
        formData.append("completion_note", completionNote.trim());
      }

      const updated = await api.post<ChangeRequestItem>(
        `/orders/${completionModalItem.id}/submit-completion/`,
        formData
      );
      if (viewingItem && viewingItem.id === completionModalItem.id) {
        setViewingItem(updated);
      }
      setCompletionModalItem(null);
      setCompletionFile(null);
      setCompletionNote("");
      reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Tugatilgan ishni topshirishda xatolik yuz berdi.";
      setCompletionError(msg);
    } finally {
      setCompletionSubmitting(false);
    }
  };

  // Boshqarma tasdiqlashi va buyurtmani yakunlash
  const handleClientApprove = async (item: ChangeRequestItem) => {
    if (
      !window.confirm(
        `«${item.request_no}» raqamli buyurtma bo'yicha bajarilgan ishni qabul qilib, buyurtmani to'liq yakunlashni tasdiqlaysizmi?`
      )
    ) {
      return;
    }
    setApprovingId(item.id);
    try {
      const updated = await api.post<ChangeRequestItem>(
        `/orders/${item.id}/client-approve/`,
        {}
      );
      if (viewingItem && viewingItem.id === item.id) {
        setViewingItem(updated);
      }
      reload();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Tasdiqlashda xatolik yuz berdi.");
    } finally {
      setApprovingId(null);
    }
  };

  // Boshqarma kamchilik/xatolik bilan qaytarishi
  const handleClientReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalItem) return;
    if (!rejectFeedbackNote.trim()) {
      setRejectError("Kamchilik yoki xatolik haqida izoh yozish shart.");
      return;
    }
    setRejectSubmitting(true);
    setRejectError(null);
    try {
      const updated = await api.post<ChangeRequestItem>(
        `/orders/${rejectModalItem.id}/client-reject-completion/`,
        { feedback_note: rejectFeedbackNote.trim() }
      );
      if (viewingItem && viewingItem.id === rejectModalItem.id) {
        setViewingItem(updated);
      }
      setRejectModalItem(null);
      setRejectFeedbackNote("");
      reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Qaytarishda xatolik yuz berdi.";
      setRejectError(msg);
    } finally {
      setRejectSubmitting(false);
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

  const isPM = Boolean(
    (user?.is_manager || user?.global_role === "MANAGER" || user?.specialty === "PM") &&
    !user?.is_sohaviy_boshqarma &&
    !user?.is_platform_admin &&
    !user?.is_boss
  );
  const canCreateOrder = !isPM;

  return (
    <>
      <PageHead
        title={
          <span className="row middle" style={{ gap: 10 }}>
            <strong>{tx("orders.sarlavha")}</strong>
          </span>
        }
        actions={
          canCreateOrder ? (
            <button
              className="btn btn-primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                borderRadius: 8,
                padding: "9px 18px",
                fontWeight: 600,
                fontSize: 13.5,
                background: "#2563eb",
                border: "none",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                cursor: "pointer",
              }}
              onClick={() => go(toNewOrder())}
            >
              <IconPlus size={16} /> {tx("orders.yangi_buyurtma")}
            </button>
          ) : undefined
        }
      />

      <div className="content">
        {/* Yuqori ko'rsatkichlar kartalari (5 ta KPI kartochkasi - UX dizayn asosida) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
            marginBottom: 20,
          }}
        >
          {statsLoading ? (
            Array.from({ length: 5 }).map((_, i) => <KpiCardSkeleton key={i} />)
          ) : (
            <>
              {/* 1. Jami so'rovlar */}
              <div
                onClick={() => {
                  setStatusFilter("");
                  setPage(1);
                }}
                style={{
                  background: "#f0f7ff",
                  border: !statusFilter ? "2px solid #2563eb" : "1px solid #dbeafe",
                  borderRadius: 14,
                  padding: "16px 20px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                  transition: "all 0.15s ease",
                }}
                title="Barcha buyurtmalarni ko'rish"
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: "50%",
                    background: "#dbeafe",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "#475569", fontWeight: 500, marginBottom: 4 }}>
                    {tx("orders.jami_sorovlar")}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>
                      {statsData?.total ?? total}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#16a34a" }}>
                      ↑ +{statsData?.new || 1}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Yangi */}
              <div
                onClick={() => {
                  setStatusFilter("NEW");
                  setPage(1);
                }}
                style={{
                  background: "#fffdf0",
                  border: statusFilter === "NEW" ? "2px solid #d97706" : "1px solid #fef3c7",
                  borderRadius: 14,
                  padding: "16px 20px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                  transition: "all 0.15s ease",
                }}
                title="Yangi talabnomalar"
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: "50%",
                    background: "#fef3c7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 22h14" />
                    <path d="M5 2h14" />
                    <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
                    <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "#475569", fontWeight: 500, marginBottom: 4 }}>
                    {tx("orders.yangi")}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>
                      {statsData?.new ?? 0}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#64748b" }}>
                      {(statsData?.total ?? total) > 0
                        ? `${Math.round(((statsData?.new ?? 0) / (statsData?.total ?? total)) * 100)}%`
                        : "0%"}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Jarayonda */}
              <div
                onClick={() => {
                  setStatusFilter("IN_PROGRESS");
                  setPage(1);
                }}
                style={{
                  background: "#f0f9ff",
                  border: statusFilter === "IN_PROGRESS" ? "2px solid #0284c7" : "1px solid #e0f2fe",
                  borderRadius: 14,
                  padding: "16px 20px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                  transition: "all 0.15s ease",
                }}
                title="Jarayondagi buyurtmalar"
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: "50%",
                    background: "#e0f2fe",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "#475569", fontWeight: 500, marginBottom: 4 }}>
                    {tx("orders.jarayonda")}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>
                      {(statsData?.in_progress_strict ?? 0) || (statsData?.in_progress ?? 0)}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#64748b" }}>
                      {(statsData?.total ?? total) > 0
                        ? `${Math.round(
                            (((statsData?.in_progress_strict ?? 0) || (statsData?.in_progress ?? 0)) /
                              (statsData?.total ?? total)) *
                              100
                          )}%`
                        : "0%"}
                    </span>
                  </div>
                </div>
              </div>

              {/* 4. Tugallangan */}
              <div
                onClick={() => {
                  setStatusFilter("COMPLETED");
                  setPage(1);
                }}
                style={{
                  background: "#f0fdf4",
                  border: statusFilter === "COMPLETED" ? "2px solid #16a34a" : "1px solid #dcfce7",
                  borderRadius: 14,
                  padding: "16px 20px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                  transition: "all 0.15s ease",
                }}
                title="Bajarilgan buyurtmalar"
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: "50%",
                    background: "#dcfce7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "#475569", fontWeight: 500, marginBottom: 4 }}>
                    {tx("orders.tugallangan")}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>
                      {statsData?.completed ?? 0}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#64748b" }}>
                      {(statsData?.total ?? total) > 0
                        ? `${Math.round(((statsData?.completed ?? 0) / (statsData?.total ?? total)) * 100)}%`
                        : "0%"}
                    </span>
                  </div>
                </div>
              </div>

              {/* 5. Bekor qilingan */}
              <div
                onClick={() => {
                  setStatusFilter("REJECTED");
                  setPage(1);
                }}
                style={{
                  background: "#fef2f2",
                  border: statusFilter === "REJECTED" ? "2px solid #dc2626" : "1px solid #fee2e2",
                  borderRadius: 14,
                  padding: "16px 20px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                  transition: "all 0.15s ease",
                }}
                title="Bekor qilingan buyurtmalar"
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: "50%",
                    background: "#fee2e2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "#475569", fontWeight: 500, marginBottom: 4 }}>
                    {tx("orders.bekor_qilingan")}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>
                      {statsData?.rejected ?? 0}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#64748b" }}>
                      {(statsData?.total ?? total) > 0
                        ? `${Math.round(((statsData?.rejected ?? 0) / (statsData?.total ?? total)) * 100)}%`
                        : "0%"}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Qidiruv va filtrlar paneli */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: "12px 16px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
          }}
        >
          {/* Qidiruv maydoni */}
          <div style={{ position: "relative", flex: 1.5, minWidth: 260 }}>
            <div
              style={{
                position: "absolute",
                left: 14,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#94a3b8",
                pointerEvents: "none",
                display: "flex",
                alignItems: "center",
              }}
            >
              <IconSearch size={16} />
            </div>
            <input
              type="text"
              placeholder={tx("orders.search_placeholder")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              style={{
                width: "100%",
                paddingLeft: 38,
                paddingRight: search ? 34 : 14,
                height: 42,
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                background: "#fff",
                fontSize: 13,
                boxSizing: "border-box",
                color: "#0f172a",
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  padding: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                }}
                title="Qidiruvni tozalash"
              >
                ✕
              </button>
            )}
          </div>

          {/* Barcha loyihalar */}
          <div style={{ position: "relative", minWidth: 160 }}>
            <select
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value);
                setPage(1);
              }}
              style={{
                width: "100%",
                height: 42,
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                background: "#fff",
                fontSize: 13,
                padding: "0 34px 0 14px",
                cursor: "pointer",
                appearance: "none",
                color: "#334155",
                fontWeight: 500,
              }}
            >
              <option value="">{tx("orders.barcha_loyihalar")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.key})
                </option>
              ))}
            </select>
            <span
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                color: "#64748b",
                display: "flex",
                alignItems: "center",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </div>

          {/* Barcha holatlar */}
          <div style={{ position: "relative", minWidth: 160 }}>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              style={{
                width: "100%",
                height: 42,
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                background: "#fff",
                fontSize: 13,
                padding: "0 34px 0 14px",
                cursor: "pointer",
                appearance: "none",
                color: "#334155",
                fontWeight: 500,
              }}
            >
              <option value="">{tx("orders.barcha_holatlar")}</option>
              <option value="NEW">{tx("orders.yangi")}</option>
              <option value="ACCEPTED">Qabul qilindi</option>
              <option value="ASSIGNED_TO_DEV">Dasturchiga topshirildi</option>
              <option value="IN_PROGRESS">{tx("orders.jarayonda")}</option>
              <option value="TESTING">Testda</option>
              <option value="READY_FOR_REVIEW">Boshqarma tasdig'ida</option>
              <option value="COMPLETED">{tx("orders.tugallangan")}</option>
              <option value="REJECTED">{tx("orders.bekor_qilingan")}</option>
            </select>
            <span
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                color: "#64748b",
                display: "flex",
                alignItems: "center",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </div>

          {/* Barcha muddatlar */}
          <div style={{ position: "relative", minWidth: 160 }}>
            <select
              value={deadlineFilter}
              onChange={(e) => {
                setDeadlineFilter(e.target.value);
                setPage(1);
              }}
              style={{
                width: "100%",
                height: 42,
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                background: "#fff",
                fontSize: 13,
                padding: "0 34px 0 14px",
                cursor: "pointer",
                appearance: "none",
                color: "#334155",
                fontWeight: 500,
              }}
            >
              <option value="">{tx("orders.barcha_muddatlar")}</option>
              <option value="TODAY">Bugun tugaydigan</option>
              <option value="WEEK">Shu haftada</option>
              <option value="URGENT">Shoshilinch</option>
              <option value="OVERDUE">Muddati o'tganlar</option>
            </select>
            <span
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                color: "#64748b",
                display: "flex",
                alignItems: "center",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </div>

          {/* Filtrlarni tozalash tugmasi (3 ta chiziq/slider icon) */}
          <button
            type="button"
            className="btn btn-ghost"
            title="Filtrlarni tozalash"
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setProjectFilter("");
              setDeadlineFilter("");
              setTypeFilter("");
              setPriorityFilter("");
              setPage(1);
            }}
            style={{
              width: 42,
              height: 42,
              padding: 0,
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#64748b",
              cursor: "pointer",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
          </button>
        </div>

        {error && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 12,
              padding: "16px 20px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22 }}>⚠️</span>
              <div>
                <div style={{ fontWeight: 700, color: "#991b1b", fontSize: 13.5 }}>
                  Ma'lumotlarni yuklashda xatolik yuz berdi
                </div>
                <div style={{ color: "#b91c1c", fontSize: 12.5, marginTop: 2 }}>
                  {typeof error === "string" ? error : (error as any)?.message || String(error)}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => reload()}
              style={{
                borderRadius: 8,
                padding: "6px 14px",
                fontSize: 12.5,
                fontWeight: 600,
                background: "#fff",
                borderColor: "#fca5a5",
                color: "#991b1b",
              }}
            >
              🔄 Qayta urinish
            </button>
          </div>
        )}

        {/* Asosiy jadval (8 ta ustun - UX dizayn asosida) */}
        {loading || displayItems.length > 0 ? (
          <div
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div className="table-wrap" style={{ overflowX: "auto" }}>
              <table className="table" style={{ margin: 0, width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ width: 50, textAlign: "center", padding: "16px 18px", fontSize: 11.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>#</th>
                    <th style={{ padding: "16px 18px", fontSize: 11.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>BUYURTMA</th>
                    <th style={{ padding: "16px 18px", fontSize: 11.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>LOYIHA / TIZIM</th>
                    <th style={{ padding: "16px 18px", fontSize: 11.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{tx("orders.buyurtmachi_boshqarma")}</th>
                    <th style={{ padding: "16px 18px", fontSize: 11.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>TAVSIF</th>
                    <th style={{ padding: "16px 18px", fontSize: 11.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>MUDDAT</th>
                    <th style={{ padding: "16px 18px", fontSize: 11.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>HOLAT</th>
                    <th style={{ width: 90, textAlign: "right", padding: "16px 18px", fontSize: 11.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>AMALLAR</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRowSkeleton key={i} rowNum={i + 1} />
                    ))
                  ) : (
                    displayItems.map((item, idx) => {
                      const rowNum = (page - 1) * PER_PAGE + idx + 1;
                    return (
                      <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ textAlign: "center", fontWeight: 700, fontSize: 13.5, color: "#0f172a", padding: "16px 18px" }}>
                          {rowNum}
                        </td>
                        <td style={{ padding: "16px 18px" }}>
                          <button
                            type="button"
                            onClick={() => handleOpenView(item)}
                            style={{
                              background: "#ffffff",
                              border: "1.5px solid #cbd5e1",
                              borderRadius: 9999,
                              padding: "4px 16px",
                              fontWeight: 700,
                              fontSize: 13,
                              color: "#0f172a",
                              cursor: "pointer",
                              display: "inline-block",
                              transition: "all 0.15s ease",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                            }}
                            title="Batafsil ko'rish"
                          >
                            {item.request_no}
                          </button>
                        </td>
                        <td style={{ padding: "16px 18px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 8,
                                background: item.project_detail?.color || "#2563eb",
                                color: "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                fontSize: 12.5,
                                flexShrink: 0,
                              }}
                            >
                              {item.project_detail?.key?.slice(0, 3) || "TF"}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 13.5, color: "#0f172a", lineHeight: 1.3 }}>
                                {item.project_detail?.name || item.system_name || "TeamFlow"}
                              </div>
                              <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>
                                {item.module || "Platforma 2.0"}
                              </div>
                              {item.assigned_developer_name && (
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: "#4338ca",
                                    fontWeight: 600,
                                    marginTop: 3,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 3,
                                    background: "#ede9fe",
                                    padding: "1.5px 6px",
                                    borderRadius: 4,
                                  }}
                                  title={`Mas'ul dasturchi (Ijrochi): ${item.assigned_developer_name}`}
                                >
                                  <span>👨‍💻</span>
                                  <span>{item.assigned_developer_name}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "16px 18px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: "50%",
                                background: "#eff6ff",
                                color: "#2563eb",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 15,
                                flexShrink: 0,
                                border: "1px solid #bfdbfe",
                              }}
                            >
                              🏛️
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                                {item.responsible_person || item.created_by_name || "Mijoz"}
                              </div>
                              <div
                                style={{
                                  fontSize: 11.5,
                                  color: "#64748b",
                                  marginTop: 2,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                                title={item.department || item.created_by_department || "Boshqarma ko'rsatilmagan"}
                              >
                                <span>🏢</span>
                                <span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {item.department || item.created_by_department || "Boshqarma ko'rsatilmagan"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ maxWidth: 220, padding: "16px 18px" }}>
                          <div
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              fontSize: 13,
                              color: "#334155",
                            }}
                            title={item.requested_change || item.current_state || ""}
                          >
                            {item.requested_change || item.current_state || "—"}
                          </div>
                        </td>
                        <td style={{ padding: "16px 18px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a" }}>
                                {item.pm_deadline
                                  ? fmtDate(item.pm_deadline)
                                  : item.due_date
                                  ? fmtDate(item.due_date)
                                  : "—"}
                              </div>
                              {(() => {
                                const rem = getRemainingDaysText(item.pm_deadline || item.due_date, item.status);
                                if (!rem) return null;
                                return (
                                  <div
                                    style={{
                                      fontSize: 11.5,
                                      color: rem.isOverdue ? "#dc2626" : "#64748b",
                                      fontWeight: rem.isOverdue ? 600 : 400,
                                      marginTop: 1,
                                    }}
                                  >
                                    {rem.text}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "16px 18px" }}>
                          {item.status === "COMPLETED" && (
                            <span
                              style={{
                                background: "#dcfce7",
                                color: "#15803d",
                                border: "1px solid #bbf7d0",
                                padding: "4px 14px",
                                borderRadius: 9999,
                                fontSize: 12.5,
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                whiteSpace: "nowrap",
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              {tx("orders.bajarildi")}
                            </span>
                          )}
                          {item.status === "READY_FOR_REVIEW" && (
                            <span
                              style={{
                                background: "#f3e8ff",
                                color: "#7e22ce",
                                border: "1px solid #e9d5ff",
                                padding: "4px 14px",
                                borderRadius: 9999,
                                fontSize: 12.5,
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                whiteSpace: "nowrap",
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                              Tasdiqlashda
                            </span>
                          )}
                          {item.status === "IN_PROGRESS" && (
                            <span
                              style={{
                                background: "#e0f2fe",
                                color: "#0369a1",
                                border: "1px solid #bae6fd",
                                padding: "4px 14px",
                                borderRadius: 9999,
                                fontSize: 12.5,
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                whiteSpace: "nowrap",
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                              {tx("orders.jarayonda")}
                            </span>
                          )}
                          {item.status === "TESTING" && (
                            <span
                              style={{
                                background: "#ffedd5",
                                color: "#c2410c",
                                border: "1px solid #fed7aa",
                                padding: "4px 14px",
                                borderRadius: 9999,
                                fontSize: 12.5,
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                whiteSpace: "nowrap",
                              }}
                            >
                              🧪 Testda
                            </span>
                          )}
                          {item.status === "ASSIGNED_TO_DEV" && (
                            <span
                              style={{
                                background: "#ede9fe",
                                color: "#5b21b6",
                                border: "1px solid #ddd6fe",
                                padding: "4px 14px",
                                borderRadius: 9999,
                                fontSize: 12.5,
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                whiteSpace: "nowrap",
                              }}
                            >
                              💻 Dasturchida
                            </span>
                          )}
                          {item.status === "ACCEPTED" && (
                            <span
                              style={{
                                background: "#eff6ff",
                                color: "#1d4ed8",
                                border: "1px solid #bfdbfe",
                                padding: "4px 14px",
                                borderRadius: 9999,
                                fontSize: 12.5,
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                whiteSpace: "nowrap",
                              }}
                            >
                              📋 Qabul qilindi
                            </span>
                          )}
                          {item.status === "NEW" && (
                            <span
                              style={{
                                background: "#fef3c7",
                                color: "#b45309",
                                border: "1px solid #fde68a",
                                padding: "4px 14px",
                                borderRadius: 9999,
                                fontSize: 12.5,
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                whiteSpace: "nowrap",
                              }}
                            >
                              📝 {tx("orders.yangi")}
                            </span>
                          )}
                          {item.status === "REJECTED" && (
                            <div>
                              <span
                                style={{
                                  background: "#fee2e2",
                                  color: "#b91c1c",
                                  border: "1px solid #fecaca",
                                  padding: "4px 14px",
                                  borderRadius: 9999,
                                  fontSize: 12.5,
                                  fontWeight: 600,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                ✕ {tx("orders.bekor_qilingan")}
                              </span>
                              {item.pm_notes && (
                                <div
                                  style={{
                                    marginTop: 4,
                                    fontSize: 11,
                                    color: "#991b1b",
                                    background: "#fef2f2",
                                    border: "1px solid #fecaca",
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                    maxWidth: 160,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={`Rad etish sababi: ${item.pm_notes}`}
                                >
                                  ⚠️ Sabab: {item.pm_notes}
                                </div>
                              )}
                            </div>
                          )}

                          {/* PM biriktirilganlik holati */}
                          {item.assigned_pm ? (
                            user?.id === item.assigned_pm ? (
                              <div style={{ marginTop: 6 }}>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    padding: "2px 8px",
                                    borderRadius: 9999,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: "#ecfdf5",
                                    color: "#059669",
                                    border: "1px solid #a7f3d0",
                                  }}
                                  title="Ushbu buyurtmani siz qabul qilgansiz"
                                >
                                  🎯 {tx("orders.sizga_biriktirilgan")}
                                </span>
                              </div>
                            ) : (
                              <div style={{ marginTop: 6 }}>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    padding: "2px 8px",
                                    borderRadius: 9999,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: "#f1f5f9",
                                    color: "#475569",
                                    border: "1px solid #cbd5e1",
                                  }}
                                  title={`Ushbu buyurtmani ${item.assigned_pm_name || "boshqa PM"} o'z zimmasiga olgan`}
                                >
                                  🔒 PM: {item.assigned_pm_name || "Boshqa PM"}
                                </span>
                              </div>
                            )
                          ) : (
                            <div style={{ marginTop: 6 }}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  padding: "2px 8px",
                                  borderRadius: 9999,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background: "#fffbeb",
                                  color: "#d97706",
                                  border: "1px solid #fde68a",
                                }}
                              >
                                ⏳ {tx("orders.pm_olinmagan")}
                              </span>
                            </div>
                          )}

                          {/* Yangi versiya kutilayotganligi belgisi */}
                          {item.has_pending_version && (
                            <div style={{ marginTop: 6 }}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  padding: "2px 8px",
                                  borderRadius: 9999,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  background: "#fef3c7",
                                  color: "#b45309",
                                  border: "1px solid #fcd34d",
                                }}
                                title={`v${item.pending_version?.version || "yangi"} versiya tasdiqlash uchun kutilmoqda`}
                              >
                                ⚡ v{item.pending_version?.version || "yangi"} kutilmoqda
                              </span>
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: "right", position: "relative", padding: "16px 18px" }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              color: "#94a3b8",
                              fontWeight: 700,
                              letterSpacing: "1px",
                              fontSize: 16,
                              lineHeight: 1,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveActionMenuId(activeActionMenuId === item.id ? null : item.id);
                            }}
                            title="Amallar menyusi"
                          >
                            •••
                          </button>

                          {activeActionMenuId === item.id && (
                            <div
                              style={{
                                position: "absolute",
                                right: 16,
                                top: "80%",
                                background: "#fff",
                                borderRadius: 8,
                                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                                border: "1px solid #e2e8f0",
                                zIndex: 50,
                                minWidth: 190,
                                padding: 6,
                                textAlign: "left",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5 }}
                                onClick={() => {
                                  setActiveActionMenuId(null);
                                  handleOpenView(item);
                                }}
                              >
                                👁️ Ko'rish va ma'lumot
                              </button>

                              {!item.assigned_pm && isPMOrAdmin && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{
                                    width: "100%",
                                    justifyContent: "flex-start",
                                    fontSize: 12.5,
                                    color: "#059669",
                                    fontWeight: 600,
                                  }}
                                  onClick={() => {
                                    setActiveActionMenuId(null);
                                    handleClaimOrder(item);
                                  }}
                                  disabled={claimingId === item.id}
                                >
                                  📌 {claimingId === item.id ? "Qabul qilinmoqda..." : tx("orders.ishni_qabul_qilish")}
                                </button>
                              )}

                              {item.status === "READY_FOR_REVIEW" && isSohaviyOrAdmin && (
                                <>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5, color: "#16a34a" }}
                                    onClick={() => {
                                      setActiveActionMenuId(null);
                                      handleClientApprove(item);
                                    }}
                                  >
                                    ✓ Ishni tasdiqlash
                                  </button>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5, color: "#d97706" }}
                                    onClick={() => {
                                      setActiveActionMenuId(null);
                                      setRejectModalItem(item);
                                      setRejectFeedbackNote("");
                                      setRejectError(null);
                                    }}
                                  >
                                    ⚠️ Kamchilik bilan qaytarish
                                  </button>
                                </>
                              )}

                              {isPMOrAdmin &&
                                (user?.is_platform_admin || user?.is_boss || item.assigned_pm === user?.id) &&
                                item.status !== "COMPLETED" &&
                                item.status !== "READY_FOR_REVIEW" &&
                                item.status !== "REJECTED" && (
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5, color: "#2563eb" }}
                                    onClick={() => {
                                      setActiveActionMenuId(null);
                                      setCompletionModalItem(item);
                                      setCompletionFile(null);
                                      setCompletionNote("");
                                      setCompletionError(null);
                                    }}
                                  >
                                    📁 Hisobot topshirish
                                  </button>
                                )}

                              {isSohaviyOrAdmin && item.status !== "COMPLETED" && item.status !== "REJECTED" && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5, color: "#0284c7", fontWeight: 600 }}
                                  onClick={() => {
                                    setActiveActionMenuId(null);
                                    handleOpenUploadVersion(item);
                                  }}
                                >
                                  📤 Yangi versiya yuborish (TZ)
                                </button>
                              )}

                              {isPMOrAdmin && item.has_pending_version && (user?.is_platform_admin || user?.is_boss || !item.assigned_pm || item.assigned_pm === user?.id) && (
                                <>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5, color: "#16a34a", fontWeight: 600 }}
                                    onClick={() => {
                                      setActiveActionMenuId(null);
                                      handleOpenApproveVersion(item);
                                    }}
                                  >
                                    ✅ Yangi TZ versiyasini tasdiqlash
                                  </button>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5, color: "#dc2626" }}
                                    onClick={() => {
                                      setActiveActionMenuId(null);
                                      handleOpenRejectVersion(item);
                                    }}
                                  >
                                    ❌ Versiyani rad etish
                                  </button>
                                </>
                              )}

                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5 }}
                                onClick={() => {
                                  setActiveActionMenuId(null);
                                  handleDownloadDocx(item.id, item.request_no);
                                }}
                              >
                                📄 Word (.docx) yuklash
                              </button>

                              {canEditOrder(item) && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5 }}
                                  onClick={() => {
                                    setActiveActionMenuId(null);
                                    go(toEditOrder(item.id));
                                  }}
                                >
                                  ✏️ Tahrirlash
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </div>

            {/* Jadval ostidagi footer / sahifalash (UX dizayn asosida) */}
            {!loading && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 20px",
                  background: "#fff",
                  borderTop: "1px solid #f1f5f9",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  {tx("orders.jami_ta_buyurtma", { n: total })}
                </div>

                {pages > 1 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      style={{
                        width: 32,
                        height: 32,
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        background: "#fff",
                        color: page <= 1 ? "#cbd5e1" : "#64748b",
                        cursor: page <= 1 ? "default" : "pointer",
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                    </button>

                    {Array.from({ length: Math.max(1, pages) }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPage(p)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          border: p === page ? "none" : "1px solid #e2e8f0",
                          background: p === page ? "#2563eb" : "#fff",
                          color: p === page ? "#fff" : "#0f172a",
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {p}
                      </button>
                    ))}

                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={page >= Math.max(1, pages)}
                      onClick={() => setPage((p) => Math.min(pages, p + 1))}
                      style={{
                        width: 32,
                        height: 32,
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        background: "#fff",
                        color: page >= Math.max(1, pages) ? "#cbd5e1" : "#64748b",
                        cursor: page >= Math.max(1, pages) ? "default" : "pointer",
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: "48px 24px",
              textAlign: "center",
              boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
            }}
          >
            {search || statusFilter || projectFilter || deadlineFilter ? (
              <>
                <div style={{ fontSize: 44, marginBottom: 12 }}>🔍</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
                  Mos keluvchi buyurtmalar topilmadi
                </div>
                <p style={{ color: "#64748b", fontSize: 13.5, maxWidth: 460, margin: "0 auto 20px" }}>
                  Tanlangan parametrlar yoki qidiruv so'zi bo'yicha hech qanday buyurtma topilmadi.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600 }}
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("");
                    setProjectFilter("");
                    setDeadlineFilter("");
                    setTypeFilter("");
                    setPriorityFilter("");
                    setPage(1);
                  }}
                >
                  Filtrlarni tozalash
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 44, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
                  Hozircha buyurtmalar (TZ) mavjud emas
                </div>
                <p style={{ color: "#64748b", fontSize: 13.5, maxWidth: 460, margin: "0 auto 20px" }}>
                  Axborot tizimiga yangi o'zgartirish yoki funksiya kiritish bo'yicha talabnoma va TZ fayli yarating.
                </p>
                {canCreateOrder && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{
                      borderRadius: 8,
                      padding: "9px 20px",
                      fontSize: 13.5,
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                    onClick={() => go(toNewOrder())}
                  >
                    <IconPlus size={16} /> {tx("orders.yangi_buyurtma")}
                  </button>
                )}
              </>
            )}
          </div>
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
                <span className="badge" style={{ background: "#4f46e5", color: "#fff", fontWeight: 700, fontSize: 11 }}>
                  v{viewingItem.version || 1}
                </span>
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
                {isSohaviyOrAdmin && viewingItem.status !== "COMPLETED" && viewingItem.status !== "REJECTED" && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    style={{ background: "#0284c7", borderColor: "#0284c7" }}
                    onClick={() => handleOpenUploadVersion(viewingItem)}
                  >
                    📤 {tx("orders.upload_new_version")}
                  </button>
                )}
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
                {canEditOrder(viewingItem) && (
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
                )}
                <button className="btn btn-sm btn-ghost" onClick={() => setViewingItem(null)}>
                  ✕
                </button>
              </div>
            </div>

            <div className="modal-body" style={{ padding: 20 }}>
              {/* Yangi TZ versiyasi tasdiqlash uchun kutayotganligi xabarnomasi */}
              {viewingItem.has_pending_version && viewingItem.pending_version && (
                <div
                  style={{
                    background: "#fffbeb",
                    border: "2px solid #f59e0b",
                    borderRadius: 8,
                    padding: "14px 18px",
                    marginBottom: 16,
                  }}
                >
                  <div className="row between middle" style={{ flexWrap: "wrap", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 24 }}>⚡</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "#92400e" }}>
                            {tx("orders.pending_version_alert", { version: viewingItem.pending_version.version })}
                          </div>
                          <div style={{ fontSize: 12, color: "#b45309", marginTop: 2 }}>
                            {tx("orders.pending_version_desc")}
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: 10, background: "#fef3c7", padding: "8px 12px", borderRadius: 6, fontSize: 12.5, color: "#78350f" }}>
                        <div><strong>O'zgarishlar tavsifi:</strong> {viewingItem.pending_version.change_note}</div>
                        {viewingItem.pending_version.requested_change && (
                          <div style={{ marginTop: 4 }}><strong>Yangi talablar:</strong> {viewingItem.pending_version.requested_change}</div>
                        )}
                        <div style={{ marginTop: 4, fontSize: 11, color: "#92400e" }}>
                          Yuklagan: {viewingItem.pending_version.uploaded_by_name || "Boshqarma vakili"} • {fmtDate(viewingItem.pending_version.created_at)}
                        </div>
                      </div>
                    </div>

                    <div className="row middle" style={{ gap: 8, flexWrap: "wrap" }}>
                      {viewingItem.pending_version.tz_file_url && (
                        <a
                          href={viewingItem.pending_version.tz_file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-sm btn-outline row middle"
                          style={{ gap: 4, background: "#fff" }}
                        >
                          <IconDownload size={14} /> Yangi TZ fayli (v{viewingItem.pending_version.version})
                        </a>
                      )}

                      {isPMOrAdmin && (user?.is_platform_admin || user?.is_boss || !viewingItem.assigned_pm || viewingItem.assigned_pm === user?.id) && (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm btn-ok"
                            onClick={() => handleOpenApproveVersion(viewingItem, viewingItem.pending_version?.version)}
                          >
                            ✓ {tx("orders.approve_version_btn")}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => handleOpenRejectVersion(viewingItem, viewingItem.pending_version?.version)}
                          >
                            ✕ {tx("orders.reject_version_btn")}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* PM biriktirilganlik holati banneri */}
              {!viewingItem.assigned_pm ? (
                <div
                  style={{
                    background: "#fffbeb",
                    border: "1.5px solid #fde68a",
                    borderRadius: 8,
                    padding: "12px 16px",
                    marginBottom: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 22 }}>⏳</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: "#92400e" }}>
                        {tx("orders.ishni_qabul_qilish_taklif")}
                      </div>
                      <div style={{ fontSize: 12, color: "#b45309", marginTop: 2 }}>
                        Loyiha menejeri buyurtmani o'z zimmasiga olgach, boshqa PMlar bu buyurtmani ololmaydi.
                      </div>
                    </div>
                  </div>
                  {isPMOrAdmin && (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      style={{ background: "#059669", borderColor: "#059669" }}
                      onClick={() => handleClaimOrder(viewingItem)}
                      disabled={claimingId === viewingItem.id}
                    >
                      📌 {claimingId === viewingItem.id ? "Qabul qilinmoqda..." : tx("orders.ishni_qabul_qilish")}
                    </button>
                  )}
                </div>
              ) : viewingItem.assigned_pm !== user?.id && !user?.is_platform_admin && !user?.is_boss ? (
                <div
                  style={{
                    background: "#f1f5f9",
                    border: "1.5px solid #cbd5e1",
                    borderRadius: 8,
                    padding: "12px 16px",
                    marginBottom: 16,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span style={{ fontSize: 22 }}>🔒</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: "#334155" }}>
                      Ushbu buyurtmani boshqa loyiha menejeri o'z zimmasiga olgan:{" "}
                      <span style={{ color: "#0f172a" }}>{viewingItem.assigned_pm_name || "Menejer"}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                      {tx("orders.boshqa_pm_blokirovka")}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: "#ecfdf5",
                    border: "1.5px solid #a7f3d0",
                    borderRadius: 8,
                    padding: "10px 14px",
                    marginBottom: 16,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: "#065f46",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <span>🎯</span>
                  <span>Ushbu buyurtma bo'yicha mas'ul loyiha menejeri: {viewingItem.assigned_pm_name || user?.full_name || "Siz"}</span>
                </div>
              )}

              {/* Ish jarayoni va bosqichlar zanjiri (Visual Stepper) */}
              <OrderProgressStepper item={viewingItem} />

              {/* PM tomonidan rad etilgan (atkaz qilingan) xabarnoma */}
              {viewingItem.status === "REJECTED" && (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "2px solid #ef4444",
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  <div className="row middle" style={{ gap: 8, color: "#991b1b", fontWeight: 700, fontSize: 14 }}>
                    <span style={{ fontSize: 22 }}>❌</span>
                    <span>Loyiha menejeri (PM) tomonidan rad etilgan (atkaz qilingan)</span>
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 13,
                      color: "#7f1d1d",
                      whiteSpace: "pre-wrap",
                      background: "#fff",
                      padding: "10px 14px",
                      borderRadius: 6,
                      border: "1px solid #fecaca",
                      lineHeight: 1.5,
                    }}
                  >
                    <strong>Rad etish sababi / Asos:</strong>
                    <div style={{ marginTop: 4 }}>{viewingItem.pm_notes || "Sabab ko'rsatilmagan"}</div>
                  </div>
                </div>
              )}

              {/* Boshqarma uchun tahrirlash va o'chirish taqiqlanganligi haqida ma'lumot */}
              {isSohaviyOrAdmin && !user?.is_platform_admin && !user?.is_boss && (viewingItem.status !== "NEW" || viewingItem.assigned_pm) && (
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    padding: "8px 12px",
                    marginBottom: 16,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: "#64748b",
                  }}
                >
                  <span>🔒</span>
                  <span>{tx("orders.pm_qabul_qilgan_tahrirlab_bolmaydi")}</span>
                </div>
              )}

              {/* Boshqarma tasdig'i kutilayotgan holat xabarnomasi */}
              {viewingItem.status === "READY_FOR_REVIEW" && (
                <div
                  style={{
                    background: "rgba(168, 85, 247, 0.08)",
                    border: "2px solid #a855f7",
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  <div className="row middle between" style={{ flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#6b21a8" }}>
                        📑 Bajarilgan ish boshqarma tasdig'iga topshirilgan
                      </div>
                      <div style={{ fontSize: 12.5, color: "#581c87", marginTop: 3 }}>
                        Loyiha menejeri hisobot hujjatini yuklagan. Boshqarma ko'rib chiqib qabul qilgach, buyurtma yopiladi.
                      </div>
                    </div>
                    {isSohaviyOrAdmin && (
                      <div className="row middle" style={{ gap: 8 }}>
                        <button
                          className="btn btn-sm btn-ok"
                          onClick={() => handleClientApprove(viewingItem)}
                          disabled={approvingId === viewingItem.id}
                        >
                          ✓ Ishni qabul qilish va yopish
                        </button>
                        <button
                          className="btn btn-sm btn-warning"
                          onClick={() => {
                            setRejectModalItem(viewingItem);
                            setRejectFeedbackNote("");
                            setRejectError(null);
                          }}
                        >
                          ⚠️ Kamchilik mavjud (Qaytarish)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Boshqarma tomonidan bildirilgan kamchilik / xatolik izohi */}
              {viewingItem.client_feedback_note && viewingItem.status !== "COMPLETED" && (
                <div
                  style={{
                    background: "#fffbeb",
                    border: "2px solid #f59e0b",
                    borderRadius: 8,
                    padding: 14,
                    marginBottom: 16,
                  }}
                >
                  <div className="row middle" style={{ gap: 8, color: "#92400e", fontWeight: 700, fontSize: 13.5 }}>
                    <span style={{ fontSize: 18 }}>⚠️</span>
                    <span>Boshqarma tomonidan bildirilgan kamchilik / e'tiroz:</span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "#78350f", whiteSpace: "pre-wrap" }}>
                    {viewingItem.client_feedback_note}
                  </div>
                </div>
              )}

              {/* PM tomonidan yuklangan bajarilgan ish hujjati / hisoboti */}
              {(viewingItem.completion_file_url || viewingItem.completion_note) && (
                <div
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: 8,
                    padding: 14,
                    marginBottom: 16,
                  }}
                >
                  <div
                    className="row between middle"
                    style={{
                      marginBottom: /\.(png|jpe?g|webp|gif|bmp)$/i.test(
                        viewingItem.completion_file_name || viewingItem.completion_file_url || ""
                      )
                        ? 10
                        : 0,
                    }}
                  >
                    <div className="row middle" style={{ gap: 10 }}>
                      <span style={{ fontSize: 24 }}>
                        {/\.(png|jpe?g|webp|gif|bmp)$/i.test(
                          viewingItem.completion_file_name || viewingItem.completion_file_url || ""
                        )
                          ? "🖼️"
                          : "📁"}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "#1e40af" }}>
                          Bajarilgan ish hujjati / hisoboti (PM tomonidan topshirilgan)
                        </div>
                        <div style={{ fontSize: 12, color: "#1d4ed8" }}>
                          {viewingItem.completion_file_name || "Hisobot hujjati"}{" "}
                          {viewingItem.completion_file_size_display ? `(${viewingItem.completion_file_size_display})` : ""}
                          {viewingItem.completed_at && ` • Topshirilgan vaqti: ${fmtDate(viewingItem.completed_at)}`}
                        </div>
                      </div>
                    </div>
                    {viewingItem.completion_file_url && (
                      <a
                        href={viewingItem.completion_file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-sm btn-primary"
                      >
                        <IconDownload size={14} /> Hujjatni yuklab olish
                      </a>
                    )}
                  </div>

                  {viewingItem.completion_note && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 12.5,
                        color: "#1e3a8a",
                        background: "#dbeafe",
                        padding: "8px 12px",
                        borderRadius: 6,
                      }}
                    >
                      <strong>PM hisobot izohi:</strong> {viewingItem.completion_note}
                    </div>
                  )}

                  {/\.(png|jpe?g|webp|gif|bmp)$/i.test(
                    viewingItem.completion_file_name || viewingItem.completion_file_url || ""
                  ) && viewingItem.completion_file_url && (
                    <div
                      style={{
                        marginTop: 8,
                        textAlign: "center",
                        background: "#fff",
                        borderRadius: 6,
                        padding: 8,
                        border: "1px solid #bfdbfe",
                      }}
                    >
                      <a href={viewingItem.completion_file_url} target="_blank" rel="noreferrer">
                        <img
                          src={viewingItem.completion_file_url}
                          alt="Tugatilgan ish rasmi"
                          style={{ maxWidth: "100%", maxHeight: 360, objectFit: "contain", borderRadius: 4 }}
                        />
                      </a>
                    </div>
                  )}

                  {viewingItem.client_approved_at && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        color: "#15803d",
                        fontWeight: 600,
                        background: "#dcfce7",
                        padding: "6px 10px",
                        borderRadius: 4,
                      }}
                    >
                      ✅ Boshqarma tomonidan to'liq tasdiqlandi va qabul qilindi:{" "}
                      {viewingItem.client_approved_by_name || viewingItem.client_signer || "Mas'ul"} (
                      {fmtDate(viewingItem.client_approved_at)})
                    </div>
                  )}
                </div>
              )}

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

              {/* B. BIRIKTIRILGAN TZ FAYLI YOKI RASMI */}
              {viewingItem.tz_file_url && (
                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: 8,
                    padding: 14,
                    marginBottom: 16,
                  }}
                >
                  <div className="row between middle" style={{ marginBottom: /\.(png|jpe?g|webp|gif|bmp)$/i.test(viewingItem.tz_file_name || viewingItem.tz_file_url) ? 10 : 0 }}>
                    <div className="row middle" style={{ gap: 10 }}>
                      <span style={{ fontSize: 24 }}>
                        {/\.(png|jpe?g|webp|gif|bmp)$/i.test(viewingItem.tz_file_name || viewingItem.tz_file_url) ? "🖼️" : "📄"}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "#166534" }}>
                          Biriktirilgan TZ hujjati / rasmi
                        </div>
                        <div style={{ fontSize: 12, color: "#15803d" }}>
                          {viewingItem.tz_file_name || "Texnik topshiriq"} •{" "}
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
                  {/\.(png|jpe?g|webp|gif|bmp)$/i.test(viewingItem.tz_file_name || viewingItem.tz_file_url) && (
                    <div style={{ marginTop: 8, textAlign: "center", background: "#fff", borderRadius: 6, padding: 8, border: "1px solid #e2e8f0" }}>
                      <a href={viewingItem.tz_file_url} target="_blank" rel="noreferrer">
                        <img
                          src={viewingItem.tz_file_url}
                          alt="TZ Rasmi"
                          style={{ maxWidth: "100%", maxHeight: 360, objectFit: "contain", borderRadius: 4 }}
                        />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* C. TZ VERSIYALARI TARIXI */}
              <div
                style={{
                  background: "#f8fafc",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: 8,
                  padding: 14,
                  marginBottom: 16,
                }}
              >
                <div className="row between middle" style={{ marginBottom: 12 }}>
                  <div className="row middle" style={{ gap: 8 }}>
                    <span style={{ fontSize: 18 }}>📑</span>
                    <strong style={{ fontSize: 13.5, color: "#1e293b" }}>
                      {tx("orders.versions_history")}
                    </strong>
                    <span className="badge badge-brand" style={{ fontSize: 11 }}>
                      Joriy: v{viewingItem.version || 1}
                    </span>
                  </div>
                  {isSohaviyOrAdmin && viewingItem.status !== "COMPLETED" && viewingItem.status !== "REJECTED" && (
                    <button
                      type="button"
                      className="btn btn-xs btn-primary"
                      style={{ background: "#0284c7", borderColor: "#0284c7" }}
                      onClick={() => handleOpenUploadVersion(viewingItem)}
                    >
                      + {tx("orders.upload_new_version")}
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(viewingItem.versions || []).map((v) => {
                    const isCurrentActive = v.version === viewingItem.version && v.status === "ACCEPTED";
                    const isCancelled = v.status === "CANCELLED";
                    const isPending = v.status === "NEW";
                    const isRejected = v.status === "REJECTED";

                    return (
                      <div
                        key={v.id || v.version}
                        style={{
                          background: isCurrentActive
                            ? "#f0fdf4"
                            : isPending
                            ? "#fffbeb"
                            : isRejected
                            ? "#fef2f2"
                            : "#fff",
                          border: isCurrentActive
                            ? "1.5px solid #86efac"
                            : isPending
                            ? "1.5px solid #fde68a"
                            : isRejected
                            ? "1px solid #fecaca"
                            : "1px solid #e2e8f0",
                          borderRadius: 6,
                          padding: "10px 14px",
                          fontSize: 12.5,
                        }}
                      >
                        <div className="row between middle" style={{ flexWrap: "wrap", gap: 8 }}>
                          <div className="row middle" style={{ gap: 8, flexWrap: "wrap" }}>
                            <span
                              style={{
                                fontWeight: 700,
                                fontSize: 12,
                                padding: "2px 8px",
                                borderRadius: 4,
                                background: isCurrentActive ? "#16a34a" : isPending ? "#d97706" : isCancelled ? "#64748b" : "#dc2626",
                                color: "#fff",
                              }}
                            >
                              v{v.version}
                            </span>

                            {isCurrentActive && (
                              <span className="badge badge-ok" style={{ fontSize: 11 }}>
                                ✓ {tx("orders.status_active")}
                              </span>
                            )}
                            {isPending && (
                              <span className="badge badge-warning" style={{ fontSize: 11 }}>
                                ⏳ {tx("orders.status_pending_review")}
                              </span>
                            )}
                            {isCancelled && (
                              <span className="badge badge-ghost" style={{ fontSize: 11, background: "#e2e8f0", color: "#475569" }}>
                                🚫 {tx("orders.status_cancelled")}
                              </span>
                            )}
                            {isRejected && (
                              <span className="badge badge-danger" style={{ fontSize: 11 }}>
                                ✕ Rad etilgan
                              </span>
                            )}

                            <span style={{ color: "#334155", fontWeight: 600 }}>
                              {v.tz_file_name || "TZ fayli"} {v.tz_file_size_display ? `(${v.tz_file_size_display})` : ""}
                            </span>
                          </div>

                          <div className="row middle" style={{ gap: 8 }}>
                            {v.tz_file_url && (
                              <a
                                href={v.tz_file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-xs btn-outline"
                                style={{ background: "#fff" }}
                              >
                                <IconDownload size={12} /> Yuklab olish
                              </a>
                            )}

                            {isPending && isPMOrAdmin && (user?.is_platform_admin || user?.is_boss || !viewingItem.assigned_pm || viewingItem.assigned_pm === user?.id) && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-xs btn-ok"
                                  onClick={() => handleOpenApproveVersion(viewingItem, v.version)}
                                >
                                  ✓ Tasdiqlash
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-xs btn-danger"
                                  onClick={() => handleOpenRejectVersion(viewingItem, v.version)}
                                >
                                  ✕ Rad etish
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {v.change_note && (
                          <div style={{ marginTop: 6, color: "#334155", fontSize: 12 }}>
                            <strong>O'zgarishlar tavsifi:</strong> {v.change_note}
                          </div>
                        )}

                        {v.requested_change && (
                          <div style={{ marginTop: 4, color: "#475569", fontSize: 12 }}>
                            <strong>Talablar matni:</strong> {v.requested_change}
                          </div>
                        )}

                        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 16, color: "#64748b", fontSize: 11 }}>
                          <span>Yuklagan: {v.uploaded_by_name || "Boshqarma vakili"} ({fmtDate(v.created_at)})</span>
                          {v.decided_by_name && (
                            <span>Qaror qilgan PM: {v.decided_by_name} ({fmtDate(v.decided_at)})</span>
                          )}
                          {v.decision_note && (
                            <span style={{ color: isRejected ? "#b91c1c" : "#15803d", fontWeight: 600 }}>
                              PM izohi: {v.decision_note}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>


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
                viewingItem.assigned_pm && viewingItem.assigned_pm !== user?.id && !user?.is_platform_admin && !user?.is_boss ? (
                  <div
                    style={{
                      background: "#f8fafc",
                      border: "1.5px solid #cbd5e1",
                      borderRadius: 8,
                      padding: 16,
                      marginBottom: 10,
                    }}
                  >
                    <div className="row middle" style={{ gap: 8, color: "#475569" }}>
                      <span style={{ fontSize: 20 }}>🔒</span>
                      <strong style={{ fontSize: 13.5, color: "#334155" }}>
                        Loyiha Menejeri (PM) boshqaruv paneli qulflangan
                      </strong>
                    </div>
                    <p style={{ margin: "8px 0 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
                      Ushbu buyurtmani boshqa loyiha menejeri (<strong>{viewingItem.assigned_pm_name}</strong>) qabul qilgan. Faqat mas'ul menejer yoki boshqaruvchi buyurtma muddatlarini belgilashi va hisobot topshirishi mumkin.
                    </p>
                  </div>
                ) : !viewingItem.assigned_pm && !user?.is_platform_admin && !user?.is_boss ? (
                  <div
                    style={{
                      background: "#eff6ff",
                      border: "1.5px solid #bfdbfe",
                      borderRadius: 8,
                      padding: 16,
                      marginBottom: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: "#1e40af" }}>
                        Buyurtma bo'yicha muddat va topshiriq belgilash uchun avval uni qabul qiling
                      </div>
                      <div style={{ fontSize: 12, color: "#3b82f6", marginTop: 2 }}>
                        Ishni o'z zimmangizga olganingizdan so'ng, ijrochi biriktirish va yakuniy muddatlarni kiritish paneli faollashadi.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => handleClaimOrder(viewingItem)}
                      disabled={claimingId === viewingItem.id}
                    >
                      📌 {claimingId === viewingItem.id ? "Qabul qilinmoqda..." : tx("orders.ishni_qabul_qilish")}
                    </button>
                  </div>
                ) : (
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
                      <label style={{ fontWeight: 600, fontSize: 12, color: pmDecisionForm.status === "REJECTED" ? "#dc2626" : undefined }}>
                        {pmDecisionForm.status === "REJECTED"
                          ? "⚠️ Rad etish sababi va izohi (Boshqarmaga nima sababdan atkaz qilingani ko'rsatiladi) *"
                          : "PM xulosasi va jamoa uchun topshiriq ko'rsatmalari"}
                      </label>
                      <textarea
                        rows={pmDecisionForm.status === "REJECTED" ? 3 : 2}
                        required={pmDecisionForm.status === "REJECTED"}
                        style={{
                          borderColor: pmDecisionForm.status === "REJECTED" ? "#ef4444" : undefined,
                          background: pmDecisionForm.status === "REJECTED" ? "#fef2f2" : undefined,
                        }}
                        placeholder={
                          pmDecisionForm.status === "REJECTED"
                            ? "Buyurtmani rad etish sababini batafsil yozing (nima yetishmayapti yoki nima uchun qabul qilinmadi)..."
                            : "Ushbu buyurtma bo'yicha menejer xulosasi yoki ijrochilar uchun ko'rsatma..."
                        }
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

                    {/* PM uchun ishni hisobot bilan topshirish tugmasi */}
                    {viewingItem.status !== "COMPLETED" && viewingItem.status !== "REJECTED" && (
                      <div
                        style={{
                          marginTop: 14,
                          paddingTop: 12,
                          borderTop: "1px dashed #93c5fd",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        <span style={{ fontSize: 12.5, color: "#1e40af" }}>
                          💡 Ish yakunlanganda bajarilgan ish hujjati / hisoboti bilan topshiring:
                        </span>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            setCompletionModalItem(viewingItem);
                            setCompletionFile(null);
                            setCompletionNote("");
                            setCompletionError(null);
                          }}
                        >
                          📁 Tugatilgan ish hisobotini topshirish
                        </button>
                      </div>
                    )}
                  </form>
                </div>
                )
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

      {/* 2. PM UCHUN TUGATILGAN ISH HUJJATINI TOPSHIRISH MODALI */}
      {completionModalItem && (
        <div className="modal-overlay" onClick={() => setCompletionModalItem(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 540, width: "95%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle">
              <div className="row middle" style={{ gap: 8 }}>
                <span style={{ fontSize: 20 }}>📁</span>
                <strong>Tugatilgan ish hisobotini topshirish</strong>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => setCompletionModalItem(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitCompletion}>
              <div className="modal-body" style={{ padding: 20 }}>
                <div style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>
                  Buyurtma raqami: <strong>{completionModalItem.request_no}</strong> ({completionModalItem.system_name})
                </div>

                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: 6,
                    padding: 12,
                    marginBottom: 16,
                    fontSize: 12.5,
                    color: "#166534",
                  }}
                >
                  ℹ️ Bajarilgan ish bo'yicha hisobot hujjati (Word, PDF, Excel) yoki natija skrinshotini (PNG, JPG) yuklang. Boshqarma ko'rib chiqib tasdiqlagach, buyurtma yakunlanadi.
                </div>

                {completionError && <ErrorMsg error={completionError} />}

                <div className="field" style={{ marginBottom: 14 }}>
                  <label style={{ fontWeight: 600, fontSize: 13 }}>
                    Tugatilgan ish hujjati / Skrinshot (fayl yoki rasm)
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => setCompletionFile(e.target.files?.[0] || null)}
                  />
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                    Word (.docx, .doc), PDF, Excel, Rasmlar (PNG, JPG, WEBP). Maksimal: 20 MB
                  </div>
                </div>

                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 13 }}>
                    Bajarilgan ish bo'yicha hisobot izohi
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Qanday ishlar amalga oshirildi, qaysi modullar yangilandi va sinov natijalari..."
                    value={completionNote}
                    onChange={(e) => setCompletionNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer row end" style={{ gap: 10, padding: "12px 20px" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setCompletionModalItem(null)}
                  disabled={completionSubmitting}
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={completionSubmitting}
                >
                  {completionSubmitting ? "Topshirilmoqda..." : "Topshirish (Boshqarma tasdig'iga)"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. BOSHQARMA UCHUN KAMCHILIK / XATOLIK BILAN QAYTARISH MODALI */}
      {rejectModalItem && (
        <div className="modal-overlay" onClick={() => setRejectModalItem(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 520, width: "95%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle">
              <div className="row middle" style={{ gap: 8 }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <strong>Kamchilik / Xatolik sababli qayta ishlashga qaytarish</strong>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => setRejectModalItem(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleClientReject}>
              <div className="modal-body" style={{ padding: 20 }}>
                <div style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>
                  Buyurtma raqami: <strong>{rejectModalItem.request_no}</strong> ({rejectModalItem.system_name})
                </div>

                <div
                  style={{
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    borderRadius: 6,
                    padding: 12,
                    marginBottom: 14,
                    fontSize: 12.5,
                    color: "#92400e",
                  }}
                >
                  Buyurtma holati «Jarayonda» holatiga qaytariladi va loyiha menejeri hamda dasturchi ko'rsatilgan kamchiliklarni bartaraf etishadi.
                </div>

                {rejectError && <ErrorMsg error={rejectError} />}

                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 13 }}>
                    Aniqlangan kamchilik yoki xatolik tavsifi *
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Qaysi qismda xatolik aniqlandi yoki nimani qo'shimcha to'g'rilash kerak..."
                    value={rejectFeedbackNote}
                    onChange={(e) => setRejectFeedbackNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer row end" style={{ gap: 10, padding: "12px 20px" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setRejectModalItem(null)}
                  disabled={rejectSubmitting}
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn btn-warning"
                  disabled={rejectSubmitting || !rejectFeedbackNote.trim()}
                >
                  {rejectSubmitting ? "Qaytarilmoqda..." : "Qayta ishlashga qaytarish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. BOSHQARMA UCHUN YANGI TZ VERSIYASINI YUBORISH MODALI */}
      {uploadVersionModalItem && (
        <div className="modal-overlay" onClick={() => setUploadVersionModalItem(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 580, width: "95%", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle">
              <div className="row middle" style={{ gap: 8 }}>
                <span style={{ fontSize: 20 }}>📤</span>
                <strong>{tx("orders.upload_version_title")}</strong>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => setUploadVersionModalItem(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadVersionSubmit}>
              <div className="modal-body" style={{ padding: 20 }}>
                <div style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>
                  Buyurtma raqami: <strong>{uploadVersionModalItem.request_no}</strong> ({uploadVersionModalItem.system_name})
                  <span className="badge" style={{ marginLeft: 8, background: "#4f46e5", color: "#fff", fontSize: 11 }}>
                    Hozirgi: v{uploadVersionModalItem.version || 1}
                  </span>
                </div>

                <div
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: 6,
                    padding: 12,
                    marginBottom: 14,
                    fontSize: 12.5,
                    color: "#1e40af",
                    lineHeight: 1.5,
                  }}
                >
                  💡 {tx("orders.upload_version_note")}
                </div>

                {versionError && <ErrorMsg error={versionError} />}

                <div className="field" style={{ marginBottom: 14 }}>
                  <label style={{ fontWeight: 600, fontSize: 13 }}>
                    {tx("orders.tz_file_label")} *
                  </label>
                  <input
                    type="file"
                    required
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => setVersionFile(e.target.files?.[0] || null)}
                  />
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                    PDF, Word (.docx, .doc), Excel, Arxiv yoki Skrinshotlar. Maksimal: 20 MB
                  </div>
                </div>

                <div className="field" style={{ marginBottom: 14 }}>
                  <label style={{ fontWeight: 600, fontSize: 13 }}>
                    {tx("orders.change_note_label")} *
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder={tx("orders.change_note_placeholder")}
                    value={versionChangeNote}
                    onChange={(e) => setVersionChangeNote(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 13 }}>
                    {tx("orders.requested_change_label")}
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Talab qilinayotgan o'zgartirishlar bo'yicha yangilangan batafsil tavsif..."
                    value={versionRequestedChange}
                    onChange={(e) => setVersionRequestedChange(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer row end" style={{ gap: 10, padding: "12px 20px" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setUploadVersionModalItem(null)}
                  disabled={versionSubmitting}
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={versionSubmitting || !versionFile || !versionChangeNote.trim()}
                >
                  {versionSubmitting ? "Yuborilmoqda..." : "Yuborish (PM ko'rib chiqishi uchun)"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. PM UCHUN YANGI TZ VERSIYASINI TASDIQLASH MODALI */}
      {approveVersionModalItem && (
        <div className="modal-overlay" onClick={() => setApproveVersionModalItem(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 580, width: "95%", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle">
              <div className="row middle" style={{ gap: 8 }}>
                <span style={{ fontSize: 20 }}>✅</span>
                <strong>{tx("orders.approve_version_title")}</strong>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => setApproveVersionModalItem(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleApproveVersionSubmit}>
              <div className="modal-body" style={{ padding: 20 }}>
                <div style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>
                  Buyurtma: <strong>{approveVersionModalItem.request_no}</strong> • Tasdiqlanayotgan versiya:{" "}
                  <strong style={{ color: "#16a34a" }}>v{approveVersionTarget || approveVersionModalItem.pending_version?.version || "yangi"}</strong>
                </div>

                <div
                  style={{
                    background: "#ecfdf5",
                    border: "1.5px solid #86efac",
                    borderRadius: 6,
                    padding: 12,
                    marginBottom: 14,
                    fontSize: 12.5,
                    color: "#166534",
                    lineHeight: 1.5,
                  }}
                >
                  ⚠️ <strong>Eslatma:</strong> Ushbu versiyani tasdiqlaganingizda:
                  <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                    <li>Eski versiyadagi TZ <strong>bekor qilinadi (atmen bo'ladi)</strong>;</li>
                    <li>Loyiha to'liq <strong>yangi TZ hujjatiga o'tkaziladi</strong>.</li>
                  </ul>
                </div>

                {approveError && <ErrorMsg error={approveError} />}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
                  <div className="field">
                    <label style={{ fontWeight: 600, fontSize: 12 }}>Qanchada tugashi (PM bahosi)</label>
                    <input
                      type="text"
                      placeholder="masalan: 10 ish kuni, 2 hafta"
                      value={approveEstimatedDuration}
                      onChange={(e) => setApproveEstimatedDuration(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label style={{ fontWeight: 600, fontSize: 12 }}>PM belgilagan yangi muddat</label>
                    <input
                      type="date"
                      value={approveDeadline}
                      onChange={(e) => setApproveDeadline(e.target.value)}
                    />
                  </div>
                </div>

                <div className="field" style={{ marginBottom: 12 }}>
                  <label style={{ fontWeight: 600, fontSize: 12 }}>Mas'ul dasturchi (Ijrochi)</label>
                  <select
                    value={approveDeveloper || ""}
                    onChange={(e) => setApproveDeveloper(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">-- O'zgarishsiz qoldirish / Dasturchini tanlang --</option>
                    {developersList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.full_name} ({d.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12 }}>
                    PM qaror izohi va ko'rsatmalari
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Yangi versiya qabul qilinganligi, kiritilgan tuzatishlar yoki topshiriqlar bo'yicha izoh..."
                    value={approveDecisionNote}
                    onChange={(e) => setApproveDecisionNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer row end" style={{ gap: 10, padding: "12px 20px" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setApproveVersionModalItem(null)}
                  disabled={approveSubmitting}
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn btn-ok"
                  disabled={approveSubmitting}
                >
                  {approveSubmitting ? "Tasdiqlanmoqda..." : "✓ Tasdiqlash va yangi TZ ga o'tkazish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. PM UCHUN YANGI TZ VERSIYASINI RAD ETISH MODALI */}
      {rejectVersionModalItem && (
        <div className="modal-overlay" onClick={() => setRejectVersionModalItem(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 520, width: "95%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle">
              <div className="row middle" style={{ gap: 8 }}>
                <span style={{ fontSize: 20 }}>✕</span>
                <strong>{tx("orders.reject_version_title")}</strong>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => setRejectVersionModalItem(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleRejectVersionSubmit}>
              <div className="modal-body" style={{ padding: 20 }}>
                <div style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>
                  Buyurtma: <strong>{rejectVersionModalItem.request_no}</strong> • Versiya:{" "}
                  <strong style={{ color: "#dc2626" }}>v{rejectVersionTarget || rejectVersionModalItem.pending_version?.version || "yangi"}</strong>
                </div>

                <div
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: 6,
                    padding: 12,
                    marginBottom: 14,
                    fontSize: 12.5,
                    color: "#991b1b",
                  }}
                >
                  Ushbu versiya rad etiladi. Loyiha avvalgi tasdiqlangan TZ versiyasi bo'yicha o'zgarishsiz davom etadi.
                </div>

                {rejectVersionError && <ErrorMsg error={rejectVersionError} />}

                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 13 }}>
                    {tx("orders.reject_version_reason_label")} *
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder={tx("orders.reject_version_reason_placeholder")}
                    value={rejectVersionReason}
                    onChange={(e) => setRejectVersionReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer row end" style={{ gap: 10, padding: "12px 20px" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setRejectVersionModalItem(null)}
                  disabled={rejectVersionSubmitting}
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={rejectVersionSubmitting || !rejectVersionReason.trim()}
                >
                  {rejectVersionSubmitting ? "Rad etilmoqda..." : "✕ Versiyani rad etish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
