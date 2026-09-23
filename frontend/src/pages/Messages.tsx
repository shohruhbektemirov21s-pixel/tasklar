/**
 * Shaxsiy yozishmalar - odamni email yoki ism bo'yicha topib, to'g'ridan-to'g'ri yozish.
 *
 * Chapda: qidiruv va ochiq suhbatlar ro'yxati (ikkalasi ham backenddan).
 * O'ngda: tanlangan odam bilan real vaqtdagi suhbat.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import type { Conversation, UserBrief } from "@/api/types";
import Chat from "@/components/Chat";
import UserSearch from "@/components/UserSearch";
import { Avatar, EmptyState, PageHeader, SpecialtyTag, timeAgo } from "@/components/ui";
import { useRealtime } from "@/realtime/RealtimeContext";
import { toMessages, toUser, useEntityId, useGo } from "@/nav";
import { tx } from "@/i18n";
import { Button } from "@/components/Button";

export default function Messages() {
  const userId = useEntityId("user");
  const go = useGo();
  const { subscribe } = useRealtime();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [partner, setPartner] = useState<UserBrief | null>(null);

  const activeId = userId ? Number(userId) : 0;

  const loadConversations = useCallback(async () => {
    try {
      setConversations(await api.get<Conversation[]>("/chat/messages/conversations/"));
    } catch { /* ro'yxat yuklanmasa ham yozish ishlayveradi */ }
  }, []);

  useEffect(() => { void loadConversations(); }, [loadConversations]);

  useEffect(() => subscribe((data) => {
    if (data.event === "notification" && data.notification?.kind === "chat.direct") {
      void loadConversations();
    }
  }), [subscribe, loadConversations]);

  useEffect(() => {
    if (!activeId) {
      setPartner(null);
      return;
    }
    const known = conversations.find((c) => c.partner.id === activeId);
    if (known) {
      setPartner(known.partner);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const u = await api.get<UserBrief>(`/users/${activeId}/`);
        if (alive) setPartner(u);
      } catch {
        if (alive) setPartner(null);
      }
    })();
    return () => { alive = false; };
  }, [activeId, conversations]);

  const search = useCallback(
    (q: string) => api.get<UserBrief[]>("/chat/messages/people/", { q }),
    []
  );

  return (
    <div className="content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader
        title={tx("messages.xabarlar")}
        subtitle="Jamoa a'zolari bilan tezkor shaxsiy muloqot"
        breadcrumbs={[
          { label: tx("nav.bosh_sahifa") || "Bosh sahifa", href: "/" },
          { label: tx("messages.xabarlar") },
        ]}
      />

      <div className="tf-messages-card">
        {/* Chap panel: Suhbatlar ro'yxati va qidiruv */}
        <div className={`tf-chat-sidebar ${partner ? "hide-mobile" : ""}`}>
          <div className="tf-chat-sidebar-search">
            <UserSearch
              search={search}
              onPick={(u) => go(toMessages(u.id))}
              activeId={activeId}
              placeholder={tx("common.email_yoki_ism_boyicha_qidiring")}
              emptyText={tx("common.hech_kim_topilmadi")}
            />
          </div>

          <div className="tf-chat-sidebar-list">
            {!conversations.length && (
              <div className="muted center" style={{ padding: "30px 16px", fontSize: 13, textAlign: "center" }}>
                {tx("messages.hali_yozishma_yoq")}
              </div>
            )}
            {conversations.map((c) => {
              const isActive = activeId === c.partner.id;
              return (
                <button
                  key={c.partner.id}
                  className={`tf-conv-item ${isActive ? "active" : ""}`}
                  onClick={() => go(toMessages(c.partner.id))}
                >
                  <Avatar user={c.partner} size="sm" />
                  <div className="tf-conv-info">
                    <div className="tf-conv-header">
                      <span className="tf-conv-name">{c.partner.full_name}</span>
                      <span className="tf-conv-time">{timeAgo(c.last_at)}</span>
                    </div>
                    <span className="tf-conv-snippet">
                      {c.outgoing && (tx("messages.siz") || "Siz: ")}{c.last_message}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* O'ng panel: Tanlangan suhbat yoki bo'sh holat */}
        <div className={`tf-chat-main ${!partner ? "hide-mobile" : ""}`}>
          {partner ? (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div className="tf-chat-header">
                <div className="tf-chat-header-user">
                  <Button
                    size="sm"
                    style={{ marginRight: 4 }}
                    onClick={() => go(toMessages())}
                    title="Ortga"
                  >
                    ←
                  </Button>
                  <Avatar user={partner} size="sm" />
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong style={{ fontSize: 14 }}>{partner.full_name}</strong>
                      <SpecialtyTag user={partner} compact />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
                      <span className="tf-status-dot" />
                      <span>{tx("common.onlayn") || "Faol"}</span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => go(toUser(partner.id))}
                >
                  {tx("messages.profil")}
                </Button>
              </div>

              <div style={{ flex: 1, minHeight: 0 }}>
                <Chat
                  directUserId={partner.id}
                  title={`Suhbat — ${partner.full_name}`}
                  height={440}
                />
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: 40 }}>
              <EmptyState
                icon="💬"
                title={tx("messages.suhbat_tanlanmagan")}
                message={tx("messages.chapdan_odamni_email_yoki_ism")}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
