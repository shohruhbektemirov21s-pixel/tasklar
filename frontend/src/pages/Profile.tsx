import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import type { Task, User, UserWork, ChangeRequestItem } from "@/api/types";
import { clientApprove, clientReject } from "@/api/orders";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import SkillEditor from "@/components/SkillEditor";
import { IconChat } from "@/components/icons";
import Timeline from "@/components/Timeline";
import FilePreviewModal, { PreviewFile } from "@/components/FilePreviewModal";
import {
  AvatarStack, AvatarViewable, Card, ErrorMsg, Loading, OkMsg, Pager, Priority, Stat,
  StatusBadge, fmtDate,
} from "@/components/ui";
import { confirmDialog } from "@/components/Confirm";
import { toMessages, toProject, toTask, toOrder, useEntityId, useGo, useNavParams } from "@/nav";
import PasswordCard from "@/components/PasswordCard";
import TelegramCard from "@/components/TelegramCard";
import { tx } from "@/i18n";

/** Profil kartasidagi vazifalar ro'yxati bir sahifada nechta. */
const TASKS_PER_PAGE = 10;

function getOrderStatusBadge(status: string, display?: string) {
  switch (status) {
    case "READY_FOR_REVIEW":
      return (
        <span
          className="badge badge-brand"
          style={{
            background: "rgba(168, 85, 247, 0.15)",
            color: "#7e22ce",
            borderColor: "rgba(168, 85, 247, 0.35)",
            fontWeight: 600,
          }}
        >
          📑 {display || tx("profile.boshqarma_tasdigida")}
        </span>
      );
    case "COMPLETED":
      return <span className="badge badge-ok">✓ {display || tx("profile.yakunlangan")}</span>;
    case "IN_PROGRESS":
      return <span className="badge badge-brand">⚙️ {display || tx("profile.jarayonda")}</span>;
    case "TESTING":
      return <span className="badge badge-warn">🧪 {display || "Testda"}</span>;
    case "REJECTED":
      return <span className="badge badge-danger">✕ {display || "Rad etilgan"}</span>;
    case "NEW":
      return <span className="badge">🆕 {display || "Yangi"}</span>;
    default:
      return <span className="badge">{display || status}</span>;
  }
}

