import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import type { AppNotification } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import {
  IconBell, IconChat, IconCheck, IconClock, IconOrder, IconReview, IconTasks, IconUserPlus,
} from "@/components/icons";
import { Card, Empty, safePath, timeAgo } from "@/components/ui";
import { useRealtime } from "@/realtime/RealtimeContext";
import { tx } from "@/i18n";
import NotificationModal from "@/components/NotificationModal";

/**
 * Kesimlar - dizayndagi tablar.
 *
 * Filtr mijozda ishlaydi: ro'yxat `RealtimeContext` da allaqachon yuklangan
 * va jonli yangilanadi, ya'ni har tab bosilganda serverga qayta borish
 * ortiqcha bo'lardi.
 */
type Tab = "all" | "unread" | "tasks" | "comments" | "orders";

/** Turga qarab belgi - dizaynda har qatorning chapida rangli kvadratcha turadi. */
function KindIcon({ kind }: { kind: string }) {
  const glyph =
    kind.startsWith("order.") ? <IconOrder size={16} />
    : kind === "task.comment" ? <IconChat size={16} />
    : kind === "task.review" ? <IconReview size={16} />
    : kind === "task.decided" ? <IconCheck size={16} />
    : kind === "chat.message" || kind === "chat.direct" ? <IconChat size={16} />
    : kind === "join.request" ? <IconUserPlus size={16} />
    : kind === "project.deadline" ? <IconClock size={16} />
    : kind.startsWith("task.") ? <IconTasks size={16} />
    : <IconBell size={16} />;
  return <span className="notif-ico">{glyph}</span>;
}

export default function Notifications() {
  const { notifications, unread, connected, markRead, markAllRead, reload } = useRealtime();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("all");
  const [selectedNotif, setSelectedNotif] = useState<AppNotification | null>(null);
  const nav = useNavigate();

  const tabs: [Tab, string][] = useMemo(() => {
    const list: [Tab, string][] = [
      ["all", tx("notifications.barchasi")],
      ["unread", tx("notifications.oqilmaganlar")],
      ["tasks", tx("common.vazifalar")],
      ["comments", tx("notifications.izohlar")],
    ];
    if (user?.can_access_orders || user?.is_sohaviy_boshqarma || user?.is_platform_admin) {
      list.push(["orders", "Buyurtmalar"]);
    }
    return list;
  }, [user]);

  const items = useMemo(() => notifications.filter((n) => {
    if (tab === "unread") return !n.is_read;
    // «Vazifalar» - ish oqimi (biriktirildi, tekshiruv, natija). Izoh alohida
    // kesimda turadi, aks holda ikkovi bir-birini ko'mib tashlaydi.
    if (tab === "tasks") return n.kind.startsWith("task.") && n.kind !== "task.comment";
    if (tab === "comments") return n.kind === "task.comment";
    if (tab === "orders") return n.kind.startsWith("order.");
    return true;
  }), [notifications, tab]);

  function open(n: AppNotification) {
    if (!n.is_read) void markRead(n.id);
    setSelectedNotif(n);
  }

  async function clearRead() {
    await api.post("/notifications/clear/", {});
    await reload();
  }

  return (
    <>
      <PageHead
        title={<strong>{tx("common.bildirishnomalar")}</strong>}
        subtitle={tx("notifications.sahifa_tavsifi")}
        actions={
          <>
            <span className={`live-tag ${connected ? "on" : ""}`}>
              {connected ? "jonli" : "ulanmoqda…"}
            </span>
            {!!unread && (
              <button className="btn btn-sm" onClick={() => void markAllRead()}>
                {tx("notifications.hammasini_oqilgan_deb_belgilash")}
              </button>
            )}
            <button className="btn btn-sm btn-ghost" onClick={() => void clearRead()}>
              {tx("notifications.oqilganlarini_tozalash")}
            </button>
          </>
        }
        tabs={tabs.map(([v, l]) => (
          <button key={v} type="button" className={`tab ${tab === v ? "active" : ""}`}
                  onClick={() => setTab(v)}>
            {l}
            {v === "unread" && !!unread && <span className="n">{unread}</span>}
          </button>
        ))}
      />

      <div className="content" style={{ maxWidth: 980 }}>
        {!items.length ? (
          <Card>
            <Empty icon="🔕" title={tx("notifications.bildirishnoma_yoq")}
                   text={tab === "all"
                     ? tx("notifications.vazifa_suhbat_yoki_qoshilish_soroviga")
                     : tx("notifications.bu_kesimda_hozircha_hech_narsa")} />
          </Card>
        ) : (
          <Card padded={false}>
            <div className="card-list">
              {items.map((n) => (
                <button key={n.id} className={`notif wide ${n.is_read ? "" : "unread"}`}
                        onClick={() => open(n)}>
                  <KindIcon kind={n.kind} />
                  <span className="notif-text">
                    <span className="row" style={{ gap: 8 }}>
                      <strong>{n.title}</strong>
                      {!n.is_read && <span className="badge badge-danger">{tx("notifications.yangi")}</span>}
                    </span>
                    {n.body && <span className="muted">{n.body}</span>}
                  </span>
                  <span className="notif-time">{timeAgo(n.created_at)}</span>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>

      <NotificationModal
        notification={selectedNotif}
        onClose={() => setSelectedNotif(null)}
      />
    </>
  );
}
