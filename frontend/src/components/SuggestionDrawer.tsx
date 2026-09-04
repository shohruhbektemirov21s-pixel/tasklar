/**
 * Taklif paneli — Taqvim uslubida sahifaning o'ng tarafida chiqadigan panel (Side Panel).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Suggestion } from "@/api/types";
import {
  Attachments, BossPanel, DecisionBox, STATUS_TONE, VoteBar,
} from "@/components/suggestion";
import { Avatar, Card, timeAgo } from "@/components/ui";
import { toSuggestion } from "@/nav";
import { tx } from "@/i18n";
import { IconClose, IconFile } from "@/components/icons";

export default function SuggestionDrawer({
  item,
  onClose,
  onPatch,
}: {
  item: Suggestion | null;
  onClose: () => void;
  onPatch: (saved: Suggestion) => void;
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
                <span className="badge" title={tx("suggestions.fayllar")}>
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
              <span className="sg-anon">{tx("suggestions.anonim_muallif")}</span>
            )}
          </span>
          <span className="muted">• {timeAgo(item.created_at)}</span>
          {decided && item.decided_by && (
            <span className="muted">• {tx("suggestions.qaror_qildi", { ism: item.decided_by.full_name })}</span>
          )}
        </div>

        <p className="drawer-desc" style={{ marginBottom: 18, fontSize: 13.5, lineHeight: 1.6 }}>{item.body}</p>

        <Attachments item={item} />

        {item.can_vote && (
          <div style={{ marginTop: 16 }}>
            <VoteBar item={item} onChange={onPatch} />
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <DecisionBox item={item} />
        </div>

        {item.can_decide && (item.status === "PENDING" || redeciding) && (
          <div style={{ marginTop: 16 }}>
            <BossPanel
              item={item}
              onDone={(saved) => {
                setRedeciding(false);
                onPatch(saved);
              }}
              onCancel={redeciding ? () => setRedeciding(false) : undefined}
            />
          </div>
        )}
        {item.can_decide && decided && !redeciding && (
          <button
            type="button"
            className="btn btn-sm sg-redecide"
            style={{ marginTop: 12 }}
            onClick={() => setRedeciding(true)}
          >
            {tx("suggestions.qarorni_ozgartirish")}
          </button>
        )}

        <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--border-muted)", display: "flex", justifyContent: "flex-end" }}>
          <Link className="btn btn-primary btn-sm" {...toSuggestion(item.id)}>
            {tx("suggestions.toliq_sahifada")}
          </Link>
        </div>
      </Card>
    </aside>
  );
}
