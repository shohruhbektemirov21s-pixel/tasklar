import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { listOf, pagesOf, totalOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { Project } from "@/api/types";
import { IconCalendar, IconPlus, IconSearch } from "@/components/icons";
import {
  Avatar,
  DUE_PERIODS,
  EmptyState,
  ErrorMsg,
  FilterBar,
  PageHeader,
  Pager,
  Progress,
  TableSkeleton,
  fmtDate,
} from "@/components/ui";
import { toNewProject, toProject, useGo } from "@/nav";
import { tx } from "@/i18n";

const PER_PAGE = 20;

export default function Projects() {
  const fid = useId();
  const go = useGo();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [period, setPeriod] = useState("");
  const [sortBy, setSortBy] = useState("updated_at");
  const [page, setPage] = useState(1);

  const { data, error, loading } = useFetch<{ count: number; results: Project[] } | Project[]>(
    "/projects/",
    {
      scope: "visible",
      search,
      period,
      status,
      page,
      page_size: PER_PAGE,
    },
    { debounceMs: 250 }
  );

  const projectsRaw = useMemo(() => (data ? listOf<Project>(data) : null), [data]);
  const pages = pagesOf(data, PER_PAGE);

  // Client-side sorting agar kerak bo'lsa
  const sortedProjects = useMemo(() => {
    if (!projectsRaw) return null;
    const list = [...projectsRaw];
    if (sortBy === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "due_date") {
      list.sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      });
    } else if (sortBy === "progress") {
      list.sort((a, b) => b.progress - a.progress);
    } else {
      // updated_at
      list.sort((a, b) => {
        const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return tb - ta;
      });
    }
    return list;
  }, [projectsRaw, sortBy]);

  const getStatusBadge = (p: Project) => {
    switch (p.status) {
      case "ACTIVE":
        return <span className="badge badge-info"><span className="badge-dot" aria-hidden="true" />{tx("projects.holat_faol", undefined, "Faol")}</span>;
      case "PLANNING":
        return <span className="badge"><span className="badge-dot" aria-hidden="true" />{tx("projects.holat_rejalashtirilgan", undefined, "Rejalashtirilgan")}</span>;
      case "DONE":
        return <span className="badge badge-ok"><span className="badge-dot" aria-hidden="true" />{tx("projects.holat_yakunlangan", undefined, "Yakunlangan")}</span>;
      case "PAUSED":
        return <span className="badge badge-warn"><span className="badge-dot" aria-hidden="true" />{tx("projects.holat_toxtatilgan", undefined, "To'xtatilgan")}</span>;
      default:
        return <span className="badge"><span className="badge-dot" aria-hidden="true" />{p.status_display || p.status}</span>;
    }
  };

  return (
    <div className="content">
      <PageHeader
        title={tx("common.loyihalar", undefined, "Loyihalar")}
        subtitle={tx("projects.sahifa_izohi", undefined, "Barcha faol va rejalashtirilgan loyihalar boshqaruvi")}
        action={
          user?.can_create_project ? (
            <Link className="btn btn-primary" {...toNewProject()}>
              <IconPlus size={16} />
              <span>{tx("common.yangi_loyiha", undefined, "+ Yangi loyiha")}</span>
            </Link>
          ) : undefined
        }
      />

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
            placeholder={tx("projects.qidiruv_placeholder", undefined, "Loyihani qidirish...")}
          />
        </div>

        <div className="filter-select-box">
          <select
            id={`${fid}-status`}
            className="filter-select"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{tx("projects.barcha_holatlar", undefined, "Barcha holatlar")}</option>
            <option value="ACTIVE">{tx("projects.holat_faol", undefined, "Faol")}</option>
            <option value="PLANNING">{tx("projects.holat_rejalashtirilgan", undefined, "Rejalashtirilgan")}</option>
            <option value="DONE">{tx("projects.holat_yakunlangan", undefined, "Yakunlangan")}</option>
            <option value="PAUSED">{tx("projects.holat_toxtatilgan", undefined, "To'xtatilgan")}</option>
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
            <option value="">{tx("projects.barcha_muddatlar", undefined, "Barcha muddatlar")}</option>
            {DUE_PERIODS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-select-box">
          <select
            id={`${fid}-sort`}
            className="filter-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="updated_at">{tx("projects.saralash_yangilangan", undefined, "So'nggi yangilanish")}</option>
            <option value="name">{tx("projects.saralash_nomi", undefined, "Nomi bo'yicha")}</option>
            <option value="due_date">{tx("projects.saralash_muddat", undefined, "Muddati bo'yicha")}</option>
            <option value="progress">{tx("projects.saralash_progress", undefined, "Jarayon bo'yicha")}</option>
          </select>
        </div>

        {(!!search || !!status || !!period) && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setSearch("");
              setStatus("");
              setPeriod("");
              setPage(1);
            }}
          >
            {tx("common.tozalash", undefined, "Tozalash")}
          </button>
        )}
      </FilterBar>

      <ErrorMsg error={error} />

      <div className="table-card-clean">
        {loading && !sortedProjects?.length ? (
          <TableSkeleton rows={6} cols={6} />
        ) : !sortedProjects || sortedProjects.length === 0 ? (
          <EmptyState
            icon="📁"
            title={tx("common.loyiha_topilmadi", undefined, "Loyihalar topilmadi")}
            message={
              search || status || period
                ? tx("projects.filtr_natijasi_yoq", undefined, "Tanlangan filtrlar bo'yicha hech qanday loyiha topilmadi.")
                : tx("projects.hali_loyiha_mavjud_emas", undefined, "Hozircha tizimda loyihalar mavjud emas.")
            }
            action={
              user?.can_create_project ? (
                <Link className="btn btn-primary" {...toNewProject()}>
                  <IconPlus size={14} />
                  <span>{tx("common.yangi_loyiha", undefined, "+ Yangi loyiha")}</span>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table-clean">
              <thead>
                <tr>
                  <th style={{ width: 44, textAlign: "center" }}>№</th>
                  <th>{tx("projects.ustun_loyiha", undefined, "Loyiha nomi")}</th>
                  <th>{tx("projects.ustun_holat", undefined, "Holati")}</th>
                  <th>{tx("projects.ustun_masul", undefined, "Mas'ul shaxs")}</th>
                  <th style={{ width: 180 }}>{tx("projects.ustun_jarayon", undefined, "Jarayon")}</th>
                  <th>{tx("projects.ustun_muddat", undefined, "Muddati")}</th>
                  <th>{tx("projects.ustun_tahrirlangan", undefined, "So'nggi yangilanish")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedProjects.map((p, idx) => (
                  <tr
                    key={p.id}
                    className="clickable"
                    onClick={() => go(toProject(p.id))}
                  >
                    <td style={{ textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>
                      {(page - 1) * PER_PAGE + idx + 1}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: p.color || "var(--accent)",
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <Link
                            className="nowrap"
                            {...toProject(p.id)}
                            style={{
                              fontWeight: 650,
                              fontSize: 14,
                              color: "var(--text)",
                              display: "inline-block",
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {p.name}
                          </Link>
                          {p.description && (
                            <div
                              style={{
                                fontSize: 12,
                                color: "var(--muted)",
                                marginTop: 2,
                                maxWidth: 360,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {p.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{getStatusBadge(p)}</td>
                    <td>
                      {p.manager ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Avatar user={p.manager} size="sm" showHoverCard={false} />
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{p.manager.full_name}</span>
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: 12.5 }}>
                          {tx("projects.menejer_tayinlanmagan", undefined, "Tayinlanmagan")}
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)" }}>
                          <span>{p.open_tasks} {tx("common.ochiq_vazifa", undefined, "ochiq")}</span>
                          <strong style={{ color: "var(--text)" }}>{p.progress}%</strong>
                        </div>
                        <Progress value={p.progress} />
                      </div>
                    </td>
                    <td className="nowrap" style={{ fontSize: 13, color: "var(--muted)" }}>
                      {p.due_date ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <IconCalendar size={13} />
                          {fmtDate(p.due_date)}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="nowrap" style={{ fontSize: 12.5, color: "var(--muted)" }}>
                      {p.updated_at ? fmtDate(p.updated_at) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pages > 1 && <Pager page={page} pages={pages} onPick={setPage} />}
    </div>
  );
}
