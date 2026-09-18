/**
 * Admin panel — `/admin`.
 *
 * NEGA DJANGO ADMIN EMAS. `/django-admin/` joyida qoladi va u yerda hamma
 * jadval bor — lekin u jadvallar tilida gapiradi (`ProjectMember`,
 * `TaskAssignment`) va o'zbekcha emas. Bu sahifa esa kundalik uchta ishni
 * qiladi: hisob ochish, rol berish, parol tiklash.
 *
 * Django adminga HAVOLA ataylab qo'yilmagan: u boshqa tildagi, boshqa
 * ko'rinishdagi bo'lim va uni shu yerdan taklif qilish chalkashtiradi.
 * Kerak bo'lganda manzil qo'lda yoziladi.
 *
 * KO'RINISH ilovaning qolgan qismidan farq qilmaydi: o'sha shisha
 * kartalar, o'sha ranglar. Admin panel «boshqa dastur» bo'lib qolmasin.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, listOf, pagesOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { ChangeRequestItem, Project, Task, User } from "@/api/types";
import { claimOrder } from "@/api/orders";
import { restoreProject } from "@/api/projects";
import { restoreTask } from "@/api/tasks";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Avatar, Card, confirmDelete, Empty, ErrorMsg, fmtDate, Loading, Pager } from "@/components/ui";
import { DateField } from "@/components/dates";
import { promptDialog } from "@/components/Prompt";
import { toOrder, toProject, toProjectEdit, toUser } from "@/nav";
import { tx } from "@/i18n";
import { useSystemBranding, updateSystemBranding } from "@/api/branding";
import { Logo } from "@/components/Logo";
import { OrderStatusBadge } from "./ChangeRequests";

type Tab = "users" | "specialties" | "projects" | "orders" | "trash" | "branding";

const ROLE_TONE: Record<string, string> = {
  ADMIN: "badge-danger", BOSS: "badge-warning", MANAGER: "badge-info", DEVELOPER: "", QA: "",
};

/** Yangi hisob formasi — bo'sh holati bir joyda tursin. */
/** Bir sahifada nechta yozuv (foydalanuvchi ham, loyiha ham). */
const PER_PAGE = 30;

const EMPTY_FORM = {
  email: "", full_name: "", password: "",
  global_role: "DEVELOPER", specialty: "", seniority: "JUNIOR", job_title: "",
  department: "",
};

const EMPTY_SPEC_FORM = {
  name: "", code: "", color: "#2563eb", icon: "*", skills: "",
};

interface SpecialtyItem {
  id?: number;
  value: string;
  label: string;
  color?: string;
  icon?: string;
  skills?: string;
}

