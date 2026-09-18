import { Suspense, lazy, useEffect, useId, useMemo, useState } from "react";
import { listOf, pagesOf, totalOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { Activity, ActivityStats, Paginated, Project, UserBrief } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Avatar, Empty, ErrorMsg, Loading, Pager, fmtDateTime, timeAgo } from "@/components/ui";
import {
  IconCheck,
  IconClock,
  IconChat,
  IconLayers,
  IconSearch,
  IconTasks,
  IconProject,
  IconUsers,
} from "@/components/icons";
import { useNavParams } from "@/nav";
import { tx } from "@/i18n";

const TaskDetailModal = lazy(() => import("@/pages/TaskDetail"));

const PAGE_SIZE = 25;

export default function WorkDone() {
  const fid = useId();
  const { user } = useAuth();
  const [params, setParams] = useNavParams();

  // Filtr parametrlari URL orqali
  const activeTab = params.get("tab") || "all";
  const selectedProject = params.get("project") || "";
  const selectedDays = params.get("days") || "";
  const initialSearch = params.get("q") || "";

  // Foydalanuvchi faqat O'ZINING qilingan ishlarini ko'radi
  const currentActorId = user ? String(user.id) : undefined;

  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(1);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedTaskSection, setSelectedTaskSection] = useState<string>("desc");
  const [isRefreshing, setIsRefreshing] = useState(false);

  function getSectionForVerb(verb?: string): string {
    if (!verb) return "desc";
    if (verb === "task.commented") return "comments";
    if (verb === "task.worklog") return "worklogs";
    if (verb === "task.attachment" || verb === "task.attachment_deleted") return "files";
    if (
      verb === "task.submitted" ||
      verb === "task.handover" ||
      verb === "task.handover_edited" ||
      verb === "task.handover_deleted" ||
      verb === "task.approved" ||
      verb === "task.changes_requested" ||
      verb === "task.rejected"
    ) {
      return "submission";
    }
    if (
      verb === "task.assigned" ||
      verb === "task.unassigned" ||
      verb === "task.reassigned" ||
      verb === "task.assignment_updated" ||
      verb === "task.assignment_removed"
    ) {
      return "team";
    }
    if (verb.startsWith("task.subtask")) return "subtasks";
    if (verb === "task.status" || verb === "task.updated" || verb === "task.blocked" || verb === "task.deleted") {
      return "history";
    }
    return "desc";
  }

  function handleOpenTask(taskPk: number, verb?: string) {
    setSelectedTaskId(taskPk);
    setSelectedTaskSection(getSectionForVerb(verb));
  }

  // Nav param yangilash yordamchisi
  function updateParam(key: string, val: string | undefined) {
    const next = new URLSearchParams(params);
    if (val) {
      next.set(key, val);
    } else {
      next.delete(key);
    }
    setParams(next, { replace: true });
    setPage(1);
  }

  function clearAllFilters() {
    setSearch("");
    setDebouncedSearch("");
    setParams(new URLSearchParams(), { replace: true });
    setPage(1);
  }

  // Debounced qidiruv
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      const next = new URLSearchParams(params);
      if (search) {
        next.set("q", search);
      } else {
        next.delete("q");
      }
      setParams(next, { replace: true });
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tab bo'yicha filtrlar
  const { verbFilter, taskStatusFilter, overdueFilter } = useMemo(() => {
    switch (activeTab) {
      case "done":
        return { verbFilter: "task.status,task.approved", taskStatusFilter: "", overdueFilter: false };
      case "todo":
        return { verbFilter: "", taskStatusFilter: "TODO,IN_PROGRESS,BLOCKED", overdueFilter: false };
      case "overdue":
        return { verbFilter: "", taskStatusFilter: "", overdueFilter: true };
      case "comments":
        return { verbFilter: "task.commented", taskStatusFilter: "", overdueFilter: false };
      case "worklogs":
        return { verbFilter: "task.worklog", taskStatusFilter: "", overdueFilter: false };
      case "status":
        return { verbFilter: "task.status,task.submitted,task.approved,task.rejected", taskStatusFilter: "", overdueFilter: false };
      default:
        return { verbFilter: "", taskStatusFilter: "", overdueFilter: false };
    }
  }, [activeTab]);

  // Statistikalar (backend /api/activity/stats/ dan olinadi) - faqat o'ziniki
  const { data: stats, reload: reloadStats } = useFetch<ActivityStats>("/activity/stats/", {
    project: selectedProject || undefined,
    actor: currentActorId,
  });

  // Loyihalar ro'yxati (filtr uchun)
  const { data: projectsData } = useFetch<Project[] | Paginated<Project>>("/projects/?page_size=200");
  const projects = useMemo(() => listOf<Project>(projectsData), [projectsData]);

  // Faoliyat lentasi - faqat o'ziniki
  const queryParams = useMemo(() => ({
    page,
    page_size: PAGE_SIZE,
    verb: verbFilter || undefined,
    task_status: taskStatusFilter || undefined,
    overdue: overdueFilter ? "1" : undefined,
    project: selectedProject || undefined,
    actor: currentActorId,
    days: selectedDays || undefined,
    search: debouncedSearch || undefined,
  }), [page, verbFilter, taskStatusFilter, overdueFilter, selectedProject, currentActorId, selectedDays, debouncedSearch]);

  const { data, loading, error, reload: reloadActivities } = useFetch<Paginated<Activity>>("/activity/", queryParams);

  const activities = useMemo(() => listOf<Activity>(data), [data]);
  const totalCount = totalOf(data);
  const totalPages = pagesOf(data, PAGE_SIZE);

  async function handleRefresh() {
    setIsRefreshing(true);
    await Promise.all([reloadActivities(), reloadStats()]);
    setTimeout(() => setIsRefreshing(false), 500);
  }

  function getRoleBadge(actor?: UserBrief | null) {
    if (!actor) return { label: tx("common.tizim", undefined, "Tizim"), bg: "var(--surface-2)", color: "var(--muted)" };
    if (actor.is_boss) return { label: tx("role.boshliq", undefined, "Boshliq"), bg: "rgba(245, 158, 11, 0.15)", color: "#f59e0b" };
    if (actor.is_manager) return { label: tx("role.loyiha_menejeri", undefined, "Loyiha menejeri"), bg: "rgba(139, 92, 246, 0.15)", color: "#8b5cf6" };
    if (actor.is_platform_admin) return { label: tx("role.administrator", undefined, "Admin"), bg: "rgba(59, 130, 246, 0.15)", color: "#3b82f6" };
    return {
      label: actor.specialty_display || actor.job_title || tx("role.xodim", undefined, "Xodim"),
      bg: "var(--surface-2)",
      color: "var(--text)",
    };
  }

  function getVerbMeta(item: Activity) {
    if (item.verb === "task.status" || item.verb === "task.approved") {
      return {
        color: "#10b981",
        bg: "rgba(16, 185, 129, 0.1)",
        icon: <IconCheck size={14} />,
        label: tx("work_done.verb_done", undefined, "Bajarildi"),
      };
    }
    if (item.verb === "task.commented") {
      return {
        color: "#3b82f6",
        bg: "rgba(59, 130, 246, 0.1)",
        icon: <IconChat size={14} />,
        label: tx("work_done.verb_comment", undefined, "Izoh"),
      };
    }
    if (item.verb === "task.worklog") {
      return {
        color: "#f59e0b",
        bg: "rgba(245, 158, 11, 0.1)",
        icon: <IconClock size={14} />,
        label: tx("work_done.verb_worklog", undefined, "Ish vaqti"),
      };
    }
    if (item.verb === "task.created") {
      return {
        color: "#8b5cf6",
        bg: "rgba(139, 92, 246, 0.1)",
        icon: <IconTasks size={14} />,
        label: tx("work_done.verb_created", undefined, "Yangi vazifa"),
      };
    }
    if (item.verb === "task.rejected") {
      return {
        color: "#ef4444",
        bg: "rgba(239, 68, 68, 0.1)",
        icon: <span style={{ fontWeight: 700 }}>✕</span>,
        label: tx("work_done.verb_rejected", undefined, "Qaytarildi"),
      };
    }
    return {
      color: "#64748b",
      bg: "rgba(100, 116, 139, 0.1)",
      icon: <IconLayers size={14} />,
      label: tx("work_done.verb_updated", undefined, "Yangilanish"),
    };
  }

  const hasActiveFilters = Boolean(
    selectedProject || selectedDays || search || (activeTab && activeTab !== "all")
  );

  const selectedProjectObj = projects.find((p) => String(p.id) === selectedProject);

  return (
    <div className="page-work-done" style={{ maxWidth: 1160, margin: "0 auto", padding: "0 8px 32px" }}>
      <PageHead
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>📋</span>
            <strong>{tx("work_done.sarlavha", undefined, "Qilingan ishlar")}</strong>
          </div>
        }
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!!totalCount && (
              <span className="badge" style={{ fontSize: 12, padding: "4px 10px" }}>
                {totalCount} {tx("common.ta", undefined, "ta")} {tx("work_done.yozuv", undefined, "yozuv")}
              </span>
            )}
            <button
              type="button"
              className={`btn btn-sm ${isRefreshing ? "loading" : ""}`}
              onClick={handleRefresh}
              disabled={isRefreshing}
              title={tx("common.yangilash", undefined, "Yangilash")}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <span style={{ display: "inline-block", transform: isRefreshing ? "rotate(180deg)" : "none", transition: "transform 0.4s ease" }}>
                🔄
              </span>
              <span>{tx("common.yangilash", undefined, "Yangilash")}</span>
            </button>
          </div>
        }
      />

      {/* 1. Toifalar paneli (Segmented tab bar) */}
      <div
        className="card"
        style={{
          padding: "8px",
          borderRadius: 12,
          marginBottom: 16,
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
            paddingBottom: 2,
          }}
        >
          {/* Tab: Hammasi */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => updateParam("tab", undefined)}
            style={{
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: 13,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: activeTab === "all" || !activeTab ? "var(--accent)" : "transparent",
              color: activeTab === "all" || !activeTab ? "#fff" : "var(--text)",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <IconLayers size={14} />
            <span>{tx("work_done.tab_hammasi", undefined, "Hammasi")}</span>
            {typeof stats?.total === "number" && stats.total > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 10,
                  background: activeTab === "all" || !activeTab ? "rgba(255,255,255,0.25)" : "var(--surface-2)",
                  color: activeTab === "all" || !activeTab ? "#fff" : "var(--muted)",
                }}
              >
                {stats.total}
              </span>
            )}
          </button>

          {/* Tab: Bajarilganlar */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => updateParam("tab", "done")}
            style={{
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: 13,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: activeTab === "done" ? "var(--accent)" : "transparent",
              color: activeTab === "done" ? "#fff" : "var(--text)",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <IconCheck size={14} />
            <span>{tx("work_done.tab_bajariladiganlar", undefined, "Bajarilganlar")}</span>
            {typeof stats?.tasks_done === "number" && stats.tasks_done > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 10,
                  background: activeTab === "done" ? "rgba(255,255,255,0.25)" : "var(--surface-2)",
                  color: activeTab === "done" ? "#fff" : "#10b981",
                }}
              >
                {stats.tasks_done}
              </span>
            )}
          </button>

          {/* Tab: Nazoratdagilar */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => updateParam("tab", "todo")}
            style={{
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: 13,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: activeTab === "todo" ? "var(--accent)" : "transparent",
              color: activeTab === "todo" ? "#fff" : "var(--text)",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <IconClock size={14} />
            <span>{tx("work_done.tab_nazoratdagilar", undefined, "Nazoratdagilar")}</span>
            {typeof stats?.tasks_todo === "number" && stats.tasks_todo > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 10,
                  background: activeTab === "todo" ? "rgba(255,255,255,0.25)" : "var(--surface-2)",
                  color: activeTab === "todo" ? "#fff" : "#f59e0b",
                }}
              >
                {stats.tasks_todo}
              </span>
            )}
          </button>

          {/* Tab: Kechiktirilgan */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => updateParam("tab", "overdue")}
            style={{
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: 13,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: activeTab === "overdue" ? "var(--accent)" : "transparent",
              color: activeTab === "overdue" ? "#fff" : "var(--text)",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ fontSize: 13 }}>⚠️</span>
            <span>{tx("work_done.tab_kechiktirilgan", undefined, "Kechiktirilgan")}</span>
            {typeof stats?.tasks_overdue === "number" && stats.tasks_overdue > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 10,
                  background: activeTab === "overdue" ? "rgba(255,255,255,0.25)" : "rgba(239, 68, 68, 0.15)",
                  color: activeTab === "overdue" ? "#fff" : "#ef4444",
                }}
              >
                {stats.tasks_overdue}
              </span>
            )}
          </button>

          {/* Tab: Izohlar */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => updateParam("tab", "comments")}
            style={{
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: 13,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: activeTab === "comments" ? "var(--accent)" : "transparent",
              color: activeTab === "comments" ? "#fff" : "var(--text)",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <IconChat size={14} />
            <span>{tx("work_done.tab_izohlar", undefined, "Izohlar")}</span>
            {typeof stats?.comments === "number" && stats.comments > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 10,
                  background: activeTab === "comments" ? "rgba(255,255,255,0.25)" : "var(--surface-2)",
                  color: activeTab === "comments" ? "#fff" : "var(--muted)",
                }}
              >
                {stats.comments}
              </span>
            )}
          </button>

          {/* Tab: Ish jurnali */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => updateParam("tab", "worklogs")}
            style={{
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: 13,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: activeTab === "worklogs" ? "var(--accent)" : "transparent",
              color: activeTab === "worklogs" ? "#fff" : "var(--text)",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <IconClock size={14} />
            <span>{tx("work_done.tab_ish_jurnali", undefined, "Ish jurnali")}</span>
            {typeof stats?.worklogs === "number" && stats.worklogs > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 10,
                  background: activeTab === "worklogs" ? "rgba(255,255,255,0.25)" : "var(--surface-2)",
                  color: activeTab === "worklogs" ? "#fff" : "var(--muted)",
                }}
              >
                {stats.worklogs}
              </span>
            )}
          </button>

          {/* Tab: Holat o'zgarishlari */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => updateParam("tab", "status")}
            style={{
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: 13,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: activeTab === "status" ? "var(--accent)" : "transparent",
              color: activeTab === "status" ? "#fff" : "var(--text)",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <IconTasks size={14} />
            <span>{tx("work_done.tab_holatlar", undefined, "Holat o'zgarishlari")}</span>
          </button>
        </div>
      </div>

      {/* 2. Qidiruv va Filtrlar qatori */}
      <div
        className="card"
        style={{
          padding: "12px 16px",
          borderRadius: 12,
          marginBottom: 16,
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
          }}
        >
          {/* Qidiruv input */}
          <div style={{ position: "relative", flex: "1 1 260px" }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--muted)",
                pointerEvents: "none",
                display: "flex",
                alignItems: "center",
              }}
            >
              <IconSearch size={15} />
            </span>
            <input
              id={`${fid}-search`}
              type="text"
              className="input"
              style={{
                paddingLeft: 36,
                paddingRight: search ? 32 : 12,
                width: "100%",
                borderRadius: 8,
                height: 38,
                fontSize: 13.5,
                background: "var(--canvas-inset)",
                border: "1px solid var(--border)",
              }}
              placeholder={tx("work_done.qidirish", undefined, "Izoh, vazifa yoki loyiha bo'yicha qidirish...")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "var(--muted)",
                  cursor: "pointer",
                  fontSize: 14,
                  padding: 2,
                }}
                title="Tozalash"
              >
                ✕
              </button>
            )}
          </div>

          {/* Loyiha tanlash */}
          <div style={{ flex: "0 1 200px" }}>
            <select
              id={`${fid}-project`}
              className="input"
              style={{
                width: "100%",
                borderRadius: 8,
                height: 38,
                fontSize: 13,
                background: "var(--canvas-inset)",
                border: "1px solid var(--border)",
              }}
              value={selectedProject}
              onChange={(e) => updateParam("project", e.target.value || undefined)}
            >
              <option value="">{tx("work_done.barcha_loyihalar", undefined, "Barcha loyihalar")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Davr tanlash */}
          <div style={{ flex: "0 1 140px" }}>
            <select
              id={`${fid}-days`}
              className="input"
              style={{
                width: "100%",
                borderRadius: 8,
                height: 38,
                fontSize: 13,
                background: "var(--canvas-inset)",
                border: "1px solid var(--border)",
              }}
              value={selectedDays}
              onChange={(e) => updateParam("days", e.target.value || undefined)}
            >
              <option value="">{tx("work_done.davr_barchasi", undefined, "Barcha vaqt")}</option>
              <option value="1">{tx("work_done.davr_bugun", undefined, "Bugun")}</option>
              <option value="7">{tx("work_done.davr_oxirgi_7_kun", undefined, "Oxirgi 7 kun")}</option>
              <option value="30">{tx("work_done.davr_oxirgi_30_kun", undefined, "Oxirgi 30 kun")}</option>
            </select>
          </div>

          {/* Filtrlarni tozalash tugmasi */}
          {hasActiveFilters && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={clearAllFilters}
              style={{
                borderRadius: 8,
                height: 38,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                color: "var(--danger, #ef4444)",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
              title={tx("work_done.tozalash", undefined, "Filtrlarni tozalash")}
            >
              <span>✕</span>
              <span>{tx("common.tozalash", undefined, "Tozalash")}</span>
            </button>
          )}
        </div>

        {/* Faol filtr teglari (Active filter tags) */}
        {hasActiveFilters && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px dashed var(--border)",
            }}
          >
            <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>
              {tx("common.faol_filtrlar", undefined, "Faol filtrlar")}:
            </span>

            {search && (
              <span
                className="badge"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 8px",
                  fontSize: 12,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                }}
              >
                <span>🔍 "{search}"</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => setSearch("")}
                  style={{ cursor: "pointer", color: "var(--muted)", fontWeight: 700 }}
                >
                  ✕
                </span>
              </span>
            )}

            {selectedProjectObj && (
              <span
                className="badge"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 8px",
                  fontSize: 12,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                }}
              >
                <span>📁 {selectedProjectObj.name}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => updateParam("project", undefined)}
                  style={{ cursor: "pointer", color: "var(--muted)", fontWeight: 700 }}
                >
                  ✕
                </span>
              </span>
            )}


            {selectedDays && (
              <span
                className="badge"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 8px",
                  fontSize: 12,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                }}
              >
                <span>📅 {selectedDays === "1" ? "Bugun" : `Oxirgi ${selectedDays} kun`}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => updateParam("days", undefined)}
                  style={{ cursor: "pointer", color: "var(--muted)", fontWeight: 700 }}
                >
                  ✕
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Xatolik holati */}
      {error && <ErrorMsg error={error} />}

      {/* Yuklanish holati */}
      {loading && !activities.length && <Loading text={tx("app.yuklanmoqda", undefined, "Ma'lumotlar yuklanmoqda...")} />}

      {/* Bo'sh ro'yxat */}
      {!loading && !activities.length && (
        <div className="card" style={{ padding: "48px 24px", borderRadius: 14, textAlign: "center" }}>
          <Empty
            icon="📋"
            title={tx("work_done.bosh_holat", undefined, "Tanlangan filtrlar bo'yicha hech qanday hisobot yoki faoliyat topilmadi")}
            text={tx("work_done.bosh_holat_matn", undefined, "Filtrlarni o'zgartiring yoki tozalab qaytadan ko'ring.")}
          >
            {hasActiveFilters && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={clearAllFilters}
                style={{ marginTop: 12 }}
              >
                {tx("work_done.barcha_filtrlarni_tozalash", undefined, "Barcha filtrlarni tozalash")}
              </button>
            )}
          </Empty>
        </div>
      )}

      {/* 3. Faoliyat kartalari ro'yxati (Activity Feed) */}
      {activities.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {activities.map((item) => {
            const verbMeta = getVerbMeta(item);
            const roleBadge = getRoleBadge(item.actor);

            return (
              <div
                key={item.id}
                className="card"
                onClick={() => {
                  if (item.task) {
                    handleOpenTask(item.task, item.verb);
                  }
                }}
                style={{
                  padding: "16px 20px",
                  borderRadius: 12,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
                  transition: "all 0.15s ease",
                  cursor: item.task ? "pointer" : "default",
                }}
              >
                {/* Tepa qator: Foydalanuvchi + Rol + Loyiha + Vaqt + Amal */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 12,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <Avatar user={item.actor} size="sm" />
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
                            {item.actor ? item.actor.full_name : tx("common.tizim", undefined, "Tizim")}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              background: roleBadge.bg,
                              color: roleBadge.color,
                              padding: "2px 7px",
                              borderRadius: 6,
                              border: "1px solid var(--border)",
                            }}
                          >
                            {roleBadge.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    {item.project_name && (
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 12.5,
                          marginLeft: 4,
                          paddingLeft: 8,
                          borderLeft: "1px solid var(--border)",
                        }}
                      >
                        <span className="lang-dot" style={{ background: "var(--accent)" }} />
                        {item.task ? (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenTask(item.task!, item.verb);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                handleOpenTask(item.task!, item.verb);
                              }
                            }}
                            style={{
                              fontWeight: 600,
                              color: "var(--accent)",
                              cursor: "pointer",
                            }}
                            title={tx("work_done.vazifani_korish", undefined, "Vazifani ochish")}
                          >
                            {item.project_name}
                          </span>
                        ) : (
                          <span style={{ fontWeight: 600, color: "var(--accent)" }}>{item.project_name}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      className="muted nowrap"
                      style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}
                      title={fmtDateTime(item.created_at)}
                    >
                      <IconClock size={12} />
                      {timeAgo(item.created_at)}
                    </span>
                    {item.task && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenTask(item.task!, item.verb);
                        }}
                        className="btn btn-ghost btn-sm"
                        style={{
                          padding: "3px 8px",
                          fontSize: 12,
                          color: "var(--accent)",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                        title={tx("work_done.vazifani_korish", undefined, "Vazifani ochish")}
                      >
                        {tx("work_done.korish", undefined, "Ko'rish")} →
                      </button>
                    )}
                  </div>
                </div>

                {/* Ichki harakat bloki (bosilganda shu oynada vazifa modali ochiladi) */}
                <div
                  role={item.task ? "button" : undefined}
                  tabIndex={item.task ? 0 : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.task) {
                      handleOpenTask(item.task, item.verb);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      if (item.task) {
                        handleOpenTask(item.task, item.verb);
                      }
                    }
                  }}
                  style={{
                    background: "var(--canvas-inset)",
                    border: "1px solid var(--border)",
                    borderLeft: `4px solid ${verbMeta.color}`,
                    borderRadius: 8,
                    padding: "12px 16px",
                    cursor: item.task ? "pointer" : "default",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", borderBottom: item.detail ? "1px solid var(--border)" : "none", paddingBottom: item.detail ? 8 : 0, justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          background: verbMeta.bg,
                          color: verbMeta.color,
                          flexShrink: 0,
                        }}
                      >
                        {verbMeta.icon}
                      </span>
                      <strong style={{ fontSize: 13.5, color: "var(--text)" }}>
                        {item.summary}
                      </strong>
                    </div>

                    {item.task ? (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenTask(item.task!, item.verb);
                        }}
                        className="badge"
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "var(--accent)",
                          background: "var(--accent-soft)",
                          border: "1px solid var(--border)",
                          padding: "2px 8px",
                          borderRadius: 6,
                          flexShrink: 0,
                          cursor: "pointer",
                        }}
                        title={tx("work_done.vazifani_korish", undefined, "Vazifani ochish")}
                      >
                        {item.task_code ? `#${item.task_code}` : `#${item.task}`}
                      </span>
                    ) : null}
                  </div>

                  {item.detail && (
                    <div
                      style={{
                        color: "var(--muted)",
                        fontSize: 13,
                        lineHeight: 1.55,
                        marginTop: 8,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {item.detail}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* 4. Sahifalash (Pagination) */}
          {totalPages > 1 && (
            <div
              style={{
                marginTop: 20,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span className="muted" style={{ fontSize: 12.5 }}>
                {tx("common.sahifa", undefined, "Sahifa")} {page} / {totalPages} (jami {totalCount} ta)
              </span>
              <Pager page={page} pages={totalPages} onPick={setPage} />
            </div>
          )}
        </div>
      )}

      {/* Vazifa modal oynasi (in-place ko'rish va tahrirlash uchun) */}
      {selectedTaskId && (
        <Suspense fallback={null}>
          <TaskDetailModal
            taskId={selectedTaskId}
            initialSection={selectedTaskSection}
            onClose={() => {
              setSelectedTaskId(null);
              setSelectedTaskSection("desc");
              reloadActivities();
              reloadStats();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