export default function Profile() {
  const fid = useId();
  const go = useGo();
  // Kimning profili - sahifa holatidan. Bo'sh bo'lsa - o'ziniki.
  const userId = useEntityId("user");
  const { user: me, meta, refreshUser } = useAuth();
  const isSelf = !userId || Number(userId) === me?.id;

  const [target, setTarget] = useState<User | null>(null);
  const [work, setWork] = useState<UserWork | null>(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  // Buyurtmalarni tasdiqlash va tuzatishga qaytarish holatlari
  const [rejectModalItem, setRejectModalItem] = useState<ChangeRequestItem | null>(null);
  const [rejectFeedbackNote, setRejectFeedbackNote] = useState("");
  const [rejectFile, setRejectFile] = useState<File | null>(null);
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [orderActionBusy, setOrderActionBusy] = useState<number | null>(null);
  const [orderFilter, setOrderFilter] = useState<string>("all");
  const [orderPage, setOrderPage] = useState(1);
  /**
   * Katak bosilganda ro'yxat SHU SAHIFADA filtrlanadi.
   *
   * Ilgari kataklar «Mening ishim» ga olib ketardi va faqat O'Z
   * profilida bosilardi - begona profilda ular umuman jonsiz edi.
   * Endi ikkovida ham ishlaydi: raqamni ko'rgan odam "bu qaysi ishlar?"
   * degan savolni sahifani tark etmasdan ochadi.
   *
   * Hook SHU YERDA - qolgan holatlar bilan birga. Pastroqda, `if (!target)`
   * dan keyin turganda React "oldingi renderga qaraganda ko'proq hook"
   * deb yiqilardi: birinchi renderda sahifa hali yuklanmagan va erta
   * `return` bu qatorgacha yetib bormasdi.
   */
  const [params, setParams] = useNavParams();
  const pickedStat = params.get("stat") || null;
  // Vazifalar kartasi o'ntadan sahifalanadi.
  const taskPage = Math.max(1, Number(params.get("tpage")) || 1);

  useEffect(() => {
    // Bir profildan boshqasiga tez o'tilsa eski javob kelib qolmasin.
    let alive = true;
    void (async () => {
      const u = isSelf ? await api.get<User>("/auth/me/") : await api.get<User>(`/users/${userId}/`);
      if (!alive) return;
      setTarget(u);
      setForm({
        full_name: u.full_name,
        department_name: u.department_name || "",
        job_title: u.job_title,
        skills: u.skills,
        bio: u.bio,
        telegram: u.telegram,
      });
      // Loyihalar, vazifalar, statistika va tarix - hammasi bitta endpointdan.
      // Ko'rinish serverda so'rovchining huquqiga qarab cheklanadi.
      const w = await api.get<UserWork>(`/users/${u.id}/work/`);
      if (alive) setWork(w);
    })().catch(() => { if (alive) setError(tx("profile.profilni_ochib_bolmadi")); });
    return () => { alive = false; };
  }, [userId, isSelf]);

  /** Rasm yuklash yoki almashtirish. Fayl `multipart` bilan boradi. */
  async function uploadPhoto(file: File) {
    setPhotoBusy(true);
    setError(null);
    setSaved(null);
    try {
      const body = new FormData();
      body.append("avatar", file);
      setTarget(await api.post<User>("/auth/me/avatar/", body));
      setSaved(tx("profile.profil_rasmi_yangilandi"));
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("profile.rasmni_yuklab_bolmadi"));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    const ok = await confirmDialog({
      title: tx("profile.profil_rasmi_ochirilsinmi"),
      body: tx("profile.rasm_ornida_harflar"),
      confirmText: tx("common.ochirish"),
      danger: true,
    });
    if (!ok) return;
    setPhotoBusy(true);
    setError(null);
    setSaved(null);
    try {
      setTarget(await api.delete<User>("/auth/me/avatar/"));
      setSaved(tx("profile.profil_rasmi_ochirildi"));
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("profile.rasmni_ochirib_bolmadi"));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const u = await api.patch<User>("/auth/me/", form);
      setTarget(u);
      setSaved(tx("profile.profil_yangilandi"));
      setEdit(false);
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("common.saqlashda_xatolik"));
    } finally {
      setBusy(false);
    }
  }

  async function reloadWork(uId: number) {
    try {
      const w = await api.get<UserWork>(`/users/${uId}/work/`);
      setWork(w);
    } catch {
      // ignore
    }
  }

  async function handleApproveOrder(o: ChangeRequestItem) {
    const ok = await confirmDialog({
      title: `${tx("profile.tasdiqlash_va_yakunlash")}: №${o.request_no}`,
      body: tx("profile.tasdiqlash_tasdiq_matni"),
      confirmText: tx("profile.tasdiqlash_va_yakunlash"),
      danger: false,
    });
    if (!ok) return;

    setOrderActionBusy(o.id);
    setError(null);
    setSaved(null);
    try {
      await clientApprove(o.id);
      setSaved(tx("profile.buyurtma_yakunlandi"));
      if (target) await reloadWork(target.id);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : (err && typeof err === "object" && "message" in err ? String(err.message) : "Buyurtmani tasdiqlashda xatolik");
      setError(msg);
    } finally {
      setOrderActionBusy(null);
    }
  }

  function handleOpenRejectModal(o: ChangeRequestItem) {
    setRejectModalItem(o);
    setRejectFeedbackNote("");
    setRejectFile(null);
    setRejectError(null);
  }

  async function handleRejectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectModalItem) return;
    if (!rejectFeedbackNote.trim() && !rejectFile) {
      setRejectError(tx("profile.tuzatish_izoh_label") + " kiritilishi shart.");
      return;
    }
    setRejectSubmitting(true);
    setRejectError(null);
    try {
      await clientReject(rejectModalItem.id, {
        feedback_note: rejectFeedbackNote.trim(),
        file: rejectFile,
      });
      setSaved(tx("profile.buyurtma_tuzatishga_qaytarildi"));
      setRejectModalItem(null);
      setRejectFeedbackNote("");
      setRejectFile(null);
      if (target) await reloadWork(target.id);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : (err && typeof err === "object" && "message" in err ? String(err.message) : "Buyurtmani qaytarishda xatolik");
      setRejectError(msg);
    } finally {
      setRejectSubmitting(false);
    }
  }

  if (!target) return <div className="content">{error ? <div className="msg msg-error">{error}</div> : <Loading />}</div>;

  const stats = work?.stats;
  const allTasks = work?.tasks || [];

  const matches = (t: Task) => {
    if (pickedStat === "done") return t.status === "DONE";
    if (pickedStat === "in_review") return t.status === "IN_REVIEW";
    if (pickedStat === "open") return t.status !== "DONE" && t.status !== "CANCELLED";
    return true;
  };
  const tasks = allTasks.filter(matches);
  // Sahifalash FILTRDAN KEYIN: kesim tanlanganda sahifalar soni ham qayta
  // hisoblanadi, aks holda «Bajarilgan» kesimida bo'sh sahifalar qolardi.
  const taskPages = Math.max(1, Math.ceil(tasks.length / TASKS_PER_PAGE));
  // Kesim almashganda ro'yxat qisqarib, joriy sahifa chegaradan chiqib
  // ketishi mumkin - oxirgi haqiqiy sahifani ko'rsatamiz.
  const page = Math.min(taskPage, taskPages);
  const pageTasks = tasks.slice((page - 1) * TASKS_PER_PAGE, page * TASKS_PER_PAGE);

  const canManageReview = Boolean(
    isSelf ||
    me?.is_platform_admin ||
    me?.is_boss ||
    Boolean(target?.is_sohaviy_boshqarma) ||
    Boolean(me?.is_sohaviy_boshqarma)
  );

  const allOrders = work?.orders || [];
  const pendingOrders = allOrders.filter((o) => o.status === "READY_FOR_REVIEW");

  const filteredOrders = allOrders.filter((o) => {
    if (orderFilter === "pending_review") return o.status === "READY_FOR_REVIEW";
    if (orderFilter === "in_progress") {
      return (
        o.status === "IN_PROGRESS" ||
        o.status === "ASSIGNED_TO_DEV" ||
        o.status === "ACCEPTED" ||
        o.status === "TESTING"
      );
    }
    if (orderFilter === "completed") return o.status === "COMPLETED";
    return true;
  });

  const orderTotalPages = Math.max(1, Math.ceil(filteredOrders.length / 10));
  const safeOrderPage = Math.min(orderPage, orderTotalPages);
  const pageOrders = filteredOrders.slice((safeOrderPage - 1) * 10, safeOrderPage * 10);

  const pickStat = (key: string) => {
    const next = new URLSearchParams(params);
    if (pickedStat === key) {
      next.delete("stat");
    } else {
      next.set("stat", key);
    }
    next.delete("tpage");
    setParams(next, { replace: true });
  };

  const setTaskPage = (p: number) => {
    const next = new URLSearchParams(params);
    if (p > 1) next.set("tpage", String(p));
    else next.delete("tpage");
    setParams(next, { replace: true });
  };

  const clearStat = () => {
    const next = new URLSearchParams(params);
    next.delete("stat");
    next.delete("tpage");
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHead
        /* Tahrirlash paytida sarlavha yopishib turadi - forma uzun, saqlash
           tugmasi esa sarlavhada. Aks holda pastki maydonni to'ldirgan odam
           tugmani ko'rmay qolardi. */
        sticky={isSelf && edit}
        title={<><span className="muted">{tx("profile.profil")} </span><strong>{target.full_name}</strong></>}
        actions={
          <>
            {!isSelf && (
              <Link className="btn btn-sm" {...toMessages(target.id)}>
                <IconChat size={14} /> {tx("profile.xabar_yozish")}
              </Link>
            )}
            {isSelf && !edit && (
              <button className="btn btn-sm btn-primary" onClick={() => setEdit(true)}>
                {tx("common.tahrirlash")}
              </button>
            )}
            {/* Tahrirlash paytida saqlash tugmasi SHU YERDA - sarlavhaning
                o'ng chetida. Ilgari u formaning ostida turardi: forma uzun
                (F.I.Sh., lavozim, GitHub, Telegram, ko'nikmalar, daraja,
                tajriba, ma'lumot) va yuqoridagi maydonni tuzatgan odam
                saqlash uchun har safar pastga aylantirishi kerak edi.
                `form` atributi tugmani formaga bog'laydi - u forma
                ichida bo'lmasa ham `submit` qiladi. */}
            {isSelf && edit && (
              <>
                <button className="btn btn-sm btn-primary" type="submit"
                        form={`${fid}-form`} disabled={busy}>
                  {busy ? tx("common.saqlanmoqda") : tx("common.saqlash")}
                </button>
                <button className="btn btn-sm" type="button" onClick={() => setEdit(false)}>
                  {tx("common.bekor_qilish")}
                </button>
              </>
            )}
          </>
        }
      />
      <div className="content">
        <ErrorMsg error={error} />
        <OkMsg text={saved} />

        <div className="split">
          <div>
            <div className="card mb">
              <div className="card-body row wrap">
                <div>
                  {/* Bitta bosish yetadi: rasm to'liq holda ochiladi */}
                  <AvatarViewable user={target} size="xl" />
                  {isSelf && (
                    <div className="avatar-edit" style={{ marginTop: 10 }}>
                      <label className="btn btn-sm" style={{ marginBottom: 0 }}>
                        {target.avatar ? tx("profile.almashtirish") : tx("profile.rasm_qoyish")}
                        <input type="file" accept="image/*" disabled={photoBusy}
                               onChange={(e) => {
                                 const file = e.target.files?.[0];
                                 e.target.value = "";
                                 if (file) void uploadPhoto(file);
                               }} />
                      </label>
                      {target.avatar && (
                        <button type="button" className="btn btn-sm btn-danger"
                                disabled={photoBusy} onClick={() => void removePhoto()}>
                          {tx("common.ochirish_2")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ margin: 0 }}>{target.full_name}</h2>
                  <p className="muted" style={{ margin: "4px 0" }}>
                    {target.job_title}
                    {target.department_name ? ` • ${target.department_name}` : ""}
                  </p>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <span className="badge">{target.seniority_display}</span>
                    <span className="badge">{target.years_experience} {tx("profile.yil_tajriba")}</span>
                    <span className="badge badge-info">{target.global_role_display}</span>
                  </div>
                  {target.bio && <p className="pre-wrap" style={{ marginTop: 10 }}>{target.bio}</p>}
                  <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                    {target.skill_list.map((s) => <span className="chip" key={s}>{s}</span>)}
                    {!target.skill_list.length && isSelf && !edit && (
                      <button type="button" className="btn btn-sm" onClick={() => setEdit(true)}>
                        {tx("profile.konikma_qoshish")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {edit && (
              <Card title={tx("profile.profilni_tahrirlash")}>
                <form id={`${fid}-form`} onSubmit={save}>
                  {[
                    ["full_name", tx("common.f_i_sh"), "text"],
                    ["department_name", tx("profile.boshqarma"), "text"],
                    ["job_title", tx("profile.lavozim"), "text"],
                    ["telegram", tx("profile.telegram_2"), "text"],
                  ].map(([k, label]) => (
                    <div className="field" key={k}>
                      <label htmlFor={`${fid}-${k}`}>{label}</label>
                      <input id={`${fid}-${k}`} value={form[k] || ""}
                             list={k === "department_name" ? `${fid}-dept-list` : undefined}
                             onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                      {k === "department_name" && (
                        <datalist id={`${fid}-dept-list`}>
                          {(meta?.departments || []).map((d: { id?: string | number; name: string }) => (
                            <option key={d.id || d.name} value={d.name} />
                          ))}
                        </datalist>
                      )}
                    </div>
                  ))}
                  <div className="field">
                    <label htmlFor={`${fid}-4`}>{tx("profile.konikmalar")}</label>
                    <SkillEditor
                      id={`${fid}-4`}
                      value={form.skills || ""}
                      onChange={(v) => setForm({ ...form, skills: v })}
                      suggestions={target.suggested_skills || []}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor={`${fid}-3`}>{tx("profile.qisqacha_malumot")}</label>
                    <textarea id={`${fid}-3`} rows={3} value={form.bio || ""}
                              onChange={(e) => setForm({ ...form, bio: e.target.value })} />
                  </div>
                </form>
              </Card>
            )}

            {/* TASDIQLASH KUTILAYOTGAN BUYURTMALAR (Boshqarma tasdig'ida) */}
            {pendingOrders.length > 0 && (
              <div
                className="card mb"
                style={{
                  border: "2px solid #a855f7",
                  background: "linear-gradient(to bottom, rgba(168, 85, 247, 0.05), transparent)",
                  borderRadius: 12,
                  boxShadow: "0 4px 16px rgba(168, 85, 247, 0.12)",
                }}
              >
                <div className="card-head row between middle" style={{ padding: "14px 18px", borderBottom: "1px solid rgba(168, 85, 247, 0.2)" }}>
                  <div className="row middle" style={{ gap: 8 }}>
                    <span style={{ fontSize: 20 }}>📑</span>
                    <strong style={{ fontSize: 15, color: "#7e22ce" }}>
                      {tx("profile.tasdiqlash_kutilayotgan_buyurtmalar")}
                    </strong>
                  </div>
                  <span className="badge badge-brand" style={{ background: "#7e22ce", color: "#fff", fontWeight: 700, padding: "2px 10px" }}>
                    {pendingOrders.length}
                  </span>
                </div>

                <div className="card-body" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                  {pendingOrders.map((ord) => (
                    <div
                      key={ord.id}
                      style={{
                        border: "1px solid var(--border-color, #e2e8f0)",
                        borderRadius: 10,
                        padding: 16,
                        background: "var(--card-bg, #ffffff)",
                      }}
                    >
                      <div className="row between middle wrap" style={{ gap: 8, marginBottom: 10 }}>
                        <div className="row middle wrap" style={{ gap: 8 }}>
                          <Link {...toOrder(ord.id)} style={{ fontWeight: 700, fontSize: 14 }}>
                            №{ord.request_no}
                          </Link>
                          <span className="badge">{ord.system_name || ord.project_detail?.name || "TeamFlow"}</span>
                          {ord.module && <span className="badge badge-info">{ord.module}</span>}
                          {ord.due_date && (
                            <span className="muted" style={{ fontSize: 12 }}>
                              Muddat: {fmtDate(ord.due_date)}
                            </span>
                          )}
                        </div>
                        <div className="row middle" style={{ gap: 6 }}>
                          {ord.assigned_pm_name && (
                            <span className="badge badge-brand" style={{ fontSize: 11.5 }}>
                              PM: {ord.assigned_pm_name}
                            </span>
                          )}
                          <Link className="btn btn-sm btn-ghost" {...toOrder(ord.id)}>
                            {tx("profile.batafsil_korish")} →
                          </Link>
                        </div>
                      </div>

                      {/* PM hisobot izohi */}
                      {ord.completion_note && (
                        <div
                          style={{
                            background: "rgba(168, 85, 247, 0.08)",
                            borderLeft: "4px solid #a855f7",
                            padding: "10px 14px",
                            borderRadius: "0 8px 8px 0",
                            fontSize: 13,
                            marginBottom: 10,
                            lineHeight: 1.5,
                          }}
                        >
                          <strong style={{ color: "#7e22ce", display: "block", marginBottom: 2, fontSize: 12 }}>
                            💬 {tx("profile.pm_hisobot_izohi")}:
                          </strong>
                          <span style={{ color: "var(--text)" }}>{ord.completion_note}</span>
                        </div>
                      )}

                      {/* Topshirilgan hisobot hujjati */}
                      {ord.completion_file_url && (
                        <div
                          className="row middle wrap"
                          style={{
                            gap: 10,
                            background: "var(--bg-subtle, #f8fafc)",
                            padding: "8px 12px",
                            borderRadius: 8,
                            marginBottom: 12,
                            fontSize: 12.5,
                          }}
                        >
                          <span>📄 <strong>{tx("profile.topshirilgan_hujjat")}:</strong></span>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={() =>
                              setPreviewFile({
                                url: ord.completion_file_url!,
                                name: ord.completion_file_name || "Hisobot_hujjati",
                                size: ord.completion_file_size_display,
                              })
                            }
                            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                          >
                            <span>👁️</span>
                            <span>{ord.completion_file_name || tx("profile.hujjatni_korish")}</span>
                            {ord.completion_file_size_display && (
                              <small className="muted">({ord.completion_file_size_display})</small>
                            )}
                          </button>
                        </div>
                      )}

                      {/* Tasdiqlash / Qaytarish harakatlari */}
                      {canManageReview && (
                        <div className="row wrap" style={{ gap: 10, marginTop: 6, paddingTop: 10, borderTop: "1px dashed var(--border-color, #e2e8f0)" }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            style={{ background: "#16a34a", borderColor: "#16a34a", color: "#fff", display: "inline-flex", alignItems: "center", gap: 6 }}
                            disabled={orderActionBusy === ord.id}
                            onClick={() => void handleApproveOrder(ord)}
                          >
                            <span>✓</span>
                            <span>{orderActionBusy === ord.id ? "Tasdiqlanmoqda..." : tx("profile.tasdiqlash_va_yakunlash")}</span>
                          </button>

                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            style={{ color: "#d97706", borderColor: "#d97706", display: "inline-flex", alignItems: "center", gap: 6 }}
                            disabled={orderActionBusy === ord.id}
                            onClick={() => handleOpenRejectModal(ord)}
                          >
                            <span>⚠️</span>
                            <span>{tx("profile.tuzatishga_qaytarish")}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* BOSHQA BARCHA BUYURTMALAR (TZ) */}
            {!!work?.orders?.length && (
              <Card
                title={tx("profile.buyurtmalar_tz")}
                padded={false}
                badge={<span className="badge">{filteredOrders.length}</span>}
                action={
                  <div className="row wrap" style={{ gap: 4 }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${orderFilter === "all" ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => { setOrderFilter("all"); setOrderPage(1); }}
                    >
                      {tx("profile.barcha_buyurtmalar")} ({work.orders.length})
                    </button>
                    {pendingOrders.length > 0 && (
                      <button
                        type="button"
                        className={`btn btn-sm ${orderFilter === "pending_review" ? "btn-primary" : "btn-ghost"}`}
                        onClick={() => { setOrderFilter("pending_review"); setOrderPage(1); }}
                        style={orderFilter !== "pending_review" ? { color: "#7e22ce" } : { background: "#7e22ce" }}
                      >
                        📑 {tx("profile.boshqarma_tasdigida")} ({pendingOrders.length})
                      </button>
                    )}
                    <button
                      type="button"
                      className={`btn btn-sm ${orderFilter === "in_progress" ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => { setOrderFilter("in_progress"); setOrderPage(1); }}
                    >
                      ⚙️ {tx("profile.jarayonda")} ({work.order_stats?.in_progress ?? 0})
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${orderFilter === "completed" ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => { setOrderFilter("completed"); setOrderPage(1); }}
                    >
                      ✓ {tx("profile.yakunlangan")} ({work.order_stats?.completed ?? 0})
                    </button>
                  </div>
                }
              >
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>№</th>
                        <th>Tizim / Modul</th>
                        <th>Holati</th>
                        <th>PM</th>
                        <th>Muddat</th>
                        <th>Harakatlar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageOrders.map((ord) => (
                        <tr className="clickable" key={ord.id} onClick={() => go(toOrder(ord.id))}>
                          <td style={{ fontWeight: 600 }}>
                            <Link {...toOrder(ord.id)} onClick={(e) => e.stopPropagation()}>
                              №{ord.request_no}
                            </Link>
                          </td>
                          <td>
                            <div>
                              <strong>{ord.system_name || ord.project_detail?.name || "—"}</strong>
                              {ord.module && <div className="muted" style={{ fontSize: 11.5 }}>{ord.module}</div>}
                            </div>
                          </td>
                          <td>{getOrderStatusBadge(ord.status, ord.status_display)}</td>
                          <td className="nowrap">{ord.assigned_pm_name || "—"}</td>
                          <td className="nowrap">{ord.due_date ? fmtDate(ord.due_date) : (ord.pm_deadline ? fmtDate(ord.pm_deadline) : "—")}</td>
                          <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                            {ord.status === "READY_FOR_REVIEW" && canManageReview ? (
                              <div className="row" style={{ gap: 4 }}>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary"
                                  style={{ background: "#16a34a", padding: "2px 8px", fontSize: 11.5 }}
                                  disabled={orderActionBusy === ord.id}
                                  onClick={() => void handleApproveOrder(ord)}
                                  title={tx("profile.tasdiqlash_va_yakunlash")}
                                >
                                  ✓
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline"
                                  style={{ color: "#d97706", borderColor: "#d97706", padding: "2px 8px", fontSize: 11.5 }}
                                  disabled={orderActionBusy === ord.id}
                                  onClick={() => handleOpenRejectModal(ord)}
                                  title={tx("profile.tuzatishga_qaytarish")}
                                >
                                  ⚠️
                                </button>
                              </div>
                            ) : (
                              <Link className="btn btn-sm btn-ghost" {...toOrder(ord.id)} style={{ padding: "2px 8px", fontSize: 11.5 }}>
                                Ko'rish →
                              </Link>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!pageOrders.length && (
                        <tr>
                          <td className="muted center" colSpan={6}>
                            {tx("profile.buyurtma_yoq")}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {orderTotalPages > 1 && (
                  <div className="card-body pager-bar">
                    <span className="muted">
                      {filteredOrders.length} {tx("common.tadan")} {(safeOrderPage - 1) * 10 + 1}—
                      {Math.min(safeOrderPage * 10, filteredOrders.length)} {tx("common.tasi")}
                    </span>
                    <Pager page={safeOrderPage} pages={orderTotalPages} onPick={setOrderPage} />
                  </div>
                )}
              </Card>
            )}

            <Card title={isSelf ? tx("profile.songgi_vazifalarim") : tx("profile.songgi_vazifalari")} padded={false}
                  badge={<span className="badge">{tasks.length}</span>}
                  action={pickedStat && (
                    <button type="button" className="btn btn-sm"
                            onClick={clearStat}>
                      {tx("common.filtrni_tozalash")}
                    </button>
                  )}>
              <div className="table-wrap"><table className="table">
                <tbody>
                  {pageTasks.map((t) => (
                    /* Bosh paneldagi ro'yxat bilan bir xil: qatorning
                       istalgan yeri vazifani ochadi. */
                    <tr className="clickable" key={t.id} onClick={() => go(toTask(t.id))}>
                      <td>
                        {/* Hodisa qatorga o'tmasin - vazifa ikki marta
                            ochilib ketmasin. */}
                        <Link {...toTask(t.id)} onClick={(e) => e.stopPropagation()}>{t.title}</Link>
                      </td>
                      <td><StatusBadge task={t} /></td>
                      <td><Priority task={t} /></td>
                      {/* Vazifa YOLG'IZ emas: profil egasidan tashqari yana
                          kim ishlayotgani shu yerda ko'rinadi. */}
                      <td className="nowrap"><AvatarStack users={t.assignees} /></td>
                    </tr>
                  ))}
                  {!tasks.length && (
                    /* `colSpan` - xabar jadval kengligi bo'ylab o'rtada tursin,
                       birinchi ustunga siqilib qolmasin. */
                    <tr><td className="muted center" colSpan={5}>
                      {pickedStat ? tx("profile.bu_kesimda_vazifa_yoq") : tx("profile.vazifa_yoq")}
                    </td></tr>
                  )}
                </tbody>
              </table></div>
              {/* Sahifa raqamlari - faqat bo'linadigan narsa bo'lsa. */}
              {taskPages > 1 && (
                <div className="card-body pager-bar">
                  <span className="muted">
                    {tasks.length} {tx("common.tadan")} {(page - 1) * TASKS_PER_PAGE + 1}—
                    {Math.min(page * TASKS_PER_PAGE, tasks.length)} {tx("common.tasi")}
                  </span>
                  <Pager page={page} pages={taskPages} onPick={setTaskPage} />
                </div>
              )}
            </Card>

            {/* Tarix uzun bo'lishi mumkin (o'nlab yozuv) va u sahifaning
                qolgan qismini pastga surib yuboradi. Shuning uchun yig'ilgan
                holda ochiladi - sanoq nishonda ko'rinib turadi. */}
            <Card title={isSelf ? tx("profile.nima_qilganman") : tx("profile.nima_qilgan")} padded={false}
                  collapsible defaultOpen={false}
                  badge={<span className="badge">{(work?.activity || []).length}</span>}>
              {work?.activity?.length
                ? <div className="card-body"><Timeline items={work.activity} /></div>
                : <div className="empty">{tx("profile.hozircha_yozuv_yoq")}</div>}
            </Card>

          </div>

          <div>
            <div className="grid grid-2 mb">
              {/* Uchtasi ro'yxatni filtrlaydi, soat esa yo'q - u yig'indi,
                  ro'yxatga aylanmaydi. */}
              <Stat value={stats?.open ?? 0} label={tx("common.ochiq_vazifa_2")} tone="accent"
                    onClick={() => pickStat("open")}
                    title={tx("profile.ochiq_ishlarni_royxatda_korish")} />
              <Stat value={stats?.done ?? 0} label={tx("common.bajarilgan")} tone="ok"
                    onClick={() => pickStat("done")}
                    title={tx("profile.bajarilgan_ishlarni_royxatda_korish")} />
              <Stat value={stats?.in_review ?? 0} label={tx("common.tekshiruvda")} tone="done"
                    onClick={() => pickStat("in_review")}
                    title={tx("profile.tekshiruvdagi_ishlarni_royxatda_korish")} />
              <Stat value={stats?.hours ?? 0} label={tx("common.sarflangan_soat")} tone="warn" />
            </div>

            {/* BUYURTMALAR STATISTIKASI */}
            {!!work?.order_stats && work.order_stats.total > 0 && (
              <div className="card mb">
                <div className="card-head row between middle" style={{ padding: "10px 14px" }}>
                  <strong style={{ fontSize: 13 }}>📑 {tx("profile.buyurtmalar_tz")}</strong>
                  <span className="badge">{work.order_stats.total}</span>
                </div>
                <div className="grid grid-2" style={{ padding: 10, gap: 8 }}>
                  <Stat
                    value={work.order_stats.pending_review}
                    label={tx("profile.boshqarma_tasdigida")}
                    tone={work.order_stats.pending_review > 0 ? "warn" : undefined}
                    onClick={() => { setOrderFilter("pending_review"); setOrderPage(1); }}
                    title={tx("profile.boshqarma_tasdigida")}
                  />
                  <Stat
                    value={work.order_stats.in_progress}
                    label={tx("profile.jarayonda")}
                    tone="accent"
                    onClick={() => { setOrderFilter("in_progress"); setOrderPage(1); }}
                    title={tx("profile.jarayonda")}
                  />
                  <Stat
                    value={work.order_stats.completed}
                    label={tx("profile.yakunlangan")}
                    tone="ok"
                    onClick={() => { setOrderFilter("completed"); setOrderPage(1); }}
                    title={tx("profile.yakunlangan")}
                  />
                  <Stat
                    value={work.order_stats.total}
                    label={tx("profile.jami_buyurtmalar")}
                    onClick={() => { setOrderFilter("all"); setOrderPage(1); }}
                    title={tx("profile.barcha_buyurtmalar")}
                  />
                </div>
              </div>
            )}

            {!!work?.projects?.length && (
              <Card title={isSelf ? tx("common.loyihalarim") : tx("profile.loyihalari")} padded={false}
                    badge={<span className="badge">{work.projects.length}</span>}>
                <div className="card-list">
                  {work.projects.map((p) => (
                    <div className="card-body tight row" key={p.id}>
                      <span className="lang-dot" style={{ background: p.color }} />
                      <div style={{ minWidth: 0 }}>
                        <Link {...toProject(p.id)}>{p.name}</Link>
                        <br /><small className="muted">{p.workspace_name}</small>
                      </div>
                      <span className="spacer" />
                      {p.role && <span className="badge">{p.role}</span>}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Telegram bog'lanishi - faqat o'z profilida. Boshqa odamning
                sahifasida bu bo'lim ma'nosiz (uni ulash mumkin emas). */}
            {/* Hisob sozlamalari - ikkovi ham faqat o'z profilida. */}
            {isSelf && <PasswordCard />}
            {isSelf && <TelegramCard />}

            <Card title={tx("profile.aloqa")}>
              <ul className="list-plain" style={{ fontSize: 13 }}>
                <li><span className="muted">{tx("profile.email")}</span> {target.email}</li>
                {target.telegram && <li><span className="muted">{tx("profile.telegram")}</span> {target.telegram}</li>}
                <li><span className="muted">{tx("profile.royxatdan_otgan")}</span> {fmtDate(target.date_joined)}</li>
              </ul>
            </Card>
          </div>
        </div>
      </div>

      {/* TUZATISHGA QAYTARISH MODALI */}
      {rejectModalItem && (
        <div className="modal-overlay" onClick={() => !rejectSubmitting && setRejectModalItem(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 520, width: "95%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle">
              <div className="row middle" style={{ gap: 8 }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <strong>{tx("profile.tuzatish_modal_title")}</strong>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => !rejectSubmitting && setRejectModalItem(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRejectSubmit}>
              <div className="modal-body" style={{ padding: 20 }}>
                <div style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>
                  Buyurtma: <strong>№{rejectModalItem.request_no}</strong> ({rejectModalItem.system_name || rejectModalItem.project_detail?.name || "TeamFlow"})
                  {rejectModalItem.assigned_pm_name && (
                    <span> • PM: <strong>{rejectModalItem.assigned_pm_name}</strong></span>
                  )}
                </div>

                <div
                  style={{
                    background: "#fffbeb",
                    border: "1px solid #fef3c7",
                    borderRadius: 6,
                    padding: 12,
                    marginBottom: 14,
                    fontSize: 12.5,
                    color: "#92400e",
                  }}
                >
                  Buyurtma kamchiliklar ko'rsatilgan holda mas'ul loyiha menejeriga (PM) qaytariladi va qayta ishlashga yuboriladi.
                </div>

                {rejectError && <ErrorMsg error={rejectError} />}

                <div className="field" style={{ marginBottom: 14 }}>
                  <label style={{ fontWeight: 600, fontSize: 13 }}>
                    {tx("profile.tuzatish_izoh_label")} *
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Qanday kamchiliklar aniqlandi, nimalarni to'g'rilash kerak..."
                    value={rejectFeedbackNote}
                    onChange={(e) => setRejectFeedbackNote(e.target.value)}
                    disabled={rejectSubmitting}
                  />
                </div>

                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: 13 }}>
                    {tx("profile.tuzatish_fayl_label")}
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                    disabled={rejectSubmitting}
                    onChange={(e) => setRejectFile(e.target.files?.[0] || null)}
                  />
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                    Hujjat (PDF, Word, Excel) yoki xatolik skrinshoti (PNG, JPG)
                  </div>
                </div>
              </div>

              <div className="modal-footer row end" style={{ gap: 10, padding: "12px 20px" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={rejectSubmitting}
                  onClick={() => setRejectModalItem(null)}
                >
                  {tx("common.bekor_qilish")}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: "#d97706", borderColor: "#d97706" }}
                  disabled={rejectSubmitting || (!rejectFeedbackNote.trim() && !rejectFile)}
                >
                  {rejectSubmitting ? "Yuborilmoqda..." : tx("profile.tuzatish_yuborish")}
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
