/**
 * So'rov paneli — Taqvim/Takliflar uslubida sahifaning o'ng tarafida chiqadigan Side Panel.
 */
import { useEffect, useState } from "react";
import type { Inquiry } from "@/api/types";
import {
  InquiryBossPanel, InquiryVoteBar, STATUS_TONE,
} from "@/components/inquiry";
import { Avatar, Card, timeAgo } from "@/components/ui";
import { tx } from "@/i18n";
import { IconClose, IconFile } from "@/components/icons";

export default function InquiryDrawer({
  item,
  onClose,
  onPatch,
}: {
  item: Inquiry | null;
  onClose: () => void;
  onPatch: (saved: Inquiry) => void;
}) {
  const [redeciding, setRedeciding] = useState(false);

  useEffect(() => {
    setRedeciding(false);
  }, [item?.id]);

  if (!item) return null;

  const decided = item.status !== "PENDING";

  return (
    <aside className="sg-side-panel">
      <Card
        title={
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div className="row wrap" style={{ gap: 6 }}>
              <span className={`badge ${STATUS_TONE[item.status]}`}>
                {item.status_display}
              </span>
              {item.scope === "CLOSED" && (
                <span className="badge badge-info">{item.scope_display}</span>
              )}
              {!!item.files.length && (
                <span className="badge" title="Fayllar">
                  <IconFile size={11} /> {item.files.length}
                </span>
              )}
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.35 }}>{item.title}</span>
          </div>
        }
        badge={
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onClose}
            title={tx("common.yopish")}
          >
            <IconClose size={15} /> {tx("common.yopish")}
          </button>
        }
      >
        <div className="repo-meta" style={{ marginBottom: 16, display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
          <span className="sg-by">
            {item.author ? (
              <>
                <Avatar user={item.author} size="sm" /> <b>{item.author.full_name}</b>
              </>
            ) : (
              <span className="sg-anon">🎭 Anonim muallif</span>
            )}
          </span>
          <span className="muted">• {timeAgo(item.created_at)}</span>
          {decided && item.decided_by && (
            <span className="muted">• Qaror qilgan: {item.decided_by.full_name}</span>
          )}
        </div>

        <p className="drawer-desc" style={{ marginBottom: 18, fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
          {item.body}
        </p>

        {item.files.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>Biriktirilgan fayllar:</span>
            <div className="stack gap-1" style={{ marginTop: 6 }}>
              {item.files.map((f) => (
                <a
                  key={f.id}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="badge"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, width: "fit-content" }}
                >
                  <IconFile size={13} /> {f.original_name} <span className="muted">({f.size_display})</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {item.can_vote && (
          <div style={{ marginTop: 16 }}>
            <InquiryVoteBar item={item} onChange={onPatch} />
          </div>
        )}

        {item.decision_note && (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "var(--surface-2)", borderLeft: "3px solid var(--accent)" }}>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>👑 Boshliq izohi:</div>
            <div style={{ fontSize: 13 }}>{item.decision_note}</div>
          </div>
        )}

        {item.can_decide && (item.status === "PENDING" || redeciding) && (
          <div style={{ marginTop: 16 }}>
            <InquiryBossPanel
              item={item}
              onDone={(saved) => {
                onPatch(saved);
                setRedeciding(false);
              }}
            />
          </div>
        )}

        {item.can_decide && decided && !redeciding && (
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setRedeciding(true)}
            >
              🔄 Qarorni qayta ko'rib chiqish
            </button>
          </div>
        )}
      </Card>
    </aside>
  );
}
