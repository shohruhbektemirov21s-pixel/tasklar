/**
 * TeamFlow — Buyurtma tafsilotlari (Order Detail) sahifasi.
 *
 * Minimal, ixcham va sodda UX:
 * 1. Yuqori qism:
 *    - ← Buyurtmalarga qaytish
 *    - Buyurtma raqami: ORD-2026-002 (v1)
 *    - Status badge: “Bajarildi”
 *    - O‘ng tomonda: “Tahrirlash” va “...” amallar
 * 2. Asosiy ma’lumotlar kartasi:
 *    - Buyurtma nomi
 *    - Loyiha: TeamFlow (havola va rangli badge bilan)
 *    - Mijoz / Buyurtmachi: Karimov A. (bo'linma bilan)
 *    - Muddat: 12.06.2026
 *    - Yaratilgan sana
 *    - Mas’ul shaxs (PM)
 * 3. “Tavsif” kichik blok:
 *    - Buyurtma haqida qisqa matn, 2-3 qator, "Batafsil ko'rish" bilan ochiladi
 * 4. Pastki qism:
 *    - Buyurtma holati va ijrosi (Mas'ul xodim, PM muddati, oxirgi yangilanish)
 *    - Biriktirilgan TZ fayli va rasmiy Word blanki
 */
import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

