/**
 * TeamFlow — Takliflar (Offers / Proposals) sahifasi.
 *
 * Professional SaaS dizayn talablari:
 * - Top: "Takliflar", "+ Yangi taklif"
 * - Filters: Search, Status, Date
 * - Offer list/table:
 *   - №
 *   - Taklif nomi
 *   - Loyiha
 *   - Muallif
 *   - Yaratilgan sana
 *   - Holati (Ko'rib chiqilmoqda, Qabul qilingan, Rad etilgan)
 * - Taklif ochilganda: title, description, project, creator, date, files, comments/activity
 */
import { useId, useState } from "react";
import { api, listOf, pagesOf } from "@/api/client";
import type { Suggestion, SuggestionStatusValue, VoteChoiceValue } from "@/api/types";
import { useFetch } from "@/api/useFetch";
import { useLive } from "@/realtime/RealtimeContext";
import {
  IconCalendar,
  IconPlus,
  IconSearch,
} from "@/components/icons";
import {
  EMPTY_FORM,
  SuggestionForm,
  formOf,
} from "@/components/suggestion";
import SuggestionDrawer from "@/components/SuggestionDrawer";
import {
  Avatar,
  DUE_PERIODS,
  EmptyState,
  ErrorMsg,
  FilterBar,
  OkMsg,
  PageHeader,
  Pager,
  TableSkeleton,
  fmtDate,
} from "@/components/ui";
import { tx } from "@/i18n";
import { Button } from "@/components/Button";

const PAGE_SIZE = 15;

