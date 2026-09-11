import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import type { Activity, ProjectMember, Task } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import TaskSubmission from "@/components/TaskSubmission";
import Timeline from "@/components/Timeline";
import { useRealtime } from "@/realtime/RealtimeContext";
import { Avatar, AvatarStack, DateField, DateTimeField, Empty, ErrorMsg, fmtDate, fmtDateTime, fromDateTimeInput, Loading, Priority, StatusBadge, timeAgo, toDateTimeInput, todayInTz } from "@/components/ui";
import { confirmDialog } from "@/components/Confirm";
import { IconChevron } from "@/components/icons";
import { toProject, toTask, toTaskEdit, useEntityId, useGo } from "@/nav";
import { createSubtask, getAvailableSubtasks, linkSubtask, unlinkSubtask } from "@/api/tasks";
import { tx } from "@/i18n";

const FILE_ICON: Record<string, string> = {
  pdf: "PDF", doc: "DOC", docx: "DOC", xls: "XLS", xlsx: "XLS",
  zip: "ZIP", rar: "ZIP", md: "MD", txt: "TXT", json: "JSON",
  log: "LOG", sql: "SQL", py: "PY", js: "JS", ts: "TS",
};

interface AccordionSectionProps {
  id?: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  badge?: React.ReactNode;
  statusText?: React.ReactNode;
  action?: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  padded?: boolean;
}

