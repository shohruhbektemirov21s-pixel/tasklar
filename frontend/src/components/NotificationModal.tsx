import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { AppNotification } from "@/api/types";
import { Avatar, safePath, timeAgo } from "./ui";
import { fmtDateTime } from "./dates";
import {
  IconBell,
  IconChat,
  IconCheck,
  IconClock,
  IconOrder,
  IconReview,
  IconTasks,
  IconUserPlus,
} from "./icons";
import { tx } from "@/i18n";

interface NotificationModalProps {
  notification: AppNotification | null;
  onClose: () => void;
  onAction?: (notification: AppNotification) => void;
}

function getNotificationVisuals(kind: string) {
  if (kind.startsWith("order.")) {
    return {
      icon: <IconOrder size={17} />,
      bg: "var(--accent-soft, rgba(59, 130, 246, 0.12))",
      color: "var(--accent, #3b82f6)",
      badgeClass: kind === "order.reminder" ? "badge-danger" : "badge-brand",
    };
  }
  if (kind === "task.review") {
    return {
      icon: <IconReview size={17} />,
      bg: "rgba(99, 102, 241, 0.12)",
      color: "var(--brand, #6366f1)",
      badgeClass: "badge-brand",
    };
  }
  if (kind === "task.decided") {
    return {
      icon: <IconCheck size={17} />,
      bg: "rgba(16, 185, 129, 0.12)",
      color: "var(--ok, #10b981)",
      badgeClass: "badge-ok",
    };
  }
  if (kind === "task.comment" || kind.startsWith("chat.")) {
    return {
      icon: <IconChat size={17} />,
      bg: "rgba(14, 165, 233, 0.12)",
      color: "#0284c7",
      badgeClass: "badge",
    };
  }
  if (kind === "join.request") {
    return {
      icon: <IconUserPlus size={17} />,
      bg: "rgba(168, 85, 247, 0.12)",
      color: "#9333ea",
      badgeClass: "badge-warn",
    };
  }
  if (kind === "project.deadline") {
    return {
      icon: <IconClock size={17} />,
      bg: "rgba(245, 158, 11, 0.12)",
      color: "var(--warn, #f59e0b)",
      badgeClass: "badge-danger",
    };
  }
  if (kind.startsWith("task.")) {
    return {
      icon: <IconTasks size={17} />,
      bg: "var(--accent-soft, rgba(59, 130, 246, 0.12))",
      color: "var(--accent, #3b82f6)",
      badgeClass: "badge-info",
    };
  }
  return {
    icon: <IconBell size={17} />,
    bg: "var(--accent-soft, rgba(59, 130, 246, 0.12))",
    color: "var(--accent, #3b82f6)",
    badgeClass: "badge",
  };
}

function parseMeta(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, any>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      try {
        const jsonStr = raw.replace(/'/g, '"');
        return JSON.parse(jsonStr);
      } catch {
        return {};
      }
    }
  }
  return {};
}

