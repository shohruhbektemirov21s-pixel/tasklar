import { Suspense, lazy, useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { api, listOf, totalOf } from "@/api/client";
import type { ChangeRequestItem, Project, PublicProject, Task, UserBrief } from "@/api/types";
import PublicShell from "@/components/PublicShell";
import { Avatar, EmptyState, Loading, Priority, Progress, StatusBadge } from "@/components/ui";
import { useAuth } from "@/auth/AuthContext";
import { IconOrder, IconSearch, IconTasks, IconUsers } from "@/components/icons";
import { toOrder, toProject, toPublicProject, toTask, toUser, useNavParams } from "@/nav";
import { tx } from "@/i18n";
import { Button, LinkButton } from "@/components/Button";

const ProjectDetailModal = lazy(() => import("@/pages/ProjectDetail"));
const TaskDetailModal = lazy(() => import("@/pages/TaskDetail"));

type SearchCategory = "all" | "projects" | "tasks" | "orders" | "users";

export default function Search() {
  const fid = useId();
  const [params, setParams] = useNavParams();
  const { user } = useAuth();
  const q = params.get("q") || "";
  const cat = (params.get("cat") as SearchCategory) || "all";

  const [inputVal, setInputVal] = useState(q);
  const [category, setCategory] = useState<SearchCategory>(cat);
  const [loading, setLoading] = useState(false);

  // Authenticated search results
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [orders, setOrders] = useState<ChangeRequestItem[]>([]);
  const [users, setUsers] = useState<UserBrief[]>([]);

  // Guest search results
  const [publicProjects, setPublicProjects] = useState<PublicProject[]>([]);

  // Modals for in-place preview
  const [openProjectId, setOpenProjectId] = useState<number | null>(null);
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setProjects([]);
      setTasks([]);
      setOrders([]);
      setUsers([]);
      setPublicProjects([]);
      return;
    }

    setLoading(true);
    try {
      if (user) {
        // Authenticated: search projects, tasks, orders, users
        const [prjRes, tskRes, ordRes, usrRes] = await Promise.allSettled([
          api.get<unknown>("/projects/", { search: searchQuery, page_size: 15 }),
          api.get<unknown>("/tasks/", { search: searchQuery, page_size: 15 }),
          api.get<unknown>("/orders/", { search: searchQuery, page_size: 15 }),
          api.get<unknown>("/users/", { search: searchQuery, page_size: 15 }),
        ]);

        setProjects(prjRes.status === "fulfilled" ? listOf<Project>(prjRes.value) : []);
        setTasks(tskRes.status === "fulfilled" ? listOf<Task>(tskRes.value) : []);
        setOrders(ordRes.status === "fulfilled" ? listOf<ChangeRequestItem>(ordRes.value) : []);
        setUsers(usrRes.status === "fulfilled" ? listOf<UserBrief>(usrRes.value) : []);
      } else {
        // Guest: search public projects
        const res = await api.get<{ results: PublicProject[] }>("/public/projects/", { q: searchQuery });
        setPublicProjects(res.results || []);
      }
    } catch {
      // Ignore network errors gracefully
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setInputVal(q);
    void performSearch(q);
  }, [q, performSearch]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(params);
    if (inputVal.trim()) next.set("q", inputVal.trim());
    else next.delete("q");
    if (category !== "all") next.set("cat", category);
    else next.delete("cat");
    setParams(next);
  }

  function handleCategoryChange(newCat: SearchCategory) {
    setCategory(newCat);
    const next = new URLSearchParams(params);
    if (newCat !== "all") next.set("cat", newCat);
    else next.delete("cat");
    setParams(next);
  }

  const totalResults = user
    ? projects.length + tasks.length + orders.length + users.length
    : publicProjects.length;

  return (
    <PublicShell query={q} showSearch={false}>
      <div className="lp-wrap" style={{ padding: "32px 24px 64px", maxWidth: 1100, margin: "0 auto" }}>
        {/* Prominent Search Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {tx("search.umumiy_qidiruv", undefined, "TeamFlow Qidiruvi")}
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 750, margin: "0 0 16px", color: "var(--text)" }}>
            {tx("search.tizim_boylab_qidirish", undefined, "Barcha ma'lumotlarni bir joydan toping")}
          </h2>

          <form
            onSubmit={handleSearchSubmit}
            style={{
              maxWidth: 680,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--surface)",
              border: "1.5px solid var(--border)",
              borderRadius: 14,
              padding: "6px 8px 6px 16px",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <IconSearch size={18} />
            <input
              type="search"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={tx("search.katta_placeholder", undefined, "Loyihalar, vazifalar, buyurtmalar yoki foydalanuvchilar...")}
              autoFocus
              style={{
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 15,
                flex: 1,
                padding: "8px 4px",
                color: "var(--text)",
              }}
            />
            <Button variant="primary" type="submit" size="sm" style={{ padding: "8px 18px", borderRadius: 10 }}>
              {tx("common.qidiruv", undefined, "Qidirish")}
            </Button>
          </form>
        </div>

        {/* Category Filter Pills (if authenticated) */}
        {user && (
          <div
            className="row middle"
            style={{
              justifyContent: "center",
              gap: 6,
              marginBottom: 24,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className={`btn btn-sm ${category === "all" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => handleCategoryChange("all")}
            >
              {tx("common.hammasi", undefined, "Barchasi")} ({totalResults})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${category === "projects" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => handleCategoryChange("projects")}
            >
              {tx("common.loyihalar", undefined, "Loyihalar")} ({projects.length})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${category === "tasks" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => handleCategoryChange("tasks")}
            >
              {tx("common.vazifalar", undefined, "Vazifalar")} ({tasks.length})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${category === "orders" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => handleCategoryChange("orders")}
            >
              {tx("common.buyurtmalar", undefined, "Buyurtmalar")} ({orders.length})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${category === "users" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => handleCategoryChange("users")}
            >
              {tx("common.foydalanuvchilar", undefined, "Foydalanuvchilar")} ({users.length})
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && <Loading />}

        {/* Empty state */}
        {!loading && q.trim() && totalResults === 0 && (
          <EmptyState
            icon="🔍"
            title={tx("search.hech_narsa_topilmadi", undefined, "Hech narsa topilmadi")}
            message={tx("search.boshqa_soz_kiriting", undefined, `"${q}" so'rovi bo'yicha hech qanday natija mavjud emas. Boshqa so'z bilan qidirib ko'ring.`)}
          />
        )}

        {/* Initial Prompt when nothing searched yet */}
        {!loading && !q.trim() && (
          <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted)" }}>
            <p style={{ fontSize: 14 }}>
              {tx("search.boshlangich_eslatma", undefined, "Qidirish uchun yuqoridagi maydonga kalit so'zni kiriting va Enter tugmasini bosing.")}
            </p>
          </div>
        )}

        {/* Results Sections */}
        {!loading && q.trim() && totalResults > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Authenticated Results: Projects */}
            {user && (category === "all" || category === "projects") && projects.length > 0 && (
              <div className="table-card-clean">
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div className="row middle" style={{ gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />
                    <strong style={{ fontSize: 14 }}>{tx("common.loyihalar", undefined, "Loyihalar")}</strong>
                    <span className="badge">{projects.length}</span>
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="table-clean">
                    <thead>
                      <tr>
                        <th>{tx("projects.ustun_loyiha", undefined, "Loyiha nomi")}</th>
                        <th>{tx("projects.ustun_holat", undefined, "Holati")}</th>
                        <th style={{ width: 160 }}>{tx("projects.ustun_jarayon", undefined, "Jarayon")}</th>
                        <th>{tx("projects.ustun_masul", undefined, "Mas'ul")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((p) => (
                        <tr
                          key={p.id}
                          className="clickable"
                          onClick={() => setOpenProjectId(p.id)}
                        >
                          <td>
                            <div className="row middle" style={{ gap: 8 }}>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color || "var(--accent)", flexShrink: 0 }} />
                              <span style={{ fontWeight: 650, color: "var(--accent)" }}>{p.name}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${p.status === "ACTIVE" ? "badge-info" : p.status === "DONE" ? "badge-ok" : ""}`}>
                              {p.status_display}
                            </span>
                          </td>
                          <td>
                            <div style={{ width: 120 }}>
                              <Progress value={p.progress || 0} />
                            </div>
                          </td>
                          <td className="muted">{p.manager?.full_name || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Authenticated Results: Tasks */}
            {user && (category === "all" || category === "tasks") && tasks.length > 0 && (
              <div className="table-card-clean">
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div className="row middle" style={{ gap: 8 }}>
                    <IconTasks size={16} />
                    <strong style={{ fontSize: 14 }}>{tx("common.vazifalar", undefined, "Vazifalar")}</strong>
                    <span className="badge">{tasks.length}</span>
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="table-clean">
                    <thead>
                      <tr>
                        <th>{tx("review_queue.vazifa_nomi", undefined, "Vazifa nomi")}</th>
                        <th>{tx("common.loyiha", undefined, "Loyiha")}</th>
                        <th>{tx("common.holat", undefined, "Holati")}</th>
                        <th>{tx("common.ustuvorlik", undefined, "Ustuvorlik")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((t) => (
                        <tr
                          key={t.id}
                          className="clickable"
                          onClick={() => setOpenTaskId(t.id)}
                        >
                          <td>
                            <span style={{ fontWeight: 650, color: "var(--accent)" }}>{t.title}</span>
                          </td>
                          <td className="muted">{t.project_name}</td>
                          <td>
                            <StatusBadge task={t} />
                          </td>
                          <td>
                            <Priority task={t} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Authenticated Results: Orders */}
            {user && (category === "all" || category === "orders") && orders.length > 0 && (
              <div className="table-card-clean">
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div className="row middle" style={{ gap: 8 }}>
                    <IconOrder size={16} />
                    <strong style={{ fontSize: 14 }}>{tx("common.buyurtmalar", undefined, "Buyurtmalar")}</strong>
                    <span className="badge">{orders.length}</span>
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="table-clean">
                    <thead>
                      <tr>
                        <th>{tx("orders.buyurtma", undefined, "Buyurtma")}</th>
                        <th>{tx("orders.tashkilot", undefined, "Tashkilot")}</th>
                        <th>{tx("common.holat", undefined, "Holati")}</th>
                        <th>{tx("common.sana", undefined, "Sana")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr
                          key={o.id}
                          className="clickable"
                          onClick={() => {
                            window.location.href = `/buyurtmalar/${o.id}`;
                          }}
                        >
                          <td>
                            <span style={{ fontWeight: 650, color: "var(--accent)" }}>
                              #{o.id} · {o.system_name}{o.module ? ` (${o.module})` : ""}
                            </span>
                          </td>
                          <td className="muted">{o.department || "—"}</td>
                          <td>
                            <span className="badge badge-brand">{o.status_display}</span>
                          </td>
                          <td className="muted" style={{ fontSize: 12 }}>
                            {o.request_date ? new Date(o.request_date).toLocaleDateString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Authenticated Results: Users */}
            {user && (category === "all" || category === "users") && users.length > 0 && (
              <div className="table-card-clean">
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div className="row middle" style={{ gap: 8 }}>
                    <IconUsers size={16} />
                    <strong style={{ fontSize: 14 }}>{tx("common.foydalanuvchilar", undefined, "Foydalanuvchilar")}</strong>
                    <span className="badge">{users.length}</span>
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="table-clean">
                    <thead>
                      <tr>
                        <th>{tx("people.ism", undefined, "Ism-familiya")}</th>
                        <th>{tx("people.mutaxassislik", undefined, "Mutaxassislik")}</th>
                        <th>{tx("people.email", undefined, "Email")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr
                          key={u.id}
                          className="clickable"
                          onClick={() => {
                            window.location.href = `/xodimlar/${u.id}`;
                          }}
                        >
                          <td>
                            <div className="row middle" style={{ gap: 8 }}>
                              <Avatar user={u} size="sm" />
                              <span style={{ fontWeight: 600 }}>{u.full_name}</span>
                            </div>
                          </td>
                          <td className="muted">{u.specialty_display || u.job_title || "—"}</td>
                          <td className="muted">{u.email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Guest Results: Public Projects */}
            {!user && publicProjects.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
                {publicProjects.map((p) => (
                  <div
                    key={p.id}
                    className="card-clean"
                    style={{
                      padding: 16,
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <div className="row middle" style={{ gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: p.color || "var(--accent)" }} />
                      <Link {...toPublicProject(p.id)} style={{ fontWeight: 650, fontSize: 15, color: "var(--accent)" }}>
                        {p.name}
                      </Link>
                    </div>
                    {p.description && (
                      <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.4, maxHeight: 42, overflow: "hidden" }}>
                        {p.description}
                      </p>
                    )}
                    <div style={{ marginTop: "auto" }}>
                      <div className="row middle" style={{ justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                        <span className="muted">{tx("projects.ustun_jarayon", undefined, "Jarayon")}</span>
                        <span className="mono" style={{ fontWeight: 600 }}>{p.progress || 0}%</span>
                      </div>
                      <Progress value={p.progress || 0} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* In-place Project Detail Modal */}
        {openProjectId && (
          <Suspense fallback={null}>
            <ProjectDetailModal
              projectId={openProjectId}
              onClose={() => setOpenProjectId(null)}
            />
          </Suspense>
        )}

        {/* In-place Task Detail Modal */}
        {openTaskId && (
          <Suspense fallback={null}>
            <TaskDetailModal
              taskId={openTaskId}
              onClose={() => setOpenTaskId(null)}
            />
          </Suspense>
        )}
      </div>
    </PublicShell>
  );
}
