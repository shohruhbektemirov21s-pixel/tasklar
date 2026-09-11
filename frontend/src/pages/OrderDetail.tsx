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
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError, listOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import {
  claimOrder,
  clientApprove,
  clientReject,
  deleteOrder,
  getOrder,
  sendOrder,
  setPmDecision,
  uploadVersion,
  approveVersion,
  rejectVersion,
  createOrderTask,
} from "@/api/orders";
import type { ChangeRequestItem, UserBrief } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { tx } from "@/i18n";
import { confirmDialog } from "@/components/Confirm";
import { PageHead } from "@/components/Layout";
import {
  IconBack,
  IconDownload,
} from "@/components/icons";
import { useDebouncedLive } from "@/realtime/RealtimeContext";
import { Card, Empty, ErrorMsg, Loading, OkMsg, fmtDate, fmtDateTime, timeAgo } from "@/components/ui";
import { toEditOrder, toOrders, toProject, toTask, useEntityNum, useGo } from "@/nav";
import { OrderStatusBadge } from "./ChangeRequests";

export default function OrderDetail() {
  const { user, meta } = useAuth();
  const id = useEntityNum("order");
  const go = useGo();

  const [item, setItem] = useState<ChangeRequestItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);

  // Kamchilik bilan qaytarish modali
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  // Tavsifni to'liq ochish / qisqartirish holati
  const [expandDesc, setExpandDesc] = useState(false);

  // PM tezkor boshqaruv paneli
  const [pmPanelOpen, setPmPanelOpen] = useState(false);
  const [pmStatus, setPmStatus] = useState<ChangeRequestItem["status"]>("ACCEPTED");
  const [pmDeadline, setPmDeadline] = useState("");
  const [pmNotes, setPmNotes] = useState("");
  const [pmSaving, setPmSaving] = useState(false);

  // PM claim modali
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [claimDuration, setClaimDuration] = useState("");
  const [claimDeadlineInput, setClaimDeadlineInput] = useState("");
  const [claimDeveloper, setClaimDeveloper] = useState<number | null>(null);
  const [claimNotesInput, setClaimNotesInput] = useState("");
  const [claimSubmitting, setClaimSubmitting] = useState(false);

  const { data: usersData } = useFetch<{ count: number; results: UserBrief[] } | UserBrief[]>("/users/", { is_active: true });
  const usersList: UserBrief[] = useMemo(() => (usersData ? listOf<UserBrief>(usersData) : []), [usersData]);
  const developersList = useMemo(
    () => usersList.filter((u) => !u.is_sohaviy_boshqarma && u.specialty !== "SOHAVIY"),
    [usersList]
  );

  // Yangi versiya yuborish modali
  const [versionModal, setVersionModal] = useState(false);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionNote, setVersionNote] = useState("");
  const [versionSubmitting, setVersionSubmitting] = useState(false);

  // Yangi TZ versiyasini tasdiqlash modali (PM)
  const [approveVersionModal, setApproveVersionModal] = useState(false);
  const [approveVersionTarget, setApproveVersionTarget] = useState<number | null>(null);
  const [approveDeadline, setApproveDeadline] = useState("");
  const [approveDuration, setApproveDuration] = useState("");
  const [approveDeveloper, setApproveDeveloper] = useState<number | null>(null);
  const [approveNote, setApproveNote] = useState("");
  const [approveSubmitting, setApproveSubmitting] = useState(false);

  // Yangi TZ versiyasini rad etish modali (PM)
  const [rejectVersionModal, setRejectVersionModal] = useState(false);
  const [rejectVersionTarget, setRejectVersionTarget] = useState<number | null>(null);
  const [rejectVersionReason, setRejectVersionReason] = useState("");
  const [rejectVersionSubmitting, setRejectVersionSubmitting] = useState(false);

  // Eski TZ versiyalari tarixi (yig'ilgan / ochilgan)
  const [historyOpen, setHistoryOpen] = useState(false);

  // Buyurtma bo'yicha yangi vazifa (Task) yaratish modali
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskAssignee, setTaskAssignee] = useState<number | null>(null);
  const [taskPriority, setTaskPriority] = useState<number>(2);
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskType, setTaskType] = useState("FEATURE");
  const [taskSubmitting, setTaskSubmitting] = useState(false);

  // Eski TZ versiyalari tarixi (amaldagi joriy versiyadan tashqari)
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
      setError(err instanceof ApiError ? err.message : "Buyurtma ma'lumotlarini yuklab bo'lmadi.");
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

  const canEdit = false;
  const canDelete = false;

  const [sendingOrder, setSendingOrder] = useState(false);

  // Qoralama buyurtmani yuborish
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
    } catch (err: any) {
      setActionError(err?.message || "Buyurtmani yuborishda xatolik yuz berdi.");
    } finally {
      setSendingOrder(false);
    }
  }

  // Buyurtmani o'chirish
  async function handleDelete() {
    if (!item) return;
    const ok = await confirmDialog({
      title: `«${item.request_no}» buyurtmasi o'chirilsinmi?`,
      body: "Ushbu amalni ortga qaytarib bo'lmaydi.",
      confirmText: "O'chirish",
      danger: true,
    });
    if (!ok) return;

    try {
      setActionError(null);
      await deleteOrder(item.id);
      go(toOrders());
    } catch (err: any) {
      setActionError(err?.message || "O'chirishda xatolik yuz berdi.");
    }
  }

  // PM ishni o'z zimmasiga olishi (Claim)
  function handleOpenClaim() {
    if (!item) return;
    setClaimDuration(item.pm_estimated_duration || "");
    setClaimDeadlineInput(item.pm_deadline || item.due_date || "");
    setClaimDeveloper(item.assigned_developer || null);
    setClaimNotesInput("");
    setClaimModalOpen(true);
  }

  function applyQuickDeadline(days: number, durationText: string) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const iso = d.toISOString().split("T")[0];
    setClaimDeadlineInput(iso);
    if (!claimDuration.trim()) {
      setClaimDuration(durationText);
    }
  }

  async function handleClaimSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    setClaimSubmitting(true);
    setActionError(null);
    try {
      const updated = await claimOrder(item.id, {
        pm_estimated_duration: claimDuration.trim() || undefined,
        pm_deadline: claimDeadlineInput || undefined,
        assigned_developer: claimDeveloper || null,
        pm_notes: claimNotesInput.trim() || undefined,
      });
      setItem(updated);
      setPmStatus(updated.status);
      setPmDeadline(updated.pm_deadline || "");
      setPmNotes(updated.pm_notes || "");
      setClaimModalOpen(false);
      setActionOk("Buyurtma muvaffaqiyatli qabul qilindi.");
    } catch (err: any) {
      setActionError(err?.message || "Qabul qilishda xatolik yuz berdi.");
    } finally {
      setClaimSubmitting(false);
    }
  }

  // PM qarori va muddatni saqlash
  async function handleSavePM(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    setPmSaving(true);
    setActionError(null);
    try {
      const updated = await setPmDecision(item.id, {
        status: pmStatus,
        pm_deadline: pmDeadline || undefined,
        pm_notes: pmNotes.trim() || undefined,
      });
      setItem(updated);
      setPmPanelOpen(false);
      setActionOk("PM qarori va muddatlar muvaffaqiyatli saqlandi.");
    } catch (err: any) {
      setActionError(err?.message || "Qarorni saqlashda xatolik yuz berdi.");
    } finally {
      setPmSaving(false);
    }
  }

  // Boshqarma ishni tasdiqlashi
  async function handleClientApprove() {
    if (!item) return;
    const ok = await confirmDialog({
      title: `Buyurtma «${item.request_no}» qabul qilinsinmi?`,
      body: "Ish to'liq yakunlangan deb hisoblanadi va buyurtma yopiladi.",
      confirmText: "Tasdiqlash",
    });
    if (!ok) return;
    setActionError(null);
    try {
      const updated = await clientApprove(item.id);
      setItem(updated);
      setActionOk("Buyurtma muvaffaqiyatli tasdiqlandi va yakunlandi.");
    } catch (err: any) {
      setActionError(err?.message || "Tasdiqlashda xatolik yuz berdi.");
    }
  }

  // Boshqarma qaytarishi (modal ochish)
  function handleOpenReject() {
    setRejectReason("");
    setRejectModalOpen(true);
  }

  async function handleRejectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item || !rejectReason.trim()) return;
    setRejectSubmitting(true);
    setActionError(null);
    try {
      const updated = await clientReject(item.id, rejectReason.trim());
      setItem(updated);
      setRejectModalOpen(false);
      setRejectReason("");
      setActionOk("Buyurtma kamchiliklar bilan qaytarildi.");
    } catch (err: any) {
      setActionError(err?.message || "Qaytarishda xatolik yuz berdi.");
    } finally {
      setRejectSubmitting(false);
    }
  }

  // Yangi TZ versiya yuborish
  async function handleUploadVersionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item || !versionFile || !versionNote.trim()) return;
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
    } catch (err: any) {
      setActionError(err?.message || "Yuklashda xatolik yuz berdi.");
    } finally {
      setVersionSubmitting(false);
    }
  }

  // Yangi TZ versiyasini tasdiqlashni ochish (PM)
  function handleOpenApproveVersion(verNum?: number) {
    setApproveVersionTarget(verNum || item?.pending_version?.version || null);
    setApproveDeadline(item?.pm_deadline || item?.due_date || "");
    setApproveDuration(item?.pm_estimated_duration || "");
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
        pm_estimated_duration: approveDuration.trim() || undefined,
        pm_deadline: approveDeadline || undefined,
        assigned_developer: approveDeveloper,
      });
      setItem(updated);
      setApproveVersionModal(false);
      setActionOk("Yangi TZ versiyasi muvaffaqiyatli tasdiqlandi va amalda kuchga kirdi!");
    } catch (err: any) {
      setActionError(err?.message || "Versiyani tasdiqlashda xatolik yuz berdi.");
    } finally {
      setApproveSubmitting(false);
    }
  }

  // Yangi TZ versiyasini rad etishni ochish (PM)
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
    } catch (err: any) {
      setActionError(err?.message || "Versiyani rad etishda xatolik yuz berdi.");
    } finally {
      setRejectVersionSubmitting(false);
    }
  }

  // Buyurtma bo'yicha yangi vazifa yaratish handler
  function handleOpenCreateTask() {
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
      setActionOk("Vazifa muvaffaqiyatli yaratildi va buyurtmaga biriktirildi!");
    } catch (err: any) {
      setActionError(err?.message || "Vazifa yaratishda xatolik yuz berdi.");
    } finally {
      setTaskSubmitting(false);
    }
  }

  if (!id) {
    return (
      <>
        <PageHead title={<strong>Buyurtma tafsilotlari</strong>} />
        <div className="content" style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px" }}>
          <Card padded>
            <Empty
              icon="📄"
              title="Buyurtma tanlanmagan"
              text="Buyurtmalar ro'yxatidan biror buyurtmani tanlang."
            >
              <button className="btn btn-primary" onClick={() => go(toOrders())}>
                Buyurtmalar ro'yxatiga qaytish
              </button>
            </Empty>
          </Card>
        </div>
      </>
    );
  }

  if (loading && !item) {
    return (
      <>
        <PageHead title={<strong>Buyurtma tafsilotlari</strong>} />
        <div className="content" style={{ padding: "40px 16px", textAlign: "center" }}>
          <Loading text="Buyurtma ma'lumotlari yuklanmoqda..." />
        </div>
      </>
    );
  }

  if (error || !item) {
    return (
      <>
        <PageHead title={<strong>Buyurtma tafsilotlari</strong>} />
        <div className="content" style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px" }}>
          <ErrorMsg error={error || "Buyurtma topilmadi"} />
          <button className="btn" style={{ marginTop: 12 }} onClick={() => go(toOrders())}>
            ← Buyurtmalar ro'yxatiga qaytish
          </button>
        </div>
      </>
    );
  }

  const descText = item.requested_change || item.current_state || "Tavsif kiritilmagan";
  const isLongText = descText.length > 180;

  return (
    <>
      <PageHead
        title={
          <div className="row middle" style={{ gap: 10 }}>
            <span>{item.request_no}</span>
            <OrderStatusBadge status={item.status} label={item.status_display} />
          </div>
        }
      />

      <div
        className="content"
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <ErrorMsg error={actionError} />
        <OkMsg text={actionOk} />

        {/* 1. YUQORI QISM: Navigatsiya, Raqam, Status va Amallar */}
        <div
          className="row between middle"
          style={{
            flexWrap: "wrap",
            gap: 10,
            padding: "4px 0",
          }}
        >
          <div className="row middle" style={{ gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-sm btn-ghost row middle"
              style={{ gap: 6, padding: "5px 10px", fontWeight: 600, color: "var(--brand)" }}
              onClick={() => go(toOrders())}
            >
              <IconBack size={14} /> {tx("orders.buyurtmalarga_qaytish")}
            </button>

            <span className="badge badge-brand" style={{ fontSize: 12, fontWeight: 700 }}>
              {item.request_no}
            </span>

            {(item.version || 1) > 1 && (
              <span
                className="badge"
                style={{ fontSize: 11, fontWeight: 700 }}
              >
                v{item.version}
              </span>
            )}

            <OrderStatusBadge status={item.status} label={item.status_display} />
          </div>

          <div className="row middle" style={{ gap: 8 }}>
            {item.status === "DRAFT" && (
              <button
                type="button"
                className="btn btn-sm btn-primary row middle"
                style={{ gap: 6 }}
                onClick={() => void handleSendDraftOrder()}
                disabled={sendingOrder}
              >
                <span>🚀</span>
                <span>{sendingOrder ? "Yuborilmoqda..." : tx("orders.send_order")}</span>
              </button>
            )}

            {canEdit && (
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => go(toEditOrder(item.id))}
              >
                {tx("common.tahrirlash")}
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ color: "var(--danger, #dc2626)", padding: "5px 8px" }}
                onClick={() => void handleDelete()}
                title={tx("common.ochirish")}
              >
                {tx("common.ochirish")}
              </button>
            )}
          </div>
        </div>

        {/* Yangi TZ fayli / versiyasi yuklanganda PM ko'rib chiqishi uchun banner */}
        {item.pending_version && (
          <div
            style={{
              background: "linear-gradient(135deg, rgba(59, 130, 246, 0.09) 0%, rgba(99, 102, 241, 0.09) 100%)",
              border: "1px solid rgba(59, 130, 246, 0.35)",
              borderRadius: 10,
              padding: "14px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div className="row between middle" style={{ flexWrap: "wrap", gap: 10 }}>
              <div className="row middle" style={{ gap: 10 }}>
                <span style={{ fontSize: 24 }}>📄</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
                    {tx("orders.new_tz_uploaded_title", { v: item.pending_version.version })}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    Yuklagan: <strong>{item.pending_version.uploaded_by_name || "Buyurtmachi"}</strong> • {fmtDateTime(item.pending_version.created_at)}
                  </div>
                </div>
              </div>

              <div className="row middle" style={{ gap: 8, flexWrap: "wrap" }}>
                {item.pending_version.tz_file_url && (
                  <a
                    href={item.pending_version.tz_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm btn-outline row middle"
                    style={{ gap: 6 }}
                    download
                  >
                    <IconDownload size={13} /> {item.pending_version.tz_file_name || "Yangi TZ faylini yuklab olish"}
                  </a>
                )}
                {isPMOrAdmin && (
                  <>
                    <button
                      type="button"
                      className="btn btn-sm btn-ok row middle"
                      style={{ gap: 6, fontWeight: 600 }}
                      onClick={() => handleOpenApproveVersion(item.pending_version?.version)}
                    >
                      <span>✓</span>
                      <span>{tx("orders.approve_tz_btn")}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger row middle"
                      style={{ gap: 6 }}
                      onClick={() => handleOpenRejectVersion(item.pending_version?.version)}
                    >
                      <span>✕</span>
                      <span>{tx("orders.reject_tz_btn")}</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {item.pending_version.change_note && (
              <div
                style={{
                  background: "var(--surface)",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 12.5,
                  borderLeft: "3px solid var(--brand)",
                  color: "var(--text)",
                }}
              >
                <strong>O'zgarishlar tavsifi (sababi): </strong>
                <span>{item.pending_version.change_note}</span>
              </div>
            )}
          </div>
        )}

        {/* Qoralama (DRAFT) holatidagi buyurtma banneri */}
        {item.status === "DRAFT" && (
          <div
            style={{
              background: "rgba(234, 179, 8, 0.08)",
              border: "1px solid rgba(234, 179, 8, 0.35)",
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
                <strong style={{ color: "#b45309" }}>{tx("orders.status_draft")}: </strong>
                <span style={{ fontSize: 13, color: "var(--color-fg-default)" }}>
                  {tx("orders.draft_badge_desc")}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSendDraftOrder()}
              disabled={sendingOrder}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}
            >
              <span>🚀</span>
              <span>{sendingOrder ? "Yuborilmoqda..." : tx("orders.send_order")}</span>
            </button>
          </div>
        )}

        {/* PM Ishni o'z zimmasiga olish banneri */}
        {!item.assigned_pm && isPMOrAdmin && item.status !== "DRAFT" && (
          <div
            style={{
              background: "var(--surface-2, #f8fafc)",
              border: "1px solid var(--border-color, #e2e8f0)",
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
            <button
              type="button"
              className="btn btn-xs btn-primary"
              onClick={handleOpenClaim}
            >
              {tx("orders.ishni_qabul_qilish")}
            </button>
          </div>
        )}

        {/* Boshqarma tasdig'i kutilayotgan holat banneri */}
        {item.status === "READY_FOR_REVIEW" && (
          <div
            style={{
              background: "var(--surface-2, #f8fafc)",
              border: "1px solid var(--border-color, #e2e8f0)",
              borderRadius: 8,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}>
                {tx("orders.boshqarma_tasdigi_kutilmoqda")}
              </div>
              {item.completion_note && (
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  {tx("orders.pm_izohi")}: {item.completion_note}
                </div>
              )}
            </div>
            {isSohaviyOrAdmin && (
              <div className="row middle" style={{ gap: 8 }}>
                <button type="button" className="btn btn-xs btn-ok" onClick={handleClientApprove}>
                  {tx("common.tasdiqlash")}
                </button>
                <button type="button" className="btn btn-xs btn-warning" onClick={handleOpenReject}>
                  {tx("common.qaytarish")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Rad etilgan buyurtma sababi banneri */}
        {item.status === "REJECTED" && (item.pm_notes || item.client_feedback_note) && (
          <div
            style={{
              background: "var(--surface-2, #f8fafc)",
              border: "1px solid #fecaca",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              color: "var(--danger, #dc2626)",
            }}
          >
            <strong>{tx("orders.rad_etish_sababi")}: </strong>
            <span>{item.pm_notes || item.client_feedback_note}</span>
          </div>
        )}

        {/* YAGONA ASOSIY KARTA (Barcha ma'lumotlar bitta ixcham, toza blokda) */}
        <section
          className="card padded"
          style={{
            borderRadius: 10,
            border: "1px solid var(--border-color, #e2e8f0)",
            padding: "16px 18px",
          }}
        >
          {/* Sarlavha va Loyiha */}
          <div style={{ borderBottom: "1px solid var(--border-color, #e2e8f0)", paddingBottom: 12, marginBottom: 12 }}>
            <span className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {tx("orders.buyurtma_nomi")}
            </span>
            <h1
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: "var(--text)",
                margin: "3px 0 0 0",
                lineHeight: 1.3,
              }}
            >
              {item.system_name} {item.module ? `— ${item.module}` : ""}
            </h1>
            {item.project_detail && (
              <div style={{ marginTop: 4, fontSize: 12.5 }}>
                <span className="muted">{tx("orders.loyiha")}: </span>
                <Link
                  {...toProject(item.project_detail.id)}
                  style={{
                    fontWeight: 600,
                    color: "var(--brand)",
                    textDecoration: "none",
                  }}
                >
                  {item.project_detail.name}
                </Link>
                <span className="badge badge-brand" style={{ fontSize: 10, padding: "1px 5px", marginLeft: 6 }}>
                  {item.project_detail.key}
                </span>
              </div>
            )}
          </div>

          {/* Parametrlar to'plami (Ixcham Grid) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "10px 16px",
              fontSize: 12.5,
              paddingBottom: 12,
              borderBottom: "1px solid var(--border-color, #e2e8f0)",
            }}
          >
            <div>
              <span className="muted" style={{ fontSize: 11 }}>{tx("orders.soha_mijoz")}:</span>
              <div style={{ fontWeight: 600, color: "var(--text)", marginTop: 2 }}>
                {item.responsible_person || "—"}
                {item.department && (
                  <span className="muted" style={{ fontWeight: 400, marginLeft: 4 }}>
                    ({item.department})
                  </span>
                )}
              </div>
            </div>

            <div>
              <span className="muted" style={{ fontSize: 11 }}>{tx("orders.masul_pm")}:</span>
              <div style={{ fontWeight: 600, color: "var(--text)", marginTop: 2 }}>
                {item.assigned_pm_name || <span className="muted">{tx("orders.biriktirilmagan")}</span>}
              </div>
            </div>

            <div>
              <span className="muted" style={{ fontSize: 11 }}>{tx("orders.masul_dasturchi")}:</span>
              <div style={{ fontWeight: 600, color: "var(--text)", marginTop: 2 }}>
                {item.assigned_developer_name || <span className="muted">{tx("orders.biriktirilmagan")}</span>}
              </div>
            </div>

            <div>
              <span className="muted" style={{ fontSize: 11 }}>{tx("orders.muhimlik_turi")}:</span>
              <div style={{ marginTop: 2 }}>
                <span
                  className={`badge ${
                    item.priority === "URGENT"
                      ? "badge-danger"
                      : item.priority === "HIGH"
                      ? "badge-warning"
                      : item.priority === "MEDIUM"
                      ? "badge-brand"
                      : ""
                  }`}
                  style={{ fontSize: 11 }}
                >
                  {item.priority_display || item.priority}
                </span>
              </div>
            </div>

            <div>
              <span className="muted" style={{ fontSize: 11 }}>{tx("orders.soralgan_muddat")}:</span>
              <div style={{ fontWeight: 600, color: "var(--text)", marginTop: 2 }}>
                {item.due_date ? fmtDate(item.due_date) : "—"}
              </div>
            </div>

            <div>
              <span className="muted" style={{ fontSize: 11 }}>{tx("orders.pm_belgilagan_muddat")}:</span>
              <div style={{ fontWeight: 600, color: item.pm_deadline ? "var(--brand)" : "var(--text)", marginTop: 2 }}>
                {item.pm_deadline ? fmtDate(item.pm_deadline) : item.pm_estimated_duration || <span className="muted">{tx("orders.kutilmoqda")}</span>}
              </div>
            </div>

            <div>
              <span className="muted" style={{ fontSize: 11 }}>{tx("orders.yaratilgan_sana_vaqti")}:</span>
              <div style={{ fontWeight: 500, color: "var(--text)", marginTop: 2 }}>
                {fmtDateTime(item.created_at || item.request_date)}
              </div>
            </div>

            <div>
              <span className="muted" style={{ fontSize: 11 }}>{tx("orders.oxirgi_yangilanish")}:</span>
              <div style={{ color: "var(--muted)", marginTop: 2 }}>
                {timeAgo(item.updated_at || item.created_at)}
              </div>
            </div>
          </div>

          {/* Tavsif va Talablar */}
          <div style={{ paddingTop: 12, paddingBottom: 12, borderBottom: "1px solid var(--border-color, #e2e8f0)" }}>
            <div className="row between middle" style={{ marginBottom: 4 }}>
              <span className="muted" style={{ fontSize: 11 }}>
                {tx("orders.tavsif_va_talablar")}:
              </span>
              {isLongText && (
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  style={{ fontSize: 11, padding: "2px 6px" }}
                  onClick={() => setExpandDesc((v) => !v)}
                >
                  {expandDesc ? "Qisqartirish" : "Batafsil ko'rish"}
                </button>
              )}
            </div>

            <div
              style={{
                fontSize: 13,
                color: "var(--text)",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                display: !expandDesc && isLongText ? "-webkit-box" : "block",
                WebkitLineClamp: !expandDesc && isLongText ? 3 : undefined,
                WebkitBoxOrient: !expandDesc && isLongText ? "vertical" : undefined,
                overflow: !expandDesc && isLongText ? "hidden" : "visible",
              }}
            >
              {descText}
            </div>

            {item.reason && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: "var(--muted)",
                }}
              >
                <strong>{tx("orders.asos_sabab")}:</strong> {item.reason}
              </div>
            )}
          </div>

          {/* Izohlar / Ko'rsatmalar (agar mavjud bo'lsa) */}
          {(item.pm_notes || item.client_feedback_note || item.completion_note) && (
            <div style={{ paddingTop: 12, paddingBottom: 12, borderBottom: "1px solid var(--border-color, #e2e8f0)", display: "flex", flexDirection: "column", gap: 8 }}>
              {item.pm_notes && (
                <div style={{ fontSize: 12.5, background: "var(--surface-2, #f8fafc)", padding: "8px 12px", borderRadius: 6 }}>
                  <strong>{tx("orders.pm_izohi")}:</strong> {item.pm_notes}
                </div>
              )}
              {item.client_feedback_note && (
                <div style={{ fontSize: 12.5, background: "var(--surface-2, #f8fafc)", padding: "8px 12px", borderRadius: 6 }}>
                  <strong>{tx("orders.boshqarma_etirozi")}:</strong> {item.client_feedback_note}
                </div>
              )}
              {item.completion_note && (
                <div style={{ fontSize: 12.5, background: "var(--surface-2, #f8fafc)", padding: "8px 12px", borderRadius: 6 }}>
                  <strong>{tx("orders.hisobot_izohi")}:</strong> {item.completion_note}
                </div>
              )}
            </div>
          )}

          {/* Hujjatlar va Qo'shimcha Amallar */}
          <div className="row between middle" style={{ paddingTop: 12, flexWrap: "wrap", gap: 10 }}>
            <div className="row middle" style={{ gap: 12, flexWrap: "wrap" }}>
              <div>
                <span className="muted" style={{ fontSize: 11.5, marginRight: 6 }}>{tx("orders.biriktirilgan_fayllar")}:</span>
                {item.attachments && item.attachments.length > 0 ? (
                  <div style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
                    {item.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-xs btn-outline"
                        download
                        title={att.original_name}
                      >
                        <IconDownload size={12} /> {att.original_name} {att.size_display ? `(${att.size_display})` : ""}
                      </a>
                    ))}
                  </div>
                ) : item.tz_file_url ? (
                  <a
                    href={item.tz_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-xs btn-outline"
                    download
                  >
                    <IconDownload size={12} /> {item.tz_file_name || tx("orders.faylni_yuklab_olish")} {item.tz_file_size_display ? `(${item.tz_file_size_display})` : ""}
                  </a>
                ) : (
                  <span className="muted" style={{ fontSize: 12 }}>{tx("orders.fayl_biriktirilmagan")}</span>
                )}
              </div>

              {item.completion_file_url && (
                <div>
                  <span className="muted" style={{ fontSize: 11.5, marginRight: 6 }}>{tx("orders.hisobot_fayli")}:</span>
                  <a
                    href={item.completion_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-xs btn-outline"
                    download
                  >
                    <IconDownload size={12} /> {item.completion_file_name || tx("orders.faylni_yuklab_olish")}
                  </a>
                </div>
              )}
            </div>

            <div className="row middle" style={{ gap: 8 }}>
              {isSohaviyOrAdmin && item.status !== "COMPLETED" && item.status !== "REJECTED" && (
                <button
                  type="button"
                  className="btn btn-xs btn-outline"
                  onClick={() => setVersionModal(true)}
                >
                  + {tx("orders.yangi_tz_versiyasi")}
                </button>
              )}

              {isPMOrAdmin && (item.assigned_pm === user?.id || user?.is_platform_admin || user?.is_boss) && (
                <button
                  type="button"
                  className="btn btn-xs btn-outline"
                  onClick={() => setPmPanelOpen((v) => !v)}
                >
                  {pmPanelOpen ? tx("orders.pm_panelni_yopish") : tx("orders.pm_holat_muddatni_ozgartirish")}
                </button>
              )}
            </div>
          </div>

          {/* Avvalgi (eski) TZ versiyalari tarixi */}
          {olderVersions.length > 0 && (
            <div
              style={{
                marginTop: 14,
                paddingTop: 12,
                borderTop: "1px dashed var(--border-color, #e2e8f0)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                role="button"
                tabIndex={0}
                className="clickable"
                onClick={() => setHistoryOpen((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setHistoryOpen((v) => !v);
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: historyOpen ? "var(--surface-2, #f8fafc)" : "var(--surface, #ffffff)",
                  border: "1px solid var(--border-color, #e2e8f0)",
                  cursor: "pointer",
                  userSelect: "none",
                  transition: "background 0.15s ease, border-color 0.15s ease",
                }}
              >
                <div className="row middle" style={{ gap: 8, fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>
                  <span style={{ fontSize: 14 }}>📜</span>
                  <span>{tx("orders.eski_tz_tarixi")}</span>
                </div>

                <div className="row middle" style={{ gap: 8 }}>
                  <span
                    className="badge"
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "1px 8px",
                      borderRadius: 10,
                    }}
                  >
                    {olderVersions.length} ta
                  </span>
                  <span
                    className="muted"
                    style={{
                      fontSize: 16,
                      lineHeight: 1,
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                  >
                    {historyOpen ? "▴" : "▾"}
                  </span>
                </div>
              </div>

              {historyOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                  {olderVersions.map((ver) => {
                    const isRejected = ver.status === "REJECTED";
                    return (
                      <div
                        key={ver.id || ver.version}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "1px solid var(--border-color, #e2e8f0)",
                          background: isRejected ? "rgba(239, 68, 68, 0.03)" : "var(--surface-2, #f8fafc)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          gap: 10,
                        }}
                      >
                        <div className="row middle" style={{ gap: 8, flex: 1, minWidth: 260, flexWrap: "wrap" }}>
                          <span
                            style={{
                              fontFamily: "var(--mono)",
                              fontWeight: 700,
                              fontSize: 11,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: isRejected ? "var(--danger-soft, #fee2e2)" : "var(--surface-3, #e2e8f0)",
                              color: isRejected ? "var(--danger, #ef4444)" : "var(--text-muted, #64748b)",
                            }}
                          >
                            v{ver.version}
                          </span>

                          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>
                            {ver.tz_file_name || `TZ v${ver.version}`}
                          </span>

                          {ver.tz_file_size_display && (
                            <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                              ({ver.tz_file_size_display})
                            </span>
                          )}

                          <span
                            className={`badge ${
                              isRejected
                                ? "badge-danger"
                                : ver.status === "CANCELLED"
                                ? "badge-ghost"
                                : "badge-outline"
                            }`}
                            style={{ fontSize: 10.5 }}
                          >
                            {isRejected
                              ? "Rad etilgan"
                              : ver.version === 1
                              ? "Dastlabki TZ (Eski versiya)"
                              : "Eski versiya (Bekor qilingan)"}
                          </span>

                          {ver.uploaded_by_name && (
                            <span style={{ fontSize: 11, color: "var(--muted)" }}>
                              • Yuklagan: {ver.uploaded_by_name}
                            </span>
                          )}

                          {ver.created_at && (
                            <span style={{ fontSize: 11, color: "var(--muted)" }}>
                              • {fmtDateTime(ver.created_at)}
                            </span>
                          )}
                        </div>

                        <div className="row middle" style={{ gap: 8 }}>
                          {ver.tz_file_url && (
                            <a
                              href={ver.tz_file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-xs btn-outline"
                              download
                              title={ver.tz_file_name || `TZ v${ver.version}`}
                            >
                              <IconDownload size={11} /> {tx("orders.faylni_yuklab_olish")}
                            </a>
                          )}
                        </div>

                        {(ver.change_note || ver.decision_note) && (
                          <div
                            style={{
                              width: "100%",
                              fontSize: 11.5,
                              color: isRejected ? "var(--danger)" : "var(--muted)",
                              background: isRejected ? "rgba(239, 68, 68, 0.06)" : "var(--surface)",
                              padding: "4px 8px",
                              borderRadius: 4,
                              marginTop: 2,
                            }}
                          >
                            {ver.change_note && <span>O'zgarish izohi: {ver.change_note}</span>}
                            {ver.change_note && ver.decision_note && <span> • </span>}
                            {ver.decision_note && <span>PM qarori: {ver.decision_note}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* PM tahrir paneli (ochilganda) */}
          {pmPanelOpen && (
            <form
              onSubmit={handleSavePM}
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: "1px dashed var(--border-color, #e2e8f0)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 600 }}>Yangi holat</label>
                  <select
                    value={pmStatus}
                    onChange={(e) => setPmStatus(e.target.value as ChangeRequestItem["status"])}
                  >
                    {(meta?.order_status || [
                      { value: "ACCEPTED", label: "Qabul qilindi" },
                      { value: "ASSIGNED_TO_DEV", label: "Dasturchiga topshirildi" },
                      { value: "IN_PROGRESS", label: "Jarayonda" },
                      { value: "TESTING", label: "Testda" },
                      { value: "REJECTED", label: "Rad etildi" },
                    ]).filter((s) => s.value !== "COMPLETED" && s.value !== "READY_FOR_REVIEW" && s.value !== "NEW").map((s) => (
                      <option key={String(s.value)} value={String(s.value)}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 600 }}>PM yakuniy muddati</label>
                  <input
                    type="date"
                    value={pmDeadline}
                    onChange={(e) => setPmDeadline(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 600 }}>{tx("orders.pm_izohi")}</label>
                <input
                  type="text"
                  placeholder="Qisqa ko'rsatma..."
                  value={pmNotes}
                  onChange={(e) => setPmNotes(e.target.value)}
                />
              </div>
              <div className="row end" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  onClick={() => setPmPanelOpen(false)}
                >
                  Bekor qilish
                </button>
                <button type="submit" className="btn btn-xs btn-primary" disabled={pmSaving}>
                  {pmSaving ? "Saqlanmoqda..." : "Saqlash"}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>

      {/* Yangi versiya yuborish modali */}
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
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                onClick={() => setVersionModal(false)}
                style={{ width: 28, height: 28, padding: 0 }}
                title={tx("common.bekor_qilish")}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleUploadVersionSubmit}>
              <div className="modal-body" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6 }}>
                    Yangi TZ fayli (PDF/DOCX/Rasm) <span style={{ color: "var(--danger)" }}>*</span>
                  </label>
                  <input
                    type="file"
                    required
                    onChange={(e) => setVersionFile(e.target.files?.[0] || null)}
                  />
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
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setVersionModal(false)}
                >
                  {tx("common.bekor_qilish")}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={versionSubmitting || !versionFile}
                >
                  {versionSubmitting ? "Yuklanmoqda..." : "Yuborish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PM BUYURTMANI QABUL QILISH VA MUDDAT BELGILASH MODALI */}
      {claimModalOpen && item && (
        <div className="modal-overlay" onClick={() => !claimSubmitting && setClaimModalOpen(false)}>
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
                      {item.request_no}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>•</span>
                    <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
                      {item.project_detail?.name || item.system_name}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                onClick={() => setClaimModalOpen(false)}
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

                {item.due_date && (
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
                      <strong style={{ color: "var(--text)" }}>{fmtDate(item.due_date)}</strong>
                    </div>
                    <button
                      type="button"
                      className="btn btn-xs btn-ghost"
                      style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 600 }}
                      onClick={() => {
                        const d = item.due_date?.split("T")[0];
                        if (d) setClaimDeadlineInput(d);
                      }}
                    >
                      {tx("orders.claim_use_client_date")}
                    </button>
                  </div>
                )}

                <div className="field">
                  <div className="row between middle" style={{ marginBottom: 6 }}>
                    <label style={{ fontWeight: 600, fontSize: 12.5, color: "var(--text)", margin: 0 }}>
                      {tx("orders.claim_deadline_label")} <span style={{ color: "var(--danger)" }}>*</span>
                    </label>
                    <div className="row middle" style={{ gap: 4 }}>
                      <span style={{ fontSize: 11, color: "var(--muted)", marginRight: 2 }}>{tx("orders.claim_quick_label")}</span>
                      <button
                        type="button"
                        className="modal-quick-chip"
                        onClick={() => applyQuickDeadline(3, tx("orders.claim_3days_duration"))}
                      >
                        {tx("orders.claim_3days")}
                      </button>
                      <button
                        type="button"
                        className="modal-quick-chip"
                        onClick={() => applyQuickDeadline(7, tx("orders.claim_1week_duration"))}
                      >
                        {tx("orders.claim_1week")}
                      </button>
                      <button
                        type="button"
                        className="modal-quick-chip"
                        onClick={() => applyQuickDeadline(14, tx("orders.claim_2weeks_duration"))}
                      >
                        {tx("orders.claim_2weeks")}
                      </button>
                      <button
                        type="button"
                        className="modal-quick-chip"
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
                    value={claimDeadlineInput}
                    onChange={(e) => setClaimDeadlineInput(e.target.value)}
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
                    {tx("orders.claim_dev_label")}
                  </label>
                  <select
                    className="select"
                    value={claimDeveloper || ""}
                    onChange={(e) => setClaimDeveloper(e.target.value ? Number(e.target.value) : null)}
                    style={{ width: "100%" }}
                  >
                    <option value="">{tx("orders.claim_dev_placeholder")}</option>
                    {developersList.map((dev) => (
                      <option key={dev.id} value={dev.id}>
                        {dev.full_name} ({dev.specialty || dev.department || "Dasturchi"})
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                    {tx("orders.claim_dev_hint")}
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
                    value={claimNotesInput}
                    onChange={(e) => setClaimNotesInput(e.target.value)}
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
                  onClick={() => setClaimModalOpen(false)}
                  disabled={claimSubmitting}
                >
                  {tx("common.bekor_qilish")}
                </button>
                <button
                  type="submit"
                  className="btn btn-ok"
                  disabled={claimSubmitting || !claimDeadlineInput}
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

      {/* KAMCHILIK BILAN QAYTARISH MODALI */}
      {rejectModalOpen && item && (
        <div className="modal-overlay" onClick={() => !rejectSubmitting && setRejectModalOpen(false)}>
          <div
            className="modal-card"
            style={{ maxWidth: 500, width: "95%" }}
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
                  <strong style={{ fontSize: 15, color: "var(--text)" }}>Kamchilik yoki e'tiroz sababini kiriting</strong>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {item.request_no} — {item.project_detail?.name || item.system_name}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                onClick={() => setRejectModalOpen(false)}
                disabled={rejectSubmitting}
                style={{ width: 28, height: 28, padding: 0 }}
                title={tx("common.bekor_qilish")}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRejectSubmit}>
              <div className="modal-body" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div
                  style={{
                    background: "var(--danger-soft)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontSize: 12.5,
                    color: "var(--danger)",
                    lineHeight: 1.45,
                  }}
                >
                  Buyurtmachi tomonidan aniqlangan kamchiliklar qayd etiladi va vazifa qayta ishlash uchun qaytariladi.
                </div>

                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6, color: "var(--text)" }}>
                    E'tiroz va kamchilik tavsifi <span style={{ color: "var(--danger)" }}>*</span>
                  </label>
                  <textarea
                    rows={4}
                    required
                    className="textarea"
                    placeholder="Qaysi qismda kamchilik yoki xatolik aniqlandi..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    style={{ width: "100%", resize: "vertical" }}
                  />
                </div>
              </div>

              <div className="modal-footer row between middle" style={{ padding: "14px 20px" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setRejectModalOpen(false)}
                  disabled={rejectSubmitting}
                >
                  {tx("common.bekor_qilish")}
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={rejectSubmitting || !rejectReason.trim()}
                >
                  {rejectSubmitting ? "Yuborilmoqda..." : "Kamchilik bilan qaytarish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BUYURTMA BO'YICHA VAZIFA YARATISH MODALI */}
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
                    background: "rgba(59, 130, 246, 0.12)",
                    color: "var(--brand)",
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
                    {item.request_no} — {item.project_detail?.name || item.system_name}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                onClick={() => setTaskModalOpen(false)}
                disabled={taskSubmitting}
                style={{ width: 30, height: 30, padding: 0 }}
                title={tx("common.bekor_qilish")}
              >
                ✕
              </button>
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
                      <option value="">Tanlanmagan</option>
                      {developersList.map((dev) => (
                        <option key={dev.id} value={dev.id}>
                          {dev.full_name} ({dev.specialty || "Dasturchi"})
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
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setTaskModalOpen(false)}
                  disabled={taskSubmitting}
                >
                  {tx("common.bekor_qilish")}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={taskSubmitting || !taskTitle.trim()}
                  style={{ fontWeight: 600 }}
                >
                  {taskSubmitting ? "Yaratilmoqda..." : tx("orders.task_submit_btn")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* YANGI TZ VERSIYASINI TASDIQLASH MODALI (PM) */}
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
                  <strong style={{ fontSize: 16 }}>Yangi TZ versiyasini tasdiqlash</strong>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {item.request_no} • Versiya: <strong style={{ color: "#16a34a" }}>v{approveVersionTarget || item.pending_version?.version || "yangi"}</strong>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                onClick={() => setApproveVersionModal(false)}
                disabled={approveSubmitting}
                style={{ width: 28, height: 28, padding: 0 }}
                title={tx("common.bekor_qilish")}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleApproveVersionSubmit}>
              <div className="modal-body" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div
                  style={{
                    background: "var(--accent-soft)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    fontSize: 12.5,
                    lineHeight: 1.45,
                    color: "var(--text)",
                  }}
                >
                  Yangi TZ tasdiqlangach, oldingi versiyalar bekor qilinadi (atmen) va buyurtma yangi topshiriq hujjatiga to'liq o'tkaziladi.
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="field">
                    <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6, color: "var(--text)" }}>
                      PM yakuniy muddati
                    </label>
                    <input
                      type="date"
                      className="input"
                      value={approveDeadline}
                      onChange={(e) => setApproveDeadline(e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </div>

                  <div className="field">
                    <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6, color: "var(--text)" }}>
                      Qanchada tugashi (baho)
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Masalan: 10 kun, 2 hafta"
                      value={approveDuration}
                      onChange={(e) => setApproveDuration(e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </div>
                </div>


                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12.5, display: "block", marginBottom: 6, color: "var(--text)" }}>
                    PM xulosasi va ko'rsatmasi
                  </label>
                  <textarea
                    rows={3}
                    className="textarea"
                    placeholder="Ushbu versiya bo'yicha PM izohi yoki dasturchilarga ko'rsatma..."
                    value={approveNote}
                    onChange={(e) => setApproveNote(e.target.value)}
                    style={{ width: "100%", resize: "vertical" }}
                  />
                </div>
              </div>

              <div className="modal-footer row between middle" style={{ padding: "14px 20px" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setApproveVersionModal(false)}
                  disabled={approveSubmitting}
                >
                  {tx("common.bekor_qilish")}
                </button>
                <button
                  type="submit"
                  className="btn btn-ok"
                  disabled={approveSubmitting}
                  style={{ fontWeight: 600 }}
                >
                  {approveSubmitting ? "Tasdiqlanmoqda..." : "✓ Tasdiqlash va amalda qo'llash"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* YANGI TZ VERSIYASINI RAD ETISH MODALI (PM) */}
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
                    {item.request_no} • Versiya: v{rejectVersionTarget || item.pending_version?.version || "yangi"}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                onClick={() => setRejectVersionModal(false)}
                disabled={rejectVersionSubmitting}
                style={{ width: 28, height: 28, padding: 0 }}
                title={tx("common.bekor_qilish")}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRejectVersionSubmit}>
              <div className="modal-body" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div
                  style={{
                    background: "var(--danger-soft)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
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
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setRejectVersionModal(false)}
                  disabled={rejectVersionSubmitting}
                >
                  {tx("common.bekor_qilish")}
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={rejectVersionSubmitting || !rejectVersionReason.trim()}
                  style={{ fontWeight: 600 }}
                >
                  {rejectVersionSubmitting ? "Rad etilmoqda..." : "✕ Rad etish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
