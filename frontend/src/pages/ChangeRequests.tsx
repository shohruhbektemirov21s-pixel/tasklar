/**
 * Axborot tizimiga o'zgartirish kiritish bo'yicha so'rovlar (Buyurtmalar / TZ) sahifasi.
 *
 * Asos: «AXBOROT TIZIMIGA O'ZGARTIRISH KIRITISH BO'YICHA SO'ROV BLANKASI» (Буюртма.docx).
 * - Sohaviy boshqarmalar: yangi TZ yaratish, loyihani tanlash, TZ faylini yuklash.
 * - Loyiha haqida ma'lumotlar: loyiha nomi, holati, PM, muddatlar, foiz va havolalar.
 * - Muhimlilik turi va qanchada tugashi: PM o'zi vaqtni va muddatni belgilaydi.
 * - Rasmiy Word (.docx) blanki va biriktirilgan TZ fayllarini yuklab olish.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, listOf, pagesOf, totalOf } from "@/api/client";
import type { ChangeRequestItem, OrderStats, Project } from "@/api/types";
import { useFetch } from "@/api/useFetch";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import {
  IconDownload,
  IconOrder,
  IconPaperclip,
  IconPlus,
  IconProject,
} from "@/components/icons";
import {
  Card,
  Empty,
  ErrorMsg,
  Loading,
  Pager,
  Progress,
  fmtDate,
} from "@/components/ui";

const PER_PAGE = 10;

const EMPTY_FORM: Partial<ChangeRequestItem> = {
  system_name: "TeamFlow",
  module: "",
  project: null,
  department: "",
  responsible_person: "",
  priority: "HIGH",
  due_date: "",
  current_state: "",
  requested_change: "",
  reason: "",
  affected_modules: "",
  dependent_systems: "",
  change_nature: "BOTH",
  additional_materials: "",
  test_result: "",
  status: "NEW",
  client_signer: "",
  executor_signer: "",
  estimated_resources: "",
  pm_estimated_duration: "",
  pm_deadline: "",
  pm_notes: "",
};

export default function ChangeRequests() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState<string>("");

  // Modal oynalari
  const [viewingItem, setViewingItem] = useState<ChangeRequestItem | null>(null);
  const [editingItem, setEditingItem] = useState<Partial<ChangeRequestItem> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [tzFile, setTzFile] = useState<File | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // PM qarorini belgilash holatlari (view modal ichida)
  const [pmDecisionForm, setPmDecisionForm] = useState<{
    status: ChangeRequestItem["status"];
    pm_estimated_duration: string;
    pm_deadline: string;
    pm_notes: string;
  }>({
    status: "ACCEPTED",
    pm_estimated_duration: "",
    pm_deadline: "",
    pm_notes: "",
  });
  const [pmSaveLoading, setPmSaveLoading] = useState(false);
  const [pmSaveError, setPmSaveError] = useState<string | null>(null);
  const [pmSaveSuccess, setPmSaveSuccess] = useState<string | null>(null);

  // Ma'lumotlarni olish
  const { data, error, loading, reload } = useFetch<{ count: number; results: ChangeRequestItem[] } | ChangeRequestItem[]>(
    "/orders/",
    {
      page,
      search: search || undefined,
      status: statusFilter || undefined,
      priority: priorityFilter || undefined,
      project: projectFilter || undefined,
    }
  );

  const { data: statsData } = useFetch<OrderStats>("/orders/stats/");
  const { data: projectsData } = useFetch<{ count: number; results: Project[] } | Project[]>("/projects/", { scope: "visible" });

  const items: ChangeRequestItem[] = useMemo(() => (data ? listOf<ChangeRequestItem>(data) : []), [data]);
  const projects: Project[] = useMemo(() => (projectsData ? listOf<Project>(projectsData) : []), [projectsData]);

  const total = totalOf(data);
  const pages = pagesOf(data, PER_PAGE);

  // Foydalanuvchi roli tekshiruvi
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

  // Tanlangan loyihani qidirish
  const selectedProjectInForm = useMemo(() => {
    if (!editingItem?.project) return null;
    return projects.find((p) => p.id === Number(editingItem.project)) || null;
  }, [editingItem?.project, projects]);

  // Word (.docx) yuklab olish
  const handleDownloadDocx = (id: number, requestNo: string) => {
    const token = localStorage.getItem("tf_access");
    fetch(`/api/orders/${id}/export-docx/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error("Faylni yuklab bo'lmadi");
        return res.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Buyurtma_TZ_${requestNo}.docx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch((e) => alert("Word faylini yuklab olishda xatolik: " + e.message));
  };

  // Yangi buyurtma yaratish
  const handleOpenNew = () => {
    setIsNew(true);
    setTzFile(null);
    setEditingItem({
      ...EMPTY_FORM,
      request_date: new Date().toISOString().split("T")[0],
      department: user?.department_name || "",
      responsible_person: user?.full_name || "",
    });
    setSaveError(null);
  };

  // Tahrirlash
  const handleOpenEdit = (item: ChangeRequestItem) => {
    setIsNew(false);
    setTzFile(null);
    setEditingItem({ ...item });
    setSaveError(null);
    setViewingItem(null);
  };

  // Batafsil ko'rishni ochish
  const handleOpenView = (item: ChangeRequestItem) => {
    setViewingItem(item);
    setPmDecisionForm({
      status: item.status,
      pm_estimated_duration: item.pm_estimated_duration || "",
      pm_deadline: item.pm_deadline || "",
      pm_notes: item.pm_notes || "",
    });
    setPmSaveError(null);
    setPmSaveSuccess(null);
  };

  // Saqlash (Yangi yoki tahrirlash)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setSaveLoading(true);
    setSaveError(null);

    try {
      const formData = new FormData();
      Object.entries(editingItem).forEach(([key, val]) => {
        if (key === "tz_file" || key === "tz_file_url" || key === "project_detail" || val === null || val === undefined) {
          return;
        }
        formData.append(key, String(val));
      });

      if (tzFile) {
        formData.append("tz_file", tzFile);
      }

      if (isNew) {
        await api.post("/orders/", formData);
      } else if (editingItem.id) {
        await api.patch(`/orders/${editingItem.id}/`, formData);
      }

      setEditingItem(null);
      setTzFile(null);
      reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Buyurtmani saqlashda xatolik yuz berdi.";
      setSaveError(msg);
    } finally {
      setSaveLoading(false);
    }
  };

  // PM qarorini saqlash
  const handleSavePMDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingItem) return;
    setPmSaveLoading(true);
    setPmSaveError(null);
    setPmSaveSuccess(null);

    try {
      const updated = await api.post<ChangeRequestItem>(
        `/orders/${viewingItem.id}/set-pm-decision/`,
        pmDecisionForm
      );
      setViewingItem(updated);
      setPmSaveSuccess("PM qarori va bajarilish muddatlari muvaffaqiyatli saqlandi!");
      reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "PM qarorini saqlashda xatolik yuz berdi.";
      setPmSaveError(msg);
    } finally {
      setPmSaveLoading(false);
    }
  };

  if (user && !canAccess) {
    return (
      <div className="card" style={{ maxWidth: 640, margin: "60px auto", padding: 36, textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🏛️</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Kirish huquqi cheklangan</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.6, marginBottom: 24, fontSize: 14 }}>
          Axborot tizimiga o'zgartirish kiritish buyurtmalari (TZ / Change Requests) bo'limi faqat{" "}
          <strong>Sohaviy boshqarmalar</strong>, <strong>Loyiha menejerlari (PM)</strong> hamda tizim rahbariyati uchun ochiq.
        </p>
        <Link to="/panel" className="btn btn-primary" style={{ padding: "8px 20px" }}>
          Bosh sahifaga qaytish
        </Link>
      </div>
    );
  }

  return (
    <>
      <PageHead
        title={
          <span className="row middle" style={{ gap: 8 }}>
            <IconOrder size={20} />
            <strong>Axborot tizimiga o'zgartirish kiritish so'rovlari (TZ / Buyurtmalar)</strong>
          </span>
        }
        actions={
          <div className="row middle" style={{ gap: 10 }}>
            {total > 0 && <span className="badge badge-brand">{total} ta buyurtma</span>}
            <button className="btn btn-primary btn-sm" onClick={handleOpenNew}>
              <IconPlus size={15} /> Yangi TZ / Buyurtma yaratish
            </button>
          </div>
        }
      />

      <div className="content">
        {/* Yuqori ko'rsatkichlar kartalari */}
        <div className="row" style={{ gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <div className="card" style={{ flex: 1, minWidth: 160, padding: "14px 18px" }}>
            <span className="muted" style={{ fontSize: 12 }}>Jami so'rovlar</span>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--brand)" }}>
              {statsData?.total ?? total}
            </div>
          </div>
          <div className="card" style={{ flex: 1, minWidth: 160, padding: "14px 18px" }}>
            <span className="muted" style={{ fontSize: 12 }}>Yangi (Kutilmoqda)</span>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#d97706" }}>
              {statsData?.new ?? 0}
            </div>
          </div>
          <div className="card" style={{ flex: 1, minWidth: 160, padding: "14px 18px" }}>
            <span className="muted" style={{ fontSize: 12 }}>Jarayonda / Testda</span>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#2563eb" }}>
              {statsData?.in_progress ?? 0}
            </div>
          </div>
          <div className="card" style={{ flex: 1, minWidth: 160, padding: "14px 18px" }}>
            <span className="muted" style={{ fontSize: 12 }}>Bajarilgan</span>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#16a34a" }}>
              {statsData?.completed ?? 0}
            </div>
          </div>
          <div className="card" style={{ flex: 1, minWidth: 160, padding: "14px 18px" }}>
            <span className="muted" style={{ fontSize: 12 }}>Shoshilinch (Urgent)</span>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#dc2626" }}>
              {statsData?.urgent ?? 0}
            </div>
          </div>
        </div>

        {/* Qidiruv va filtrlar */}
        <div className="card" style={{ padding: "12px 16px", marginBottom: 16 }}>
          <div className="row middle between" style={{ gap: 12, flexWrap: "wrap" }}>
            <div className="row middle" style={{ gap: 10, flex: 1, minWidth: 260 }}>
              <input
                type="text"
                placeholder="Raqam, tizim, loyiha, modul, bo'linma yoki tavsif bo'yicha qidiruv..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                style={{ flex: 1, minWidth: 200 }}
              />
            </div>
            <div className="row middle" style={{ gap: 10, flexWrap: "wrap" }}>
              {/* Loyiha filtri */}
              <select
                value={projectFilter}
                onChange={(e) => {
                  setProjectFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Barcha loyihalar</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.key})
                  </option>
                ))}
              </select>

              {/* Holat filtri */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Barcha holatlar</option>
                <option value="NEW">Yangi</option>
                <option value="ACCEPTED">Qabul qilindi</option>
                <option value="IN_PROGRESS">Jarayonda</option>
                <option value="TESTING">Test qilinmoqda</option>
                <option value="COMPLETED">Bajarildi</option>
                <option value="REJECTED">Rad etildi</option>
              </select>

              {/* Ustuvorlik / Muhimlilik filtri */}
              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Barcha muhimlilik</option>
                <option value="URGENT">Shoshilinch / O'ta muhim</option>
                <option value="HIGH">Yuqori</option>
                <option value="MEDIUM">O'rta</option>
                <option value="LOW">Past</option>
              </select>

              {(search || statusFilter || priorityFilter || projectFilter) && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("");
                    setPriorityFilter("");
                    setProjectFilter("");
                    setPage(1);
                  }}
                >
                  Tozalash
                </button>
              )}
            </div>
          </div>
        </div>

        <ErrorMsg error={error} />

        {/* Asosiy jadval */}
        {loading ? (
          <Loading />
        ) : items.length ? (
          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 40, textAlign: "center" }}>#</th>
                    <th>Talabnoma №</th>
                    <th>Loyiha va Tizim</th>
                    <th>Talab qilinayotgan o'zgartirish</th>
                    <th>Bo'linma / Mas'ul</th>
                    <th>Muhimlilik</th>
                    <th>Qanchada tugashi / PM muddati</th>
                    <th>Holati</th>
                    <th>TZ Fayli</th>
                    <th className="right">Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const rowNum = (page - 1) * PER_PAGE + idx + 1;
                    return (
                      <tr key={item.id}>
                        <td className="mono muted" style={{ textAlign: "center", fontSize: 12 }}>
                          {rowNum}
                        </td>
                        <td>
                          <button
                            className="btn btn-link"
                            style={{ fontWeight: 700, padding: 0 }}
                            onClick={() => handleOpenView(item)}
                          >
                            {item.request_no}
                          </button>
                        </td>
                        <td>
                          {item.project_detail ? (
                            <div>
                              <span
                                className="badge"
                                style={{
                                  backgroundColor: item.project_detail.color || "var(--brand)",
                                  color: "#fff",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                }}
                              >
                                {item.project_detail.key}
                              </span>{" "}
                              <strong style={{ fontSize: 13 }}>{item.project_detail.name}</strong>
                              <div className="muted" style={{ fontSize: 11 }}>
                                {item.system_name} {item.module ? `(${item.module})` : ""}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <strong style={{ fontSize: 13 }}>{item.system_name}</strong>
                              <div className="muted" style={{ fontSize: 11 }}>
                                {item.module || "Umumiy modul"}
                              </div>
                            </div>
                          )}
                        </td>
                        <td style={{ maxWidth: 260 }}>
                          <div
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={item.requested_change}
                          >
                            {item.requested_change}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: 12.5 }}>{item.department}</div>
                          <span className="muted" style={{ fontSize: 11 }}>
                            {item.responsible_person}
                          </span>
                        </td>
                        <td>
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
                          >
                            {item.priority_display || item.priority}
                          </span>
                        </td>
                        <td>
                          {item.pm_estimated_duration || item.pm_deadline ? (
                            <div>
                              {item.pm_estimated_duration && (
                                <div style={{ fontWeight: 600, fontSize: 12, color: "var(--brand)" }}>
                                  ⏱ {item.pm_estimated_duration}
                                </div>
                              )}
                              {item.pm_deadline && (
                                <div className="muted" style={{ fontSize: 11 }}>
                                  📅 {fmtDate(item.pm_deadline)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="muted" style={{ fontSize: 11.5, fontStyle: "italic" }}>
                              Kutilmoqda (PM belgilaydi)
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              item.status === "COMPLETED"
                                ? "badge-ok"
                                : item.status === "IN_PROGRESS" || item.status === "TESTING"
                                ? "badge-brand"
                                : item.status === "NEW"
                                ? "badge-warning"
                                : item.status === "REJECTED"
                                ? "badge-danger"
                                : ""
                            }`}
                          >
                            {item.status_display || item.status}
                          </span>
                        </td>
                        <td>
                          {item.tz_file_url ? (
                            <a
                              href={item.tz_file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-xs btn-outline row middle"
                              style={{ gap: 4, padding: "3px 8px", fontSize: 11.5 }}
                              title={`Yuklab olish: ${item.tz_file_name || "TZ fayli"} (${item.tz_file_size_display || ""})`}
                            >
                              <IconPaperclip size={13} />
                              <span>Fayl</span>
                            </a>
                          ) : (
                            <span className="muted" style={{ fontSize: 12 }}>—</span>
                          )}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="btn btn-sm"
                              title="Batafsil ko'rish va PM qarori"
                              onClick={() => handleOpenView(item)}
                            >
                              Ko'rish
                            </button>
                            <button
                              className="btn btn-sm btn-ghost"
                              title="Rasmiy Word (.docx) blankini yuklab olish"
                              onClick={() => handleDownloadDocx(item.id, item.request_no)}
                            >
                              <IconDownload size={14} /> Word
                            </button>
                            <button
                              className="btn btn-sm btn-ghost"
                              title="Tahrirlash"
                              onClick={() => handleOpenEdit(item)}
                            >
                              Tahrir
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div
                className="card-body row between middle"
                style={{
                  borderTop: "1px solid var(--border-color)",
                  padding: "12px 16px",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  {total} tadan {(page - 1) * PER_PAGE + 1}—{Math.min(page * PER_PAGE, total)} tasi
                </p>
                <Pager page={page} pages={pages} onPick={setPage} />
              </div>
            )}
          </div>
        ) : (
          <Card>
            <Empty
              icon="📄"
              title="Hozircha buyurtmalar (TZ) yo'q"
              text="Axborot tizimiga yangi o'zgartirish yoki funksiya kiritish bo'yicha talabnoma va TZ fayli yarating."
            />
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button className="btn btn-primary" onClick={handleOpenNew}>
                <IconPlus size={15} /> Birinchi TZ / Buyurtmani yaratish
              </button>
            </div>
          </Card>
        )}
      </div>

      {/* 1. BATAFSIL KO'RISH MODAL (Буюртма.docx blankasi, Loyiha ma'lumoti va PM Paneli) */}
      {viewingItem && (
        <div className="modal-overlay" onClick={() => setViewingItem(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 880, width: "95%", maxHeight: "92vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header row between middle">
              <div className="row middle" style={{ gap: 8, flexWrap: "wrap" }}>
                <span className="badge badge-brand">{viewingItem.request_no}</span>
                <strong>{viewingItem.system_name} — {viewingItem.module || "Tizim"}</strong>
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
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => handleDownloadDocx(viewingItem.id, viewingItem.request_no)}
                >
                  <IconDownload size={14} /> Word (.docx)
                </button>
                {viewingItem.tz_file_url && (
                  <a
                    href={viewingItem.tz_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm btn-outline row middle"
                    style={{ gap: 4 }}
                  >
                    <IconPaperclip size={14} /> TZ Fayli
                  </a>
                )}
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => handleOpenEdit(viewingItem)}
                >
                  Tahrirlash
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setViewingItem(null)}>
                  ✕
                </button>
              </div>
            </div>

            <div className="modal-body" style={{ padding: 20 }}>
              {/* Rasmiy Blank Sarlavhasi */}
              <div
                style={{
                  background: "var(--brand-dark, #1e3a8a)",
                  color: "#fff",
                  padding: "12px 16px",
                  borderRadius: 6,
                  textAlign: "center",
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  AXBOROT TIZIMIGA O'ZGARTIRISH KIRITISH BO'YICHA SO'ROV BLANKASI
                </div>
                <div style={{ fontSize: 12, opacity: 0.85, fontStyle: "italic" }}>
                  Har bir yangi funksiya yoki o'zgartirish (TZ) uchun alohida to'ldiriladi
                </div>
              </div>

              {/* A. TEGISHLI LOYIHA (PROJECT) MA'LUMOTLARI */}
              {viewingItem.project_detail ? (
                <div
                  style={{
                    background: "var(--surface, #f8fafc)",
                    border: "1px solid var(--border-color)",
                    borderRadius: 6,
                    padding: 14,
                    marginBottom: 16,
                  }}
                >
                  <div className="row between middle" style={{ marginBottom: 10 }}>
                    <div className="row middle" style={{ gap: 8 }}>
                      <IconProject size={18} />
                      <strong style={{ fontSize: 14, color: "var(--brand)" }}>
                        Tegishli Loyiha (Project) Ma'lumotlari
                      </strong>
                    </div>
                    <Link
                      to={`/loyiha/${viewingItem.project_detail.id}`}
                      className="btn btn-xs btn-outline"
                    >
                      Loyihaga o'tish →
                    </Link>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: 12,
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <span className="muted" style={{ fontSize: 11.5 }}>Loyiha nomi va Kaliti:</span>
                      <div>
                        <strong>{viewingItem.project_detail.name}</strong>{" "}
                        <span className="badge badge-brand">{viewingItem.project_detail.key}</span>
                      </div>
                    </div>
                    <div>
                      <span className="muted" style={{ fontSize: 11.5 }}>Loyiha Menejeri (PM):</span>
                      <div>
                        <strong>{viewingItem.project_detail.manager_name || "Menejer biriktirilmagan"}</strong>
                        {viewingItem.project_detail.manager_email && (
                          <div className="muted" style={{ fontSize: 11 }}>
                            {viewingItem.project_detail.manager_email}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="muted" style={{ fontSize: 11.5 }}>Loyiha holati va Muddat:</span>
                      <div>
                        <span className="badge badge-ok">{viewingItem.project_detail.status_display}</span>
                        {viewingItem.project_detail.due_date && (
                          <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                            (Muddat: {fmtDate(viewingItem.project_detail.due_date)})
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="muted" style={{ fontSize: 11.5 }}>Bajarilish holati:</span>
                      <div className="row middle" style={{ gap: 8, marginTop: 4 }}>
                        <div style={{ flex: 1 }}>
                          <Progress value={viewingItem.project_detail.progress || 0} />
                        </div>
                        <span style={{ fontWeight: 700, fontSize: 12 }}>
                          {viewingItem.project_detail.progress}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {viewingItem.project_detail.description && (
                    <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--muted)" }}>
                      <strong>Loyiha tavsifi:</strong> {viewingItem.project_detail.description}
                    </div>
                  )}
                </div>
              ) : null}

              {/* B. BIRIKTIRILGAN TZ FAYLI */}
              {viewingItem.tz_file_url && (
                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: 6,
                    padding: 12,
                    marginBottom: 16,
                  }}
                  className="row between middle"
                >
                  <div className="row middle" style={{ gap: 10 }}>
                    <span style={{ fontSize: 24 }}>📄</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#166534" }}>
                        Biriktirilgan TZ (Texnik topshiriq) hujjati
                      </div>
                      <div style={{ fontSize: 12, color: "#15803d" }}>
                        {viewingItem.tz_file_name || "Texnik topshiriq fayli"} •{" "}
                        {viewingItem.tz_file_size_display || ""}
                      </div>
                    </div>
                  </div>
                  <a
                    href={viewingItem.tz_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm btn-primary"
                    style={{ backgroundColor: "#16a34a", borderColor: "#16a34a" }}
                  >
                    <IconDownload size={14} /> Faylni yuklab olish
                  </a>
                </div>
              )}

              {/* Metama'lumotlar to'ri */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                  background: "var(--surface, #f8fafc)",
                  padding: 14,
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  marginBottom: 16,
                  fontSize: 13,
                }}
              >
                <div>
                  <span className="muted">Tizim nomi:</span>
                  <div><strong>{viewingItem.system_name}</strong></div>
                </div>
                <div>
                  <span className="muted">Modul:</span>
                  <div><strong>{viewingItem.module || "-"}</strong></div>
                </div>
                <div>
                  <span className="muted">Talabnoma raqami:</span>
                  <div><strong>{viewingItem.request_no}</strong></div>
                </div>
                <div>
                  <span className="muted">Sana:</span>
                  <div><strong>{fmtDate(viewingItem.request_date)}</strong></div>
                </div>
                <div>
                  <span className="muted">Buyurtmachi bo'linma:</span>
                  <div><strong>{viewingItem.department}</strong></div>
                </div>
                <div>
                  <span className="muted">Mas'ul shaxs:</span>
                  <div><strong>{viewingItem.responsible_person}</strong></div>
                </div>
                <div>
                  <span className="muted">Muhimlilik turi:</span>
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
                    >
                      {viewingItem.priority_display || viewingItem.priority}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="muted">Kerakli muddat (so'ralgan):</span>
                  <div><strong>{viewingItem.due_date ? fmtDate(viewingItem.due_date) : "-"}</strong></div>
                </div>
              </div>

              {/* C. 1-Bo'lim: Tizimga qo'shimcha va o'zgartirish kiritish */}
              <div className="section-box" style={{ marginBottom: 16 }}>
                <div
                  style={{
                    background: "var(--brand, #2563eb)",
                    color: "#fff",
                    padding: "6px 12px",
                    fontWeight: 700,
                    fontSize: 13,
                    borderRadius: "4px 4px 0 0",
                  }}
                >
                  1. TIZIMGA QO'SHIMCHA VA O'ZGARTIRISH KIRITISH
                </div>
                <div
                  style={{
                    border: "1px solid var(--border-color)",
                    borderTop: "none",
                    padding: 14,
                    borderRadius: "0 0 4px 4px",
                  }}
                >
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
                      1.1 Joriy holat (nima ishlamayapti / nimani o'zgartirish kerak):
                    </div>
                    <div className="tl-detail" style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
                      {viewingItem.current_state || "-"}
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
                      1.2 Talab qilinayotgan o'zgartirish (aniq va batafsil tavsif):
                    </div>
                    <div className="tl-detail" style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
                      {viewingItem.requested_change || "-"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
                      1.3 Sabab / maqsad (qonun talabi, biznes ehtiyoji, xato va h.k.):
                    </div>
                    <div className="tl-detail" style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
                      {viewingItem.reason || "-"}
                    </div>
                  </div>
                </div>
              </div>

              {/* D. 2-Bo'lim: Ta'sir doirasi */}
              <div className="section-box" style={{ marginBottom: 16 }}>
                <div
                  style={{
                    background: "var(--brand, #2563eb)",
                    color: "#fff",
                    padding: "6px 12px",
                    fontWeight: 700,
                    fontSize: 13,
                    borderRadius: "4px 4px 0 0",
                  }}
                >
                  2. TA'SIR DOIRASI
                </div>
                <div
                  style={{
                    border: "1px solid var(--border-color)",
                    borderTop: "none",
                    padding: 14,
                    borderRadius: "0 0 4px 4px",
                  }}
                >
                  <div style={{ marginBottom: 10 }}>
                    <strong>2.1 Qaysi modul / funksionallikka ta'sir qiladi:</strong>{" "}
                    <span>{viewingItem.affected_modules || "-"}</span>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <strong>2.2 Bog'liq tizimlar / integratsiyalar:</strong>{" "}
                    <span>{viewingItem.dependent_systems || "-"}</span>
                  </div>
                  <div>
                    <strong>2.3 O'zgarish xarakteri:</strong>{" "}
                    <span className="badge badge-brand">
                      {viewingItem.change_nature_display || viewingItem.change_nature}
                    </span>
                  </div>
                </div>
              </div>

              {/* E. 3-Bo'lim: Qo'shimcha materiallar */}
              <div className="section-box" style={{ marginBottom: 16 }}>
                <div
                  style={{
                    background: "var(--brand, #2563eb)",
                    color: "#fff",
                    padding: "6px 12px",
                    fontWeight: 700,
                    fontSize: 13,
                    borderRadius: "4px 4px 0 0",
                  }}
                >
                  3. QO'SHIMCHA MATERIALLAR (ILOVALAR)
                </div>
                <div
                  style={{
                    border: "1px solid var(--border-color)",
                    borderTop: "none",
                    padding: 14,
                    borderRadius: "0 0 4px 4px",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {viewingItem.additional_materials || "Mavjud emas"}
                </div>
              </div>

              {/* F. 4-Bo'lim: Test qilish */}
              <div className="section-box" style={{ marginBottom: 16 }}>
                <div
                  style={{
                    background: "var(--brand, #2563eb)",
                    color: "#fff",
                    padding: "6px 12px",
                    fontWeight: 700,
                    fontSize: 13,
                    borderRadius: "4px 4px 0 0",
                  }}
                >
                  4. O'ZGARISHNI TEST QILISH (BUYURTMACHI TOMONIDAN TEST QILINADI)
                </div>
                <div
                  style={{
                    border: "1px solid var(--border-color)",
                    borderTop: "none",
                    padding: 14,
                    borderRadius: "0 0 4px 4px",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {viewingItem.test_result || "Hali test qilinmagan"}
                </div>
              </div>

              {/* G. 5-Bo'lim: Tasdiqlash va PM Qarori */}
              <div className="section-box" style={{ marginBottom: 16 }}>
                <div
                  style={{
                    background: "var(--brand, #2563eb)",
                    color: "#fff",
                    padding: "6px 12px",
                    fontWeight: 700,
                    fontSize: 13,
                    borderRadius: "4px 4px 0 0",
                  }}
                >
                  5. TASDIQLASH VA IJRO (PM TOMONIDAN BELGILANADI)
                </div>
                <div
                  style={{
                    border: "1px solid var(--border-color)",
                    borderTop: "none",
                    padding: 14,
                    borderRadius: "0 0 4px 4px",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 16,
                  }}
                >
                  <div>
                    <span className="muted" style={{ fontSize: 12 }}>Buyurtmachi:</span>
                    <div><strong>{viewingItem.client_signer || viewingItem.responsible_person}</strong></div>
                  </div>
                  <div>
                    <span className="muted" style={{ fontSize: 12 }}>Ijrochi / Mas'ul PM:</span>
                    <div>
                      <strong>
                        {viewingItem.assigned_pm_name || viewingItem.executor_signer || "Biriktirilmagan"}
                      </strong>
                    </div>
                  </div>
                  <div>
                    <span className="muted" style={{ fontSize: 12 }}>Qanchada tugashi (PM bahosi):</span>
                    <div>
                      <strong>
                        {viewingItem.pm_estimated_duration || viewingItem.estimated_resources || "Ko'rib chiqilmoqda"}
                      </strong>
                    </div>
                  </div>
                  <div>
                    <span className="muted" style={{ fontSize: 12 }}>PM belgilagan yakuniy muddat:</span>
                    <div>
                      <strong>
                        {viewingItem.pm_deadline ? fmtDate(viewingItem.pm_deadline) : "Hali belgilanmagan"}
                      </strong>
                    </div>
                  </div>
                  {viewingItem.pm_notes && (
                    <div style={{ gridColumn: "span 2" }}>
                      <span className="muted" style={{ fontSize: 12 }}>PM xulosasi va ko'rsatmalari:</span>
                      <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
                        {viewingItem.pm_notes}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* H. PM MAXSUS BOSHQARUV PANELI (PM O'ZI VAQT VA MUDDATNI BELGILAYDI) */}
              {isPMOrAdmin && (
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
                      Loyiha Menejeri (PM) qarori va muddat belgilash paneli
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
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <div className="field">
                        <label style={{ fontWeight: 600, fontSize: 12 }}>Buyurtma holati *</label>
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
                          <option value="NEW">Yangi (Yuborilgan)</option>
                          <option value="ACCEPTED">Qabul qilindi (Tasdiqlandi)</option>
                          <option value="IN_PROGRESS">Jarayonda (Ishlanmoqda)</option>
                          <option value="TESTING">Test qilinmoqda</option>
                          <option value="COMPLETED">Bajarildi (Yakunlandi)</option>
                          <option value="REJECTED">Rad etildi</option>
                        </select>
                      </div>
                      <div className="field">
                        <label style={{ fontWeight: 600, fontSize: 12 }}>
                          Qanchada tugashi (PM bahosi) *
                        </label>
                        <input
                          type="text"
                          placeholder="masalan: 10 ish kuni, 3 hafta, 1 oy"
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
                          PM belgilagan yakuniy muddat
                        </label>
                        <input
                          type="date"
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
                      <label style={{ fontWeight: 600, fontSize: 12 }}>
                        PM xulosasi va jamoa uchun topshiriq ko'rsatmalari
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Ushbu buyurtma bo'yicha menejer xulosasi yoki ijrochilar uchun ko'rsatma..."
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
                        {pmSaveLoading ? "Saqlanmoqda..." : "PM Qarori va Muddatni Tasdiqlash"}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>

            <div className="modal-footer row between middle" style={{ padding: "12px 20px" }}>
              <button
                className="btn btn-outline"
                onClick={() => handleDownloadDocx(viewingItem.id, viewingItem.request_no)}
              >
                <IconDownload size={15} /> Rasmiy Word (.docx) yuklab olish
              </button>
              <button className="btn btn-ghost" onClick={() => setViewingItem(null)}>
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. YANGI YARATISH VA TAHRIRLASH FORMASI */}
      {editingItem && (
        <div className="modal-overlay" onClick={() => setEditingItem(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 840, width: "95%", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleSave}>
              <div className="modal-header row between middle">
                <strong>
                  {isNew
                    ? "Yangi o'zgartirish so'rovi (TZ va Buyurtma blankasi)"
                    : `Buyurtmani tahrirlash — ${editingItem.request_no}`}
                </strong>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setEditingItem(null)}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body" style={{ padding: 20 }}>
                {saveError && <ErrorMsg error={saveError} />}

                {/* Asosiy ma'lumotlar */}
                <h4 style={{ margin: "0 0 10px", color: "var(--brand)" }}>
                  Asosiy ma'lumotlar va Loyiha tanlovi
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                  <div className="field">
                    <label>Tizim nomi *</label>
                    <input
                      type="text"
                      required
                      value={editingItem.system_name || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, system_name: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Tegishli loyiha (Project)</label>
                    <select
                      value={editingItem.project ? String(editingItem.project) : ""}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          project: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    >
                      <option value="">-- Loyihani tanlang (ixtiyoriy) --</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.key})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Modul / Yo'nalish *</label>
                    <input
                      type="text"
                      required
                      placeholder="masalan, Vazifalar, Xavfsizlik, Auth"
                      value={editingItem.module || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, module: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Buyurtma qilayotgan bo'linma *</label>
                    <input
                      type="text"
                      required
                      placeholder="masalan, Axborot xavfsizligi boshqarmasi"
                      value={editingItem.department || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, department: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Mas'ul shaxs (F.I.Sh.) *</label>
                    <input
                      type="text"
                      required
                      value={editingItem.responsible_person || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, responsible_person: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Muhimlilik turi (Ustuvorlik) *</label>
                    <select
                      value={editingItem.priority || "HIGH"}
                      onChange={(e) => setEditingItem({ ...editingItem, priority: e.target.value as ChangeRequestItem["priority"] })}
                    >
                      <option value="URGENT">Shoshilinch / O'ta muhim</option>
                      <option value="HIGH">Yuqori</option>
                      <option value="MEDIUM">O'rta</option>
                      <option value="LOW">Past</option>
                    </select>
                  </div>
                  <div className="field" style={{ gridColumn: "span 2" }}>
                    <label>Kerakli muddat (Buyurtmachi so'ragan sana)</label>
                    <input
                      type="date"
                      value={editingItem.due_date || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, due_date: e.target.value })}
                    />
                  </div>
                </div>

                {/* Tanlangan loyiha ko'rinishi (Preview) */}
                {selectedProjectInForm && (
                  <div
                    style={{
                      background: "var(--surface, #f8fafc)",
                      border: "1px solid var(--border-color)",
                      borderRadius: 6,
                      padding: 12,
                      marginBottom: 16,
                      fontSize: 12.5,
                    }}
                  >
                    <div className="row middle" style={{ gap: 8, marginBottom: 4 }}>
                      <span className="badge badge-brand">{selectedProjectInForm.key}</span>
                      <strong>{selectedProjectInForm.name}</strong>
                      <span className="muted">
                        • Menejer: {selectedProjectInForm.manager?.full_name || "Menejer yo'q"}
                      </span>
                    </div>
                    {selectedProjectInForm.description && (
                      <div className="muted" style={{ marginTop: 2 }}>
                        {selectedProjectInForm.description}
                      </div>
                    )}
                  </div>
                )}

                {/* TZ FAYLI YUKLASH BO'LIMI */}
                <h4 style={{ margin: "16px 0 10px", color: "var(--brand)" }}>
                  Texnik topshiriq (TZ) fayli
                </h4>
                <div
                  style={{
                    border: "2px dashed var(--border-color)",
                    borderRadius: 6,
                    padding: 16,
                    background: "var(--surface, #f8fafc)",
                    marginBottom: 16,
                  }}
                >
                  <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
                    Rasmiy TZ hujjati yoki talablar faylini yuklang (PDF, Word, Excel, ZIP, rasm):
                  </div>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.png,.jpg,.jpeg"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setTzFile(e.target.files[0]);
                      }
                    }}
                  />
                  {tzFile ? (
                    <div
                      style={{
                        marginTop: 10,
                        padding: "6px 10px",
                        background: "#dcfce7",
                        borderRadius: 4,
                        color: "#166534",
                        fontSize: 12.5,
                      }}
                      className="row between middle"
                    >
                      <span>
                        📎 Tanlangan fayl: <strong>{tzFile.name}</strong> ({(tzFile.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        onClick={() => setTzFile(null)}
                      >
                        Bekor qilish
                      </button>
                    </div>
                  ) : editingItem.tz_file_name ? (
                    <div style={{ marginTop: 8, fontSize: 12.5 }} className="muted">
                      Mavjud fayl: <strong>{editingItem.tz_file_name}</strong> ({editingItem.tz_file_size_display || ""})
                    </div>
                  ) : null}
                </div>

                {/* 1. Tizimga qo'shimcha va o'zgartirish kiritish */}
                <h4 style={{ margin: "16px 0 10px", color: "var(--brand)" }}>
                  1. Tizimga qo'shimcha va o'zgartirish kiritish
                </h4>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label>
                    1.1 Joriy holat (nima ishlamayapti / nimani o'zgartirish kerak) *
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Mavjud xatoliklar yoki yetishmayotgan qulayliklarni batafsil yozing..."
                    value={editingItem.current_state || ""}
                    onChange={(e) => setEditingItem({ ...editingItem, current_state: e.target.value })}
                  />
                </div>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label>
                    1.2 Talab qilinayotgan o'zgartirish (aniq va batafsil tavsif) *
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Tizimga aynan nima qo'shilishi yoki o'zgartirilishi kerakligini aniq bayon qiling..."
                    value={editingItem.requested_change || ""}
                    onChange={(e) => setEditingItem({ ...editingItem, requested_change: e.target.value })}
                  />
                </div>
                <div className="field" style={{ marginBottom: 14 }}>
                  <label>
                    1.3 Sabab / maqsad (qonun talabi, biznes ehtiyoji, xato va h.k.) *
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder="Ushbu o'zgartirish nima sababdan kerak bo'layotgani..."
                    value={editingItem.reason || ""}
                    onChange={(e) => setEditingItem({ ...editingItem, reason: e.target.value })}
                  />
                </div>

                {/* 2. Ta'sir doirasi */}
                <h4 style={{ margin: "16px 0 10px", color: "var(--brand)" }}>
                  2. Ta'sir doirasi
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                  <div className="field">
                    <label>2.1 Qaysi modul / funksionallikka ta'sir qiladi</label>
                    <input
                      type="text"
                      placeholder="masalan, Tasks API, ReviewQueue, Dashboard"
                      value={editingItem.affected_modules || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, affected_modules: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>2.2 Bog'liq tizimlar / integratsiyalar</label>
                    <input
                      type="text"
                      placeholder="masalan, IBM Db2, Redis, Telegram Bot"
                      value={editingItem.dependent_systems || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, dependent_systems: e.target.value })}
                    />
                  </div>
                  <div className="field" style={{ gridColumn: "span 2" }}>
                    <label>2.3 O'zgarish xarakteri</label>
                    <select
                      value={editingItem.change_nature || "BOTH"}
                      onChange={(e) => setEditingItem({ ...editingItem, change_nature: e.target.value as ChangeRequestItem["change_nature"] })}
                    >
                      <option value="USER_FACING">Foydalanuvchiga ko'rinadigan (Frontend/UI)</option>
                      <option value="BACKEND">Ichki o'zgarish (Backend / Baza / API)</option>
                      <option value="BOTH">Ikkalasi ham (To'liq tizim bo'ylab)</option>
                    </select>
                  </div>
                </div>

                {/* 3. Qo'shimcha materiallar */}
                <h4 style={{ margin: "16px 0 10px", color: "var(--brand)" }}>
                  3. Qo'shimcha materiallar (Ilovalar)
                </h4>
                <div className="field" style={{ marginBottom: 14 }}>
                  <label>Skrinshotlar, xato xabarlari ro'yxati</label>
                  <textarea
                    rows={2}
                    placeholder="masalan: Skrinshot 2026-09-08 102119.png, xatolik loglari..."
                    value={editingItem.additional_materials || ""}
                    onChange={(e) => setEditingItem({ ...editingItem, additional_materials: e.target.value })}
                  />
                </div>

                {/* PM va Holat bo'limi (PM va adminlar uchun) */}
                {isPMOrAdmin && (
                  <>
                    <h4 style={{ margin: "16px 0 10px", color: "var(--brand)" }}>
                      4-5. PM Qarori, Muddat va Holat
                    </h4>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                      <div className="field">
                        <label>Buyurtma holati</label>
                        <select
                          value={editingItem.status || "NEW"}
                          onChange={(e) => setEditingItem({ ...editingItem, status: e.target.value as ChangeRequestItem["status"] })}
                        >
                          <option value="NEW">Yangi (Yuborilgan)</option>
                          <option value="ACCEPTED">Qabul qilindi</option>
                          <option value="IN_PROGRESS">Jarayonda</option>
                          <option value="TESTING">Test qilinmoqda</option>
                          <option value="COMPLETED">Bajarildi</option>
                          <option value="REJECTED">Rad etildi</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Qanchada tugashi (PM bahosi)</label>
                        <input
                          type="text"
                          placeholder="masalan, 10 ish kuni, 2 hafta"
                          value={editingItem.pm_estimated_duration || ""}
                          onChange={(e) => setEditingItem({ ...editingItem, pm_estimated_duration: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>PM belgilagan yakuniy muddat</label>
                        <input
                          type="date"
                          value={editingItem.pm_deadline || ""}
                          onChange={(e) => setEditingItem({ ...editingItem, pm_deadline: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>Test qilish natijasi (Buyurtmachi)</label>
                        <input
                          type="text"
                          placeholder="masalan: Sinovdan muvaffaqiyatli o'tdi"
                          value={editingItem.test_result || ""}
                          onChange={(e) => setEditingItem({ ...editingItem, test_result: e.target.value })}
                        />
                      </div>
                      <div className="field" style={{ gridColumn: "span 2" }}>
                        <label>PM ko'rsatmalari / izohi</label>
                        <textarea
                          rows={2}
                          value={editingItem.pm_notes || ""}
                          onChange={(e) => setEditingItem({ ...editingItem, pm_notes: e.target.value })}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="modal-footer row between middle" style={{ padding: "14px 20px" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setEditingItem(null)}
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saveLoading}
                >
                  {saveLoading ? "Saqlanmoqda..." : "Buyurtma (TZ)ni saqlash"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
