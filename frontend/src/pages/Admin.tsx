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
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, listOf, pagesOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { Project, User } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Avatar, Card, confirmDelete, Empty, ErrorMsg, fmtDate, Loading, Pager } from "@/components/ui";
import { toProject, toUser } from "@/nav";
import { tx } from "@/i18n";

type Tab = "users" | "specialties" | "projects";

const ROLE_TONE: Record<string, string> = {
  ADMIN: "badge-danger", MANAGER: "badge-info", DEVELOPER: "", QA: "",
};

/** Yangi hisob formasi — bo'sh holati bir joyda tursin. */
/** Bir sahifada nechta yozuv (foydalanuvchi ham, loyiha ham). */
const PER_PAGE = 30;

const EMPTY_FORM = {
  email: "", full_name: "", password: "",
  global_role: "DEVELOPER", specialty: "", seniority: "JUNIOR", job_title: "",
};

const EMPTY_SPEC_FORM = {
  name: "", code: "", color: "#2563eb", icon: "*", skills: "",
};

export default function Admin() {
  const { user: me, meta } = useAuth();
  const [tab, setTab] = useState<Tab>("users");

  // Ro'yxat filtrlari
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "pending" | "all">("all");
  const [userPage, setUserPage] = useState(1);
  const [projectPage, setProjectPage] = useState(1);

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
  const { data: userData, loading, reload } = useFetch<any>(
    tab === "users" ? "/users/" : null,
    { search: q, role, inactive: statusFilter === "pending" ? "1" : statusFilter === "all" ? "all" : "",
      page: userPage, page_size: PER_PAGE },
    { debounceMs: 300 },
  );
  const users = useMemo(() => (userData ? listOf<User>(userData) : null), [userData]);
  const userPages = pagesOf(userData, PER_PAGE);

  const { data: projectData, reload: reloadProjects } = useFetch<any>(
    tab === "projects" ? "/projects/" : null,
    { scope: "all", page: projectPage, page_size: PER_PAGE });
  const projects = useMemo(
    () => (projectData ? listOf<Project>(projectData) : null), [projectData]);
  const projectPages = pagesOf(projectData, PER_PAGE);

  const { data: specData, reload: reloadSpecs, loading: specsLoading } = useFetch<any>(
    tab === "specialties" ? "/auth/specialties/" : null);
  const specialties = useMemo(
    () => (specData?.specialties || []) as any[], [specData]);

  function done(message: string) {
    setError(null);
    setOkMsg(message);
    reload();
    reloadProjects();
    reloadSpecs();
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

  async function deleteSpecialty(specItem: any) {
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
      await api.post("/users/create/", form);
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
    const next = window.prompt(
      tx("admin.yangi_parol_soraladi", { ism: target.full_name }), "");
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

  const counts = {
    users: users?.length ?? 0,
    admins: users?.filter((u) => u.global_role === "ADMIN").length ?? 0,
    projects: projects?.length ?? 0,
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
                <select id="adm-status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as any); setUserPage(1); }}>
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
                    <div className="field" style={{ flex: "1 1 160px" }}>
                      <label htmlFor="nu-role">{tx("common.rol")}</label>
                      <select id="nu-role" value={form.global_role}
                              onChange={(e) => setForm({ ...form, global_role: e.target.value })}>
                        {(meta?.global_role || []).map((r) => (
                          <option key={String(r.value)} value={String(r.value)}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ flex: "1 1 200px" }}>
                      <label htmlFor="nu-spec">{tx("common.mutaxassislik")}</label>
                      <select id="nu-spec" value={form.specialty}
                              onChange={(e) => setForm({ ...form, specialty: e.target.value })}>
                        <option value="">{tx("admin.tanlanmagan")}</option>
                        {(meta?.specialties || []).map((s: any) => (
                          <option key={String(s.value)} value={String(s.value)}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ flex: "1 1 160px" }}>
                      <label htmlFor="nu-sen">{tx("common.daraja")}</label>
                      <select id="nu-sen" value={form.seniority}
                              onChange={(e) => setForm({ ...form, seniority: e.target.value })}>
                        {(meta?.seniority || []).map((s) => (
                          <option key={String(s.value)} value={String(s.value)}>{s.label}</option>
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
              <Card padded={false} badge={<span className="badge">{counts.admins} {tx("admin.admin")}</span>}
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
                              <small className="muted">{u.specialty_display || "—"}</small>
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
                        </td>
                        <td className="right">{(u as any).project_count ?? 0}</td>
                        <td className="right">{(u as any).open_tasks ?? 0}</td>
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
                      {specialties.map((s: any) => (
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
        ) : (
          <Card padded={false} title={tx("common.barcha_loyihalar")}>
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
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span className="lang-dot" style={{ background: p.color }} />{" "}
                        <Link {...toProject(p.id)}>{p.name}</Link>{" "}
                        <span className="badge mono">{p.key}</span>
                      </td>
                      <td className="muted">{p.workspace_name}</td>
                      <td>{p.manager?.full_name || "—"}</td>
                      <td className="right">{p.member_count}</td>
                      <td className="right">{p.open_tasks}</td>
                      <td className="right">{p.progress}%</td>
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
        )}
      </div>
    </>
  );
}
