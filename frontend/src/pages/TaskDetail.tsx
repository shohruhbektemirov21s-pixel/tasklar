import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import type { Activity, ProjectMember, Task, TaskAssignment } from "@/api/types";
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
import FilePreviewModal, { PreviewFile } from "@/components/FilePreviewModal";
import { lockScroll, unlockScroll } from "@/components/scrollLock";

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

export interface TaskDetailProps {
  taskId?: number | string;
  onClose?: () => void;
}

export default function TaskDetail({ taskId: propTaskId, onClose }: TaskDetailProps = {}) {
  const fid = useId();
  const routeTaskId = useEntityId("task");
  const taskId = propTaskId ?? routeTaskId;
  const isModal = Boolean(onClose);
  const go = useGo();
  const { user, meta } = useAuth();
  const { subscribe } = useRealtime();

  useEffect(() => {
    if (!isModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [isModal, onClose]);

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
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
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

  // Jamoa shaklida birlashtirish (Team Collaboration)
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<TaskAssignment | null>(null);
  const [teamMemberId, setTeamMemberId] = useState("");
  const [teamRole, setTeamRole] = useState("");
  const [teamStartDate, setTeamStartDate] = useState("");
  const [teamDueDate, setTeamDueDate] = useState("");
  const [teamAllocatedHours, setTeamAllocatedHours] = useState("");
  const [teamNote, setTeamNote] = useState("");

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

  // Jamoa ro'yxati vazifada jamoani birlashtirish va o'tkazish uchun kerak
  const projectId = task?.project;
  const canManageTeamMembers = Boolean(
    task?.access?.can_manage ||
    task?.access?.is_member ||
    task?.access?.can_work ||
    task?.access?.can_create_task
  );
  useEffect(() => {
    if (!projectId || !canManageTeamMembers) return;
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
  }, [projectId, canManageTeamMembers]);

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

  function handleOpenTeamModal(assignment?: TaskAssignment) {
    if (assignment) {
      setEditingAssignment(assignment);
      setTeamMemberId(String(assignment.user.id));
      setTeamRole(assignment.role || "");
      setTeamStartDate(toDateTimeInput(assignment.start_date));
      setTeamDueDate(toDateTimeInput(assignment.due_date));
      setTeamAllocatedHours(assignment.allocated_hours ? String(assignment.allocated_hours) : "");
      setTeamNote(assignment.note || "");
    } else {
      setEditingAssignment(null);
      setTeamMemberId("");
      setTeamRole("");
      setTeamStartDate(toDateTimeInput(task?.start_date));
      setTeamDueDate(toDateTimeInput(task?.due_date));
      setTeamAllocatedHours("");
      setTeamNote("");
    }
    setTeamModalOpen(true);
  }

  async function handleSaveTeamMember(e: React.FormEvent) {
    e.preventDefault();
    if (!task || !teamMemberId) return;
    await run(async () => {
      const payload = {
        user_id: Number(teamMemberId),
        role: teamRole.trim(),
        start_date: teamStartDate ? fromDateTimeInput(teamStartDate) : null,
        due_date: teamDueDate ? fromDateTimeInput(teamDueDate) : null,
        allocated_hours: teamAllocatedHours ? Number(teamAllocatedHours) : null,
        note: teamNote.trim(),
      };
      const updated = await api.post<Task>(`/tasks/${task.id}/team/`, payload);
      setTask(updated);
      setTeamModalOpen(false);
    });
  }

  async function handleRemoveTeamMember(targetUserId: number, userName: string) {
    if (!task) return;
    const ok = await confirmDialog({
      title: tx("task_detail.jamoa_chiqarish", undefined, "Chiqarish"),
      body: `${userName} — ${tx("task_detail.jamoa_chiqarish_tasdiq", undefined, "Ushbu jamoa a'zosini vazifadan chiqarishni xohlaysizmi?")}`,
      confirmText: tx("task_detail.jamoa_chiqarish", undefined, "Chiqarish"),
      danger: true,
    });
    if (!ok) return;
    await run(async () => {
      const updated = await api.post<Task>(`/tasks/${task.id}/team-remove/`, { user_id: targetUserId });
      setTask(updated);
    });
  }

  if (error && !task) {
    const errorBody = <div className="content"><div className="msg msg-error">{error}</div></div>;
    if (isModal) {
      return createPortal(
        <div className="modal-overlay" style={{
          position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(8, 11, 16, 0.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        }} onClick={onClose}>
          <div className="modal-window card" style={{ padding: 24, maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            {errorBody}
            <div style={{ textAlign: "right", marginTop: 12 }}>
              <button type="button" className="btn" onClick={onClose}>{tx("common.yopish")}</button>
            </div>
          </div>
        </div>,
        document.body
      );
    }
    return errorBody;
  }

  if (!task) {
    const loadingBody = <div className="content"><Loading /></div>;
    if (isModal) {
      return createPortal(
        <div className="modal-overlay" style={{
          position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(8, 11, 16, 0.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        }} onClick={onClose}>
          <div className="modal-window card" style={{ padding: 40 }} onClick={(e) => e.stopPropagation()}>
            <Loading />
          </div>
        </div>,
        document.body
      );
    }
    return loadingBody;
  }

  const acc = task.access!;
  const isAssignee = task.assignees.some((a) => a.id === user?.id);
  const isCreator = task.created_by?.id === user?.id;
  const canEdit = Boolean(
    acc.can_manage ||
    acc.is_member ||
    isAssignee ||
    isCreator ||
    user?.is_boss ||
    user?.is_platform_admin
  );
  const canManageSubtasks = Boolean(acc.can_create_subtask || acc.is_manager || acc.is_project_admin || acc.is_admin || user?.is_boss);
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

  async function handleDelete() {
    if (!task) return;
    const ok = await confirmDialog({
      title: tx("task_detail.vazifa_ochirilsinmi", { kod: task.title }),
      body: tx("task_detail.vazifa_ochirish_izohi", { nom: task.title }),
      confirmText: tx("common.ochirish"),
      danger: true,
    });
    if (!ok) return;
    await run(async () => {
      await api.delete(`/tasks/${task.id}/`);
      if (isModal) {
        onClose?.();
      } else {
        go(toProject(task.project, "vazifalar"));
      }
    });
  }

  const taskActions = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
      {canEdit && (
        <Link className="btn btn-sm btn-primary" {...toTaskEdit(task.id)} onClick={isModal ? onClose : undefined}>
          ✏️ {tx("common.tahrirlash", undefined, "Tahrirlash")}
        </Link>
      )}
      {acc.can_manage && (
        <button className="btn btn-sm btn-danger" onClick={() => void handleDelete()}>
          {tx("common.ochirish_2", undefined, "O'chirish")}
        </button>
      )}
    </div>
  );

  const bodyContent = (
    <>
      <ErrorMsg error={error} />

        {task.parent && (
          <div style={{ marginBottom: 12 }}>
            <Link {...toTask(task.parent)} className="parent-task-badge">
              <span>↖</span>
              <span>{tx("task_detail.asosiy_ota_vazifa", undefined, "Ota vazifa")}: <strong>{task.parent_title || `#${task.parent}`}</strong></span>
            </Link>
          </div>
        )}

        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 16,
        }}>
          <div className="row wrap" style={{ alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
            <StatusBadge task={task} />
            <Priority task={task} />
            <span className="badge">{task.type_display}</span>
            {task.specialty_label && <span className="badge badge-brand">{task.specialty_label}</span>}
            {task.start_date && (
              <span className="badge">{tx("task_detail.boshlanish", undefined, "Boshlanish")} {fmtDateTime(task.start_date)}</span>
            )}
            {task.due_date && !editDue && (
              <span className={`badge ${task.is_overdue ? "badge-danger" : ""}`}>
                {tx("task_detail.muddat", undefined, "Muddat")} {fmtDateTime(task.due_date)}
              </span>
            )}
            {/* Muddatni shu yerning o'zida qo'yish - vazifa formasiga o'tmasdan.
                Soat bilan: "13.08.2026 13:00 gacha tugatilsin". */}
            {canEdit && (editDue ? (
              <span className="row" style={{ gap: 6 }}>
                <DateTimeField
                  style={{ width: 210 }}
                  value={due}
                  min={new Date().toISOString().split("T")[0] + "T00:00"}
                  onChange={setDue}
                />
                <button className="btn btn-sm btn-primary" onClick={() => void run(async () => {
                  if (due) {
                    const today = new Date().toISOString().split("T")[0];
                    if (due.split("T")[0] < today) {
                      setError("Muddat bugungi kundan oldingi sana bo'lishi mumkin emas.");
                      return;
                    }
                  }
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

          {!isModal && taskActions}
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

            {/* ------------------------------------------------ JAMOA SHAKLIDA ISHLASH */}
            <AccordionSection
              id="section-team"
              icon="👥"
              title={tx("task_detail.jamoa_azolari", undefined, "Jamoa a'zolari")}
              badge={<span className="badge badge-brand">{task.assignments?.length || task.assignees?.length || 0}</span>}
              statusText={
                (task.assignments?.length || task.assignees?.length)
                  ? `${task.assignments?.length || task.assignees?.length} ${tx("task_detail.jamoa_orqali_birlashgan", undefined, "ta dasturchi birgalikda ishlamoqda")}`
                  : tx("task_detail.jamoa_bosh", undefined, "Jamoa biriktirilmagan")
              }
              action={canEdit && task.status !== "DONE" && task.status !== "CANCELLED" && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => handleOpenTeamModal()}
                  disabled={busy}
                >
                  + {tx("task_detail.jamoa_azosi_qoshish", undefined, "Jamoa a'zosi qo'shish")}
                </button>
              )}
              isOpen={openLeft === "team"}
              onToggle={() => toggleLeft("team")}
            >
              {task.assignments && task.assignments.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {task.assignments.map((a) => (
                    <div
                      key={a.id}
                      style={{
                        padding: "12px 14px",
                        border: "1px solid var(--border-muted)",
                        borderRadius: 8,
                        background: "var(--surface-subtle)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div className="row middle" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                        <div className="row middle" style={{ gap: 10 }}>
                          <Avatar user={a.user} size="sm" />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                              {a.user.full_name}
                            </div>
                            <div className="muted" style={{ fontSize: 11.5 }}>
                              {a.user.job_title || a.user.specialty_display || a.user.email}
                            </div>
                          </div>
                        </div>

                        <div className="row middle" style={{ gap: 6 }}>
                          {a.role && (
                            <span className="badge badge-brand" style={{ fontSize: 11.5, fontWeight: 600 }}>
                              {a.role}
                            </span>
                          )}
                          {a.allocated_hours && (
                            <span className="badge" style={{ fontSize: 11.5 }}>
                              ⏱️ {a.allocated_hours} {tx("common.soat", undefined, "soat")}
                            </span>
                          )}
                          {canEdit && task.status !== "DONE" && task.status !== "CANCELLED" && (
                            <div className="row middle" style={{ gap: 4 }}>
                              <button
                                type="button"
                                className="btn btn-sm"
                                style={{ padding: "3px 8px", fontSize: 12 }}
                                onClick={() => handleOpenTeamModal(a)}
                                title={tx("task_detail.jamoa_azosi_tahrirlash", undefined, "Tahrirlash")}
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-danger"
                                style={{ padding: "3px 8px", fontSize: 12 }}
                                onClick={() => handleRemoveTeamMember(a.user.id, a.user.full_name)}
                                title={tx("task_detail.jamoa_chiqarish", undefined, "Chiqarish")}
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {(a.start_date || a.due_date) && (
                        <div className="row middle" style={{ fontSize: 12, color: "var(--text-muted)", gap: 14 }}>
                          {a.start_date && (
                            <span>
                              <strong>{tx("task_detail.boshlanish", undefined, "Boshlanish")}:</strong> {fmtDateTime(a.start_date)}
                            </span>
                          )}
                          {a.due_date && (
                            <span>
                              <strong>{tx("task_detail.muddat", undefined, "Muddat")}:</strong> {fmtDateTime(a.due_date)}
                            </span>
                          )}
                        </div>
                      )}

                      {a.note && (
                        <div style={{ fontSize: 12, color: "var(--text)", background: "var(--surface)", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border-muted)" }}>
                          <span className="muted">{tx("task_detail.eslatma_izoh", undefined, "Eslatma")}: </span>
                          {a.note}
                        </div>
                      )}

                      {a.assigned_by && (
                        <div className="muted" style={{ fontSize: 11, textAlign: "right" }}>
                          {a.assigned_by.full_name} {tx("task_detail.dasturchi_biriktirdi", undefined, "tomonidan biriktirildi")} · {timeAgo(a.assigned_at)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : task.assignees && task.assignees.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {task.assignees.map((u) => (
                    <div
                      key={u.id}
                      className="row middle"
                      style={{
                        padding: "8px 12px",
                        border: "1px solid var(--border-muted)",
                        borderRadius: 6,
                        justifyContent: "space-between",
                      }}
                    >
                      <div className="row middle" style={{ gap: 8 }}>
                        <Avatar user={u} size="sm" />
                        <div>
                          <strong style={{ fontSize: 13 }}>{u.full_name}</strong>
                          <div className="muted" style={{ fontSize: 11 }}>{u.job_title || u.specialty_display}</div>
                        </div>
                      </div>
                      {canEdit && task.status !== "DONE" && task.status !== "CANCELLED" && (
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          style={{ padding: "2px 6px", fontSize: 11 }}
                          onClick={() => handleRemoveTeamMember(u.id, u.full_name)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "16px 12px", background: "var(--surface-subtle)", borderRadius: 6 }}>
                  <p className="muted" style={{ margin: "0 0 10px 0", fontSize: 13 }}>
                    {tx("task_detail.jamoa_bosh", undefined, "Ushbu vazifada hali jamoa a'zolari biriktirilmagan. 3 kishi yoki bir nechta dasturchini birlashtirib ishlashingiz mumkin.")}
                  </p>
                  {canEdit && task.status !== "DONE" && task.status !== "CANCELLED" && (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => handleOpenTeamModal()}
                      disabled={busy}
                    >
                      + {tx("task_detail.jamoa_azosi_qoshish", undefined, "Jamoa a'zosi qo'shish")}
                    </button>
                  )}
                </div>
              )}
            </AccordionSection>

            {/* ------------------------------------------------ OSTKI VAZIFALAR (SUBTASKS) */}
            <AccordionSection
              id="section-subtasks"
              icon="⚡"
              title={tx("task_detail.ostki_vazifalar")}
              badge={<span className="badge">{task.subtasks?.length || 0}</span>}
              statusText={
                task.subtasks?.length
                  ? (() => {
                      const total = task.subtasks.length;
                      const done = task.subtasks.filter((s) => s.status === "DONE").length;
                      const pct = Math.round((done / total) * 100);
                      return `${done}/${total} bajarildi (${pct}%)`;
                    })()
                  : tx("task_detail.ostki_vazifalar_yoq")
              }
              action={canManageSubtasks && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => setSubtaskModalOpen(true)}
                  disabled={busy}
                >
                  + {tx("task_detail.ostki_vazifa_qoshish")}
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

              {task.subtasks && task.subtasks.length > 0 ? (
                <ul className="subtask-list">
                  {task.subtasks!.map((s) => (
                    <li key={s.id} className={`subtask-item ${s.status === "DONE" ? "done" : ""}`}>
                      <div className="subtask-main">
                        <StatusBadge task={s} />
                        <Link {...toTask(s.id)} className="subtask-title" title={s.title}>
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
                        <button
                          type="button"
                          onClick={() => setPreviewFile({ url: a.url, name: a.original_name, size: a.size_display })}
                          style={{ padding: 0, border: "none", background: "none", cursor: "pointer", width: "100%", display: "block" }}
                          title="Veb-saytda ochish"
                        >
                          <img src={a.url} alt={a.original_name}
                               style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPreviewFile({ url: a.url, name: a.original_name, size: a.size_display })}
                          style={{ width: "100%", height: 120, display: "grid", placeItems: "center",
                                   background: "var(--surface)", color: "var(--muted)", border: "none", cursor: "pointer" }}
                          title="Veb-saytda ochish"
                        >
                          <span className="mono" style={{ fontSize: 20, fontWeight: 700 }}>
                            {FILE_ICON[a.extension] || a.extension.toUpperCase() || "FILE"}
                          </span>
                        </button>
                      )}
                      <div className="card-body tight">
                        <button
                          type="button"
                          onClick={() => setPreviewFile({ url: a.url, name: a.original_name, size: a.size_display })}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            font: "inherit",
                            fontSize: 13,
                            color: "var(--brand, #2563eb)",
                            cursor: "pointer",
                            textAlign: "left",
                            wordBreak: "break-all",
                            textDecoration: "underline",
                          }}
                          title="Veb-saytda ochish"
                        >
                          {a.original_name}
                        </button>
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
              title={tx("task_detail.malumotlar", undefined, "Ma'lumotlar")}
              statusText={task.assignees?.length ? task.assignees.map((u) => u.full_name).join(", ") : tx("task_detail.ijrochi_belgilanmagan", undefined, "Ijrochi belgilanmagan")}
              isOpen={openRight === "info"}
              onToggle={() => toggleRight("info")}
            >
              <ul className="list-plain" style={{ fontSize: 13 }}>
                <li className="row">
                  <span className="muted">{tx("task_detail.loyiha", undefined, "Loyiha")}</span><span className="spacer" />
                  <Link {...toProject(task.project)}><strong>{task.project_name}</strong></Link>
                </li>
                <li className="row">
                  <span className="muted">{tx("common.holat", undefined, "Holat")}</span><span className="spacer" />
                  <StatusBadge task={task} />
                </li>
                <li className="row">
                  <span className="muted">{tx("common.muhimlik", undefined, "Muhimlik")}</span><span className="spacer" />
                  <Priority task={task} />
                </li>
                <li className="row">
                  <span className="muted">{tx("task_detail.vazifa_turi", undefined, "Vazifa turi")}</span><span className="spacer" />
                  <span className="badge">{task.type_display}</span>
                </li>
                {task.specialty_label && (
                  <li className="row">
                    <span className="muted">{tx("task_detail.mutaxassislik", undefined, "Mutaxassislik")}</span><span className="spacer" />
                    <span className="badge badge-brand">{task.specialty_label}</span>
                  </li>
                )}
                {task.parent && (
                  <li className="row">
                    <span className="muted">{tx("task_detail.ota_vazifa", undefined, "Ota vazifa")}</span><span className="spacer" />
                    <Link {...toTask(task.parent)}>{task.parent_title || `#${task.parent}`}</Link>
                  </li>
                )}
                {task.order_request_no && (
                  <li className="row">
                    <span className="muted">{tx("task_detail.buyurtma_tz", undefined, "Buyurtma (TZ)")}</span><span className="spacer" />
                    <span className="mono">#{task.order_request_no}</span>
                  </li>
                )}
                <li className="row">
                  <span className="muted">{tx("common.ijrochilar", undefined, "Ijrochilar")}</span><span className="spacer" />
                  <AvatarStack users={task.assignees} />
                </li>
                <li className="row">
                  <span className="muted">{tx("task_detail.tekshiruvchi", undefined, "Tekshiruvchi")}</span><span className="spacer" />
                  <span>{task.reviewer?.full_name || tx("task_detail.menejer", undefined, "Loyiha menejeri")}</span>
                </li>
                <li className="row">
                  <span className="muted">{tx("task_detail.yaratgan", undefined, "Yaratgan")}</span><span className="spacer" />
                  <span>{task.created_by?.full_name || "—"}</span>
                </li>
                {task.start_date && (
                  <li className="row">
                    <span className="muted">{tx("task_detail.boshlanish", undefined, "Boshlanish")}</span><span className="spacer" />
                    <span>{fmtDateTime(task.start_date)}</span>
                  </li>
                )}
                {task.due_date && (
                  <li className="row">
                    <span className="muted">{tx("task_detail.muddat", undefined, "Muddat")}</span><span className="spacer" />
                    <span className={task.is_overdue ? "badge badge-danger" : ""}>{fmtDateTime(task.due_date)}</span>
                  </li>
                )}
                {task.estimate_hours && (
                  <li className="row">
                    <span className="muted">{tx("task_detail.baholangan_vaqt", undefined, "Baholangan vaqt")}</span><span className="spacer" />
                    <span>{task.estimate_hours} {tx("task_detail.soat", undefined, "soat")}</span>
                  </li>
                )}
                {task.logged_hours && Number(task.logged_hours) > 0 && (
                  <li className="row">
                    <span className="muted">{tx("task_detail.sarflangan_vaqt", undefined, "Sarflangan vaqt")}</span><span className="spacer" />
                    <span>{task.logged_hours} {tx("task_detail.soat", undefined, "soat")}</span>
                  </li>
                )}
                <li className="row">
                  <span className="muted">{tx("task_detail.yaratilgan", undefined, "Yaratilgan")}</span><span className="spacer" />
                  <span>{fmtDateTime(task.created_at)}</span>
                </li>
                {task.started_at && (
                  <li className="row">
                    <span className="muted">{tx("task_detail.haqiqiy_boshlangan", undefined, "Boshlangan")}</span><span className="spacer" />
                    <span>{fmtDateTime(task.started_at)}</span>
                  </li>
                )}
                {task.submitted_at && (
                  <li className="row">
                    <span className="muted">{tx("task_detail.topshirilgan", undefined, "Topshirilgan")}</span><span className="spacer" />
                    <span>{fmtDateTime(task.submitted_at)}</span>
                  </li>
                )}
                {task.completed_at && (
                  <li className="row">
                    <span className="muted">{tx("task_detail.yakunlangan", undefined, "Yakunlangan")}</span><span className="spacer" />
                    <span>{fmtDateTime(task.completed_at)}</span>
                  </li>
                )}
                {task.updated_at && (
                  <li className="row">
                    <span className="muted">{tx("task_detail.oxirgi_ozgarish", undefined, "Oxirgi o'zgarish")}</span><span className="spacer" />
                    <span>{fmtDateTime(task.updated_at)}</span>
                  </li>
                )}
                {task.branch_name && (
                  <li className="row">
                    <span className="muted">{tx("task_detail.git_filiali", undefined, "Git filiali")}</span><span className="spacer" />
                    <code style={{ fontSize: 12 }}>{task.branch_name}</code>
                  </li>
                )}
                {task.pr_url && (
                  <li className="row">
                    <span className="muted">{tx("task_detail.pr_havolasi", undefined, "Pull Request")}</span><span className="spacer" />
                    <a href={task.pr_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>PR havolasi ↗</a>
                  </li>
                )}
                {task.labels && task.labels.length > 0 && (
                  <li className="row" style={{ alignItems: "flex-start" }}>
                    <span className="muted">{tx("task_detail.yorliqlar", undefined, "Yorliqlar")}</span><span className="spacer" />
                    <div className="row wrap" style={{ gap: 4, justifyContent: "flex-end" }}>
                      {task.labels.map((l) => (
                        <span key={l.id} className="badge" style={{ backgroundColor: l.color ? `${l.color}22` : undefined, color: l.color || undefined, borderColor: l.color || undefined }}>
                          {l.name}
                        </span>
                      ))}
                    </div>
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
                title={tx("task_detail.boshqa_odamga_otkazish", undefined, "Boshqa odamga o'tkazish")}
                statusText={tx("task_detail.ijrochini_almashtirish", undefined, "Ijrochini almashtirish")}
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
                    <label htmlFor={`${fid}-5`}>{tx("task_detail.kimga", undefined, "Kimga")}</label>
                    <select id={`${fid}-5`} value={handTo} required
                            onChange={(e) => setHandTo(e.target.value)}>
                      <option value="">{tx("task_detail.jamoadan_tanlang", undefined, "Jamoadan tanlang")}</option>
                      {members.map((m) => {
                        const now = task.assignees.some((a) => a.id === m.user.id);
                        return (
                          <option key={m.id} value={m.user.id}>
                            {m.user.full_name} — {m.role_display}
                            {now ? tx("task_detail.hozirgi_ijrochi", undefined, " (hozirgi)") : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`${fid}-6`}>{tx("task_detail.sabab_ixtiyoriy", undefined, "Sabab (ixtiyoriy)")}</label>
                    <input id={`${fid}-6`} value={handNote} placeholder={tx("task_detail.masalan_tatilga_chiqdi", undefined, "Masalan: ta'tilga chiqdi...")}
                           onChange={(e) => setHandNote(e.target.value)} />
                  </div>
                  <button className="btn btn-primary btn-block" disabled={busy || !handTo}>
                    {tx("task_detail.otkazish", undefined, "O'tkazish")}
                  </button>
                  <small className="muted">
                    {tx("task_detail.ish_bitta_odamga_otadi_oldingi", undefined, "Ish bitta odamga o'tadi, oldingisi xabar oladi.")}
                  </small>
                </form>
              </AccordionSection>
            )}


            {!!task.mismatched_assignees?.length && acc.can_manage && (
              <AccordionSection
                id="section-mismatch"
                icon="⚠️"
                title={tx("task_detail.diqqat", undefined, "Diqqat")}
                statusText={tx("task_detail.nomutanosiblik", undefined, "Nomutanosiblik")}
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
                statusText={tx("task_detail.ta_sharh", { count: task.reviews.length })}
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
                    <DateTimeField id="st-due" value={stDueDate} min={new Date().toISOString().split("T")[0] + "T00:00"} onChange={setStDueDate} />
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
                  {busy ? tx("common.saqlanmoqda") : tx("common.saqlash")}
                </button>
              ) : (
                <button
                  type="submit"
                  form="subtask-link-form"
                  className="btn btn-sm btn-primary"
                  disabled={busy || !selectedSubtaskId}
                >
                  {busy ? tx("task_detail.biriktirilmoqda") : tx("task_detail.biriktirish")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {teamModalOpen && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(8, 11, 16, 0.72)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            padding: "20px 16px",
          }}
          onClick={() => setTeamModalOpen(false)}
        >
          <div
            className="modal-window card"
            style={{
              width: "min(560px, 96vw)",
              borderRadius: 12,
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              overflow: "hidden",
              background: "var(--card-bg, #ffffff)",
              border: "1px solid var(--border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 20px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16 }}>
                {editingAssignment
                  ? tx("task_detail.jamoa_azosi_tahrirlash", undefined, "Jamoa a'zosi ma'lumotlarini tahrirlash")
                  : tx("task_detail.jamoa_azosi_qoshish", undefined, "Jamoa a'zosi qo'shish")}
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setTeamModalOpen(false)}
                style={{ fontSize: 18, lineHeight: 1, padding: "2px 6px" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTeamMember} style={{ padding: "16px 20px" }}>
              <div className="field mb">
                <label htmlFor={`${fid}-team-user`}>
                  {tx("task_detail.kimga", undefined, "Dasturchi / A'zo")} <span className="text-danger">*</span>
                </label>
                <select
                  id={`${fid}-team-user`}
                  value={teamMemberId}
                  required
                  disabled={Boolean(editingAssignment)}
                  onChange={(e) => setTeamMemberId(e.target.value)}
                >
                  <option value="">{tx("task_detail.jamoadan_tanlang", undefined, "Jamoadan tanlang")}</option>
                  {members.map((m) => {
                    const alreadyIn = task.assignments?.some((a) => a.user.id === m.user.id && a.id !== editingAssignment?.id);
                    return (
                      <option key={m.id} value={m.user.id} disabled={alreadyIn}>
                        {m.user.full_name} ({m.user.job_title || m.role_display})
                        {alreadyIn ? " — (allaqachon biriktirilgan)" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="field mb">
                <label htmlFor={`${fid}-team-role`}>
                  {tx("task_detail.jamoa_roli", undefined, "Jamoada roli / vazifasi")}
                </label>
                <input
                  id={`${fid}-team-role`}
                  value={teamRole}
                  placeholder={tx("task_detail.jamoa_roli_placeholder", undefined, "Masalan: Frontend, Backend API, Sinov/QA...")}
                  onChange={(e) => setTeamRole(e.target.value)}
                />
              </div>

              <div className="row" style={{ gap: 12, marginBottom: 12 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>{tx("task_detail.boshlanish_vaqti", undefined, "Boshlanish sanasi va vaqti")}</label>
                  <DateTimeField value={teamStartDate} onChange={setTeamStartDate} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>{tx("task_detail.tugash_vaqti", undefined, "Tugash muddati (sana va vaqt)")}</label>
                  <DateTimeField value={teamDueDate} min={teamStartDate || (new Date().toISOString().split("T")[0] + "T00:00")} onChange={setTeamDueDate} />
                </div>
              </div>

              <div className="field mb">
                <label htmlFor={`${fid}-team-hours`}>
                  {tx("task_detail.rejalashtirilgan_soat", undefined, "Rejalashtirilgan soat")}
                </label>
                <input
                  id={`${fid}-team-hours`}
                  type="number"
                  step="0.5"
                  min="0"
                  value={teamAllocatedHours}
                  placeholder="Masalan: 12"
                  onChange={(e) => setTeamAllocatedHours(e.target.value)}
                />
              </div>

              <div className="field mb">
                <label htmlFor={`${fid}-team-note`}>
                  {tx("task_detail.eslatma_izoh", undefined, "Eslatma / Izoh")}
                </label>
                <input
                  id={`${fid}-team-note`}
                  value={teamNote}
                  placeholder={tx("task_detail.eslatma_placeholder", undefined, "Masalan: Avtorizatsiya qismini bajaradi...")}
                  onChange={(e) => setTeamNote(e.target.value)}
                />
              </div>

              <div className="form-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setTeamModalOpen(false)}
                >
                  {tx("common.bekor_qilish", undefined, "Bekor qilish")}
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary"
                  disabled={busy || !teamMemberId}
                >
                  {busy ? tx("common.saqlanmoqda", undefined, "Saqlanmoqda...") : tx("task_detail.jamoa_saqlash", undefined, "Saqlash")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </>
  );

  if (isModal) {
    return createPortal(
      <div
        className="modal-overlay"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px 16px",
          background: "rgba(8, 11, 16, 0.72)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          overflow: "hidden",
        }}
        onClick={onClose}
      >
        <div
          className="modal-window card"
          style={{
            width: "min(1420px, 96vw)",
            height: "92vh",
            display: "flex",
            flexDirection: "column",
            borderRadius: 12,
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
            overflow: "hidden",
            background: "var(--bg, #f8fafc)",
            border: "1px solid var(--border)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 20px",
              borderBottom: "1px solid var(--border)",
              background: "var(--card-bg, #ffffff)",
              flexShrink: 0,
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <Link className="muted" {...toProject(task.project)} onClick={onClose}>{task.project_name}</Link>
              <span className="muted">/</span>
              <strong style={{ fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {task.title}
              </strong>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {taskActions}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onClose}
                style={{ fontSize: 18, lineHeight: 1, padding: "4px 8px" }}
                title={tx("common.yopish")}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Modal Scrollable Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
            {bodyContent}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <>
      <PageHead
        title={
          <>
            <Link className="muted" {...toProject(task.project)}>{task.project_name}</Link>
            <span className="muted"> / </span>
            <strong>{task.title}</strong>
          </>
        }
        actions={taskActions}
      />

      <div className="content">
        {bodyContent}
      </div>
    </>
  );
}
