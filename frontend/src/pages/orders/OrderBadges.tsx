import { tx } from "@/i18n";

export const ORDER_TYPE_CONFIG: Record<
  string,
  { label: string; icon: string; bg: string; color: string; border: string; desc: string }
> = {
  NEW: {
    get label() { return tx("orders.yangi_loyiha"); },
    icon: "🚀",
    bg: "var(--success-soft)",
    color: "var(--success)",
    border: "var(--success-border)",
    get desc() { return tx("orders.type_new_desc"); },
  },
  CONTINUATION: {
    get label() { return tx("orders.davom_ettiriladigan"); },
    icon: "🔄",
    bg: "var(--accent-soft)",
    color: "var(--accent)",
    border: "var(--accent-border)",
    get desc() { return tx("orders.type_continuation_desc"); },
  },
  NEEDS_CLASSIFICATION: {
    get label() { return tx("orders.turlash_kerak"); },
    icon: "🏷️",
    bg: "var(--attention-soft)",
    color: "var(--attention)",
    border: "var(--attention-border)",
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
    bg: "var(--accent-soft)",
    color: "var(--accent)",
    border: "var(--accent-border)",
    step: 0,
    get desc() { return tx("orders.status_draft_desc", undefined, "Hali yuborilmagan qoralama"); },
    icon: "✏️",
  },
  NEW: {
    get label() { return tx("orders.status_yangi_tz", undefined, "Yangi"); },
    bg: "var(--accent-soft)",
    color: "var(--accent)",
    border: "var(--accent-border)",
    step: 1,
    get desc() { return tx("orders.status_new_desc", undefined, "PM ko'rib chiqishi kutilmoqda"); },
    icon: "📥",
  },
  ACCEPTED: {
    get label() { return tx("orders.status_pm_qabul_qildi", undefined, "Qabul qilindi"); },
    bg: "var(--accent-soft)",
    color: "var(--accent)",
    border: "var(--accent-border)",
    step: 2,
    get desc() { return tx("orders.status_accepted_desc", undefined, "PM tomonidan qabul qilindi"); },
    icon: "👍",
  },
  ASSIGNED_TO_DEV: {
    get label() { return tx("orders.status_dasturchiga_berildi", undefined, "Dasturchiga yo'naltirildi"); },
    bg: "var(--attention-soft)",
    color: "var(--attention)",
    border: "var(--attention-border)",
    step: 3,
    get desc() { return tx("orders.status_assigned_dev_desc", undefined, "Dasturchi ijroga kirishdi"); },
    icon: "👨‍💻",
  },
  IN_PROGRESS: {
    get label() { return tx("orders.status_jarayonda", undefined, "Jarayonda"); },
    bg: "var(--attention-soft)",
    color: "var(--attention)",
    border: "var(--attention-border)",
    step: 4,
    get desc() { return tx("orders.status_in_dev_desc", undefined, "Ish jarayonida"); },
    icon: "⚙️",
  },
  IN_DEVELOPMENT: {
    get label() { return tx("orders.status_ish_jarayonida", undefined, "Jarayonda"); },
    bg: "var(--attention-soft)",
    color: "var(--attention)",
    border: "var(--attention-border)",
    step: 4,
    get desc() { return tx("orders.status_in_dev_desc", undefined, "Ish jarayonida"); },
    icon: "⚙️",
  },
  TESTING: {
    get label() { return tx("orders.status_test_tekshiruvda", undefined, "Test qilinmoqda"); },
    bg: "var(--done-soft)",
    color: "var(--done)",
    border: "var(--done-border)",
    step: 5,
    get desc() { return tx("orders.status_testing_desc", undefined, "QA test sinovida"); },
    icon: "🧪",
  },
  READY_FOR_REVIEW: {
    get label() { return tx("orders.status_tasdiq_kutilmoqda", undefined, "Tasdiqlashda"); },
    bg: "var(--accent-soft)",
    color: "var(--accent)",
    border: "var(--accent-border)",
    step: 6,
    get desc() { return tx("orders.status_waiting_client_desc", undefined, "Mijoz/Boshqarma tasdig'i kutilmoqda"); },
    icon: "📬",
  },
  WAITING_CLIENT: {
    get label() { return tx("orders.status_tasdiq_kutilmoqda", undefined, "Tasdiqlashda"); },
    bg: "var(--accent-soft)",
    color: "var(--accent)",
    border: "var(--accent-border)",
    step: 6,
    get desc() { return tx("orders.status_waiting_client_desc", undefined, "Mijoz tasdig'i kutilmoqda"); },
    icon: "📬",
  },
  COMPLETED: {
    get label() { return tx("orders.status_yakunlangan", undefined, "Yakunlangan"); },
    bg: "var(--success-soft)",
    color: "var(--success)",
    border: "var(--success-border)",
    step: 7,
    get desc() { return tx("orders.status_completed_desc", undefined, "To'liq muvaffaqiyatli yakunlandi"); },
    icon: "✅",
  },
  REJECTED: {
    get label() { return tx("orders.status_rad_etilgan", undefined, "Rad etildi"); },
    bg: "var(--danger-soft)",
    color: "var(--danger)",
    border: "var(--danger-border)",
    step: 0,
    get desc() { return tx("orders.status_rejected_desc", undefined, "Talabnoma rad etildi"); },
    icon: "❌",
  },
  CANCELLED: {
    get label() { return tx("orders.status_bekor_qilindi", undefined, "Bekor qilindi"); },
    bg: "var(--surface-2)",
    color: "var(--muted)",
    border: "var(--border)",
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
            color: "var(--attention)",
            background: "var(--attention-soft)",
            padding: "1px 6px",
            borderRadius: 4,
            border: "1px solid var(--attention-border)",
          }}
          title={tx("orders.pending_version_tooltip")}
        >
          {tx("orders.yangi_versiya_kutilmoqda")}
        </span>
      )}
    </div>
  );
}