export default function Suggestions() {
  const fid = useId();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [period, setPeriod] = useState<string>("");
  const [page, setPage] = useState(1);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Suggestion | null>(null);
  const [ok, setOk] = useState("");
  const [warn, setWarn] = useState("");

  const list = useFetch<{ count: number; results: Suggestion[] } | Suggestion[]>(
    "/suggestions/",
    {
      search: search || undefined,
      status: status || undefined,
      period: period || undefined,
      page,
      page_size: PAGE_SIZE,
    },
    { debounceMs: 300 }
  );

  const reload = list.reload;

  useLive((d) => {
    if (d.event !== "notification") return;
    const kind = d.notification?.kind;
    if (kind === "suggestion.new" || kind === "suggestion.decided") reload();
  });

  const rows = listOf<Suggestion>(list.data);
  const pages = pagesOf(list.data, PAGE_SIZE);
  const selectedItem = rows.find((r) => r.id === selectedId) || null;

  const renderStatusBadge = (st: SuggestionStatusValue) => {
    switch (st) {
      case "APPROVED":
        return <span className="badge badge-ok">{tx("suggestions.qabul_qilindi", undefined, "Qabul qilingan")}</span>;
      case "REJECTED":
        return <span className="badge badge-danger">{tx("suggestions.rad_etildi", undefined, "Rad etilgan")}</span>;
      case "PENDING":
      default:
        return <span className="badge badge-warn">{tx("suggestions.korib_chiqilmoqda", undefined, "Ko'rib chiqilmoqda")}</span>;
    }
  };

  const [patched, setPatched] = useState<Record<number, Suggestion>>({});

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
    setOk(note ? "" : tx("suggestions.saqlandi", undefined, "Taklif muvaffaqiyatli saqlandi!"));
    reload();
  }

  return (
    <div className="content">
      <PageHeader
        title={tx("common.takliflar", undefined, "Takliflar")}
        subtitle={tx("suggestions.sahifa_izohi", undefined, "Jamoaning loyihalar va jarayonlar bo'yicha taklif hamda tashabbuslari")}
        action={
          !creating && !editing ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <IconPlus size={16} />
              <span>{tx("suggestions.yangi_taklif", undefined, "+ Yangi taklif")}</span>
            </Button>
          ) : undefined
        }
      />

      {ok && <OkMsg text={ok} />}
      {warn && <ErrorMsg error={warn} />}
      <ErrorMsg error={list.error} />

      {/* Yangi taklif qo'shish / tahrirlash formasi */}
      {(creating || editing) && (
        <div className="card" style={{ marginBottom: 20, padding: 20, borderRadius: 16 }}>
          <SuggestionForm
            key={editing ? "edit-" + editing.id : "new"}
            editing={editing}
            initial={editing ? formOf(editing) : EMPTY_FORM}
            onCancel={() => {
              setCreating(false);
              setEditing(null);
            }}
            onSaved={afterSave}
          />
        </div>
      )}

      {/* Standart Filtrlar */}
      <FilterBar>
        <div className="filter-search-box">
          <span className="filter-search-icon">
            <IconSearch size={16} />
          </span>
          <input
            id={`${fid}-q`}
            type="search"
            className="filter-search-input"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={tx("suggestions.qidiruv_placeholder", undefined, "Taklifni qidirish...")}
          />
        </div>

        <div className="filter-select-box">
          <select
            id={`${fid}-st`}
            className="filter-select"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{tx("suggestions.barcha_holatlar", undefined, "Barcha holatlar")}</option>
            <option value="PENDING">{tx("suggestions.korib_chiqilmoqda", undefined, "Ko'rib chiqilmoqda")}</option>
            <option value="APPROVED">{tx("suggestions.qabul_qilindi", undefined, "Qabul qilingan")}</option>
            <option value="REJECTED">{tx("suggestions.rad_etildi", undefined, "Rad etilgan")}</option>
          </select>
        </div>

        <div className="filter-select-box">
          <select
            id={`${fid}-period`}
            className="filter-select"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{tx("suggestions.barcha_muddatlar", undefined, "Barcha muddatlar")}</option>
            {DUE_PERIODS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {(!!search || !!status || !!period) && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearch("");
              setStatus("");
              setPeriod("");
              setPage(1);
            }}
          >
            {tx("common.tozalash", undefined, "Tozalash")}
          </Button>
        )}
      </FilterBar>

      {/* Takliflar jadvali */}
      <div className="table-card-clean">
        {list.loading && !rows.length ? (
          <TableSkeleton rows={6} cols={6} />
        ) : !rows.length ? (
          <EmptyState
            icon="💡"
            title={tx("suggestions.taklif_topilmadi", undefined, "Takliflar topilmadi")}
            message={
              search || status || period
                ? tx("suggestions.filtr_natijasi_yoq", undefined, "Tanlangan parametrlar bo'yicha hech qanday taklif topilmadi.")
                : tx("suggestions.hozircha_taklif_yoq", undefined, "Hozircha tizimda hech qanday taklif yo'q.")
            }
            action={
              !creating ? (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <IconPlus size={14} />
                  <span>{tx("suggestions.yangi_taklif", undefined, "+ Yangi taklif")}</span>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table-clean">
              <thead>
                <tr>
                  <th style={{ width: 44, textAlign: "center" }}>№</th>
                  <th>{tx("suggestions.ustun_nomi", undefined, "Taklif nomi")}</th>
                  <th>{tx("suggestions.ustun_loyiha", undefined, "Loyiha")}</th>
                  <th>{tx("suggestions.ustun_muallif", undefined, "Muallif")}</th>
                  <th>{tx("suggestions.ustun_sana", undefined, "Yaratilgan sana")}</th>
                  <th>{tx("suggestions.ovozlar", undefined, "Ovozlar")}</th>
                  <th>{tx("suggestions.ustun_holat", undefined, "Holati")}</th>
                  <th style={{ width: 70, textAlign: "right" }}>{tx("common.korish", undefined, "Ko'rish")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((origItem, idx) => {
                  const item = patched[origItem.id] || origItem;
                  const isOpen = selectedId === item.id;
                  return (
                    <tr
                      key={item.id}
                      className="clickable"
                      onClick={() => setSelectedId(isOpen ? null : item.id)}
                    >
                      <td style={{ textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>
                        {(page - 1) * PAGE_SIZE + idx + 1}
                      </td>
                      <td>
                        <div>
                          <button
                            type="button"
                            className="link-title"
                            aria-expanded={isOpen}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(isOpen ? null : item.id);
                            }}
                          >
                            {item.title}
                          </button>
                        </div>
                      </td>
                      <td className="nowrap">
                        {item.scope_display ? (
                          <span style={{ fontWeight: 500, fontSize: 13 }}>{item.scope_display}</span>
                        ) : (
                          <span className="muted" style={{ fontSize: 12.5 }}>
                            {tx("suggestions.umumiy_tizim", undefined, "Umumiy tizim")}
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Avatar user={item.author} size="sm" showHoverCard={false} />
                          <span style={{ fontSize: 13, fontWeight: 500 }}>
                            {item.author?.full_name || (item.is_anonymous ? tx("suggestions.anonim") || "Anonim" : "—")}
                          </span>
                        </div>
                      </td>
                      <td className="nowrap" style={{ fontSize: 12.5, color: "var(--muted)" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <IconCalendar size={13} />
                          {fmtDate(item.created_at)}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Button
                            variant="ghost" size="sm"
                            aria-label={tx("suggestions.qoshilaman")}
                            title={tx("suggestions.qoshilaman")}
                            onClick={() => void handleQuickVote(item, "FOR")}
                          >
                            👍 {item.for_count}
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            aria-label={tx("suggestions.qoshilmayman")}
                            title={tx("suggestions.qoshilmayman")}
                            onClick={() => void handleQuickVote(item, "AGAINST")}
                          >
                            👎 {item.against_count}
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            aria-label={tx("suggestions.betarafman")}
                            title={tx("suggestions.betarafman")}
                            onClick={() => void handleQuickVote(item, "NEUTRAL")}
                          >
                            😐 {item.neutral_count}
                          </Button>
                        </div>
                      </td>
                      <td>{renderStatusBadge(item.status)}</td>
                      <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => setSelectedId(isOpen ? null : item.id)}
                        >
                          {tx("common.korish", undefined, "Ko'rish")}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pages > 1 && <Pager page={page} pages={pages} onPick={setPage} />}

      {/* Taklifni ochish paneli (Side Drawer) */}
      <SuggestionDrawer
        item={selectedItem}
        onClose={() => setSelectedId(null)}
        onPatch={() => reload()}
      />
    </div>
  );
}