function AccordionSection({
  id,
  icon,
  title,
  badge,
  statusText,
  action,
  isOpen,
  onToggle,
  children,
  padded = true,
}: AccordionSectionProps) {
  return (
    <div
      className={`card accordion-section ${isOpen ? "is-open" : "is-collapsed"}`}
      id={id}
      style={{
        marginBottom: 10,
        borderRadius: 8,
        border: isOpen ? "1px solid var(--border)" : "1px solid var(--border-muted)",
        boxShadow: isOpen ? "0 2px 8px rgba(0,0,0,0.04)" : "none",
        transition: "all 0.18s ease",
        overflow: "hidden",
      }}
    >
      <div
        className="accordion-head"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        style={{
          cursor: "pointer",
          userSelect: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "11px 16px",
          background: "var(--surface)",
          borderBottom: isOpen ? "1px solid var(--border-muted)" : "none",
          transition: "background-color 0.15s ease",
        }}
      >
        <div className="row middle" style={{ gap: 10, minWidth: 0, flex: "1 1 auto" }}>
          <span style={{ fontSize: 16, display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
            {icon}
          </span>
          <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>
            {title}
          </h3>
          {badge}
          {!isOpen && statusText && (
            <span
              className="muted"
              style={{
                fontSize: 12,
                marginLeft: 6,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 280,
                opacity: 0.85,
              }}
            >
              {statusText}
            </span>
          )}
        </div>

        <div className="row middle" style={{ gap: 8, flexShrink: 0 }}>
          {isOpen && action && (
            <div onClick={(e) => e.stopPropagation()}>
              {action}
            </div>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 24,
              height: 24,
              color: "var(--muted)",
              transition: "transform 0.2s ease",
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            <IconChevron size={15} />
          </div>
        </div>
      </div>

      {isOpen && (
        <div className={padded ? "card-body" : undefined} style={{ padding: padded ? "14px 16px" : 0 }}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function TaskDetail() {
  const fid = useId();
  const taskId = useEntityId("task");
  const go = useGo();
  const { user, meta } = useAuth();
  const { subscribe } = useRealtime();

  const [task, setTask] = useState<Task | null>(null);
  const [history, setHistory] = useState<Activity[]>([]);
  const [histSearch, setHistSearch] = useState("");
  const [histCategory, setHistCategory] = useState("");
  const [histDays, setHistDays] = useState("");
  const [histPage, setHistPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [comment, setComment] = useState("");
  const [log, setLog] = useState({ hours: "1", note: "", work_date: todayInTz() });
  const [review, setReview] = useState({ verdict: "APPROVED", comment: "" });
  const [blockReason, setBlockReason] = useState("");
  const [editDue, setEditDue] = useState(false);
  const [due, setDue] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Ishni boshqa odamga o'tkazish: jamoa ro'yxati, kimga va nega.
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [handTo, setHandTo] = useState("");
  const [handNote, setHandNote] = useState("");

  // Subtasklar boshqaruvi (faqat PM va loyiha admini)
  const [subtaskModalOpen, setSubtaskModalOpen] = useState(false);
  const [subtaskTab, setSubtaskTab] = useState<"create" | "link">("create");
  const [stTitle, setStTitle] = useState("");
  const [stDesc, setStDesc] = useState("");
  const [stPriority, setStPriority] = useState<number>(2);
  const [stType, setStType] = useState("FEATURE");
  const [stDueDate, setStDueDate] = useState("");
  const [stAssignees, setStAssignees] = useState<number[]>([]);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [availLoading, setAvailLoading] = useState(false);
  const [selectedSubtaskId, setSelectedSubtaskId] = useState("");
  const [availSearch, setAvailSearch] = useState("");

  // Accordion yig'iladigan bo'limlar holati:
  // Sahifa ochilganda faqat eng muhim bo'limlar ochiq bo'ladi.
  const [openLeft, setOpenLeft] = useState<string | null>("desc");
  const [openRight, setOpenRight] = useState<string | null>("info");

  const toggleLeft = (section: string) => {
    setOpenLeft((prev) => (prev === section ? null : section));
  };

  const toggleRight = (section: string) => {
    setOpenRight((prev) => (prev === section ? null : section));
  };

  const load = useCallback(async () => {
    try {
      const t = await api.get<Task>(`/tasks/${taskId}/`);
      setTask(t);
      setHistory(await api.get<Activity[]>(`/tasks/${taskId}/history/`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("task_detail.vazifani_ochib_bolmadi"));
    }
  }, [taskId]);

  useEffect(() => { void load(); }, [load]);

  // Jamoa ro'yxati faqat vazifani boshqara oladigan odamga kerak - o'tkazish
  // kartasidagi tanlov uchun. Boshqalarga ortiqcha so'rov ketmaydi.
  const projectId = task?.project;
  const canReassign = Boolean(task?.access?.can_create_task);
  useEffect(() => {
    if (!projectId || !canReassign) return;
    let alive = true;
    void (async () => {
      try {
        const rows = listOf<ProjectMember>(await api.get<any>(`/projects/${projectId}/members/`));
        if (alive) setMembers(rows.filter((m) => m.is_active));
      } catch {
        // Ro'yxat kelmasa karta bo'sh turadi - vazifaning o'zi ochilaveradi.
      }
    })();
    return () => { alive = false; };
  }, [projectId, canReassign]);

  // Shu vazifaga tegilsa (izoh, holat, tekshiruv) - sahifa o'zi yangilanadi.
  useEffect(() => subscribe((d) => {
    if (d.event === "task.update" && String(d.task) === String(taskId)) void load();
  }), [subscribe, load, taskId]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("common.amalni_bajarib_bolmadi"));
    } finally {
      setBusy(false);
    }
  }

  /** Fayllarni yuklash - multipart so'rov */
  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    const fd = new FormData();
    list.forEach((f) => fd.append("file", f));
    setBusy(true);
    setError(null);
    try {
      // `api.post` - xom `fetch` emas: 401 da token o'zi yangilanadi.
      await api.post(`/tasks/${taskId}/attachments/`, fd);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("task_detail.faylni_yuklab_bolmadi"));
    } finally {
      setBusy(false);
    }
  }

  const loadAvailableTasks = useCallback(async (q?: string) => {
    if (!taskId) return;
    setAvailLoading(true);
    try {
      const items = await getAvailableSubtasks(Number(taskId), q);
      setAvailableTasks(items);
    } catch {
      setAvailableTasks([]);
    } finally {
      setAvailLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (subtaskModalOpen && subtaskTab === "link") {
      void loadAvailableTasks(availSearch);
    }
  }, [subtaskModalOpen, subtaskTab, availSearch, loadAvailableTasks]);

  async function handleCreateSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!stTitle.trim() || !task) return;
    await run(async () => {
      await createSubtask(task.id, {
        title: stTitle.trim(),
        description: stDesc.trim(),
        priority: stPriority,
        task_type: stType,
        assignee_ids: stAssignees,
        due_date: stDueDate ? fromDateTimeInput(stDueDate) : null,
      });
      setStTitle("");
      setStDesc("");
      setStPriority(2);
      setStType("FEATURE");
      setStDueDate("");
      setStAssignees([]);
      setSubtaskModalOpen(false);
    });
  }

  async function handleLinkSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSubtaskId || !task) return;
    await run(async () => {
      await linkSubtask(task.id, Number(selectedSubtaskId));
      setSelectedSubtaskId("");
      setSubtaskModalOpen(false);
    });
  }

  async function handleUnlinkSubtask(subtaskId: number, title: string) {
    if (!task) return;
    const ok = await confirmDialog({
      title: tx("task_detail.ajratish"),
      body: tx("task_detail.ajratish_tasdiq") + ` (${title})`,
      confirmText: tx("task_detail.ajratish"),
      danger: false,
    });
    if (!ok) return;
    await run(async () => {
      await unlinkSubtask(task.id, subtaskId);
    });
  }

  if (error && !task) return <div className="content"><div className="msg msg-error">{error}</div></div>;
  if (!task) return <div className="content"><Loading /></div>;

  const acc = task.access!;
  // Muddatni menejer (yoki ijrochining o'zi) qo'yadi - tahrirlash huquqi bilan bir xil.
  // Vazifa mazmunini faqat menejer va admin o'zgartiradi (serverda ham shunday).
  const canEdit = acc.can_create_task;
  const canManageSubtasks = Boolean(acc.can_create_subtask || acc.is_manager || acc.is_project_admin || acc.is_admin);
  const transitions = task.allowed_transitions || [];

  /**
   * TEKSHIRUVDAN QAYTARIB OLISH.
   *
   * Tekshiruvga topshirish tugmasini adashib bosish oson, keyin esa ish
   * tekshiruvchining navbatida osilib qolardi va uni faqat menejer
   * qaytara olardi.
   *
   * Server tomonda bu oddiy holat o'zgarishi (`IN_REVIEW -> IN_PROGRESS`),
   * lekin holatlar ro'yxatidagi «Jarayonda» degan tugma «men adashdim»
   * degan ma'noni bermaydi. Shuning uchun u ro'yxatdan olinib, o'z nomi
   * bilan alohida turadi - ikkita bir xil ish qiladigan tugma qolmasin.
   */
  const withdraw = task.status === "IN_REVIEW"
    ? transitions.find((t) => t.value === "IN_PROGRESS")
    : undefined;
  const picks = withdraw
    ? transitions.filter((t) => t.value !== "IN_PROGRESS")
    : transitions;
  const attachments = task.attachments || [];

  return (
    <>
      <PageHead
        title={
          <>
            <Link className="muted" {...toProject(task.project)}>{task.project_name}</Link>
            <span className="muted"> / </span>
            <span className="mono muted">{task.code}</span>{" "}
            <strong>{task.title}</strong>
          </>
        }
        actions={
          <>
            {canEdit && (
              <Link className="btn btn-sm" {...toTaskEdit(task.id)}>{tx("common.tahrirlash")}</Link>
            )}
            {acc.can_manage && (
              <button className="btn btn-sm btn-danger" onClick={() => void (async () => {
                const ok = await confirmDialog({
                  title: tx("task_detail.vazifa_ochirilsinmi", { kod: task.code }),
                  body: tx("task_detail.vazifa_ochirish_izohi", { nom: task.title }),
                  confirmText: tx("common.ochirish"),
                  danger: true,
                });
                if (!ok) return;
                await run(async () => {
                  await api.delete(`/tasks/${task.id}/`);
                  go(toProject(task.project, "vazifalar"));
                });
              })()}>{tx("common.ochirish_2")}</button>
            )}
          </>
        }
      />

      <div className="content">
        <ErrorMsg error={error} />

        {task.parent && (
          <div style={{ marginBottom: 12 }}>
            <Link {...toTask(task.parent)} className="parent-task-badge">
              <span>↖</span>
              <span>{tx("task_detail.asosiy_ota_vazifa")}: <strong>{task.parent_code || `#${task.parent}`}</strong> {task.parent_title ? `— ${task.parent_title}` : ""}</span>
            </Link>
          </div>
        )}

        <div className="row wrap mb">
          <StatusBadge task={task} />
          <Priority task={task} />
          <span className="badge">{task.type_display}</span>
          {task.specialty_label && <span className="badge badge-brand">{task.specialty_label}</span>}
          {task.start_date && (
            <span className="badge">{tx("task_detail.boshlanish")} {fmtDateTime(task.start_date)}</span>
          )}
          {task.due_date && !editDue && (
            <span className={`badge ${task.is_overdue ? "badge-danger" : ""}`}>
              {tx("task_detail.muddat")} {fmtDateTime(task.due_date)}
            </span>
          )}
          {/* Muddatni shu yerning o'zida qo'yish - vazifa formasiga o'tmasdan.
              Soat bilan: "13.08.2026 13:00 gacha tugatilsin". */}
          {canEdit && (editDue ? (
            <span className="row" style={{ gap: 6 }}>
              <DateTimeField style={{ width: 210 }} value={due} onChange={setDue} />
              <button className="btn btn-sm btn-primary" onClick={() => void run(async () => {
                await api.patch(`/tasks/${task.id}/`, { due_date: fromDateTimeInput(due) });
                setEditDue(false);
              })}>{tx("common.saqlash")}</button>
              <button className="btn btn-sm" onClick={() => setEditDue(false)}>{tx("task_detail.bekor")}</button>
            </span>
          ) : (
            <button className="btn btn-sm" onClick={() => {
              setDue(toDateTimeInput(task.due_date));
              setEditDue(true);
            }}>
              {task.due_date ? tx("task_detail.muddatni_ozgartirish") : tx("task_detail.muddat_qoyish")}
            </button>
          ))}
          {task.review_round > 0 && (
            <span className="badge badge-info">{task.review_round}{tx("task_detail.tekshiruv_aylanasi")}</span>
          )}
          {!!attachments.length && <span className="badge">{attachments.length} {tx("task_detail.fayl")}</span>}
        </div>

        {task.status === "CHANGES_REQUESTED" && task.reviews?.[0] && (
          <div className="callout danger mb">
            <strong>{tx("task_detail.tuzatish_talab_qilingan")}</strong> {task.reviews[0].comment}
            <br />
            <small className="muted">
              {task.reviews[0].reviewer?.full_name} · {timeAgo(task.reviews[0].created_at)}
            </small>
          </div>
        )}
        {task.status === "BLOCKED" && task.blocked_reason && (
          <div className="callout warn mb"><strong>{tx("task_detail.toxtab_qolgan")}</strong> {task.blocked_reason}</div>
        )}

        <div className="split">
          <div>
            <AccordionSection
              id="section-desc"
              icon="📝"
              title={tx("task_detail.nima_qilish_kerak")}
              statusText={
                task.description
                  ? task.description.split("\n")[0].slice(0, 50) + (task.description.length > 50 ? "..." : "")
                  : tx("common.tavsif_kiritilmagan")
              }
              isOpen={openLeft === "desc"}
              onToggle={() => toggleLeft("desc")}
            >
              {task.description ? (
                <div className="pre-wrap">{task.description}</div>
              ) : <p className="muted" style={{ margin: 0 }}>{tx("common.tavsif_kiritilmagan")}</p>}
            </AccordionSection>

            {/* ------------------------------------------------ OSTKI VAZIFALAR (SUBTASKS) */}
            <AccordionSection
              id="section-subtasks"
              icon="⚡"
              title="Subtasklar"
              badge={<span className="badge">{task.subtasks?.length || 0}</span>}
              statusText={
                task.subtasks?.length
                  ? (() => {
                      const total = task.subtasks.length;
                      const done = task.subtasks.filter((s) => s.status === "DONE").length;
                      const pct = Math.round((done / total) * 100);
                      return `${done}/${total} bajarildi (${pct}%)`;
                    })()
                  : "Hozircha subtasklar yo'q"
              }
              action={canManageSubtasks && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => setSubtaskModalOpen(true)}
                  disabled={busy}
                >
                  + Subtask qo'shish
                </button>
              )}
              isOpen={openLeft === "subtasks"}
              onToggle={() => toggleLeft("subtasks")}
            >
              {/* Progress bar */}
              {Boolean(task.subtasks && task.subtasks.length > 0) && (() => {
                const total = task.subtasks!.length;
                const done = task.subtasks!.filter((s) => s.status === "DONE").length;
                const pct = Math.round((done / total) * 100);
                return (
                  <div className="subtasks-progress-wrap">
                    <div className="row" style={{ fontSize: 13, justifyContent: "space-between" }}>
                      <span className="muted">{tx("task_detail.bajarildi_nisbati", { done, total, pct })}</span>
                      <strong className="mono">{pct}%</strong>
                    </div>
                    <div className="subtasks-progress-bar-bg">
                      <div className="subtasks-progress-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })()}

              {Boolean(task.subtasks && task.subtasks.length > 0) ? (
                <ul className="subtask-list">
                  {task.subtasks!.map((s) => (
                    <li key={s.id} className={`subtask-item ${s.status === "DONE" ? "done" : ""}`}>
                      <div className="subtask-main">
                        <StatusBadge task={s} />
                        <Link {...toTask(s.id)} className="subtask-title" title={s.title}>
                          <span className="mono muted" style={{ marginRight: 6 }}>{s.code}</span>
                          <span>{s.title}</span>
                        </Link>
                      </div>
                      <div className="subtask-meta">
                        <Priority task={s} />
                        {s.assignees && s.assignees.length > 0 && (
                          <AvatarStack users={s.assignees} />
                        )}
                        {s.due_date && (
                          <span className={`badge ${s.is_overdue ? "badge-danger" : ""}`} style={{ fontSize: 11 }}>
                            {fmtDate(s.due_date)}
                          </span>
                        )}
                        {canManageSubtasks && (
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            title={tx("task_detail.ajratish")}
                            onClick={() => void handleUnlinkSubtask(s.id, s.title)}
                            style={{ padding: "2px 8px", color: "var(--muted)", fontSize: 12 }}
                          >
                            ✕ {tx("task_detail.ajratish")}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  {tx("task_detail.ostki_vazifalar_yoq")}
                </p>
              )}
            </AccordionSection>

            {/* ------------------------------------------------ FAYLLAR */}
            <AccordionSection
              id="section-files"
              icon="📎"
              title={tx("task_detail.fayllar")}
              badge={<span className="badge">{attachments.length}</span>}
              statusText={`${attachments.length} ta fayl`}
              action={acc.can_work && (
                <button className="btn btn-sm btn-primary" onClick={() => fileInput.current?.click()} disabled={busy}>
                  + {tx("task_detail.fayl_qoshish")}
                </button>
              )}
              isOpen={openLeft === "files"}
              onToggle={() => toggleLeft("files")}
            >
              <input ref={fileInput} type="file" multiple hidden
                     onChange={(e) => { void uploadFiles(e.target.files || []); e.target.value = ""; }} />

              {acc.can_work && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    void uploadFiles(e.dataTransfer.files);
                  }}
                  onClick={() => fileInput.current?.click()}
                  style={{
                    border: `1px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
                    background: dragOver ? "var(--accent-soft)" : "transparent",
                    borderRadius: 8, padding: "18px 14px", textAlign: "center",
                    cursor: "pointer", marginBottom: attachments.length ? 14 : 0,
                  }}
                >
                  <div className="muted" style={{ fontSize: 13 }}>
                    {tx("task_detail.fayllarni_shu_yerga_tashlang_yoki")}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {tx("task_detail.skrinshot_hujjat_log_arxiv_har")}
                  </div>
                </div>
              )}

              {attachments.length > 0 && (
                <div className="grid grid-3">
                  {attachments.map((a) => (
                    <div key={a.id} className="card" style={{ background: "var(--canvas-inset)" }}>
                      {a.is_image ? (
                        <a href={a.url} target="_blank" rel="noreferrer">
                          <img src={a.url} alt={a.original_name}
                               style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
                        </a>
                      ) : (
                        <a href={a.url} target="_blank" rel="noreferrer"
                           style={{ height: 120, display: "grid", placeItems: "center",
                                    background: "var(--surface)", color: "var(--muted)" }}>
                          <span className="mono" style={{ fontSize: 20, fontWeight: 700 }}>
                            {FILE_ICON[a.extension] || a.extension.toUpperCase() || "FILE"}
                          </span>
                        </a>
                      )}
                      <div className="card-body tight">
                        <a href={a.url} target="_blank" rel="noreferrer"
                           style={{ fontSize: 13, wordBreak: "break-all" }}>
                          {a.original_name}
                        </a>
                        <div className="row" style={{ marginTop: 6 }}>
                          <small className="muted">{a.size_display}</small>
                          <span className="spacer" />
                          {(acc.can_manage || a.uploaded_by?.id === user?.id) && (
                            <button className="btn btn-sm btn-ghost" title={tx("common.ochirish_2")}
                                    onClick={() => void (async () => {
                                      const ok = await confirmDialog({
                                        title: tx("task_detail.fayl_ochirilsinmi", { nom: a.original_name }),
                                        body: tx("task_detail.fayl_butunlay_olinadi"),
                                        confirmText: tx("common.ochirish"),
                                        danger: true,
                                      });
                                      if (!ok) return;
                                      await run(() => api.delete(
                                        `/tasks/${task.id}/attachments/${a.id}/`));
                                    })()}>×</button>
                          )}
                        </div>
                        <small className="muted">
                          {a.uploaded_by?.full_name} · {timeAgo(a.created_at)}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!attachments.length && !acc.can_work && <p className="muted">{tx("task_detail.fayl_biriktirilmagan")}</p>}
            </AccordionSection>

            {/* ------------------------------------------------ TOPSHIRILGAN ISH */}
            <TaskSubmission
              task={task}
              canWork={acc.can_work}
              onChange={() => void load()}
              isOpen={openLeft === "submission"}
              onToggle={() => toggleLeft("submission")}
            />

            {/* ------------------------------------------------ IZOHLAR */}
            <AccordionSection
              id="section-comments"
              icon="💬"
              title={tx("task_detail.izohlar")}
              badge={<span className="badge">{task.comments?.length || 0}</span>}
              statusText={`${task.comments?.length || 0} ta izoh`}
              isOpen={openLeft === "comments"}
              onToggle={() => toggleLeft("comments")}
            >
              <ul className="list-plain">
                {(task.comments || []).map((c) => (
                  <li key={c.id}>
                    <div className="row">
                      <Avatar user={c.author} size="sm" />
                      <strong style={{ fontSize: 13 }}>{c.author?.full_name}</strong>
                      <span className="spacer" />
                      <small className="muted">{timeAgo(c.created_at)}</small>
                    </div>
                    <div className="pre-wrap" style={{ marginTop: 6 }}>{c.body}</div>
                  </li>
                ))}
                {!(task.comments || []).length && <li className="muted">{tx("task_detail.izoh_yoq")}</li>}
              </ul>
              <form className="mt" onSubmit={(e) => {
                e.preventDefault();
                if (!comment.trim()) return;
                void run(async () => {
                  await api.post(`/tasks/${task.id}/comments/`, { body: comment });
                  setComment("");
                });
              }}>
                <textarea rows={3} value={comment} placeholder={tx("task_detail.izoh_yozing")}
                          onChange={(e) => setComment(e.target.value)} />
                <div className="form-actions">
                  <button className="btn btn-primary btn-sm" disabled={busy || !comment.trim()}>
                    {tx("task_detail.izoh_qoldirish")}
                  </button>
                </div>
              </form>
            </AccordionSection>

            {/* ------------------------------------------------ ISH JURNALI */}
            {acc.can_work && (
              <AccordionSection
                id="section-worklogs"
                icon="⏱️"
                title={tx("task_detail.ish_jurnali")}
                badge={<span className="badge">{task.logged_hours} {tx("common.soat")}</span>}
                statusText={`${task.logged_hours} ${tx("common.soat")} qayd etilgan`}
                isOpen={openLeft === "worklogs"}
                onToggle={() => toggleLeft("worklogs")}
              >
                <ul className="list-plain">
                  {(task.worklogs || []).map((w) => (
                    <li key={w.id}>
                      <div className="row">
                        <Avatar user={w.user} size="sm" />
                        <strong style={{ fontSize: 13 }}>{w.user.full_name}</strong>
                        <span className="badge">{w.hours} {tx("common.soat")}</span>
                        <span className="spacer" />
                        <small className="muted">{fmtDate(w.work_date)}</small>
                      </div>
                      <div className="pre-wrap" style={{ marginTop: 6 }}>{w.note}</div>
                    </li>
                  ))}
                  {!(task.worklogs || []).length && <li className="muted">{tx("task_detail.yozuv_yoq")}</li>}
                </ul>
                <form className="mt" onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await api.post(`/tasks/${task.id}/worklogs/`, log);
                    setLog({ ...log, note: "", hours: "1" });
                  });
                }}>
                  <div className="row">
                    <div className="field" style={{ width: 150 }}>
                      {/* "Soat" deb yozilsa muddat soati bilan chalkashardi */}
                      <label htmlFor={`${fid}-3`}>{tx("common.sarflangan_soat")}</label>
                      <input id={`${fid}-3`} type="number" step="0.5" min="0" value={log.hours}
                             onChange={(e) => setLog({ ...log, hours: e.target.value })} />
                    </div>
                    <div className="field" style={{ width: 170 }}>
                      <label htmlFor={`${fid}-0`}>{tx("common.sana")}</label>
                      <DateField id={`${fid}-0`} value={log.work_date}
                                 onChange={(v) => setLog({ ...log, work_date: v })} />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor={`${fid}-1`}>{tx("task_detail.nima_qildingiz")}</label>
                    <textarea id={`${fid}-1`} rows={3} value={log.note} required
                              placeholder={tx("task_detail.qaysi_yechim_tanlandi_va_nima")}
                              onChange={(e) => setLog({ ...log, note: e.target.value })} />
                  </div>
                  <button className="btn btn-sm btn-primary" disabled={busy}>{tx("task_detail.jurnalga_yozish")}</button>
                </form>
              </AccordionSection>
            )}

            {(() => {
              const filteredHistory = history.filter((a) => {
                if (histCategory && a.category !== histCategory) return false;
                if (histSearch.trim()) {
                  const q = histSearch.trim().toLowerCase();
                  const matchSum = (a.summary || "").toLowerCase().includes(q);
                  const matchDet = (a.detail || "").toLowerCase().includes(q);
                  const matchActor = (a.actor?.full_name || "").toLowerCase().includes(q);
                  if (!matchSum && !matchDet && !matchActor) return false;
                }
                if (histDays) {
                  const days = Number(histDays);
                  const itemTime = new Date(a.created_at).getTime();
                  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
                  if (itemTime < cutoff) return false;
                }
                return true;
              });

              const HIST_PAGE_SIZE = 15;
              const histPages = Math.ceil(filteredHistory.length / HIST_PAGE_SIZE);
              const pagedHistory = filteredHistory.slice((histPage - 1) * HIST_PAGE_SIZE, histPage * HIST_PAGE_SIZE);

              return (
                <AccordionSection
                  id="section-history"
                  icon="📜"
                  title={tx("task_detail.vazifa_tarixi")}
                  badge={<span className="badge">{filteredHistory.length} {tx("feed.yozuv")}</span>}
                  statusText={`${filteredHistory.length} ta amal qaydi`}
                  isOpen={openLeft === "history"}
                  onToggle={() => toggleLeft("history")}
                >
                  <div className="filters" style={{ marginBottom: 16 }}>
                    <div className="f grow">
                      <label htmlFor={`${fid}-h-search`}>{tx("feed.yozuvlar_ichidan_qidirish")}</label>
                      <input
                        id={`${fid}-h-search`}
                        value={histSearch}
                        placeholder={tx("feed.matn_boyicha")}
                        onChange={(e) => {
                          setHistPage(1);
                          setHistSearch(e.target.value);
                        }}
                      />
                    </div>
                    <div className="f">
                      <label htmlFor={`${fid}-h-cat`}>{tx("feed.turkum")}</label>
                      <select
                        id={`${fid}-h-cat`}
                        value={histCategory}
                        onChange={(e) => {
                          setHistPage(1);
                          setHistCategory(e.target.value);
                        }}
                      >
                        <option value="">{tx("common.hammasi")}</option>
                        {(meta?.activity_category || []).map((c) => (
                          <option key={String(c.value)} value={String(c.value)}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="f">
                      <label htmlFor={`${fid}-h-days`}>{tx("common.davr")}</label>
                      <select
                        id={`${fid}-h-days`}
                        value={histDays}
                        onChange={(e) => {
                          setHistPage(1);
                          setHistDays(e.target.value);
                        }}
                      >
                        <option value="">{tx("feed.butun_tarix")}</option>
                        <option value="7">{tx("feed.songgi_7_kun")}</option>
                        <option value="30">{tx("feed.songgi_30_kun")}</option>
                        <option value="90">{tx("feed.songgi_90_kun")}</option>
                      </select>
                    </div>
                  </div>

                  {!filteredHistory.length ? (
                    <Empty
                      title={tx("feed.yozuv_topilmadi")}
                      text={tx("feed.filtrni_boshatib_koring")}
                    />
                  ) : (
                    <Timeline items={pagedHistory} showProject={false} showTask={false} />
                  )}

                  {histPages > 1 && (
                    <div className="row" style={{ justifyContent: "center", marginTop: 14 }}>
                      <button
                        className="btn btn-sm"
                        disabled={histPage === 1}
                        onClick={() => setHistPage((p) => p - 1)}
                      >
                        {tx("feed.oldingi")}
                      </button>
                      <span className="muted">{histPage} / {histPages}</span>
                      <button
                        className="btn btn-sm"
                        disabled={histPage >= histPages}
                        onClick={() => setHistPage((p) => p + 1)}
                      >
                        {tx("feed.keyingi")}
                      </button>
                    </div>
                  )}
                </AccordionSection>
              );
            })()}
          </div>

          {/* ------------------------------------------------ ONG USTUN */}
          <div>
            {withdraw && (
              <AccordionSection
                id="section-withdraw"
                icon="↩️"
                title={tx("task_detail.tekshiruvdan_qaytarib_olish")}
                isOpen={openRight === "withdraw"}
                onToggle={() => toggleRight("withdraw")}
              >
                <button className="btn btn-sm btn-warning" disabled={busy}
                        onClick={() => void run(() => api.post(`/tasks/${task.id}/status/`,
                                                              { status: withdraw.value }))}>
                  {tx("task_detail.qaytarib_olish")}
                </button>
              </AccordionSection>
            )}

            {picks.length > 0 && (
              <AccordionSection
                id="section-status"
                icon="🔄"
                title={tx("task_detail.holatni_ozgartirish")}
                statusText={task.status_display}
                isOpen={openRight === "status"}
                onToggle={() => toggleRight("status")}
              >
                {/* Tugmalar yonma-yon: oltita holat ustma-ust turganda panel
                    ekranning yarmini egallab, yonidagi «Tekshiruv» va boshqa
                    bo'limlarni pastga surib yuborardi. */}
                <div className="status-picker">
                  {picks.map((t) => (
                    <button key={t.value} className="btn btn-sm" disabled={busy}
                            onClick={() => void run(() => api.post(`/tasks/${task.id}/status/`, {
                              status: t.value,
                              blocked_reason: t.value === "BLOCKED" ? blockReason : "",
                            }))}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {picks.some((t) => t.value === "BLOCKED") && (
                  <div className="status-reason">
                    <label className="sr-only" htmlFor={`${fid}-4`}>{tx("task_detail.toxtash_sababi")}</label>
                    <input id={`${fid}-4`} value={blockReason} onChange={(e) => setBlockReason(e.target.value)}
                           placeholder={tx("task_detail.toxtab_qolgan_uchun_sabab")} />
                  </div>
                )}
              </AccordionSection>
            )}

            {acc.can_review && task.status === "IN_REVIEW" && (
              <AccordionSection
                id="section-review"
                icon="⚖️"
                title={tx("task_detail.tekshiruv")}
                statusText="Tekshirish kutilmoqda"
                isOpen={openRight === "review"}
                onToggle={() => toggleRight("review")}
              >
                <form onSubmit={(e) => {
                  e.preventDefault();
                  void run(() => api.post(`/tasks/${task.id}/review/`, review));
                }}>
                  <div className="field">
                    <span className="lbl">{tx("task_detail.qaror")}</span>
                    <div className="check-list">
                      {(meta?.review_verdict || []).map((v) => (
                        <label key={v.value} className={review.verdict === v.value ? "on" : ""}>
                          <input type="radio" checked={review.verdict === v.value}
                                 onChange={() => setReview({ ...review, verdict: String(v.value) })} />
                          {v.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor={`${fid}-2`}>{tx("task_detail.izoh")}</label>
                    <textarea id={`${fid}-2`} rows={4} value={review.comment}
                              placeholder={tx("task_detail.nimani_tuzatish_kerak_aniq_yozing")}
                              onChange={(e) => setReview({ ...review, comment: e.target.value })} />
                  </div>
                  <button className="btn btn-primary btn-block" disabled={busy}>{tx("task_detail.qarorni_saqlash")}</button>
                </form>
              </AccordionSection>
            )}

            <AccordionSection
              id="section-info"
              icon="ℹ️"
              title={tx("task_detail.malumotlar")}
              statusText={task.assignees?.length ? task.assignees.map((u) => u.full_name).join(", ") : "Ijrochi belgilanmagan"}
              isOpen={openRight === "info"}
              onToggle={() => toggleRight("info")}
            >
              <ul className="list-plain" style={{ fontSize: 13 }}>
                <li className="row">
                  <span className="muted">{tx("common.ijrochilar")}</span><span className="spacer" />
                  <AvatarStack users={task.assignees} />
                </li>
                <li className="row">
                  <span className="muted">{tx("task_detail.tekshiruvchi")}</span><span className="spacer" />
                  <span>{task.reviewer?.full_name || tx("task_detail.menejer")}</span>
                </li>
                <li className="row">
                  <span className="muted">{tx("task_detail.yaratgan")}</span><span className="spacer" />
                  <span>{task.created_by?.full_name || "—"}</span>
                </li>
                <li className="row">
                  <span className="muted">{tx("task_detail.yaratilgan")}</span><span className="spacer" />
                  <span>{fmtDateTime(task.created_at)}</span>
                </li>
                {task.completed_at && (
                  <li className="row">
                    <span className="muted">{tx("task_detail.yakunlangan")}</span><span className="spacer" />
                    <span>{fmtDateTime(task.completed_at)}</span>
                  </li>
                )}
              </ul>
            </AccordionSection>

            {/* Ishni boshqa odamga O'TKAZISH. Vazifa formasida ham ijrochini
                almashtirsa bo'ladi, lekin u yerda butun topshiriq qaytadan
                ochiladi; bu yerda bitta amal: kimga va nega. Ish bitta odamga
                o'tadi, oldingisi xabar oladi (serverda ham shunday). */}
            {canEdit && task.status !== "DONE" && task.status !== "CANCELLED" && (
              <AccordionSection
                id="section-reassign"
                icon="👤"
                title={tx("task_detail.boshqa_odamga_otkazish")}
                statusText="Ijrochini almashtirish"
                isOpen={openRight === "reassign"}
                onToggle={() => toggleRight("reassign")}
              >
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (!handTo) return;
                  void run(async () => {
                    await api.post(`/tasks/${task.id}/reassign/`,
                                   { user_id: Number(handTo), note: handNote.trim() });
                    setHandTo("");
                    setHandNote("");
                  });
                }}>
                  <div className="field">
                    <label htmlFor={`${fid}-5`}>{tx("task_detail.kimga")}</label>
                    <select id={`${fid}-5`} value={handTo} required
                            onChange={(e) => setHandTo(e.target.value)}>
                      <option value="">{tx("task_detail.jamoadan_tanlang")}</option>
                      {members.map((m) => {
                        const now = task.assignees.some((a) => a.id === m.user.id);
                        return (
                          <option key={m.id} value={m.user.id}>
                            {m.user.full_name} — {m.role_display}
                            {now ? tx("task_detail.hozirgi_ijrochi") : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`${fid}-6`}>{tx("task_detail.sabab_ixtiyoriy")}</label>
                    <input id={`${fid}-6`} value={handNote} placeholder={tx("task_detail.masalan_tatilga_chiqdi")}
                           onChange={(e) => setHandNote(e.target.value)} />
                  </div>
                  <button className="btn btn-primary btn-block" disabled={busy || !handTo}>
                    {tx("task_detail.otkazish")}
                  </button>
                  <small className="muted">
                    {tx("task_detail.ish_bitta_odamga_otadi_oldingi")}
                  </small>
                </form>
              </AccordionSection>
            )}


            {!!task.mismatched_assignees?.length && acc.can_manage && (
              <AccordionSection
                id="section-mismatch"
                icon="⚠️"
                title={tx("task_detail.diqqat")}
                statusText="Nomutanosiblik"
                isOpen={openRight === "mismatch"}
                onToggle={() => toggleRight("mismatch")}
              >
                <div className="callout warn" style={{ margin: 0 }}>
                  {tx("task_detail.quyidagi_ijrochilar_mutaxassisligi_vazifa_ta")}{" "}
                  {task.mismatched_assignees.map((u: any) => u.full_name).join(", ")}
                </div>
              </AccordionSection>
            )}

            {!!task.reviews?.length && (
              <AccordionSection
                id="section-reviews-history"
                icon="📑"
                title={tx("task_detail.tekshiruvlar_tarixi")}
                badge={<span className="badge">{task.reviews.length}</span>}
                statusText={`${task.reviews.length} ta sharh`}
                isOpen={openRight === "reviews_history"}
                onToggle={() => toggleRight("reviews_history")}
              >
                <ul className="list-plain">
                  {task.reviews.map((r) => (
                    <li key={r.id}>
                      <div className="row">
                        <span className={`badge ${r.verdict === "APPROVED" ? "badge-ok" : "badge-warn"}`}>
                          {r.verdict_display}
                        </span>
                        <span className="muted">{r.round_no}{tx("task_detail.aylana")}</span>
                        <span className="spacer" />
                        <small className="muted">{timeAgo(r.created_at)}</small>
                      </div>
                      {r.comment && <div className="pre-wrap" style={{ marginTop: 6 }}>{r.comment}</div>}
                      <small className="muted">{r.reviewer?.full_name}</small>
                    </li>
                  ))}
                </ul>
              </AccordionSection>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ SUBTASK MODAL (FAQAT PM VA ADMIN) */}
      {subtaskModalOpen && canManageSubtasks && (
        <div className="modal-overlay" onClick={() => setSubtaskModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <span>⚡</span>
                <span>{tx("task_detail.ostki_vazifa_qoshish")}</span>
              </h3>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSubtaskModalOpen(false)}>✕</button>
            </div>

            {/* Rejim tablari: Yangi yaratish yoki Mavjudini biriktirish */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--border-muted)", padding: "0 18px", gap: 16 }}>
              <button
                type="button"
                onClick={() => setSubtaskTab("create")}
                style={{
                  padding: "10px 0",
                  background: "transparent",
                  border: "none",
                  borderBottom: subtaskTab === "create" ? "2px solid var(--accent)" : "2px solid transparent",
                  color: subtaskTab === "create" ? "var(--accent)" : "var(--muted)",
                  fontWeight: subtaskTab === "create" ? 600 : 400,
                  cursor: "pointer",
                  fontSize: 13.5,
                }}
              >
                {tx("task_detail.ostki_vazifa_yaratish")}
              </button>
              <button
                type="button"
                onClick={() => setSubtaskTab("link")}
                style={{
                  padding: "10px 0",
                  background: "transparent",
                  border: "none",
                  borderBottom: subtaskTab === "link" ? "2px solid var(--accent)" : "2px solid transparent",
                  color: subtaskTab === "link" ? "var(--accent)" : "var(--muted)",
                  fontWeight: subtaskTab === "link" ? 600 : 400,
                  cursor: "pointer",
                  fontSize: 13.5,
                }}
              >
                {tx("task_detail.mavjud_vazifani_biriktirish")}
              </button>
            </div>

            <div className="modal-body">
              {subtaskTab === "create" ? (
                <form id="subtask-create-form" onSubmit={(e) => void handleCreateSubtask(e)}>
                  <div className="field">
                    <label htmlFor="st-title">{tx("task_detail.subtask_nomi")} *</label>
                    <input
                      id="st-title"
                      value={stTitle}
                      onChange={(e) => setStTitle(e.target.value)}
                      required
                      autoFocus
                      placeholder="Ostki vazifa sarlavhasi..."
                    />
                  </div>

                  <div className="row" style={{ gap: 12 }}>
                    <div className="field" style={{ flex: 1 }}>
                      <label htmlFor="st-type">{tx("common.turi")}</label>
                      <select id="st-type" value={stType} onChange={(e) => setStType(e.target.value)}>
                        {(meta?.task_type || [
                          { value: "FEATURE", label: "Yangi funksiya" },
                          { value: "BUG", label: "Xatolik" },
                          { value: "CHORE", label: "Texnik ish" },
                          { value: "DOCS", label: "Hujjat" },
                          { value: "RESEARCH", label: "Tadqiqot" },
                        ]).map((t) => (
                          <option key={String(t.value)} value={String(t.value)}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label htmlFor="st-priority">{tx("common.muhimlik")}</label>
                      <select id="st-priority" value={stPriority} onChange={(e) => setStPriority(Number(e.target.value))}>
                        {(meta?.task_priority || [
                          { value: 1, label: "Past" },
                          { value: 2, label: "O'rtacha" },
                          { value: 3, label: "Yuqori" },
                          { value: 4, label: "Shoshilinch" },
                        ]).map((p) => (
                          <option key={String(p.value)} value={Number(p.value)}>{p.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="st-due">{tx("task_detail.muddat")}</label>
                    <DateTimeField id="st-due" value={stDueDate} onChange={setStDueDate} />
                  </div>

                  <div className="field">
                    <label htmlFor="st-desc">{tx("task_detail.nima_qilish_kerak")}</label>
                    <textarea
                      id="st-desc"
                      rows={3}
                      value={stDesc}
                      onChange={(e) => setStDesc(e.target.value)}
                      placeholder="Nima qilish kerak..."
                    />
                  </div>

                  {members.length > 0 && (
                    <div className="field">
                      <label>{tx("common.ijrochilar")}</label>
                      <div style={{ maxHeight: 120, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6, padding: 6 }}>
                        {members.map((m) => {
                          const checked = stAssignees.includes(m.user.id);
                          return (
                            <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", cursor: "pointer", fontSize: 13 }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setStAssignees((prev) =>
                                    checked ? prev.filter((id) => id !== m.user.id) : [...prev, m.user.id]
                                  );
                                }}
                              />
                              <span>{m.user.full_name}</span>
                              <span className="muted" style={{ fontSize: 11 }}>({m.role_display})</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </form>
              ) : (
                <form id="subtask-link-form" onSubmit={(e) => void handleLinkSubtask(e)}>
                  <div className="field">
                    <label htmlFor="st-link-search">{tx("common.qidiruv") || "Qidiruv"}</label>
                    <input
                      id="st-link-search"
                      value={availSearch}
                      onChange={(e) => setAvailSearch(e.target.value)}
                      placeholder="Vazifa kodi yoki nomi bo'yicha qidirish..."
                    />
                  </div>

                  <div className="field">
                    <label>{tx("task_detail.vazifani_tanlang")}</label>
                    {availLoading ? (
                      <div className="muted" style={{ padding: 12, fontSize: 13 }}>Yuklanmoqda...</div>
                    ) : availableTasks.length > 0 ? (
                      <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
                        {availableTasks.map((t) => {
                          const selected = selectedSubtaskId === String(t.id);
                          return (
                            <div
                              key={t.id}
                              onClick={() => setSelectedSubtaskId(String(t.id))}
                              style={{
                                padding: "8px 12px",
                                cursor: "pointer",
                                background: selected ? "var(--accent-soft)" : "transparent",
                                borderBottom: "1px solid var(--border-muted)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                                fontSize: 13,
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <span className="mono muted" style={{ marginRight: 6 }}>{t.code}</span>
                                <strong>{t.title}</strong>
                              </div>
                              <StatusBadge task={t} />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="muted" style={{ fontSize: 13, padding: 8 }}>Biriktirish uchun mos erkin vazifa topilmadi.</p>
                    )}
                  </div>
                </form>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-sm" onClick={() => setSubtaskModalOpen(false)}>
                {tx("task_detail.bekor")}
              </button>
              {subtaskTab === "create" ? (
                <button
                  type="submit"
                  form="subtask-create-form"
                  className="btn btn-sm btn-primary"
                  disabled={busy || !stTitle.trim()}
                >
                  {busy ? "Saqlanmoqda..." : tx("common.saqlash")}
                </button>
              ) : (
                <button
                  type="submit"
                  form="subtask-link-form"
                  className="btn btn-sm btn-primary"
                  disabled={busy || !selectedSubtaskId}
                >
                  {busy ? "Biriktirilmoqda..." : tx("task_detail.biriktirish")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
