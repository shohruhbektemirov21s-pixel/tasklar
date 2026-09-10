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
  setPmDecision,
  uploadVersion,
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
import { toEditOrder, toOrders, toProject, useEntityNum, useGo } from "@/nav";
import { OrderStatusBadge, OrderTypeBadge } from "./ChangeRequests";

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

  const canEdit = Boolean(
    item &&
      (user?.is_platform_admin ||
        user?.is_boss ||
        (item.status === "NEW" && !item.assigned_pm))
  );

  const canDelete = Boolean(
    item &&
      (user?.is_platform_admin ||
        user?.is_boss ||
        (item.status === "NEW" && !item.assigned_pm))
  );

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
            <OrderTypeBadge type={item.order_type} />
          </div>

          <div className="row middle" style={{ gap: 8 }}>
            {(item.tz_file_url || (item.attachments && item.attachments.length > 0)) && (
              <a
                href={item.attachments?.[0]?.url || item.tz_file_url || "#"}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm btn-outline row middle"
                style={{ gap: 6 }}
                download
                title={item.attachments?.[0]?.original_name || item.tz_file_name || tx("orders.faylni_yuklab_olish")}
              >
                <IconDownload size={13} /> {tx("orders.faylni_yuklab_olish")}
              </a>
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

        {/* PM Ishni o'z zimmasiga olish banneri */}
        {!item.assigned_pm && isPMOrAdmin && (
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
            style={{ maxWidth: 460, width: "95%", borderRadius: 12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle" style={{ padding: "14px 18px" }}>
              <strong style={{ fontSize: 14 }}>Yangi TZ versiyasi yuklash</strong>
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                onClick={() => setVersionModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleUploadVersionSubmit}>
              <div className="modal-body" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12 }}>Yangi TZ fayli (PDF/DOCX/Rasm) *</label>
                  <input
                    type="file"
                    required
                    onChange={(e) => setVersionFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12 }}>O'zgarishlar tavsifi (sababi) *</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Ushbu versiyada qanday o'zgarishlar kiritildi..."
                    value={versionNote}
                    onChange={(e) => setVersionNote(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer row end" style={{ padding: "12px 18px", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setVersionModal(false)}
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary"
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
            style={{ maxWidth: 520, width: "95%", borderRadius: 12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle" style={{ padding: "14px 18px" }}>
              <div>
                <strong style={{ fontSize: 14 }}>{tx("orders.claim_modal_title")}</strong>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {item.request_no} — {item.project_detail?.name || item.system_name}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                onClick={() => setClaimModalOpen(false)}
                disabled={claimSubmitting}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleClaimSubmit}>
              <div className="modal-body" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div
                  style={{
                    background: "var(--surface-2, #f8fafc)",
                    border: "1px solid var(--border-color, #e2e8f0)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 12,
                    color: "var(--text)",
                    lineHeight: 1.4,
                  }}
                >
                  {tx("orders.claim_modal_desc")}
                </div>

                {item.due_date && (
                  <div style={{ fontSize: 12, color: "var(--text)", background: "var(--surface-2, #f8fafc)", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border-color, #e2e8f0)" }}>
                    <strong>{tx("orders.soralgan_muddat")}:</strong> {fmtDate(item.due_date)}
                  </div>
                )}

                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12, display: "block", marginBottom: 4 }}>
                    {tx("orders.claim_deadline_label")} *
                  </label>
                  <input
                    type="date"
                    required
                    className="input"
                    value={claimDeadlineInput}
                    onChange={(e) => setClaimDeadlineInput(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>

                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12, display: "block", marginBottom: 4 }}>
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
                </div>

                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12, display: "block", marginBottom: 4 }}>
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
                </div>

                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12, display: "block", marginBottom: 4 }}>
                    {tx("orders.claim_notes_label")}
                  </label>
                  <textarea
                    rows={3}
                    className="textarea"
                    placeholder={tx("orders.claim_notes_placeholder")}
                    value={claimNotesInput}
                    onChange={(e) => setClaimNotesInput(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              <div className="modal-footer row end" style={{ padding: "12px 18px", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setClaimModalOpen(false)}
                  disabled={claimSubmitting}
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-primary"
                  style={{ background: "#059669", borderColor: "#059669" }}
                  disabled={claimSubmitting || !claimDeadlineInput}
                >
                  {claimSubmitting ? tx("orders.claim_submitting") : tx("orders.claim_submit_btn")}
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
            style={{ maxWidth: 500, width: "95%", borderRadius: 12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle" style={{ padding: "14px 18px" }}>
              <div>
                <strong style={{ fontSize: 14 }}>Kamchilik yoki e'tiroz sababini kiriting</strong>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {item.request_no} — {item.project_detail?.name || item.system_name}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                onClick={() => setRejectModalOpen(false)}
                disabled={rejectSubmitting}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRejectSubmit}>
              <div className="modal-body" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div
                  style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 12,
                    color: "#b91c1c",
                    lineHeight: 1.4,
                  }}
                >
                  Buyurtmachi tomonidan aniqlangan kamchiliklar qayd etiladi va vazifa qayta ishlash uchun qaytariladi.
                </div>

                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 12, display: "block", marginBottom: 4 }}>
                    E'tiroz va kamchilik tavsifi *
                  </label>
                  <textarea
                    rows={4}
                    required
                    className="textarea"
                    placeholder="Qaysi qismda kamchilik yoki xatolik aniqlandi..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              <div className="modal-footer row end" style={{ padding: "12px 18px", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setRejectModalOpen(false)}
                  disabled={rejectSubmitting}
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-danger"
                  disabled={rejectSubmitting || !rejectReason.trim()}
                >
                  {rejectSubmitting ? "Yuborilmoqda..." : "Kamchilik bilan qaytarish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
