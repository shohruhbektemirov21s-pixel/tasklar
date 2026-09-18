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
  MAINTENANCE: {
    get label() { return tx("orders.texnik_xizmat"); },
    icon: "🛠️",
    bg: "rgba(100, 116, 139, 0.12)",
    color: "#475569",
    border: "rgba(100, 116, 139, 0.3)",
    get desc() { return tx("orders.type_maintenance_desc"); },
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
    get label() { return tx("orders.status_qoralama"); },
    bg: "#f8fafc",
    color: "#64748b",
    border: "#cbd5e1",
    step: 0,
    get desc() { return tx("orders.status_draft_desc"); },
    icon: "✏️",
  },
  NEW: {
    get label() { return tx("orders.status_yangi_tz"); },
    bg: "#eff6ff",
    color: "#1d4ed8",
    border: "#bfdbfe",
    step: 1,
    get desc() { return tx("orders.status_new_desc"); },
    icon: "📥",
  },
  ACCEPTED: {
    get label() { return tx("orders.status_pm_qabul_qildi"); },
    bg: "#f0fdf4",
    color: "#15803d",
    border: "#bbf7d0",
    step: 2,
    get desc() { return tx("orders.status_accepted_desc"); },
    icon: "👍",
  },
  ASSIGNED_TO_DEV: {
    get label() { return tx("orders.status_dasturchiga_berildi"); },
    bg: "#e0e7ff",
    color: "#4338ca",
    border: "#c7d2fe",
    step: 3,
    get desc() { return tx("orders.status_assigned_dev_desc"); },
    icon: "👨‍💻",
  },
  IN_DEVELOPMENT: {
    get label() { return tx("orders.status_ish_jarayonida"); },
    bg: "#fef3c7",
    color: "#b45309",
    border: "#fde68a",
    step: 4,
    get desc() { return tx("orders.status_in_dev_desc"); },
    icon: "⚙️",
  },
  TESTING: {
    get label() { return tx("orders.status_test_tekshiruvda"); },
    bg: "#ede9fe",
    color: "#6d28d9",
    border: "#ddd6fe",
    step: 5,
    get desc() { return tx("orders.status_testing_desc"); },
    icon: "🧪",
  },
  WAITING_CLIENT: {
    get label() { return tx("orders.status_tasdiq_kutilmoqda"); },
    bg: "#fff7ed",
    color: "#c2410c",
    border: "#fed7aa",
    step: 6,
    get desc() { return tx("orders.status_waiting_client_desc"); },
    icon: "📬",
  },
  COMPLETED: {
    get label() { return tx("orders.status_yakunlangan"); },
    bg: "#ecfdf5",
    color: "#047857",
    border: "#a7f3d0",
    step: 7,
    get desc() { return tx("orders.status_completed_desc"); },
    icon: "✅",
  },
  REJECTED: {
    get label() { return tx("orders.status_rad_etilgan"); },
    bg: "#fef2f2",
    color: "#b91c1c",
    border: "#fecaca",
    step: 0,
    get desc() { return tx("orders.status_rejected_desc"); },
    icon: "❌",
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
          padding: "3px 9px",
          borderRadius: 6,
          fontSize: 12,
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
