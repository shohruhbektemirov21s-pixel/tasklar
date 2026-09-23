/**
 * Axborot tizimiga o'zgartirish kiritish bo'yicha so'rovlar (Buyurtmalar / TZ) sahifasi.
 *
 * Asos: «AXBOROT TIZIMIGA O'ZGARTIRISH KIRITISH BO'YICHA SO'ROV BLANKASI» (Буюртма.docx).
 * - Sohaviy boshqarmalar: yangi TZ yaratish, loyihani tanlash, TZ faylini yuklash.
 * - Loyiha haqida ma'lumotlar: loyiha nomi, holati, PM, muddatlar, foiz va havolalar.
 * - Muhimlilik turi va qanchada tugashi: PM o'zi vaqtni va muddatni belgilaydi.
 * - Rasmiy Word (.docx) blanki va biriktirilgan TZ fayllarini yuklab olish.
 */
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { api, listOf, pagesOf, totalOf } from "@/api/client";

const ProjectFormModal = lazy(() => import("@/pages/ProjectForm"));
const DistributeTasksModal = lazy(() => import("@/components/DistributeTasksModal"));
import { claimOrder, uploadVersion, approveVersion, rejectVersion, deleteOrder, sendOrder, setPmDecision } from "@/api/orders";
import { DateField } from "@/components/dates";
import type { ChangeRequestItem, OrderStats, UserBrief } from "@/api/types";
import { useFetch } from "@/api/useFetch";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import {
  IconPaperclip,
  IconPlus,
  IconSearch,
} from "@/components/icons";
import { toEditOrder, toNewOrder, toOrder, useGo } from "@/nav";
import { useDebouncedLive } from "@/realtime/RealtimeContext";
import FilePreviewModal, { PreviewFile } from "@/components/FilePreviewModal";
import {
  ErrorMsg,
  fmtDate,
  fmtDateTime,
  Pager,
  timeAgo,
} from "@/components/ui";
import { tx } from "@/i18n";
const PER_PAGE = 15;
export { ORDER_TYPE_CONFIG, OrderTypeBadge, ORDER_STATUS_CONFIG, OrderStatusBadge } from "./orders/OrderBadges";
export { OrderProgressStepper } from "./orders/OrderProgressStepper";
import { OrderStatusBadge } from "./orders/OrderBadges";
import { KpiCardSkeleton, TableRowSkeleton } from "./orders/OrderSkeletons";
import { Button, LinkButton, buttonClass } from "@/components/Button";

