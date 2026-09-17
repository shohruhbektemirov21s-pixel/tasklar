/**
 * Axborot tizimiga o'zgartirish kiritish bo'yicha so'rovlar (Buyurtmalar / TZ) sahifasi.
 *
 * Asos: «AXBOROT TIZIMIGA O'ZGARTIRISH KIRITISH BO'YICHA SO'ROV BLANKASI» (Буюртма.docx).
 * - Sohaviy boshqarmalar: yangi TZ yaratish, loyihani tanlash, TZ faylini yuklash.
 * - Loyiha haqida ma'lumotlar: loyiha nomi, holati, PM, muddatlar, foiz va havolalar.
 * - Muhimlilik turi va qanchada tugashi: PM o'zi vaqtni va muddatni belgilaydi.
 * - Rasmiy Word (.docx) blanki va biriktirilgan TZ fayllarini yuklab olish.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, listOf, pagesOf, totalOf } from "@/api/client";
import { claimOrder, uploadVersion, approveVersion, rejectVersion, deleteOrder, sendOrder, downloadOrderDocx } from "@/api/orders";
import type { ChangeRequestItem, OrderStats, UserBrief } from "@/api/types";
import { useFetch } from "@/api/useFetch";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import {
  IconDownload,
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
  timeAgo,
} from "@/components/ui";
import { tx } from "@/i18n";
const PER_PAGE = 15;
export { ORDER_TYPE_CONFIG, OrderTypeBadge, ORDER_STATUS_CONFIG, OrderStatusBadge } from "./orders/OrderBadges";
export { OrderProgressStepper } from "./orders/OrderProgressStepper";
import { OrderStatusBadge } from "./orders/OrderBadges";
import { KpiCardSkeleton, TableRowSkeleton } from "./orders/OrderSkeletons";
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
  const { data: usersData } = useFetch<{ count: number; results: UserBrief[] } | UserBrief[]>("/users/", { is_active: true });
  const items: ChangeRequestItem[] = useMemo(() => (data ? listOf<ChangeRequestItem>(data) : []), [data]);
  const displayItems = items;
  const usersList: UserBrief[] = useMemo(() => (usersData ? listOf<UserBrief>(usersData) : []), [usersData]);
  const developersList = useMemo(
    () => usersList.filter((u) => !u.is_sohaviy_boshqarma && u.specialty !== "SOHAVIY" && u.global_role !== "ADMIN" && u.global_role !== "BOSS" && !u.is_platform_admin && !u.is_boss),
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
  const [claimDuration, setClaimDuration] = useState("");
  const [claimStartDate, setClaimStartDate] = useState("");
  const [claimDeadline, setClaimDeadline] = useState("");
  const [claimNotes, setClaimNotes] = useState("");
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const claimingId = claimSubmitting && claimModalItem ? claimModalItem.id : null;
  const handleOpenClaim = (item: ChangeRequestItem) => {
    setClaimModalItem(item);
    setClaimDuration(item.pm_estimated_duration || "");
    setClaimStartDate(item.pm_start_date || "");
    setClaimDeadline(item.pm_deadline || item.due_date || "");
    setClaimNotes("");
  };
  const applyQuickDeadline = (days: number, durationText: string) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const iso = d.toISOString().split("T")[0];
    setClaimDeadline(iso);
    setClaimDuration(durationText);
  };
  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimModalItem) return;
    setClaimSubmitting(true);
    try {
      const updated = await claimOrder(claimModalItem.id, {
        pm_estimated_duration: claimDuration.trim() || undefined,
        pm_start_date: claimStartDate || undefined,
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
  const handleClaimOrder = (item: ChangeRequestItem) => {
    handleOpenClaim(item);
  };
  const handleOpenView = (item: ChangeRequestItem) => {
    go(toOrder(item.id));
  };
  const canEditOrder = (_item: ChangeRequestItem) => false;
  const canDeleteOrder = (_item: ChangeRequestItem) => false;
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
        <Link to="/panel" className="btn btn-primary" style={{ padding: "8px 20px" }}>
          {tx("common.bosh_sahifa")}
        </Link>
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
            <button
              className="btn btn-primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                borderRadius: 8,
                padding: "9px 18px",
                fontWeight: 600,
                fontSize: 13.5,
                background: "#2563eb",
                border: "none",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                cursor: "pointer",
              }}
              onClick={() => go(toNewOrder())}
            >
              <IconPlus size={16} /> {tx("orders.yangi_buyurtma")}
            </button>
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
              <div
                onClick={() => {
                  setStatusFilter("");
                  setPage(1);
                }}
                style={{
                  background: "#f0f7ff",
                  border: !statusFilter ? "2px solid #2563eb" : "1px solid #dbeafe",
                  borderRadius: 12,
                  padding: "14px 18px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                  transition: "all 0.15s ease",
                }}
                title={tx("orders.kpi_barcha")}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: "50%",
                    background: "#dbeafe",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 12.5, color: "#475569", fontWeight: 500, marginBottom: 4 }}>
                    {tx("orders.jami_sorovlar")}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>
                    {statsData?.total ?? total}
                  </div>
                </div>
              </div>
              <div
                onClick={() => {
                  setStatusFilter("NEW");
                  setPage(1);
                }}
                style={{
                  background: "#fffdf0",
                  border: statusFilter === "NEW" ? "2px solid #d97706" : "1px solid #fef3c7",
                  borderRadius: 12,
                  padding: "14px 18px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                  transition: "all 0.15s ease",
                }}
                title={tx("orders.kpi_yangi")}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: "50%",
                    background: "#fef3c7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 22h14" />
                    <path d="M5 2h14" />
                    <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
                    <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 12.5, color: "#475569", fontWeight: 500, marginBottom: 4 }}>
                    {tx("orders.yangi")}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>
                    {statsData?.new ?? 0}
                  </div>
                </div>
              </div>
              <div
                onClick={() => {
                  setStatusFilter("IN_PROGRESS");
                  setPage(1);
                }}
                style={{
                  background: "#f0f9ff",
                  border: statusFilter === "IN_PROGRESS" ? "2px solid #0284c7" : "1px solid #e0f2fe",
                  borderRadius: 12,
                  padding: "14px 18px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                  transition: "all 0.15s ease",
                }}
                title={tx("orders.kpi_jarayonda")}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: "50%",
                    background: "#e0f2fe",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 12.5, color: "#475569", fontWeight: 500, marginBottom: 4 }}>
                    {tx("orders.jarayonda")}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>
                    {(statsData?.in_progress_strict ?? 0) || (statsData?.in_progress ?? 0)}
                  </div>
                </div>
              </div>
              <div
                onClick={() => {
                  setStatusFilter("COMPLETED");
                  setPage(1);
                }}
                style={{
                  background: "#f0fdf4",
                  border: statusFilter === "COMPLETED" ? "2px solid #16a34a" : "1px solid #dcfce7",
                  borderRadius: 12,
                  padding: "14px 18px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                  transition: "all 0.15s ease",
                }}
                title={tx("orders.kpi_bajarilgan")}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: "50%",
                    background: "#dcfce7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 12.5, color: "#475569", fontWeight: 500, marginBottom: 4 }}>
                    {tx("orders.tugallangan")}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>
                    {statsData?.completed ?? 0}
                  </div>
                </div>
              </div>
              <div
                onClick={() => {
                  setStatusFilter("REJECTED");
                  setPage(1);
                }}
                style={{
                  background: "#fef2f2",
                  border: statusFilter === "REJECTED" ? "2px solid #dc2626" : "1px solid #fee2e2",
                  borderRadius: 12,
                  padding: "14px 18px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                  transition: "all 0.15s ease",
                }}
                title={tx("orders.kpi_bekor_qilingan")}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: "50%",
                    background: "#fee2e2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 12.5, color: "#475569", fontWeight: 500, marginBottom: 4 }}>
                    {tx("orders.bekor_qilingan")}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", lineHeight: 1 }}>
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
                onClick={() => setSearch("")}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  padding: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                }}
                title={tx("orders.qidiruvni_tozalash")}
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
              <option value="">{tx("orders.barcha_holatlar")}</option>
              {(meta?.order_status || []).map((s) => (
                <option key={String(s.value)} value={String(s.value)}>
                  {s.label}
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
                {meta?.order_type?.map((t) => (
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
          <button
            type="button"
            className="btn btn-ghost"
            title={tx("common.filtrni_tozalash")}
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
            style={{
              width: 42,
              height: 42,
              padding: 0,
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#64748b",
              cursor: "pointer",
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
          </button>
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
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => reload()}
              style={{
                borderRadius: 8,
                padding: "6px 14px",
                fontSize: 12.5,
                fontWeight: 600,
                background: "#fff",
                borderColor: "#fca5a5",
                color: "#991b1b",
              }}
            >
              {`🔄 ${tx("orders.qayta_urinish")}`}
            </button>
          </div>
        )}
        {loading || displayItems.length > 0 ? (
          <div
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
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
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ width: 44, textAlign: "center", padding: "12px 14px", fontSize: 12, fontWeight: 700, color: "#64748b" }}>#</th>
                    <th style={{ padding: "12px 14px", fontSize: 12, fontWeight: 700, color: "#64748b" }}>{tx("orders.loyiha_tizim")}</th>
                    <th style={{ padding: "12px 14px", fontSize: 12, fontWeight: 700, color: "#64748b" }}>{tx("orders.buyurtmachi_boshqarma")}</th>
                    <th style={{ padding: "12px 14px", fontSize: 12, fontWeight: 700, color: "#64748b" }}>{tx("orders.yaratilgan_vaqti")}</th>
                    <th style={{ padding: "12px 14px", fontSize: 12, fontWeight: 700, color: "#64748b" }}>{tx("orders.tavsif")}</th>
                    <th style={{ padding: "12px 14px", fontSize: 12, fontWeight: 700, color: "#64748b" }}>{tx("orders.muddat")}</th>
                    <th style={{ padding: "12px 14px", fontSize: 12, fontWeight: 700, color: "#64748b" }}>{tx("orders.holat")}</th>
                    <th style={{ width: 70, textAlign: "right", padding: "12px 14px", fontSize: 12, fontWeight: 700, color: "#64748b" }}>{tx("orders.amallar")}</th>
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
                      <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ textAlign: "center", fontWeight: 700, fontSize: 13, color: "#0f172a", padding: "12px 14px" }}>
                          {rowNum}
                        </td>
                        <td
                          style={{ padding: "12px 14px", cursor: "pointer" }}
                          onClick={() => handleOpenView(item)}
                          title={tx("orders.batafsil_korish")}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13.5, color: "#2563eb", lineHeight: 1.3 }}>
                              {item.project_detail?.name || item.system_name || "—"}
                            </div>
                            {item.module && (
                              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                                {item.module}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                              {item.department || item.created_by_department || item.responsible_person || "—"}
                            </div>
                            {item.responsible_person && item.responsible_person !== (item.department || item.created_by_department) && (
                              <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2 }}>
                                {item.responsible_person}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                          <div style={{ fontSize: 13, color: "#334155" }}>
                            {fmtDate(item.created_at || item.request_date)}
                          </div>
                        </td>
                        <td style={{ maxWidth: 360, padding: "12px 14px" }}>
                          <div
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              fontSize: 13,
                              color: "#334155",
                            }}
                            title={item.requested_change || item.current_state || ""}
                          >
                            {item.requested_change || item.current_state || "—"}
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                          <div style={{ fontSize: 13, color: "#334155" }}>
                            {item.pm_deadline
                              ? fmtDate(item.pm_deadline)
                              : item.due_date
                              ? fmtDate(item.due_date)
                              : "—"}
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                          <OrderStatusBadge
                            status={item.status}
                            label={item.status_display}
                            hasPendingVersion={Boolean(item.has_pending_version)}
                          />
                        </td>
                        <td style={{ textAlign: "right", position: "relative", padding: "16px 18px" }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              color: "#94a3b8",
                              fontWeight: 700,
                              letterSpacing: "1px",
                              fontSize: 16,
                              lineHeight: 1,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveActionMenuId(activeActionMenuId === item.id ? null : item.id);
                            }}
                            title={tx("orders.amallar_menyusi")}
                          >
                            •••
                          </button>
                          {activeActionMenuId === item.id && (
                            <div
                              style={{
                                position: "absolute",
                                right: 16,
                                ...(idx >= Math.max(1, displayItems.length - 2)
                                  ? { bottom: "100%", marginBottom: 6 }
                                  : { top: "80%" }),
                                background: "#fff",
                                borderRadius: 8,
                                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                                border: "1px solid #e2e8f0",
                                zIndex: 100,
                                minWidth: 200,
                                padding: 6,
                                textAlign: "left",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5 }}
                                onClick={() => {
                                  setActiveActionMenuId(null);
                                  handleOpenView(item);
                                }}
                              >
                                {tx("orders.korish_va_malumot")}
                              </button>
                              {!item.assigned_pm && isPMOrAdmin && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{
                                    width: "100%",
                                    justifyContent: "flex-start",
                                    fontSize: 12.5,
                                    color: "#059669",
                                    fontWeight: 600,
                                  }}
                                  onClick={() => {
                                    setActiveActionMenuId(null);
                                    handleClaimOrder(item);
                                  }}
                                  disabled={claimingId === item.id}
                                >
                                  📌 {claimingId === item.id ? tx("orders.claim_submitting") : tx("orders.ishni_qabul_qilish")}
                                </button>
                              )}
                              {item.status === "READY_FOR_REVIEW" && (isSohaviyOrAdmin || (user && item.created_by === user.id)) && (
                                <>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5, color: "#16a34a" }}
                                    onClick={() => {
                                      setActiveActionMenuId(null);
                                      handleClientApprove(item);
                                    }}
                                  >
                                    {tx("orders.ishni_tasdiqlash")}
                                  </button>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5, color: "#d97706" }}
                                    onClick={() => {
                                      setActiveActionMenuId(null);
                                      setRejectModalItem(item);
                                      setRejectFeedbackNote("");
                                      setRejectError(null);
                                    }}
                                  >
                                    {tx("orders.kamchilik_bilan_qaytarish")}
                                  </button>
                                </>
                              )}
                              {isPMOrAdmin &&
                                (user?.is_platform_admin || user?.is_boss || item.assigned_pm === user?.id) &&
                                item.status !== "COMPLETED" &&
                                item.status !== "READY_FOR_REVIEW" &&
                                item.status !== "REJECTED" && (
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5, color: "#2563eb" }}
                                    onClick={() => {
                                      setActiveActionMenuId(null);
                                      setCompletionModalItem(item);
                                      setCompletionFile(null);
                                      setCompletionNote("");
                                      setCompletionError(null);
                                    }}
                                  >
                                    {tx("orders.hisobot_topshirish")}
                                  </button>
                                )}
                              {isPMOrAdmin && item.has_pending_version && (user?.is_platform_admin || user?.is_boss || !item.assigned_pm || item.assigned_pm === user?.id) && (
                                <>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5, color: "#16a34a", fontWeight: 600 }}
                                    onClick={() => {
                                      setActiveActionMenuId(null);
                                      handleOpenApproveVersion(item);
                                    }}
                                  >
                                    {tx("orders.yangi_tz_tasdiqlash")}
                                  </button>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5, color: "#dc2626" }}
                                    onClick={() => {
                                      setActiveActionMenuId(null);
                                      handleOpenRejectVersion(item);
                                    }}
                                  >
                                    {tx("orders.versiyani_rad_etish")}
                                  </button>
                                </>
                              )}
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5 }}
                                onClick={() => {
                                  setActiveActionMenuId(null);
                                  setViewingItem(item);
                                }}
                              >
                                🕒 {tx("orders.tarix", undefined, "Tarix (Word fayllar)")}
                              </button>
                              {item.status === "DRAFT" && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5, color: "#2563eb", fontWeight: 600 }}
                                  onClick={() => {
                                    setActiveActionMenuId(null);
                                    handleOpenView(item);
                                  }}
                                >
                                  {tx("orders.korib_chiqish_yuborish")}
                                </button>
                              )}
                              {canEditOrder(item) && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5 }}
                                  onClick={() => {
                                    setActiveActionMenuId(null);
                                    go(toEditOrder(item.id));
                                  }}
                                >
                                  {`✏️ ${tx("common.tahrirlash")}`}
                                </button>
                              )}
                              {item.status === "DRAFT" && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5, color: "#059669" }}
                                  onClick={() => {
                                    setActiveActionMenuId(null);
                                    void handleSendOrder(item);
                                  }}
                                >
                                  🚀 {tx("common.yuborish")}
                                </button>
                              )}
                              {canDeleteOrder(item) && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5, color: "#dc2626" }}
                                  onClick={() => {
                                    setActiveActionMenuId(null);
                                    void handleDeleteOrder(item);
                                  }}
                                >
                                  🗑️ {tx("common.ochirish")}
                                </button>
                              )}
                            </div>
                          )}
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
                {pages > 1 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      style={{
                        width: 32,
                        height: 32,
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        background: "#fff",
                        color: page <= 1 ? "#cbd5e1" : "#64748b",
                        cursor: page <= 1 ? "default" : "pointer",
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                    </button>
                    {Array.from({ length: Math.max(1, pages) }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPage(p)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          border: p === page ? "none" : "1px solid #e2e8f0",
                          background: p === page ? "#2563eb" : "#fff",
                          color: p === page ? "#fff" : "#0f172a",
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={page >= Math.max(1, pages)}
                      onClick={() => setPage((p) => Math.min(pages, p + 1))}
                      style={{
                        width: 32,
                        height: 32,
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        background: "#fff",
                        color: page >= Math.max(1, pages) ? "#cbd5e1" : "#64748b",
                        cursor: page >= Math.max(1, pages) ? "default" : "pointer",
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>
                )}
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
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600 }}
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
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 44, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>
                  {tx("orders.bosh_holat")}
                </div>
                {canCreateOrder && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{
                      borderRadius: 8,
                      padding: "9px 20px",
                      fontSize: 13.5,
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                    onClick={() => go(toNewOrder())}
                  >
                    <IconPlus size={16} /> {tx("orders.yangi_buyurtma")}
                  </button>
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
            style={{ maxWidth: 540, width: "95%" }}
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
                    {tx("orders.claim_modal_title")}
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
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                onClick={() => setClaimModalItem(null)}
                disabled={claimSubmitting}
                style={{ fontSize: 15, width: 30, height: 30, padding: 0 }}
                title={tx("common.bekor_qilish")}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleClaimSubmit}>
              <div className="modal-body" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                <div
                  style={{
                    background: "var(--accent-soft)",
                    border: "1px solid rgba(106, 141, 255, 0.2)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                >
                  <span style={{ fontSize: 16, lineHeight: 1.2 }}>💡</span>
                  <div style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.45 }}>
                    {tx("orders.claim_modal_desc")}
                  </div>
                </div>
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
                    <button
                      type="button"
                      className="btn btn-xs btn-ghost"
                      style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 600 }}
                      onClick={() => {
                        const d = claimModalItem.due_date?.split("T")[0];
                        if (d) setClaimDeadline(d);
                      }}
                    >
                      {tx("orders.claim_use_client_date")}
                    </button>
                  </div>
                )}
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12.5, color: "var(--text)", display: "block", marginBottom: 6 }}>
                    {tx("orders.boshlanish_sanasi", undefined, "Boshlanish sanasi")}
                  </label>
                  <input
                    type="date"
                    className="input"
                    value={claimStartDate}
                    onChange={(e) => setClaimStartDate(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="field">
                  <div className="row between middle" style={{ marginBottom: 6 }}>
                    <label style={{ fontWeight: 600, fontSize: 12.5, color: "var(--text)", margin: 0 }}>
                      {tx("orders.claim_deadline_label")} <span style={{ color: "var(--danger)" }}>*</span>
                    </label>
                    <div className="row middle" style={{ gap: 4 }}>
                      <span style={{ fontSize: 11, color: "var(--muted)", marginRight: 2 }}>{tx("orders.claim_quick_label")}</span>
                      <button
                        type="button"
                        className={`modal-quick-chip ${claimDuration === tx("orders.claim_3days_duration") ? "active" : ""}`}
                        onClick={() => applyQuickDeadline(3, tx("orders.claim_3days_duration"))}
                      >
                        {tx("orders.claim_3days")}
                      </button>
                      <button
                        type="button"
                        className={`modal-quick-chip ${claimDuration === tx("orders.claim_1week_duration") ? "active" : ""}`}
                        onClick={() => applyQuickDeadline(7, tx("orders.claim_1week_duration"))}
                      >
                        {tx("orders.claim_1week")}
                      </button>
                      <button
                        type="button"
                        className={`modal-quick-chip ${claimDuration === tx("orders.claim_2weeks_duration") ? "active" : ""}`}
                        onClick={() => applyQuickDeadline(14, tx("orders.claim_2weeks_duration"))}
                      >
                        {tx("orders.claim_2weeks")}
                      </button>
                      <button
                        type="button"
                        className={`modal-quick-chip ${claimDuration === tx("orders.claim_1month_duration") ? "active" : ""}`}
                        onClick={() => applyQuickDeadline(30, tx("orders.claim_1month_duration"))}
                      >
                        {tx("orders.claim_1month")}
                      </button>
                    </div>
                  </div>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().split("T")[0]}
                    className="input"
                    value={claimDeadline}
                    onChange={(e) => setClaimDeadline(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6, color: "var(--text)" }}>
                    {tx("orders.claim_duration_label")}
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder={tx("orders.claim_duration_placeholder")}
                    value={claimDuration}
                    onChange={(e) => setClaimDuration(e.target.value)}
                    style={{ width: "100%" }}
                  />
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                    {tx("orders.claim_duration_hint")}
                  </div>
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
              <div className="modal-footer row between middle" style={{ padding: "14px 20px" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setClaimModalItem(null)}
                  disabled={claimSubmitting}
                >
                  {tx("common.bekor_qilish")}
                </button>
                <button
                  type="submit"
                  className="btn btn-ok"
                  disabled={claimSubmitting || !claimDeadline}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontWeight: 600,
                  }}
                >
                  {claimSubmitting ? (
                    <>
                      <span className="spinner-xs" />
                      <span>{tx("orders.claim_submitting")}</span>
                    </>
                  ) : (
                    <>
                      <span>✓</span>
                      <span>{tx("orders.claim_submit_btn")}</span>
                    </>
                  )}
                </button>
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
                <strong>{viewingItem.system_name} — {viewingItem.module || tx("orders.tizim")}</strong>
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
                {isSohaviyOrAdmin && viewingItem.status !== "COMPLETED" && viewingItem.status !== "REJECTED" && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    style={{ background: "#0284c7", borderColor: "#0284c7" }}
                    onClick={() => handleOpenUploadVersion(viewingItem)}
                  >
                    📤 {tx("orders.upload_new_version")}
                  </button>
                )}
                {viewingItem.tz_file_url && (
                  <button
                    type="button"
                    onClick={() => setPreviewFile({
                      url: viewingItem.tz_file_url!,
                      name: viewingItem.tz_file_name || "TZ_fayli.docx",
                      size: viewingItem.tz_file_size_display,
                    })}
                    className="btn btn-sm btn-outline row middle"
                    style={{ gap: 4 }}
                    title={tx("orders.tz_preview_tooltip")}
                  >
                    <IconPaperclip size={14} /> {tx("orders.tz_hujjati")}
                  </button>
                )}
                {canEditOrder(viewingItem) && (
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => {
                      const oid = viewingItem.id;
                      setViewingItem(null);
                      go(toEditOrder(oid));
                    }}
                  >
                    {tx("common.tahrirlash")}
                  </button>
                )}
                <button className="btn btn-sm btn-ghost" onClick={() => setViewingItem(null)}>
                  ✕
                </button>
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
                        <button
                          type="button"
                          onClick={() => setPreviewFile({
                            url: viewingItem.pending_version!.tz_file_url!,
                            name: viewingItem.pending_version!.tz_file_name || `Yangi_TZ_v${viewingItem.pending_version!.version}.docx`,
                            size: viewingItem.pending_version!.tz_file_size_display,
                          })}
                          className="btn btn-sm btn-outline row middle"
                          style={{ gap: 4, background: "#fff" }}
                          title={tx("orders.yangi_tz_tooltip")}
                        >
                          <span>📄</span> {tx("orders.yangi_tz_fayli_btn")} (v{viewingItem.pending_version.version})
                        </button>
                      )}
                      {isPMOrAdmin && (user?.is_platform_admin || user?.is_boss || !viewingItem.assigned_pm || viewingItem.assigned_pm === user?.id) && (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm btn-ok"
                            onClick={() => handleOpenApproveVersion(viewingItem, viewingItem.pending_version?.version)}
                          >
                            ✓ {tx("orders.approve_version_btn")}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => handleOpenRejectVersion(viewingItem, viewingItem.pending_version?.version)}
                          >
                            ✕ {tx("orders.reject_version_btn")}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {!viewingItem.assigned_pm ? (
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
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      style={{ background: "#059669", borderColor: "#059669" }}
                      onClick={() => handleClaimOrder(viewingItem)}
                      disabled={claimingId === viewingItem.id}
                    >
                      📌 {claimingId === viewingItem.id ? tx("orders.claim_submitting") : tx("orders.ishni_qabul_qilish")}
                    </button>
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
                    gap: 8,
                    color: "#065f46",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <span>🎯</span>
                  <span>{tx("orders.masul_pm_label")} {viewingItem.assigned_pm_name || user?.full_name || tx("orders.siz")}</span>
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
                        <button
                          className="btn btn-sm btn-ok"
                          onClick={() => handleClientApprove(viewingItem)}
                          disabled={approvingId === viewingItem.id}
                        >
                          {tx("orders.ishni_qabul_qilish_yopish")}
                        </button>
                        <button
                          className="btn btn-sm btn-warning"
                          onClick={() => {
                            setRejectModalItem(viewingItem);
                            setRejectFeedbackNote("");
                            setRejectFeedbackFile(null);
                            setRejectIsNewTz(false);
                            setRejectError(null);
                          }}
                        >
                          {tx("orders.kamchilik_mavjud_qaytarish")}
                        </button>
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
                      <button
                        type="button"
                        className="btn btn-xs btn-outline"
                        onClick={() => setPreviewFile({
                          url: viewingItem.client_feedback_file_url!,
                          name: viewingItem.client_feedback_file_name || "Tuzatish_hujjati",
                          size: viewingItem.client_feedback_file_size_display,
                        })}
                        style={{ background: "#ffffff", borderColor: "#fcd34d", color: "#92400e", gap: 6, fontWeight: 600 }}
                      >
                        <span>📎</span>
                        <span>{tx("orders.tuzatish_hujjati_fayli")}: {viewingItem.client_feedback_file_name || tx("orders.fayl")}</span>
                        {viewingItem.client_feedback_file_size_display && <span style={{ opacity: 0.7 }}>({viewingItem.client_feedback_file_size_display})</span>}
                      </button>
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
                      <button
                        type="button"
                        onClick={() => setPreviewFile({
                          url: viewingItem.completion_file_url!,
                          name: viewingItem.completion_file_name || "Hisobot_hujjati.docx",
                          size: viewingItem.completion_file_size_display,
                        })}
                        className="btn btn-sm btn-primary"
                        title={tx("orders.hisobot_vebsaytda_ochish_tooltip")}
                      >
                        <span>📄</span> {tx("orders.hujjatni_korish")}
                      </button>
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
                {viewingItem.reason && (
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px dashed var(--border-color, #e2e8f0)", fontSize: 12, color: "var(--muted)" }}>
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
                    <button
                      type="button"
                      onClick={() => setPreviewFile({
                        url: viewingItem.tz_file_url!,
                        name: viewingItem.tz_file_name || "TZ_fayli.docx",
                        size: viewingItem.tz_file_size_display,
                      })}
                      className="btn btn-sm btn-primary"
                      style={{ background: "#16a34a", borderColor: "#16a34a" }}
                      title={tx("orders.tz_vebsaytda_ochish_tooltip")}
                    >
                      <span>📄</span> {tx("orders.tz_faylini_korish")}
                    </button>
                  )}
                  {isSohaviyOrAdmin && viewingItem.status !== "COMPLETED" && viewingItem.status !== "REJECTED" && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => handleOpenUploadVersion(viewingItem)}
                    >
                      📤 {tx("orders.yangi_versiya")}
                    </button>
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
                          <button
                            type="button"
                            onClick={() => setPreviewFile({
                              url: v.tz_file_url!,
                              name: v.tz_file_name || `TZ_v${v.version}.docx`,
                              size: v.tz_file_size_display,
                            })}
                            className="btn btn-xs btn-outline"
                            title={tx("orders.tz_vebsaytda_ochish_tooltip")}
                          >
                            <span>📄</span> {tx("orders.korish_btn")}
                          </button>
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
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => handleClaimOrder(viewingItem)}
                      disabled={claimingId === viewingItem.id}
                    >
                      📌 {claimingId === viewingItem.id ? tx("orders.claim_submitting") : tx("orders.ishni_qabul_qilish")}
                    </button>
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
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        disabled={pmSaveLoading}
                      >
                        {pmSaveLoading ? tx("common.saqlanmoqda") : tx("orders.pm_qarorini_saqlash")}
                      </button>
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
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            setCompletionModalItem(viewingItem);
                            setCompletionFile(null);
                            setCompletionNote("");
                            setCompletionError(null);
                          }}
                        >
                          📁 {tx("orders.hisobot_topshirish_btn")}
                        </button>
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
              <button className="btn btn-ghost" onClick={() => setViewingItem(null)}>
                {tx("common.yopish")}
              </button>
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
              <button className="btn btn-sm btn-ghost" onClick={() => setCompletionModalItem(null)}>
                ✕
              </button>
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
                    <label className="btn btn-outline" style={{ cursor: "pointer", padding: "6px 12px", fontSize: 13, background: "#fff", display: "inline-flex", alignItems: "center", margin: 0 }}>
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
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setCompletionModalItem(null)}
                  disabled={completionSubmitting}
                >
                  {tx("common.bekor_qilish")}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={completionSubmitting}
                >
                  {completionSubmitting ? tx("orders.topshirilmoqda") : tx("orders.boshqarma_tasdigiga_topshirish")}
                </button>
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
              <button className="btn btn-sm btn-ghost" onClick={() => setRejectModalItem(null)}>
                ✕
              </button>
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
                    <label className="btn btn-outline" style={{ cursor: "pointer", padding: "6px 12px", fontSize: 13, background: "#fff", display: "inline-flex", alignItems: "center", margin: 0 }}>
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
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setRejectModalItem(null)}
                  disabled={rejectSubmitting}
                >
                  {tx("common.bekor_qilish")}
                </button>
                <button
                  type="submit"
                  className="btn btn-warning"
                  disabled={rejectSubmitting || (!rejectFeedbackNote.trim() && !rejectFeedbackFile)}
                >
                  {rejectSubmitting ? tx("orders.qaytarilmoqda") : tx("orders.qayta_ishlashga_qaytarish")}
                </button>
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
              <button className="btn btn-sm btn-ghost" onClick={() => setUploadVersionModalItem(null)}>
                ✕
              </button>
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
                    <label className="btn btn-outline" style={{ cursor: "pointer", padding: "6px 12px", fontSize: 13, background: "#fff", display: "inline-flex", alignItems: "center", margin: 0 }}>
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
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setUploadVersionModalItem(null)}
                    disabled={versionSubmitting}
                  >
                    {tx("common.bekor_qilish")}
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={versionSubmitting || !versionFile || !versionChangeNote.trim()}
                  >
                    {versionSubmitting ? tx("orders.yuborilmoqda") : tx("orders.yuborish_pm_korib_chiqish")}
                  </button>
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
                <button className="btn btn-sm btn-ghost" onClick={() => setApproveVersionModalItem(null)}>
                  ✕
                </button>
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
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setApproveVersionModalItem(null)}
                    disabled={approveSubmitting}
                  >
                    {tx("common.bekor_qilish")}
                  </button>
                  <button
                    type="submit"
                    className="btn btn-ok"
                    disabled={approveSubmitting}
                  >
                    {approveSubmitting ? tx("orders.tasdiqlanmoqda") : tx("orders.tasdiqlash_va_yangi_tz")}
                  </button>
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
                <button className="btn btn-sm btn-ghost" onClick={() => setRejectVersionModalItem(null)}>
                  ✕
                </button>
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
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setRejectVersionModalItem(null)}
                    disabled={rejectVersionSubmitting}
                  >
                    {tx("common.bekor_qilish")}
                  </button>
                  <button
                    type="submit"
                    className="btn btn-danger"
                    disabled={rejectVersionSubmitting || !rejectVersionReason.trim()}
                  >
                    {rejectVersionSubmitting ? tx("orders.rad_etilmoqda") : tx("orders.versiyani_rad_etish_btn")}
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
  }
