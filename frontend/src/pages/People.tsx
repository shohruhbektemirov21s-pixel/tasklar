import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, listOf, pagesOf, totalOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { User } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Avatar, Card, ErrorMsg, Loading, Pager } from "@/components/ui";
import { toUser, useNavParams } from "@/nav";
import { tx } from "@/i18n";
import { IconClose } from "@/components/icons";

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
  }), [params]);

  const page = Math.max(1, Number(params.get("page")) || 1);
  const [searchVal, setSearchVal] = useState(f.search);

  useEffect(() => {
    setSearchVal(f.search);
  }, [f.search]);

  /** Filtr o'zgarganda birinchi sahifaga qaytamiz va holatni saqlaymiz. */
  const setFilter = (patch: Partial<typeof f>) => {
    const next = new URLSearchParams(params);
    const updated = { ...f, ...patch };
    for (const [k, v] of Object.entries(updated)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    setParams(next, { replace: true });
  };

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
  }, [searchVal, f.search]);

  const canManageTasks = Boolean(
    user?.is_boss || user?.is_platform_admin || user?.can_create_project || user?.manages_projects
  );

  // Rol o'zgartirish xatosi - yuklash xatosidan alohida.
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, error: loadError, loading, reload } =
    useFetch<any>("/users/", { ...f, page, page_size: PER_PAGE }, { debounceMs: 300 });
  const users = useMemo(() => (data ? listOf<User>(data) : null), [data]);
  const total = totalOf(data);
  const pages = pagesOf(data, PER_PAGE);
  const error = actionError || loadError;

  const { data: spec } = useFetch<{ items: { label: string; count: number }[] }>(
    "/users/specialty-stats/", f, { debounceMs: 300 });

  // Loyihalar va hamma foydalanuvchilar (vazifa berish va o'tkazish uchun)
  const { data: projectsData } = useFetch<any>("/projects/", { page_size: 100 });
  const projects = useMemo(() => (projectsData ? listOf<any>(projectsData) : []), [projectsData]);

  const { data: allUsersData } = useFetch<any>("/users/", { page_size: 100 });
  const allUsers = useMemo(() => (allUsersData ? listOf<User>(allUsersData) : []), [allUsersData]);

  // Vazifa berish modali holati
  const [assignTarget, setAssignTarget] = useState<User | null>(null);
  const [assignProject, setAssignProject] = useState<number | "">("");
  const [assignTitle, setAssignTitle] = useState("");
  const [assignDesc, setAssignDesc] = useState("");
  const [assignPriority, setAssignPriority] = useState<number>(2);
  const [assignDueDate, setAssignDueDate] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Vazifalarni o'tkazish modali holati
  const [reassignTarget, setReassignTarget] = useState<User | null>(null);
  const [reassignTasks, setReassignTasks] = useState<any[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [activeTaskToReassign, setActiveTaskToReassign] = useState<any | null>(null);
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
    api.get<any>("/tasks/", { assignee: reassignTarget.id, open: 1, page_size: 100 })
      .then((d) => setReassignTasks(listOf<any>(d)))
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
    if (!assignTarget || !assignProject || !assignTitle.trim()) return;
    setAssignLoading(true);
    setAssignError(null);
    try {
      await api.post("/tasks/", {
        project: assignProject,
        title: assignTitle.trim(),
        description: assignDesc.trim(),
        priority: assignPriority,
        due_date: assignDueDate || null,
        assignee_ids: [assignTarget.id],
      });
      setAssignTarget(null);
      setAssignTitle("");
      setAssignDesc("");
      setAssignDueDate("");
      reload();
    } catch (err) {
      setAssignError(err instanceof ApiError ? err.message : "Vazifa yuklashda xatolik yuz berdi");
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
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : tx("people.ozgartirib_bolmadi"));
    }
  }

  const isAdmin = user?.is_platform_admin;

  return (
    <>
      <PageHead
        title={<strong>{tx("people.foydalanuvchilar")}</strong>}
        actions={!!data && <span className="badge">{total} {tx("common.ta")}</span>}
      />
      <div className="content">
        <ErrorMsg error={error} />

        <div className="filters">
          <div className="f grow">
            <label htmlFor={`${fid}-0`}>{tx("common.qidiruv")}</label>
            <input id={`${fid}-0`} value={searchVal} onChange={(e) => setSearchVal(e.target.value)}
                   onKeyDown={(e) => { if (e.key === "Enter") setFilter({ search: searchVal }); }}
                   placeholder={tx("people.ism_email_yoki_konikma")} />
          </div>
          <div className="f">
            <label htmlFor={`${fid}-1`}>{tx("common.mutaxassislik")}</label>
            <select id={`${fid}-1`} value={f.specialty} onChange={(e) => setFilter({ specialty: e.target.value })}>
              <option value="">{tx("common.hammasi")}</option>
              {(meta?.specialties || []).map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="f">
            <label htmlFor={`${fid}-2`}>{tx("common.daraja")}</label>
            <select id={`${fid}-2`} value={f.seniority} onChange={(e) => setFilter({ seniority: e.target.value })}>
              <option value="">{tx("common.hammasi")}</option>
              {(meta?.seniority || []).map((s) => (
                <option key={s.value} value={String(s.value)}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="f">
            <label htmlFor={`${fid}-3`}>{tx("people.tizim_roli")}</label>
            <select id={`${fid}-3`} value={f.role} onChange={(e) => setFilter({ role: e.target.value })}>
              <option value="">{tx("common.hammasi")}</option>
              {(meta?.global_role || []).map((s) => (
                <option key={s.value} value={String(s.value)}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="split">
          <div className="card">
            {loading ? <Loading /> : !users ? null : (
              <div className="table-wrap"><table className="table">
                <thead>
                  <tr>
                    <th>{tx("people.foydalanuvchi")}</th>
                    <th>{tx("people.bajarilmagan_vazifalar", undefined, "Bajarilmagan vazifalar")}</th>
                    <th>{tx("people.tizim_roli")}</th>
                    <th>{tx("common.loyihalar")}</th>
                    <th>{tx("people.bajarilgan_vazifalar", undefined, "Bajarilgan vazifalar")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="row">
                          <Avatar user={u} size="sm" />
                          <div>
                            <Link {...toUser(u.id)}>{u.full_name}</Link>
                            {!u.is_active && <span className="badge badge-danger">{tx("people.bloklangan")}</span>}
                            <br /><small className="muted">{u.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {u.open_tasks && u.open_tasks > 0 ? (
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
                            }}
                            title={canManageTasks ? tx("people.vazifalarni_otkazish", undefined, "Vazifalarni o'tkazish") : undefined}
                            onClick={() => canManageTasks && setReassignTarget(u)}
                          >
                            {u.open_tasks} {tx("common.ta", undefined, "ta")}
                          </button>
                        ) : (
                          <span className="muted">0</span>
                        )}
                      </td>
                      <td>
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
                            {u.done_tasks} {tx("common.ta", undefined, "ta")}
                          </span>
                        ) : (
                          <span className="muted">0</span>
                        )}
                      </td>
                      <td className="right" style={{ whiteSpace: "nowrap" }}>
                        {canManageTasks && (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              style={{ marginRight: 6, fontSize: 12, padding: "3px 8px" }}
                              onClick={() => {
                                setAssignTarget(u);
                                setAssignError(null);
                              }}
                              title={tx("people.vazifa_berish", undefined, "Vazifa berish")}
                            >
                              + {tx("people.vazifa_berish", undefined, "Vazifa berish")}
                            </button>
                            {Boolean(u.open_tasks && u.open_tasks > 0) && (
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
                          </>
                        )}
                        {isAdmin && u.id !== user?.id && (
                          <button className={`btn btn-sm ${u.is_active ? "btn-danger" : ""}`}
                                  onClick={() => void change(u, { is_active: !u.is_active })}>
                            {u.is_active ? tx("people.bloklash") : tx("people.faollashtirish")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
            {pages > 1 && (
              <div className="card-body">
                <Pager page={page} pages={pages} onPick={setPage} />
              </div>
            )}
          </div>

          <div>
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
      {assignTarget && (
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
          onClick={() => !assignLoading && setAssignTarget(null)}
        >
          <div
            style={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg, 12px)",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.4)",
              width: "100%",
              maxWidth: 520,
              maxHeight: "90vh",
              overflowY: "auto",
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row between middle" style={{ marginBottom: 16 }}>
              <div className="row middle" style={{ gap: 10 }}>
                <Avatar user={assignTarget} size="sm" />
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                    {tx("people.vazifa_berish", undefined, "Vazifa berish")}
                  </h3>
                  <small className="muted">{assignTarget.full_name} ({assignTarget.email})</small>
                </div>
              </div>
              <button
                type="button"
                className="top-icon"
                onClick={() => setAssignTarget(null)}
                aria-label="Yopish"
              >
                <IconClose size={16} />
              </button>
            </div>

            <ErrorMsg error={assignError} />

            <form onSubmit={handleAssignTask}>
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

              <div className="row" style={{ gap: 12, marginBottom: 20 }}>
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

              <div className="row right" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setAssignTarget(null)}
                  disabled={assignLoading}
                >
                  {tx("common.bekor_qilish", undefined, "Bekor qilish")}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={assignLoading || !assignTitle.trim() || !assignProject}
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
                                .filter((au) => au.id !== reassignTarget.id && au.is_active)
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
    </>
  );
}