export default function Admin() {
  const { user: me, meta } = useAuth();
  const [tab, setTab] = useState<Tab>("users");

  // Ro'yxat filtrlari
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "pending" | "all">("all");
  const [projectStatusFilter, setProjectStatusFilter] = useState<"all" | "active" | "deleted">("all");
  const [userPage, setUserPage] = useState(1);
  const [projectPage, setProjectPage] = useState(1);
  const [orderPage, setOrderPage] = useState(1);
  const [orderQ, setOrderQ] = useState("");
  const [trashSubTab, setTrashSubTab] = useState<"projects" | "tasks">("projects");
  const [trashProjectPage, setTrashProjectPage] = useState(1);
  const [trashTaskPage, setTrashTaskPage] = useState(1);
  const [assignModalItem, setAssignModalItem] = useState<ChangeRequestItem | null>(null);
  const [assignPmId, setAssignPmId] = useState<number | "">("");
  const [assignDeadline, setAssignDeadline] = useState("");
  const [assignStartDate, setAssignStartDate] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [specForm, setSpecForm] = useState(EMPTY_SPEC_FORM);
  const [creating, setCreating] = useState(false);
  const [creatingSpec, setCreatingSpec] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // SAHIFALASH. Ikkala ro'yxat ham `page_size: 200` bilan so'ralardi -
  // bu serverdagi eng katta ruxsat etilgan qiymat, ya'ni SHIFT
  // (`config/pagination.py`). 201-yozuv hech qanday belgisiz yo'qolardi
  // va aynan admin panelida bu eng xavfli: bu yerda odam «hammasini
  // ko'ryapman» deb ishonadi.
  const { data: userData, loading, reload } = useFetch<unknown>(
    tab === "users" ? "/users/" : null,
    { search: q, role, inactive: statusFilter === "pending" ? "1" : statusFilter === "all" ? "all" : "",
      page: userPage, page_size: PER_PAGE },
    { debounceMs: 300 },
  );
  const users = useMemo(() => (userData ? listOf<User>(userData) : null), [userData]);
  const userPages = pagesOf(userData, PER_PAGE);

  const { data: projectData, reload: reloadProjects } = useFetch<unknown>(
    tab === "projects" ? "/projects/" : null,
    {
      scope: "all",
      deleted_status: projectStatusFilter !== "all" ? projectStatusFilter : "",
      page: projectPage,
      page_size: PER_PAGE,
    });
  const projects = useMemo(
    () => (projectData ? listOf<Project>(projectData) : null), [projectData]);
  const projectPages = pagesOf(projectData, PER_PAGE);

  const { data: trashProjectData, reload: reloadTrashProjects, loading: trashProjectsLoading } = useFetch<unknown>(
    tab === "trash" && trashSubTab === "projects" ? "/projects/" : null,
    {
      scope: "all",
      deleted_status: "deleted",
      page: trashProjectPage,
      page_size: PER_PAGE,
    });
  const trashProjects = useMemo(
    () => (trashProjectData ? listOf<Project>(trashProjectData) : null), [trashProjectData]);
  const trashProjectPages = pagesOf(trashProjectData, PER_PAGE);

  const { data: trashTaskData, reload: reloadTrashTasks, loading: trashTasksLoading } = useFetch<unknown>(
    tab === "trash" && trashSubTab === "tasks" ? "/tasks/" : null,
    {
      deleted_only: "1",
      page: trashTaskPage,
      page_size: PER_PAGE,
    });
  const trashTasks = useMemo(
    () => (trashTaskData ? listOf<Task>(trashTaskData) : null), [trashTaskData]);
  const trashTaskPages = pagesOf(trashTaskData, PER_PAGE);

  const { data: orderData, reload: reloadOrders, loading: ordersLoading } = useFetch<unknown>(
    tab === "orders" ? "/orders/" : null,
    { search: orderQ, page: orderPage, page_size: PER_PAGE },
    { debounceMs: 300 });
  const orders = useMemo(
    () => (orderData ? listOf<ChangeRequestItem>(orderData) : null), [orderData]);
  const orderPages = pagesOf(orderData, PER_PAGE);
  const orderCount = orderData && typeof orderData === "object" && "count" in orderData
    ? Number((orderData as { count?: number }).count || 0)
    : 0;

  const { data: pmUserData } = useFetch<unknown>(
    tab === "orders" ? "/users/" : null,
    { page_size: 200 });
  const pms = useMemo(() => {
    if (!pmUserData) return [];
    return listOf<User>(pmUserData).filter((u) => u.global_role === "MANAGER" || u.specialty === "PM" || u.can_create_project);
  }, [pmUserData]);

  const { data: specData, reload: reloadSpecs, loading: specsLoading } = useFetch<{ specialties?: SpecialtyItem[] }>(
    tab === "specialties" ? "/auth/specialties/" : null);
  const specialties = useMemo(
    () => (specData?.specialties || []) as SpecialtyItem[], [specData]);

  const currentBranding = useSystemBranding();
  const [brandAppName, setBrandAppName] = useState(currentBranding.app_name || "TeamFlow");
  const [brandLogoFile, setBrandLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(currentBranding.logo_url);
  const [removeLogo, setRemoveLogo] = useState(false);

  useEffect(() => {
    setBrandAppName(currentBranding.app_name || "TeamFlow");
    if (!brandLogoFile) {
      setLogoPreview(currentBranding.logo_url || null);
    }
  }, [currentBranding.app_name, currentBranding.logo_url, brandLogoFile]);

  async function handleSaveBranding(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const fd = new FormData();
      fd.append("app_name", brandAppName.trim());
      if (brandLogoFile) {
        fd.append("logo", brandLogoFile);
      } else if (removeLogo) {
        fd.append("remove_logo", "true");
      }
      const updated = await updateSystemBranding(fd);
      setBrandAppName(updated.app_name);
      setLogoPreview(updated.logo_url);
      setBrandLogoFile(null);
      setRemoveLogo(false);
      done(tx("admin.sozlamalar_saqlandi"));
    } catch (err: unknown) {
      failed(err, "Tizim sozlamalarini saqlashda xatolik yuz berdi.");
    } finally {
      setBusy(false);
    }
  }

  function done(message: string) {
    setError(null);
    setOkMsg(message);
    reload();
    reloadProjects();
    reloadSpecs();
    reloadTrashProjects();
    reloadTrashTasks();
  }

  async function handleRestoreProject(id: number, name: string) {
    if (!confirm(`«${name}» loyihasini qayta tiklashni tasdiqlaysizmi?`)) return;
    setBusy(true);
    try {
      await restoreProject(id);
      done(tx("admin.loyiha_tiklandi", { nom: name }));
    } catch (err) {
      failed(err, "Loyihani tiklashda xatolik yuz berdi.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestoreTask(id: number, title: string) {
    if (!confirm(`«${title}» vazifasini qayta tiklashni tasdiqlaysizmi?`)) return;
    setBusy(true);
    try {
      await restoreTask(id);
      done(tx("admin.vazifa_tiklandi", { nom: title }));
    } catch (err) {
      failed(err, "Vazifani tiklashda xatolik yuz berdi.");
    } finally {
      setBusy(false);
    }
  }

  function failed(err: unknown, fallback: string) {
    setOkMsg(null);
    setError(err instanceof ApiError ? err.message : fallback);
  }

  async function createSpecialty(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/specialties/", specForm);
      done(`«${specForm.name}» mutaxassisligi muvaffaqiyatli qo'shildi.`);
      setSpecForm(EMPTY_SPEC_FORM);
      setCreatingSpec(false);
    } catch (err) {
      failed(err, "Mutaxassislikni qo'shib bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSpecialty(specItem: SpecialtyItem) {
    if (!(await confirmDelete(`«${specItem.label}» mutaxassisligini o'chirish`))) return;
    setBusy(true);
    try {
      if (specItem.id) {
        await api.delete(`/auth/specialties/${specItem.id}/`);
      } else {
        // Standart mutaxassislik kodi bo'yicha
        await api.post("/auth/specialties/", { code: specItem.value, is_active: false });
      }
      done(`«${specItem.label}» mutaxassisligi o'chirildi.`);
    } catch (err) {
      failed(err, "Mutaxassislikni o'chirib bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        ...form,
        department: form.department ? Number(form.department) : null,
      };
      await api.post("/users/create/", payload);
      done(tx("admin.hisob_ochildi", { ism: form.full_name, login: form.email }));
      setForm(EMPTY_FORM);
      setCreating(false);
    } catch (err) {
      failed(err, tx("admin.hisob_ochib_bolmadi"));
    } finally {
      setBusy(false);
    }
  }

  async function patchUser(target: User, body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      await api.patch(`/users/${target.id}/role/`, body);
      done(message);
    } catch (err) {
      failed(err, tx("admin.ozgartirib_bolmadi"));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(target: User) {
    const next = await promptDialog({
      title: tx("admin.yangi_parol_soraladi", { ism: target.full_name }),
      placeholder: tx("admin.yangi_parolni_kiriting", undefined, "Yangi parolni kiriting"),
      confirmText: tx("common.saqlash", undefined, "Saqlash"),
      inputType: "password",
      required: true,
    });
    if (next === null) return;
    setBusy(true);
    try {
      await api.post(`/users/${target.id}/set-password/`, { password: next });
      done(tx("admin.parol_almashtirildi", { ism: target.full_name }));
    } catch (err) {
      failed(err, tx("admin.parolni_almashtirib_bolmadi"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(target: User) {
    if (target.is_active && !(await confirmDelete(`${target.full_name} hisobini o'chirish`))) return;
    await patchUser(target, { is_active: !target.is_active },
                    target.is_active
                      ? tx("admin.hisob_ochirildi", { ism: target.full_name })
                      : tx("admin.hisob_qayta_yoqildi", { ism: target.full_name }));
  }

  function handleOpenAssign(order: ChangeRequestItem) {
    setAssignModalItem(order);
    setAssignPmId(order.assigned_pm || "");
    setAssignStartDate(order.pm_start_date || "");
    setAssignDeadline(order.pm_deadline || order.due_date || "");
    setAssignNotes(order.pm_notes || "");
  }

  async function handleAssignSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assignModalItem) return;
    setAssignBusy(true);
    setError(null);
    try {
      await claimOrder(assignModalItem.id, {
        assigned_pm: assignPmId || undefined,
        pm_start_date: assignStartDate || undefined,
        pm_deadline: assignDeadline || undefined,
        pm_notes: assignNotes.trim() || undefined,
      });
      done(`Buyurtma (${assignModalItem.system_name}) muvaffaqiyatli PM ga topshirildi.`);
      setAssignModalItem(null);
      void reloadOrders();
    } catch (err) {
      failed(err, "Buyurtmani topshirib bo'lmadi");
    } finally {
      setAssignBusy(false);
    }
  }

  const counts = {
    users: users?.length ?? 0,
    admins: users?.filter((u) => u.global_role === "ADMIN").length ?? 0,
    bosses: users?.filter((u) => u.global_role === "BOSS").length ?? 0,
    projects: projects?.length ?? 0,
    orders: orderCount,
  };

  return (
    <>
      <PageHead
        title={<strong>{tx("common.admin_panel")}</strong>}
        tabs={[
          ["users", counts.users
            ? `${tx("people.foydalanuvchilar")} (${counts.users})`
            : tx("people.foydalanuvchilar")],
          ["specialties", specialties.length
            ? `Mutaxassisliklar (${specialties.length})`
            : "Mutaxassisliklar"],
          ["projects", counts.projects
            ? `${tx("common.loyihalar")} (${counts.projects})`
            : tx("common.loyihalar")],
          ["orders", counts.orders
            ? `Buyurtmalar (${counts.orders})`
            : "Buyurtmalar"],
          ["trash", `🗑️ ${tx("admin.ochirilganlar")}`],
          ["branding", tx("admin.logo_va_loyiha_sozlamalari")],
        ].map(([value, label]) => (
          <button key={value} type="button"
                  className={`tab ${tab === value ? "active" : ""}`}
                  onClick={() => setTab(value as Tab)}>{label}</button>
        ))}
      />

      <div className="content">
        <ErrorMsg error={error} />
        {okMsg && <div className="callout mb">{okMsg}</div>}

        {tab === "users" ? (
          <>
            <div className="filters">
              <div className="f grow">
                <label htmlFor="adm-q">{tx("common.qidiruv")}</label>
                <input id="adm-q" value={q} onChange={(e) => { setQ(e.target.value); setUserPage(1); }}
                       placeholder={tx("admin.ism_login_yoki_lavozim_boyicha")} />
              </div>
              <div className="f">
                <label htmlFor="adm-role">{tx("common.rol")}</label>
                <select id="adm-role" value={role} onChange={(e) => { setRole(e.target.value); setUserPage(1); }}>
                  <option value="">{tx("common.hammasi")}</option>
                  {(meta?.global_role || []).map((r) => (
                    <option key={String(r.value)} value={String(r.value)}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="f">
                <label htmlFor="adm-status">{tx("common.holat")}</label>
                <select id="adm-status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as "active" | "pending" | "all"); setUserPage(1); }}>
                  <option value="all">{tx("admin.barcha_hisoblar") || "Barcha hisoblar"}</option>
                  <option value="active">{tx("admin.faol_hisoblar") || "Faol hisoblar"}</option>
                  <option value="pending">{tx("admin.tasdiqlash_kutilayotganlar") || "Tasdiqlash kutilmoqda (Nofaol)"}</option>
                </select>
              </div>
              <button type="button" className="btn btn-primary"
                      onClick={() => { setCreating((v) => !v); setOkMsg(null); }}>
                {creating ? tx("common.bekor_qilish") : tx("admin.yangi_hisob")}
              </button>
            </div>

            {creating && (
              <Card title={tx("admin.yangi_hisob")}>
                <form onSubmit={createUser}>
                  <div className="row wrap" style={{ gap: 12 }}>
                    <div className="field" style={{ flex: "1 1 220px" }}>
                      <label htmlFor="nu-name">{tx("common.f_i_sh")}</label>
                      <input id="nu-name" required value={form.full_name}
                             onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                             placeholder={tx("admin.abdraxmanov_toxir_toxtasinovich")} />
                    </div>
                    <div className="field" style={{ flex: "1 1 180px" }}>
                      <label htmlFor="nu-login">{tx("admin.login")}</label>
                      <input id="nu-login" required value={form.email}
                             onChange={(e) => setForm({ ...form, email: e.target.value })}
                             placeholder={tx("admin.abdraxmanov")} />
                    </div>
                    <div className="field" style={{ flex: "1 1 180px" }}>
                      <label htmlFor="nu-pass">{tx("common.parol")}</label>
                      <input id="nu-pass" required minLength={8} value={form.password}
                             onChange={(e) => setForm({ ...form, password: e.target.value })}
                             placeholder={tx("admin.kamida_8_belgi")} />
                    </div>
                  </div>
                  <div className="row wrap" style={{ gap: 12 }}>
                    <div className="field" style={{ flex: "1 1 150px" }}>
                      <label htmlFor="nu-role">{tx("common.rol")}</label>
                      <select id="nu-role" value={form.global_role}
                              onChange={(e) => setForm({ ...form, global_role: e.target.value })}>
                        {(meta?.global_role || []).map((r) => (
                          <option key={String(r.value)} value={String(r.value)}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ flex: "1 1 180px" }}>
                      <label htmlFor="nu-job-title">{tx("admin.lavozim") || "Lavozimi"}</label>
                      <input id="nu-job-title" value={form.job_title}
                             onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                             placeholder={tx("admin.lavozim_namuna") || "Masalan: Boshliq / Kompaniya direktori"} />
                    </div>
                    <div className="field" style={{ flex: "1 1 180px" }}>
                      <label htmlFor="nu-spec">{tx("common.mutaxassislik")}</label>
                      <select id="nu-spec" value={form.specialty}
                              onChange={(e) => setForm({ ...form, specialty: e.target.value })}>
                        <option value="">{tx("admin.tanlanmagan")}</option>
                        {((specialties && specialties.length ? specialties : meta?.specialties) || []).map((s: { value: string | number; label: string }) => (
                          <option key={String(s.value)} value={String(s.value)}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ flex: "1 1 180px" }}>
                      <label htmlFor="nu-dept">{tx("admin.bolim") || "Bo'lim"}</label>
                      <select id="nu-dept" value={form.department}
                              onChange={(e) => setForm({ ...form, department: e.target.value })}>
                        <option value="">{tx("admin.bolim_tanlanmagan") || "Bo'lim tanlanmagan"}</option>
                        {(meta?.departments || []).map((d: { id: string | number; name: string }) => (
                          <option key={String(d.id)} value={String(d.id)}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {/* Parol ochiq ko'rinadi - admin uni egasiga aytishi kerak,
                      shuning uchun yashirishning ma'nosi yo'q. */}
                  <p className="muted" style={{ fontSize: 12.5 }}>
                    {tx("admin.parolni_hisob_egasiga_ozingiz_yetkazasiz")}
                  </p>
                  <button className="btn btn-primary" disabled={busy}>
                    {busy ? tx("admin.ochilmoqda") : tx("admin.hisob_ochish")}
                  </button>
                </form>
              </Card>
            )}

            {loading ? <Loading /> : !users?.length ? (
              <Card><Empty title={tx("common.hech_kim_topilmadi")}
                           text={tx("admin.qidiruvni_yoki_filtrni_ozgartiring")} /></Card>
            ) : (
              <Card padded={false} badge={
                <span className="row" style={{ gap: 6 }}>
                  <span className="badge">{counts.admins} {tx("admin.admin")}</span>
                  {counts.bosses > 0 && (
                    <span className="badge badge-warning">👑 {counts.bosses} {tx("admin.boshliq")}</span>
                  )}
                </span>
              }
                    title={tx("admin.hisoblar")}>
                <div className="table-wrap"><table className="table">
                  <thead>
                    <tr>
                      <th>{tx("admin.odam")}</th>
                      <th>{tx("admin.login")}</th>
                      <th>{tx("common.rol")}</th>
                      <th className="right">{tx("common.loyiha")}</th>
                      <th className="right">{tx("admin.ochiq_ish")}</th>
                      <th>{tx("admin.qoshilgan")}</th>
                      <th className="right">{tx("common.amallar")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className={u.is_active ? "" : "muted"} style={!u.is_active ? { background: "rgba(234, 179, 8, 0.05)" } : undefined}>
                        <td>
                          <div className="row">
                            <Avatar user={u} size="sm" />
                            <div style={{ minWidth: 0 }}>
                              <Link {...toUser(u.id)}>{u.full_name}</Link>
                              {!u.is_active && (
                                <span className="badge badge-warning" style={{ marginLeft: 6, fontSize: 10 }}>
                                  {tx("admin.tasdiqlanmagan") || "Tasdiqlanmagan"}
                                </span>
                              )}
                              <br />
                              <small className="muted">
                                {u.job_title ? (u.specialty_display ? `${u.job_title} · ${u.specialty_display}` : u.job_title) : (u.specialty_display || "—")}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td className="mono">{u.email}</td>
                        <td>
                          <select className="admin-role"
                                  value={u.global_role} disabled={busy || u.id === me?.id}
                                  title={u.id === me?.id
                                    ? tx("admin.oz_rolingizni_ozingiz_ozgartira_olmaysiz")
                                    : undefined}
                                  onChange={(e) => void patchUser(
                                    u, { global_role: e.target.value },
                                    `«${u.full_name}» roli o'zgartirildi.`)}>
                            {(meta?.global_role || []).map((r) => (
                              <option key={String(r.value)} value={String(r.value)}>{r.label}</option>
                            ))}
                          </select>
                          {u.is_platform_admin && (
                            <span className={`badge ${ROLE_TONE.ADMIN}`}> {tx("admin.admin")}</span>
                          )}
                          {u.global_role === "BOSS" && (
                            <span className="badge badge-warning"> 👑 {tx("admin.boshliq")}</span>
                          )}
                        </td>
                        <td className="right">{u.project_count ?? 0}</td>
                        <td className="right">{u.open_tasks ?? 0}</td>
                        <td className="nowrap muted">{fmtDate(u.date_joined)}</td>
                        <td className="right nowrap">
                          {!u.is_active ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-ok"
                              disabled={busy}
                              onClick={() => void patchUser(u, { is_active: true }, `«${u.full_name}» hisobi tasdiqlandi va faollashtirildi.`)}
                            >
                              ✓ {tx("admin.tasdiqlash") || "Tasdiqlash"}
                            </button>
                          ) : (
                            <>
                              <button type="button" className="btn btn-sm" disabled={busy}
                                      onClick={() => void resetPassword(u)}>{tx("common.parol")}</button>{" "}
                              <button type="button" className="btn btn-sm" disabled={busy || u.id === me?.id}
                                      onClick={() => void toggleActive(u)}>
                                {tx("common.ochirish")}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                {userPages > 1 && (
                  <div className="card-body">
                    <Pager page={userPage} pages={userPages} onPick={setUserPage} />
                  </div>
                )}
              </Card>
            )}
          </>
        ) : tab === "specialties" ? (
          <>
            <div className="filters">
              <div className="f grow">
                <span className="muted" style={{ fontSize: 13 }}>
                  Tizimdagi mutaxassisliklar va yo'nalishlar. Yangi qo'shilgan mutaxassislik ro'yxatdan o'tishda, profilda va vazifalarda avtomatik chiqadi.
                </span>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => { setCreatingSpec((v) => !v); setOkMsg(null); }}
              >
                {creatingSpec ? tx("common.bekor_qilish") : "+ Yangi mutaxassislik"}
              </button>
            </div>

            {creatingSpec && (
              <Card title="Yangi mutaxassislik qo'shish">
                <form onSubmit={createSpecialty}>
                  <div className="row wrap" style={{ gap: 12 }}>
                    <div className="field" style={{ flex: "2 1 240px" }}>
                      <label htmlFor="ns-name">Mutaxassislik nomi *</label>
                      <input
                        id="ns-name"
                        required
                        value={specForm.name}
                        onChange={(e) => setSpecForm({ ...specForm, name: e.target.value })}
                        placeholder="Masalan: Sun'iy intellekt muhandisi"
                      />
                    </div>
                    <div className="field" style={{ flex: "1 1 160px" }}>
                      <label htmlFor="ns-code">Kodi (ixtiyoriy)</label>
                      <input
                        id="ns-code"
                        value={specForm.code}
                        onChange={(e) => setSpecForm({ ...specForm, code: e.target.value.toUpperCase() })}
                        placeholder="AI"
                      />
                    </div>
                    <div className="field" style={{ flex: "0 0 110px" }}>
                      <label htmlFor="ns-color">Rangi</label>
                      <input
                        id="ns-color"
                        type="color"
                        value={specForm.color}
                        onChange={(e) => setSpecForm({ ...specForm, color: e.target.value })}
                        style={{ height: 38, padding: 2, cursor: "pointer", width: "100%" }}
                      />
                    </div>
                    <div className="field" style={{ flex: "0 0 100px" }}>
                      <label htmlFor="ns-icon">Belgi</label>
                      <input
                        id="ns-icon"
                        value={specForm.icon}
                        onChange={(e) => setSpecForm({ ...specForm, icon: e.target.value })}
                        placeholder="*"
                        maxLength={6}
                      />
                    </div>
                  </div>

                  <div className="field" style={{ marginTop: 8 }}>
                    <label htmlFor="ns-skills">Asosiy ko'nikmalar (vergul bilan)</label>
                    <input
                      id="ns-skills"
                      value={specForm.skills}
                      onChange={(e) => setSpecForm({ ...specForm, skills: e.target.value })}
                      placeholder="Python, PyTorch, LLM, Docker"
                    />
                  </div>

                  <div className="row" style={{ marginTop: 12, gap: 8 }}>
                    <button className="btn btn-primary" disabled={busy}>
                      {busy ? "Saqlanmoqda..." : "Mutaxassislikni saqlash"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setCreatingSpec(false)}
                    >
                      {tx("common.bekor_qilish")}
                    </button>
                  </div>
                </form>
              </Card>
            )}

            {specsLoading ? (
              <Loading />
            ) : !specialties.length ? (
              <Card>
                <Empty title="Mutaxassisliklar topilmadi" text="Hozircha birorta ham mutaxassislik mavjud emas." />
              </Card>
            ) : (
              <Card padded={false} title={`Barcha mutaxassisliklar (${specialties.length})`}>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Belgi va Nom</th>
                        <th>Kodi</th>
                        <th>Asosiy ko'nikmalar</th>
                        <th className="right">Rangi</th>
                        <th className="right">{tx("common.amallar")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {specialties.map((s: SpecialtyItem) => (
                        <tr key={s.value}>
                          <td>
                            <div className="row" style={{ gap: 8, alignItems: "center" }}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: 26,
                                  height: 26,
                                  borderRadius: 6,
                                  background: s.color || "#2563eb",
                                  color: "#fff",
                                  fontWeight: "bold",
                                  fontSize: 11,
                                }}
                              >
                                {s.icon || "*"}
                              </span>
                              <strong>{s.label}</strong>
                            </div>
                          </td>
                          <td className="mono">{s.value}</td>
                          <td className="muted" style={{ fontSize: 12.5 }}>
                            {Array.isArray(s.skills) ? s.skills.join(", ") : s.skills || "—"}
                          </td>
                          <td className="right">
                            <span
                              style={{
                                display: "inline-block",
                                width: 16,
                                height: 16,
                                borderRadius: 4,
                                backgroundColor: s.color || "#2563eb",
                                border: "1px solid rgba(0,0,0,0.15)",
                                verticalAlign: "middle",
                              }}
                              title={s.color}
                            />
                          </td>
                          <td className="right nowrap">
                            <button
                              type="button"
                              className="btn btn-sm"
                              disabled={busy}
                              onClick={() => void deleteSpecialty(s)}
                            >
                              {tx("common.ochirish")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        ) : tab === "projects" ? (
          <Card padded={false} title={tx("common.barcha_loyihalar")}>
            <div className="filters card-body" style={{ paddingBottom: 12 }}>
              <div className="f">
                <label htmlFor="adm-proj-status">{tx("common.holat")}</label>
                <select
                  id="adm-proj-status"
                  value={projectStatusFilter}
                  onChange={(e) => {
                    setProjectStatusFilter(e.target.value as "all" | "active" | "deleted");
                    setProjectPage(1);
                  }}
                >
                  <option value="all">{tx("admin.holat_barchasi")}</option>
                  <option value="active">{tx("admin.holat_faol")}</option>
                  <option value="deleted">{tx("admin.holat_ochirilgan")}</option>
                </select>
              </div>
            </div>
            {!projects?.length ? (
              <Empty title={tx("admin.loyiha_yoq")} text={tx("admin.hali_birorta_loyiha_ochilmagan")} />
            ) : (
              <div className="table-wrap"><table className="table">
                <thead>
                  <tr>
                    <th>{tx("common.loyiha")}</th>
                    <th>{tx("admin.ish_maydoni")}</th>
                    <th>{tx("admin.menejer")}</th>
                    <th className="right">{tx("admin.azo")}</th>
                    <th className="right">{tx("admin.ochiq_ish")}</th>
                    <th className="right">{tx("admin.jarayon")}</th>
                    <th className="right">{tx("orders.amallar", undefined, "Amallar")}</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id} style={p.is_deleted ? { opacity: 0.75, background: "rgba(239, 68, 68, 0.04)" } : undefined}>
                      <td>
                        <span className="lang-dot" style={{ background: p.color }} />{" "}
                        {p.is_deleted ? (
                          <span style={{ textDecoration: "line-through", color: "var(--text-muted)" }}>
                            {p.name}
                          </span>
                        ) : (
                          <Link {...toProject(p.id)}>{p.name}</Link>
                        )}
                        {p.is_deleted && (
                          <span className="badge badge-danger" style={{ marginLeft: 6, fontSize: 11 }}>
                            {tx("admin.holat_ochirilgan")}
                          </span>
                        )}
                      </td>
                      <td className="muted">{p.workspace_name}</td>
                      <td>{p.manager?.full_name || "—"}</td>
                      <td className="right">{p.member_count}</td>
                      <td className="right">{p.open_tasks}</td>
                      <td className="right">{p.progress}%</td>
                      <td className="right nowrap">
                        {p.is_deleted ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            disabled={busy}
                            onClick={() => void handleRestoreProject(p.id, p.name)}
                          >
                            ♻️ {tx("admin.qayta_tiklash")}
                          </button>
                        ) : (
                          <Link {...toProjectEdit(p.id)} className="btn btn-sm btn-outline">
                            ✏️ {tx("common.tahrirlash")}
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
            {projectPages > 1 && (
              <div className="card-body">
                <Pager page={projectPage} pages={projectPages} onPick={setProjectPage} />
              </div>
            )}
          </Card>
        ) : tab === "orders" ? (
          <Card padded={false} title="Buyurtmalar (PM tayinlash va topshirish)">
            <div className="filters card-body" style={{ paddingBottom: 12 }}>
              <div className="f grow">
                <label htmlFor="adm-order-q">{tx("common.qidiruv")}</label>
                <input
                  id="adm-order-q"
                  value={orderQ}
                  onChange={(e) => { setOrderQ(e.target.value); setOrderPage(1); }}
                  placeholder="Tizim nomi yoki bo'linma bo'yicha qidiruv..."
                />
              </div>
            </div>
            {ordersLoading ? (
              <Loading />
            ) : !orders?.length ? (
              <Empty title="Buyurtmalar mavjud emas" text="Hozircha birorta ham buyurtma kelib tushmagan." />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>№</th>
                      <th>Axborot tizimi / Modul</th>
                      <th>Bo'linma</th>
                      <th>Holati</th>
                      <th>Mas'ul PM</th>
                      <th>Muddati</th>
                      <th className="right">Amal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((item, idx) => (
                      <tr key={item.id}>
                        <td>
                          <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>
                            {(orderPage - 1) * PER_PAGE + idx + 1}
                          </span>
                        </td>
                        <td>
                          <Link {...toOrder(item.id)} style={{ fontWeight: 600, color: "var(--accent)" }}>
                            {item.project_detail?.name || item.system_name}
                          </Link>
                          {item.module && <div className="muted" style={{ fontSize: 12 }}>{item.module}</div>}
                        </td>
                        <td className="muted">{item.department || "—"}</td>
                        <td>
                          <OrderStatusBadge
                            status={item.status}
                            label={item.status_display}
                            hasPendingVersion={Boolean(item.has_pending_version)}
                          />
                        </td>
                        <td>
                          {item.assigned_pm ? (
                            <span style={{ fontWeight: 600, color: "var(--text)" }}>
                              {item.assigned_pm_name || `PM #${item.assigned_pm}`}
                            </span>
                          ) : (
                            <span className="badge badge-warning">Biriktirilmagan</span>
                          )}
                        </td>
                        <td className="muted" style={{ fontSize: 12 }}>
                          {item.pm_deadline ? fmtDate(item.pm_deadline) : item.due_date ? fmtDate(item.due_date) : "—"}
                        </td>
                        <td className="right nowrap">
                          {item.status !== "DRAFT" && item.status !== "COMPLETED" ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => handleOpenAssign(item)}
                            >
                              👥 {item.assigned_pm ? "Boshqa PM ga topshirish" : "PM tayinlash"}
                            </button>
                          ) : (
                            <Link {...toOrder(item.id)} className="btn btn-sm btn-ghost">
                              Ko'rish
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {orderPages > 1 && (
              <div className="card-body">
                <Pager page={orderPage} pages={orderPages} onPick={setOrderPage} />
              </div>
            )}
          </Card>
        ) : tab === "trash" ? (
          <Card padded={false} title={`🗑️ ${tx("admin.ochirilganlar")}`}>
            <div className="card-body" style={{ borderBottom: "1px solid var(--border)", display: "flex", gap: 8 }}>
              <button
                type="button"
                className={`btn btn-sm ${trashSubTab === "projects" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => { setTrashSubTab("projects"); setTrashProjectPage(1); }}
              >
                📁 {tx("admin.ochirilgan_loyihalar")}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${trashSubTab === "tasks" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => { setTrashSubTab("tasks"); setTrashTaskPage(1); }}
              >
                ✓ {tx("admin.ochirilgan_vazifalar")}
              </button>
            </div>

            {trashSubTab === "projects" ? (
              trashProjectsLoading ? (
                <Loading />
              ) : !trashProjects?.length ? (
                <Empty
                  title={tx("admin.ochirilgan_narsalar_yoq")}
                  text="Hozircha birorta ham o'chirilgan loyiha yo'q."
                />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{tx("common.loyiha")}</th>
                        <th>{tx("admin.ish_maydoni")}</th>
                        <th>{tx("admin.menejer")}</th>
                        <th>{tx("admin.ochirilgan_sana")}</th>
                        <th>{tx("admin.ochirgan_shaxs")}</th>
                        <th className="right">{tx("orders.amallar", undefined, "Amallar")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trashProjects.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <span className="lang-dot" style={{ background: p.color }} />{" "}
                            <strong>{p.name}</strong>{" "}
                            <span className="muted" style={{ fontSize: 12 }}>({p.key})</span>
                          </td>
                          <td className="muted">{p.workspace_name}</td>
                          <td>{p.manager?.full_name || "—"}</td>
                          <td className="muted" style={{ fontSize: 12.5 }}>
                            {p.deleted_at ? fmtDate(p.deleted_at) : "—"}
                          </td>
                          <td>{p.deleted_by?.full_name || "—"}</td>
                          <td className="right nowrap">
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              disabled={busy}
                              onClick={() => void handleRestoreProject(p.id, p.name)}
                            >
                              ♻️ {tx("admin.qayta_tiklash")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {trashProjectPages > 1 && (
                    <div className="card-body">
                      <Pager page={trashProjectPage} pages={trashProjectPages} onPick={setTrashProjectPage} />
                    </div>
                  )}
                </div>
              )
            ) : (
              trashTasksLoading ? (
                <Loading />
              ) : !trashTasks?.length ? (
                <Empty
                  title={tx("admin.ochirilgan_narsalar_yoq")}
                  text="Hozircha birorta ham o'chirilgan vazifa yo'q."
                />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Kod / Nomi</th>
                        <th>Loyiha</th>
                        <th>Holati</th>
                        <th>Ijrochilar</th>
                        <th>{tx("admin.ochirilgan_sana")}</th>
                        <th className="right">{tx("orders.amallar", undefined, "Amallar")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trashTasks.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <span className="mono" style={{ fontSize: 12, fontWeight: 700, marginRight: 6 }}>
                              {t.code}
                            </span>
                            <strong>{t.title}</strong>
                          </td>
                          <td className="muted">{t.project_name || `Loyiha #${t.project}`}</td>
                          <td>
                            <span className="badge">{t.status_display || t.status}</span>
                          </td>
                          <td className="muted" style={{ fontSize: 12.5 }}>
                            {t.assignees?.map((a) => a.full_name).join(", ") || "—"}
                          </td>
                          <td className="muted" style={{ fontSize: 12.5 }}>
                            {t.deleted_at ? fmtDate(t.deleted_at) : "—"}
                          </td>
                          <td className="right nowrap">
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              disabled={busy}
                              onClick={() => void handleRestoreTask(t.id, t.title)}
                            >
                              ♻️ {tx("admin.qayta_tiklash")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {trashTaskPages > 1 && (
                    <div className="card-body">
                      <Pager page={trashTaskPage} pages={trashTaskPages} onPick={setTrashTaskPage} />
                    </div>
                  )}
                </div>
              )
            )}
          </Card>
        ) : (
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <Card title={tx("admin.tizim_sozlamalari_sarlavha")}>
              <form onSubmit={handleSaveBranding}>
                <div className="field">
                  <label htmlFor="adm-app-name" style={{ fontWeight: 600 }}>
                    {tx("admin.tizim_loyiha_nomi")}
                  </label>
                  <input
                    id="adm-app-name"
                    required
                    value={brandAppName}
                    onChange={(e) => setBrandAppName(e.target.value)}
                    placeholder="TeamFlow"
                  />
                  <span className="muted" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
                    {tx("admin.tizim_nomi_tavsif")}
                  </span>
                </div>

                <div className="field" style={{ marginTop: 20 }}>
                  <label style={{ fontWeight: 600 }}>
                    {tx("admin.tizim_logotipi")}
                  </label>
                  <div className="row middle" style={{ gap: 20, marginTop: 10, alignItems: "center" }}>
                    <div
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: 14,
                        border: "2px dashed var(--border-color, #cbd5e1)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "var(--surface-2, #f8fafc)",
                        overflow: "hidden",
                        flexShrink: 0,
                      }}
                    >
                      {logoPreview ? (
                        <img src={logoPreview} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      ) : (
                        <Logo size={48} />
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <input
                        type="file"
                        id="adm-logo-file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            setBrandLogoFile(f);
                            setLogoPreview(URL.createObjectURL(f));
                            setRemoveLogo(false);
                          }
                        }}
                      />
                      <div className="row middle" style={{ gap: 8, flexWrap: "wrap" }}>
                        <label htmlFor="adm-logo-file" className="btn btn-sm btn-primary" style={{ cursor: "pointer" }}>
                          📁 {tx("admin.yangi_logo_tanlash")}
                        </label>
                        {(logoPreview || brandLogoFile) && (
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            style={{ color: "var(--danger, #dc2626)" }}
                            onClick={() => {
                              setBrandLogoFile(null);
                              setLogoPreview(null);
                              setRemoveLogo(true);
                            }}
                          >
                            ✕ {tx("admin.standart_logoga_qaytish")}
                          </button>
                        )}
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        PNG, JPG, SVG yoki WEBP. Tavsiya etilgan o'lcham: 64x64 yoki 128x128 px.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="row" style={{ marginTop: 24, gap: 10 }}>
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    💾 {busy ? tx("common.saqlanmoqda") : tx("common.saqlash")}
                  </button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>

      {assignModalItem && (
        <div className="modal-scrim" onClick={() => !assignBusy && setAssignModalItem(null)}>
          <div
            className="modal-box"
            style={{ maxWidth: 520, width: "95%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 16.5, fontWeight: 700, margin: "0 0 12px" }}>
              {assignModalItem.assigned_pm
                ? "Buyurtmani boshqa PM ga topshirish"
                : "Buyurtmaga PM tayinlash"}
            </h3>
            <p className="muted" style={{ margin: "0 0 14px", fontSize: 13.5 }}>
              Buyurtma: <strong>{assignModalItem.system_name}</strong> ({assignModalItem.department || "Bo'linma ko'rsatilmagan"})
            </p>
            <form onSubmit={handleAssignSubmit}>
              <div className="field" style={{ marginBottom: 12 }}>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6 }}>
                  Loyiha menejeri (PM) <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <select
                  className="input"
                  required
                  value={assignPmId}
                  onChange={(e) => setAssignPmId(e.target.value ? Number(e.target.value) : "")}
                  style={{ width: "100%" }}
                >
                  <option value="">PM ni tanlang...</option>
                  {pms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({p.email})
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6 }}>
                    Boshlanish sanasi
                  </label>
                  <DateField
                    value={assignStartDate}
                    min={new Date().toLocaleDateString("en-CA")}
                    onChange={(v) => {
                      setAssignStartDate(v);
                      if (v && assignDeadline && assignDeadline < v) {
                        setAssignDeadline(v);
                      }
                    }}
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6 }}>
                    Yakuniy muddat
                  </label>
                  <DateField
                    value={assignDeadline}
                    min={assignStartDate || new Date().toLocaleDateString("en-CA")}
                    onChange={(v) => setAssignDeadline(v)}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6 }}>
                  Topshiriq ko'rsatmalari / PM izohi
                </label>
                <textarea
                  className="textarea"
                  rows={3}
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  placeholder="Yangi PM uchun ko'rsatma yoki vazifa tafsilotlari..."
                  style={{ width: "100%", resize: "vertical" }}
                />
              </div>
              <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  type="button"
                  className="btn"
                  disabled={assignBusy}
                  onClick={() => setAssignModalItem(null)}
                >
                  {tx("common.bekor_qilish")}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={assignBusy || !assignPmId}
                >
                  {assignBusy ? "Saqlanmoqda..." : "Topshirish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
