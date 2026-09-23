import { Suspense, lazy, useEffect, useId, useMemo, useState } from "react";
import { listOf, pagesOf, totalOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { Activity, ActivityStats, Paginated, Project, UserBrief } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Avatar, Empty, ErrorMsg, Loading, Pager, fmtDateTime, timeAgo } from "@/components/ui";
import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconChat,
  IconLayers,
  IconSearch,
  IconTasks,
} from "@/components/icons";
import { useNavParams } from "@/nav";
import { tx } from "@/i18n";
import { Button, ButtonGroup } from "@/components/Button";

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
    if (actor.is_boss) return { label: tx("role.boshliq", undefined, "Boshliq"), bg: "var(--attention-soft)", color: "var(--attention)" };
    if (actor.is_manager) return { label: tx("role.loyiha_menejeri", undefined, "Loyiha menejeri"), bg: "var(--done-soft)", color: "var(--done)" };
    if (actor.is_platform_admin) return { label: tx("role.administrator", undefined, "Admin"), bg: "var(--accent-soft)", color: "var(--accent)" };
    return {
      label: actor.specialty_display || actor.job_title || tx("role.xodim", undefined, "Xodim"),
      bg: "var(--surface-2)",
      color: "var(--text)",
    };
  }

  function getVerbMeta(item: Activity) {
    if (item.verb === "task.status" || item.verb === "task.approved") {
      return {
        color: "var(--success)",
        bg: "var(--success-soft)",
        icon: <IconCheck size={14} />,
        label: tx("work_done.verb_done", undefined, "Bajarildi"),
      };
    }
    if (item.verb === "task.commented") {
      return {
        color: "var(--accent)",
        bg: "var(--accent-soft)",
        icon: <IconChat size={14} />,
        label: tx("work_done.verb_comment", undefined, "Izoh"),
      };
    }
    if (item.verb === "task.worklog") {
      return {
        color: "var(--attention)",
        bg: "var(--attention-soft)",
        icon: <IconClock size={14} />,
        label: tx("work_done.verb_worklog", undefined, "Ish vaqti"),
      };
    }
    if (item.verb === "task.created") {
      return {
        color: "var(--done)",
        bg: "var(--done-soft)",
        icon: <IconTasks size={14} />,
        label: tx("work_done.verb_created", undefined, "Yangi vazifa"),
      };
    }
    if (item.verb === "task.rejected") {
      return {
        color: "var(--danger)",
        bg: "var(--danger-soft)",
        icon: <span style={{ fontWeight: 700 }}>✕</span>,
        label: tx("work_done.verb_rejected", undefined, "Qaytarildi"),
      };
    }
    return {
      color: "var(--muted)",
      bg: "var(--surface-2)",
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
            <Button size="sm" loading={isRefreshing} onClick={handleRefresh}
                    title={tx("common.yangilash", undefined, "Yangilash")}>
              {tx("common.yangilash", undefined, "Yangilash")}
            </Button>
          </div>
        }
      />

      {/* 1. Toifalar paneli */}
      <ButtonGroup className="btn-group-scroll mb" aria-label={tx("work_done.sarlavha", undefined, "Qilingan ishlar")}>
        {[
          { key: "all", icon: <IconLayers size={14} />, label: tx("work_done.tab_hammasi", undefined, "Hammasi"), count: stats?.total, tone: "" },
          { key: "done", icon: <IconCheck size={14} />, label: tx("work_done.tab_bajarilgan", undefined, "Bajarilganlar"), count: stats?.tasks_done, tone: "ok" },
          { key: "todo", icon: <IconClock size={14} />, label: tx("work_done.tab_nazoratdagilar", undefined, "Nazoratdagilar"), count: stats?.tasks_todo, tone: "warn" },
          { key: "overdue", icon: <IconAlertTriangle size={14} />, label: tx("work_done.tab_kechiktirilgan", undefined, "Kechiktirilgan"), count: stats?.tasks_overdue, tone: "bad" },
          { key: "comments", icon: <IconChat size={14} />, label: tx("work_done.tab_izohlar", undefined, "Izohlar"), count: stats?.comments, tone: "" },
          { key: "worklogs", icon: <IconClock size={14} />, label: tx("work_done.tab_ish_jurnali", undefined, "Ish jurnali"), count: stats?.worklogs, tone: "" },
          { key: "status", icon: <IconTasks size={14} />, label: tx("work_done.tab_holatlar", undefined, "Holat o'zgarishlari"), count: undefined, tone: "" },
        ].map((t) => (
          <Button
            key={t.key}
            size="sm"
            icon={t.icon}
            active={t.key === "all" ? activeTab === "all" || !activeTab : activeTab === t.key}
            onClick={() => updateParam("tab", t.key === "all" ? undefined : t.key)}
          >
            {t.label}
            {!!t.count && <span className={`btn-count ${t.tone}`}>{t.count}</span>}
          </Button>
        ))}
      </ButtonGroup>

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
                className="input-clear"
                onClick={() => setSearch("")}
                title={tx("common.tozalash", undefined, "Tozalash")}
                aria-label={tx("common.tozalash", undefined, "Tozalash")}
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
            <Button
              variant="danger" size="sm"
              onClick={clearAllFilters}
              title={tx("work_done.tozalash", undefined, "Filtrlarni tozalash")}
            >
              ✕ {tx("common.tozalash", undefined, "Tozalash")}
            </Button>
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
              <span className="chip">
                <span>🔍 "{search}"</span>
                <button type="button" className="chip-x" onClick={() => setSearch("")}
                        aria-label={tx("common.tozalash", undefined, "Tozalash")}>
                  ✕
                </button>
              </span>
            )}

            {selectedProjectObj && (
              <span className="chip">
                <span>📁 {selectedProjectObj.name}</span>
                <button type="button" className="chip-x" onClick={() => updateParam("project", undefined)}
                        aria-label={tx("common.tozalash", undefined, "Tozalash")}>
                  ✕
                </button>
              </span>
            )}


            {selectedDays && (
              <span className="chip">
                <span>📅 {selectedDays === "1" ? tx("work_done.davr_bugun", undefined, "Bugun") : tx("work_done.oxirgi_n_kun", { n: selectedDays })}</span>
                <button type="button" className="chip-x" onClick={() => updateParam("days", undefined)}
                        aria-label={tx("common.tozalash", undefined, "Tozalash")}>
                  ✕
                </button>
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
              <Button
                variant="primary"
                onClick={clearAllFilters}
                style={{ marginTop: 12 }}
              >
                {tx("work_done.barcha_filtrlarni_tozalash", undefined, "Barcha filtrlarni tozalash")}
              </Button>
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
                  boxShadow: "var(--shadow-xs)",
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
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenTask(item.task!, item.verb);
                        }}
                        variant="link" size="sm"
                        title={tx("work_done.vazifani_korish", undefined, "Vazifani ochish")}
                      >
                        {tx("work_done.korish", undefined, "Ko'rish")} →
                      </Button>
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