export default function ChangeRequests() {
  const { user, meta } = useAuth();
  const go = useGo();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [periodFilter, setPeriodFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [deadlineFilter, setDeadlineFilter] = useState<string>("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const [activeActionMenuId, setActiveActionMenuId] = useState<number | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const handleClickOutside = () => setActiveActionMenuId(null);
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);
  const [viewingItem, setViewingItem] = useState<ChangeRequestItem | null>(null);
  const [projectModalItem, setProjectModalItem] = useState<ChangeRequestItem | null>(null);
  const [distributeModalItem, setDistributeModalItem] = useState<ChangeRequestItem | null>(null);
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [pmDecisionForm, setPmDecisionForm] = useState<{
    status: ChangeRequestItem["status"];
    pm_estimated_duration: string;
    pm_deadline: string;
    pm_notes: string;
    assigned_developer: number | null;
  }>({
    status: "ACCEPTED",
    pm_estimated_duration: "",
    pm_deadline: "",
    pm_notes: "",
    assigned_developer: null,
  });
  const [pmSaveLoading, setPmSaveLoading] = useState(false);
  const [pmSaveError, setPmSaveError] = useState<string | null>(null);
  const [pmSaveSuccess, setPmSaveSuccess] = useState<string | null>(null);
  const { data, error, loading, reload } = useFetch<{ count: number; results: ChangeRequestItem[] } | ChangeRequestItem[]>(
    "/orders/",
    {
      page,
      page_size: PER_PAGE,
      search: debouncedSearch || undefined,
      status: statusFilter || undefined,
      priority: priorityFilter || undefined,
      period: periodFilter || undefined,
      order_type: typeFilter || undefined,
      deadline: deadlineFilter || undefined,
      department: departmentFilter || undefined,
    }
  );
  const { data: statsData, loading: statsLoading } = useFetch<OrderStats>("/orders/stats/");
  useDebouncedLive((e) => {
    if (
      e.event === "notification" ||
      e.event === "order.create" ||
      e.event === "order.update" ||
      e.event === "order.delete"
    ) {
      reload();
    }
  }, 800);
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  const { data: usersData } = useFetch<{ count: number; results: UserBrief[] } | UserBrief[]>("/users/", { is_active: true, page_size: 200 });
  const items: ChangeRequestItem[] = useMemo(() => (data ? listOf<ChangeRequestItem>(data) : []), [data]);
  const displayItems = items;
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
  const total = totalOf(data);
  const pages = pagesOf(data, PER_PAGE);
  const isPMOrAdmin = Boolean(
    user?.is_platform_admin ||
    user?.is_boss ||
    user?.is_manager ||
    user?.global_role === "MANAGER" ||
    user?.specialty === "PM"
  );
  const canAccess = Boolean(
    user?.can_access_orders ||
    user?.is_sohaviy_boshqarma ||
    user?.is_platform_admin ||
    user?.is_manager ||
    user?.is_boss
  );
  const isSohaviyOrAdmin = Boolean(
    user?.is_sohaviy_boshqarma ||
    user?.is_platform_admin ||
    user?.is_boss
  );
  const [completionModalItem, setCompletionModalItem] = useState<ChangeRequestItem | null>(null);
  const [completionFile, setCompletionFile] = useState<File | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [completionSubmitting, setCompletionSubmitting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [rejectModalItem, setRejectModalItem] = useState<ChangeRequestItem | null>(null);
  const [rejectFeedbackNote, setRejectFeedbackNote] = useState("");
  const [rejectFeedbackFile, setRejectFeedbackFile] = useState<File | null>(null);
  const [rejectIsNewTz, setRejectIsNewTz] = useState(false);
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [uploadVersionModalItem, setUploadVersionModalItem] = useState<ChangeRequestItem | null>(null);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionChangeNote, setVersionChangeNote] = useState("");
  const [versionRequestedChange, setVersionRequestedChange] = useState("");
  const [versionSubmitting, setVersionSubmitting] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const handleOpenUploadVersion = (item: ChangeRequestItem) => {
    if (item.status === "READY_FOR_REVIEW") {
      alert(
        tx(
          "orders.pm_yakunlagan_yangi_tz_mumkin_emas",
          undefined,
          "Loyiha menejeri ishni yakunlab topshirgan (boshqarma tasdig'ida). Yangi TZ yuborishdan oldin ishni qabul qiling yoki kamchilik bilan qaytaring."
        )
      );
      return;
    }
    if (item.status === "NEW") {
      alert(
        tx(
          "orders.tz_birinchisi_tasdiqlanmaguncha_yuklash_mumkin_emas",
          undefined,
          "Buyurtmaning 1-chi TZsi tasdiqlanmaguncha 2-chi TZ yuborib bo'lmaydi. Avval 1-TZ ko'rib chiqilishi kerak."
        )
      );
      return;
    }
    if (item.has_pending_version) {
      alert(
        tx(
          "orders.yangi_tz_tasdiqlanmaguncha",
          undefined,
          "Yangi TZ versiyasi tasdiqlanmaguncha yoki rad etilmaguncha, boshqa versiya yuklay olmaysiz."
        )
      );
      return;
    }
    setUploadVersionModalItem(item);
    setVersionFile(null);
    setVersionChangeNote("");
    setVersionRequestedChange(item.requested_change || "");
    setVersionError(null);
  };
  const handleUploadVersionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadVersionModalItem) return;
    if (!versionFile) {
      setVersionError(tx("orders.err_select_new_tz"));
      return;
    }
    if (!versionChangeNote.trim()) {
      setVersionError(tx("orders.err_enter_change_note"));
      return;
    }
    setVersionSubmitting(true);
    setVersionError(null);
    try {
      const fd = new FormData();
      fd.append("tz_file", versionFile);
      fd.append("change_note", versionChangeNote.trim());
      if (versionRequestedChange.trim()) {
        fd.append("requested_change", versionRequestedChange.trim());
      }
      const updated = await uploadVersion(uploadVersionModalItem.id, fd);
      reload();
      if (viewingItem && viewingItem.id === updated.id) {
        setViewingItem(updated);
      }
      setUploadVersionModalItem(null);
      alert(tx("orders.version_uploaded_success"));
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? String(err.message) : tx("orders.err_upload_version");
      setVersionError(msg);
    } finally {
      setVersionSubmitting(false);
    }
  };
  const [approveVersionModalItem, setApproveVersionModalItem] = useState<ChangeRequestItem | null>(null);
  const [approveVersionTarget, setApproveVersionTarget] = useState<number | null>(null);
  const [approveDecisionNote, setApproveDecisionNote] = useState("");
  const [approveEstimatedDuration, setApproveEstimatedDuration] = useState("");
  const [approveDeadline, setApproveDeadline] = useState("");
  const [approveDeveloper, setApproveDeveloper] = useState<number | null>(null);
  const [approveSubmitting, setApproveSubmitting] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const handleOpenApproveVersion = (item: ChangeRequestItem, verNum?: number) => {
    setApproveVersionModalItem(item);
    setApproveVersionTarget(verNum || item.pending_version?.version || null);
    setApproveDecisionNote("");
    setApproveEstimatedDuration(item.pm_estimated_duration || "");
    setApproveDeadline(item.pm_deadline || "");
    setApproveDeveloper(item.assigned_developer || null);
    setApproveError(null);
  };
  const handleApproveVersionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approveVersionModalItem) return;
    setApproveSubmitting(true);
    setApproveError(null);
    try {
      const updated = await approveVersion(approveVersionModalItem.id, {
        version: approveVersionTarget || undefined,
        decision_note: approveDecisionNote.trim(),
        pm_estimated_duration: approveEstimatedDuration.trim() || undefined,
        pm_deadline: approveDeadline || undefined,
        assigned_developer: approveDeveloper,
      });
      reload();
      if (viewingItem && viewingItem.id === updated.id) {
        setViewingItem(updated);
      }
      setApproveVersionModalItem(null);
      alert(tx("orders.version_approved_success"));
    } catch (err: unknown) {
      setApproveError((err as { message?: string })?.message || tx("orders.err_approve_version"));
    } finally {
      setApproveSubmitting(false);
    }
  };
  const [rejectVersionModalItem, setRejectVersionModalItem] = useState<ChangeRequestItem | null>(null);
  const [rejectVersionTarget, setRejectVersionTarget] = useState<number | null>(null);
  const [rejectVersionReason, setRejectVersionReason] = useState("");
  const [rejectVersionSubmitting, setRejectVersionSubmitting] = useState(false);
  const [rejectVersionError, setRejectVersionError] = useState<string | null>(null);
  const handleOpenRejectVersion = (item: ChangeRequestItem, verNum?: number) => {
    setRejectVersionModalItem(item);
    setRejectVersionTarget(verNum || item.pending_version?.version || null);
    setRejectVersionReason("");
    setRejectVersionError(null);
  };
  const handleRejectVersionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectVersionModalItem) return;
    if (!rejectVersionReason.trim()) {
      setRejectVersionError(tx("orders.rad_etish_sababi_majburiy"));
      return;
    }
    setRejectVersionSubmitting(true);
    setRejectVersionError(null);
    try {
      const updated = await rejectVersion(rejectVersionModalItem.id, {
        version: rejectVersionTarget || undefined,
        decision_note: rejectVersionReason.trim(),
      });
      reload();
      if (viewingItem && viewingItem.id === updated.id) {
        setViewingItem(updated);
      }
      setRejectVersionModalItem(null);
      alert(tx("orders.version_rejected_success"));
    } catch (err: unknown) {
      setRejectVersionError((err as { message?: string })?.message || tx("orders.err_reject_version"));
    } finally {
      setRejectVersionSubmitting(false);
    }
  };
  const [claimModalItem, setClaimModalItem] = useState<ChangeRequestItem | null>(null);
  const [claimStartDate, setClaimStartDate] = useState("");
  const [claimAssignedPm, setClaimAssignedPm] = useState<number | "">("");
  const [claimDeadline, setClaimDeadline] = useState("");
  const [claimNotes, setClaimNotes] = useState("");
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const claimingId = claimSubmitting && claimModalItem ? claimModalItem.id : null;
  const handleOpenClaim = (item: ChangeRequestItem) => {
    setClaimModalItem(item);
    setClaimStartDate(item.pm_start_date || "");
    setClaimAssignedPm(item.assigned_pm || "");
    setClaimDeadline(item.pm_deadline || item.due_date || "");
    setClaimNotes("");
  };
  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimModalItem) return;
    const today = new Date().toLocaleDateString("en-CA");
    if (claimStartDate && claimStartDate < today) {
      alert("Boshlanish sanasi bugungi kundan oldin bo'lishi mumkin emas.");
      return;
    }
    if (claimDeadline && claimDeadline < today) {
      alert("Topshirish sanasi bugungi kundan oldin bo'lishi mumkin emas.");
      return;
    }
    if (claimStartDate && claimDeadline && claimDeadline < claimStartDate) {
      alert("Topshirish muddati boshlanish sanasidan oldin bo'lishi mumkin emas.");
      return;
    }
    setClaimSubmitting(true);
    try {
      const updated = await claimOrder(claimModalItem.id, {
        pm_start_date: claimStartDate || undefined,
        assigned_pm: claimAssignedPm || undefined,
        pm_deadline: claimDeadline || undefined,
        pm_notes: claimNotes.trim() || undefined,
      });
      if (viewingItem && viewingItem.id === claimModalItem.id) {
        setViewingItem(updated);
      }
      setClaimModalItem(null);
      reload();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : tx("orders.err_claim_order"));
    } finally {
      setClaimSubmitting(false);
    }
  };
  const handleClaimReject = async () => {
    if (!claimModalItem) return;
    const reason = claimNotes.trim();
    if (!reason) {
      alert("Buyurtmani orqaga qaytarish uchun sabab yoki izohni (PM izohi maydonida) yozing!");
      return;
    }
    setClaimSubmitting(true);
    try {
      const updated = await setPmDecision(claimModalItem.id, {
        status: "REJECTED",
        pm_notes: reason,
      });
      if (viewingItem && viewingItem.id === claimModalItem.id) {
        setViewingItem(updated);
      }
      setClaimModalItem(null);
      reload();
      alert("Buyurtma orqaga qaytarildi (rad etildi).");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Buyurtmani orqaga qaytarishda xatolik yuz berdi.");
    } finally {
      setClaimSubmitting(false);
    }
  };
  const handleClaimOrder = (item: ChangeRequestItem) => {
    handleOpenClaim(item);
  };
  const handleOpenView = (item: ChangeRequestItem) => {
    go(toOrder(item.id));
  };
  const canEditOrder = (item: ChangeRequestItem) => {
    if (item.status !== "DRAFT") return false;
    const isSohaviyUser = Boolean(
      user?.is_sohaviy_boshqarma ||
      user?.specialty === "SOHAVIY" ||
      user?.global_role === "SOHAVIY"
    );
    if (user?.is_platform_admin || user?.is_boss || isSohaviyUser) return true;
    if (typeof item.can_edit === "boolean") return item.can_edit;
    return Boolean(!item.created_by || item.created_by === user?.id);
  };
  const canDeleteOrder = (item: ChangeRequestItem) => {
    if (item.status !== "DRAFT") return false;
    const isSohaviyUser = Boolean(
      user?.is_sohaviy_boshqarma ||
      user?.specialty === "SOHAVIY" ||
      user?.global_role === "SOHAVIY"
    );
    if (user?.is_platform_admin || user?.is_boss || isSohaviyUser) return true;
    if (typeof item.can_delete === "boolean") return item.can_delete;
    return Boolean(!item.created_by || item.created_by === user?.id);
  };
  const handleSendOrder = async (item: ChangeRequestItem) => {
    if (!window.confirm(`${tx("orders.send_order_confirm_desc")} ${item.id}`)) {
      return;
    }
    try {
      await sendOrder(item.id);
      reload();
    } catch (err: unknown) {
      alert((err as Error)?.message || tx("orders.err_send_order"));
    }
  };
  const handleDeleteOrder = async (item: ChangeRequestItem) => {
    if (!window.confirm(`${tx("orders.delete_order_confirm")} ${item.id}`)) {
      return;
    }
    try {
      await deleteOrder(item.id);
      reload();
    } catch (err: unknown) {
      alert((err as Error)?.message || tx("orders.err_delete_order"));
    }
  };
  const handleSavePMDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingItem) return;
    if (pmDecisionForm.status === "REJECTED" && !pmDecisionForm.pm_notes.trim()) {
      setPmSaveError(tx("orders.rad_etish_sababi_majburiy"));
      return;
    }
    setPmSaveLoading(true);
    setPmSaveError(null);
    setPmSaveSuccess(null);
    try {
      const updated = await api.post<ChangeRequestItem>(
        `/orders/${viewingItem.id}/set-pm-decision/`,
        pmDecisionForm
      );
      setViewingItem(updated);
      setPmSaveSuccess(tx("orders.pm_decision_saved"));
      reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : tx("orders.err_save_pm_decision");
      setPmSaveError(msg);
    } finally {
      setPmSaveLoading(false);
    }
  };
  const handleSubmitCompletion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completionModalItem) return;
    setCompletionSubmitting(true);
    setCompletionError(null);
    try {
      const formData = new FormData();
      if (completionFile) {
        formData.append("completion_file", completionFile);
      }
      if (completionNote.trim()) {
        formData.append("completion_note", completionNote.trim());
      }
      const updated = await api.post<ChangeRequestItem>(
        `/orders/${completionModalItem.id}/submit-completion/`,
        formData
      );
      if (viewingItem && viewingItem.id === completionModalItem.id) {
        setViewingItem(updated);
      }
      setCompletionModalItem(null);
      setCompletionFile(null);
      setCompletionNote("");
      reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : tx("orders.err_submit_completion");
      setCompletionError(msg);
    } finally {
      setCompletionSubmitting(false);
    }
  };
  const handleClientApprove = async (item: ChangeRequestItem) => {
    if (
      !window.confirm(
        `${tx("orders.client_approve_confirm")} ${item.id}`
      )
    ) {
      return;
    }
    setApprovingId(item.id);
    try {
      const updated = await api.post<ChangeRequestItem>(
        `/orders/${item.id}/client-approve/`,
        {}
      );
      if (viewingItem && viewingItem.id === item.id) {
        setViewingItem(updated);
      }
      reload();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : tx("orders.err_approve"));
    } finally {
      setApprovingId(null);
    }
  };
  const handleClientReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalItem) return;
    if (!rejectFeedbackNote.trim() && !rejectFeedbackFile) {
      setRejectError(tx("orders.err_reject_feedback_required"));
      return;
    }
    setRejectSubmitting(true);
    setRejectError(null);
    try {
      const formData = new FormData();
      if (rejectFeedbackNote.trim()) {
        formData.append("feedback_note", rejectFeedbackNote.trim());
      }
      if (rejectFeedbackFile) {
        formData.append("feedback_file", rejectFeedbackFile);
      }
      if (rejectIsNewTz) {
        formData.append("is_new_tz", "true");
      }
      const updated = await api.post<ChangeRequestItem>(
        `/orders/${rejectModalItem.id}/client-reject-completion/`,
        formData
      );
      if (viewingItem && viewingItem.id === rejectModalItem.id) {
        setViewingItem(updated);
      }
      setRejectModalItem(null);
      setRejectFeedbackNote("");
      setRejectFeedbackFile(null);
      setRejectIsNewTz(false);
      reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : tx("orders.qaytarishda_xatolik");
      setRejectError(msg);
    } finally {
      setRejectSubmitting(false);
    }
  };
  if (user && !canAccess) {
    return (
      <div className="card" style={{ maxWidth: 640, margin: "60px auto", padding: 36, textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🏛️</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{tx("orders.ruxsat_cheklangan")}</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.6, marginBottom: 24, fontSize: 14 }}>
          {tx("orders.ruxsat_cheklangan_izoh")}
        </p>
        <LinkButton to="/panel" variant="primary">
          {tx("common.bosh_sahifa")}
        </LinkButton>
      </div>
    );
  }
  const isPM = Boolean(
    (user?.is_manager || user?.global_role === "MANAGER" || user?.specialty === "PM") &&
    !user?.is_sohaviy_boshqarma &&
    !user?.is_platform_admin &&
    !user?.is_boss
  );
  const canCreateOrder = !isPM;
  return (
    <>
      <PageHead
        title={
          <span className="row middle" style={{ gap: 10 }}>
            <strong>{tx("orders.sarlavha")}</strong>
          </span>
        }
        actions={
          canCreateOrder ? (
            <Button
              variant="primary"
              onClick={() => go(toNewOrder())}
            >
              <IconPlus size={16} /> {tx("orders.yangi_buyurtma")}
            </Button>
          ) : undefined
        }
      />
      <div className="content">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
            marginBottom: 20,
          }}
        >
          {statsLoading ? (
            Array.from({ length: 5 }).map((_, i) => <KpiCardSkeleton key={i} />)
          ) : (
            <>
              {/* 1. Barcha / Jami */}
              <div
                onClick={() => {
                  setStatusFilter("");
                  setPage(1);
                }}
                style={{
                  background: "var(--surface)",
                  border: !statusFilter ? "2px solid var(--primary)" : "1px solid var(--border)",
                  borderRadius: 14,
                  padding: "16px 18px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  boxShadow: !statusFilter ? "var(--shadow-md)" : "var(--shadow-sm)",
                  transition: "all 0.15s ease",
                }}
                title={tx("orders.kpi_barcha")}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "var(--primary-soft)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", fontWeight: 500, marginBottom: 4 }}>
                    {tx("orders.jami_sorovlar")}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 750, color: "var(--text)", lineHeight: 1 }}>
                    {statsData?.total ?? total}
                  </div>
                </div>
              </div>

              {/* 2. Yangi */}
              <div
                onClick={() => {
                  setStatusFilter("NEW");
                  setPage(1);
                }}
                style={{
                  background: "var(--surface)",
                  border: statusFilter === "NEW" ? "2px solid var(--primary)" : "1px solid var(--border)",
                  borderRadius: 14,
                  padding: "16px 18px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  boxShadow: statusFilter === "NEW" ? "var(--shadow-md)" : "var(--shadow-sm)",
                  transition: "all 0.15s ease",
                }}
                title={tx("orders.kpi_yangi")}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "var(--primary-soft)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 22h14" />
                    <path d="M5 2h14" />
                    <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
                    <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", fontWeight: 500, marginBottom: 4 }}>
                    {tx("orders.yangi")}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 750, color: "var(--text)", lineHeight: 1 }}>
                    {statsData?.new ?? 0}
                  </div>
                </div>
              </div>

              {/* 3. Jarayonda */}
              <div
                onClick={() => {
                  setStatusFilter("IN_PROGRESS");
                  setPage(1);
                }}
                style={{
                  background: "var(--surface)",
                  border: statusFilter === "IN_PROGRESS" ? "2px solid #EA580C" : "1px solid var(--border)",
                  borderRadius: 14,
                  padding: "16px 18px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  boxShadow: statusFilter === "IN_PROGRESS" ? "var(--shadow-md)" : "var(--shadow-sm)",
                  transition: "all 0.15s ease",
                }}
                title={tx("orders.kpi_jarayonda")}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "#FFF7ED",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", fontWeight: 500, marginBottom: 4 }}>
                    {tx("orders.jarayonda")}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 750, color: "var(--text)", lineHeight: 1 }}>
                    {(statsData?.in_progress_strict ?? 0) || (statsData?.in_progress ?? 0)}
                  </div>
                </div>
              </div>

              {/* 4. Bajarilgan */}
              <div
                onClick={() => {
                  setStatusFilter("COMPLETED");
                  setPage(1);
                }}
                style={{
                  background: "var(--surface)",
                  border: statusFilter === "COMPLETED" ? "2px solid #059669" : "1px solid var(--border)",
                  borderRadius: 14,
                  padding: "16px 18px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  boxShadow: statusFilter === "COMPLETED" ? "var(--shadow-md)" : "var(--shadow-sm)",
                  transition: "all 0.15s ease",
                }}
                title={tx("orders.kpi_bajarilgan")}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "#ECFDF5",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", fontWeight: 500, marginBottom: 4 }}>
                    {tx("orders.tugallangan")}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 750, color: "var(--text)", lineHeight: 1 }}>
                    {statsData?.completed ?? 0}
                  </div>
                </div>
              </div>

              {/* 5. Rad etilgan */}
              <div
                onClick={() => {
                  setStatusFilter("REJECTED");
                  setPage(1);
                }}
                style={{
                  background: "var(--surface)",
                  border: statusFilter === "REJECTED" ? "2px solid #DC2626" : "1px solid var(--border)",
                  borderRadius: 14,
                  padding: "16px 18px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  boxShadow: statusFilter === "REJECTED" ? "var(--shadow-md)" : "var(--shadow-sm)",
                  transition: "all 0.15s ease",
                }}
                title={tx("orders.kpi_bekor_qilingan")}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "#FEF2F2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", fontWeight: 500, marginBottom: 4 }}>
                    {tx("orders.bekor_qilingan")}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 750, color: "var(--text)", lineHeight: 1 }}>
                    {statsData?.rejected ?? 0}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "12px 16px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            boxShadow: "var(--shadow)",
          }}
        >
          <div style={{ position: "relative", flex: 1.5, minWidth: 260 }}>
            <div
              style={{
                position: "absolute",
                left: 14,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--muted)",
                pointerEvents: "none",
                display: "flex",
                alignItems: "center",
              }}
            >
              <IconSearch size={16} />
            </div>
            <input
              type="text"
              placeholder={tx("orders.search_placeholder")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              style={{
                width: "100%",
                paddingLeft: 38,
                paddingRight: search ? 34 : 14,
                height: 42,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--canvas-inset, var(--surface-2))",
                fontSize: 13,
                boxSizing: "border-box",
                color: "var(--text)",
              }}
            />
            {search && (
              <button
                type="button"
                className="input-clear"
                onClick={() => setSearch("")}
                title={tx("orders.qidiruvni_tozalash")}
                aria-label={tx("orders.qidiruvni_tozalash")}
              >
                ✕
              </button>
            )}
          </div>
          <div style={{ position: "relative", minWidth: 160 }}>
            <select
              value={periodFilter}
              onChange={(e) => {
                setPeriodFilter(e.target.value);
                setPage(1);
              }}
              style={{
                width: "100%",
                height: 42,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                fontSize: 13,
                padding: "0 34px 0 14px",
                cursor: "pointer",
                appearance: "none",
                color: "var(--text)",
                fontWeight: 500,
              }}
            >
              <option value="">{tx("orders.barcha_davrlar")}</option>
              <option value="this_month">{tx("orders.shu_oy")}</option>
              <option value="last_month">{tx("orders.otgan_oy")}</option>
              <option value="6_months">{tx("orders.olti_oylik")}</option>
              <option value="1_year">{tx("orders.bir_yillik")}</option>
            </select>
            <span
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                color: "#64748b",
                display: "flex",
                alignItems: "center",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </div>
          <div style={{ position: "relative", minWidth: 160 }}>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              style={{
                width: "100%",
                height: 42,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                fontSize: 13,
                padding: "0 34px 0 14px",
                cursor: "pointer",
                appearance: "none",
                color: "var(--text)",
                fontWeight: 500,
              }}
            >
              <option value="">{tx("orders.barcha_holatlar", undefined, "Barcha holatlar")}</option>
              <option value="NEW">{tx("orders.status_yangi", undefined, "Yangi")}</option>
              <option value="ACCEPTED">{tx("orders.status_qabul_qilindi", undefined, "Qabul qilindi")}</option>
              <option value="REJECTED">{tx("orders.status_rad_etildi", undefined, "Rad etildi")}</option>
            </select>
            <span
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                color: "#64748b",
                display: "flex",
                alignItems: "center",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </div>
          {Boolean(meta?.order_type && meta.order_type.length > 0) && (
            <div style={{ position: "relative", minWidth: 160 }}>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: "100%",
                  height: 42,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  fontSize: 13,
                  padding: "0 34px 0 14px",
                  cursor: "pointer",
                  appearance: "none",
                  color: "var(--text)",
                  fontWeight: 500,
                }}
              >
                <option value="">{tx("orders.barcha_turlar")}</option>
                {meta?.order_type
                  ?.filter((t) => t.value === "NEW" || t.value === "CONTINUATION" || t.value === "NEEDS_CLASSIFICATION")
                  .map((t) => (
                    <option key={String(t.value)} value={String(t.value)}>
                      {t.label}
                    </option>
                  ))}
              </select>
              <span
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                  color: "#64748b",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </div>
          )}
          {Boolean(meta?.order_priority && meta.order_priority.length > 0) && (
            <div style={{ position: "relative", minWidth: 150 }}>
              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: "100%",
                  height: 42,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  fontSize: 13,
                  padding: "0 34px 0 14px",
                  cursor: "pointer",
                  appearance: "none",
                  color: "var(--text)",
                  fontWeight: 500,
                }}
              >
                <option value="">{tx("orders.barcha_muhimlik")}</option>
                {meta?.order_priority?.map((p) => (
                  <option key={String(p.value)} value={String(p.value)}>
                    {p.label}
                  </option>
                ))}
              </select>
              <span
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                  color: "#64748b",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </div>
          )}
          {Boolean(isPMOrAdmin && meta?.departments && meta.departments.length > 0) && (
            <div style={{ position: "relative", minWidth: 180 }}>
              <select
                value={departmentFilter}
                onChange={(e) => {
                  setDepartmentFilter(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: "100%",
                  height: 42,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  fontSize: 13,
                  padding: "0 34px 0 14px",
                  cursor: "pointer",
                  appearance: "none",
                  color: "var(--text)",
                  fontWeight: 500,
                }}
              >
                <option value="">{tx("orders.barcha_boshqarmalar")}</option>
                {meta?.departments?.map((dept) => (
                  <option key={dept.id} value={dept.name}>
                    {dept.name}
                  </option>
                ))}
              </select>
              <span
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                  color: "#64748b",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </div>
          )}
          <Button
            iconOnly
            title={tx("common.filtrni_tozalash")}
            aria-label={tx("common.filtrni_tozalash")}
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setPeriodFilter("");
              setDeadlineFilter("");
              setTypeFilter("");
              setPriorityFilter("");
              setDepartmentFilter("");
              setPage(1);
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
          </Button>
        </div>
        {error && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 12,
              padding: "16px 20px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22 }}>⚠️</span>
              <div>
                <div style={{ fontWeight: 700, color: "#991b1b", fontSize: 13.5 }}>
                  {tx("orders.err_loading_data")}
                </div>
                <div style={{ color: "#b91c1c", fontSize: 12.5, marginTop: 2 }}>
                  {error ? String(error) : ""}
                </div>
              </div>
            </div>
            <Button variant="danger"
              
              onClick={() => reload()}
            >
              {`🔄 ${tx("orders.qayta_urinish")}`}
            </Button>
          </div>
        )}
        {loading || displayItems.length > 0 ? (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              overflow: "hidden",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div
              className="table-wrap"
              style={{
                overflowX: "auto",
                minHeight: displayItems.length <= 3 ? 240 : undefined,
                paddingBottom: displayItems.length <= 2 ? 60 : 12,
              }}
            >
              <table className="table" style={{ margin: 0, width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ width: 44, textAlign: "center", padding: "12px 14px", fontSize: 12, fontWeight: 650, color: "var(--muted)" }}>№</th>
                    <th style={{ padding: "12px 14px", fontSize: 12, fontWeight: 650, color: "var(--muted)" }}>{tx("dashboard.axborot_tizimi", undefined, "Axborot tizimi")}</th>
                    <th style={{ padding: "12px 14px", fontSize: 12, fontWeight: 650, color: "var(--muted)" }}>{tx("dashboard.talab_mazmuni", undefined, "Talab mazmuni")}</th>
                    <th style={{ padding: "12px 14px", fontSize: 12, fontWeight: 650, color: "var(--muted)" }}>{tx("dashboard.muddati", undefined, "Muddati")}</th>
                    <th style={{ padding: "12px 14px", fontSize: 12, fontWeight: 650, color: "var(--muted)" }}>{tx("dashboard.holati", undefined, "Holati")}</th>
                    <th style={{ padding: "12px 14px", fontSize: 12, fontWeight: 650, color: "var(--muted)" }}>{tx("dashboard.masul_pm", undefined, "Mas'ul PM")}</th>
                    <th style={{ padding: "12px 14px", fontSize: 12, fontWeight: 650, color: "var(--muted)" }}>{tx("dashboard.sanasi", undefined, "Sanasi")}</th>
                    <th style={{ width: 70, textAlign: "right", padding: "12px 14px", fontSize: 12, fontWeight: 650, color: "var(--muted)" }}>{tx("common.korish", undefined, "Ko'rish")}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRowSkeleton key={i} rowNum={i + 1} />
                    ))
                  ) : (
                    displayItems.map((item, idx) => {
                      const rowNum = (page - 1) * PER_PAGE + idx + 1;
                    return (
                      <tr
                        key={item.id}
                        className="clickable"
                        style={{
                          borderBottom: "1px solid var(--border-muted)",
                          cursor: "pointer",
                          transition: "background 0.12s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--surface-2)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                        onClick={() => handleOpenView(item)}
                      >
                        <td style={{ textAlign: "center", fontWeight: 600, fontSize: 13, color: "var(--muted)", padding: "14px" }}>
                          {rowNum}
                        </td>
                        <td style={{ padding: "14px", whiteSpace: "nowrap" }}>
                          <div style={{ fontWeight: 650, fontSize: 13.5, color: "var(--text)" }}>
                            {item.project_detail?.name || item.system_name || "—"}
                          </div>
                          {item.module && (
                            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                              {item.module}
                            </div>
                          )}
                        </td>
                        <td style={{ maxWidth: 300, padding: "14px" }}>
                          <div
                            style={{
                              fontSize: 13,
                              color: "var(--text)",
                              lineHeight: 1.4,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                            }}
                            title={item.requested_change || item.current_state || ""}
                          >
                            {item.requested_change || item.current_state || "—"}
                          </div>
                        </td>
                        <td style={{ padding: "14px", whiteSpace: "nowrap", fontSize: 12.5, color: "var(--muted)" }}>
                          {item.pm_deadline || item.due_date ? (
                            fmtDate(item.pm_deadline || item.due_date)
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td style={{ padding: "14px", whiteSpace: "nowrap" }}>
                          <OrderStatusBadge
                            status={item.status}
                            label={item.status_display}
                            hasPendingVersion={Boolean(item.has_pending_version)}
                          />
                        </td>
                        <td style={{ padding: "14px", whiteSpace: "nowrap" }}>
                          {item.assigned_pm_name ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: "50%",
                                  background: "var(--surface-3)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: "var(--text)",
                                }}
                              >
                                {item.assigned_pm_name.slice(0, 2).toUpperCase()}
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                                {item.assigned_pm_name}
                              </span>
                            </div>
                          ) : (
                            <span className="muted" style={{ fontSize: 12.5 }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "14px", whiteSpace: "nowrap", fontSize: 12.5, color: "var(--muted)" }}>
                          {fmtDate(item.created_at || item.request_date)}
                        </td>
                        <td style={{ textAlign: "right", padding: "14px" }} onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => handleOpenView(item)}
                            title={tx("orders.batafsil_korish", undefined, "Batafsil ko'rish")}
                          >
                            {tx("common.korish", undefined, "Ko'rish")}
                          </Button>
                        </td>
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </div>
            {!loading && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 20px",
                  background: "#fff",
                  borderTop: "1px solid #f1f5f9",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  {tx("orders.jami_ta_buyurtma", { n: total })}
                </div>
                {pages > 1 && <Pager page={page} pages={pages} onPick={setPage} />}
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: "48px 24px",
              textAlign: "center",
              boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
            }}
          >
            {search || statusFilter || periodFilter || deadlineFilter || typeFilter || priorityFilter || departmentFilter ? (
              <>
                <div style={{ fontSize: 44, marginBottom: 12 }}>🔍</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
                  {tx("orders.mos_topilmadi")}
                </div>
                <p style={{ color: "#64748b", fontSize: 13.5, maxWidth: 460, margin: "0 auto 20px" }}>
                  {tx("orders.mos_topilmadi_matn")}
                </p>
                <Button
                  
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("");
                    setPeriodFilter("");
                    setDeadlineFilter("");
                    setTypeFilter("");
                    setPriorityFilter("");
                    setDepartmentFilter("");
                    setPage(1);
                  }}
                >
                  {tx("common.tozalash")}
                </Button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 44, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>
                  {tx("orders.bosh_holat")}
                </div>
                {canCreateOrder && (
                  <Button
                    variant="primary"
                    onClick={() => go(toNewOrder())}
                  >
                    <IconPlus size={16} /> {tx("orders.yangi_buyurtma")}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {claimModalItem && (
        <div className="modal-overlay" onClick={() => !claimSubmitting && setClaimModalItem(null)}>
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
                    background: "rgba(16, 185, 129, 0.14)",
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
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", lineHeight: 1.3 }}>
                    {claimModalItem.assigned_pm && (user?.is_platform_admin || user?.is_boss)
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
                      {claimModalItem.id}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>•</span>
                    <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
                      {claimModalItem.project_detail?.name || claimModalItem.system_name}
                    </span>
                  </div>
                </div>
              </div>
              <Button aria-label={tx("common.bekor_qilish")} iconOnly
                variant="ghost" size="xs"
                onClick={() => setClaimModalItem(null)}
                disabled={claimSubmitting}
                title={tx("common.bekor_qilish")}
              >
                ✕
              </Button>
            </div>
            <form onSubmit={handleClaimSubmit}>
              <div className="modal-body" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                {claimModalItem.due_date && (
                  <div
                    style={{
                      background: "var(--attention-soft)",
                      border: "1px solid rgba(251, 191, 36, 0.3)",
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
                      <strong style={{ color: "var(--text)" }}>{fmtDate(claimModalItem.due_date)}</strong>
                    </div>
                    <Button
                      variant="link" size="xs"
                      onClick={() => {
                        const d = claimModalItem.due_date?.split("T")[0];
                        if (d) setClaimDeadline(d);
                      }}
                    >
                      {tx("orders.claim_use_client_date")}
                    </Button>
                  </div>
                )}
                {(user?.is_platform_admin || user?.is_boss) && (
                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <label style={{ fontWeight: 600, fontSize: 12.5, color: "var(--text)", display: "block", marginBottom: 6 }}>
                      Biriktirilgan hodim (PM)
                    </label>
                    <select
                      className="input"
                      value={claimAssignedPm}
                      onChange={(e) => setClaimAssignedPm(e.target.value ? Number(e.target.value) : "")}
                      style={{ width: "100%" }}
                    >
                      <option value="">(O'zingizga olish)</option>
                      {pmList.map((u: UserBrief) => (
                        <option key={u.id} value={u.id}>{u.full_name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12.5, color: "var(--text)", display: "block", marginBottom: 6 }}>
                    {tx("orders.boshlanish_sanasi", undefined, "Boshlanish sanasi")}
                  </label>
                  <DateField
                    value={claimStartDate}
                    min={new Date().toLocaleDateString("en-CA")}
                    onChange={(v) => {
                      setClaimStartDate(v);
                      if (v && claimDeadline && claimDeadline < v) {
                        setClaimDeadline(v);
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
                    min={claimStartDate && claimStartDate > new Date().toLocaleDateString("en-CA")
                      ? claimStartDate
                      : new Date().toLocaleDateString("en-CA")}
                    value={claimDeadline}
                    onChange={(v) => {
                      if (v && claimStartDate && v < claimStartDate) {
                        setClaimDeadline(claimStartDate);
                      } else {
                        setClaimDeadline(v);
                      }
                    }}
                    style={{ width: "100%" }}
                  />
                </div>

                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6, color: "var(--text)" }}>
                    {tx("orders.claim_notes_label")}
                  </label>
                  <textarea
                    rows={3}
                    className="textarea"
                    placeholder={tx("orders.claim_notes_placeholder")}
                    value={claimNotes}
                    onChange={(e) => setClaimNotes(e.target.value)}
                    style={{ width: "100%", resize: "vertical" }}
                  />
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                    {tx("orders.claim_notes_hint")}
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
                <div className="row middle" style={{ gap: 8, flexWrap: "wrap" }}>
                  <Button
                    variant="ghost"
                    onClick={() => setClaimModalItem(null)}
                    disabled={claimSubmitting}
                  >
                    {tx("common.bekor_qilish")}
                  </Button>
                  <Button
                    variant="danger"
                    disabled={claimSubmitting}
                    onClick={handleClaimReject}
                    title="Buyurtmani kamchilik yoki sabab bilan orqaga qaytarish"
                  >
                    ↩ {tx("orders.orqaga_qaytarish", undefined, "Orqaga qaytarish")}
                  </Button>
                </div>
                <Button
                  type="submit"
                  variant="success"
                  disabled={claimSubmitting || !claimDeadline}
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
              </div>
            </form>
          </div>
        </div>
      )}
      {viewingItem && (
        <div className="modal-overlay" onClick={() => setViewingItem(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 880, width: "95%", maxHeight: "92vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle">
              <div className="row middle" style={{ gap: 8, flexWrap: "wrap" }}>
                <span className="badge badge-brand">{viewingItem.id}</span>
                <span className="badge" style={{ background: "#4f46e5", color: "#fff", fontWeight: 700, fontSize: 11 }}>
                  v{viewingItem.version || 1}
                </span>
                <OrderStatusBadge status={viewingItem.status} label={viewingItem.status_display} />
                <strong>{viewingItem.system_name}</strong>
                {viewingItem.project_detail && (
                  <span
                    className="badge"
                    style={{
                      backgroundColor: viewingItem.project_detail.color || "var(--brand)",
                      color: "#fff",
                      fontSize: 11,
                    }}
                  >
                    📁 {viewingItem.project_detail.name}
                  </span>
                )}
              </div>
              <div className="row middle" style={{ gap: 8 }}>
                {isSohaviyOrAdmin && viewingItem.status !== "COMPLETED" && viewingItem.status !== "REJECTED" && viewingItem.status !== "READY_FOR_REVIEW" && viewingItem.status !== "CANCELLED" && (
                  <Button
                    variant="primary" size="sm"
                    onClick={() => handleOpenUploadVersion(viewingItem)}
                  >
                    📤 {tx("orders.upload_new_version")}
                  </Button>
                )}
                {viewingItem.tz_file_url && (
                  <Button
                    onClick={() => setPreviewFile({
                      url: viewingItem.tz_file_url!,
                      name: viewingItem.tz_file_name || "TZ_fayli.docx",
                      size: viewingItem.tz_file_size_display,
                    })}
                    size="sm" className="row middle"
                    title={tx("orders.tz_preview_tooltip")}
                  >
                    <IconPaperclip size={14} /> {tx("orders.tz_hujjati")}
                  </Button>
                )}
                {canEditOrder(viewingItem) && (
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => {
                      const oid = viewingItem.id;
                      setViewingItem(null);
                      go(toEditOrder(oid));
                    }}
                  >
                    {tx("common.tahrirlash")}
                  </Button>
                )}
                <Button iconOnly aria-label={tx("common.yopish")} variant="ghost" size="sm" onClick={() => setViewingItem(null)}>
                  ✕
                </Button>
              </div>
            </div>
            <div className="modal-body" style={{ padding: 20 }}>
              {viewingItem.has_pending_version && viewingItem.pending_version && (
                <div
                  style={{
                    background: "#fffbeb",
                    border: "2px solid #f59e0b",
                    borderRadius: 8,
                    padding: "14px 18px",
                    marginBottom: 16,
                  }}
                >
                  <div className="row between middle" style={{ flexWrap: "wrap", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 24 }}>⚡</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "#92400e" }}>
                            {tx("orders.pending_version_alert", { version: viewingItem.pending_version.version })}
                          </div>
                          <div style={{ fontSize: 12, color: "#b45309", marginTop: 2 }}>
                            {tx("orders.pending_version_desc")}
                          </div>
                        </div>
                      </div>
                      <div style={{ marginTop: 10, background: "#fef3c7", padding: "8px 12px", borderRadius: 6, fontSize: 12.5, color: "#78350f" }}>
                        <div><strong>{tx("orders.ozgarishlar_tavsifi")}</strong> {viewingItem.pending_version.change_note}</div>
                        {viewingItem.pending_version.requested_change && (
                          <div style={{ marginTop: 4 }}><strong>{tx("orders.yangi_talablar")}</strong> {viewingItem.pending_version.requested_change}</div>
                        )}
                        <div style={{ marginTop: 4, fontSize: 11, color: "#92400e" }}>
                          {tx("orders.yuklagan")}: {viewingItem.pending_version.uploaded_by_name || tx("orders.boshqarma_vakili")} • {fmtDate(viewingItem.pending_version.created_at)}
                        </div>
                      </div>
                    </div>
                    <div className="row middle" style={{ gap: 8, flexWrap: "wrap" }}>
                      {viewingItem.pending_version.tz_file_url && (
                        <Button
                          onClick={() => setPreviewFile({
                            url: viewingItem.pending_version!.tz_file_url!,
                            name: viewingItem.pending_version!.tz_file_name || `Yangi_TZ_v${viewingItem.pending_version!.version}.docx`,
                            size: viewingItem.pending_version!.tz_file_size_display,
                          })}
                          size="sm" className="row middle"
                          title={tx("orders.yangi_tz_tooltip")}
                        >
                          <span>📄</span> {tx("orders.yangi_tz_fayli_btn")} (v{viewingItem.pending_version.version})
                        </Button>
                      )}
                      {isPMOrAdmin && (user?.is_platform_admin || user?.is_boss || !viewingItem.assigned_pm || viewingItem.assigned_pm === user?.id) && (
                        <>
                          <Button
                            variant="success" size="sm"
                            onClick={() => handleOpenApproveVersion(viewingItem, viewingItem.pending_version?.version)}
                          >
                            ✓ {tx("orders.approve_version_btn")}
                          </Button>
                          <Button
                            variant="danger" size="sm"
                            onClick={() => handleOpenRejectVersion(viewingItem, viewingItem.pending_version?.version)}
                          >
                            ✕ {tx("orders.reject_version_btn")}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {viewingItem.status === "DRAFT" ? (
                <div
                  style={{
                    background: "#fffbeb",
                    border: "1.5px solid #fde68a",
                    borderRadius: 8,
                    padding: "12px 16px",
                    marginBottom: 16,
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
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: "#92400e" }}>
                        {tx("orders.status_draft")}:
                      </div>
                      <div style={{ fontSize: 12, color: "#b45309", marginTop: 2 }}>
                        {tx("orders.draft_badge_desc")}
                      </div>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    {canEditOrder(viewingItem) && (
                      <Button
                        size="sm"
                        onClick={() => {
                          const oid = viewingItem.id;
                          setViewingItem(null);
                          go(toEditOrder(oid));
                        }}
                      >
                        <span>✏️</span>
                        <span>{tx("common.tahrirlash")}</span>
                      </Button>
                    )}
                    <Button
                      variant="primary" size="sm"
                      onClick={async () => {
                        const itm = viewingItem;
                        setViewingItem(null);
                        await handleSendOrder(itm);
                      }}
                    >
                      <span>🚀</span>
                      <span>{tx("orders.send_order")}</span>
                    </Button>
                  </div>
                </div>
              ) : !viewingItem.assigned_pm ? (
                <div
                  style={{
                    background: "#fffbeb",
                    border: "1.5px solid #fde68a",
                    borderRadius: 8,
                    padding: "12px 16px",
                    marginBottom: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 22 }}>⏳</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: "#92400e" }}>
                        {tx("orders.ishni_qabul_qilish_taklif")}
                      </div>
                      <div style={{ fontSize: 12, color: "#b45309", marginTop: 2 }}>
                        {tx("orders.pm_claim_hint")}
                      </div>
                    </div>
                  </div>
                  {isPMOrAdmin && (
                    <Button
                      variant="success" size="sm"
                      onClick={() => handleClaimOrder(viewingItem)}
                      disabled={claimingId === viewingItem.id}
                    >
                      📌 {claimingId === viewingItem.id ? tx("orders.claim_submitting") : tx("orders.ishni_qabul_qilish")}
                    </Button>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    background: "#ecfdf5",
                    border: "1.5px solid #a7f3d0",
                    borderRadius: 8,
                    padding: "10px 14px",
                    marginBottom: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#065f46", fontSize: 13, fontWeight: 600 }}>
                    <span>🎯</span>
                    <span>{tx("orders.masul_pm_label")} {viewingItem.assigned_pm_name || user?.full_name || tx("orders.siz")}</span>
                  </div>
                  {(user?.is_platform_admin || user?.is_boss || viewingItem.assigned_pm === user?.id) && viewingItem.status !== "COMPLETED" && (
                    <Button variant="link"
                      size="xs"
                      onClick={() => handleClaimOrder(viewingItem)}
                      disabled={claimingId === viewingItem.id}
                    >
                      👥 {tx("orders.boshqa_pmga_topshirish", undefined, "Boshqa PM ga topshirish")}
                    </Button>
                  )}
                </div>
              )}
              {viewingItem.status === "REJECTED" && (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "2px solid #ef4444",
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  <div className="row middle" style={{ gap: 8, color: "#991b1b", fontWeight: 700, fontSize: 14 }}>
                    <span style={{ fontSize: 22 }}>❌</span>
                    <span>{tx("orders.pm_rad_etilgan_text")}</span>
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 13,
                      color: "#7f1d1d",
                      whiteSpace: "pre-wrap",
                      background: "#fff",
                      padding: "10px 14px",
                      borderRadius: 6,
                      border: "1px solid #fecaca",
                      lineHeight: 1.5,
                    }}
                  >
                    <strong>{tx("orders.rad_etish_asosi")}</strong>
                    <div style={{ marginTop: 4 }}>{viewingItem.pm_notes || tx("orders.sabab_korsatilmagan")}</div>
                  </div>
                </div>
              )}
              
              {viewingItem.status === "READY_FOR_REVIEW" && (
                <div
                  style={{
                    background: "rgba(168, 85, 247, 0.08)",
                    border: "2px solid #a855f7",
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  <div className="row middle between" style={{ flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#6b21a8" }}>
                        {tx("orders.bajarilgan_ish_topshirilgan_sarlavha")}
                      </div>
                      <div style={{ fontSize: 12.5, color: "#581c87", marginTop: 3 }}>
                        {tx("orders.ish_tasdiqqa_topshirilgan_izoh")}
                      </div>
                    </div>
                    {(isSohaviyOrAdmin || (user && viewingItem.created_by === user.id)) && (
                      <div className="row middle" style={{ gap: 8 }}>
                        <Button
                          variant="success" size="sm"
                          onClick={() => handleClientApprove(viewingItem)}
                          disabled={approvingId === viewingItem.id}
                        >
                          {tx("orders.ishni_qabul_qilish_yopish")}
                        </Button>
                        <Button
                          variant="warning" size="sm"
                          onClick={() => {
                            setRejectModalItem(viewingItem);
                            setRejectFeedbackNote("");
                            setRejectFeedbackFile(null);
                            setRejectIsNewTz(false);
                            setRejectError(null);
                          }}
                        >
                          {tx("orders.kamchilik_mavjud_qaytarish")}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {viewingItem.client_feedback_note && viewingItem.status !== "COMPLETED" && (
                <div
                  style={{
                    background: "#fffbeb",
                    border: "2px solid #f59e0b",
                    borderRadius: 8,
                    padding: 14,
                    marginBottom: 16,
                  }}
                >
                  <div className="row middle" style={{ gap: 8, color: "#92400e", fontWeight: 700, fontSize: 13.5 }}>
                    <span style={{ fontSize: 18 }}>⚠️</span>
                    <span>{tx("orders.boshqarma_etirozi_sarlavha")}</span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "#78350f", whiteSpace: "pre-wrap" }}>
                    {viewingItem.client_feedback_note}
                  </div>
                  {viewingItem.client_feedback_file_url && (
                    <div style={{ marginTop: 8 }}>
                      <Button variant="warning"
                        size="xs"
                        onClick={() => setPreviewFile({
                          url: viewingItem.client_feedback_file_url!,
                          name: viewingItem.client_feedback_file_name || "Tuzatish_hujjati",
                          size: viewingItem.client_feedback_file_size_display,
                        })}
                      >
                        <span>📎</span>
                        <span>{tx("orders.tuzatish_hujjati_fayli")}: {viewingItem.client_feedback_file_name || tx("orders.fayl")}</span>
                        {viewingItem.client_feedback_file_size_display && <span style={{ opacity: 0.7 }}>({viewingItem.client_feedback_file_size_display})</span>}
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {(viewingItem.completion_file_url || viewingItem.completion_note) && (
                <div
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: 8,
                    padding: 14,
                    marginBottom: 16,
                  }}
                >
                  <div
                    className="row between middle"
                    style={{
                      marginBottom: /\.(png|jpe?g|webp|gif|bmp)$/i.test(
                        viewingItem.completion_file_name || viewingItem.completion_file_url || ""
                      )
                        ? 10
                        : 0,
                    }}
                  >
                    <div className="row middle" style={{ gap: 10 }}>
                      <span style={{ fontSize: 24 }}>
                        {/\.(png|jpe?g|webp|gif|bmp)$/i.test(
                          viewingItem.completion_file_name || viewingItem.completion_file_url || ""
                        )
                          ? "🖼️"
                          : "📁"}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "#1e40af" }}>
                          {tx("orders.bajarilgan_ish_hujjati_sarlavha")}
                        </div>
                        <div style={{ fontSize: 12, color: "#1d4ed8" }}>
                          {viewingItem.completion_file_name || tx("orders.hisobot_hujjati")}{" "}
                          {viewingItem.completion_file_size_display ? `(${viewingItem.completion_file_size_display})` : ""}
                          {viewingItem.completed_at && ` • ${tx("orders.topshirilgan_vaqti")}: ${fmtDate(viewingItem.completed_at)}`}
                        </div>
                      </div>
                    </div>
                    {viewingItem.completion_file_url && (
                      <Button
                        onClick={() => setPreviewFile({
                          url: viewingItem.completion_file_url!,
                          name: viewingItem.completion_file_name || "Hisobot_hujjati.docx",
                          size: viewingItem.completion_file_size_display,
                        })}
                        variant="primary" size="sm"
                        title={tx("orders.hisobot_vebsaytda_ochish_tooltip")}
                      >
                        <span>📄</span> {tx("orders.hujjatni_korish")}
                      </Button>
                    )}
                  </div>
                  {viewingItem.completion_note && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 12.5,
                        color: "#1e3a8a",
                        background: "#dbeafe",
                        padding: "8px 12px",
                        borderRadius: 6,
                      }}
                    >
                      <strong>{tx("orders.pm_hisobot_izohi")}:</strong> {viewingItem.completion_note}
                    </div>
                  )}
                  {viewingItem.client_approved_at && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        color: "#15803d",
                        fontWeight: 600,
                        background: "#dcfce7",
                        padding: "6px 10px",
                        borderRadius: 4,
                      }}
                    >
                      ✅ {tx("orders.boshqarma_tasdiqladi")}:{" "}
                      {viewingItem.client_approved_by_name || viewingItem.client_signer || tx("orders.masul")} (
                      {fmtDate(viewingItem.client_approved_at)})
                    </div>
                  )}
                </div>
              )}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                  background: "var(--surface, #f8fafc)",
                  border: "1px solid var(--border-color, #e2e8f0)",
                  borderRadius: 8,
                  padding: 14,
                  marginBottom: 16,
                  fontSize: 12.5,
                }}
              >
                <div>
                  <span className="muted" style={{ fontSize: 11 }}>{tx("orders.buyurtmachi_bolinma")}:</span>
                  <div style={{ fontWeight: 600, color: "var(--text)" }}>{viewingItem.department || "-"}</div>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: 11 }}>{tx("orders.masul_shaxs")}:</span>
                  <div style={{ fontWeight: 600, color: "var(--text)" }}>{viewingItem.responsible_person || "-"}</div>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: 11 }}>{tx("orders.yaratilgan_sana_vaqti")}:</span>
                  <div style={{ fontWeight: 700, color: "var(--text)" }}>
                    📅 {fmtDateTime(viewingItem.created_at || viewingItem.request_date)}
                    {viewingItem.created_at && (
                      <span className="muted" style={{ fontSize: 11.5, marginLeft: 6, fontWeight: 400 }}>
                        ({timeAgo(viewingItem.created_at)})
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: 11 }}>{tx("orders.muhimlik_label")}:</span>
                  <div>
                    <span
                      className={`badge ${
                        viewingItem.priority === "URGENT"
                          ? "badge-danger"
                          : viewingItem.priority === "HIGH"
                          ? "badge-warning"
                          : viewingItem.priority === "MEDIUM"
                          ? "badge-brand"
                          : ""
                      }`}
                      style={{ fontSize: 11 }}
                    >
                      {viewingItem.priority_display || viewingItem.priority}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: 11 }}>{tx("orders.masul_pm")}:</span>
                  <div style={{ fontWeight: 600, color: "var(--text)" }}>
                    {viewingItem.assigned_pm_name ? `👤 ${viewingItem.assigned_pm_name}` : tx("orders.biriktirilmagan")}
                  </div>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: 11 }}>{tx("orders.masul_dasturchi")}:</span>
                  <div style={{ fontWeight: 600, color: "var(--text)" }}>
                    {viewingItem.assigned_developer_name ? `👨‍💻 ${viewingItem.assigned_developer_name}` : tx("orders.biriktirilmagan")}
                  </div>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: 11 }}>{tx("orders.kerakli_muddat_label")}:</span>
                  <div style={{ fontWeight: 600, color: "var(--text)" }}>
                    {viewingItem.due_date ? fmtDate(viewingItem.due_date) : "-"}
                  </div>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: 11 }}>{tx("orders.pm_yakuniy_muddati_label")}:</span>
                  <div style={{ fontWeight: 600, color: viewingItem.pm_deadline ? "var(--brand)" : "var(--text)" }}>
                    {viewingItem.pm_deadline
                      ? fmtDate(viewingItem.pm_deadline)
                      : viewingItem.pm_estimated_duration || tx("orders.belgilanmagan")}
                  </div>
                </div>
              </div>
              <div
                style={{
                  background: "var(--surface, #f8fafc)",
                  border: "1px solid var(--border-color, #e2e8f0)",
                  borderRadius: 8,
                  padding: 14,
                  marginBottom: 16,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", marginBottom: 6 }}>
                  📝 {tx("orders.talab_qilinayotgan_ozgartirish_sarlavha")}
                </div>
                <div style={{ fontSize: 13, color: "var(--text)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {viewingItem.requested_change || viewingItem.current_state || tx("orders.tavsif_kiritilmagan")}
                </div>
                {viewingItem.module && (
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px dashed var(--border-color, #e2e8f0)", fontSize: 12, color: "var(--muted)" }}>
                    <strong>{tx("orders.loyiha_izoh_label", undefined, "Loyiha haqida izoh")}:</strong> {viewingItem.module}
                  </div>
                )}
                {viewingItem.reason && (
                  <div style={{ marginTop: 8, paddingTop: 6, borderTop: viewingItem.module ? "none" : "1px dashed var(--border-color, #e2e8f0)", fontSize: 12, color: "var(--muted)" }}>
                    <strong>{tx("orders.asos_sabab")}</strong> {viewingItem.reason}
                  </div>
                )}
              </div>
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: 8,
                  padding: "12px 14px",
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div className="row middle" style={{ gap: 8 }}>
                  <span style={{ fontSize: 22 }}>📄</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#166534" }}>
                      {viewingItem.tz_file_name || tx("orders.biriktirilgan_tz_hujjati")}
                    </div>
                    <div style={{ fontSize: 11.5, color: "#15803d" }}>
                      v{viewingItem.version || 1} {viewingItem.tz_file_size_display ? `• ${viewingItem.tz_file_size_display}` : ""}
                    </div>
                  </div>
                </div>
                <div className="row middle" style={{ gap: 6 }}>
                  {viewingItem.tz_file_url && (
                    <Button
                      onClick={() => setPreviewFile({
                        url: viewingItem.tz_file_url!,
                        name: viewingItem.tz_file_name || "TZ_fayli.docx",
                        size: viewingItem.tz_file_size_display,
                      })}
                      variant="success" size="sm"
                      title={tx("orders.tz_vebsaytda_ochish_tooltip")}
                    >
                      <span>📄</span> {tx("orders.tz_faylini_korish")}
                    </Button>
                  )}
                  {isSohaviyOrAdmin && viewingItem.status !== "COMPLETED" && viewingItem.status !== "REJECTED" && viewingItem.status !== "READY_FOR_REVIEW" && viewingItem.status !== "CANCELLED" && (
                    <Button
                      size="sm"
                      onClick={() => handleOpenUploadVersion(viewingItem)}
                    >
                      📤 {tx("orders.yangi_versiya")}
                    </Button>
                  )}
                </div>
              </div>
              {viewingItem.versions && viewingItem.versions.length > 1 && (
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid var(--border-color, #e2e8f0)",
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 12.5, color: "var(--text)", marginBottom: 8 }}>
                    📑 {tx("orders.barcha_tz_versiyalari")}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {viewingItem.versions.map((v) => (
                      <div
                        key={v.id || v.version}
                        className="row between middle"
                        style={{
                          background: v.version === viewingItem.version ? "#f0fdf4" : "#fff",
                          border: "1px solid var(--border-color, #e2e8f0)",
                          borderRadius: 6,
                          padding: "6px 10px",
                          fontSize: 12,
                        }}
                      >
                        <div className="row middle" style={{ gap: 8 }}>
                          <span className="badge badge-brand" style={{ fontSize: 11 }}>v{v.version}</span>
                          <span>{v.tz_file_name || tx("orders.tz_fayli")}</span>
                          {v.version === viewingItem.version && (
                            <span className="badge badge-ok" style={{ fontSize: 10 }}>{tx("orders.joriy")}</span>
                          )}
                        </div>
                        {v.tz_file_url && (
                          <Button
                            onClick={() => setPreviewFile({
                              url: v.tz_file_url!,
                              name: v.tz_file_name || `TZ_v${v.version}.docx`,
                              size: v.tz_file_size_display,
                            })}
                            size="xs"
                            title={tx("orders.tz_vebsaytda_ochish_tooltip")}
                          >
                            <span>📄</span> {tx("orders.korish_btn")}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {isPMOrAdmin && (
                viewingItem.assigned_pm && viewingItem.assigned_pm !== user?.id && !user?.is_platform_admin && !user?.is_boss ? (
                  <div
                    style={{
                      background: "#f8fafc",
                      border: "1.5px solid #cbd5e1",
                      borderRadius: 8,
                      padding: 16,
                      marginBottom: 10,
                    }}
                  >
                    <div className="row middle" style={{ gap: 8, color: "#475569" }}>
                      <span style={{ fontSize: 20 }}>🔒</span>
                      <strong style={{ fontSize: 13.5, color: "#334155" }}>
                        {tx("orders.pm_panel_qulflangan")}
                      </strong>
                    </div>
                    <p style={{ margin: "8px 0 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
                      {tx("orders.qulflangan_izoh", { pm_name: viewingItem.assigned_pm_name || "" })}
                    </p>
                  </div>
                ) : !viewingItem.assigned_pm && !user?.is_platform_admin && !user?.is_boss ? (
                  <div
                    style={{
                      background: "#eff6ff",
                      border: "1.5px solid #bfdbfe",
                      borderRadius: 8,
                      padding: 16,
                      marginBottom: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: "#1e40af" }}>
                        {tx("orders.avval_qabul_qiling_sarlavha")}
                      </div>
                      <div style={{ fontSize: 12, color: "#3b82f6", marginTop: 2 }}>
                        {tx("orders.avval_qabul_qiling_izoh")}
                      </div>
                    </div>
                    <Button
                      variant="primary" size="sm"
                      onClick={() => handleClaimOrder(viewingItem)}
                      disabled={claimingId === viewingItem.id}
                    >
                      📌 {claimingId === viewingItem.id ? tx("orders.claim_submitting") : tx("orders.ishni_qabul_qilish")}
                    </Button>
                  </div>
                ) : (
                <div
                  style={{
                    background: "#eff6ff",
                    border: "2px solid #3b82f6",
                    borderRadius: 6,
                    padding: 16,
                    marginBottom: 10,
                  }}
                >
                  <div className="row middle" style={{ gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 20 }}>⚡</span>
                    <strong style={{ fontSize: 14, color: "#1d4ed8" }}>
                      {tx("orders.pm_paneli_sarlavha")}
                    </strong>
                  </div>
                  {pmSaveSuccess && (
                    <div
                      style={{
                        background: "#dcfce7",
                        color: "#15803d",
                        padding: "8px 12px",
                        borderRadius: 4,
                        marginBottom: 12,
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      ✓ {pmSaveSuccess}
                    </div>
                  )}
                  {pmSaveError && <ErrorMsg error={pmSaveError} />}
                  <form onSubmit={handleSavePMDecision}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
                      <div className="field">
                        <label style={{ fontWeight: 600, fontSize: 12 }}>{tx("orders.buyurtma_holati")}</label>
                        <select
                          value={pmDecisionForm.status}
                          onChange={(e) =>
                            setPmDecisionForm({
                              ...pmDecisionForm,
                              status: e.target.value as ChangeRequestItem["status"],
                            })
                          }
                          required
                        >
                          {(meta?.order_status || []).filter((s) => s.value !== "COMPLETED" && s.value !== "READY_FOR_REVIEW").map((s) => (
                            <option key={String(s.value)} value={String(s.value)}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label style={{ fontWeight: 600, fontSize: 12 }}>{tx("orders.masul_dasturchi_label")}</label>
                        <select
                          value={pmDecisionForm.assigned_developer || ""}
                          onChange={(e) =>
                            setPmDecisionForm({
                              ...pmDecisionForm,
                              assigned_developer: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        >
                          <option value="">{tx("orders.dasturchini_tanlang")}</option>
                          {developersList.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.full_name} ({d.email})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label style={{ fontWeight: 600, fontSize: 12 }}>
                          {tx("orders.qanchada_tugashi_pm_bahosi")}
                        </label>
                        <input
                          type="text"
                          placeholder={tx("orders.muddat_placeholder")}
                          value={pmDecisionForm.pm_estimated_duration}
                          onChange={(e) =>
                            setPmDecisionForm({
                              ...pmDecisionForm,
                              pm_estimated_duration: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="field">
                        <label style={{ fontWeight: 600, fontSize: 12 }}>
                          {tx("orders.pm_belgilagan_yakuniy_muddat")}
                        </label>
                        <input
                          type="date"
                          min={new Date().toISOString().split("T")[0]}
                          value={pmDecisionForm.pm_deadline}
                          onChange={(e) =>
                            setPmDecisionForm({
                              ...pmDecisionForm,
                              pm_deadline: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="field" style={{ marginBottom: 12 }}>
                      <label style={{ fontWeight: 600, fontSize: 12, color: pmDecisionForm.status === "REJECTED" ? "#dc2626" : undefined }}>
                        {pmDecisionForm.status === "REJECTED"
                          ? tx("orders.rad_etish_sababi_va_izohi")
                          : tx("orders.pm_xulosasi_va_korsatma")}
                      </label>
                      <textarea
                        rows={pmDecisionForm.status === "REJECTED" ? 3 : 2}
                        required={pmDecisionForm.status === "REJECTED"}
                        style={{
                          borderColor: pmDecisionForm.status === "REJECTED" ? "#ef4444" : undefined,
                          background: pmDecisionForm.status === "REJECTED" ? "#fef2f2" : undefined,
                        }}
                        placeholder={
                          pmDecisionForm.status === "REJECTED"
                            ? tx("orders.rad_etish_placeholder")
                            : tx("orders.pm_xulosasi_placeholder")
                        }
                        value={pmDecisionForm.pm_notes}
                        onChange={(e) =>
                          setPmDecisionForm({
                            ...pmDecisionForm,
                            pm_notes: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="row end">
                      <Button
                        type="submit"
                        variant="primary" size="sm"
                        disabled={pmSaveLoading}
                      >
                        {pmSaveLoading ? tx("common.saqlanmoqda") : tx("orders.pm_qarorini_saqlash")}
                      </Button>
                    </div>
                    {viewingItem.status !== "COMPLETED" && viewingItem.status !== "REJECTED" && (
                      <div
                        style={{
                          marginTop: 14,
                          paddingTop: 12,
                          borderTop: "1px dashed #93c5fd",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        <span style={{ fontSize: 12.5, color: "#1e40af" }}>
                          💡 {tx("orders.ish_yakunlanganda_eslatma")}
                        </span>
                        <Button
                          variant="primary" size="sm"
                          onClick={() => {
                            setCompletionModalItem(viewingItem);
                            setCompletionFile(null);
                            setCompletionNote("");
                            setCompletionError(null);
                          }}
                        >
                          📁 {tx("orders.hisobot_topshirish_btn")}
                        </Button>
                      </div>
                    )}
                  </form>
                </div>
                )
              )}
            </div>
            <div className="modal-footer row between middle" style={{ padding: "12px 20px" }}>
              <div className="row middle" style={{ gap: 8 }}>
              </div>
              <Button variant="ghost" onClick={() => setViewingItem(null)}>
                {tx("common.yopish")}
              </Button>
            </div>
          </div>
        </div>
      )}
      {completionModalItem && (
        <div className="modal-overlay" onClick={() => setCompletionModalItem(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 540, width: "95%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle">
              <div className="row middle" style={{ gap: 8 }}>
                <span style={{ fontSize: 20 }}>📁</span>
                <strong>{tx("orders.tugatilgan_ish_hisobotini_topshirish")}</strong>
              </div>
              <Button iconOnly aria-label={tx("common.yopish")} variant="ghost" size="sm" onClick={() => setCompletionModalItem(null)}>
                ✕
              </Button>
            </div>
            <form onSubmit={handleSubmitCompletion}>
              <div className="modal-body" style={{ padding: 20 }}>
                <div style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>
                  {tx("orders.buyurtma_raqami")}: <strong>{completionModalItem.id}</strong> ({completionModalItem.system_name})
                </div>
                {completionError && <ErrorMsg error={completionError} />}
                <div className="field" style={{ marginBottom: 14 }}>
                  <label style={{ fontWeight: 600, fontSize: 13 }}>
                    {tx("orders.tugatilgan_ish_hujjati_label")}
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
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                    {tx("orders.fayl_format_izohi")}
                  </div>
                </div>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 13 }}>
                    {tx("orders.hisobot_izohi_label")}
                  </label>
                  <textarea
                    rows={3}
                    placeholder={tx("orders.hisobot_izohi_placeholder")}
                    value={completionNote}
                    onChange={(e) => setCompletionNote(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer row end" style={{ gap: 10, padding: "12px 20px" }}>
                <Button
                  variant="ghost"
                  onClick={() => setCompletionModalItem(null)}
                  disabled={completionSubmitting}
                >
                  {tx("common.bekor_qilish")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={completionSubmitting}
                >
                  {completionSubmitting ? tx("orders.topshirilmoqda") : tx("orders.boshqarma_tasdigiga_topshirish")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {rejectModalItem && (
        <div className="modal-overlay" onClick={() => setRejectModalItem(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 520, width: "95%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle">
              <div className="row middle" style={{ gap: 8 }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <strong>{tx("orders.xatolik_sababli_qaytarish_sarlavha")}</strong>
              </div>
              <Button iconOnly aria-label={tx("common.yopish")} variant="ghost" size="sm" onClick={() => setRejectModalItem(null)}>
                ✕
              </Button>
            </div>
            <form onSubmit={handleClientReject}>
              <div className="modal-body" style={{ padding: 20 }}>
                <div style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>
                  {tx("orders.buyurtma_raqami")}: <strong>{rejectModalItem.id}</strong> ({rejectModalItem.system_name})
                </div>
                <div
                  style={{
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    borderRadius: 6,
                    padding: 12,
                    marginBottom: 14,
                    fontSize: 12.5,
                    color: "#92400e",
                  }}
                >
                  {tx("orders.holat_qaytarilishi_izohi")}
                </div>
                {rejectError && <ErrorMsg error={rejectError} />}
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 13 }}>
                    {tx("orders.kamchilik_tavsifi_label")}
                  </label>
                  <textarea
                    rows={4}
                    placeholder={tx("orders.kamchilik_tavsifi_placeholder")}
                    value={rejectFeedbackNote}
                    onChange={(e) => setRejectFeedbackNote(e.target.value)}
                  />
                </div>
                <div className="field" style={{ marginTop: 12 }}>
                  <label style={{ fontWeight: 600, fontSize: 13 }}>
                    {tx("orders.kamchilik_hujjati_label")}
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <label className={buttonClass({ size: "sm" })}>
                      Fayl tanlash
                      <input
                        type="file"
                        hidden
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                        onChange={(e) => setRejectFeedbackFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    <span className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                      {rejectFeedbackFile ? rejectFeedbackFile.name : "Fayl tanlanmagan"}
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                    {tx("orders.fayl_format_izohi_qisqa")}
                  </div>
                </div>
                {rejectFeedbackFile && (
                  <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--surface-2, #f8fafc)", borderRadius: 8, border: "1px solid var(--border-color, #e2e8f0)" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5, color: "var(--text)" }}>
                      <input
                        type="checkbox"
                        checked={rejectIsNewTz}
                        onChange={(e) => setRejectIsNewTz(e.target.checked)}
                      />
                      <span>{tx("orders.yangi_tz_sifatida_saqlansin")}</span>
                    </label>
                  </div>
                )}
              </div>
              <div className="modal-footer row end" style={{ gap: 10, padding: "12px 20px" }}>
                <Button
                  variant="ghost"
                  onClick={() => setRejectModalItem(null)}
                  disabled={rejectSubmitting}
                >
                  {tx("common.bekor_qilish")}
                </Button>
                <Button
                  type="submit"
                  variant="warning"
                  disabled={rejectSubmitting || (!rejectFeedbackNote.trim() && !rejectFeedbackFile)}
                >
                  {rejectSubmitting ? tx("orders.qaytarilmoqda") : tx("orders.qayta_ishlashga_qaytarish")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {uploadVersionModalItem && (
        <div className="modal-overlay" onClick={() => setUploadVersionModalItem(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 580, width: "95%", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle">
              <div className="row middle" style={{ gap: 8 }}>
                <span style={{ fontSize: 20 }}>📤</span>
                <strong>{tx("orders.upload_version_title")}</strong>
              </div>
              <Button iconOnly aria-label={tx("common.yopish")} variant="ghost" size="sm" onClick={() => setUploadVersionModalItem(null)}>
                ✕
              </Button>
            </div>
            <form onSubmit={handleUploadVersionSubmit}>
              <div className="modal-body" style={{ padding: 20 }}>
                <div style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>
                  {tx("orders.buyurtma_raqami")}: <strong>{uploadVersionModalItem.id}</strong> ({uploadVersionModalItem.system_name})
                  <span className="badge" style={{ marginLeft: 8, background: "#4f46e5", color: "#fff", fontSize: 11 }}>
                    {tx("orders.hozirgi")}: v{uploadVersionModalItem.version || 1}
                  </span>
                </div>

                {versionError && <ErrorMsg error={versionError} />}
                <div className="field" style={{ marginBottom: 14 }}>
                  <label style={{ fontWeight: 600, fontSize: 13 }}>
                    {tx("orders.tz_file_label")} *
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <label className={buttonClass({ size: "sm" })}>
                      Fayl tanlash
                      <input
                        type="file"
                        hidden
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.png,.jpg,.jpeg,.webp"
                        onChange={(e) => setVersionFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    <span className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                      {versionFile ? versionFile.name : "Fayl tanlanmagan"}
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                    {tx("orders.upload_version_format_note")}
                  </div>
                </div>
                <div className="field" style={{ marginBottom: 14 }}>
                  <label style={{ fontWeight: 600, fontSize: 13 }}>
                    {tx("orders.change_note_label")} *
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder={tx("orders.change_note_placeholder")}
                    value={versionChangeNote}
                    onChange={(e) => setVersionChangeNote(e.target.value)}
                  />
                </div>

                </div>
                <div className="modal-footer row end" style={{ gap: 10, padding: "12px 20px" }}>
                  <Button
                    variant="ghost"
                    onClick={() => setUploadVersionModalItem(null)}
                    disabled={versionSubmitting}
                  >
                    {tx("common.bekor_qilish")}
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={versionSubmitting || !versionFile || !versionChangeNote.trim()}
                  >
                    {versionSubmitting ? tx("orders.yuborilmoqda") : tx("orders.yuborish_pm_korib_chiqish")}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
        {approveVersionModalItem && (
          <div className="modal-overlay" onClick={() => setApproveVersionModalItem(null)}>
            <div
              className="modal-card"
              style={{ maxWidth: 580, width: "95%", maxHeight: "90vh", overflowY: "auto" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header row between middle">
                <div className="row middle" style={{ gap: 8 }}>
                  <span style={{ fontSize: 20 }}>✅</span>
                  <strong>{tx("orders.approve_version_title")}</strong>
                </div>
                <Button iconOnly aria-label={tx("common.yopish")} variant="ghost" size="sm" onClick={() => setApproveVersionModalItem(null)}>
                  ✕
                </Button>
              </div>
              <form onSubmit={handleApproveVersionSubmit}>
                <div className="modal-body" style={{ padding: 20 }}>
                  <div style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>
                    {tx("orders.buyurtma")}: <strong>{approveVersionModalItem.id}</strong> • {tx("orders.tasdiqlanayotgan_versiya")}:{" "}
                    <strong style={{ color: "#16a34a" }}>v{approveVersionTarget || approveVersionModalItem.pending_version?.version || tx("orders.yangi_kichik")}</strong>
                  </div>
                  <div
                    style={{
                      background: "#ecfdf5",
                      border: "1.5px solid #86efac",
                      borderRadius: 6,
                      padding: 12,
                      marginBottom: 14,
                      fontSize: 12.5,
                      color: "#166534",
                      lineHeight: 1.5,
                    }}
                  >
                    ⚠️ <strong>{tx("orders.eslatma_sarlavha")}:</strong> {tx("orders.versiya_tasdiqlanganda_eslatma")}
                    <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                      <li>{tx("orders.eski_versiya_bekor_qilinadi")}</li>
                      <li>{tx("orders.yangi_tz_otkaziladi")}</li>
                    </ul>
                  </div>
                  {approveError && <ErrorMsg error={approveError} />}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
                    <div className="field">
                      <label style={{ fontWeight: 600, fontSize: 12 }}>{tx("orders.qanchada_tugashi_pm_bahosi")}</label>
                      <input
                        type="text"
                        placeholder={tx("orders.muddat_placeholder_qisqa")}
                        value={approveEstimatedDuration}
                        onChange={(e) => setApproveEstimatedDuration(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label style={{ fontWeight: 600, fontSize: 12 }}>{tx("orders.pm_belgilagan_yangi_muddat")}</label>
                      <input
                        type="date"
                        min={new Date().toISOString().split("T")[0]}
                        value={approveDeadline}
                        onChange={(e) => setApproveDeadline(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom: 12 }}>
                    <label style={{ fontWeight: 600, fontSize: 12 }}>{tx("orders.masul_dasturchi_label")}</label>
                    <select
                      value={approveDeveloper || ""}
                      onChange={(e) => setApproveDeveloper(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">{tx("orders.ozgarishsiz_qoldirish_dasturchi")}</option>
                      {developersList.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.full_name} ({d.email})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label style={{ fontWeight: 600, fontSize: 12 }}>
                      {tx("orders.pm_qaror_izohi_ko_rsatmalari")}
                    </label>
                    <textarea
                      rows={3}
                      placeholder={tx("orders.pm_qaror_izohi_placeholder")}
                      value={approveDecisionNote}
                      onChange={(e) => setApproveDecisionNote(e.target.value)}
                    />
                  </div>
                </div>
                <div className="modal-footer row end" style={{ gap: 10, padding: "12px 20px" }}>
                  <Button
                    variant="ghost"
                    onClick={() => setApproveVersionModalItem(null)}
                    disabled={approveSubmitting}
                  >
                    {tx("common.bekor_qilish")}
                  </Button>
                  <Button
                    type="submit"
                    variant="success"
                    disabled={approveSubmitting}
                  >
                    {approveSubmitting ? tx("orders.tasdiqlanmoqda") : tx("orders.tasdiqlash_va_yangi_tz")}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
        {rejectVersionModalItem && (
          <div className="modal-overlay" onClick={() => setRejectVersionModalItem(null)}>
            <div
              className="modal-card"
              style={{ maxWidth: 520, width: "95%" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header row between middle">
                <div className="row middle" style={{ gap: 8 }}>
                  <span style={{ fontSize: 20 }}>✕</span>
                  <strong>{tx("orders.reject_version_title")}</strong>
                </div>
                <Button iconOnly aria-label={tx("common.yopish")} variant="ghost" size="sm" onClick={() => setRejectVersionModalItem(null)}>
                  ✕
                </Button>
              </div>
              <form onSubmit={handleRejectVersionSubmit}>
                <div className="modal-body" style={{ padding: 20 }}>
                  <div style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>
                    {tx("orders.buyurtma")}: <strong>{rejectVersionModalItem.id}</strong> • {tx("orders.versiya_label")}:{" "}
                    <strong style={{ color: "#dc2626" }}>v{rejectVersionTarget || rejectVersionModalItem.pending_version?.version || tx("orders.yangi_kichik")}</strong>
                  </div>
                  <div
                    style={{
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: 6,
                      padding: 12,
                      marginBottom: 14,
                      fontSize: 12.5,
                      color: "#991b1b",
                    }}
                  >
                    {tx("orders.versiya_rad_etiladi_izohi")}
                  </div>
                  {rejectVersionError && <ErrorMsg error={rejectVersionError} />}
                  <div className="field">
                    <label style={{ fontWeight: 600, fontSize: 13 }}>
                      {tx("orders.reject_version_reason_label")} *
                    </label>
                    <textarea
                      rows={4}
                      required
                      placeholder={tx("orders.reject_version_reason_placeholder")}
                      value={rejectVersionReason}
                      onChange={(e) => setRejectVersionReason(e.target.value)}
                    />
                  </div>
                </div>
                <div className="modal-footer row end" style={{ gap: 10, padding: "12px 20px" }}>
                  <Button
                    variant="ghost"
                    onClick={() => setRejectVersionModalItem(null)}
                    disabled={rejectVersionSubmitting}
                  >
                    {tx("common.bekor_qilish")}
                  </Button>
                  <Button
                    type="submit"
                    variant="danger"
                    disabled={rejectVersionSubmitting || !rejectVersionReason.trim()}
                  >
                    {rejectVersionSubmitting ? tx("orders.rad_etilmoqda") : tx("orders.versiyani_rad_etish_btn")}
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
        {projectModalItem && (
          <Suspense fallback={null}>
            <ProjectFormModal
              initialOrderId={projectModalItem.id}
              initialOrder={projectModalItem}
              onClose={() => setProjectModalItem(null)}
              onSuccess={() => {
                setProjectModalItem(null);
                reload();
                go("/loyihalar");
              }}
            />
          </Suspense>
        )}
        {distributeModalItem && (distributeModalItem.project || distributeModalItem.project_detail?.id) && (
          <Suspense fallback={null}>
            <DistributeTasksModal
              projectId={Number(distributeModalItem.project || distributeModalItem.project_detail?.id)}
              order={distributeModalItem}
              onClose={() => setDistributeModalItem(null)}
              onTasksUpdated={() => {
                reload();
              }}
            />
          </Suspense>
        )}
      </>
    );
  }
