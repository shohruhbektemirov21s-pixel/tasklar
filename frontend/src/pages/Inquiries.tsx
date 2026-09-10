/**
 * So'rovlar sahifasi — xodimlar so'rovlari va boshliq qarorlari.
 *
 * Takliflar uslubida yaratilgan zamonaviy UI:
 * - O'ng tarafdagi Side Panel drawer
 * - Ovoz berish, filtrlash va holatlar
 * - Faqat ruxsat berilgan foydalanuvchilarga, boshliq va adminga ochiladi
 */
import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import { api } from "@/api/client";
import type {
  Inquiry, InquiryCounts, InquiryScopeValue, InquiryStatusValue, VoteChoiceValue,
} from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { useLive } from "@/realtime/RealtimeContext";
import { confirmDialog } from "@/components/Confirm";
import { PageHead } from "@/components/Layout";
import { IconPlus, IconThumbUp } from "@/components/icons";
import {
  EMPTY_INQUIRY_FORM, InquiryForm, inquiryFormOf,
} from "@/components/inquiry";
import InquiryDrawer from "@/components/InquiryDrawer";
import {
  Avatar, Card, Empty, ErrorMsg, Loading, OkMsg, Pager,
  timeAgo,
} from "@/components/ui";
import { tx } from "@/i18n";

type Sort = "top" | "new" | "old";
const PAGE_SIZE = 10;

interface ListPage {
  count: number;
  results: Inquiry[];
}

interface Filters {
  search: string;
  status: "" | InquiryStatusValue;
  scope: "" | InquiryScopeValue;
  sort: Sort;
  mine: boolean;
}

const NO_FILTERS: Filters = {
  search: "", status: "", scope: "", sort: "top", mine: false,
};

/* -------------------------------------------------------------- bitta qator */

