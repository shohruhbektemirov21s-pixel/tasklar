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

import { api, listOf, pagesOf, totalOf } from "@/api/client";
import type {
  Suggestion, SuggestionCounts, SuggestionScopeValue, SuggestionStatusValue, VoteChoiceValue
} from "@/api/types";
import { useFetch } from "@/api/useFetch";
import { useAuth } from "@/auth/AuthContext";
import { useLive } from "@/realtime/RealtimeContext";
import { confirmDialog } from "@/components/Confirm";
import { DateField } from "@/components/dates";
import { PageHead } from "@/components/Layout";
import {
  IconFile, IconIdea, IconThumbUp,
} from "@/components/icons";
import {
  EMPTY_FORM, STATUS_TONE, SuggestionForm, formOf,
} from "@/components/suggestion";
import SuggestionDrawer from "@/components/SuggestionDrawer";
import {
  Avatar, Card, DUE_PERIODS, Empty, ErrorMsg, Loading, OkMsg, Pager, Progress,
  RowMenu, timeAgo,
} from "@/components/ui";
import { tx } from "@/i18n";

/** Holat kesimi - filtrdagi tartib shu yerdan. */
const STATUSES: SuggestionStatusValue[] = ["PENDING", "APPROVED", "REJECTED"];

/** Turi: ochiq taklifni hamma ko'radi, yopig'ini muallif va boshliq. */
const SCOPES: SuggestionScopeValue[] = ["OPEN", "CLOSED"];

/** Saralash - qiymatlar server tushunadigan kalitlar (`SuggestionViewSet.SORTS`). */
const SORTS = ["top", "new", "old"] as const;
type Sort = typeof SORTS[number];

