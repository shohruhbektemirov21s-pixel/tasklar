/**
 * TeamFlow — Bildirishnomalar Markazi (Notification Center).
 *
 * Professional SaaS dizayn talablari:
 * - Header: "Bildirishnomalar", "✓ Barchasini o'qilgan deb belgilash"
 * - Tablar: Barchasi, O'qilmagan, Muhim
 * - Har bir bildirishnoma: Icon, Title, Short message, Time, Unread indicator
 * - O'qilmaganlar juda yumshoq ajratilgan fon (subtle highlight) bilan
 * - Ortiqcha katta kartalarsiz, ixcham va toza ro'yxat
 */
import { useMemo, useState } from "react";
import { api } from "@/api/client";
import type { AppNotification } from "@/api/types";
import {
  IconBell,
  IconChat,
  IconCheck,
  IconClock,
  IconOrder,
  IconReview,
  IconTasks,
  IconUserPlus,
} from "@/components/icons";
import { EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { useRealtime } from "@/realtime/RealtimeContext";
import { tx } from "@/i18n";
import NotificationModal from "@/components/NotificationModal";
import { Button } from "@/components/Button";

type TabKey = "all" | "unread" | "important";

function KindIcon({ kind }: { kind: string }) {
  let glyph = <IconBell size={16} />;
  let iconBg = "var(--surface-3)";
  let iconColor = "var(--muted)";

  if (kind.startsWith("order.")) {
    glyph = <IconOrder size={16} />;
    iconBg = "rgba(53, 98, 255, 0.12)";
    iconColor = "#3562ff";
  } else if (kind === "task.comment" || kind.startsWith("chat.")) {
    glyph = <IconChat size={16} />;
    iconBg = "rgba(139, 92, 246, 0.12)";
    iconColor = "#8b5cf6";
  } else if (kind === "task.review") {
    glyph = <IconReview size={16} />;
    iconBg = "rgba(245, 158, 11, 0.14)";
    iconColor = "#f59e0b";
  } else if (kind === "task.decided" || kind.includes("approve")) {
    glyph = <IconCheck size={16} />;
    iconBg = "rgba(16, 185, 129, 0.14)";
    iconColor = "#10b981";
  } else if (kind === "project.deadline" || kind.includes("due")) {
    glyph = <IconClock size={16} />;
    iconBg = "rgba(239, 68, 68, 0.12)";
    iconColor = "#ef4444";
  } else if (kind === "join.request") {
    glyph = <IconUserPlus size={16} />;
    iconBg = "rgba(53, 98, 255, 0.12)";
    iconColor = "#3562ff";
  } else if (kind.startsWith("task.")) {
    glyph = <IconTasks size={16} />;
    iconBg = "rgba(53, 98, 255, 0.12)";
    iconColor = "#3562ff";
  }

  return (
    <span
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: iconBg,
        color: iconColor,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {glyph}
    </span>
  );
}

export default function Notifications() {
  const { notifications, unread, markRead, markAllRead, reload } = useRealtime();
  const [tab, setTab] = useState<TabKey>("all");
  const [selectedNotif, setSelectedNotif] = useState<AppNotification | null>(null);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length || unread,
    [notifications, unread]
  );

  const importantCount = useMemo(
    () =>
      notifications.filter(
        (n) =>
          n.kind.includes("deadline") ||
          n.kind === "task.review" ||
          n.kind === "order.status" ||
          String(n.kind).includes("reject")
      ).length,
    [notifications]
  );

  const tabs: { key: TabKey; label: string; count?: number }[] = useMemo(
    () => [
      { key: "all", label: tx("notifications.barchasi", undefined, "Barchasi"), count: notifications.length },
      { key: "unread", label: tx("notifications.oqilmaganlar", undefined, "O'qilmagan"), count: unreadCount },
      { key: "important", label: tx("notifications.muhim", undefined, "Muhim"), count: importantCount },
    ],
    [notifications.length, unreadCount, importantCount]
  );

  const items = useMemo(() => {
    return notifications.filter((n) => {
      if (tab === "unread") return !n.is_read;
      if (tab === "important") {
        return (
          n.kind.includes("deadline") ||
          n.kind === "task.review" ||
          n.kind === "order.status" ||
          String(n.kind).includes("reject")
        );
      }
      return true;
    });
  }, [notifications, tab]);

  function handleOpen(n: AppNotification) {
    if (!n.is_read) void markRead(n.id);
    setSelectedNotif(n);
  }

  async function clearRead() {
    await api.post("/notifications/clear/", {});
    await reload();
  }

  return (
    <div className="content" style={{ maxWidth: 860, margin: "0 auto" }}>
      <PageHeader
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>{tx("common.bildirishnomalar", undefined, "Bildirishnomalar")}</span>
            {unreadCount > 0 && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  background: "var(--accent)",
                  color: "#ffffff",
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                {unreadCount}
              </span>
            )}
          </div>
        }
        subtitle={tx("notifications.sahifa_izohi", undefined, "Barcha yangiliklar, vazifalar va muhim xabarlar markazi")}
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {unreadCount > 0 && (
              <Button
                variant="primary" size="sm"
                onClick={() => void markAllRead()}
              >
                <span>✓</span>
                <span>{tx("notifications.hammasini_oqilgan_deb_belgilash", undefined, "Barchasini o'qilgan deb belgilash")}</span>
              </Button>
            )}
            <Button
              variant="ghost" size="sm"
              onClick={() => void clearRead()}
              title={tx("notifications.oqilganlarini_tozalash", undefined, "O'qilganlarini tozalash")}
            >
              {tx("notifications.tozalash", undefined, "Tozalash")}
            </Button>
          </div>
        }
      />

      {/* Tabs / Filterlar */}
      <div className="tabs inline" style={{ marginBottom: 16 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <span>{t.label}</span>
            {typeof t.count === "number" && t.count > 0 && <span className="n">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Bildirishnomalar ro'yxati */}
      <div className="table-card-clean" style={{ padding: 0 }}>
        {!items.length ? (
          <EmptyState
            icon="🔕"
            title={tx("notifications.bildirishnoma_yoq", undefined, "Bildirishnomalar mavjud emas")}
            message={
              tab === "unread"
                ? tx("notifications.barcha_xabarlar_oqilgan", undefined, "Barcha bildirishnomalar o'qilgan.")
                : tab === "important"
                ? tx("notifications.muhim_xabar_yoq", undefined, "Hozircha hech qanday muhim bildirishnoma yo'q.")
                : tx("notifications.vazifa_suhbat_yoki_qoshilish_soroviga", undefined, "Yangi voqealar bo'lganda bu yerda ko'rinadi.")
            }
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {items.map((n) => {
              const isUnread = !n.is_read;
              return (
                <div
                  key={n.id}
                  onClick={() => handleOpen(n)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 14,
                    padding: "16px 20px",
                    borderBottom: "1px solid var(--border-muted)",
                    background: isUnread ? "rgba(53, 98, 255, 0.04)" : "transparent",
                    cursor: "pointer",
                    transition: "background 0.12s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = isUnread
                      ? "rgba(53, 98, 255, 0.08)"
                      : "var(--surface-2)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isUnread
                      ? "rgba(53, 98, 255, 0.04)"
                      : "transparent";
                  }}
                >
                  <KindIcon kind={n.kind} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                      <span
                        style={{
                          fontWeight: isUnread ? 700 : 600,
                          fontSize: 14,
                          color: "var(--text)",
                        }}
                      >
                        {n.title}
                      </span>
                      {isUnread && (
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: "var(--accent)",
                            display: "inline-block",
                          }}
                          title="O'qilmagan"
                        />
                      )}
                    </div>

                    {n.body && (
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--muted)",
                          lineHeight: 1.45,
                          maxWidth: "92%",
                        }}
                      >
                        {n.body}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      whiteSpace: "nowrap",
                      paddingTop: 2,
                    }}
                  >
                    {timeAgo(n.created_at)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <NotificationModal
        notification={selectedNotif}
        onClose={() => setSelectedNotif(null)}
      />
    </div>
  );
}
