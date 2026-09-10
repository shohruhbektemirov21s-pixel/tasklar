/**
 * Takliflar — jamoa nima o'zgarishini so'raydi, boshliq qaror qiladi.
 *
 * UX MOCKUP UYG'UNLIGI VA TAQVIM USLUBIDAGI SIDE PANEL.
 * - Qatorlar: Rank box (1, 2...), Avatar, Sarlavha, Status kapsulasi,
 *   Muallif + Vaqt, Progress bar, Ovoz berish tugmasi (👍 count), Amallar menyusi.
 * - Bosilganda: Ekranning o'ng tarafida Taqvim uslubidagi Side Panel ochiladi.
 * - Barcha tugmalar Backend API (Django DRF) bilan to'g'ridan-to meva beradi.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";

import { api, listOf, pagesOf, totalOf } from "@/api/client";
import type {
  Suggestion, SuggestionCounts, SuggestionScopeValue, SuggestionStatusValue, VoteChoiceValue
} from "@/api/types";
import { useFetch } from "@/api/useFetch";
import { useLive } from "@/realtime/RealtimeContext";
import { confirmDialog } from "@/components/Confirm";
import { PageHead } from "@/components/Layout";
import {
  IconChevron, IconIdea, IconNeutral, IconSearch, IconThumbDown, IconThumbUp,
} from "@/components/icons";
import {
  EMPTY_FORM, SuggestionForm, formOf,
} from "@/components/suggestion";
import SuggestionDrawer from "@/components/SuggestionDrawer";
import {
  Avatar, Card, Empty, ErrorMsg, Loading, OkMsg, Pager,
  RowMenu, timeAgo,
} from "@/components/ui";
import { tx } from "@/i18n";
import { toSuggestion } from "@/nav";

/** Holat kesimi - filtrdagi tartib shu yerdan. */
const STATUSES: SuggestionStatusValue[] = ["PENDING", "APPROVED", "REJECTED"];

/** Saralash - qiymatlar server tushunadigan kalitlar (`SuggestionViewSet.SORTS`). */
type Sort = "top" | "new" | "old";

/** Bir sahifada nechta taklif. */
const PAGE_SIZE = 10;

/** `GET /api/suggestions/` javobi - DRF sahifalagichi. */
interface ListPage {
  count: number;
  results: Suggestion[];
}

/** Filtr paneli holati. */
interface Filters {
  search: string;
  status: "" | SuggestionStatusValue;
  scope: "" | SuggestionScopeValue;
  period: string;
  date: string;
  sort: Sort;
  mine: boolean;
}

const NO_FILTERS: Filters = {
  search: "", status: "", scope: "", period: "", date: "", sort: "top", mine: false,
};

/* -------------------------------------------------------------- bitta qator */

