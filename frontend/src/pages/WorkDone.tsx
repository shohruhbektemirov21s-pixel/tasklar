import { Suspense, lazy, useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listOf, pagesOf, totalOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { Activity, ActivityStats, Paginated, Project, UserBrief } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { Avatar, Empty, ErrorMsg, Loading, Pager, SpecialtyTag, fmtDateTime, timeAgo } from "@/components/ui";
import { IconCheck, IconClock, IconChat, IconLayers, IconProject, IconSearch, IconTasks, IconUsers, IconHistory } from "@/components/icons";
import { toProject, useNavParams } from "@/nav";
import { tx } from "@/i18n";

const TaskDetailModal = lazy(() => import("@/pages/TaskDetail"));

const PAGE_SIZE = 25;

export default function WorkDone() {
  const fid = useId();
  const [params, setParams] = useNavParams();

  // Filtr parametrlari URL orqali
  const activeTab = params.get("tab") || "all";
  const selectedProject = params.get("project") || "";
  const selectedActor = params.get("actor") || "";
  const selectedDays = params.get("days") || "";
  const initialSearch = params.get("q") || "";

  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(1);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

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
    }, 400);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tab bo'yicha verb filtri
  const verbFilter = useMemo(() => {
    switch (activeTab) {
      case "comments":
        return "task.commented";
      case "done":
        return "task.status,task.approved";
      case "worklogs":
        return "task.worklog";
      case "status":
        return "task.status,task.submitted,task.approved,task.rejected";
      default:
        return "";
    }
  }, [activeTab]);

  // Statistikalar
  const { data: stats, reload: reloadStats } = useFetch<ActivityStats>("/activity/stats/");

  // Loyihalar ro'yxati (filtr uchun)
  const { data: projectsData } = useFetch<Project[] | Paginated<Project>>("/projects/?page_size=200");
  const projects = useMemo(() => listOf<Project>(projectsData), [projectsData]);

  // Xodimlar ro'yxati (filtr uchun)
  const { data: usersData } = useFetch<UserBrief[] | Paginated<UserBrief>>("/users/?page_size=200");
  const users = useMemo(() => listOf<UserBrief>(usersData), [usersData]);

  // Faoliyat lentasi
  const queryParams = useMemo(() => ({
    page,
    page_size: PAGE_SIZE,
    verb: verbFilter || undefined,
    project: selectedProject || undefined,
    actor: selectedActor || undefined,
    days: selectedDays || undefined,
    search: debouncedSearch || undefined,
  }), [page, verbFilter, selectedProject, selectedActor, selectedDays, debouncedSearch]);

  const { data, loading, error, reload: reloadActivities } = useFetch<Paginated<Activity>>("/activity/", queryParams);

  const activities = useMemo(() => listOf<Activity>(data), [data]);
  const totalPages = pagesOf(data, PAGE_SIZE);

  return (
    <div className="page-work-done">
      <PageHead
        title={tx("work_done.sarlavha", undefined, "Qilingan ishlar")}
        subtitle={tx("work_done.tavsif", undefined, "Xodimlar tomonidan bajarilgan ishlar, yozilgan izohlar va yangilanishlar jurnali")}
      />

      {/* Statistika ko'rsatkichlari */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 20,
        }}
      >
        <div className="card" style={{ padding: "16px 18px", borderLeft: "4px solid #6366f1" }}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
            <IconHistory size={15} />
            {tx("work_done.stat_jami", undefined, "Jami harakatlar")}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text)" }}>
            {stats?.total ?? "..."}
          </div>
        </div>

        <div className="card" style={{ padding: "16px 18px", borderLeft: "4px solid #3b82f6" }}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
            <IconChat size={15} />
            {tx("work_done.stat_izohlar", undefined, "Izohlar")}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#2563eb" }}>
            {stats?.comments ?? "..."}
          </div>
        </div>

        <div className="card" style={{ padding: "16px 18px", borderLeft: "4px solid #10b981" }}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
            <IconCheck size={15} />
            {tx("work_done.stat_bajarilgan", undefined, "Bajarilgan vazifalar")}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#059669" }}>
            {stats?.tasks_done ?? "..."}
          </div>
        </div>

        <div className="card" style={{ padding: "16px 18px", borderLeft: "4px solid #f59e0b" }}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
            <IconClock size={15} />
            {tx("work_done.stat_ish_jurnali", undefined, "Ish vaqti qaydlari")}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#d97706" }}>
            {stats?.worklogs ?? "..."}
          </div>
        </div>

        <div className="card" style={{ padding: "16px 18px", borderLeft: "4px solid #8b5cf6" }}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
            <IconTasks size={15} />
            {tx("work_done.stat_bugun", undefined, "Bugungi faollik")}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#7c3aed" }}>
            {stats?.today ?? "..."}
          </div>
        </div>
      </div>

      {/* Asosiy boshqaruv paneli va filtrlar */}
      <div className="card" style={{ marginBottom: 20, padding: "16px 20px" }}>
        {/* Yuqori qator: Tablar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            overflowX: "auto",
            paddingBottom: 12,
            borderBottom: "1px solid var(--border)",
            marginBottom: 14,
          }}
        >
          <button
            type="button"
            className={`btn ${activeTab === "all" ? "btn-primary" : "btn-subtle"}`}
            onClick={() => updateParam("tab", undefined)}
            style={{ borderRadius: 20, padding: "6px 16px", fontSize: 13 }}
          >
            {tx("work_done.tab_hammasi", undefined, "Hammasi")}
          </button>
          <button
            type="button"
            className={`btn ${activeTab === "comments" ? "btn-primary" : "btn-subtle"}`}
            onClick={() => updateParam("tab", "comments")}
            style={{ borderRadius: 20, padding: "6px 16px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
          >
            <IconChat size={14} />
            {tx("work_done.tab_izohlar", undefined, "Izohlar")}
            {stats?.comments ? <span className="badge" style={{ fontSize: 11 }}>{stats.comments}</span> : null}
          </button>
          <button
            type="button"
            className={`btn ${activeTab === "done" ? "btn-primary" : "btn-subtle"}`}
            onClick={() => updateParam("tab", "done")}
            style={{ borderRadius: 20, padding: "6px 16px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
          >
            <IconCheck size={14} />
            {tx("work_done.tab_bajarilgan", undefined, "Bajarilganlar")}
            {stats?.tasks_done ? <span className="badge" style={{ fontSize: 11 }}>{stats.tasks_done}</span> : null}
          </button>
          <button
            type="button"
            className={`btn ${activeTab === "worklogs" ? "btn-primary" : "btn-subtle"}`}
            onClick={() => updateParam("tab", "worklogs")}
            style={{ borderRadius: 20, padding: "6px 16px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
          >
            <IconClock size={14} />
            {tx("work_done.tab_ish_jurnali", undefined, "Ish jurnali")}
            {stats?.worklogs ? <span className="badge" style={{ fontSize: 11 }}>{stats.worklogs}</span> : null}
          </button>
          <button
            type="button"
            className={`btn ${activeTab === "status" ? "btn-primary" : "btn-subtle"}`}
            onClick={() => updateParam("tab", "status")}
            style={{ borderRadius: 20, padding: "6px 16px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
          >
            <IconLayers size={14} />
            {tx("work_done.tab_holatlar", undefined, "Holat o'zgarishlari")}
          </button>
        </div>

        {/* Quyi qator: Qidiruv va Filtr selektorlari */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          {/* Qidiruv */}
          <div style={{ position: "relative", flex: "1 1 240px" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}>
              <IconSearch size={15} />
            </span>
            <input
              id={`${fid}-search`}
              type="text"
              className="input"
              style={{ paddingLeft: 32, width: "100%", borderRadius: 8, height: 38 }}
              placeholder={tx("work_done.qidirish", undefined, "Izoh, vazifa yoki loyiha bo'yicha qidirish...")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Loyiha tanlash */}
          <select
            id={`${fid}-project`}
            className="input"
            style={{ flex: "0 1 180px", borderRadius: 8, height: 38 }}
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

          {/* Xodim tanlash */}
          <select
            id={`${fid}-actor`}
            className="input"
            style={{ flex: "0 1 180px", borderRadius: 8, height: 38 }}
            value={selectedActor}
            onChange={(e) => updateParam("actor", e.target.value || undefined)}
          >
            <option value="">{tx("work_done.barcha_xodimlar", undefined, "Barcha xodimlar")}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>

          {/* Davr tanlash */}
          <select
            id={`${fid}-days`}
            className="input"
            style={{ flex: "0 1 140px", borderRadius: 8, height: 38 }}
            value={selectedDays}
            onChange={(e) => updateParam("days", e.target.value || undefined)}
          >
            <option value="">{tx("work_done.davr_barchasi", undefined, "Barcha vaqt")}</option>
            <option value="1">{tx("work_done.davr_bugun", undefined, "Bugun")}</option>
            <option value="7">{tx("work_done.davr_oxirgi_7_kun", undefined, "Oxirgi 7 kun")}</option>
            <option value="30">{tx("work_done.davr_oxirgi_30_kun", undefined, "Oxirgi 30 kun")}</option>
          </select>
        </div>
      </div>

      {/* Xatolik holati */}
      {error && <ErrorMsg error={error} />}

      {/* Yuklanish holati */}
      {loading && !activities.length && <Loading />}

      {/* Bo'sh ro'yxat */}
      {!loading && !activities.length && (
        <div className="card" style={{ padding: "40px 20px" }}>
          <Empty title={tx("work_done.bosh_holat", undefined, "Tanlangan filtrlar bo'yicha ma'lumot topilmadi")} />
        </div>
      )}

      {/* Faoliyat kartalari ro'yxati */}
      {activities.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {activities.map((item) => {
            const isComment = item.verb === "task.commented";
            const isWorklog = item.verb === "task.worklog";
            const isDone = item.verb === "task.status" && (item.summary.includes("Bajarildi") || item.summary.includes("DONE"));

            return (
              <div
                key={item.id}
                className="card"
                style={{
                  padding: "16px 20px",
                  borderRadius: 12,
                  transition: "box-shadow 0.15s ease",
                  border: isComment
                    ? "1px solid rgba(59, 130, 246, 0.25)"
                    : isWorklog
                    ? "1px solid rgba(245, 158, 11, 0.25)"
                    : "1px solid var(--border)",
                }}
              >
                {/* Tepa qator: Xodim ma'lumoti + Sana */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {item.actor && <Avatar user={item.actor} size="" />}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>
                          {item.actor ? item.actor.full_name : tx("common.tizim")}
                        </span>
                        {item.actor && <SpecialtyTag user={item.actor} />}
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                        {item.actor?.email}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* Harakat turi ko'rsatkichi */}
                    <span
                      className="badge"
                      style={{
                        background: isComment
                          ? "rgba(59, 130, 246, 0.1)"
                          : isWorklog
                          ? "rgba(245, 158, 11, 0.1)"
                          : isDone
                          ? "rgba(16, 185, 129, 0.1)"
                          : "var(--bg-subtle)",
                        color: isComment
                          ? "#2563eb"
                          : isWorklog
                          ? "#d97706"
                          : isDone
                          ? "#059669"
                          : "var(--muted)",
                        fontWeight: 600,
                        fontSize: 12,
                        padding: "4px 10px",
                        borderRadius: 6,
                      }}
                    >
                      {isComment ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <IconChat size={13} /> {tx("work_done.izoh", undefined, "Izoh")}
                        </span>
                      ) : isWorklog ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <IconClock size={13} /> {tx("work_done.ish_qaydi", undefined, "Ish qaydi")}
                        </span>
                      ) : (
                        item.target_label || tx("work_done.sarlavha", undefined, "Qilingan ish")
                      )}
                    </span>

                    <span className="muted nowrap" style={{ fontSize: 12 }} title={fmtDateTime(item.created_at)}>
                      {timeAgo(item.created_at)}
                    </span>
                  </div>
                </div>

                {/* Harakatning qisqa mazmuni */}
                <div style={{ fontSize: 14, color: "var(--text)", marginBottom: 8, fontWeight: 500 }}>
                  {item.summary}
                </div>

                {/* Loyiha va Vazifa havolalari */}
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: item.detail ? 10 : 4 }}>
                  {item.project && item.project_name && (
                    <Link
                      {...toProject(item.project)}
                      className="badge"
                      style={{
                        background: "var(--bg-subtle)",
                        color: "var(--text)",
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12,
                        padding: "3px 8px",
                      }}
                    >
                      <IconProject size={12} />
                      <span>{item.project_name}</span>
                    </Link>
                  )}

                  {item.task && (
                    <button
                      type="button"
                      onClick={() => setSelectedTaskId(item.task)}
                      className="badge"
                      style={{
                        background: "rgba(99, 102, 241, 0.08)",
                        color: "#4f46e5",
                        border: "1px solid rgba(99, 102, 241, 0.2)",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12,
                        padding: "3px 8px",
                        fontWeight: 600,
                      }}
                      title={tx("work_done.vazifani_korish", undefined, "Vazifani ko'rish")}
                    >
                      <IconTasks size={12} />
                      <span>{item.task_code || `Task #${item.task}`}</span>
                      {item.task_title && (
                        <span style={{ fontWeight: 400, color: "var(--text)", marginLeft: 3 }}>
                          — {item.task_title}
                        </span>
                      )}
                    </button>
                  )}
                </div>

                {/* Katta va chiroyli izoh / tafsilot matni */}
                {item.detail && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "12px 16px",
                      background: isComment
                        ? "rgba(59, 130, 246, 0.04)"
                        : isWorklog
                        ? "rgba(245, 158, 11, 0.04)"
                        : "var(--bg-subtle, #f8fafc)",
                      border: "1px solid var(--border)",
                      borderLeft: isComment
                        ? "4px solid #3b82f6"
                        : isWorklog
                        ? "4px solid #f59e0b"
                        : "4px solid #10b981",
                      borderRadius: 8,
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: "var(--text)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 4,
                        fontWeight: 600,
                        fontSize: 12,
                        color: isComment ? "#2563eb" : isWorklog ? "#d97706" : "var(--muted)",
                      }}
                    >
                      {isComment && <><IconChat size={13} /> {tx("work_done.izoh", undefined, "Izoh matni")}:</>}
                      {isWorklog && <><IconClock size={13} /> {tx("work_done.ish_qaydi", undefined, "Ish jurnali qaydi")}:</>}
                      {!isComment && !isWorklog && <><IconCheck size={13} /> {tx("work_done.batafsil", undefined, "Tafsilot")}:</>}
                    </div>
                    {item.detail}
                  </div>
                )}
              </div>
            );
          })}

          {/* Sahifalash */}
          {totalPages > 1 && (
            <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
              <Pager page={page} pages={totalPages} onPick={setPage} />
            </div>
          )}
        </div>
      )}

      {/* Vazifa to'liq modal oynasi */}
      {selectedTaskId && (
        <Suspense fallback={null}>
          <TaskDetailModal
            taskId={selectedTaskId}
            onClose={() => {
              setSelectedTaskId(null);
              reloadActivities();
              reloadStats();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
