import type { ChangeRequestItem } from "@/api/types";
import { ORDER_STATUS_CONFIG } from "./OrderBadges";
import { tx } from "@/i18n";

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
          <span>{tx("orders.stepper_rad_etilgan")}</span>
        </div>
        {item.pm_notes && (
          <div style={{ marginTop: 6, fontSize: 12.5, color: "#7f1d1d", whiteSpace: "pre-wrap" }}>
            <strong>{tx("orders.stepper_sabab_izoh")}</strong> {item.pm_notes}
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
      title: tx("orders.step_yuborildi"),
      icon: "📝",
      sub: item.department || item.created_by_department || "—",
    },
    {
      num: 2,
      title: tx("orders.step_pm_korib_chiqdi"),
      icon: "📋",
      sub: item.assigned_pm_name ? `PM: ${item.assigned_pm_name}` : tx("orders.step_loyiha_menejeri"),
    },
    {
      num: 3,
      title: tx("orders.step_dasturchiga_berildi"),
      icon: "💻",
      sub: item.assigned_developer_name ? `👨‍💻 ${item.assigned_developer_name}` : tx("orders.step_ijrochi_tayinlanmoqda"),
    },
    {
      num: 4,
      title: tx("orders.step_jarayonda"),
      icon: "⚙️",
      sub: item.pm_estimated_duration ? `⏱ ${item.pm_estimated_duration}` : tx("orders.step_amaliy_ishlab_chiqish"),
    },
    {
      num: 5,
      title: tx("orders.step_testda"),
      icon: "🧪",
      sub: tx("orders.step_sinov_tekshirish"),
    },
    {
      num: 6,
      title: tx("orders.step_tasdiqlashda"),
      icon: "📑",
      sub: tx("orders.step_boshqarma_tasdigi"),
    },
    {
      num: 7,
      title: tx("orders.step_bajarildi"),
      icon: "✅",
      sub: tx("orders.step_qabul_qilindi_yopildi"),
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
          📌 {tx("orders.stepper_sarlavha")}:{" "}
          <span style={{ color: ORDER_STATUS_CONFIG[item.status]?.color }}>
            {item.status_display || ORDER_STATUS_CONFIG[item.status]?.label}
          </span>
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--brand, #2563eb)" }}>
          {tx("orders.stepper_bosqich")} {Math.min(currentStep, 6)} / 6
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
