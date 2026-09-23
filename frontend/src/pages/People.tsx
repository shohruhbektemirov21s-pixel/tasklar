import { Suspense, lazy, useCallback, useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, listOf, pagesOf, totalOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { User, Project, Task } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { Avatar, Card, ErrorMsg, FilterBar, Loading, PageHeader, Pager, Priority, StatusBadge } from "@/components/ui";
import { fmtDate } from "@/components/dates";
import { toUser, useNavParams } from "@/nav";

const TaskDetailModal = lazy(() => import("@/pages/TaskDetail"));
import { tx } from "@/i18n";
import { IconClose } from "@/components/icons";
import FilePicker, { uploadFiles } from "@/components/FilePicker";

/** Bir sahifada nechta odam. */
const PER_PAGE = 30;

export default function People() {
  const fid = useId();
  const { user, meta } = useAuth();
  const [params, setParams] = useNavParams();

  // Filtrlar va sahifa holati navState (history.state / sessionStorage) da saqlanadi.
  // Bu xodim profiliga o'tib, orqaga qaytganda qidiruv va filtrlar yo'qolmasligini kafolatlaydi.
  const f = useMemo(() => ({
    search: params.get("search") || "",
    specialty: params.get("specialty") || "",
    role: params.get("role") || "",
    seniority: params.get("seniority") || "",
    workload: params.get("workload") || "",
    ordering: params.get("ordering") || "open_tasks,full_name",
  }), [params]);

  const page = Math.max(1, Number(params.get("page")) || 1);
  const [searchVal, setSearchVal] = useState(f.search);

  useEffect(() => {
    setSearchVal(f.search);
  }, [f.search]);

  /** Filtr o'zgarganda birinchi sahifaga qaytamiz va holatni saqlaymiz. */
  const setFilter = useCallback((patch: Partial<typeof f>) => {
    const next = new URLSearchParams(params);
    const updated = { ...f, ...patch };
    for (const [k, v] of Object.entries(updated)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    setParams(next, { replace: true });
  }, [f, params, setParams]);

  const setPage = (p: number) => {
    const next = new URLSearchParams(params);
    if (p > 1) next.set("page", String(p));
    else next.delete("page");
    setParams(next);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchVal !== f.search) {
        setFilter({ search: searchVal });
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchVal, f.search, setFilter]);

  const canManageTasks = Boolean(
    user?.is_boss || user?.is_platform_admin || user?.can_create_project || user?.manages_projects
  );

  const isBoss = Boolean(user?.is_boss || user?.global_role === "BOSS");
  const isNonAssignable = (u?: { is_platform_admin?: boolean; is_boss?: boolean; global_role?: string; specialty?: string; is_manager?: boolean }) => {
    if (!u) return false;
    if (u.is_platform_admin || u.is_boss || u.global_role === "ADMIN" || u.global_role === "BOSS") return true;
    if (!isBoss && (u.global_role === "MANAGER" || u.specialty === "PM" || u.is_manager)) return true;
    return false;
  };

  // Rol o'zgartirish xatosi - yuklash xatosidan alohida.
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, error: loadError, loading, reload } =
    useFetch<{ results: User[]; count: number } | User[]>("/users/", { ...f, page, page_size: PER_PAGE }, { debounceMs: 300 });
  const users = useMemo(() => (data ? listOf<User>(data) : null), [data]);
  const total = totalOf(data);
  const pages = pagesOf(data, PER_PAGE);
  const error = actionError || loadError;

  const { data: summaryData, reload: reloadSummary } = useFetch<{
    total_users: number;
    free_users: number;
    busy_users: number;
    total_open_tasks: number;
    total_done_tasks: number;
  }>("/users/workload-summary/", { search: f.search, specialty: f.specialty, role: f.role }, { debounceMs: 300 });

  const { data: spec } = useFetch<{ items: { label: string; count: number }[] }>(
    "/users/specialty-stats/", f, { debounceMs: 300 });

  // Loyihalar va hamma foydalanuvchilar (vazifa berish va o'tkazish uchun)
  const { data: projectsData } = useFetch<{ results: Project[]; count: number } | Project[]>("/projects/", { page_size: 100 });
  const projects = useMemo(() => (projectsData ? listOf<Project>(projectsData) : []), [projectsData]);

  const { data: allUsersData } = useFetch<{ results: User[]; count: number } | User[]>("/users/", { page_size: 100 });
  const allUsers = useMemo(() => (allUsersData ? listOf<User>(allUsersData) : []), [allUsersData]);

  // Jadvalda ko'p xodimlarni belgilash (multi-select)
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);

  // Tanlangan xodim va uning vazifalari (o'ng paneldagi ro'yxat uchun)
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [userTasks, setUserTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  useEffect(() => {
    if (!activeUser) {
      setUserTasks([]);
      setTasksError(null);
      return;
    }
    setTasksLoading(true);
    setTasksError(null);
    api.get<{ results: Task[] } | Task[]>("/tasks/", { assignee: activeUser.id, page_size: 100 })
      .then((d) => setUserTasks(listOf<Task>(d)))
      .catch((e) => setTasksError(e instanceof ApiError ? e.message : "Vazifalarni yuklab bo'lmadi"))
      .finally(() => setTasksLoading(false));
  }, [activeUser]);

  // Vazifa berish modali holati
  const [assignTargets, setAssignTargets] = useState<User[]>([]);
  const [assignProject, setAssignProject] = useState<number | "">("");
  const [assignTitle, setAssignTitle] = useState("");
  const [assignDesc, setAssignDesc] = useState("");
  const [assignPriority, setAssignPriority] = useState(2);
  const [assignDueDate, setAssignDueDate] = useState("");
  const [separateTasks, setSeparateTasks] = useState(false);
  const [assignFiles, setAssignFiles] = useState<File[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Vazifalarni o'tkazish modali holati
  const [reassignTarget, setReassignTarget] = useState<User | null>(null);
  const [reassignTasks, setReassignTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [activeTaskToReassign, setActiveTaskToReassign] = useState<Task | null>(null);
  const [newAssigneeId, setNewAssigneeId] = useState<number | "">("");
  const [reassignNote, setReassignNote] = useState("");
  const [reassignLoading, setReassignLoading] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassignSuccessMsg, setReassignSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!reassignTarget) {
      setReassignTasks([]);
      setActiveTaskToReassign(null);
      setReassignError(null);
      setReassignSuccessMsg(null);
      return;
    }
    setLoadingTasks(true);
    api.get<{ results: Task[] } | Task[]>("/tasks/", { assignee: reassignTarget.id, open: 1, page_size: 100 })
      .then((d) => setReassignTasks(listOf<Task>(d)))
      .catch((e) => setReassignError(e instanceof ApiError ? e.message : "Vazifalarni yuklab bo'lmadi"))
      .finally(() => setLoadingTasks(false));
  }, [reassignTarget]);

  useEffect(() => {
    if (projects.length > 0 && !assignProject) {
      setAssignProject(projects[0].id);
    }
  }, [projects, assignProject]);

  async function handleAssignTask(e: React.FormEvent) {
    e.preventDefault();
    if (!assignTargets.length) {
      setAssignError(tx("people.kamida_bitta_ijrochi", undefined, "Kamida bitta ijrochi tanlanishi shart"));
      return;
    }
    if (!assignProject || !assignTitle.trim()) return;
    setAssignLoading(true);
    setAssignError(null);
    try {
      // 1. Agar foydalanuvchilar loyiha jamoasida bo'lmasa, ularni a'zo qilishga harakat qilamiz
      for (const targetUser of assignTargets) {
        try {
          await api.post(`/projects/${assignProject}/members/add/`, { user_id: targetUser.id });
        } catch {
          // allaqachon a'zo bo'lsa yoki qo'shib bo'lmasa e'tiborsiz qoldiriladi
        }
      }

      if (separateTasks && assignTargets.length > 1) {
        // Har bir ijrochiga alohida vazifa yaratish
        for (const targetUser of assignTargets) {
          const res = await api.post<Task>("/tasks/", {
            project: assignProject,
            title: assignTitle.trim(),
            description: assignDesc.trim(),
            priority: assignPriority,
            due_date: assignDueDate || null,
            assignee_ids: [targetUser.id],
          });
          if (assignFiles.length > 0 && res?.id) {
            await uploadFiles(`/tasks/${res.id}/attachments/`, assignFiles);
          }
        }
      } else {
        // Bitta vazifaga barcha ijrochilarni biriktirish
        const res = await api.post<Task>("/tasks/", {
          project: assignProject,
          title: assignTitle.trim(),
          description: assignDesc.trim(),
          priority: assignPriority,
          due_date: assignDueDate || null,
          assignee_ids: assignTargets.map((u) => u.id),
        });
        if (assignFiles.length > 0 && res?.id) {
          await uploadFiles(`/tasks/${res.id}/attachments/`, assignFiles);
        }
      }

      setAssignTargets([]);
      setAssignTitle("");
      setAssignDesc("");
      setAssignDueDate("");
      setAssignFiles([]);
      setSeparateTasks(false);
      setSelectedUserIds([]);
      reload();
      reloadSummary();
    } catch (err) {
      setAssignError(err instanceof ApiError ? err.message : tx("people.vazifa_yuklashda_xatolik", undefined, "Vazifa berishda xatolik yuz berdi"));
    } finally {
      setAssignLoading(false);
    }
  }

  async function handleReassignTask(taskId: number) {
    if (!newAssigneeId) return;
    setReassignLoading(true);
    setReassignError(null);
    setReassignSuccessMsg(null);
    try {
      await api.post(`/tasks/${taskId}/reassign/`, {
        user_id: newAssigneeId,
        note: reassignNote.trim(),
        auto_add_to_project: true,
      });
      setReassignSuccessMsg(tx("people.muvaffaqiyatli_otkazildi", undefined, "Vazifa muvaffaqiyatli o'tkazildi"));
      setActiveTaskToReassign(null);
      setNewAssigneeId("");
      setReassignNote("");
      setReassignTasks((prev) => prev.filter((t) => t.id !== taskId));
      reload();
      reloadSummary();
    } catch (err) {
      setReassignError(err instanceof ApiError ? err.message : "Vazifani o'tkazib bo'lmadi");
    } finally {
      setReassignLoading(false);
    }
  }

  async function change(target: User, patch: Record<string, unknown>) {
    setActionError(null);
    try {
      await api.patch(`/users/${target.id}/role/`, patch);
      reload();
      reloadSummary();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : tx("people.ozgartirib_bolmadi"));
    }
  }

  const isAdmin = user?.is_platform_admin;

  return (
    <>
      <div className="content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader
        title={tx("people.foydalanuvchilar") || "Xodimlar va jamoa"}
        subtitle="Jamoa a'zolari, mutaxassisliklar va ish yuklamasi monitoringi"
        breadcrumbs={[
          { label: tx("nav.bosh_sahifa") || "Bosh sahifa", href: "/" },
          { label: tx("people.foydalanuvchilar") || "Jamoa" },
        ]}
        actions={!!data && <span className="badge" style={{ fontSize: 13, padding: "5px 12px" }}>{total} {tx("common.ta")}</span>}
      />

      <ErrorMsg error={error} />

      {/* JAMOA YUKLAMASI KPI BLOKI */}
      {summaryData && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: 12,
          }}
        >
          <div
            className="card"
            style={{
              padding: "12px 16px",
              cursor: "pointer",
              border: f.workload === "" ? "2px solid var(--primary)" : "1px solid var(--border)",
              background: f.workload === "" ? "var(--primary-soft, rgba(99, 102, 241, 0.08))" : "var(--surface)",
              borderRadius: 12,
              transition: "all 0.15s ease",
            }}
            onClick={() => setFilter({ workload: "" })}
          >
            <div className="row between middle">
              <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>
                👥 {tx("people.jami_xodimlar", undefined, "Jami xodimlar")}
              </span>
              <span className="badge" style={{ fontSize: 14, fontWeight: 700 }}>
                {summaryData.total_users}
              </span>
            </div>
          </div>

          <div
            className="card"
            style={{
              padding: "12px 16px",
              cursor: "pointer",
              border: f.workload === "free" ? "2px solid #16a34a" : "1px solid var(--border)",
              background: f.workload === "free" ? "rgba(22, 163, 74, 0.12)" : "var(--surface)",
              borderRadius: 12,
              transition: "all 0.15s ease",
            }}
            onClick={() => setFilter({ workload: f.workload === "free" ? "" : "free" })}
          >
            <div className="row between middle">
              <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>
                🟢 {tx("people.bosh_xodimlar", undefined, "Bo'sh xodimlar (0 ta)")}
              </span>
              <span className="badge badge-success" style={{ fontSize: 14, fontWeight: 700, background: "rgba(22, 163, 74, 0.18)", color: "#15803d" }}>
                {summaryData.free_users}
              </span>
            </div>
          </div>

          <div
            className="card"
            style={{
              padding: "12px 16px",
              cursor: "pointer",
              border: f.workload === "busy" ? "2px solid #d97706" : "1px solid var(--border)",
              background: f.workload === "busy" ? "rgba(217, 119, 6, 0.12)" : "var(--surface)",
              borderRadius: 12,
              transition: "all 0.15s ease",
            }}
            onClick={() => setFilter({ workload: f.workload === "busy" ? "" : "busy" })}
          >
            <div className="row between middle">
              <span style={{ fontSize: 13, color: "#d97706", fontWeight: 600 }}>
                🟡 {tx("people.band_xodimlar", undefined, "Band xodimlar")}
              </span>
              <span className="badge badge-warning" style={{ fontSize: 14, fontWeight: 700, background: "rgba(245, 158, 11, 0.18)", color: "#b45309" }}>
                {summaryData.busy_users}
              </span>
            </div>
          </div>

          <div
            className="card"
            style={{
              padding: "12px 16px",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              borderRadius: 12,
            }}
          >
            <div className="row between middle">
              <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>
                📋 {tx("people.ochiq_vazifalar_jami", undefined, "Bajarilmagan vazifalar")}
              </span>
              <span className="badge badge-primary" style={{ fontSize: 14, fontWeight: 700 }}>
                {summaryData.total_open_tasks}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* FILTRLAR VA SARALASH */}
      <FilterBar>
        <div className="filter-search-box" style={{ minWidth: 260 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>🔍</span>
          <input
            id={`${fid}-0`}
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setFilter({ search: searchVal }); }}
            placeholder={tx("people.ism_email_yoki_konikma") || "Qidiruv (ism, email, ko'nikma)..."}
          />
        </div>

        <div className="filter-select-box">
          <label>{tx("common.mutaxassislik")}:</label>
          <select id={`${fid}-1`} value={f.specialty} onChange={(e) => setFilter({ specialty: e.target.value })}>
            <option value="">{tx("common.hammasi") || "Barchasi"}</option>
            {(meta?.specialties || []).map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="filter-select-box">
          <label>{tx("people.yuklama_holati", undefined, "Yuklama")}:</label>
          <select id={`${fid}-2`} value={f.workload} onChange={(e) => setFilter({ workload: e.target.value })}>
            <option value="">{tx("common.hammasi") || "Barchasi"}</option>
            <option value="free">{tx("people.bosh_xodimlar", undefined, "Bo'sh (0 ta vazifa)")}</option>
            <option value="busy">{tx("people.band_xodimlar", undefined, "Band (vazifasi bor)")}</option>
          </select>
        </div>

        <div className="filter-select-box">
          <label>{tx("people.saralash", undefined, "Saralash")}:</label>
          <select id={`${fid}-3`} value={f.ordering} onChange={(e) => setFilter({ ordering: e.target.value })}>
            <option value="open_tasks,full_name">{tx("people.vazifasizlar_oldinda", undefined, "Vazifasi yo'qlar avval")}</option>
            <option value="-open_tasks,full_name">{tx("people.vazifasi_koplar_oldinda", undefined, "Vazifasi ko'plar avval")}</option>
            <option value="full_name">{tx("people.ism_a_z", undefined, "Ism bo'yicha (A-Z)")}</option>
            <option value="-date_joined">{tx("people.yangi_qoshilganlar", undefined, "Yangi qo'shilganlar")}</option>
          </select>
        </div>

        <div className="filter-select-box">
          <label>{tx("people.tizim_roli")}:</label>
          <select id={`${fid}-4`} value={f.role} onChange={(e) => setFilter({ role: e.target.value })}>
            <option value="">{tx("common.hammasi") || "Barchasi"}</option>
            {(meta?.global_role || []).map((s) => (
              <option key={s.value} value={String(s.value)}>{s.label}</option>
            ))}
          </select>
        </div>
      </FilterBar>

        <div className="split">
          <div className="card">
            {loading ? <Loading /> : !users ? null : (
              <>
                {canManageTasks && selectedUserIds.length > 0 && (
                  <div
                    style={{
                      padding: "8px 16px",
                      background: "var(--accent-soft, rgba(99, 102, 241, 0.1))",
                      borderBottom: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500 }}>
                      <span className="badge badge-primary">{selectedUserIds.length}</span>
                      <span>{tx("people.tanlangan_xodimlar", undefined, "ta xodim tanlandi")}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        style={{ fontSize: 12 }}
                        onClick={() => {
                          const pool = allUsers.length ? allUsers : (users || []);
                          const picked = pool.filter((u) => selectedUserIds.includes(u.id) && !isNonAssignable(u));
                          setAssignTargets(picked);
                          setAssignFiles([]);
                          setAssignError(null);
                        }}
                      >
                        + {tx("people.vazifa_berish", undefined, "Vazifa berish")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        style={{ fontSize: 12 }}
                        onClick={() => setSelectedUserIds([])}
                      >
                        {tx("people.tanlovni_tozalash", undefined, "Tanlovni tozalash")}
                      </button>
                    </div>
                  </div>
                )}
                <div className="table-wrap"><table className="table">
                  <thead>
                    <tr>
                      {canManageTasks && (
                        <th style={{ width: 36, textAlign: "center", padding: "8px 4px" }}>
                          <input
                            type="checkbox"
                            style={{ width: "auto", minHeight: 0, cursor: "pointer" }}
                            checked={Boolean(users.length && users.every((u) => selectedUserIds.includes(u.id)))}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const idsOnPage = users.map((u) => u.id);
                                setSelectedUserIds((prev) => Array.from(new Set([...prev, ...idsOnPage])));
                              } else {
                                const idsOnPage = new Set(users.map((u) => u.id));
                                setSelectedUserIds((prev) => prev.filter((id) => !idsOnPage.has(id)));
                              }
                            }}
                            aria-label="Hammasini tanlash"
                          />
                        </th>
                      )}
                      <th>{tx("people.foydalanuvchi")}</th>
                      <th>{tx("people.bajarilmagan_vazifalar", undefined, "Bajarilmagan vazifalar")}</th>
                      <th>{tx("people.tizim_roli")}</th>
                      <th>{tx("common.loyihalar")}</th>
                      <th>{tx("people.bajarilgan_vazifalar", undefined, "Bajarilgan vazifalar")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const isSelected = activeUser?.id === u.id;
                      const hasOpenTasks = Boolean(u.open_tasks && u.open_tasks > 0);
                      return (
                      <tr
                        key={u.id}
                        onClick={() => setActiveUser((prev) => (prev?.id === u.id ? null : u))}
                        style={{
                          cursor: "pointer",
                          backgroundColor: isSelected ? "var(--primary-soft, rgba(99, 102, 241, 0.08))" : undefined,
                          transition: "background-color 0.15s ease",
                        }}
                      >
                        {canManageTasks && (
                          <td
                            style={{ textAlign: "center", width: 36, padding: "8px 4px" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              style={{ width: "auto", minHeight: 0, cursor: "pointer" }}
                              checked={selectedUserIds.includes(u.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedUserIds((prev) => [...prev, u.id]);
                                } else {
                                  setSelectedUserIds((prev) => prev.filter((id) => id !== u.id));
                                }
                              }}
                              aria-label={u.full_name}
                            />
                          </td>
                        )}
                        <td>
                          <div className="row">
                            <Avatar user={u} size="sm" />
                            <div>
                              <Link {...toUser(u.id)} onClick={(e) => e.stopPropagation()}>{u.full_name}</Link>
                              {!u.is_active && <span className="badge badge-danger">{tx("people.bloklangan")}</span>}
                              <br /><small className="muted">{u.email}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          {hasOpenTasks ? (
                            <button
                              type="button"
                              className="badge badge-warning"
                              style={{
                                fontWeight: 600,
                                color: "#b45309",
                                background: "rgba(245, 158, 11, 0.15)",
                                cursor: canManageTasks ? "pointer" : "default",
                                border: "none",
                                padding: "4px 8px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                              title={canManageTasks ? tx("people.vazifalarni_otkazish", undefined, "Vazifalarni o'tkazish") : undefined}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (canManageTasks) setReassignTarget(u);
                              }}
                            >
                              <span>🟡</span>
                              <span>{u.open_tasks} {tx("people.faol_vazifa_birlik", undefined, "ta faol vazifa")}</span>
                            </button>
                          ) : (
                            <span
                              className="badge badge-success"
                              style={{
                                fontWeight: 600,
                                color: "#15803d",
                                background: "rgba(34, 197, 94, 0.15)",
                                padding: "4px 8px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <span>🟢</span>
                              <span>0 {tx("common.ta", undefined, "ta")} ({tx("people.bosh_status", undefined, "Bo'sh")})</span>
                            </span>
                          )}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {isAdmin ? (
                            <select defaultValue={u.global_role} style={{ width: 150 }}
                                    onChange={(e) => void change(u, { global_role: e.target.value })}>
                              {(meta?.global_role || []).map((s) => (
                                <option key={s.value} value={String(s.value)}>{s.label}</option>
                              ))}
                            </select>
                          ) : <span className="badge">{u.global_role_display}</span>}
                        </td>
                        <td>{u.project_count ?? 0}</td>
                        <td>
                          {u.done_tasks && u.done_tasks > 0 ? (
                            <span className="badge badge-success" style={{ fontWeight: 600, color: "#15803d", background: "rgba(34, 197, 94, 0.15)" }}>
                              ✓ {u.done_tasks} {tx("common.ta", undefined, "ta")}
                            </span>
                          ) : (
                            <span className="muted">0</span>
                          )}
                        </td>
                        <td className="right" style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                          {canManageTasks && !isNonAssignable(u) && (
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              style={{ marginRight: 6, fontSize: 12, padding: "3px 9px", fontWeight: 500 }}
                              onClick={() => {
                                setAssignTargets([u]);
                                setAssignFiles([]);
                                setAssignError(null);
                              }}
                              title={tx("people.vazifa_berish", undefined, "Vazifa berish")}
                            >
                              + {tx("people.vazifa_berish", undefined, "Vazifa berish")}
                            </button>
                          )}
                          {canManageTasks && hasOpenTasks && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              style={{ marginRight: 6, fontSize: 12, padding: "3px 8px" }}
                              onClick={() => setReassignTarget(u)}
                              title={tx("people.vazifalarni_otkazish", undefined, "Vazifalarni o'tkazish")}
                            >
                              ⇄ {tx("people.vazifani_otkazish", undefined, "Boshqaga o'tkazish")}
                            </button>
                          )}
                          {isAdmin && u.id !== user?.id && (
                            <button className={`btn btn-sm ${u.is_active ? "btn-danger" : ""}`}
                                    onClick={() => void change(u, { is_active: !u.is_active })}>
                              {u.is_active ? tx("people.bloklash") : tx("people.faollashtirish")}
                            </button>
                          )}
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table></div>
              </>
            )}
            {pages > 1 && (
              <div className="card-body">
                <Pager page={page} pages={pages} onPick={setPage} />
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Tanlangan xodim vazifalari */}
            <Card
              title={
                <div className="row middle" style={{ gap: 8 }}>
                  <span>{tx("people.xodim_vazifalari", undefined, "Xodim vazifalari")}</span>
                  {activeUser && (
                    <span className="badge badge-info" style={{ fontSize: 12, padding: "2px 8px" }}>
                      {tx("people.ta_vazifa", { soni: userTasks.length }, `${userTasks.length} ta vazifa`)}
                    </span>
                  )}
                </div>
              }
              action={
                activeUser ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-subtle"
                    onClick={() => setActiveUser(null)}
                    title={tx("common.yopish", undefined, "Yopish")}
                    style={{ padding: "2px 6px", lineHeight: 1 }}
                  >
                    <IconClose size={14} />
                  </button>
                ) : undefined
              }
            >
              {!activeUser ? (
                <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--muted)" }}>
                  <p style={{ margin: 0, fontSize: 13 }}>
                    {tx("people.xodimni_tanlang_vazifalarini_korish", undefined, "Xodimlar ro'yxatidan birini tanlang — bu yerda uning vazifalari ko'rinadi.")}
                  </p>
                </div>
              ) : (
                <div>
                  {/* Xodim ma'lumotlari */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      marginBottom: 12,
                      background: "var(--surface-sunken, rgba(0,0,0,0.03))",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  >
                    <Avatar user={activeUser} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {activeUser.full_name}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {activeUser.specialty_display || activeUser.job_title || activeUser.email}
                      </div>
                    </div>
                    {canManageTasks && !isNonAssignable(activeUser) && (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        style={{ fontSize: 12, padding: "4px 8px", whiteSpace: "nowrap" }}
                        onClick={() => {
                          setAssignTargets([activeUser]);
                          setAssignFiles([]);
                          setAssignError(null);
                        }}
                      >
                        + {tx("people.vazifa_berish", undefined, "Vazifa berish")}
                      </button>
                    )}
                  </div>

                  {/* Vazifalar ro'yxati */}
                  {tasksLoading ? (
                    <Loading />
                  ) : tasksError ? (
                    <ErrorMsg error={tasksError} />
                  ) : userTasks.length === 0 ? (
                    <div style={{ padding: "20px 12px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                      <p style={{ marginBottom: 10 }}>{tx("people.xodimda_vazifalar_yoq", undefined, "Ushbu xodimda hozircha vazifalar yo'q.")}</p>
                      {canManageTasks && !isNonAssignable(activeUser) && (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => {
                            setAssignTargets([activeUser]);
                            setAssignFiles([]);
                            setAssignError(null);
                          }}
                        >
                          + {tx("people.yangi_vazifa_yuklash", undefined, "Yangi vazifa berish")}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "500px", overflowY: "auto", paddingRight: 4 }}>
                        {userTasks.map((t) => (
                          <div
                            key={t.id}
                            onClick={() => setSelectedTaskId(t.id)}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 8,
                              border: "1px solid var(--border)",
                              background: "var(--surface)",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = "var(--primary)";
                              e.currentTarget.style.transform = "translateY(-1px)";
                              e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = "var(--border)";
                              e.currentTarget.style.transform = "none";
                              e.currentTarget.style.boxShadow = "none";
                            }}
                          >
                            <div className="row between middle" style={{ gap: 8 }}>
                              <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--primary)" }}>
                                {t.code}
                              </span>
                              <div className="row middle" style={{ gap: 6 }}>
                                <Priority task={t} />
                                <StatusBadge task={t} />
                              </div>
                            </div>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                lineHeight: 1.35,
                                color: "var(--text)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                              }}
                              title={t.title}
                            >
                              {t.title}
                            </div>
                            <div className="row between middle" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "160px" }}>
                                📁 {t.project_name}
                              </span>
                              {t.due_date && (
                                <span style={{ color: t.is_overdue ? "var(--danger, #ef4444)" : undefined }}>
                                  📅 {fmtDate(t.due_date)}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {canManageTasks && !isNonAssignable(activeUser) && (
                        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed var(--border)" }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            style={{ width: "100%", justifyContent: "center" }}
                            onClick={() => {
                              setAssignTargets([activeUser]);
                              setAssignFiles([]);
                              setAssignError(null);
                            }}
                          >
                            + {tx("people.yangi_vazifa_yuklash", undefined, "Yangi vazifa berish")}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Mutaxassisliklar taqsimoti */}
            <Card title={tx("people.mutaxassisliklar_taqsimoti")}>
              <ul className="list-plain" style={{ fontSize: 13 }}>
                {(spec?.items || []).map((row) => (
                  <li className="row" key={row.label}>
                    <span>{row.label}</span><span className="spacer" /><strong>{row.count}</strong>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </div>

      {/* VAZIFA BERISH MODALI */}
      {assignTargets.length > 0 && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => !assignLoading && setAssignTargets([])}
        >
          <div
            style={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg, 12px)",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.4)",
              width: "100%",
              maxWidth: 580,
              maxHeight: "90vh",
              overflowY: "auto",
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row between middle" style={{ marginBottom: 16 }}>
              <div className="row middle" style={{ gap: 10 }}>
                {assignTargets.length === 1 ? (
                  <Avatar user={assignTargets[0]} size="sm" />
                ) : (
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: "var(--primary-soft, rgba(99, 102, 241, 0.15))",
                      color: "var(--primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    {assignTargets.length}
                  </div>
                )}
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                    {tx("people.vazifa_berish", undefined, "Vazifa berish")}
                  </h3>
                  <small className="muted">
                    {assignTargets.length === 1
                      ? `${assignTargets[0].full_name} (${assignTargets[0].email})`
                      : `${assignTargets.length} ${tx("people.tanlangan_xodimlar", undefined, "ta xodim tanlandi")}`}
                  </small>
                </div>
              </div>
              <button
                type="button"
                className="top-icon"
                onClick={() => !assignLoading && setAssignTargets([])}
                aria-label="Yopish"
              >
                <IconClose size={16} />
              </button>
            </div>

            <ErrorMsg error={assignError} />

            <form onSubmit={handleAssignTask}>
              {/* IJROCHILARNI TANLASH VA BOSHQARISH */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                  {tx("people.ijrochilar", undefined, "Ijrochilar")} *
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {assignTargets.map((u) => (
                    <span
                      key={u.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "3px 8px 3px 6px",
                        background: "var(--surface-hover, rgba(0, 0, 0, 0.05))",
                        border: "1px solid var(--border)",
                        borderRadius: 16,
                        fontSize: 12,
                      }}
                    >
                      <Avatar user={u} size="sm" />
                      <span style={{ fontWeight: 500 }}>{u.full_name}</span>
                      {assignTargets.length > 1 && (
                        <button
                          type="button"
                          style={{
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            padding: 0,
                            marginLeft: 2,
                            lineHeight: 1,
                            color: "var(--text-muted)",
                            fontSize: 13,
                          }}
                          onClick={() => setAssignTargets(assignTargets.filter((x) => x.id !== u.id))}
                          title={tx("common.ochirish", undefined, "O'chirish")}
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  ))}
                </div>

                <select
                  value=""
                  onChange={(e) => {
                    const uid = Number(e.target.value);
                    if (!uid) return;
                    const found = allUsers.find((au) => au.id === uid);
                    if (found && !assignTargets.some((x) => x.id === found.id)) {
                      setAssignTargets([...assignTargets, found]);
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    borderRadius: 6,
                    border: "1px dashed var(--border)",
                    background: "var(--surface)",
                    fontSize: 13,
                  }}
                >
                  <option value="">+ {tx("people.ijrochi_qoshish", undefined, "Yana ijrochi qo'shish...")}</option>
                  {allUsers
                    .filter((au) => au.is_active && !isNonAssignable(au) && !assignTargets.some((x) => x.id === au.id))
                    .map((au) => (
                      <option key={au.id} value={au.id}>
                        {au.full_name} ({au.email}) {au.specialty_display ? `— ${au.specialty_display}` : ""}
                      </option>
                    ))}
                </select>

                {assignTargets.length > 1 && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "8px 10px",
                      background: "rgba(99, 102, 241, 0.05)",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                    }}
                  >
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, margin: 0, userSelect: "none" }}>
                      <input
                        type="checkbox"
                        checked={separateTasks}
                        onChange={(e) => setSeparateTasks(e.target.checked)}
                        style={{ width: "auto", minHeight: 0 }}
                      />
                      <span>{tx("people.har_biriga_alohida_vazifa", undefined, "Har bir ijrochi uchun alohida vazifa yaratilsin")}</span>
                    </label>
                    <small className="muted" style={{ display: "block", marginTop: 4, marginLeft: 22, fontSize: 11 }}>
                      {separateTasks
                        ? tx("people.har_biriga_alohida_tavsif", undefined, "Har bir xodimga alohida shaxsiy vazifa ochiladi")
                        : tx("people.bitta_vazifaga_biriktirish_tavsif", undefined, "Barcha tanlangan xodimlar bitta umumiy vazifaga biriktiriladi")}
                    </small>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  {tx("people.loyiha_tanlang", undefined, "Loyiha tanlang")} *
                </label>
                <select
                  required
                  value={assignProject}
                  onChange={(e) => setAssignProject(Number(e.target.value))}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)" }}
                >
                  <option value="">{tx("people.loyiha_tanlang", undefined, "Loyiha tanlang")}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.key})</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  {tx("people.yangi_vazifa_nomi", undefined, "Vazifa nomi")} *
                </label>
                <input
                  type="text"
                  required
                  placeholder={tx("people.yangi_vazifa_nomi", undefined, "Vazifa nomi")}
                  value={assignTitle}
                  onChange={(e) => setAssignTitle(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)" }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  {tx("common.tavsif", undefined, "Tavsif")}
                </label>
                <textarea
                  rows={3}
                  placeholder={tx("common.tavsif", undefined, "Tavsif")}
                  value={assignDesc}
                  onChange={(e) => setAssignDesc(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", resize: "vertical" }}
                />
              </div>

              <div className="row" style={{ gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                    {tx("common.muhimlik", undefined, "Muhimlik")}
                  </label>
                  <select
                    value={assignPriority}
                    onChange={(e) => setAssignPriority(Number(e.target.value))}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)" }}
                  >
                    <option value={1}>{tx("priority.low", undefined, "Past")}</option>
                    <option value={2}>{tx("priority.medium", undefined, "O'rta")}</option>
                    <option value={3}>{tx("priority.high", undefined, "Yuqori")}</option>
                    <option value={4}>{tx("priority.urgent", undefined, "Shoshilinch")}</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                    {tx("common.muddat", undefined, "Muddat")}
                  </label>
                  <input
                    type="date"
                    value={assignDueDate}
                    onChange={(e) => setAssignDueDate(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)" }}
                  />
                </div>
              </div>

              {/* FAYLLAR BIRIKTIRISH */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                  {tx("people.fayllar", undefined, "Fayllar")}
                </label>
                <FilePicker files={assignFiles} onChange={setAssignFiles} />
              </div>

              <div className="row right" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => !assignLoading && setAssignTargets([])}
                  disabled={assignLoading}
                >
                  {tx("common.bekor_qilish", undefined, "Bekor qilish")}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={assignLoading || !assignTitle.trim() || !assignProject || assignTargets.length === 0}
                >
                  {assignLoading ? tx("common.yuklanmoqda", undefined, "Yuklanmoqda...") : tx("people.vazifa_berish", undefined, "Vazifa berish")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VAZIFALARNI BOSHQAGA O'TKAZISH MODALI */}
      {reassignTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => !reassignLoading && setReassignTarget(null)}
        >
          <div
            style={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg, 12px)",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.4)",
              width: "100%",
              maxWidth: 640,
              maxHeight: "90vh",
              overflowY: "auto",
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row between middle" style={{ marginBottom: 16 }}>
              <div className="row middle" style={{ gap: 10 }}>
                <Avatar user={reassignTarget} size="sm" />
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                    {reassignTarget.full_name} — {tx("people.bajarilmagan_tasklar", undefined, "Bajarilmagan tasklar")}
                  </h3>
                  <small className="muted">{reassignTarget.email}</small>
                </div>
              </div>
              <button
                type="button"
                className="top-icon"
                onClick={() => setReassignTarget(null)}
                aria-label="Yopish"
              >
                <IconClose size={16} />
              </button>
            </div>

            <ErrorMsg error={reassignError} />
            {reassignSuccessMsg && (
              <div className="badge badge-success" style={{ display: "block", marginBottom: 12, padding: "8px 12px" }}>
                {reassignSuccessMsg}
              </div>
            )}

            {loadingTasks ? (
              <Loading />
            ) : reassignTasks.length === 0 ? (
              <div className="muted" style={{ padding: "20px 0", textAlign: "center" }}>
                {tx("people.ochiq_vazifalar_yoq", undefined, "Ushbu xodimda ochiq vazifalar mavjud emas")}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {reassignTasks.map((t) => {
                  const isCurrent = activeTaskToReassign?.id === t.id;
                  return (
                    <div
                      key={t.id}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: 12,
                        background: isCurrent ? "rgba(245, 158, 11, 0.05)" : "var(--surface)",
                      }}
                    >
                      <div className="row between middle">
                        <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>
                            <span className="mono" style={{ marginRight: 6, color: "var(--primary)" }}>
                              {t.code || `#${t.id}`}
                            </span>
                            {t.title}
                          </div>
                          <div className="row middle" style={{ gap: 8, marginTop: 4, fontSize: 12 }}>
                            <span className="muted">{t.project_name}</span>
                            <span>•</span>
                            <span className="badge">{t.status_display || t.status}</span>
                            {t.due_date && (
                              <>
                                <span>•</span>
                                <span className="muted">{t.due_date.slice(0, 10)}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`btn btn-sm ${isCurrent ? "btn-primary" : "btn-outline"}`}
                          style={{ fontSize: 12 }}
                          onClick={() => {
                            if (isCurrent) {
                              setActiveTaskToReassign(null);
                            } else {
                              setActiveTaskToReassign(t);
                              setNewAssigneeId("");
                              setReassignNote("");
                              setReassignError(null);
                            }
                          }}
                        >
                          {isCurrent ? tx("common.bekor_qilish", undefined, "Bekor qilish") : tx("people.vazifani_otkazish", undefined, "Boshqaga o'tkazish")}
                        </button>
                      </div>

                      {isCurrent && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--border)" }}>
                          <div style={{ marginBottom: 10 }}>
                            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                              {tx("people.yangi_ijrochi", undefined, "Yangi ijrochi")} *
                            </label>
                            <select
                              required
                              value={newAssigneeId}
                              onChange={(e) => setNewAssigneeId(Number(e.target.value))}
                              style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)" }}
                            >
                              <option value="">{tx("people.yangi_ijrochi", undefined, "Yangi ijrochini tanlang")}</option>
                              {allUsers
                                .filter((au) => au.id !== reassignTarget.id && au.is_active && !isNonAssignable(au))
                                .map((au) => (
                                  <option key={au.id} value={au.id}>
                                    {au.full_name} ({au.email}) — {au.global_role_display}
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div style={{ marginBottom: 10 }}>
                            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                              {tx("people.otkazish_sababi", undefined, "O'tkazish sababi (ixtiyoriy)")}
                            </label>
                            <input
                              type="text"
                              placeholder={tx("people.otkazish_sababi", undefined, "O'tkazish sababi...")}
                              value={reassignNote}
                              onChange={(e) => setReassignNote(e.target.value)}
                              style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)" }}
                            />
                          </div>
                          <div className="row right" style={{ gap: 8 }}>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              onClick={() => setActiveTaskToReassign(null)}
                              disabled={reassignLoading}
                            >
                              {tx("common.bekor_qilish", undefined, "Bekor qilish")}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              disabled={reassignLoading || !newAssigneeId}
                              onClick={() => handleReassignTask(t.id)}
                            >
                              {reassignLoading ? tx("common.yuklanmoqda", undefined, "O'tkazilmoqda...") : tx("people.vazifani_otkazish", undefined, "O'tkazishni tasdiqlash")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Vazifa to'liq modal oynasi */}
      {selectedTaskId && (
        <Suspense fallback={null}>
          <TaskDetailModal
            taskId={selectedTaskId}
            onClose={() => {
              setSelectedTaskId(null);
              if (activeUser) {
                api.get<{ results: Task[] } | Task[]>("/tasks/", { assignee: activeUser.id, page_size: 100 })
                  .then((d) => setUserTasks(listOf<Task>(d)))
                  .catch(() => {});
              }
            }}
          />
        </Suspense>
      )}
    </>
  );
}
