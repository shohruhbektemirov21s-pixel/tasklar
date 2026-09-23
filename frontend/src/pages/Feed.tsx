/**
 * Umumiy tarix — Activity History.
 *
 * Professional axborot markazi:
 * - Foydalanuvchi
 * - Harakat (Amal)
 * - Obyekt
 * - Sana
 * - Vaqt
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import type { Activity, UserBrief } from "@/api/types";
import {
  Avatar,
  DateField,
  EmptyState,
  FilterBar,
  PageHeader,
  TableSkeleton,
  fmtDate,
  fmtDateTime,
  timeAgo,
} from "@/components/ui";
import { toProject, toTask, useNavParams } from "@/nav";
import { tx } from "@/i18n";

function formatSummaryText(summary: string, cleanCode?: string) {
  let s = summary || "";
  if (cleanCode) {
    if (s.startsWith(`${cleanCode}: `)) {
      s = s.slice(cleanCode.length + 2);
    } else if (s.startsWith(`${cleanCode} - `)) {
      s = s.slice(cleanCode.length + 3);
    }
  }
  return s;
}

const CATEGORY_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  task: { bg: "rgba(53, 98, 255, 0.1)", color: "#3562ff", label: "Vazifa" },
  order: { bg: "rgba(16, 185, 129, 0.1)", color: "#10b981", label: "Buyurtma" },
  project: { bg: "rgba(139, 92, 246, 0.1)", color: "#8b5cf6", label: "Loyiha" },
  comment: { bg: "rgba(245, 158, 11, 0.1)", color: "#f59e0b", label: "Izoh" },
  system: { bg: "rgba(100, 116, 139, 0.1)", color: "#64748b", label: "Tizim" },
};

export default function Feed() {
  const { meta } = useAuth();
  const [params, setParams] = useNavParams();

  const [items, setItems] = useState<Activity[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [users, setUsers] = useState<UserBrief[]>([]);
  const [loading, setLoading] = useState(true);

  const search = params.get("q") || "";
  const actor = params.get("actor") || "";
  const category = params.get("category") || "";
  const date = params.get("date") || "";
  const page = Number(params.get("page") || 1);
  const pageSize = 20;

  // Foydalanuvchilarni yuklash
  useEffect(() => {
    let alive = true;
    api.get<UserBrief[]>("/chat/messages/people/")
      .then((data) => {
        if (alive && Array.isArray(data)) setUsers(data);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Tarixni yuklash
  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.get<{ results?: Activity[]; count?: number }>("/activity/", {
        search: search || undefined,
        actor: actor || undefined,
        category: category || undefined,
        date: date || undefined,
        page,
        page_size: pageSize,
      });
      setItems(resp.results || []);
      setTotalCount(resp.count || 0);
    } catch {
      setItems([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [search, actor, category, date, page]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  function setParam(key: string, val: string) {
    const next = new URLSearchParams(params);
    if (val) next.set(key, val);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  }

  function clearFilters() {
    setParams(new URLSearchParams());
  }

  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const hasActiveFilters = Boolean(search || actor || category || date);

  return (
    <div className="content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1. Page Header */}
      <PageHeader
        title={tx("feed.umumiy_tarix")}
        subtitle="Tizimdagi barcha foydalanuvchilar va loyihalar bo'yicha amallar xronologiyasi"
        breadcrumbs={[
          { label: tx("nav.bosh_sahifa") || "Bosh sahifa", href: "/" },
          { label: tx("feed.umumiy_tarix") },
        ]}
      />

      {/* 2. Filter Bar */}
      <FilterBar>
        {/* Qidiruv */}
        <div className="filter-search-box" style={{ minWidth: 260 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>🔍</span>
          <input
            type="text"
            placeholder={tx("feed.matn_boyicha") || "Qidiruv (amal, vazifa, loyiha)..."}
            value={search}
            onChange={(e) => setParam("q", e.target.value)}
          />
        </div>

        {/* Foydalanuvchi filtri */}
        <div className="filter-select-box">
          <label>Foydalanuvchi:</label>
          <select value={actor} onChange={(e) => setParam("actor", e.target.value)}>
            <option value="">{tx("common.hammasi") || "Barchasi"}</option>
            {users.map((u) => (
              <option key={u.id} value={String(u.id)}>
                {u.full_name}
              </option>
            ))}
          </select>
        </div>

        {/* Amal turi / Turkum */}
        <div className="filter-select-box">
          <label>Amal turi:</label>
          <select value={category} onChange={(e) => setParam("category", e.target.value)}>
            <option value="">{tx("common.hammasi") || "Barchasi"}</option>
            {(meta?.activity_category || []).map((c) => (
              <option key={String(c.value)} value={String(c.value)}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Sana */}
        <div className="filter-select-box">
          <label>Sana:</label>
          <DateField value={date} onChange={(v) => setParam("date", v)} />
        </div>

        {/* Tozalash */}
        {hasActiveFilters && (
          <button
            type="button"
            className="btn btn-sm btn-subtle"
            onClick={clearFilters}
            style={{ height: 36, alignSelf: "flex-end" }}
          >
            {tx("common.tozalash") || "Tozalash"}
          </button>
        )}
      </FilterBar>

      {/* 3. Main Timeline Table */}
      <div className="table-card-clean">
        {loading ? (
          <TableSkeleton rows={8} />
        ) : !items || items.length === 0 ? (
          <EmptyState
            icon="📜"
            title={tx("feed.yozuv_topilmadi") || "Faoliyat yozuvlari topilmadi"}
            message={
              hasActiveFilters
                ? tx("feed.filtrni_boshatib_koring") || "Qidiruv yoki filtrlarni o'zgartirib ko'ring."
                : "Hozircha tizimda hech qanday faoliyat yozuvi mavjud emas."
            }
            actionLabel={hasActiveFilters ? (tx("common.tozalash") || "Filtrni tozalash") : undefined}
            onAction={hasActiveFilters ? clearFilters : undefined}
          />
        ) : (
          <>
            <table className="table-clean">
              <thead>
                <tr>
                  <th style={{ width: "24%" }}>Foydalanuvchi</th>
                  <th style={{ width: "32%" }}>Harakat (Amal)</th>
                  <th style={{ width: "22%" }}>Obyekt</th>
                  <th style={{ width: "11%" }}>Sana</th>
                  <th style={{ width: "11%", textAlign: "right" }}>Vaqt</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => {
                  const dt = fmtDateTime(a.created_at);
                  const [datePart, timePart] = dt.includes(" ") ? dt.split(" ") : [fmtDate(a.created_at), ""];
                  const catStyle = CATEGORY_COLORS[a.category] || CATEGORY_COLORS.system;

                  return (
                    <tr key={a.id}>
                      {/* 1. Foydalanuvchi */}
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {a.actor ? (
                            <>
                              <Avatar user={a.actor} size="sm" />
                              <div style={{ minWidth: 0 }}>
                                <span style={{ fontWeight: 600, color: "var(--text)", display: "block" }}>
                                  {a.actor.full_name}
                                </span>
                                {a.actor.specialty_display && (
                                  <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                                    {a.actor.specialty_display}
                                  </span>
                                )}
                              </div>
                            </>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 18 }}>🤖</span>
                              <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>Tizim</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 2. Harakat (Amal) */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 600,
                                background: catStyle.bg,
                                color: catStyle.color,
                              }}
                            >
                              {catStyle.label}
                            </span>
                            <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>
                              {formatSummaryText(a.summary, a.task_code || undefined)}
                            </span>
                          </div>
                          {a.detail && (
                            <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>
                              {a.detail}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 3. Obyekt */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {a.task && a.task_code ? (
                            <Link
                              {...toTask(a.task)}
                              style={{
                                fontWeight: 600,
                                color: "var(--accent)",
                                fontFamily: "var(--mono, monospace)",
                                fontSize: 13,
                              }}
                            >
                              #{a.task_code}
                            </Link>
                          ) : null}

                          {a.project && a.project_name ? (
                            <Link
                              {...toProject(a.project)}
                              style={{
                                fontSize: 12.5,
                                color: a.task ? "var(--text-muted)" : "var(--text)",
                                textDecoration: "none",
                              }}
                            >
                              📁 {a.project_name}
                            </Link>
                          ) : null}

                          {!a.task && !a.project && a.target_label ? (
                            <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                              {a.target_label}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* 4. Sana */}
                      <td>
                        <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>
                          {datePart}
                        </span>
                      </td>

                      {/* 5. Vaqt */}
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>
                            {timePart || dt}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            {timeAgo(a.created_at)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination footer */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 20px",
                borderTop: "1px solid var(--border-muted)",
              }}
            >
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Jami: <strong>{totalCount}</strong> ta yozuv
              </span>

              {totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={page <= 1}
                    onClick={() => setParam("page", String(page - 1))}
                  >
                    Oldingi
                  </button>
                  <span style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "0 6px" }}>
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={page >= totalPages}
                    onClick={() => setParam("page", String(page + 1))}
                  >
                    Keyingi
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
