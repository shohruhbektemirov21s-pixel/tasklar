import { useCallback, useEffect, useId, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import type { Project, Task, UserBrief } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import FilePicker, { uploadFiles } from "@/components/FilePicker";
import { IconSearch } from "@/components/icons";
import { Avatar, Card, DateTimeField, ErrorMsg, Loading, fromDateTimeInput, toDateTimeInput }
  from "@/components/ui";
import { toTask, useEntityId, useGo, useIsPath } from "@/nav";
import { tx } from "@/i18n";

interface Suggestion {
  user: UserBrief;
  role: string;
  open_tasks: number;
  matches: boolean;
}

export default function TaskForm() {
  const fid = useId();
  const [sp] = useSearchParams();
  const queryParent = sp.get("parent");

  // `taskId` bo'lsa - tahrirlash, bo'lmasa - `id` loyihasida yangi vazifa.
  // Rejim MARSHRUTDAN aniqlanadi: `/loyiha/vazifa-yaratish` da sessiyada
  // qolgan vazifa raqami bo'lsa, forma yangi vazifa o'rniga eskisini
  // tahrirlashga o'tib ketardi.
  const creating = useIsPath("/loyiha/vazifa-yaratish");
  const id = useEntityId("project");
  const storedTask = useEntityId("task");
  const taskId = creating ? null : storedTask;
  const go = useGo();
  const { user, meta } = useAuth();
  const editing = Boolean(taskId);

  const [project, setProject] = useState<Project | null>(null);
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [candidates, setCandidates] = useState<UserBrief[]>([]);
  const [addingUserId, setAddingUserId] = useState<number | null>(null);
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [memberSuccessMsg, setMemberSuccessMsg] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<number[]>([]);
  // Jamoa kattalashganda uzun ro'yxatdan odam topib bo'lmaydi - shuning uchun qidiruv.
  const [who, setWho] = useState("");
  // Fayllar vazifa yaratilgandan keyin biriktiriladi - avval id kerak.
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  // Ota vazifa
  const [parentTaskId, setParentTaskId] = useState<string>(queryParent || "");
  const [parentTask, setParentTask] = useState<Task | null>(null);

  const [f, setF] = useState({
    title: "", description: "", acceptance_criteria: "",
    task_type: "FEATURE", priority: 2, status: "TODO",
    required_specialty: "", start_date: "", due_date: "",
    reviewer_id: "",
  });

  const projectId = project?.id ?? id;

  useEffect(() => {
    let alive = true;
    void (async () => {
      let pid = id;
      let pList: Project[] = [];
      try {
        pList = listOf<Project>(await api.get<{ results: Project[] } | Project[]>("/projects/"));
        if (alive) setUserProjects(pList);
      } catch {
        // ignore
      }

      if (editing) {
        const t = await api.get<Task>(`/tasks/${taskId}/`);
        if (!alive) return;
        pid = String(t.project);
        setF({
          title: t.title, description: t.description, acceptance_criteria: t.acceptance_criteria,
          task_type: t.task_type, priority: t.priority, status: t.status,
          required_specialty: t.required_specialty || "",
          start_date: toDateTimeInput(t.start_date),
          due_date: toDateTimeInput(t.due_date),
          reviewer_id: t.reviewer ? String(t.reviewer.id) : "",
        });
        setAssignees(t.assignees.map((a) => a.id));
        if (t.parent) setParentTaskId(String(t.parent));
      } else if (!pid && pList.length > 0) {
        pid = String(pList[0].id);
      }

      if (pid) {
        const p = await api.get<Project>(`/projects/${pid}/`);
        if (!alive) return;
        setProject(p);
      }
      setReady(true);
    })().catch((e) => {
      // Xato ushlanmasa sahifa abadiy "Yuklanmoqda" da qolardi.
      if (alive) setError(e instanceof ApiError ? e.message : tx("task_form.vazifani_ochib_bolmadi", undefined, "Vazifani ochib bo'lmadi"));
    });
    return () => { alive = false; };
  }, [id, taskId, editing]);

  useEffect(() => {
    if (!parentTaskId) {
      setParentTask(null);
      return;
    }
    let alive = true;
    void api.get<Task>(`/tasks/${parentTaskId}/`).then((t) => {
      if (alive) setParentTask(t);
    }).catch(() => {
      if (alive) setParentTask(null);
    });
    return () => { alive = false; };
  }, [parentTaskId]);

  const loadSuggestions = useCallback(async (pid: string | number, specialty?: string) => {
    try {
      const d = await api.get<Suggestion[]>("/tasks/suggest-assignees/", {
        project: pid, specialty: specialty || "",
      });
      setSuggestions(d);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const loadCandidates = useCallback(async (pid: string | number) => {
    try {
      const d = await api.get<UserBrief[]>("/team/candidates/", { project: pid });
      setCandidates(d);
    } catch {
      setCandidates([]);
    }
  }, []);

  useEffect(() => {
    if (!projectId) return;
    void loadSuggestions(projectId, f.required_specialty);
    void loadCandidates(projectId);
  }, [projectId, f.required_specialty, loadSuggestions, loadCandidates]);

  async function handleAddMember(c: UserBrief) {
    if (!projectId) return;
    setAddingUserId(c.id);
    try {
      await api.post("/team/add/", {
        project: Number(projectId),
        user_id: c.id,
        role: "DEVELOPER",
      });
      await Promise.all([
        loadSuggestions(projectId, f.required_specialty),
        loadCandidates(projectId),
      ]);
      setAssignees((prev) => (prev.includes(c.id) ? prev : [...prev, c.id]));
      setMemberSuccessMsg(
        tx("task_form.jamoaga_qoshildi", { ism: c.full_name }, `${c.full_name} jamoaga qo'shildi va vazifaga biriktirildi`)
      );
      setTimeout(() => setMemberSuccessMsg(null), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("add_member_box.qoshib_bolmadi", undefined, "Qo'shib bo'lmadi"));
    } finally {
      setAddingUserId(null);
    }
  }

  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  const draftKey = !editing && projectId ? `teamflow_draft_task_${projectId}` : null;
  const [draftRestored, setDraftRestored] = useState(false);

  // Qoralamani yuklash (agar foydalanuvchi oldin kiritib chiqib ketgan bo'lsa)
  useEffect(() => {
    if (editing || !draftKey) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.f?.title || parsed.f?.description || parsed.f?.acceptance_criteria)) {
          setF((prev) => ({ ...prev, ...parsed.f }));
          if (Array.isArray(parsed.assignees) && parsed.assignees.length) {
            setAssignees(parsed.assignees);
          }
          setDraftRestored(true);
        }
      }
    } catch {
      // ignore
    }
  }, [editing, draftKey]);

  // Yangi vazifada dastlab foydalanuvchining o'zini tanlab qo'yish (admin, boshliq va PMga cheklov)
  useEffect(() => {
    if (!editing && user?.id && assignees.length === 0 && !draftRestored) {
      const isBoss = user.is_boss || user.global_role === "BOSS";
      const isPm = user.global_role === "MANAGER" || user.specialty === "PM" || user.is_manager;
      const isRestricted =
        user.is_platform_admin ||
        user.is_boss ||
        user.global_role === "ADMIN" ||
        user.global_role === "BOSS" ||
        (!isBoss && isPm);
      if (!isRestricted) {
        setAssignees([user.id]);
      }
    }
  }, [editing, user, draftRestored, assignees.length]);

  // Qoralamani avtomatik saqlash
  useEffect(() => {
    if (editing || !draftKey) return;
    if (!f.title.trim() && !f.description.trim() && !f.acceptance_criteria.trim()) {
      return;
    }
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ f, assignees }));
      } catch {
        // ignore
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [editing, draftKey, f, assignees]);

  function clearDraft() {
    if (draftKey) localStorage.removeItem(draftKey);
    setF({
      title: "", description: "", acceptance_criteria: "",
      task_type: "FEATURE", priority: 2, status: "TODO",
      required_specialty: "", start_date: "", due_date: "",
      reviewer_id: "",
    });
    setAssignees([]);
    setDraftRestored(false);
  }

  function toggle(uid: number) {
    setAssignees((p) => (p.includes(uid) ? p.filter((x) => x !== uid) : [...p, uid]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.due_date) {
      const today = new Date().toISOString().split("T")[0];
      const dueDay = f.due_date.split("T")[0];
      if (dueDay < today) {
        setErrors({ due_date: "Muddat bugungi kundan oldingi sana bo'lishi mumkin emas." });
        setError("Muddat bugungi kundan oldingi sana bo'lishi mumkin emas.");
        return;
      }
    }
    setBusy(true);
    setError(null);
    setErrors({});
    const body: Record<string, unknown> = {
      ...f,
      project: Number(projectId),
      priority: Number(f.priority),
      assignee_ids: assignees,
      parent: parentTaskId ? Number(parentTaskId) : null,
      start_date: fromDateTimeInput(f.start_date),
      due_date: fromDateTimeInput(f.due_date),
      reviewer_id: f.reviewer_id ? Number(f.reviewer_id) : null,
    };
    try {
      const saved = editing
        ? await api.patch<Task>(`/tasks/${taskId}/`, body)
        : await api.post<Task>("/tasks/", body);

      if (!editing && draftKey) {
        localStorage.removeItem(draftKey);
      }

      // Vazifa saqlandi. Fayl yuklanmasa ham vazifa yo'qolmasin - odam
      // vazifa sahifasida fayllarni qayta biriktira oladi.
      if (files.length) {
        try {
          await uploadFiles(`/tasks/${saved.id}/attachments/`, files);
        } catch {
          setBusy(false);
          setError(tx("task_form.vazifa_yaratildi_lekin_fayllarni_biriktirib")
                   + tx("task_form.ularni_vazifa_sahifasidan_qayta_yuklang"));
          go(toTask(saved.id));
          return;
        }
      }
      go(toTask(saved.id));
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setError(err.message);
      } else setError(tx("common.saqlashda_xatolik"));
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !project) return <div className="content"><Loading /></div>;

  // URL orqali kirib qolmasin: vazifa yaratish/tahrirlash - menejer, admin, boshliq va jamoa a'zolari
  const canAct = Boolean(
    project.access?.can_create_task ||
    project.access?.can_manage ||
    project.access?.is_member ||
    user?.is_boss ||
    user?.is_platform_admin ||
    editing
  );
  if (!canAct) {
    return (
      <div className="content">
        <Card title={tx("task_form.ruxsat_yoq", undefined, "Ruxsat yo'q")}>
          <p className="muted" style={{ margin: 0 }}>
            {tx("task_form.vazifa_yaratish_va_tahrirlash_faqat", undefined, "Vazifa yaratish va tahrirlash faqat jamoa a'zolariga ruxsat etilgan.")}
          </p>
        </Card>
      </div>
    );
  }


  const specialtyInfo = meta?.specialties?.find((s) => s.value === f.required_specialty);

  // Ism, familiya yoki email bo'yicha filtr. Tanlangan a'zo qidiruvdan tushib
  // qolsa ham tanlovi saqlanadi - pastda nechtasi yashiringani aytiladi.
  const isBoss = Boolean(user?.is_boss || user?.global_role === "BOSS");
  const needle = who.trim().toLowerCase();
  const eligibleSuggestions = suggestions.filter(
    (s) =>
      !s.user.is_platform_admin &&
      !s.user.is_boss &&
      s.user.global_role !== "ADMIN" &&
      s.user.global_role !== "BOSS" &&
      (isBoss || (s.user.global_role !== "MANAGER" && s.user.specialty !== "PM" && !s.user.is_manager))
  );
  const shown = needle
    ? eligibleSuggestions.filter((s) =>
        `${s.user.full_name} ${s.user.email}`.toLowerCase().includes(needle))
    : eligibleSuggestions;
  const hiddenPicked = assignees.filter(
    (id) => !shown.some((s) => s.user.id === id)).length;

  const filteredCandidates = needle
    ? candidates.filter((c) =>
        `${c.full_name} ${c.email}`.toLowerCase().includes(needle))
    : candidates;

  return (
    <>
      <PageHead
        title={
          <>
            <span className="muted">{project.name} / </span>
            <strong>{editing ? tx("task_form.vazifani_tahrirlash") : tx("common.yangi_vazifa")}</strong>
          </>
        }
      />
      <div className="content">
        <ErrorMsg error={error} />
        {draftRestored && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(59, 130, 246, 0.08)",
            border: "1px solid rgba(59, 130, 246, 0.3)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 14,
            fontSize: 13,
            color: "var(--color-fg-default)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>📝</span>
              <span><strong>Qoralama tiklandi:</strong> Oldin kiritilgan ma'lumotlar avtomatik yuklandi.</span>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={clearDraft}
              style={{ color: "var(--color-danger, #ef4444)" }}
            >
              Qoralamani tozalash
            </button>
          </div>
        )}
        <form onSubmit={submit}>
          <div className="split">
            <div>
              <Card title={tx("task_form.vazifa_mazmuni")}>
                {!editing && userProjects.length > 1 && (
                  <div className="field">
                    <label htmlFor={`${fid}-project`}>{tx("common.loyiha", undefined, "Loyiha")} *</label>
                    <select
                      id={`${fid}-project`}
                      value={project?.id || ""}
                      onChange={async (e) => {
                        const pid = e.target.value;
                        if (!pid) return;
                        try {
                          const p = await api.get<Project>(`/projects/${pid}/`);
                          setProject(p);
                        } catch {
                          // ignore
                        }
                      }}
                      required
                    >
                      {userProjects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="field">
                  <label htmlFor={`${fid}-0`}>{tx("task_form.sarlavha")}</label>
                  <input id={`${fid}-0`} value={f.title} required autoFocus
                         onChange={(e) => set("title", e.target.value)}
                         placeholder={tx("task_form.qisqa_va_aniq_sarlavha")} />
                  {errors.title && <div className="err">{errors.title}</div>}
                </div>
                <div className="field">
                  <label htmlFor={`${fid}-1`}>{tx("task_form.nima_qilish_kerak")}</label>
                  <textarea id={`${fid}-1`} rows={6} value={f.description}
                            onChange={(e) => set("description", e.target.value)}
                            placeholder={tx("task_form.qayerdan_boshlash_qaysi_fayllar_qanday")} />
                </div>
                <div className="field">
                  <label htmlFor={`${fid}-2`}>{tx("common.tayyorlik_mezoni")}</label>
                  <textarea id={`${fid}-2`} rows={4} value={f.acceptance_criteria}
                            onChange={(e) => set("acceptance_criteria", e.target.value)}
                            placeholder={tx("task_form.login_ishlaydi_testlar_otadi_hujjat")} />
                </div>
              </Card>

              <Card title={tx("task_form.jamoaga_azo_qoshish", undefined, "Jamoaga a'zo qo'shish")}
                    badge={<span className="badge">{assignees.length} {tx("task_form.tanlangan")}</span>}>
                {memberSuccessMsg && (
                  <div style={{
                    padding: "8px 12px",
                    background: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    borderRadius: 6,
                    color: "var(--color-success, #10b981)",
                    fontSize: 13,
                    marginBottom: 10,
                  }}>
                    ✓ {memberSuccessMsg}
                  </div>
                )}
                <div className="gh-search mb" style={{ width: "100%" }}>
                  <IconSearch size={14} />
                  <input type="search" value={who} placeholder={tx("task_form.ism_familiya_yoki_email_boyicha")}
                         onChange={(e) => setWho(e.target.value)} />
                </div>
                <div className="stack">
                  {shown.map((s) => (
                    <label key={s.user.id} className="row"
                           style={{
                             fontWeight: 400, cursor: "pointer", padding: "8px 10px",
                             border: "1px solid var(--border)", borderRadius: 6,
                             background: assignees.includes(s.user.id) ? "var(--accent-soft)" : "transparent",
                           }}>
                      <input type="checkbox" style={{ width: "auto", minHeight: 0 }}
                             checked={assignees.includes(s.user.id)}
                             onChange={() => toggle(s.user.id)} />
                      <Avatar user={s.user} size="sm" />
                      <div>
                        <strong style={{ fontSize: 13 }}>{s.user.full_name}</strong>
                        <br />
                        <small className="muted">
                          {s.user.specialty_display}
                        </small>
                      </div>
                      <span className="spacer" />
                      <span className="badge">{s.open_tasks} {tx("task_form.ochiq_ish")}</span>
                      {!s.matches && <span className="badge badge-warn">{tx("task_form.mos_emas")}</span>}
                    </label>
                  ))}
                  {!shown.length && !!eligibleSuggestions.length && (
                    <p className="muted">«{who}» {tx("task_form.boyicha_hech_kim_topilmadi")}</p>
                  )}
                  {!!hiddenPicked && (
                    <p className="muted" style={{ fontSize: 12 }}>
                      {tx("task_form.yana")} {hiddenPicked} {tx("task_form.ta_tanlangan_azo_qidiruvdan_tashqarida")}
                    </p>
                  )}

                  {!eligibleSuggestions.length && (
                    <div style={{ marginTop: 4 }}>
                      <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
                        {tx("task_form.jamoada_azo_yoq_qoshish", undefined, "Jamoada hozircha a'zo yo'q. Quyidagi xodimlardan tanlab jamoaga qo'shing:")}
                      </p>
                      {filteredCandidates.length > 0 ? (
                        <div className="stack">
                          {filteredCandidates.map((c) => (
                            <div key={c.id} className="row"
                                 style={{
                                   padding: "8px 10px", border: "1px solid var(--border)",
                                   borderRadius: 6, background: "var(--card-bg, transparent)",
                                 }}>
                              <Avatar user={c} size="sm" />
                              <div>
                                <strong style={{ fontSize: 13 }}>{c.full_name}</strong>
                                <br />
                                <small className="muted">{c.specialty_display || c.email}</small>
                              </div>
                              <span className="spacer" />
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                disabled={addingUserId === c.id}
                                onClick={() => void handleAddMember(c)}
                              >
                                {addingUserId === c.id
                                  ? tx("task_form.qoshilmoqda", undefined, "Qo'shilmoqda...")
                                  : tx("task_form.jamoaga_qoshish_btn", undefined, "+ Jamoaga qo'shish")}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="muted" style={{ fontSize: 13 }}>
                          {needle
                            ? `«${who}» ${tx("task_form.nomzod_topilmadi", undefined, "bo'yicha nomzod topilmadi.")}`
                            : tx("task_form.bu_yonalishda_jamoada_azo_yoq")}
                        </p>
                      )}
                    </div>
                  )}

                  {eligibleSuggestions.length > 0 && candidates.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px dashed var(--border)" }}>
                      {needle ? (
                        filteredCandidates.length > 0 && (
                          <>
                            <small className="muted" style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
                              {tx("task_form.boshqa_xodimlar_jamoada_yoq", undefined, "Boshqa xodimlar (jamoada yo'q):")}
                            </small>
                            <div className="stack">
                              {filteredCandidates.map((c) => (
                                <div key={c.id} className="row"
                                     style={{
                                       padding: "6px 10px", border: "1px solid var(--border)",
                                       borderRadius: 6,
                                     }}>
                                  <Avatar user={c} size="sm" />
                                  <div>
                                    <strong style={{ fontSize: 13 }}>{c.full_name}</strong>
                                    <br />
                                    <small className="muted">{c.specialty_display || c.email}</small>
                                  </div>
                                  <span className="spacer" />
                                  <button
                                    type="button"
                                    className="btn btn-sm"
                                    disabled={addingUserId === c.id}
                                    onClick={() => void handleAddMember(c)}
                                  >
                                    {addingUserId === c.id
                                      ? tx("task_form.qoshilmoqda", undefined, "Qo'shilmoqda...")
                                      : tx("task_form.jamoaga_qoshish_btn", undefined, "+ Jamoaga qo'shish")}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </>
                        )
                      ) : (
                        <div>
                          {!showAllCandidates ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              onClick={() => setShowAllCandidates(true)}
                              style={{ fontSize: 13 }}
                            >
                              {tx("task_form.boshqa_xodimni_qoshish", undefined, "+ Yangi xodimni jamoaga qo'shish")}
                            </button>
                          ) : (
                            <div>
                              <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                                <small className="muted" style={{ fontWeight: 600 }}>
                                  {tx("task_form.boshqa_xodimlar_jamoada_yoq", undefined, "Boshqa xodimlar (jamoada yo'q):")}
                                </small>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-ghost"
                                  onClick={() => setShowAllCandidates(false)}
                                  style={{ fontSize: 12, padding: "2px 6px" }}
                                >
                                  {tx("task_form.yashirish", undefined, "Yashirish")}
                                </button>
                              </div>
                              <div className="stack">
                                {candidates.map((c) => (
                                  <div key={c.id} className="row"
                                       style={{
                                         padding: "6px 10px", border: "1px solid var(--border)",
                                         borderRadius: 6,
                                       }}>
                                    <Avatar user={c} size="sm" />
                                    <div>
                                      <strong style={{ fontSize: 13 }}>{c.full_name}</strong>
                                      <br />
                                      <small className="muted">{c.specialty_display || c.email}</small>
                                    </div>
                                    <span className="spacer" />
                                    <button
                                      type="button"
                                      className="btn btn-sm"
                                      disabled={addingUserId === c.id}
                                      onClick={() => void handleAddMember(c)}
                                    >
                                      {addingUserId === c.id
                                        ? tx("task_form.qoshilmoqda", undefined, "Qo'shilmoqda...")
                                        : tx("task_form.jamoaga_qoshish_btn", undefined, "+ Jamoaga qo'shish")}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>

              {/* Tahrirlashda fayllar vazifa sahifasida boshqariladi - bu yerda
                  faqat yangi vazifaga biriktiriladigan boshlangich fayllar. */}
              {!editing && (
                <Card title={tx("task_form.fayllar")}>
                  <FilePicker files={files} onChange={setFiles} />
                </Card>
              )}
            </div>

            <div>
              <Card title={tx("task_form.xususiyatlar")}>
                {(project.access?.can_create_subtask || project.access?.is_manager || project.access?.is_project_admin) && (
                  <div className="field">
                    <label>{tx("task_detail.asosiy_ota_vazifa")}</label>
                    {parentTask ? (
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        background: "var(--canvas-inset)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        fontSize: 13
                      }}>
                        <div>
                          <strong>{parentTask.title}</strong>
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => { setParentTaskId(""); setParentTask(null); }}
                          title="Ota vazifani olib tashlash"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                        Mustaqil vazifa (ostki vazifa emas).
                      </p>
                    )}
                  </div>
                )}
                <div className="field">
                  <label htmlFor={`${fid}-3`}>{tx("task_form.kerakli_mutaxassislik")}</label>
                  <select id={`${fid}-3`} value={f.required_specialty}
                          onChange={(e) => set("required_specialty", e.target.value)}>
                    <option value="">{tx("task_form.talab_qilinmaydi")}</option>
                    {(meta?.specialties || []).map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${fid}-4`}>{tx("common.turi")}</label>
                  <select id={`${fid}-4`} value={f.task_type} onChange={(e) => set("task_type", e.target.value)}>
                    {(meta?.task_type || []).map((s) => (
                      <option key={s.value} value={String(s.value)}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${fid}-5`}>{tx("common.muhimlik")}</label>
                  <select id={`${fid}-5`} value={f.priority} onChange={(e) => set("priority", e.target.value)}>
                    {(meta?.task_priority || []).map((s) => (
                      <option key={s.value} value={String(s.value)}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${fid}-6`}>{tx("task_form.boshlangich_holat")}</label>
                  <select id={`${fid}-6`} value={f.status} onChange={(e) => set("status", e.target.value)}>
                    {(meta?.task_status || []).map((s) => (
                      <option key={s.value} value={String(s.value)}>{s.label}</option>
                    ))}
                  </select>
                </div>
                {/* Ish oynasi yonma-yon: "qachondan - qachongacha" bir qarashda
                    o'qiladi. Tor ekranda pastma-past tushadi. */}
                <div className="row wrap">
                  <div className="field" style={{ flex: 1, minWidth: 190 }}>
                    <label htmlFor={`${fid}-7`}>{tx("common.boshlanish")}</label>
                    <DateTimeField id={`${fid}-7`} value={f.start_date}
                                   max={f.due_date || undefined}
                                   onChange={(v) => set("start_date", v)} />
                  </div>
                  <div className="field" style={{ flex: 1, minWidth: 190 }}>
                    <label htmlFor={`${fid}-9`}>{tx("common.muddat")}</label>
                    {/* min: muddat boshlanishdan oldin va bugungi kundan oldin bo'lib qolmasin */}
                    <DateTimeField id={`${fid}-9`} value={f.due_date}
                                   min={f.start_date && f.start_date.split("T")[0] > new Date().toISOString().split("T")[0] ? f.start_date : (new Date().toISOString().split("T")[0] + "T00:00")}
                                   onChange={(v) => set("due_date", v)} />
                    {errors.due_date && <div className="err">{errors.due_date}</div>}
                  </div>
                </div>
                <div className="field">
                  <label htmlFor={`${fid}-8`}>{tx("task_form.tekshiruvchi")}</label>
                  <select id={`${fid}-8`} value={f.reviewer_id} onChange={(e) => set("reviewer_id", e.target.value)}>
                    <option value="">{tx("task_form.menejer_tekshiradi")}</option>
                    {(project.members || [])
                      .filter((m) => m.user.global_role !== "ADMIN" && m.user.global_role !== "BOSS" && !m.user.is_platform_admin && !m.user.is_boss)
                      .map((m) => (
                        <option key={m.user.id} value={m.user.id}>{m.user.full_name}</option>
                      ))}
                  </select>
                </div>
              </Card>

              {specialtyInfo && (
                <Card title={tx("task_form.sifat_royxati")}>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                    {specialtyInfo.checklist.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                </Card>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? tx("common.saqlanmoqda") : editing ? tx("common.saqlash") : tx("task_form.vazifa_yaratish")}
            </button>
            <button type="button" className="btn" onClick={() => go(-1)}>{tx("common.bekor_qilish")}</button>
          </div>
        </form>
      </div>
    </>
  );
}