const ProjectFormModal = lazy(() => import("@/pages/ProjectForm"));
const DistributeTasksModal = lazy(() => import("@/components/DistributeTasksModal"));
const TaskDetailModal = lazy(() => import("@/pages/TaskDetail"));
import { lockScroll, unlockScroll } from "@/components/scrollLock";
import { ApiError, api, listOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import {
  claimOrder,
  clientApprove,
  clientReject,
  deleteOrder,
  getOrder,
  sendOrder,
  setPmDecision,
  submitCompletion,
  uploadVersion,
  approveVersion,
  rejectVersion,
  createOrderTask,
  unclaimOrder,
  reassignPm,
} from "@/api/orders";
import type { ChangeRequestItem, Task, UserBrief } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { tx } from "@/i18n";
import { confirmDialog } from "@/components/Confirm";
import { PageHead } from "@/components/Layout";
import FilePreviewModal, { PreviewFile } from "@/components/FilePreviewModal";
import { useDebouncedLive } from "@/realtime/RealtimeContext";
import { Avatar, Card, Empty, ErrorMsg, Loading, OkMsg, fmtDate, fmtDateTime, timeAgo } from "@/components/ui";
import { DateField } from "@/components/dates";
import { toEditOrder, toOrders, toProject, useEntityNum, useGo } from "@/nav";
import { OrderStatusBadge } from "./ChangeRequests";
import { Button, buttonClass } from "@/components/Button";

const UserOutlineIcon = ({ size = 15, color = "var(--muted)" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const CalendarOutlineIcon = ({ size = 15, color = "var(--muted)" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const ClockOutlineIcon = ({ size = 15, color = "var(--muted)" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
const TimerOutlineIcon = ({ size = 15, color = "var(--muted)" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="14" r="8" />
    <line x1="12" y1="2" x2="12" y2="6" />
    <line x1="12" y1="14" x2="15" y2="11" />
  </svg>
);
const HourglassOutlineIcon = ({ size = 15, color = "var(--muted)" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
  </svg>
);
const PaperclipOutlineIcon = ({ size = 16, color = "var(--accent)" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l7.88-7.88" />
  </svg>
);
const FolderFilledIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--attention)" stroke="var(--attention)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
  </svg>
);
const DocLilacIcon = ({ size = 20, color = "var(--done)" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);
const ChevronDownOutlineIcon = ({ size = 16, color = "var(--muted)" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export interface OrderDetailProps {
  orderId?: number | string;
  onClose?: () => void;
}

export default function OrderDetail({ orderId: propOrderId, onClose }: OrderDetailProps = {}) {
  const { user, meta } = useAuth();
  const routeOrderId = useEntityNum("order");
  const id = propOrderId ? Number(propOrderId) : routeOrderId;
  const isModal = Boolean(onClose);
  const go = useGo();

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
  const [item, setItem] = useState<ChangeRequestItem | null>(null);
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectFile, setRejectFile] = useState<File | null>(null);
  const [rejectIsNewTz, setRejectIsNewTz] = useState(false);
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [completionModalOpen, setCompletionModalOpen] = useState(false);
  const [completionFile, setCompletionFile] = useState<File | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [completionSubmitting, setCompletionSubmitting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [distributeTasksModalOpen, setDistributeTasksModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);
  const [projectTasksLoading, setProjectTasksLoading] = useState(false);

  const loadProjectTasks = useCallback(async () => {
    const pId = item?.project || item?.project_detail?.id;
    if (!pId) {
      setProjectTasks([]);
      return;
    }
    setProjectTasksLoading(true);
    try {
      const res = await api.get<Task[] | { results: Task[] }>(`/tasks/`, {
        project: pId,
        page_size: 100,
      });
      setProjectTasks(listOf<Task>(res));
    } catch {
      setProjectTasks([]);
    } finally {
      setProjectTasksLoading(false);
    }
  }, [item?.project, item?.project_detail?.id]);

  useEffect(() => {
    void loadProjectTasks();
  }, [loadProjectTasks]);
  const [pmPanelOpen, setPmPanelOpen] = useState(false);
  const [pmStatus, setPmStatus] = useState<ChangeRequestItem["status"]>("ACCEPTED");
  const [pmStartDate, setPmStartDate] = useState("");
  const [pmAssignedPm, setPmAssignedPm] = useState<number | "">(item?.assigned_pm || "");
  const [pmDeadline, setPmDeadline] = useState("");
  const [pmNotes, setPmNotes] = useState("");
  const [pmSaving, setPmSaving] = useState(false);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  // Oyna QAYSI tugmadan ochilgan bo'lsa, o'sha amal uchun: «Qabul qilish» -
  // muddat va izoh, «Orqaga qaytarish» - faqat sabab. Ilgari ikkala tugma
  // bitta oynani ochardi va unda ikkala amal yonma-yon turardi.
  const [claimMode, setClaimMode] = useState<"accept" | "reject">("accept");
  const [claimStartDateInput, setClaimStartDateInput] = useState("");
  const [claimAssignedPmInput, setClaimAssignedPmInput] = useState<number | "">("");
  const [claimDeadlineInput, setClaimDeadlineInput] = useState("");
  const [claimNotesInput, setClaimNotesInput] = useState("");
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const { data: usersData } = useFetch<{ count: number; results: UserBrief[] } | UserBrief[]>("/users/", { is_active: true, page_size: 200 });
  const usersList: UserBrief[] = useMemo(() => (usersData ? listOf<UserBrief>(usersData) : []), [usersData]);
  const developersList = useMemo(
    () => usersList.filter((u) => !u.is_sohaviy_boshqarma && u.specialty !== "SOHAVIY" && u.global_role !== "ADMIN" && u.global_role !== "BOSS" && !u.is_platform_admin && !u.is_boss),
    [usersList]
  );
  const pmList = useMemo(
    () =>
      usersList.filter((u) => {
        if (u.is_sohaviy_boshqarma || u.specialty === "SOHAVIY" || u.global_role === "SOHAVIY") return false;
        if (u.global_role === "MANAGER" || u.is_manager || u.specialty === "PM") return true;
        if (u.global_role === "BOSS" || u.is_boss || u.global_role === "ADMIN" || u.is_platform_admin) return true;
        return false;
      }),
    [usersList]
  );
  const [versionModal, setVersionModal] = useState(false);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionNote, setVersionNote] = useState("");
  const [versionSubmitting, setVersionSubmitting] = useState(false);
  const [approveVersionModal, setApproveVersionModal] = useState(false);
  const [approveVersionTarget, setApproveVersionTarget] = useState<number | null>(null);
  const [approveDeadline, setApproveDeadline] = useState("");
  const [approveDeveloper, setApproveDeveloper] = useState<number | null>(null);
  const [approveNote, setApproveNote] = useState("");
  const [approveSubmitting, setApproveSubmitting] = useState(false);
  const [rejectVersionModal, setRejectVersionModal] = useState(false);
  const [rejectVersionTarget, setRejectVersionTarget] = useState<number | null>(null);
  const [rejectVersionReason, setRejectVersionReason] = useState("");
  const [rejectVersionSubmitting, setRejectVersionSubmitting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(true);
  const totalFilesCount = useMemo(() => {
    if (!item) return 0;
    if (typeof item.files_count === "number") return item.files_count;
    const atts = item.attachments || [];
    const attNames = new Set(atts.map((a) => a.original_name));
    let count = atts.length;
    if (item.tz_file_url && (!item.tz_file_name || !attNames.has(item.tz_file_name))) {
      count += 1;
    }
    if (item.completion_file_url) count += 1;
    return count;
  }, [item]);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskAssignee, setTaskAssignee] = useState<number | null>(null);
  const [taskPriority, setTaskPriority] = useState<number>(2);
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskType, setTaskType] = useState("FEATURE");
  const [taskSubmitting, setTaskSubmitting] = useState(false);

  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferSearch, setTransferSearch] = useState("");
  const [selectedPmId, setSelectedPmId] = useState<number | null>(null);
  const [transferNotes, setTransferNotes] = useState("");
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);


  const filteredPms = useMemo(() => {
    const q = transferSearch.trim().toLowerCase();
    return pmList.filter((u) => {
      if (u.id === item?.assigned_pm) return false;
      if (!q) return true;
      return (
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
      );
    });
  }, [pmList, transferSearch, item?.assigned_pm]);

  async function handleTransferPm(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!item || !selectedPmId) return;
    setTransferSubmitting(true);
    setTransferError(null);
    try {
      const updated = await reassignPm(item.id, {
        assigned_pm: selectedPmId,
        notes: transferNotes.trim() || undefined,
      });
      setItem(updated);
      setTransferModalOpen(false);
      setSelectedPmId(null);
      setTransferNotes("");
      setTransferSearch("");
      setActionOk(tx("orders.buyurtma_topshirildi", undefined, "Buyurtma yangi PM ga muvaffaqiyatli topshirildi."));
    } catch (err: unknown) {
      setTransferError((err as { message?: string })?.message || "Buyurtmani topshirishda xatolik yuz berdi.");
    } finally {
      setTransferSubmitting(false);
    }
  }
  const olderVersions = useMemo(() => {
    if (!item?.versions) return [];
    return item.versions
      .filter((v) => v.version !== item.version && v.status !== "NEW")
      .sort((a, b) => b.version - a.version);
  }, [item?.versions, item?.version]);
  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await getOrder(id);
      setItem(data);
      setPmStatus(data.status);
      setPmDeadline(data.pm_deadline || "");
      setPmNotes(data.pm_notes || "");
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("orders.buyurtma_yuklab_bolmadi"));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  useDebouncedLive((e) => {
    if (
      e.event === "notification" ||
      e.event === "order.update" ||
      e.event === "order.create"
    ) {
      void load();
    }
  }, 800);
  const isPMOrAdmin = Boolean(
    user?.is_platform_admin ||
      user?.is_boss ||
      user?.is_manager ||
      user?.global_role === "MANAGER" ||
      user?.specialty === "PM"
  );
  const isSohaviyOrAdmin = Boolean(
    user?.is_sohaviy_boshqarma ||
      user?.is_platform_admin ||
      user?.is_boss
  );
  const canClientReview = Boolean(
    isSohaviyOrAdmin || (item && user && item.created_by === user.id)
  );
  const canSubmitCompletion = Boolean(
    isPMOrAdmin &&
      (user?.is_platform_admin || user?.is_boss || item?.assigned_pm === user?.id) &&
      item &&
      item.status !== "COMPLETED" &&
      item.status !== "READY_FOR_REVIEW" &&
      item.status !== "REJECTED" &&
      item.status !== "DRAFT"
  );
  const hasProject = Boolean(item?.project || item?.project_detail?.id);
  const canDistribute = Boolean(
    isPMOrAdmin &&
      (user?.is_platform_admin || user?.is_boss || item?.assigned_pm === user?.id) &&
      item &&
      item.status !== "COMPLETED" &&
      item.status !== "READY_FOR_REVIEW" &&
      item.status !== "REJECTED" &&
      item.status !== "CANCELLED" &&
      item.status !== "DRAFT"
  );
  const isSohaviyUser = Boolean(
    user?.is_sohaviy_boshqarma ||
    user?.specialty === "SOHAVIY" ||
    user?.global_role === "SOHAVIY"
  );
  const canEdit = Boolean(
    item &&
      item.status === "DRAFT" &&
      (user?.is_platform_admin ||
        user?.is_boss ||
        isSohaviyUser ||
        item.can_edit ||
        !item.created_by ||
        item.created_by === user?.id)
  );
  const canDelete = Boolean(
    item &&
      item.status === "DRAFT" &&
      (user?.is_platform_admin ||
        user?.is_boss ||
        isSohaviyUser ||
        item.can_delete ||
        !item.created_by ||
        item.created_by === user?.id)
  );
  const [sendingOrder, setSendingOrder] = useState(false);
  async function handleSendDraftOrder() {
    if (!item) return;
    const ok = await confirmDialog({
      title: tx("orders.send_order_confirm_title"),
      body: tx("orders.send_order_confirm_desc"),
      confirmText: tx("orders.send_order"),
      danger: false,
    });
    if (!ok) return;
    try {
      setSendingOrder(true);
      setActionError(null);
      const updated = await sendOrder(item.id);
      setItem(updated);
    } catch (err: unknown) {
      setActionError((err as { message?: string })?.message || tx("orders.yuborishda_xatolik"));
    } finally {
      setSendingOrder(false);
    }
  }
  async function handleDelete() {
    if (!item) return;
    const ok = await confirmDialog({
      title: `«${item.system_name}» buyurtmasi o'chirilsinmi?`,
      body: tx("orders.amalni_ortga_qaytarib_bolmaydi"),
      confirmText: tx("common.ochirish"),
      danger: true,
    });
    if (!ok) return;
    try {
      setActionError(null);
      await deleteOrder(item.id);
      go(toOrders());
    } catch (err: unknown) {
      setActionError((err as { message?: string })?.message || tx("orders.ochirishda_xatolik"));
    }
  }
  function handleOpenClaim(mode: "accept" | "reject") {
    if (!item) return;
    setClaimMode(mode);
    setActionError(null);
    setClaimStartDateInput(item.pm_start_date || "");
    setClaimAssignedPmInput(item.assigned_pm || "");
    setClaimDeadlineInput(item.pm_deadline || item.due_date || "");
    setClaimNotesInput("");
    setClaimModalOpen(true);
  }
  async function handleClaimSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    const today = new Date().toLocaleDateString("en-CA");
    if (claimStartDateInput && claimStartDateInput < today) {
      setActionError("Boshlanish sanasi bugungi kundan oldin bo'lishi mumkin emas.");
      return;
    }
    if (claimDeadlineInput && claimDeadlineInput < today) {
      setActionError("Topshirish sanasi bugungi kundan oldin bo'lishi mumkin emas.");
      return;
    }
    if (claimStartDateInput && claimDeadlineInput && claimDeadlineInput < claimStartDateInput) {
      setActionError("Topshirish muddati boshlanish sanasidan oldin bo'lishi mumkin emas.");
      return;
    }
    setClaimSubmitting(true);
    setActionError(null);
    try {
      const updated = await claimOrder(item.id, {
        pm_start_date: claimStartDateInput || undefined,
        assigned_pm: claimAssignedPmInput || undefined,
        pm_deadline: claimDeadlineInput || undefined,
        pm_notes: claimNotesInput.trim() || undefined,
      });
      setItem(updated);
      setPmStatus(updated.status);
      setPmDeadline(updated.pm_deadline || "");
      setPmNotes(updated.pm_notes || "");
      setClaimModalOpen(false);
      setActionOk(tx("orders.buyurtma_qabul_qilindi"));
    } catch (err: unknown) {
      setActionError((err as { message?: string })?.message || tx("orders.qabul_qilishda_xatolik"));
    } finally {
      setClaimSubmitting(false);
    }
  }
  async function handleClaimReject() {
    if (!item) return;
    const reason = claimNotesInput.trim();
    if (!reason) {
      setActionError(tx("orders.return_reason_required"));
      return;
    }
    setClaimSubmitting(true);
    setActionError(null);
    try {
      const updated = await setPmDecision(item.id, {
        status: "REJECTED",
        pm_notes: reason,
      });
      setItem(updated);
      setClaimModalOpen(false);
      setActionOk("Buyurtma orqaga qaytarildi (rad etildi).");
    } catch (err: unknown) {
      setActionError((err as { message?: string })?.message || "Buyurtmani orqaga qaytarishda xatolik yuz berdi.");
    } finally {
      setClaimSubmitting(false);
    }
  }
  async function handleUnclaim() {
    if (!item) return;
    const ok = await confirmDialog({
      title: "Buyurtmani orqaga qaytarish",
      body: "Ushbu buyurtmani o'z zimmangizdan yechib, yangi buyurtmalar qatoriga qaytarmoqchimisiz?",
      confirmText: "Ha, qaytarish",
    });
    if (!ok) return;
    setActionError(null);
    try {
      const updated = await unclaimOrder(item.id);
      setItem(updated);
      setActionOk("Buyurtma orqaga qaytarildi (yangi holatiga o'tkazildi).");
    } catch (err: unknown) {
      setActionError((err as { message?: string })?.message || "Buyurtmani qaytarishda xatolik yuz berdi.");
    }
  }
  async function handleSavePM(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    const today = new Date().toLocaleDateString("en-CA");
    if (pmStartDate && pmStartDate < today) {
      setActionError("Boshlanish sanasi bugungi kundan oldin bo'lishi mumkin emas.");
      return;
    }
    if (pmDeadline && pmDeadline < today) {
      setActionError("Topshirish sanasi bugungi kundan oldin bo'lishi mumkin emas.");
      return;
    }
    if (pmStartDate && pmDeadline && pmDeadline < pmStartDate) {
      setActionError("Topshirish muddati boshlanish sanasidan oldin bo'lishi mumkin emas.");
      return;
    }
    setPmSaving(true);
    setActionError(null);
    try {
      const updated = await setPmDecision(item.id, {
        status: pmStatus,
        pm_start_date: pmStartDate || undefined,
        assigned_pm: pmAssignedPm || undefined,
        pm_deadline: pmDeadline || undefined,
        pm_notes: pmNotes.trim() || undefined,
      });
      setItem(updated);
      setPmPanelOpen(false);
      setActionOk(tx("orders.pm_qarori_saqlandi"));
    } catch (err: unknown) {
      setActionError((err as { message?: string })?.message || tx("orders.qarorni_saqlashda_xatolik"));
    } finally {
      setPmSaving(false);
    }
  }
  async function handleClientApprove() {
    if (!item) return;
    const ok = await confirmDialog({
      title: tx("orders.buyurtma_qabul_qilinsinmi", { request_no: `#${item.id}` }),
      body: tx("orders.ish_yakunlanadi_va_yopiladi"),
      confirmText: tx("common.tasdiqlash"),
    });
    if (!ok) return;
    setActionError(null);
    try {
      const updated = await clientApprove(item.id);
      setItem(updated);
      setActionOk(tx("orders.tasdiqlandi_va_yakunlandi"));
    } catch (err: unknown) {
      setActionError((err as { message?: string })?.message || tx("orders.tasdiqlashda_xatolik"));
    }
  }
  function handleOpenReject() {
    setRejectReason("");
    setRejectFile(null);
    setRejectIsNewTz(false);
    setRejectModalOpen(true);
  }
  async function handleRejectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    if (!rejectReason.trim() && !rejectFile) {
      setActionError(tx("orders.kamchilik_izohini_yozing"));
      return;
    }
    setRejectSubmitting(true);
    setActionError(null);
    try {
      const updated = await clientReject(item.id, {
        feedback_note: rejectReason.trim(),
        file: rejectFile,
        is_new_tz: rejectIsNewTz,
      });
      setItem(updated);
      setRejectModalOpen(false);
      setRejectReason("");
      setRejectFile(null);
      setRejectIsNewTz(false);
      setActionOk(tx("orders.qayta_ishlash_uchun_qaytarildi"));
    } catch (err: unknown) {
      setActionError((err as { message?: string })?.message || tx("orders.qaytarishda_xatolik"));
    } finally {
      setRejectSubmitting(false);
    }
  }
  function handleOpenSubmitCompletion() {
    setCompletionFile(null);
    setCompletionNote("");
    setCompletionError(null);
    setCompletionModalOpen(true);
  }
  async function handleSubmitCompletion(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    if (!completionFile && !completionNote.trim()) {
      setCompletionError(tx("orders.tugatilgan_ish_hujjati"));
      return;
    }
    setCompletionSubmitting(true);
    setCompletionError(null);
    try {
      const fd = new FormData();
      if (completionFile) {
        fd.append("completion_file", completionFile);
      }
      if (completionNote.trim()) {
        fd.append("completion_note", completionNote.trim());
      }
      const updated = await submitCompletion(item.id, fd);
      setItem(updated);
      setCompletionModalOpen(false);
      setCompletionFile(null);
      setCompletionNote("");
      setActionOk(tx("orders.ish_topshirildi"));
    } catch (err: unknown) {
      setCompletionError((err as { message?: string })?.message || tx("orders.hisobot_topshirishda_xatolik"));
    } finally {
      setCompletionSubmitting(false);
    }
  }
  async function handleUploadVersionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item || !versionFile || !versionNote.trim()) return;
    if (item.status === "READY_FOR_REVIEW") {
      setActionError(
        tx(
          "orders.pm_yakunlagan_yangi_tz_mumkin_emas",
          undefined,
          "Loyiha menejeri ishni yakunlab topshirgan (boshqarma tasdig'ida). Yangi TZ yuborishdan oldin ishni qabul qiling yoki kamchilik bilan qaytaring."
        )
      );
      setVersionModal(false);
      return;
    }
    setVersionSubmitting(true);
    setActionError(null);
    try {
      const fd = new FormData();
      fd.append("tz_file", versionFile);
      fd.append("change_note", versionNote.trim());
      const updated = await uploadVersion(item.id, fd);
      setItem(updated);
      setVersionModal(false);
      setVersionFile(null);
      setVersionNote("");
      setActionOk("Yangi versiya muvaffaqiyatli yuklandi!");
    } catch (err: unknown) {
      setActionError((err as { message?: string })?.message || tx("orders.yuklashda_xatolik"));
    } finally {
      setVersionSubmitting(false);
    }
  }
  function handleOpenUploadVersion() {
    if (item?.status === "READY_FOR_REVIEW") {
      setActionError(
        tx(
          "orders.pm_yakunlagan_yangi_tz_mumkin_emas",
          undefined,
          "Loyiha menejeri ishni yakunlab topshirgan (boshqarma tasdig'ida). Yangi TZ yuborishdan oldin ishni qabul qiling yoki kamchilik bilan qaytaring."
        )
      );
      return;
    }
    if (item?.status === "NEW") {
      setActionError(
        tx("orders.tz_birinchisi_tasdiqlanmaguncha_yuklash_mumkin_emas") ||
        "Buyurtmaning 1-chi TZsi tasdiqlanmaguncha 2-chi TZ yuborib bo'lmaydi. Avval 1-TZ ko'rib chiqilishi kerak."
      );
      return;
    }
    if (item?.pending_version) {
      setActionError(
        tx("orders.yangi_tz_tasdiqlanmaguncha") ||
        "Avvalgi yuborilgan TZ versiyasi hali tasdiqlanmagan. 1-tasi tasdiqlanmaguncha ikkinchisi yuborilmaydi."
      );
      return;
    }
    setVersionModal(true);
  }
  function handleOpenApproveVersion(verNum?: number) {
    const targetVer = verNum || item?.pending_version?.version || null;
    const v1 = item?.versions?.find((v) => v.version === 1);
    const isV1Accepted = v1
      ? (v1.status !== "NEW" && v1.status !== "REJECTED")
      : (item?.status !== "NEW" && item?.status !== "DRAFT" && item?.status !== "REJECTED");
    if (targetVer && targetVer > 1 && !isV1Accepted) {
      setActionError(
        tx("orders.tz_birinchisi_tasdiqlanmaguncha_ikkinchisi_mumkin_emas") ||
        "Buyurtmaning 1-chi TZsi tasdiqlanmaguncha 2-chi TZ tasdiqlanmaydi. Avval 1-versiyani tasdiqlang."
      );
      return;
    }
    setApproveVersionTarget(targetVer);
    setApproveDeadline(item?.pm_deadline || item?.due_date || "");
    setApproveDeveloper(item?.assigned_developer || null);
    setApproveNote("");
    setApproveVersionModal(true);
  }
  async function handleApproveVersionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    setApproveSubmitting(true);
    setActionError(null);
    try {
      const updated = await approveVersion(item.id, {
        version: approveVersionTarget || undefined,
        decision_note: approveNote.trim() || undefined,
        pm_deadline: approveDeadline || undefined,
        assigned_developer: approveDeveloper,
      });
      setItem(updated);
      setApproveVersionModal(false);
      setActionOk(tx("orders.version_approved_success"));
    } catch (err: unknown) {
      setActionError((err as { message?: string })?.message || tx("orders.versiyani_tasdiqlashda_xatolik"));
    } finally {
      setApproveSubmitting(false);
    }
  }
  function handleOpenRejectVersion(verNum?: number) {
    setRejectVersionTarget(verNum || item?.pending_version?.version || null);
    setRejectVersionReason("");
    setRejectVersionModal(true);
  }
  async function handleRejectVersionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item || !rejectVersionReason.trim()) return;
    setRejectVersionSubmitting(true);
    setActionError(null);
    try {
      const updated = await rejectVersion(item.id, {
        version: rejectVersionTarget || undefined,
        decision_note: rejectVersionReason.trim(),
      });
      setItem(updated);
      setRejectVersionModal(false);
      setActionOk("Yangi TZ versiyasi rad etildi (avvalgi TZ amalda qoladi).");
    } catch (err: unknown) {
      setActionError((err as { message?: string })?.message || tx("orders.versiyani_rad_etishda_xatolik"));
    } finally {
      setRejectVersionSubmitting(false);
    }
  }
  function _handleOpenCreateTask() {
    setTaskTitle(item?.requested_change ? `Topshiriq: ${item.system_name} - ${item.module || 'TZ ijrosi'}` : "");
    setTaskDescription(item?.requested_change || "");
    setTaskAssignee(item?.assigned_developer || null);
    setTaskPriority(item?.priority === "URGENT" ? 4 : item?.priority === "HIGH" ? 3 : 2);
    setTaskDueDate(item?.pm_deadline || item?.due_date || "");
    setTaskType("FEATURE");
    setTaskModalOpen(true);
  }
  async function handleCreateTaskSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item || !taskTitle.trim()) return;
    setTaskSubmitting(true);
    setActionError(null);
    try {
      const updated = await createOrderTask(item.id, {
        title: taskTitle.trim(),
        description: taskDescription.trim() || undefined,
        priority: taskPriority,
        task_type: taskType,
        due_date: taskDueDate || undefined,
        assignee_id: taskAssignee || undefined,
      });
      setItem(updated);
      setTaskModalOpen(false);
      setTaskTitle("");
      setTaskDescription("");
      setActionOk(tx("orders.vazifa_yaratildi"));
    } catch (err: unknown) {
      setActionError((err as { message?: string })?.message || tx("orders.vazifa_yaratishda_xatolik"));
    } finally {
      setTaskSubmitting(false);
    }
  }
  if (!id) {
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
            background: "var(--overlay)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={onClose}
        >
          <div
            className="modal-window card"
            style={{ width: "min(500px, 90vw)", padding: 30, textAlign: "center", borderRadius: 12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Empty
              icon="📄"
              title={tx("orders.buyurtma_tanlanmagan")}
              text={tx("orders.biror_buyurtmani_tanlang")}
            />
            <Button  style={{ marginTop: 16 }} onClick={onClose}>
              {tx("common.yopish")}
            </Button>
          </div>
        </div>,
        document.body
      );
    }
    return (
      <>
        <PageHead title={<strong>{tx("orders.sarlavha")}</strong>} />
        <div className="content" style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px" }}>
          <Card padded>
            <Empty
              icon="📄"
              title={tx("orders.buyurtma_tanlanmagan")}
              text={tx("orders.biror_buyurtmani_tanlang")}
            >
              <Button variant="primary" onClick={() => go(toOrders())}>
                Buyurtmalar ro'yxatiga qaytish
              </Button>
            </Empty>
          </Card>
        </div>
      </>
    );
  }
  if (loading && !item) {
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
            background: "var(--overlay)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={onClose}
        >
          <div
            className="modal-window card"
            style={{ width: "min(400px, 90vw)", padding: "36px 20px", textAlign: "center", borderRadius: 12, background: "var(--surface)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <Loading text="Buyurtma ma'lumotlari yuklanmoqda..." />
          </div>
        </div>,
        document.body
      );
    }
    return (
      <>
        <PageHead title={<strong>{tx("orders.sarlavha")}</strong>} />
        <div className="content" style={{ padding: "40px 16px", textAlign: "center" }}>
          <Loading text="Buyurtma ma'lumotlari yuklanmoqda..." />
        </div>
      </>
    );
  }
  if (error || !item) {
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
            background: "var(--overlay)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={onClose}
        >
          <div
            className="modal-window card"
            style={{ width: "min(500px, 90vw)", padding: 30, textAlign: "center", borderRadius: 12, background: "var(--surface)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <ErrorMsg error={error || "Buyurtma topilmadi"} />
            <Button  style={{ marginTop: 16 }} onClick={onClose}>
              {tx("common.yopish")}
            </Button>
          </div>
        </div>,
        document.body
      );
    }
    return (
      <>
        <PageHead title={<strong>{tx("orders.sarlavha")}</strong>} />
        <div className="content" style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px" }}>
          <ErrorMsg error={error || "Buyurtma topilmadi"} />
          <Button  style={{ marginTop: 12 }} onClick={() => go(toOrders())}>
            ← Buyurtmalar ro'yxatiga qaytish
          </Button>
        </div>
      </>
    );
  }

  const orderActions = (
    <div className="row middle" style={{ gap: 8, flexWrap: "wrap" }}>
      {item.status === "DRAFT" && (
        <Button
          variant="primary" size="sm" className="row middle"
          onClick={() => void handleSendDraftOrder()}
          disabled={sendingOrder}
        >
          <span>🚀</span>
          <span>{sendingOrder ? tx("common.yuborilmoqda") : tx("orders.send_order")}</span>
        </Button>
      )}
      {isSohaviyOrAdmin && item.status !== "COMPLETED" && item.status !== "REJECTED" && item.status !== "READY_FOR_REVIEW" && item.status !== "CANCELLED" && (
        <Button
          size="sm"
          onClick={handleOpenUploadVersion}
        >
          + {tx("orders.yangi_tz_versiyasi")}
        </Button>
      )}
      {isPMOrAdmin && (item.assigned_pm === user?.id || user?.is_platform_admin || user?.is_boss) && (
        <>
          {canSubmitCompletion && (
            <Button
              variant="primary" size="sm"
              onClick={handleOpenSubmitCompletion}
            >
              <span>📁</span>
              <span>{tx("orders.yakunlash", undefined, "Yakunlash")}</span>
            </Button>
          )}
          {canDistribute && (
            hasProject ? (
              <Button
                size="sm"
                onClick={() => setDistributeTasksModalOpen(true)}
              >
                <span>📋</span>
                <span>{tx("orders.vazifalarni_taqsimlash", undefined, "Vazifalarni taqsimlash")}</span>
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setProjectModalOpen(true)}
              >
                <span>🚀</span>
                <span>{tx("orders.loyihani_taqsimlash", undefined, "Loyihani taqsimlash")}</span>
              </Button>
            )
          )}
        </>
      )}
      {canEdit && (
        <Button
          size="sm"
          onClick={() => go(toEditOrder(item.id))}
        >
          {tx("common.tahrirlash")}
        </Button>
      )}
      {canDelete && (
        <Button
          variant="danger" size="sm"
          onClick={() => void handleDelete()}
          title={tx("common.ochirish")}
        >
          {tx("common.ochirish")}
        </Button>
      )}
    </div>
  );

  const mainView = (
    <>
      <div
        className={isModal ? undefined : "content"}
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: isModal ? 0 : "16px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <ErrorMsg error={actionError} />
        <OkMsg text={actionOk} />
        {item.pending_version && (
          <div
            style={{
              background: "var(--accent-soft)",
              border: "1px solid var(--accent-border)",
              borderRadius: 14,
              padding: "18px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              boxShadow: "var(--shadow-xs)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: "var(--done-soft)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <DocLilacIcon size={22} color="var(--done)" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
                  {tx("orders.new_tz_uploaded_title", { v: item.pending_version.version })}
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
                  Yuklangan: <strong>{item.pending_version.uploaded_by_name || tx("orders.buyurtmachi")}</strong> • {fmtDateTime(item.pending_version.created_at)}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              {item.pending_version.tz_file_url && (
                <Button
                  icon={<DocLilacIcon size={16} color="var(--done)" />}
                  onClick={() => setPreviewFile({
                    url: item.pending_version!.tz_file_url!,
                    name: item.pending_version!.tz_file_name || tx("orders.yangi_tz_fayli"),
                    size: item.pending_version!.tz_file_size_display,
                  })}
                  title={tx("orders.yangi_tz_korish")}
                >
                  {item.pending_version.tz_file_name || tx("orders.yangi_tz_fayli")}
                  {item.pending_version.tz_file_size_display && (
                    <span className="btn-count">{item.pending_version.tz_file_size_display}</span>
                  )}
                </Button>
              )}
              {isPMOrAdmin && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Button variant="success" onClick={() => handleOpenApproveVersion(item.pending_version?.version)}>
                    ✓ {tx("orders.approve_tz_btn")}
                  </Button>
                  <Button variant="danger" onClick={() => handleOpenRejectVersion(item.pending_version?.version)}>
                    ✕ {tx("orders.reject_tz_btn")}
                  </Button>
                </div>
              )}
            </div>
            {item.pending_version.change_note && (
              <div
                style={{
                  background: "var(--surface)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 12.5,
                  borderLeft: "3px solid var(--done)",
                  color: "var(--text)",
                }}
              >
                <strong>O'zgarishlar tavsifi (sababi): </strong>
                <span>{item.pending_version.change_note}</span>
              </div>
            )}
          </div>
        )}
        {item.status === "DRAFT" && (
          <div
            style={{
              background: "var(--attention-soft)",
              border: "1px solid var(--attention-border)",
              borderRadius: 8,
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>📝</span>
              <div>
                <strong style={{ color: "var(--attention)" }}>{tx("orders.status_draft")}: </strong>
                <span style={{ fontSize: 13, color: "var(--text)" }}>
                  {tx("orders.draft_badge_desc")}
                </span>
              </div>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {canEdit && (
                <Button
                  
                  onClick={() => go(toEditOrder(item.id))}
                >
                  <span>✏️</span>
                  <span>{tx("common.tahrirlash")}</span>
                </Button>
              )}
              {canDelete && (
                <Button variant="danger"
                  
                  onClick={() => void handleDelete()}
                >
                  <span>🗑️</span>
                  <span>{tx("common.ochirish")}</span>
                </Button>
              )}
              <Button
                variant="primary"
                onClick={() => void handleSendDraftOrder()}
                disabled={sendingOrder}
              >
                <span>🚀</span>
                <span>{sendingOrder ? tx("common.yuborilmoqda") : tx("orders.send_order")}</span>
              </Button>
            </div>
          </div>
        )}
        {!item.assigned_pm && isPMOrAdmin && item.status !== "DRAFT" && (
          <div
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 13, color: "var(--text)" }}>
              {tx("orders.masul_pm_yoq_qabul_qilasizmi")}
            </div>
            <div className="row middle" style={{ gap: 8 }}>
              <Button variant="danger"
                size="xs"
                onClick={() => handleOpenClaim("reject")}
              >
                ↩ {tx("orders.orqaga_qaytarish", undefined, "Orqaga qaytarish")}
              </Button>
              <Button
                variant="primary" size="xs"
                onClick={() => handleOpenClaim("accept")}
              >
                {tx("orders.ishni_qabul_qilish")}
              </Button>
            </div>
          </div>
        )}
        {item.assigned_pm && (item.assigned_pm === user?.id || user?.is_platform_admin || user?.is_boss) && (item.status === "ACCEPTED" || item.status === "ASSIGNED_TO_DEV" || item.status === "IN_PROGRESS") && (
          <div
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 13, color: "var(--text)" }}>
              {user?.is_platform_admin || user?.is_boss
                ? `Mas'ul PM: ${item.assigned_pm_name || "Mavjud"}. Buyurtmani boshqa PM ga topshirishingiz mumkin:`
                : "Buyurtma sizga biriktirilgan. Uni boshqa PM ga topshirishingiz mumkin:"}
            </div>
            <div className="row middle" style={{ gap: 8 }}>
              <Button
                variant="primary" size="xs"
                onClick={() => {
                  setTransferModalOpen(true);
                  setSelectedPmId(null);
                  setTransferSearch("");
                  setTransferNotes("");
                  setTransferError(null);
                }}
              >
                👥 {tx("orders.boshqa_pmga_topshirish", undefined, "Boshqa PM ga topshirish")}
              </Button>
            </div>
          </div>
        )}
        {item.status === "READY_FOR_REVIEW" && (
          <div
            style={{
              background: "var(--done-soft)",
              border: "1.5px solid var(--done)",
              borderRadius: 12,
              padding: "16px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>📑</span>
                <span style={{ fontWeight: 700, fontSize: 14.5, color: "var(--done)" }}>
                  {tx("orders.boshqarma_tasdigiga_topshirilgan")}
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--done)", marginTop: 4 }}>
                {tx("orders.boshqarma_tasdigi_desc")}
              </div>
              {item.completion_note && (
                <div style={{ fontSize: 12.5, color: "var(--text)", marginTop: 6, background: "var(--surface)", padding: "6px 10px", borderRadius: 6, borderLeft: "3px solid var(--done)" }}>
                  <strong>{tx("orders.hisobot_izohi")}:</strong> {item.completion_note}
                </div>
              )}
              {item.completion_file_url && (
                <div style={{ marginTop: 8 }}>
                  <Button
                    size="xs"
                    onClick={() => setPreviewFile({
                      url: item.completion_file_url!,
                      name: item.completion_file_name || tx("orders.hisobot_hujjati"),
                      size: item.completion_file_size_display,
                    })}
                  >
                    <span>📁</span>
                    <span>{item.completion_file_name || tx("orders.hisobot_fayli")}</span>
                    {item.completion_file_size_display && <span style={{ opacity: 0.7 }}>({item.completion_file_size_display})</span>}
                  </Button>
                </div>
              )}
            </div>
            {canClientReview ? (
              <div className="row middle" style={{ gap: 10 }}>
                <Button
                  variant="success" size="sm"
                  onClick={handleClientApprove}
                >
                  <span>✓</span>
                  <span>{tx("orders.tasdiqlash_va_yakunlash")}</span>
                </Button>
                <Button
                  variant="warning" size="sm"
                  onClick={handleOpenReject}
                >
                  <span>⚠️</span>
                  <span>{tx("orders.kamchilik_bilan_qaytarish")}</span>
                </Button>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--done)", fontWeight: 600, background: "var(--surface)", padding: "6px 12px", borderRadius: 8 }}>
                ⏳ {tx("orders.boshqarma_tasdigi_kutilmoqda")}
              </div>
            )}
          </div>
        )}
        {item.client_feedback_note && item.status !== "COMPLETED" && item.status !== "READY_FOR_REVIEW" && (
          <div
            style={{
              background: "var(--attention-soft)",
              border: "1.5px solid var(--attention)",
              borderRadius: 12,
              padding: "16px 18px",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <span style={{ fontWeight: 700, fontSize: 14.5, color: "var(--attention)" }}>
                  {tx("orders.boshqarma_kamchilik_bildirdi")}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--attention)", marginTop: 6, whiteSpace: "pre-wrap", background: "var(--surface)", padding: "8px 12px", borderRadius: 6, borderLeft: "3px solid var(--attention)" }}>
                {item.client_feedback_note}
              </div>
              {item.client_feedback_file_url && (
                <div style={{ marginTop: 8 }}>
                  <Button variant="warning"
                    size="xs"
                    onClick={() => setPreviewFile({
                      url: item.client_feedback_file_url!,
                      name: item.client_feedback_file_name || tx("orders.tuzatish_hujjati"),
                      size: item.client_feedback_file_size_display,
                    })}
                  >
                    <span>📎</span>
                    <span>{tx("orders.tuzatish_hujjati_fayli")}: {item.client_feedback_file_name || tx("common.fayl", undefined, "Fayl")}</span>
                    {item.client_feedback_file_size_display && <span style={{ opacity: 0.7 }}>({item.client_feedback_file_size_display})</span>}
                  </Button>
                </div>
              )}
            </div>
            {canSubmitCompletion && (
              <Button
                variant="primary" size="sm"
                onClick={handleOpenSubmitCompletion}
              >
                <span>📁</span>
                <span>{tx("orders.qayta_topshirish")}</span>
              </Button>
            )}
          </div>
        )}
        {item.status === "REJECTED" && (item.pm_notes || item.client_feedback_note) && (
          <div
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--danger-border)",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              color: "var(--danger)",
            }}
          >
            <strong>{tx("orders.rad_etish_sababi")}: </strong>
            <span>{item.pm_notes || item.client_feedback_note}</span>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2.2fr) minmax(380px, 1fr)", gap: 32, alignItems: "start" }}>
          {/* CHAP USTUN */}
          <section
            className="card padded"
            style={{
              borderRadius: 16,
              border: "1px solid var(--border)",
              padding: "24px 28px",
              background: "var(--surface)",
              boxShadow: "var(--shadow-xs)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <div style={{ paddingTop: 2, color: "var(--accent)", display: "inline-flex" }}>
              <CalendarOutlineIcon size={22} color="var(--accent)" />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: "var(--muted)",
                  textTransform: "uppercase",
                }}
              >
                {tx("orders.buyurtma_nomi")}
              </div>
              <h1
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: "var(--text)",
                  margin: "4px 0 2px 0",
                  lineHeight: 1.3,
                }}
              >
                {item.system_name}
              </h1>
              {item.project_detail && (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 13,
                    color: "var(--muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <span>{tx("orders.loyiha")}:</span>
                  <Link
                    {...toProject(item.project_detail.id)}
                    style={{
                      fontWeight: 600,
                      color: "var(--text)",
                      textDecoration: "none",
                    }}
                  >
                    {item.project_detail.name}
                  </Link>
                </div>
              )}
            </div>
          </div>
          <div style={{ height: 1, background: "var(--border-muted)", margin: "20px 0" }} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "16px 20px",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)" }}>
                <UserOutlineIcon size={15} color="var(--muted)" />
                <span>{tx("orders.mijoz", undefined, "Mijoz")}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--text)", marginTop: 4 }}>
                {item.responsible_person || "—"}
              </div>
              {item.department && (
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  ({item.department})
                </div>
              )}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)" }}>
                <UserOutlineIcon size={15} color="var(--muted)" />
                <span>{tx("orders.masul_pm", undefined, "Mas'ul PM")}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--text)", marginTop: 4 }}>
                {item.assigned_pm_name || <span style={{ color: "var(--subtle)", fontWeight: 500 }}>{tx("orders.biriktirilmagan")}</span>}
              </div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)" }}>
                <CalendarOutlineIcon size={15} color="var(--muted)" />
                <span>{tx("orders.muddat", undefined, "Muddat")}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--text)", marginTop: 4 }}>
                {item.due_date ? fmtDate(item.due_date) : "—"}
              </div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)" }}>
                <ClockOutlineIcon size={15} color="var(--muted)" />
                <span>{tx("orders.pm_belgilagan_muddat", undefined, "PM belgilagan muddat")}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--text)", marginTop: 4 }}>
                {item.pm_deadline ? fmtDate(item.pm_deadline) : item.pm_estimated_duration || <span style={{ color: "var(--subtle)", fontWeight: 500 }}>{tx("orders.kutilmoqda")}</span>}
              </div>
            </div>
          </div>
          <div style={{ height: 1, background: "var(--border-muted)", margin: "20px 0" }} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "16px 20px",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)" }}>
                <ClockOutlineIcon size={15} color="var(--muted)" />
                <span>{tx("orders.masul_dasturchi", undefined, "Mas'ul dasturchi")}</span>
              </div>
              <div style={{ fontWeight: item.assigned_developer_name ? 700 : 500, fontSize: 14, color: item.assigned_developer_name ? "var(--text)" : "var(--muted)", marginTop: 4 }}>
                {item.assigned_developer_name || tx("orders.biriktirilmagan")}
              </div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)" }}>
                <ClockOutlineIcon size={15} color="var(--muted)" />
                <span>{tx("orders.muhimlik_turi", undefined, "Muhimlik turi")}</span>
              </div>
              <div style={{ marginTop: 4 }}>
                <span
                  style={{
                    background:
                      item.priority === "URGENT"
                        ? "var(--danger-soft)"
                        : item.priority === "HIGH"
                        ? "var(--accent-soft)"
                        : item.priority === "MEDIUM"
                        ? "var(--success-soft)"
                        : "var(--surface-2)",
                    color:
                      item.priority === "URGENT"
                        ? "var(--danger)"
                        : item.priority === "HIGH"
                        ? "var(--accent)"
                        : item.priority === "MEDIUM"
                        ? "var(--success)"
                        : "var(--muted)",
                    padding: "3px 14px",
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    display: "inline-block",
                  }}
                >
                  {item.priority_display || item.priority}
                </span>
              </div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)" }}>
                <TimerOutlineIcon size={15} color="var(--muted)" />
                <span>{tx("orders.vaqt", undefined, "Vaqt")}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", marginTop: 4 }}>
                {fmtDateTime(item.created_at || item.request_date)}
              </div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)" }}>
                <HourglassOutlineIcon size={15} color="var(--muted)" />
                <span>{tx("orders.qolgan_vaqt", undefined, "Qolgan vaqt")}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", marginTop: 4 }}>
                {timeAgo(item.updated_at || item.created_at)}
              </div>
            </div>
          </div>
          <div style={{ height: 1, background: "var(--border-muted)", margin: "20px 0" }} />
          <div
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "16px 20px",
              marginTop: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: (item.module || item.additional_materials) ? 10 : 0 }}>
              <div style={{ width: 4, height: 16, borderRadius: 2, background: "var(--accent)" }} />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>
                {tx("orders.fayl_va_izohlar", undefined, "Izoh va fayllar")}
              </span>
            </div>
            {item.module && (
              <div
                style={{
                  fontSize: 13.5,
                  color: "var(--text)",
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  background: "var(--surface)",
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  marginTop: 6,
                }}
              >
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>
                  {tx("orders.loyiha_izoh_label", undefined, "Loyiha haqida izoh")}
                </div>
                {item.module}
              </div>
            )}
            {item.additional_materials && (
              <div
                style={{
                  fontSize: 13.5,
                  color: "var(--text)",
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  background: "var(--surface)",
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  marginTop: 6,
                }}
              >
                {item.additional_materials}
              </div>
            )}
          </div>

            {/* PM Panel */}
          {pmPanelOpen && (
            <form
              onSubmit={handleSavePM}
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: "1px dashed var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 600 }}>{tx("orders.yangi_holat")}</label>
                  <select
                    value={pmStatus}
                    onChange={(e) => setPmStatus(e.target.value as ChangeRequestItem["status"])}
                  >
                    {(meta?.order_status || []).filter((s) => s.value !== "COMPLETED" && s.value !== "READY_FOR_REVIEW" && s.value !== "NEW").map((s) => (
                      <option key={String(s.value)} value={String(s.value)}>{s.label}</option>
                    ))}
                  </select>
                </div>
                {(user?.is_platform_admin || user?.is_boss) && (
                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <label style={{ fontSize: 11, fontWeight: 600 }}>Biriktirilgan hodim (PM)</label>
                    <select
                      value={pmAssignedPm}
                      onChange={(e) => setPmAssignedPm(e.target.value ? Number(e.target.value) : "")}
                    >
                      <option value="">(O'zgarishsiz qoldirish / O'zingizga olish)</option>
                      {pmList.map((u: UserBrief) => (
                        <option key={u.id} value={u.id}>{u.full_name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 600 }}>{tx("orders.boshlanish_sanasi", undefined, "Boshlanish sanasi")}</label>
                  <DateField
                    min={new Date().toLocaleDateString("en-CA")}
                    value={pmStartDate}
                    onChange={(v) => {
                      setPmStartDate(v);
                      if (v && pmDeadline && pmDeadline < v) {
                        setPmDeadline(v);
                      }
                    }}
                  />
                </div>
                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 600 }}>{tx("orders.pm_yakuniy_muddati")}</label>
                  <DateField
                    min={pmStartDate && pmStartDate > new Date().toLocaleDateString("en-CA") ? pmStartDate : new Date().toLocaleDateString("en-CA")}
                    value={pmDeadline}
                    onChange={(v) => {
                      if (v && pmStartDate && v < pmStartDate) {
                        setPmDeadline(pmStartDate);
                      } else {
                        setPmDeadline(v);
                      }
                    }}
                  />
                </div>
              </div>
              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 600 }}>{tx("orders.pm_izohi")}</label>
                <input
                  type="text"
                  placeholder={tx("orders.qisqa_korsatma")}
                  value={pmNotes}
                  onChange={(e) => setPmNotes(e.target.value)}
                />
              </div>
              <div className="row end" style={{ gap: 6 }}>
                <Button
                  variant="ghost" size="xs"
                  onClick={() => setPmPanelOpen(false)}
                >
                  Bekor qilish
                </Button>
                <Button type="submit" variant="primary" size="xs" disabled={pmSaving}>
                  {pmSaving ? tx("common.saqlanmoqda") : tx("common.saqlash")}
                </Button>
              </div>
            </form>
          )}

            </div>
          </section>

          {/* O'NG USTUN */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "14px 18px",
                marginTop: 14,
                cursor: "pointer",
                userSelect: "none",
                boxShadow: "var(--shadow-xs)",
              }}
              onClick={() => setFilesOpen((v) => !v)}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <PaperclipOutlineIcon size={18} color="var(--accent)" />
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>
                    {tx("orders.fayllar", undefined, "Fayllar")}
                  </span>
                  <span
                    style={{
                      background: "var(--surface-3)",
                      color: "var(--text-secondary)",
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "1px 8px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      fontFamily: "var(--mono)",
                    }}
                  >
                    {totalFilesCount} {tx("common.ta")}
                  </span>
                </div>
                <div
                  style={{
                    color: "var(--muted)",
                    display: "inline-flex",
                    transition: "transform 0.2s ease",
                    transform: filesOpen ? "rotate(180deg)" : "none",
                  }}
                >
                  <ChevronDownOutlineIcon size={16} color="var(--muted)" />
                </div>
              </div>
              {filesOpen && (
                <div
                  style={{
                    marginTop: 14,
                    paddingTop: 12,
                    borderTop: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Asosiy TZ hujjati (agar attachments ichida aynan shu nom bilan takrorlanmagan bo'lsa) */}
                  {item.tz_file_url && (!item.attachments || !item.attachments.some((a) => a.original_name === item.tz_file_name)) && (
                    <Button
                      block className="btn-start"
                      onClick={() => setPreviewFile({ url: item.tz_file_url!, name: item.tz_file_name || "TZ_fayli", size: item.tz_file_size_display })}
                      title={tx("orders.veb_saytda_ochish")}
                    >
                      <DocLilacIcon size={18} color="var(--done)" />
                      <span className="btn-grow">
                        {item.tz_file_name || tx("orders.faylni_yuklab_olish")} {item.tz_file_size_display ? `(${item.tz_file_size_display})` : ""}
                      </span>
                    </Button>
                  )}
                  {/* Biriktirilgan ilova fayllar */}
                  {item.attachments && item.attachments.map((att) => (
                    <Button
                      key={att.id}
                      block className="btn-start"
                      onClick={() => setPreviewFile({ url: att.url, name: att.original_name, size: att.size_display })}
                      title={tx("orders.veb_saytda_ochish")}
                    >
                      <DocLilacIcon size={18} color="var(--done)" />
                      <span className="btn-grow">
                        {att.original_name} {att.size_display ? `(${att.size_display})` : ""}
                      </span>
                    </Button>
                  ))}
                  {(!item.tz_file_url && (!item.attachments || item.attachments.length === 0) && !item.completion_file_url) && (
                    <div style={{ padding: "8px", fontSize: 12.5, color: "var(--muted)", textAlign: "center" }}>
                      {tx("orders.fayllar_yoq", undefined, "Fayllar mavjud emas")}
                    </div>
                  )}
                  {item.completion_file_url && (
                    <Button
                      block className="btn-start"
                      onClick={() => setPreviewFile({ url: item.completion_file_url!, name: item.completion_file_name || "Hisobot_hujjati" })}
                      title={tx("orders.hisobot_korish")}
                    >
                      <DocLilacIcon size={18} color="var(--done)" />
                      <span className="btn-grow">
                        {item.completion_file_name || tx("orders.hisobot_fayli")}
                      </span>
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "14px 18px",
                cursor: "pointer",
                userSelect: "none",
                boxShadow: "var(--shadow-xs)",
              }}
              onClick={() => setHistoryOpen((v) => !v)}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <FolderFilledIcon size={18} />
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>
                    {tx("orders.avvalgi_tz_versiyalari", undefined, "Avvalgi TZ versiyalari (Tarix)")}
                  </span>
                  {olderVersions.length > 0 && (
                    <span
                      style={{
                        background: "var(--surface-3)",
                        color: "var(--text-secondary)",
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "1px 8px",
                        borderRadius: 10,
                      }}
                    >
                      {olderVersions.length} {tx("common.ta")}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    color: "var(--muted)",
                    display: "inline-flex",
                    transition: "transform 0.2s ease",
                    transform: historyOpen ? "rotate(180deg)" : "none",
                  }}
                >
                  <ChevronDownOutlineIcon size={16} color="var(--muted)" />
                </div>
              </div>
              {historyOpen && (
                <div
                  style={{
                    marginTop: 14,
                    paddingTop: 12,
                    borderTop: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {olderVersions.length === 0 ? (
                    <div style={{ padding: "10px", fontSize: 12.5, color: "var(--muted)", textAlign: "center" }}>
                      Avvalgi versiyalar tarixi mavjud emas
                    </div>
                  ) : (
                    olderVersions.map((ver) => {
                      const isRejected = ver.status === "REJECTED";
                      return (
                        <div
                          key={ver.id || ver.version}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: "1px solid var(--border)",
                            background: isRejected ? "var(--danger-soft)" : "var(--surface)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                            boxShadow: "var(--shadow-xs)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <span
                                  style={{
                                    fontFamily: "var(--mono)",
                                    fontWeight: 700,
                                    fontSize: 11,
                                    padding: "1px 5px",
                                    borderRadius: 4,
                                    background: isRejected ? "var(--danger-soft)" : "var(--accent-soft)",
                                    color: isRejected ? "var(--danger)" : "var(--accent)",
                                  }}
                                >
                                  v{ver.version}
                                </span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                                  {ver.tz_file_name || `TZ v${ver.version}`}
                                </span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 11, color: "var(--muted)" }}>
                                <span
                                  className={`badge ${
                                    isRejected
                                      ? "badge-danger"
                                      : ver.status === "CANCELLED"
                                      ? "badge-ghost"
                                      : "badge-outline"
                                  }`}
                                  style={{ fontSize: 10 }}
                                >
                                  {isRejected
                                    ? tx("orders.rad_etilgan")
                                    : ver.version === 1
                                    ? tx("orders.dastlabki_tz_eski")
                                    : tx("orders.eski_versiya_bekor_qilingan")}
                                </span>
                                {ver.uploaded_by_name && (
                                  <span>• {ver.uploaded_by_name}</span>
                                )}
                                {ver.created_at && (
                                  <span>• {fmtDateTime(ver.created_at)}</span>
                                )}
                              </div>
                            </div>
                            {ver.tz_file_url && (
                              <button
                                type="button"
                                onClick={() => setPreviewFile({
                                  url: ver.tz_file_url!,
                                  name: ver.tz_file_name || `TZ_v${ver.version}.docx`,
                                  size: ver.tz_file_size_display,
                                })}
                                style={{
                                  background: "var(--surface-2)",
                                  border: "none",
                                  borderRadius: 6,
                                  padding: "4px 8px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  cursor: "pointer",
                                  fontSize: 11.5,
                                  fontWeight: 600,
                                  color: "var(--text-secondary)",
                                  flexShrink: 0,
                                }}
                                title={tx("orders.veb_saytda_ochish")}
                              >
                                <span>📄</span>
                                {ver.tz_file_size_display && <span>{ver.tz_file_size_display}</span>}
                              </button>
                            )}
                          </div>
                          {(ver.change_note || ver.decision_note) && (
                            <div
                              style={{
                                width: "100%",
                                fontSize: 11.5,
                                color: isRejected ? "var(--danger)" : "var(--muted)",
                                background: isRejected ? "var(--danger-soft)" : "var(--surface-2)",
                                padding: "6px 8px",
                                borderRadius: 6,
                                display: "flex",
                                flexDirection: "column",
                                gap: 3,
                              }}
                            >
                              {ver.change_note && <div><strong>{tx("orders.ozgarish_izohi")}:</strong> {ver.change_note}</div>}
                              {ver.decision_note && <div><strong>{tx("orders.pm_qarori")}:</strong> {ver.decision_note}</div>}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>


      </div>
      {versionModal && (
        <div className="modal-overlay" onClick={() => setVersionModal(false)}>
          <div
            className="modal-card"
            style={{ maxWidth: 480, width: "95%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle" style={{ padding: "16px 20px" }}>
              <div className="row middle" style={{ gap: 10 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                  }}
                >
                  📄
                </div>
                <strong style={{ fontSize: 15 }}>Yangi TZ versiyasi yuklash</strong>
              </div>
              <Button aria-label={tx("common.bekor_qilish")} iconOnly
                variant="ghost" size="xs"
                onClick={() => setVersionModal(false)}
                title={tx("common.bekor_qilish")}
              >
                ✕
              </Button>
            </div>
            <form onSubmit={handleUploadVersionSubmit}>
              <div className="modal-body" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6 }}>
                    Yangi TZ fayli (PDF/DOCX/Rasm) <span style={{ color: "var(--danger)" }}>*</span>
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <label className={buttonClass({ size: "sm" })}>
                      Fayl tanlash
                      <input
                        type="file"
                        hidden
                        onChange={(e) => setVersionFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    <span className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                      {versionFile ? versionFile.name : "Fayl tanlanmagan"}
                    </span>
                  </div>
                </div>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6 }}>
                    O'zgarishlar tavsifi (sababi) <span style={{ color: "var(--danger)" }}>*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    className="textarea"
                    placeholder="Ushbu versiyada qanday o'zgarishlar kiritildi..."
                    value={versionNote}
                    onChange={(e) => setVersionNote(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer row between middle" style={{ padding: "14px 20px" }}>
                <Button
                  variant="ghost"
                  onClick={() => setVersionModal(false)}
                >
                  {tx("common.bekor_qilish")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={versionSubmitting || !versionFile}
                >
                  {versionSubmitting ? tx("common.yuklanmoqda") : tx("common.yuborish")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {claimModalOpen && item && (
        <div className="modal-overlay" onClick={() => !claimSubmitting && setClaimModalOpen(false)}>
          <div
            className="modal-card"
            style={{ maxWidth: 580, width: "95%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle" style={{ padding: "16px 20px" }}>
              <div className="row middle" style={{ gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: claimMode === "reject" ? "var(--danger-soft)" : "var(--success-soft)",
                    color: claimMode === "reject" ? "var(--danger)" : "var(--success)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    fontWeight: "bold",
                    flexShrink: 0,
                  }}
                >
                  {claimMode === "reject" ? "↩" : "✓"}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", lineHeight: 1.3 }}>
                    {claimMode === "reject"
                      ? tx("orders.return_modal_title")
                      : item.assigned_pm && (user?.is_platform_admin || user?.is_boss)
                      ? tx("orders.reassign_pm_modal_title", undefined, "Buyurtmani boshqa PM ga biriktirish")
                      : tx("orders.claim_modal_title")}
                  </div>
                  <div className="row middle" style={{ gap: 6, marginTop: 3 }}>
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontWeight: 600,
                        fontSize: 11.5,
                        padding: "1px 7px",
                        background: "var(--surface-3)",
                        borderRadius: 4,
                        color: "var(--text)",
                      }}
                    >
                      {item.system_name}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>•</span>
                    <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
                      {item.project_detail?.name || item.system_name}
                    </span>
                  </div>
                </div>
              </div>
              <Button aria-label={tx("common.bekor_qilish")} iconOnly
                variant="ghost" size="xs"
                onClick={() => setClaimModalOpen(false)}
                disabled={claimSubmitting}
                title={tx("common.bekor_qilish")}
              >
                ✕
              </Button>
            </div>
            <form
              onSubmit={(e) => {
                if (claimMode === "accept") return handleClaimSubmit(e);
                e.preventDefault();
                void handleClaimReject();
              }}
            >
              <div className="modal-body" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                {actionError && <ErrorMsg error={actionError} />}
                {claimMode === "accept" && (<>
                {item.due_date && (
                  <div
                    style={{
                      background: "var(--attention-soft)",
                      border: "1px solid var(--attention-border)",
                      borderRadius: 10,
                      padding: "8px 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: 12.5,
                    }}
                  >
                    <div className="row middle" style={{ gap: 8 }}>
                      <span>📅</span>
                      <span style={{ color: "var(--muted)" }}>{tx("orders.soralgan_muddat")}:</span>
                      <strong style={{ color: "var(--text)" }}>{fmtDate(item.due_date)}</strong>
                    </div>
                    <Button
                      variant="link" size="xs"
                      onClick={() => {
                        const d = item.due_date?.split("T")[0];
                        if (d) setClaimDeadlineInput(d);
                      }}
                    >
                      {tx("orders.claim_use_client_date")}
                    </Button>
                  </div>
                )}
                {(user?.is_platform_admin || user?.is_boss) && (
                  <div className="field">
                    <label style={{ fontWeight: 600, fontSize: 12.5, color: "var(--text)", display: "block", marginBottom: 6 }}>
                      Biriktirilgan hodim (PM)
                    </label>
                    <select
                      className="input"
                      value={claimAssignedPmInput}
                      onChange={(e) => setClaimAssignedPmInput(e.target.value ? Number(e.target.value) : "")}
                      style={{ width: "100%" }}
                    >
                      <option value="">(O'zingizga olish)</option>
                      {pmList.map((u: UserBrief) => (
                        <option key={u.id} value={u.id}>{u.full_name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="field">
                    <label style={{ fontWeight: 600, fontSize: 12.5, color: "var(--text)", margin: 0, display: "block", marginBottom: 6 }}>
                      {tx("orders.boshlanish_sanasi", undefined, "Boshlanish sanasi")}
                    </label>
                    <DateField
                      value={claimStartDateInput}
                      min={new Date().toLocaleDateString("en-CA")}
                      onChange={(v) => {
                        setClaimStartDateInput(v);
                        if (v && claimDeadlineInput && claimDeadlineInput < v) {
                          setClaimDeadlineInput(v);
                        }
                      }}
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div className="field">
                    <div className="row between middle" style={{ marginBottom: 6 }}>
                      <label style={{ fontWeight: 600, fontSize: 12.5, color: "var(--text)", margin: 0 }}>
                        {tx("orders.claim_deadline_label")} <span style={{ color: "var(--danger)" }}>*</span>
                      </label>
                    </div>
                    <DateField
                      required
                      min={claimStartDateInput && claimStartDateInput > new Date().toLocaleDateString("en-CA")
                        ? claimStartDateInput
                        : new Date().toLocaleDateString("en-CA")}
                      value={claimDeadlineInput}
                      onChange={(v) => {
                        if (v && claimStartDateInput && v < claimStartDateInput) {
                          setClaimDeadlineInput(claimStartDateInput);
                        } else {
                          setClaimDeadlineInput(v);
                        }
                      }}
                      style={{ width: "100%" }}
                    />
                  </div>
                </div>
                </>)}

                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6, color: "var(--text)" }}>
                    {claimMode === "reject" ? tx("orders.return_reason_label") : tx("orders.claim_notes_label")}
                    {claimMode === "reject" && <span style={{ color: "var(--danger)" }}> *</span>}
                  </label>
                  <textarea
                    rows={claimMode === "reject" ? 4 : 3}
                    className="textarea"
                    required={claimMode === "reject"}
                    autoFocus={claimMode === "reject"}
                    placeholder={claimMode === "reject"
                      ? tx("orders.return_reason_placeholder")
                      : tx("orders.claim_notes_placeholder")}
                    value={claimNotesInput}
                    onChange={(e) => setClaimNotesInput(e.target.value)}
                    style={{ width: "100%", resize: "vertical" }}
                  />
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                    {claimMode === "reject" ? tx("orders.return_reason_hint") : tx("orders.claim_notes_hint")}
                  </div>
                </div>
              </div>
              <div
                className="modal-footer"
                style={{
                  padding: "14px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <Button
                  variant="ghost"
                  onClick={() => setClaimModalOpen(false)}
                  disabled={claimSubmitting}
                >
                  {tx("common.bekor_qilish")}
                </Button>
                {claimMode === "reject" ? (
                  <Button
                    type="submit"
                    variant="danger"
                    disabled={claimSubmitting || !claimNotesInput.trim()}
                  >
                    {claimSubmitting ? (
                      <>
                        <span className="spinner-xs" />
                        <span>{tx("orders.return_submitting")}</span>
                      </>
                    ) : (
                      <span>↩ {tx("orders.orqaga_qaytarish", undefined, "Orqaga qaytarish")}</span>
                    )}
                  </Button>
                ) : (
                <Button
                  type="submit"
                  variant="success"
                  disabled={claimSubmitting || !claimDeadlineInput}
                >
                  {claimSubmitting ? (
                    <>
                      <span className="spinner-xs" />
                      <span>{tx("orders.claim_submitting")}</span>
                    </>
                  ) : (
                    <>
                      <span>✓</span>
                      <span>{tx("orders.claim_submit_btn", undefined, "Qabul qilish")}</span>
                    </>
                  )}
                </Button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
      {transferModalOpen && item && (
        <div className="modal-overlay" onClick={() => !transferSubmitting && setTransferModalOpen(false)}>
          <div
            className="modal-card"
            style={{ maxWidth: 580, width: "95%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle" style={{ padding: "16px 20px" }}>
              <div className="row middle" style={{ gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    fontWeight: "bold",
                    flexShrink: 0,
                  }}
                >
                  👥
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", lineHeight: 1.3 }}>
                    {tx("orders.boshqa_pmga_topshirish", undefined, "Boshqa PM ga topshirish")}
                  </div>
                  <div className="row middle" style={{ gap: 6, marginTop: 3 }}>
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontWeight: 600,
                        fontSize: 11.5,
                        padding: "1px 7px",
                        background: "var(--surface-3)",
                        borderRadius: 4,
                        color: "var(--text)",
                      }}
                    >
                      {item.system_name}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>•</span>
                    <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
                      {item.project_detail?.name || item.system_name}
                    </span>
                  </div>
                </div>
              </div>
              <Button aria-label={tx("common.bekor_qilish")} iconOnly
                variant="ghost" size="xs"
                onClick={() => setTransferModalOpen(false)}
                disabled={transferSubmitting}
                title={tx("common.bekor_qilish")}
              >
                ✕
              </Button>
            </div>
            <form onSubmit={handleTransferPm}>
              <div className="modal-body" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                {transferError && <ErrorMsg error={transferError} />}
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", display: "block", marginBottom: 6 }}>
                    Yangi mas'ul loyiha menejeri (PM) <span style={{ color: "var(--danger)" }}>*</span>
                  </label>
                  <div style={{ position: "relative", marginBottom: 8 }}>
                    <input
                      type="text"
                      className="input"
                      placeholder="PM ismi yoki familiyasi bo'yicha qidirish..."
                      value={transferSearch}
                      onChange={(e) => setTransferSearch(e.target.value)}
                      style={{ width: "100%", paddingLeft: 34 }}
                      autoFocus
                    />
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }}>
                      🔍
                    </span>
                  </div>
                  <div
                    style={{
                      maxHeight: 180,
                      overflowY: "auto",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: 4,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      background: "var(--surface)",
                    }}
                  >
                    {filteredPms.length === 0 ? (
                      <div style={{ padding: "14px", textAlign: "center", color: "var(--muted)", fontSize: 12.5 }}>
                        Bunday ism yoki familiyali PM topilmadi
                      </div>
                    ) : (
                      filteredPms.map((u) => {
                        const isSelected = selectedPmId === u.id;
                        return (
                          <div
                            key={u.id}
                            onClick={() => setSelectedPmId(u.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "8px 12px",
                              borderRadius: 6,
                              cursor: "pointer",
                              background: isSelected ? "var(--accent-soft)" : "transparent",
                              border: isSelected ? "1.5px solid var(--accent)" : "1.5px solid transparent",
                              transition: "all 0.15s",
                            }}
                          >
                            <div className="row middle" style={{ gap: 10 }}>
                              <Avatar user={u} size="sm" />
                              <div>
                                <div style={{ fontWeight: isSelected ? 700 : 500, fontSize: 13, color: "var(--text)" }}>
                                  {u.full_name}
                                </div>
                                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                                  {u.job_title || "Loyiha menejeri"} {u.department_name ? `• ${u.department_name}` : ""}
                                </div>
                              </div>
                            </div>
                            {isSelected && (
                              <span style={{ color: "var(--accent)", fontWeight: "bold", fontSize: 14 }}>✓</span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", display: "block", marginBottom: 6 }}>
                    Izoh / ko'rsatma
                  </label>
                  <textarea
                    rows={3}
                    className="textarea"
                    placeholder="Topshirish sababi yoki yangi PM uchun muhim ko'rsatmalar..."
                    value={transferNotes}
                    onChange={(e) => setTransferNotes(e.target.value)}
                    style={{ width: "100%", resize: "vertical" }}
                  />
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                    Ushbu izoh buyurtma tarixida qayd etiladi va yangi PM bildirishnomasiga yoziladi
                  </div>
                </div>
              </div>
              <div
                className="modal-footer"
                style={{
                  padding: "14px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <Button
                  variant="ghost"
                  onClick={() => setTransferModalOpen(false)}
                  disabled={transferSubmitting}
                >
                  {tx("common.bekor_qilish")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={transferSubmitting || !selectedPmId}
                >
                  {transferSubmitting ? (
                    <>
                      <span className="spinner-xs" />
                      <span>Topshirilmoqda...</span>
                    </>
                  ) : (
                    <>
                      <span>✓</span>
                      <span>Topshirish</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {rejectModalOpen && item && (
        <div className="modal-overlay" onClick={() => !rejectSubmitting && setRejectModalOpen(false)}>
          <div
            className="modal-card"
            style={{ maxWidth: 520, width: "95%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle" style={{ padding: "16px 20px" }}>
              <div className="row middle" style={{ gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "var(--danger-soft)",
                    color: "var(--danger)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    flexShrink: 0,
                  }}
                >
                  ⚠️
                </div>
                <div>
                  <strong style={{ fontSize: 15, color: "var(--text)" }}>{tx("orders.kamchilik_bilan_qaytarish")}</strong>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {item.system_name} — {item.project_detail?.name || item.system_name}
                  </div>
                </div>
              </div>
              <Button aria-label={tx("common.bekor_qilish")} iconOnly
                variant="ghost" size="xs"
                onClick={() => setRejectModalOpen(false)}
                disabled={rejectSubmitting}
                title={tx("common.bekor_qilish")}
              >
                ✕
              </Button>
            </div>
            <form onSubmit={handleRejectSubmit}>
              <div className="modal-body" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div
                  style={{
                    background: "var(--attention-soft)",
                    border: "1px solid var(--attention-border)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    fontSize: 12.5,
                    color: "var(--attention)",
                    lineHeight: 1.45,
                  }}
                >
                  Buyurtma holati «Jarayonda»ga o'tkaziladi va loyiha menejeri ko'rsatilgan kamchiliklarni yoki ilova qilingan TZ asosida tuzatishlarni amalga oshiradi.
                </div>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6, color: "var(--text)" }}>
                    {tx("orders.kamchilik_tavsifi")}
                  </label>
                  <textarea
                    rows={4}
                    className="textarea"
                    placeholder="Qaysi qismda kamchilik yoki xatolik aniqlandi, nima tuzatilishi kerak..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    style={{ width: "100%", resize: "vertical" }}
                  />
                </div>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6, color: "var(--text)" }}>
                    {tx("orders.kamchilik_hujjati_tz")}
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <label className={buttonClass({ size: "sm" })}>
                      Fayl tanlash
                      <input
                        type="file"
                        hidden
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                        onChange={(e) => setRejectFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    <span className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                      {rejectFile ? rejectFile.name : "Fayl tanlanmagan"}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                    {tx("orders.kamchilik_hujjati_izoh")}
                  </div>
                </div>
                {rejectFile && (
                  <div style={{ padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5, color: "var(--text)" }}>
                      <input
                        type="checkbox"
                        checked={rejectIsNewTz}
                        onChange={(e) => setRejectIsNewTz(e.target.checked)}
                      />
                      <span>{tx("orders.yangi_tz_sifatida_saqlash")}</span>
                    </label>
                  </div>
                )}
              </div>
              <div className="modal-footer row between middle" style={{ padding: "14px 20px" }}>
                <Button
                  variant="ghost"
                  onClick={() => setRejectModalOpen(false)}
                  disabled={rejectSubmitting}
                >
                  {tx("common.bekor_qilish")}
                </Button>
                <Button
                  type="submit"
                  variant="warning"
                  disabled={rejectSubmitting || (!rejectReason.trim() && !rejectFile)}
                >
                  {rejectSubmitting ? tx("common.yuborilmoqda") : tx("orders.kamchilik_bilan_qaytarish")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {completionModalOpen && item && (
        <div className="modal-overlay" onClick={() => !completionSubmitting && setCompletionModalOpen(false)}>
          <div
            className="modal-card"
            style={{ maxWidth: 540, width: "95%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle" style={{ padding: "16px 20px" }}>
              <div className="row middle" style={{ gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    flexShrink: 0,
                  }}
                >
                  📁
                </div>
                <div>
                  <strong style={{ fontSize: 15, color: "var(--text)" }}>{tx("orders.tugatilgan_ishni_topshirish")}</strong>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {item.system_name} — {item.project_detail?.name || item.system_name}
                  </div>
                </div>
              </div>
              <Button aria-label={tx("common.bekor_qilish")} iconOnly
                variant="ghost" size="xs"
                onClick={() => setCompletionModalOpen(false)}
                disabled={completionSubmitting}
                title={tx("common.bekor_qilish")}
              >
                ✕
              </Button>
            </div>
            <form onSubmit={handleSubmitCompletion}>
              <div className="modal-body" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                {completionError && <ErrorMsg error={completionError} />}
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6, color: "var(--text)" }}>
                    Tugatilgan ish hujjati / Skrinshot (fayl yoki rasm)
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <label className={buttonClass({ size: "sm" })}>
                      Fayl tanlash
                      <input
                        type="file"
                        hidden
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                        onChange={(e) => setCompletionFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    <span className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                      {completionFile ? completionFile.name : "Fayl tanlanmagan"}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                    Word (.docx, .doc), PDF, Excel, Rasmlar (PNG, JPG, WEBP). Maksimal: 20 MB
                  </div>
                </div>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6, color: "var(--text)" }}>
                    Bajarilgan ish bo'yicha hisobot izohi
                  </label>
                  <textarea
                    rows={3}
                    className="textarea"
                    placeholder="Qanday ishlar amalga oshirildi, qaysi modullar yangilandi va sinov natijalari..."
                    value={completionNote}
                    onChange={(e) => setCompletionNote(e.target.value)}
                    style={{ width: "100%", resize: "vertical" }}
                  />
                </div>
              </div>
              <div className="modal-footer row between middle" style={{ padding: "14px 20px" }}>
                <Button
                  variant="ghost"
                  onClick={() => setCompletionModalOpen(false)}
                  disabled={completionSubmitting}
                >
                  {tx("common.bekor_qilish")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={completionSubmitting || (!completionFile && !completionNote.trim())}
                >
                  {completionSubmitting ? tx("common.topshirilmoqda") : tx("common.topshirish")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {taskModalOpen && item && (
        <div className="modal-overlay" onClick={() => !taskSubmitting && setTaskModalOpen(false)}>
          <div
            className="modal-card"
            style={{ maxWidth: 540, width: "95%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle" style={{ padding: "16px 20px" }}>
              <div className="row middle" style={{ gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    fontWeight: "bold",
                    flexShrink: 0,
                  }}
                >
                  📋
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                    {tx("orders.create_task_btn")}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {item.system_name} — {item.project_detail?.name || item.system_name}
                  </div>
                </div>
              </div>
              <Button aria-label={tx("common.bekor_qilish")} iconOnly
                variant="ghost" size="xs"
                onClick={() => setTaskModalOpen(false)}
                disabled={taskSubmitting}
                title={tx("common.bekor_qilish")}
              >
                ✕
              </Button>
            </div>
            <form onSubmit={handleCreateTaskSubmit}>
              <div className="modal-body" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6, color: "var(--text)" }}>
                    {tx("orders.task_title_label")} <span style={{ color: "var(--danger)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="Masalan: Frontend formasini ishlab chiqish"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="field">
                    <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6, color: "var(--text)" }}>
                      {tx("orders.task_assignee_label")}
                    </label>
                    <select
                      className="select"
                      value={taskAssignee || ""}
                      onChange={(e) => setTaskAssignee(e.target.value ? Number(e.target.value) : null)}
                      style={{ width: "100%" }}
                    >
                      <option value="">{tx("common.tanlanmagan")}</option>
                      {developersList.map((dev) => (
                        <option key={dev.id} value={dev.id}>
                          {dev.full_name} ({dev.specialty || tx("orders.dasturchi")})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6, color: "var(--text)" }}>
                      {tx("orders.task_priority_label")}
                    </label>
                    <select
                      className="select"
                      value={taskPriority}
                      onChange={(e) => setTaskPriority(Number(e.target.value))}
                      style={{ width: "100%" }}
                    >
                      <option value={1}>Past</option>
                      <option value={2}>O'rtacha</option>
                      <option value={3}>Yuqori</option>
                      <option value={4}>Shoshilinch</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6, color: "var(--text)" }}>
                    {tx("orders.task_due_date_label")}
                  </label>
                  <input
                    type="date"
                    min={new Date().toISOString().split("T")[0]}
                    className="input"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6, color: "var(--text)" }}>
                    {tx("orders.task_desc_label")}
                  </label>
                  <textarea
                    rows={4}
                    className="textarea"
                    placeholder="Vazifa bo'yicha aniq ko'rsatma va talablar..."
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    style={{ width: "100%", resize: "vertical" }}
                  />
                </div>
              </div>
              <div className="modal-footer row between middle" style={{ padding: "14px 20px" }}>
                <Button
                  variant="ghost"
                  onClick={() => setTaskModalOpen(false)}
                  disabled={taskSubmitting}
                >
                  {tx("common.bekor_qilish")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={taskSubmitting || !taskTitle.trim()}
                >
                  {taskSubmitting ? tx("common.yaratilmoqda") : tx("orders.task_submit_btn")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {approveVersionModal && item && (
        <div className="modal-overlay" onClick={() => !approveSubmitting && setApproveVersionModal(false)}>
          <div
            className="modal-card"
            style={{ maxWidth: 520, width: "95%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle" style={{ padding: "16px 20px" }}>
              <div className="row middle" style={{ gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "var(--success-soft)",
                    color: "var(--success)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    fontWeight: "bold",
                    flexShrink: 0,
                  }}
                >
                  ✓
                </div>
                <div>
                  <strong style={{ fontSize: 16 }}>{tx("orders.approve_version_title")}</strong>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {item.system_name} • {tx("orders.version")}: <strong style={{ color: "var(--success)" }}>v{approveVersionTarget || item.pending_version?.version || tx("orders.yangi")}</strong>
                  </div>
                </div>
              </div>
              <Button aria-label={tx("common.bekor_qilish")} iconOnly
                variant="ghost" size="xs"
                onClick={() => setApproveVersionModal(false)}
                disabled={approveSubmitting}
                title={tx("common.bekor_qilish")}
              >
                ✕
              </Button>
            </div>
            <form onSubmit={handleApproveVersionSubmit}>
              <div className="modal-body" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6, color: "var(--text)" }}>
                    {tx("orders.pm_yakuniy_muddati")}
                  </label>
                  <input
                    type="date"
                    min={new Date().toISOString().split("T")[0]}
                    className="input"
                    value={approveDeadline}
                    onChange={(e) => setApproveDeadline(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6, color: "var(--text)" }}>
                    {tx("orders.pm_xulosasi_va_korsatmasi")}
                  </label>
                  <textarea
                    rows={3}
                    className="textarea"
                    placeholder={tx("orders.pm_xulosasi_placeholder")}
                    value={approveNote}
                    onChange={(e) => setApproveNote(e.target.value)}
                    style={{ width: "100%", resize: "vertical" }}
                  />
                </div>
              </div>
              <div className="modal-footer row between middle" style={{ padding: "14px 20px" }}>
                <Button
                  variant="ghost"
                  onClick={() => setApproveVersionModal(false)}
                  disabled={approveSubmitting}
                >
                  {tx("common.bekor_qilish")}
                </Button>
                <Button
                  type="submit"
                  variant="success"
                  disabled={approveSubmitting}
                >
                  {approveSubmitting ? tx("common.tasdiqlanmoqda", undefined, "Tasdiqlanmoqda...") : tx("orders.tasdiqlash_va_amalda_qollash")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {rejectVersionModal && item && (
        <div className="modal-overlay" onClick={() => !rejectVersionSubmitting && setRejectVersionModal(false)}>
          <div
            className="modal-card"
            style={{ maxWidth: 480, width: "95%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle" style={{ padding: "16px 20px" }}>
              <div className="row middle" style={{ gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "var(--danger-soft)",
                    color: "var(--danger)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    fontWeight: "bold",
                    flexShrink: 0,
                  }}
                >
                  ✕
                </div>
                <div>
                  <strong style={{ fontSize: 16 }}>Yangi TZ versiyasini rad etish</strong>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {item.system_name} • Versiya: v{rejectVersionTarget || item.pending_version?.version || tx("orders.yangi")}
                  </div>
                </div>
              </div>
              <Button aria-label={tx("common.bekor_qilish")} iconOnly
                variant="ghost" size="xs"
                onClick={() => setRejectVersionModal(false)}
                disabled={rejectVersionSubmitting}
                title={tx("common.bekor_qilish")}
              >
                ✕
              </Button>
            </div>
            <form onSubmit={handleRejectVersionSubmit}>
              <div className="modal-body" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div
                  style={{
                    background: "var(--danger-soft)",
                    border: "1px solid var(--danger-border)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    fontSize: 12.5,
                    color: "var(--danger)",
                    lineHeight: 1.45,
                  }}
                >
                  Yangi TZ rad etiladi va amaldagi avvalgi TZ o'z kuchida qoladi.
                </div>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6, color: "var(--text)" }}>
                    Rad etish sababi <span style={{ color: "var(--danger)" }}>*</span>
                  </label>
                  <textarea
                    rows={4}
                    required
                    className="textarea"
                    placeholder="Nima sababdan ushbu TZ versiyasi rad etilayotganini yozing..."
                    value={rejectVersionReason}
                    onChange={(e) => setRejectVersionReason(e.target.value)}
                    style={{ width: "100%", resize: "vertical" }}
                  />
                </div>
              </div>
              <div className="modal-footer row between middle" style={{ padding: "14px 20px" }}>
                <Button
                  variant="ghost"
                  onClick={() => setRejectVersionModal(false)}
                  disabled={rejectVersionSubmitting}
                >
                  {tx("common.bekor_qilish")}
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  disabled={rejectVersionSubmitting || !rejectVersionReason.trim()}
                >
                  {rejectVersionSubmitting ? tx("common.rad_etilmoqda") : "✕ Rad etish"}
                </Button>
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
      {projectModalOpen && item && (
        <Suspense fallback={null}>
          <ProjectFormModal
            initialOrderId={item.id}
            initialOrder={item}
            onClose={() => setProjectModalOpen(false)}
            onSuccess={() => {
              setProjectModalOpen(false);
              void load();
              go("/loyihalar");
            }}
          />
        </Suspense>
      )}
      {distributeTasksModalOpen && item && (item.project || item.project_detail?.id) && (
        <Suspense fallback={null}>
          <DistributeTasksModal
            projectId={Number(item.project || item.project_detail?.id)}
            order={item}
            onClose={() => setDistributeTasksModalOpen(false)}
            onTasksUpdated={() => {
              void loadProjectTasks();
              void load();
            }}
          />
        </Suspense>
      )}
      {selectedTaskId && (
        <Suspense fallback={null}>
          <TaskDetailModal
            taskId={selectedTaskId}
            onClose={() => {
              setSelectedTaskId(null);
              void loadProjectTasks();
              void load();
            }}
          />
        </Suspense>
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
          background: "var(--overlay)",
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
            boxShadow: "var(--shadow-modal)",
            overflow: "hidden",
            background: "var(--canvas)",
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
              background: "var(--surface)",
              flexShrink: 0,
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
              <span className="badge badge-brand" style={{ fontSize: 13, fontWeight: 700 }}>
                {item.system_name}
              </span>
              {item.module && (
                <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
                  ({item.module})
                </span>
              )}
              {(item.version || 1) > 1 && (
                <span className="badge" style={{ fontSize: 11, fontWeight: 700 }}>
                  v{item.version}
                </span>
              )}
              <OrderStatusBadge status={item.status} label={item.status_display} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {orderActions}
              <Button iconOnly aria-label={tx("common.yopish")}
                variant="ghost" size="sm"
                onClick={onClose}
                title={tx("common.yopish")}
              >
                ✕
              </Button>
            </div>
          </div>

          {/* Modal Scrollable Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
            {mainView}
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
          <span className="row middle" style={{ gap: 8, display: "inline-flex", alignItems: "center" }}>
            <Link
              to="/buyurtmalar"
              className="muted"
              style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}
              onClick={(e) => e.stopPropagation()}
            >
              {tx("orders.buyurtmalarga_qaytish")}
            </Link>
            <span className="muted" style={{ opacity: 0.5 }}>/</span>
            <span className="badge badge-brand" style={{ fontSize: 12, fontWeight: 700 }}>
              {item.system_name}
            </span>
            {(item.version || 1) > 1 && (
              <span className="badge" style={{ fontSize: 11, fontWeight: 700 }}>
                v{item.version}
              </span>
            )}
            <OrderStatusBadge status={item.status} label={item.status_display} />
          </span>
        }
        actions={orderActions}
      />
      {mainView}
    </>
  );
}