/** Bir sahifada nechta taklif. */
const PAGE_SIZE = 20;

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
  const decided = item.status !== "PENDING";
  const isVoted = item.my_vote === "FOR";

  return (
    <div className={`repo-item clickable${open ? " sg-row-open" : ""}`} onClick={onToggle} style={{ padding: "14px 18px" }}>
      <div className="sg-row-inner" style={{ display: "flex", alignItems: "center", gap: 14, width: "100%" }}>
        {rank !== null && (
          <div className="sg-rank-box" style={{
            width: 32, height: 32, borderRadius: 8, background: "var(--surface-2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 13, color: "var(--text-muted)", flexShrink: 0
          }}>
            {rank}
          </div>
        )}

        <div style={{ flexShrink: 0 }}>
          {item.author ? (
            <Avatar user={item.author} size="md" />
          ) : (
            <div className="avatar avatar-md" style={{ background: "var(--surface-2)", color: "var(--muted)", fontWeight: 600 }}>?</div>
          )}
        </div>

        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 8, alignItems: "center", marginBottom: 3 }}>
            <h3 className="sg-title" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
              {item.title}
            </h3>
            <span className={`badge ${STATUS_TONE[item.status]}`}>{item.status_display}</span>
            {item.scope === "CLOSED" && (
              <span className="badge badge-info">{item.scope_display}</span>
            )}
            {!!item.files.length && (
              <span className="badge" title={tx("suggestions.fayllar")}>
                <IconFile size={11} /> {item.files.length}
              </span>
            )}
          </div>

          <div className="repo-meta" style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted)", display: "flex", gap: 6, alignItems: "center" }}>
            <span>{item.author ? item.author.full_name : tx("suggestions.anonim_muallif")}</span>
            <span>•</span>
            <span>{timeAgo(item.created_at)}</span>
            {decided && item.decided_by && (
              <>
                <span>•</span>
                <span>{tx("suggestions.qaror_qildi", { ism: item.decided_by.full_name })}</span>
              </>
            )}
          </div>
        </div>

        <div className="sg-row-right" style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          {total > 0 && (
            <div className="row" style={{ gap: 8, alignItems: "center", fontSize: 12 }}>
              <div style={{ width: 70 }}>
                <Progress value={percent} />
              </div>
              <span className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>{item.for_count}/{total}</span>
              <strong style={{ minWidth: 28, fontSize: 12 }}>{percent}%</strong>
            </div>
          )}

          <button
            type="button"
            className={`sg-vote-pill ${isVoted ? "on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onQuickVote("FOR");
            }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px",
              borderRadius: 20,
              background: isVoted ? "var(--accent)" : "rgba(59, 130, 246, 0.1)",
              color: isVoted ? "#fff" : "var(--accent)",
              fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
              transition: "all 0.15s ease"
            }}
            title={tx("suggestions.qoshilaman")}
          >
            <IconThumbUp size={14} />
            <span>{item.for_count}</span>
          </button>

          {item.can_edit && (
            <div className="sg-actions" onClick={(e) => e.stopPropagation()}>
              <RowMenu>
                <button type="button" onClick={onEdit}>{tx("common.tahrirlash")}</button>
                <button type="button" onClick={onDelete}>{tx("common.ochirish")}</button>
              </RowMenu>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- sahifa */
export default function Suggestions() {
  const fid = useId();
  const { user } = useAuth();
  const canPickScope = Boolean(user?.is_boss);

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
        actions={
          <>
            {!!list.data && (
              <span className="badge">{tx("suggestions.nechta_taklif", { n: total })}</span>
            )}
            {!creating && !editing && (
              <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
                <IconIdea size={14} /> {tx("suggestions.yangi_taklif")}
              </button>
            )}
          </>
        }
      />

      <div className="content wl sg">
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

        <div className="filters">
          <div className="f wl-search">
            <label htmlFor={`${fid}-q`}>{tx("common.qidiruv")}</label>
            <input id={`${fid}-q`} value={f.search} placeholder={tx("suggestions.qidiruv_placeholder")}
                   onChange={(e) => set("search", e.target.value)} />
          </div>

          <div className="wl-filters">
            <div className="f sg-status">
              <label htmlFor={`${fid}-s`}>{tx("suggestions.holat")}</label>
              <select id={`${fid}-s`} value={f.status}
                      onChange={(e) => set("status", e.target.value as Filters["status"])}>
                <option value="">{tx("suggestions.holat_all")}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {tx("suggestions.holat_" + s.toLowerCase())} ({counts.data?.[s] ?? 0})
                  </option>
                ))}
              </select>
            </div>

            {canPickScope && (
              <div className="f">
                <label htmlFor={`${fid}-t`}>{tx("suggestions.turi")}</label>
                <select id={`${fid}-t`} value={f.scope}
                        onChange={(e) => set("scope", e.target.value as Filters["scope"])}>
                  <option value="">{tx("suggestions.barcha_turlar")}</option>
                  {SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {tx(s === "OPEN" ? "suggestions.ochiq" : "suggestions.yopiq")}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="f">
              <label htmlFor={`${fid}-p`}>{tx("common.davr")}</label>
              <select id={`${fid}-p`} value={f.period}
                      onChange={(e) => set("period", e.target.value)}>
                <option value="">{tx("suggestions.barcha_vaqt")}</option>
                {DUE_PERIODS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="f wl-date">
              <label htmlFor={`${fid}-d`}>{tx("common.sana")}</label>
              <DateField id={`${fid}-d`} value={f.date} onChange={(v) => set("date", v)} />
            </div>

            <div className="f sg-sort">
              <label htmlFor={`${fid}-o`}>{tx("suggestions.saralash")}</label>
              <select id={`${fid}-o`} value={f.sort}
                      onChange={(e) => set("sort", e.target.value as Sort)}>
                {SORTS.map((v) => (
                  <option key={v} value={v}>{tx("suggestions.saralash_" + v)}</option>
                ))}
              </select>
            </div>

            <label className="sg-only-mine">
              <input type="checkbox" checked={f.mine}
                     onChange={(e) => set("mine", e.target.checked)} />
              {tx("suggestions.meniki")}
            </label>

            {dirty && (
              <button type="button" className="btn btn-ghost" onClick={clear}>
                {tx("common.tozalash")}
              </button>
            )}
          </div>
        </div>

        {list.loading ? <Loading /> : !list.data ? null : !rows.length ? (
          <Card>
            <Empty icon="💡"
                   title={onlyMine ? tx("suggestions.meniki_bosh")
                     : dirty ? tx("suggestions.topilmadi")
                       : tx("suggestions.bosh_holat")}
                   text={onlyMine ? tx("suggestions.meniki_bosh_matn")
                     : dirty ? tx("suggestions.topilmadi_matn")
                       : tx("suggestions.bosh_holat_matn")} />
          </Card>
        ) : (
          <div className={`sg-layout ${selectedItem ? "with-drawer" : ""}`}>
            <div className="card">
              <div className="card-list">
                {rows.map((item, i) => (
                  <SuggestionRow
                    key={item.id}
                    item={item}
                    rank={f.sort === "top" ? (page - 1) * PAGE_SIZE + i + 1 : null}
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

            <SuggestionDrawer
              item={selectedItem}
              onClose={() => setSelectedId(null)}
              onPatch={(saved) => setPatched((cur) => ({ ...cur, [saved.id]: saved }))}
            />
          </div>
        )}
      </div>
    </>
  );
}