export default function NotificationModal({
  notification,
  onClose,
  onAction,
}: NotificationModalProps) {
  const nav = useNavigate();

  useEffect(() => {
    if (!notification) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [notification, onClose]);

  if (!notification) return null;

  const visuals = getNotificationVisuals(notification.kind);
  const meta = parseMeta(notification.meta);

  // Rad etish yoki kamchilik holatini aniqlash
  const isRejected =
    meta.status === "REJECTED" ||
    Boolean(meta.reason) ||
    notification.title.toLowerCase().includes("rad etildi");

  let messageLabel = tx("notifications.xabar_matni");
  let messageContent = notification.body;
  let isReason = false;

  const noteCandidate =
    meta.decision_note ||
    meta.pm_notes ||
    meta.feedback_note ||
    meta.note ||
    meta.completion_note;

  if (isRejected) {
    let reasonText = meta.reason ? String(meta.reason).trim() : "";
    if (!reasonText && notification.body) {
      const match = notification.body.match(/«([^»]+)»/);
      if (match && match[1]) {
        reasonText = match[1].trim();
      }
    }
    if (reasonText) {
      messageContent = reasonText;
      messageLabel = "Rad etish sababi";
      isReason = true;
    }
  } else if (noteCandidate && String(noteCandidate).trim()) {
    messageContent = String(noteCandidate).trim();
    messageLabel = "Berilgan izoh";
    isReason = true;
  }

  const targetUrl =
    meta && typeof meta.order_id === "number"
      ? `/buyurtmalar/${meta.order_id}`
      : notification.url
      ? safePath(notification.url)
      : null;

  const actionLabel =
    meta && typeof meta.order_id === "number"
      ? tx("notifications.buyurtmaga_otish")
      : notification.kind.startsWith("order.")
      ? tx("notifications.buyurtmaga_otish")
      : notification.kind.startsWith("task.")
      ? tx("notifications.vazifaga_otish")
      : notification.kind.startsWith("chat.")
      ? tx("notifications.suhbatga_otish")
      : notification.kind.startsWith("project.")
      ? tx("notifications.loyihaga_otish")
      : notification.kind === "join.request"
      ? tx("notifications.jamoaga_otish")
      : tx("notifications.sahifaga_otish");

  const handleNavigate = () => {
    onClose();
    if (onAction) {
      onAction(notification);
    } else if (targetUrl) {
      nav(targetUrl);
    }
  };

  return createPortal(
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        overflowY: "auto",
        padding: "32px 16px",
        background: "rgba(8, 11, 16, 0.72)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        className="modal-card"
        style={{
          margin: "auto",
          maxWidth: 540,
          width: "100%",
          maxHeight: "calc(100vh - 64px)",
          display: "flex",
          flexDirection: "column",
          borderRadius: "var(--radius-lg, 12px)",
          background: "var(--surface)",
          boxShadow: "var(--shadow-lg, 0 20px 25px -5px rgba(0, 0, 0, 0.4))",
          border: "1px solid var(--border)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div
          className="modal-header row between middle"
          style={{
            padding: "16px 20px",
            flexShrink: 0,
            borderBottom: "1px solid var(--border-muted)",
            background: "var(--surface)",
          }}
        >
          <div className="row middle" style={{ gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: visuals.bg,
                color: visuals.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                flexShrink: 0,
              }}
            >
              {visuals.icon}
            </div>
            <strong style={{ fontSize: 15 }}>
              {notification.kind_display || tx("notifications.tafsilot")}
            </strong>
          </div>
          <button
            type="button"
            className="btn btn-xs btn-ghost"
            onClick={onClose}
            style={{ width: 28, height: 28, padding: 0 }}
            title={tx("common.yopish")}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div
          className="modal-body"
          style={{
            padding: "18px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            overflowY: "auto",
            flex: "1 1 auto",
            minHeight: 0,
          }}
        >
          {/* Sarlavha va status */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", lineHeight: 1.4 }}>
              {notification.title}
            </div>
            <div className="row middle" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className={`badge ${visuals.badgeClass}`}>
                {notification.kind_display}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                {fmtDateTime(notification.created_at)} ({timeAgo(notification.created_at)})
              </span>
            </div>
          </div>

          {/* Yuboruvchi */}
          <div className="field">
            <label
              style={{
                fontWeight: 600,
                fontSize: 12.5,
                display: "block",
                marginBottom: 6,
                color: "var(--text-muted)",
              }}
            >
              {tx("notifications.yuboruvchi")}
            </label>
            <div
              className="row between middle"
              style={{
                padding: "10px 14px",
                background: "var(--surface-2)",
                borderRadius: 8,
                border: "1px solid var(--border-muted)",
              }}
            >
              {notification.actor ? (
                <div className="row middle" style={{ gap: 10 }}>
                  <Avatar user={notification.actor} size="sm" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
                      {notification.actor.full_name || notification.actor.email}
                    </div>
                    {notification.actor.email && (
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {notification.actor.email}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="row middle" style={{ gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                    {tx("notifications.tizim")}
                  </span>
                </div>
              )}
              <span className="notif-time" style={{ fontSize: 12 }}>
                {timeAgo(notification.created_at)}
              </span>
            </div>
          </div>

          {/* Xabar matni yoki rad etish sababi */}
          {messageContent && (
            <div className="field">
              <label
                style={{
                  fontWeight: 600,
                  fontSize: 12.5,
                  display: "block",
                  marginBottom: 6,
                  color: isReason ? "var(--danger)" : "var(--text-muted)",
                }}
              >
                {messageLabel}
              </label>
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 8,
                  background: isReason ? "rgba(239, 68, 68, 0.08)" : "var(--surface-2)",
                  border: isReason
                    ? "1px solid rgba(239, 68, 68, 0.22)"
                    : "1px solid var(--border-muted)",
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  color: isReason ? "var(--danger)" : "var(--text)",
                  fontWeight: isReason ? 500 : 400,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {messageContent}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div
          className="modal-footer row between middle"
          style={{
            padding: "14px 20px",
            flexShrink: 0,
            borderTop: "1px solid var(--border-muted)",
            background: "var(--surface-2)",
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
          >
            {tx("common.bekor_qilish")}
          </button>
          {targetUrl ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleNavigate}
            >
              {actionLabel} →
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onClose}
            >
              {tx("common.tushunarli", undefined, "Tushunarli")}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
