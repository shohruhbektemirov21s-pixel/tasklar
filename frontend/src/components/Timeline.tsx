import { Link } from "react-router-dom";
import type { Activity } from "@/api/types";
import { Avatar, fmtDate, fmtDateTime, timeAgo } from "./ui";
import { toProject, toTask } from "@/nav";
import { tx } from "@/i18n";

function formatSummary(summary: string, cleanCode?: string) {
  let s = summary || "";
  if (cleanCode) {
    if (s.startsWith(`${cleanCode}: `)) {
      s = s.slice(cleanCode.length + 2);
    } else if (s.startsWith(`${cleanCode} - `)) {
      s = s.slice(cleanCode.length + 3);
    }
  }
  if (s.includes(" -> ")) {
    const parts = s.split(" -> ");
    return (
      <span className="tl-change">
        <span className="badge">{parts[0].trim()}</span>
        <span className="tl-arrow">→</span>
        <span className="badge badge-info">{parts.slice(1).join(" -> ").trim()}</span>
      </span>
    );
  }
  return s;
}

/**
 * Tarix lentasi.
 *
 * `compact` — panel uchun siqilgan ko'rinish: har yozuv bitta qatorda,
 * tafsilotsiz. Bosh sahifada tarix asosiy narsa emas, u yerda "nima
 * bo'layotgani" ko'rinib tursa yetadi; to'lig'i «Umumiy tarix» da.
 */
export default function Timeline({
  items, showProject = true, showTask = true, compact = false,
}: { items: Activity[]; showProject?: boolean; showTask?: boolean; compact?: boolean }) {
  if (!items.length) return <p className="muted center">{tx("timeline.hozircha_yozuv_yoq")}</p>;
  return (
    <div className={`timeline ${compact ? "compact" : ""}`}>
      {items.map((a) => {
        const meta = (
          <>
            {showProject && a.project && (
              <Link {...toProject(a.project)}>{a.project_name}</Link>
            )}
            {showTask && a.task && (
              <>
                {showProject && a.project ? " · " : ""}
                <Link className="mono" {...toTask(a.task)}>{a.task_code}</Link>
              </>
            )}
          </>
        );
        const hasMeta = (showProject && Boolean(a.project)) || (showTask && Boolean(a.task));
        const day = a.created_at ? parseInt(fmtDate(a.created_at).split(".")[0], 10) : null;
        const halfNum = day ? (day <= 15 ? 1 : 2) : null;

        return (
          <div key={a.id} className={`tl-item cat-${a.category}`}>
            <div className="tl-head">
              {a.actor && <Avatar user={a.actor} size="sm" />}
              {a.actor && (
                <span className="tl-actor" title={a.actor.specialty_display || undefined}>
                  {a.actor.full_name}
                </span>
              )}
              <span className="tl-sum">
                {formatSummary(a.summary, showTask ? undefined : (a.task_code || undefined))}
              </span>
              {/* Siqilgan ko'rinishda loyiha/vazifa alohida qatorga tushmaydi */}
              {compact && hasMeta && <small className="muted tl-meta">{meta}</small>}
              <span className="spacer" />
              <span className="tl-time" title={fmtDateTime(a.created_at)} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {halfNum && (
                  <span
                    className="badge"
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "1px 5px",
                      borderRadius: 4,
                      background: halfNum === 1 ? "var(--accent-bg, #eff6ff)" : "var(--warning-bg, #fef3c7)",
                      color: halfNum === 1 ? "var(--accent, #2563eb)" : "var(--warning, #d97706)",
                      border: `1px solid ${halfNum === 1 ? "rgba(37,99,235,0.2)" : "rgba(217,119,6,0.2)"}`,
                    }}
                    title={halfNum === 1 ? tx("my_work.davr_1", undefined, "1-davr: 1—15 sanalar (1)") : tx("my_work.davr_2", undefined, "2-davr: 16—30 sanalar (2)")}
                  >
                    {halfNum}
                  </span>
                )}
                <span className="tl-datetime" style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text)" }}>
                  🕒 {fmtDateTime(a.created_at)}
                </span>
                <span className="muted" style={{ fontSize: 11 }}>
                  ({timeAgo(a.created_at)})
                </span>
              </span>
            </div>
            {!compact && hasMeta && <small className="muted tl-meta-row">{meta}</small>}
            {!compact && a.detail && <div className="tl-detail">{a.detail}</div>}
          </div>
        );
      })}
    </div>
  );
}
