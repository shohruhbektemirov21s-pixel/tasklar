import { tx } from "@/i18n";

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
    get desc() { return tx("orders.type_new_desc"); },
  },
  CONTINUATION: {
    get label() { return tx("orders.davom_ettiriladigan"); },
    icon: "🔄",
    bg: "rgba(37, 99, 235, 0.12)",
    color: "#2563eb",
    border: "rgba(37, 99, 235, 0.3)",
    get desc() { return tx("orders.type_continuation_desc"); },
  },
  NEEDS_CLASSIFICATION: {
    get label() { return tx("orders.turlash_kerak"); },
    icon: "🏷️",
    bg: "rgba(217, 119, 6, 0.12)",
    color: "#d97706",
    border: "rgba(217, 119, 6, 0.3)",
    get desc() { return tx("orders.type_needs_classification_desc"); },
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
        lineHeight: 1.2,
      }}
      title={cfg.desc}
    >
      <span>{cfg.icon}</span>
      <span>{cfg.label}</span>
    </span>
  );
}

export const ORDER_STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; color: string; border: string; step: number; desc: string; icon: string }
> = {
  DRAFT: {
    get label() { return tx("orders.status_qoralama", undefined, "Qoralama"); },
    bg: "rgba(106, 141, 255, 0.12)",
    color: "#6a8dff",
    border: "rgba(106, 141, 255, 0.25)",
    step: 0,
    get desc() { return tx("orders.status_draft_desc", undefined, "Hali yuborilmagan qoralama"); },
    icon: "✏️",
  },
  NEW: {
    get label() { return tx("orders.status_yangi_tz", undefined, "Yangi"); },
    bg: "rgba(106, 141, 255, 0.14)",
    color: "#3562ff",
    border: "rgba(53, 98, 255, 0.3)",
    step: 1,
    get desc() { return tx("orders.status_new_desc", undefined, "PM ko'rib chiqishi kutilmoqda"); },
    icon: "📥",
  },
  ACCEPTED: {
    get label() { return tx("orders.status_pm_qabul_qildi", undefined, "Qabul qilindi"); },
    bg: "rgba(37, 99, 235, 0.12)",
    color: "#2563eb",
    border: "rgba(37, 99, 235, 0.25)",
    step: 2,
    get desc() { return tx("orders.status_accepted_desc", undefined, "PM tomonidan qabul qilindi"); },
    icon: "👍",
  },
  ASSIGNED_TO_DEV: {
    get label() { return tx("orders.status_dasturchiga_berildi", undefined, "Dasturchiga yo'naltirildi"); },
    bg: "rgba(234, 88, 12, 0.12)",
    color: "#ea580c",
    border: "rgba(234, 88, 12, 0.25)",
    step: 3,
    get desc() { return tx("orders.status_assigned_dev_desc", undefined, "Dasturchi ijroga kirishdi"); },
    icon: "👨‍💻",
  },
  IN_PROGRESS: {
    get label() { return tx("orders.status_jarayonda", undefined, "Jarayonda"); },
    bg: "rgba(245, 158, 11, 0.14)",
    color: "#f59e0b",
    border: "rgba(245, 158, 11, 0.3)",
    step: 4,
    get desc() { return tx("orders.status_in_dev_desc", undefined, "Ish jarayonida"); },
    icon: "⚙️",
  },
  IN_DEVELOPMENT: {
    get label() { return tx("orders.status_ish_jarayonida", undefined, "Jarayonda"); },
    bg: "rgba(245, 158, 11, 0.14)",
    color: "#f59e0b",
    border: "rgba(245, 158, 11, 0.3)",
    step: 4,
    get desc() { return tx("orders.status_in_dev_desc", undefined, "Ish jarayonida"); },
    icon: "⚙️",
  },
  TESTING: {
    get label() { return tx("orders.status_test_tekshiruvda", undefined, "Test qilinmoqda"); },
    bg: "rgba(139, 92, 246, 0.12)",
    color: "#8b5cf6",
    border: "rgba(139, 92, 246, 0.25)",
    step: 5,
    get desc() { return tx("orders.status_testing_desc", undefined, "QA test sinovida"); },
    icon: "🧪",
  },
  READY_FOR_REVIEW: {
    get label() { return tx("orders.status_tasdiq_kutilmoqda", undefined, "Tasdiqlashda"); },
    bg: "rgba(106, 141, 255, 0.14)",
    color: "#6255e8",
    border: "rgba(106, 141, 255, 0.3)",
    step: 6,
    get desc() { return tx("orders.status_waiting_client_desc", undefined, "Mijoz/Boshqarma tasdig'i kutilmoqda"); },
    icon: "📬",
  },
  WAITING_CLIENT: {
    get label() { return tx("orders.status_tasdiq_kutilmoqda", undefined, "Tasdiqlashda"); },
    bg: "rgba(106, 141, 255, 0.14)",
    color: "#6255e8",
    border: "rgba(106, 141, 255, 0.3)",
    step: 6,
    get desc() { return tx("orders.status_waiting_client_desc", undefined, "Mijoz tasdig'i kutilmoqda"); },
    icon: "📬",
  },
  COMPLETED: {
    get label() { return tx("orders.status_yakunlangan", undefined, "Yakunlangan"); },
    bg: "rgba(16, 185, 129, 0.14)",
    color: "#10b981",
    border: "rgba(16, 185, 129, 0.3)",
    step: 7,
    get desc() { return tx("orders.status_completed_desc", undefined, "To'liq muvaffaqiyatli yakunlandi"); },
    icon: "✅",
  },
  REJECTED: {
    get label() { return tx("orders.status_rad_etilgan", undefined, "Rad etildi"); },
    bg: "rgba(239, 68, 68, 0.12)",
    color: "#ef4444",
    border: "rgba(239, 68, 68, 0.25)",
    step: 0,
    get desc() { return tx("orders.status_rejected_desc", undefined, "Talabnoma rad etildi"); },
    icon: "❌",
  },
  CANCELLED: {
    get label() { return tx("orders.status_bekor_qilindi", undefined, "Bekor qilindi"); },
    bg: "rgba(100, 116, 139, 0.12)",
    color: "#64748b",
    border: "rgba(100, 116, 139, 0.25)",
    step: 0,
    get desc() { return tx("orders.status_cancelled_desc", undefined, "Bekor qilingan"); },
    icon: "🚫",
  },
};

export function OrderStatusBadge({
  status,
  label,
  hasPendingVersion = false,
}: {
  status?: string;
  label?: string;
  hasPendingVersion?: boolean;
}) {
  const cfg = ORDER_STATUS_CONFIG[status || "NEW"] || ORDER_STATUS_CONFIG.NEW;
  const displayLabel = label || cfg.label;
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "3px 10px",
          borderRadius: 9999,
          fontSize: 11.5,
          fontWeight: 600,
          background: cfg.bg,
          color: cfg.color,
          border: `1px solid ${cfg.border}`,
          lineHeight: 1.25,
        }}
        title={cfg.desc}
      >
        <span>{cfg.icon}</span>
        <span>{displayLabel}</span>
      </span>
      {hasPendingVersion && (
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            color: "#b45309",
            background: "#fef3c7",
            padding: "1px 6px",
            borderRadius: 4,
            border: "1px solid #fde68a",
          }}
          title={tx("orders.pending_version_tooltip")}
        >
          {tx("orders.yangi_versiya_kutilmoqda")}
        </span>
      )}
    </div>
  );
}