function SuggestionRow({ item, rank, open, onToggle, onEdit, onDelete, onQuickVote }: {
  item: Suggestion;
  rank: number | null;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onQuickVote: (choice: VoteChoiceValue) => void;
}) {
  const total = item.for_count + item.against_count + item.neutral_count;
  const percent = total ? Math.round((item.for_count * 100) / total) : 0;
  const isFor = item.my_vote === "FOR";
  const isAgainst = item.my_vote === "AGAINST";
  const isNeutral = item.my_vote === "NEUTRAL";

  const renderRankBadge = (r: number | null) => {
    if (r === null) return null;
    return (
      <div className="sg-rank-box" style={{
        width: 32, height: 32, borderRadius: 8, background: "var(--surface-2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, fontSize: 13, color: "var(--text)", flexShrink: 0
      }}>
        {r}
      </div>
    );
  };

  const renderStatusPill = (status: SuggestionStatusValue, label: string) => {
    let bg = "#fef3c7";
    let color = "#b45309";

    if (status === "APPROVED") {
      bg = "#e6f4ea";
      color = "#137333";
    } else if (status === "REJECTED") {
      bg = "#fce8e6";
      color = "#c5221f";
    }

    return (
      <span className="sg-status-pill" style={{
        display: "inline-flex", alignItems: "center",
        padding: "3px 12px", borderRadius: 12, fontSize: 12, fontWeight: 600,
        background: bg, color: color, whiteSpace: "nowrap"
      }}>
        {label}
      </span>
    );
  };

  return (
    <div
      className={`repo-item clickable sg-item-row${open ? " sg-row-open is-selected" : ""}`}
      onClick={onToggle}
      style={{
        padding: "12px 18px",
        transition: "background-color 0.15s ease",
        cursor: "pointer",
        borderBottom: "1px solid var(--border-muted)"
      }}
    >
      <div className="sg-row-inner" style={{ display: "flex", alignItems: "center", gap: 14, width: "100%" }}>
        {renderRankBadge(rank)}

        <div style={{ flexShrink: 0 }}>
          {item.author ? (
            <Avatar user={item.author} />
          ) : (
            <div className="avatar" style={{ background: "var(--surface-2)", color: "var(--muted)", fontWeight: 600 }}>?</div>
          )}
        </div>

        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 8, alignItems: "center", marginBottom: 2 }}>
            <button
              type="button"
              className="sg-title-btn"
              aria-expanded={open}
              aria-controls={open ? "sg-side-panel" : undefined}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              style={{
                padding: 0, border: "none", background: "none", cursor: "pointer",
                textAlign: "left", font: "inherit", display: "inline-flex", alignItems: "center"
              }}
            >
              <h3 className="sg-title" style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                {item.title}
              </h3>
            </button>
            {renderStatusPill(item.status, item.status_display)}
            {item.can_decide && item.status === "PENDING" && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  background: "#fef3c7",
                  color: "#b45309",
                  border: "1px solid #fcd34d",
                  borderRadius: 9999,
                  padding: "2px 8px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                ⚡ {tx("suggestions.boshliq_korib_chiqmoqda")}
              </span>
            )}
          </div>

          <div className="repo-meta" style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 6, alignItems: "center" }}>
            <span>{item.author ? item.author.full_name : tx("suggestions.anonim_muallif")}</span>
            <span>•</span>
            <span>{timeAgo(item.created_at)}</span>
            {(item.author?.job_title || item.author?.specialty_display || (item.scope === "CLOSED" ? item.scope_display : null)) && (
              <>
                <span>•</span>
                <span>{item.author?.job_title || item.author?.specialty_display || (item.scope === "CLOSED" ? item.scope_display : "")}</span>
              </>
            )}
          </div>
        </div>

        <div className="sg-row-right" style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          {total > 0 && (
            <div className="row" style={{ gap: 8, alignItems: "center", fontSize: 12 }}>
              <div style={{ width: 75, height: 6, borderRadius: 3, background: "var(--surface-3)", overflow: "hidden" }}>
                <div style={{
                  width: `${percent}%`, height: "100%", borderRadius: 3,
                  background: "#3b82f6", transition: "width 0.3s ease"
                }} />
              </div>
              <span className="mono" style={{ color: "var(--text-muted)", fontSize: 12 }}>{item.for_count}/{total}</span>
              <strong style={{ minWidth: 28, fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>{percent}%</strong>
            </div>
          )}

          {item.scope === "OPEN" && (
            <div className="sg-vote-pills">
              <button
                type="button"
                className={`sg-vote-pill is-for${isFor ? " on" : ""}`}
                disabled={!item.can_vote}
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickVote("FOR");
                }}
                title={tx("suggestions.qoshilaman")}
                aria-label={tx("suggestions.qoshilaman")}
                aria-pressed={isFor}
              >
                <IconThumbUp size={13} />
                <span>{item.for_count}</span>
              </button>

              <button
                type="button"
                className={`sg-vote-pill is-against${isAgainst ? " on" : ""}`}
                disabled={!item.can_vote}
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickVote("AGAINST");
                }}
                title={tx("suggestions.qoshilmayman")}
                aria-label={tx("suggestions.qoshilmayman")}
                aria-pressed={isAgainst}
              >
                <IconThumbDown size={13} />
                <span>{item.against_count}</span>
              </button>

              <button
                type="button"
                className={`sg-vote-pill is-neutral${isNeutral ? " on" : ""}`}
                disabled={!item.can_vote}
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickVote("NEUTRAL");
                }}
                title={tx("suggestions.betarafman")}
                aria-label={tx("suggestions.betarafman")}
                aria-pressed={isNeutral}
              >
                <IconNeutral size={13} />
                <span>{item.neutral_count}</span>
              </button>
            </div>
          )}

          {item.can_decide && (
            <button
              type="button"
              className={`btn btn-xs ${item.status === "PENDING" ? "btn-primary" : "btn-outline"}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", fontSize: 12, fontWeight: 700, borderRadius: 6 }}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              title={tx("suggestions.qaror_title")}
            >
              ⚖️ {item.status === "PENDING" ? tx("suggestions.qaror_qabul_qilish") : tx("suggestions.qarorni_korish")}
            </button>
          )}

          <div className="sg-actions" onClick={(e) => e.stopPropagation()}>
            <RowMenu>
              <button type="button" onClick={onToggle}>
                {open ? tx("common.yopish") : tx("suggestions.toliq_sahifada")}
              </button>
              {item.can_edit && (
                <>
                  <button type="button" onClick={onEdit}>{tx("common.tahrirlash")}</button>
                  <button type="button" onClick={onDelete}>{tx("common.ochirish")}</button>
                </>
              )}
              <Link {...toSuggestion(item.id)}>
                {tx("suggestions.toliq_sahifada")}
              </Link>
            </RowMenu>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- sahifa */
export default function Suggestions() {
  const fid = useId();

  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [patched, setPatched] = useState<Record<number, Suggestion>>({});
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Suggestion | null>(null);
  const [ok, setOk] = useState("");
  const [warn, setWarn] = useState("");

  useEffect(() => {
    if (!ok) return;
    const timer = setTimeout(() => setOk(""), 10_000);
    return () => clearTimeout(timer);
  }, [ok]);

  const list = useFetch<ListPage>("/suggestions/", {
    search: f.search,
    status: f.status,
    scope: f.scope,
    period: f.period,
    date: f.date,
    sort: f.sort,
    ...(f.mine ? { mine: 1 } : {}),
    page,
    page_size: PAGE_SIZE,
  }, { debounceMs: 300 });

  const counts = useFetch<SuggestionCounts>("/suggestions/counts/");

  const listData = list.data;
  useEffect(() => {
    setPatched((cur) => (Object.keys(cur).length ? {} : cur));
  }, [listData]);

  const rows = listOf<Suggestion>(listData).map((r) => patched[r.id] ?? r);
  const total = totalOf(list.data);
  const pages = pagesOf(list.data, PAGE_SIZE);

  const selectedItem = rows.find((r) => r.id === selectedId) || null;

  const reloadList = list.reload;
  const reloadCounts = counts.reload;
  const reload = useCallback(() => {
    reloadList();
    reloadCounts();
  }, [reloadList, reloadCounts]);

  useLive((d) => {
    if (d.event !== "notification") return;
    const kind = d.notification?.kind;
    if (kind === "suggestion.new" || kind === "suggestion.decided") reload();
  });

  function set<K extends keyof Filters>(k: K, v: Filters[K]) {
    setPage(1);
    setEditing(null);
    setSelectedId(null);
    setF((prev) => ({
      ...prev,
      [k]: v,
      ...(k === "period" ? { date: "" } : {}),
      ...(k === "date" ? { period: "" } : {}),
    }));
  }

  function clear() {
    setPage(1);
    setEditing(null);
    setSelectedId(null);
    setF(NO_FILTERS);
  }

  const dirty = Boolean(f.search || f.status || f.scope || f.period || f.date || f.mine);
  const onlyMine = f.mine && !(f.search || f.status || f.scope || f.period || f.date);

  async function remove(item: Suggestion) {
    const yes = await confirmDialog({
      title: tx("suggestions.ochirilsinmi", { nom: item.title }),
      body: tx("suggestions.ochirish_izohi"),
      confirmText: tx("common.ochirish"),
      danger: true,
    });
    if (!yes) return;
    await api.delete("/suggestions/" + item.id + "/");
    setSelectedId((cur) => (cur === item.id ? null : cur));
    setOk(tx("suggestions.ochirildi"));
    reload();
  }

  async function handleQuickVote(item: Suggestion, choice: VoteChoiceValue) {
    try {
      const saved = await api.post<Suggestion>(`/suggestions/${item.id}/vote/`, { choice });
      setPatched((cur) => ({ ...cur, [saved.id]: saved }));
    } catch (err) {
      console.error("Vote error:", err);
    }
  }

  function afterSave(_saved: Suggestion, note?: string) {
    setCreating(false);
    setEditing(null);
    setWarn(note || "");
    setOk(note ? "" : tx("suggestions.saqlandi"));
    reload();
  }

  return (
    <>
      <PageHead
        title={<strong>{tx("suggestions.sarlavha_sahifa")}</strong>}
        subtitle={tx("suggestions.sahifa_tavsifi")}
      />

      <div className="content wl sg">
        {!creating && !editing && (
          <div className="sg-page-header">
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
              <IconIdea size={14} /> {tx("suggestions.yangi_taklif")}
            </button>
          </div>
        )}

        {ok && <OkMsg text={ok} />}
        {warn && <ErrorMsg error={warn} />}
        <ErrorMsg error={list.error} />

        {(creating || editing) && (
          <div className="sg-form">
            <SuggestionForm
              key={editing ? "edit-" + editing.id : "new"}
              editing={editing}
              initial={editing ? formOf(editing) : EMPTY_FORM}
              onCancel={() => { setCreating(false); setEditing(null); }}
              onSaved={afterSave}
            />
          </div>
        )}

        <div className="sg-filters-card">
          <div className="sg-search-wrap">
            <IconSearch size={16} className="sg-search-icon" />
            <input
              id={`${fid}-q`}
              type="text"
              className="sg-search-input"
              value={f.search}
              placeholder={tx("suggestions.qidiruv_placeholder")}
              onChange={(e) => set("search", e.target.value)}
            />
          </div>

          <div className="sg-filter-group">
            <label htmlFor={`${fid}-s`} className="sg-filter-label">{tx("suggestions.holat")}</label>
            <div className="sg-select-box">
              <select
                id={`${fid}-s`}
                className="sg-filter-select"
                value={f.status}
                onChange={(e) => set("status", e.target.value as Filters["status"])}
              >
                <option value="">{tx("suggestions.holat_all")}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {tx("suggestions.holat_" + s.toLowerCase())} ({counts.data?.[s] ?? 0})
                  </option>
                ))}
              </select>
              <IconChevron size={14} className="sg-select-arrow" />
            </div>
          </div>

          <div className="sg-filter-group">
            <label htmlFor={`${fid}-o`} className="sg-filter-label">{tx("suggestions.saralash")}</label>
            <div className="sg-select-box">
              <select
                id={`${fid}-o`}
                className="sg-filter-select"
                value={f.sort}
                onChange={(e) => set("sort", e.target.value as Sort)}
              >
                <option value="top">{tx("suggestions.saralash_top")}</option>
                <option value="new">{tx("suggestions.saralash_new")}</option>
                <option value="old">{tx("suggestions.saralash_old")}</option>
              </select>
              <IconChevron size={14} className="sg-select-arrow" />
            </div>
          </div>

          {dirty && (
            <button type="button" className="btn btn-ghost btn-sm sg-clear-btn" onClick={clear}>
              {tx("common.tozalash")}
            </button>
          )}
        </div>

        {list.loading ? <Loading /> : !list.data ? null : !rows.length ? (
          <Card>
            <Empty icon="💡"
                   title={onlyMine ? tx("suggestions.meniki_bosh")
                     : dirty ? tx("suggestions.topilmadi")
                       : tx("suggestions.bosh_holat")}
                   text={onlyMine ? tx("suggestions.meniki_bosh_matn")
                     : dirty ? tx("suggestions.topilmadi_matn")
                       : tx("suggestions.bosh_holat_matn")}>
              <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 12 }}>
                {dirty ? (
                  <button type="button" className="btn" onClick={clear}>
                    {tx("common.tozalash")}
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                    <IconIdea size={14} /> {tx("suggestions.yangi_taklif")}
                  </button>
                )}
              </div>
            </Empty>
          </Card>
        ) : (
          <div className={`sg-layout ${selectedItem ? "with-drawer" : ""}`}>
            <div className="card sg-card-container">
              <div className="card-list">
                {rows.map((item, i) => (
                  <SuggestionRow
                    key={item.id}
                    item={item}
                    rank={(page - 1) * PAGE_SIZE + i + 1}
                    open={selectedId === item.id}
                    onToggle={() => setSelectedId((cur) => (cur === item.id ? null : item.id))}
                    onEdit={() => { setEditing(item); setCreating(false); setSelectedId(null); }}
                    onDelete={() => void remove(item)}
                    onQuickVote={(choice) => void handleQuickVote(item, choice)}
                  />
                ))}
              </div>

              {pages > 1 && (
                <div className="card-body pager-bar">
                  <span className="muted">
                    {tx("suggestions.natija_soni", {
                      jami: total,
                      dan: (page - 1) * PAGE_SIZE + 1,
                      gacha: Math.min(page * PAGE_SIZE, total),
                    })}
                  </span>
                  <Pager page={page} pages={pages}
                         onPick={(n) => { setEditing(null); setSelectedId(null); setPage(n); }} />
                </div>
              )}
            </div>

            {selectedItem && (
              <SuggestionDrawer
                item={selectedItem}
                onClose={() => setSelectedId(null)}
                onPatch={(saved) => setPatched((cur) => ({ ...cur, [saved.id]: saved }))}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}
