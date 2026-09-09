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
import { Card, Empty, ErrorMsg, Loading, fmtDate, fmtDateTime, timeAgo } from "@/components/ui";
import { toEditOrder, toOrders, toProject, useEntityNum, useGo } from "@/nav";
import { OrderStatusBadge, OrderTypeBadge } from "./ChangeRequests";

export default function OrderDetail() {
  const id = useEntityNum("order");
  const go = useGo();
  const { user } = useAuth();

  const [item, setItem] = useState<ChangeRequestItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      await deleteOrder(item.id);
      go(toOrders());
    } catch (err: any) {
      alert(err?.message || "O'chirishda xatolik yuz berdi.");
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
    } catch (err: any) {
      alert(err?.message || "Qabul qilishda xatolik yuz berdi.");
    } finally {
      setClaimSubmitting(false);
    }
  }

  // PM qarori va muddatni saqlash
  async function handleSavePM(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    setPmSaving(true);
    try {
      const updated = await setPmDecision(item.id, {
        status: pmStatus,
        pm_deadline: pmDeadline || undefined,
        pm_notes: pmNotes.trim() || undefined,
      });
      setItem(updated);
      setPmPanelOpen(false);
    } catch (err: any) {
      alert(err?.message || "Qarorni saqlashda xatolik yuz berdi.");
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
    try {
      const updated = await clientApprove(item.id);
      setItem(updated);
    } catch (err: any) {
      alert(err?.message || "Tasdiqlashda xatolik yuz berdi.");
    }
  }

  // Boshqarma qaytarishi
  async function handleClientReject() {
    if (!item) return;
    const reason = window.prompt("Aniqlangan kamchilik yoki e'tiroz sababini kiriting:");
    if (!reason || !reason.trim()) return;
    try {
      const updated = await clientReject(item.id, reason.trim());
      setItem(updated);
    } catch (err: any) {
      alert(err?.message || "Qaytarishda xatolik yuz berdi.");
    }
  }

  // Yangi TZ versiya yuborish
  async function handleUploadVersionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item || !versionFile || !versionNote.trim()) return;
    setVersionSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("tz_file", versionFile);
      fd.append("change_note", versionNote.trim());
      const updated = await uploadVersion(item.id, fd);
      setItem(updated);
      setVersionModal(false);
      setVersionFile(null);
      setVersionNote("");
      alert("Yangi versiya muvaffaqiyatli yuklandi!");
    } catch (err: any) {
      alert(err?.message || "Yuklashda xatolik yuz berdi.");
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
        {/* 1. YUQORI QISM: Navigatsiya, Raqam, Status va Amallar */}
        <div
          className="row between middle"
          style={{
            flexWrap: "wrap",
            gap: 10,
            padding: "4px 0",
          }}
        >
          <div className="row middle" style={{ gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-sm btn-ghost row middle"
              style={{ gap: 6, padding: "6px 10px", fontWeight: 600, color: "var(--brand)" }}
              onClick={() => go(toOrders())}
            >
              <IconBack size={15} /> Buyurtmalarga qaytish
            </button>

            <span className="badge badge-brand" style={{ fontSize: 12.5, fontWeight: 700 }}>
              {item.request_no}
            </span>

            {(item.version || 1) > 1 && (
              <span
                className="badge"
                style={{ background: "#4f46e5", color: "#fff", fontWeight: 700, fontSize: 11 }}
              >
                v{item.version}
              </span>
            )}

            <OrderStatusBadge status={item.status} label={item.status_display} />
            <OrderTypeBadge type={item.order_type} />
          </div>

          <div className="row middle" style={{ gap: 8 }}>
            {item.tz_file_url && (
              <a
                href={item.tz_file_url}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm btn-primary row middle"
                style={{
                  gap: 6,
                  textDecoration: "none",
                  fontWeight: 600,
                  background: "#0284c7",
                  borderColor: "#0284c7",
                }}
                download
                title={item.tz_file_name || "Biriktirilgan fayl"}
              >
                <IconDownload size={14} /> Faylni yuklab olish
              </a>
            )}

            {canEdit && (
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => go(toEditOrder(item.id))}
              >
                Tahrirlash
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ color: "#dc2626", padding: "6px 8px" }}
                onClick={() => void handleDelete()}
                title="Buyurtmani o'chirish"
              >
                🗑️
              </button>
            )}
          </div>
        </div>

        {/* PM Ishni o'z zimmasiga olish banneri */}
        {!item.assigned_pm && isPMOrAdmin && (
          <div
            style={{
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 10,
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 13, color: "#92400e" }}>
              ⏳ <strong>Mas'ul loyiha menejeri yo'q.</strong> Ushbu buyurtmani o'z zimmangizga olasizmi?
            </div>
            <button
              type="button"
              className="btn btn-xs btn-primary"
              style={{ background: "#059669", borderColor: "#059669" }}
              onClick={handleOpenClaim}
            >
              📌 Ishni qabul qilish
            </button>
          </div>
        )}

        {/* Boshqarma tasdig'i kutilayotgan holat banneri */}
        {item.status === "READY_FOR_REVIEW" && (
          <div
            style={{
              background: "rgba(168, 85, 247, 0.08)",
              border: "1.5px solid #a855f7",
              borderRadius: 10,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: "#6b21a8" }}>
                📑 Ish bajarildi — Boshqarma tasdig'i kutilmoqda
              </div>
              {item.completion_note && (
                <div style={{ fontSize: 12, color: "#581c87", marginTop: 2 }}>
                  PM xulosasi: {item.completion_note}
                </div>
              )}
            </div>
            {isSohaviyOrAdmin && (
              <div className="row middle" style={{ gap: 8 }}>
                <button type="button" className="btn btn-xs btn-ok" onClick={handleClientApprove}>
                  ✓ Qabul qilish
                </button>
                <button type="button" className="btn btn-xs btn-warning" onClick={handleClientReject}>
                  ⚠️ Qaytarish
                </button>
              </div>
            )}
          </div>
        )}

        {/* 2. ASOSIY MA'LUMOTLAR KARTASI */}
        <section
          className="card padded"
          style={{
            borderRadius: 12,
            border: "1px solid var(--border-color, #e2e8f0)",
            padding: "16px 18px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ marginBottom: 14 }}>
            <span className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Buyurtma nomi
            </span>
            <h1
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "var(--text)",
                margin: "3px 0 0 0",
                lineHeight: 1.3,
              }}
            >
              {item.system_name} {item.module ? `— ${item.module}` : ""}
            </h1>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "12px 18px",
              fontSize: 13,
            }}
          >
            <div>
              <span className="muted" style={{ fontSize: 11.5 }}>Loyiha:</span>
              <div style={{ marginTop: 2 }}>
                {item.project_detail ? (
                  <Link
                    {...toProject(item.project_detail.id)}
                    className="row middle"
                    style={{
                      gap: 6,
                      fontWeight: 600,
                      color: "var(--brand)",
                      textDecoration: "none",
                    }}
                  >
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        background: item.project_detail.color || "var(--brand)",
                        display: "inline-block",
                      }}
                    />
                    <span>{item.project_detail.name}</span>
                    <span className="badge badge-brand" style={{ fontSize: 10, padding: "1px 5px" }}>
                      {item.project_detail.key}
                    </span>
                  </Link>
                ) : (
                  <span className="muted">Bog'lanmagan</span>
                )}
              </div>
            </div>

            <div>
              <span className="muted" style={{ fontSize: 11.5 }}>Mijoz / Buyurtmachi:</span>
              <div style={{ fontWeight: 600, color: "var(--text)", marginTop: 2 }}>
                {item.responsible_person || "Noma'lum"}{" "}
                {item.department && (
                  <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
                    ({item.department})
                  </span>
                )}
              </div>
            </div>

            <div>
              <span className="muted" style={{ fontSize: 11.5 }}>Muddat (so'ralgan):</span>
              <div style={{ fontWeight: 600, color: "var(--text)", marginTop: 2 }}>
                {item.due_date ? fmtDate(item.due_date) : "-"}
              </div>
            </div>

            <div>
              <span className="muted" style={{ fontSize: 11.5 }}>{tx("orders.yaratilgan_sana_vaqti")}:</span>
              <div style={{ fontWeight: 600, color: "var(--text)", marginTop: 2 }}>
                📅 {fmtDateTime(item.created_at || item.request_date)}
                {item.created_at && (
                  <span className="muted" style={{ fontSize: 11, marginLeft: 6, fontWeight: 400 }}>
                    ({timeAgo(item.created_at)})
                  </span>
                )}
              </div>
            </div>

            <div>
              <span className="muted" style={{ fontSize: 11.5 }}>Mas'ul shaxs (PM):</span>
              <div style={{ fontWeight: 600, color: "var(--text)", marginTop: 2 }}>
                {item.assigned_pm_name ? `👤 ${item.assigned_pm_name}` : <span className="muted">Biriktirilmagan</span>}
              </div>
            </div>

            <div>
              <span className="muted" style={{ fontSize: 11.5 }}>Muhimlik turi:</span>
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
          </div>
        </section>

        {/* 3. “TAVSIF” KICHIK BLOK */}
        <section
          className="card padded"
          style={{
            borderRadius: 12,
            border: "1px solid var(--border-color, #e2e8f0)",
            padding: "14px 18px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <div className="row between middle" style={{ marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 12.5, color: "var(--text)" }}>
              📝 Tavsif va talab qilinayotgan o'zgartirish
            </span>
            {isLongText && (
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                style={{ fontSize: 11.5, color: "var(--brand)", padding: "2px 6px" }}
                onClick={() => setExpandDesc((v) => !v)}
              >
                {expandDesc ? "Qisqartirish ▲" : "Batafsil ko'rish ▼"}
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
                marginTop: 10,
                paddingTop: 8,
                borderTop: "1px dashed var(--border-color, #e2e8f0)",
                fontSize: 12,
                color: "var(--muted)",
              }}
            >
              <strong>Sabab / Asos:</strong> {item.reason}
            </div>
          )}
        </section>

        {/* 4. PASTKI QISM: Holat, Ijrochi, Fayllar va PM paneli */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 14,
          }}
        >
          {/* 4.1 Buyurtma holati va ijrosi */}
          <section
            className="card padded"
            style={{
              borderRadius: 12,
              border: "1px solid var(--border-color, #e2e8f0)",
              padding: "14px 18px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                className="row between middle"
                style={{
                  borderBottom: "1px solid var(--border-color, #e2e8f0)",
                  paddingBottom: 8,
                  marginBottom: 10,
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 12.5, color: "var(--text)" }}>
                  ⚙️ Holat va Ijro tafsilotlari
                </span>
                {isPMOrAdmin && (item.assigned_pm === user?.id || user?.is_platform_admin || user?.is_boss) && (
                  <button
                    type="button"
                    className="btn btn-xs btn-outline"
                    style={{ fontSize: 11 }}
                    onClick={() => setPmPanelOpen((v) => !v)}
                  >
                    {pmPanelOpen ? "Yopish" : "O'zgartirish"}
                  </button>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }}>
                <div className="row between middle">
                  <span className="muted">Buyurtma holati:</span>
                  <OrderStatusBadge status={item.status} label={item.status_display} />
                </div>

                <div className="row between middle">
                  <span className="muted">Mas'ul xodim (Dasturchi):</span>
                  <span style={{ fontWeight: 600, color: "var(--text)" }}>
                    {item.assigned_developer_name ? `👨‍💻 ${item.assigned_developer_name}` : "Biriktirilmagan"}
                  </span>
                </div>

                <div className="row between middle">
                  <span className="muted">PM belgilagan muddat:</span>
                  <span style={{ fontWeight: 600, color: item.pm_deadline ? "var(--brand)" : "var(--text)" }}>
                    {item.pm_deadline ? fmtDate(item.pm_deadline) : item.pm_estimated_duration || "Kutilmoqda"}
                  </span>
                </div>

                <div className="row between middle">
                  <span className="muted">Oxirgi yangilanish:</span>
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>
                    {timeAgo(item.updated_at || item.created_at)}
                  </span>
                </div>

                {item.pm_notes && (
                  <div
                    style={{
                      marginTop: 4,
                      background: "var(--surface-2, #f8fafc)",
                      padding: "6px 10px",
                      borderRadius: 6,
                      fontSize: 12,
                      color: "var(--text)",
                    }}
                  >
                    <strong>PM izohi:</strong> {item.pm_notes}
                  </div>
                )}
              </div>
            </div>

            {/* PM tezkor tahrir paneli (ochilganda) */}
            {pmPanelOpen && (
              <form
                onSubmit={handleSavePM}
                style={{
                  marginTop: 12,
                  paddingTop: 10,
                  borderTop: "1px dashed var(--border-color, #e2e8f0)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 600 }}>Yangi holat</label>
                  <select
                    value={pmStatus}
                    onChange={(e) => setPmStatus(e.target.value as ChangeRequestItem["status"])}
                  >
                    <option value="ACCEPTED">📋 Qabul qilindi</option>
                    <option value="ASSIGNED_TO_DEV">💻 Dasturchiga topshirildi</option>
                    <option value="IN_PROGRESS">⚙️ Jarayonda</option>
                    <option value="TESTING">🧪 Testda</option>
                    <option value="REJECTED">❌ Rad etildi</option>
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
                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 600 }}>Izoh / Ko'rsatma</label>
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

          {/* 4.2 Hujjatlar va TZ fayllari */}
          <section
            className="card padded"
            style={{
              borderRadius: 12,
              border: "1px solid var(--border-color, #e2e8f0)",
              padding: "14px 18px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 12.5,
                  color: "var(--text)",
                  borderBottom: "1px solid var(--border-color, #e2e8f0)",
                  paddingBottom: 8,
                  marginBottom: 10,
                }}
              >
                📁 Biriktirilgan fayl
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* TZ Fayli */}
                {item.tz_file_url ? (
                  <div
                    className="row between middle"
                    style={{
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: 8,
                      padding: "8px 12px",
                    }}
                  >
                    <div className="row middle" style={{ gap: 8 }}>
                      <span style={{ fontSize: 18 }}>📄</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12, color: "#166534" }}>
                          {item.tz_file_name || "Texnik topshiriq (TZ)"}
                        </div>
                        <div style={{ fontSize: 11, color: "#15803d" }}>
                          v{item.version || 1} {item.tz_file_size_display ? `• ${item.tz_file_size_display}` : ""}
                        </div>
                      </div>
                    </div>
                    <a
                      href={item.tz_file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-xs btn-primary"
                      style={{ background: "#16a34a", borderColor: "#16a34a" }}
                      download
                    >
                      <IconDownload size={12} /> Yuklab olish
                    </a>
                  </div>
                ) : (
                  <div style={{ fontSize: 12.5, color: "var(--muted)", fontStyle: "italic", padding: "6px 0" }}>
                    Fayl biriktirilmagan
                  </div>
                )}

                {/* Tugatilgan ish hisoboti (agar mavjud bo'lsa) */}
                {item.completion_file_url && (
                  <div
                    className="row between middle"
                    style={{
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      borderRadius: 8,
                      padding: "8px 12px",
                    }}
                  >
                    <div className="row middle" style={{ gap: 8 }}>
                      <span style={{ fontSize: 18 }}>📁</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12, color: "#1e40af" }}>
                          Hisobot hujjati
                        </div>
                        <div style={{ fontSize: 11, color: "#2563eb" }}>
                          {item.completion_file_name || "Hisobot"}
                        </div>
                      </div>
                    </div>
                    <a
                      href={item.completion_file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-xs btn-primary"
                    >
                      <IconDownload size={12} /> Yuklab olish
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Boshqarma uchun yangi versiya yuborish tugmasi */}
            {isSohaviyOrAdmin && item.status !== "COMPLETED" && item.status !== "REJECTED" && (
              <div style={{ marginTop: 10, paddingTop: 8, textAlign: "right" }}>
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  style={{ color: "var(--brand)" }}
                  onClick={() => setVersionModal(true)}
                >
                  + Yangi TZ versiyasi yuklash
                </button>
              </div>
            )}
          </section>
        </div>
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
              <div className="row middle" style={{ gap: 8 }}>
                <span style={{ fontSize: 18 }}>📌</span>
                <div>
                  <strong style={{ fontSize: 14 }}>{tx("orders.claim_modal_title")}</strong>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {item.request_no} — {item.project_detail?.name || item.system_name}
                  </div>
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
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 12,
                    color: "#166534",
                    lineHeight: 1.4,
                  }}
                >
                  {tx("orders.claim_modal_desc")}
                </div>

                {item.due_date && (
                  <div style={{ fontSize: 12, color: "#475569", background: "#f8fafc", padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                    📅 <strong>Mijoz so'ragan muddat:</strong> {fmtDate(item.due_date)}
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
    </>
  );
}