function InquiryRow({
  item, rank, open, onToggle, onEdit, onDelete, onQuickVote,
}: {
  item: Inquiry;
  rank: number | null;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onQuickVote: (choice: VoteChoiceValue) => void;
}) {
  const isFor = item.my_vote === "FOR";

  const renderStatusPill = (status: InquiryStatusValue, label: string) => {
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
      <span style={{
        backgroundColor: bg, color, padding: "2px 8px", borderRadius: 12,
        fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center",
      }}>
        {label}
      </span>
    );
  };

  return (
    <div
      className={`sg-row ${open ? "sg-row-active" : ""}`}
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
        borderRadius: 10, cursor: "pointer", borderBottom: "1px solid var(--border)",
        background: open ? "var(--surface-2)" : "transparent",
        transition: "background 0.15s ease",
      }}
    >
      {rank !== null && (
        <div style={{
          width: 28, height: 28, borderRadius: 6, background: "var(--surface-2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700, fontSize: 12, color: "var(--text-muted)", flexShrink: 0,
        }}>
          {rank}
        </div>
      )}

      {item.author ? (
        <Avatar user={item.author} size="sm" />
      ) : (
        <div style={{
          width: 32, height: 32, borderRadius: "50%", background: "var(--surface-2)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
        }}>
          🎭
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>
            {item.title}
          </span>
          {renderStatusPill(item.status, item.status_display)}
          {item.scope === "CLOSED" && (
            <span className="badge badge-info" style={{ fontSize: 10, padding: "1px 6px" }}>
              {tx("inquiries.yopiq")}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
          {item.author ? item.author.full_name : tx("inquiries.anonim")} • {timeAgo(item.created_at)}
        </div>
      </div>

      {item.scope === "OPEN" && (
        <button
          type="button"
          className={`btn btn-sm ${isFor ? "btn-primary" : "btn-ghost"}`}
          onClick={(e) => {
            e.stopPropagation();
            onQuickVote("FOR");
          }}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}
          title={tx("inquiries.qoshilaman")}
        >
          <IconThumbUp size={13} />
          <span>{item.for_count}</span>
        </button>
      )}

      {item.can_edit && (
        <div style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          <button
            type="button"
            className="btn-icon"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title={tx("common.tahrirlash")}
          >
            ✏️
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title={tx("common.ochirish")}
          >
            🗑️
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- Asosiy sahifa */

export default function Inquiries() {
  const { user, loading: authLoading } = useAuth();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListPage>({ count: 0, results: [] });
  const [counts, setCounts] = useState<InquiryCounts>({
    open: 0, closed: 0, pending: 0, all: 0, mine: 0, PENDING: 0, APPROVED: 0, REJECTED: 0,
  });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [activeItem, setActiveItem] = useState<Inquiry | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Inquiry | null>(null);

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      q.set("page", String(page));
      q.set("page_size", String(PAGE_SIZE));
      if (filters.search) q.set("search", filters.search);
      if (filters.status) q.set("status", filters.status);
      if (filters.scope) q.set("scope", filters.scope);
      if (filters.sort) q.set("sort", filters.sort);
      if (filters.mine) q.set("mine", "1");

      const [listRes, cntRes] = await Promise.all([
        api.get<ListPage>(`/inquiries/?${q.toString()}`),
        api.get<InquiryCounts>("/inquiries/counts/"),
      ]);
      setData(listRes);
      setCounts(cntRes);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "So'rovlarni yuklab bo'lmadi");
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    load();
  }, [load]);

  useLive(() => {
    load();
  });

  if (authLoading) return <Loading />;
  if (!user?.has_inquiries_access) {
    return <Navigate to="/panel" replace />;
  }

  async function handleQuickVote(item: Inquiry, choice: VoteChoiceValue) {
    try {
      const updated = await api.post<Inquiry>(`/inquiries/${item.id}/vote/`, { choice });
      setData((prev) => ({
        ...prev,
        results: prev.results.map((x) => (x.id === updated.id ? updated : x)),
      }));
      if (activeItem?.id === updated.id) {
        setActiveItem(updated);
      }
    } catch {
      // ignore
    }
  }

  async function handleDelete(item: Inquiry) {
    const yes = await confirmDialog({
      title: tx("inquiries.ochirish_tasdiq"),
      body: tx("inquiries.ochirish_matn", { title: item.title }),
      confirmText: tx("common.ochirish"),
      danger: true,
    });
    if (!yes) return;
    try {
      await api.delete(`/inquiries/${item.id}/`);
      if (activeItem?.id === item.id) setActiveItem(null);
      setOk("So'rov muvaffaqiyatli o'chirildi");
      load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "O'chirib bo'lmadi");
    }
  }

  return (
    <div className="page" style={{ position: "relative" }}>
      <PageHead title="So'rovlar" />

      <div className="row wrap between gap-3 mb-4" style={{ alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>So'rovlar</h1>
          <p className="muted" style={{ margin: "2px 0 0 0", fontSize: 13 }}>
            Xodimlar va rahbariyat o'rtasidagi so'rovlar va qarorlar markazi.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setEditingItem(null);
            setFormOpen(true);
          }}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <IconPlus size={15} /> Yangi so'rov
        </button>
      </div>

      <OkMsg text={ok} />
      <ErrorMsg error={err} />

      {formOpen && (
        <div style={{ marginBottom: 20 }}>
          <InquiryForm
            initial={editingItem ? inquiryFormOf(editingItem) : EMPTY_INQUIRY_FORM}
            editing={editingItem}
            onCancel={() => {
              setFormOpen(false);
              setEditingItem(null);
            }}
            onSaved={(saved, warn) => {
              setFormOpen(false);
              setEditingItem(null);
              setOk(warn || "So'rov saqlandi");
              load();
              setActiveItem(saved);
            }}
          />
        </div>
      )}

      {/* Filtrlar */}
      <div className="card mb-4" style={{ padding: "12px 16px" }}>
        <div className="row wrap gap-2" style={{ alignItems: "center" }}>
          <div className="search-box" style={{ flex: "1 1 200px" }}>
            <input
              type="search"
              className="input input-sm"
              placeholder="Sarlavha, matn yoki muallif bo'yicha qidirish..."
              value={filters.search}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, search: e.target.value }));
                setPage(1);
              }}
            />
          </div>

          <div className="row gap-1" style={{ flexWrap: "wrap" }}>
            <button
              type="button"
              className={`btn btn-sm ${filters.status === "" && !filters.mine ? "btn-primary" : "btn-ghost"}`}
              onClick={() => {
                setFilters((prev) => ({ ...prev, status: "", mine: false }));
                setPage(1);
              }}
            >
              Barchasi ({counts.all})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${filters.status === "PENDING" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => {
                setFilters((prev) => ({ ...prev, status: "PENDING", mine: false }));
                setPage(1);
              }}
            >
              Ko'rib chiqilmoqda ({counts.PENDING})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${filters.status === "APPROVED" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => {
                setFilters((prev) => ({ ...prev, status: "APPROVED", mine: false }));
                setPage(1);
              }}
            >
              Tasdiqlangan ({counts.APPROVED})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${filters.status === "REJECTED" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => {
                setFilters((prev) => ({ ...prev, status: "REJECTED", mine: false }));
                setPage(1);
              }}
            >
              Rad etilgan ({counts.REJECTED})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${filters.mine ? "btn-primary" : "btn-ghost"}`}
              onClick={() => {
                setFilters((prev) => ({ ...prev, mine: !prev.mine, status: "" }));
                setPage(1);
              }}
            >
              {tx("inquiries.mening_sorovlarim")} ({counts.mine})
            </button>
          </div>
        </div>
      </div>

      {/* Ro'yxat va O'ng Drawer */}
      <div className="sg-layout" style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <Loading />
          ) : data.results.length === 0 ? (
            <Card>
              <Empty
                icon="📋"
                title={tx("inquiries.topilmadi")}
                text={tx("inquiries.topilmadi_matn")}
              >
                <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 12 }}>
                  {Boolean(filters.search || filters.status || filters.scope || filters.mine) ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setFilters(NO_FILTERS);
                        setPage(1);
                      }}
                    >
                      {tx("common.tozalash")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        setEditingItem(null);
                        setFormOpen(true);
                      }}
                    >
                      <IconPlus size={14} /> {tx("inquiries.yangi_sorov")}
                    </button>
                  )}
                </div>
              </Empty>
            </Card>
          ) : (
            <div className="card" style={{ padding: 4 }}>
              {data.results.map((item, idx) => (
                <InquiryRow
                  key={item.id}
                  item={item}
                  rank={(page - 1) * PAGE_SIZE + idx + 1}
                  open={activeItem?.id === item.id}
                  onToggle={() => setActiveItem((cur) => (cur?.id === item.id ? null : item))}
                  onEdit={() => {
                    setEditingItem(item);
                    setFormOpen(true);
                  }}
                  onDelete={() => handleDelete(item)}
                  onQuickVote={(choice) => handleQuickVote(item, choice)}
                />
              ))}
            </div>
          )}

          {data.count > PAGE_SIZE && (
            <div style={{ marginTop: 16 }}>
              <Pager
                page={page}
                pages={Math.ceil(data.count / PAGE_SIZE)}
                onPick={setPage}
              />
            </div>
          )}
        </div>

        {activeItem && (
          <div style={{ width: 380, flexShrink: 0 }}>
            <InquiryDrawer
              item={activeItem}
              onClose={() => setActiveItem(null)}
              onPatch={(updated) => {
                setData((prev) => ({
                  ...prev,
                  results: prev.results.map((x) => (x.id === updated.id ? updated : x)),
                }));
                setActiveItem(updated);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
