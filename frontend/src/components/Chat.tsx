/**
 * Jamoa suhbati - loyiha yoki ish maydoni ichida.
 *
 * Tarix REST orqali yuklanadi, yangi xabarlar WebSocket orqali darrov keladi.
 * Yuborish ham REST: ruxsat tekshiruvi bitta joyda - serverda qoladi.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import type { ChatMessage } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { openSocket } from "@/realtime/socket";
import { IconSend } from "./icons";
import { Avatar, ErrorMsg, Loading, fmtDateTime, timeAgo } from "./ui";
import { toUser } from "@/nav";
import { tx } from "@/i18n";

interface Props {
  projectId?: number;
  workspaceId?: number;
  workspaceSlug?: string;
  /** Shaxsiy yozishma - suhbatdoshning id si */
  directUserId?: number;
  title?: string;
  height?: number;
}

/** Ketma-ket kelgan xabarlar bir muallifdan va 5 daqiqa ichida bo'lsa - guruhlanadi */
const GROUP_MS = 5 * 60 * 1000;

export default function Chat({
  projectId, workspaceId, workspaceSlug, directUserId, title = tx("common.suhbat"), height = 460,
}: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const scope = directUserId ? "direct" : projectId ? "project" : "workspace";
  const scopeId = directUserId || projectId || workspaceId;

  const listParams = useMemo(
    () => (directUserId ? { direct: directUserId }
      : projectId ? { project: projectId } : { workspace: workspaceSlug }),
    [directUserId, projectId, workspaceSlug]
  );

  const scrollDown = useCallback(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  /**
   * Yangi xabar kelganda pastga tushamizmi.
   *
   * Ilgari har xabarda shartsiz tushardi: eski yozishmalarni o'qib
   * turganingizda kimdir yozsa, sizni pastga tortib yuborardi va joyingizni
   * qaytadan qidirishga to'g'ri kelardi. Endi faqat siz allaqachon pastda
   * bo'lsangiz - ya'ni oxirini kuzatayotgan bo'lsangiz - tushadi.
   */
  const nearBottom = () => {
    const el = bodyRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  };

  const load = useCallback(async () => {
    try {
      const data = await api.get<any>("/chat/messages/", { ...listParams, page_size: 60 });
      // Server eng yangisini birinchi qaytaradi - ekranda teskari tartib kerak.
      setMessages(listOf<ChatMessage>(data).slice().reverse());
      setError(null);
    } catch (err) {
      setMessages([]);
      setError(err instanceof ApiError ? err.message : tx("chat.suhbatni_yuklab_bolmadi"));
    }
  }, [listParams]);

  useEffect(() => { void load(); }, [load]);

  // Birinchi yuklanganda - albatta pastga (odam oxirgi xabarlarni ko'rsin).
  // Keyin esa faqat oxirini kuzatayotgan bo'lsa.
  const firstPaint = useRef(true);
  useEffect(() => {
    if (messages === null) return;
    if (firstPaint.current) {
      firstPaint.current = false;
      scrollDown();
      return;
    }
    if (nearBottom()) scrollDown();
    // `nearBottom` - o'lchov, bog'liqlik emas: uni ro'yxatga qo'shsak
    // effekt har renderda qayta ishga tushardi. (U `useCallback` ichida
    // barqaror, shuning uchun ESLint ham talab qilmaydi.)
  }, [messages, scrollDown]);

  useEffect(() => {
    if (!scopeId) return;
    const close = openSocket(`/ws/chat/${scope}/${scopeId}/`, {
      onStatus: setLive,
      onMessage: (data) => {
        // Kimdir xabarini o'chirsa - u ochiq turgan oynalardan ham ketsin.
        if (data.event === "chat.deleted") {
          setMessages((prev) => (prev || []).filter((m) => m.id !== Number(data.id)));
          return;
        }
        if (data.event !== "chat.message" || !data.message) return;
        const incoming = data.message as ChatMessage;
        setMessages((prev) => {
          const list = prev || [];
          if (list.some((m) => m.id === incoming.id)) return list;
          return [...list, incoming];
        });
      },
    });
    return close;
  }, [scope, scopeId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await api.post<ChatMessage>("/chat/messages/", {
        project: directUserId ? null : projectId ?? null,
        workspace: directUserId || projectId ? null : workspaceId ?? null,
        recipient_id: directUserId ?? null,
        text: value,
      });
      setText("");
      // O'z xabarimiz WebSocket orqali ham qaytadi - id bo'yicha takrorlanmaydi.
      setMessages((prev) => {
        const list = prev || [];
        return list.some((m) => m.id === saved.id) ? list : [...list, saved];
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("chat.xabarni_yuborib_bolmadi"));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(e as unknown as React.FormEvent);
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setText((prev) => (prev ? `${prev}\n📎 ${file.name}` : `📎 ${file.name}`));
    e.target.value = "";
  }

  return (
    <div className="card chat" style={{ borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden" }}>
      <div className="card-head" style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-muted)" }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 650 }}>{title}</h3>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: live ? "var(--success)" : "var(--text-muted)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: live ? "var(--success)" : "var(--border-strong)" }} />
          {live ? (tx("chat.jonli") || "jonli") : (tx("chat.ulanmoqda") || "ulanmoqda…")}
        </span>
        <span className="spacer" />
      </div>

      <div className="chat-body" ref={bodyRef} style={{ height, padding: "16px 20px" }}>
        {messages === null && <Loading />}
        {messages?.length === 0 && (
          <div className="empty" style={{ padding: "40px 20px" }}>
            <div className="ico" style={{ fontSize: 32 }}>💬</div>
            <h3 style={{ fontSize: 15 }}>{tx("chat.suhbat_bosh")}</h3>
            <p className="muted" style={{ fontSize: 13 }}>{tx("chat.birinchi_xabarni_siz_yozing")}</p>
          </div>
        )}

        {(messages || []).map((m, i) => {
          const prev = (messages || [])[i - 1];
          const grouped =
            prev &&
            prev.author.id === m.author.id &&
            new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_MS;
          const mine = m.author.id === user?.id;

          return (
            <div key={m.id} className={`chat-msg ${mine ? "mine" : ""} ${grouped ? "grouped" : ""}`}>
              <div className="chat-ava">{!grouped && <Avatar user={m.author} size="sm" />}</div>
              <div className="chat-bubble">
                {!grouped && (
                  <div className="chat-meta">
                    <Link {...toUser(m.author.id)} style={{ color: mine ? "inherit" : "var(--accent)" }}>{m.author.full_name}</Link>
                    <span className="tl-time" title={fmtDateTime(m.created_at)} style={{ opacity: 0.75 }}>
                      {timeAgo(m.created_at)}
                    </span>
                  </div>
                )}
                <div className="pre-wrap">{m.text}</div>
              </div>
            </div>
          );
        })}
      </div>

      <form className="chat-form" onSubmit={send} style={{ padding: "12px 16px", background: "var(--surface)" }}>
        <ErrorMsg error={error} />
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            className="tf-chat-attach-btn"
            title={tx("chat.fayl_biriktirish") || "Fayl biriktirish"}
            onClick={() => fileInputRef.current?.click()}
          >
            📎
          </button>
          <input
            type="text"
            name="xabar"
            className="tf-chat-input-field"
            value={text}
            aria-label={tx("chat.xabar_yozing")}
            placeholder={tx("chat.xabar_yozing")}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            type="submit"
            className="tf-chat-send-btn"
            disabled={busy || !text.trim()}
            title={tx("chat.yuborish")}
          >
            <IconSend size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
