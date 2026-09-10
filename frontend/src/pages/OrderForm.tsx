import { useEffect, useId, useMemo, useState } from "react";
import { ApiError, api, listOf } from "@/api/client";
import { addOrderAttachments, deleteOrderAttachment } from "@/api/orders";
import type { ChangeRequestItem, OrderAttachmentItem, OrderTypeValue, Project } from "@/api/types";
import { useFetch } from "@/api/useFetch";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Card, ErrorMsg, Loading, fmtDateTime } from "@/components/ui";
import { tx } from "@/i18n";
import { toOrders, useEntityId, useGo, useIsPath } from "@/nav";

const ORDER_DRAFT_KEY = "teamflow_draft_new_order";

export default function OrderForm() {
  const fid = useId();
  const formId = `${fid}-form`;
  const isOrderPath1 = useIsPath("/buyurtma/yangi");
  const isOrderPath2 = useIsPath("/buyurtmalar/yangi");
  const creating = isOrderPath1 || isOrderPath2;
  const stored = useEntityId("order");
  const id = creating ? null : stored;
  const go = useGo();
  const { user } = useAuth();
  const editing = Boolean(id);

  const isPM = Boolean(
    (user?.is_manager || user?.global_role === "MANAGER" || user?.specialty === "PM") &&
    !user?.is_sohaviy_boshqarma &&
    !user?.is_platform_admin &&
    !user?.is_boss
  );

  const [existingItem, setExistingItem] = useState<ChangeRequestItem | null>(null);
  const [existingAttachments, setExistingAttachments] = useState<OrderAttachmentItem[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [loaded, setLoaded] = useState(!editing);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Real-time joriy vaqt (aniq sana va soat)
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: projectsData } = useFetch<{ count: number; results: Project[] } | Project[]>(
    "/projects/",
    { scope: "visible" }
  );
  const projects: Project[] = useMemo(() => (projectsData ? listOf<Project>(projectsData) : []), [projectsData]);

  const userDepartment = useMemo(() => {
    if (!user) return "";
    if (user.department_name && user.department_name.trim()) return user.department_name.trim();
    if (user.department && typeof user.department === "string" && user.department.trim()) return user.department.trim();
    if (user.job_title && user.job_title.trim()) return user.job_title.trim();
    if (user.is_sohaviy_boshqarma || user.global_role === "SOHAVIY" || user.specialty === "SOHAVIY") {
      return "Sohaviy boshqarmalar";
    }
    if (user.specialty_display && user.specialty_display.trim()) return user.specialty_display.trim();
    return "";
  }, [user]);

  const [f, setF] = useState<{
    system_name: string;
    order_type: OrderTypeValue;
    module: string;
    department: string;
    responsible_person: string;
    priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
    due_date: string;
    project: number | null;
    tz_file_url?: string;
    tz_file_name?: string;
  }>({
    system_name: "TeamFlow",
    order_type: "NEW",
    module: "",
    department: userDepartment,
    responsible_person: user?.full_name || "",
    priority: "HIGH",
    due_date: "",
    project: null,
  });

  // Yangi buyurtmada akkaunt ma'lumotlari yuklangach bo'linma va mas'ul shaxsni avtomatik to'ldirish
  useEffect(() => {
    if (!editing && user) {
      setF((prev) => ({
        ...prev,
        department: prev.department ? prev.department : userDepartment,
        responsible_person: prev.responsible_person ? prev.responsible_person : (user.full_name || ""),
      }));
    }
  }, [editing, user, userDepartment]);

  // Tahrirlash rejimida mavjud buyurtmani yuklash
  useEffect(() => {
    let alive = true;
    if (!editing || !id) return;
    void (async () => {
      try {
        const item = await api.get<ChangeRequestItem>(`/orders/${id}/`);
        if (!alive) return;
        setExistingItem(item);
        setExistingAttachments(item.attachments || []);
        setF({
          system_name: item.system_name || "TeamFlow",
          order_type: item.order_type || "NEW",
          module: item.module || "",
          department: item.department || "",
          responsible_person: item.responsible_person || "",
          priority: item.priority || "HIGH",
          due_date: item.due_date ? item.due_date.split("T")[0] : "",
          project: item.project || null,
        });
        setLoaded(true);
      } catch (e) {
        if (alive) {
          setError(e instanceof ApiError ? e.message : "Buyurtmani yuklab bo'lmadi.");
          setLoaded(true);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [editing, id]);

  const set = (k: string, v: unknown) => {
    setF((p) => ({ ...p, [k]: v }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});

    try {
      const payload: Record<string, unknown> = {};
      Object.entries(f).forEach(([key, val]) => {
        if (val === null || val === undefined) return;
        payload[key] = val;
      });

      if (editing && id) {
        await api.patch(`/orders/${id}/`, payload);
        if (files.length > 0) {
          const fd = new FormData();
          files.forEach((file) => fd.append("files", file));
          await addOrderAttachments(id, fd);
        }
      } else {
        if (files.length > 0) {
          const fd = new FormData();
          Object.entries(payload).forEach(([key, val]) => {
            if (val !== null && val !== undefined) fd.append(key, String(val));
          });
          files.forEach((file) => fd.append("files", file));
          await api.post("/orders/", fd);
        } else {
          await api.post("/orders/", payload);
        }
        localStorage.removeItem(ORDER_DRAFT_KEY);
      }

      go(toOrders());
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Buyurtmani saqlashda xatolik yuz berdi.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (creating && isPM) {
    return (
      <div className="content">
        <div className="card" style={{ maxWidth: 540, margin: "40px auto", padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🚫</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Ruxsat berilmagan</h2>
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
            Yangi buyurtma (TZ) yaratish faqat sohaviy boshqarma vakillariga ruxsat etilgan. Loyiha menejeri (PM) buyurtma yarata olmaydi.
          </p>
          <button className="btn btn-primary" onClick={() => go(toOrders())}>
            Buyurtmalar ro'yxatiga qaytish
          </button>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="content">
        <Loading />
      </div>
    );
  }

  const isSohaviy = Boolean(user?.is_sohaviy_boshqarma || user?.specialty === "SOHAVIY");
  const isLockedForDepartment = Boolean(
    editing &&
    existingItem &&
    isSohaviy &&
    !user?.is_platform_admin &&
    !user?.is_boss &&
    (existingItem.status !== "NEW" || existingItem.assigned_pm)
  );

  if (isLockedForDepartment) {
    return (
      <div className="content">
        <div className="card" style={{ maxWidth: 580, margin: "40px auto", padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Buyurtmani tahrirlash cheklangan</h2>
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
            «{existingItem?.request_no}» raqamli buyurtma loyiha menejeri (PM) tomonidan qabul qilingan yoki jarayonga o'tkazilgan. Sohaviy boshqarma qabul qilingan TZ va buyurtmani tahrirlay olmaydi yoki o'chira olmaydi.
          </p>
          <button className="btn btn-primary" onClick={() => go(toOrders())}>
            Buyurtmalar ro'yxatiga qaytish
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHead
        title={<strong>{editing ? "Buyurtmani tahrirlash" : "Yangi buyurtma (TZ)"}</strong>}
        actions={
          <div className="row" style={{ gap: 8 }}>
            <select
              aria-label="Muhimlilik darajasi"
              title="Muhimlilik darajasi"
              value={f.priority}
              style={{ width: "auto", minWidth: 150 }}
              onChange={(e) => set("priority", e.target.value)}
            >
              <option value="URGENT">Shoshilinch</option>
              <option value="HIGH">Yuqori</option>
              <option value="MEDIUM">O'rta</option>
              <option value="LOW">Past</option>
            </select>
            <button className="btn btn-primary" form={formId} disabled={busy}>
              {busy ? "Yuborilmoqda..." : editing ? "O'zgarishlarni saqlash" : "Buyurtma yuborish"}
            </button>
            <button type="button" className="btn" onClick={() => go(toOrders())}>
              Bekor qilish
            </button>
          </div>
        }
      />

      <div className="content">
        <ErrorMsg error={error} />

        <form id={formId} onSubmit={submit}>
          <div style={{ maxWidth: 840, margin: "0 auto" }}>
            <Card title="Asosiy ma'lumot">
              <div className="field">
                <label htmlFor={`${fid}-sys`}>Tizim nomi *</label>
                <input
                  id={`${fid}-sys`}
                  value={f.system_name}
                  required
                  onChange={(e) => set("system_name", e.target.value)}
                />
                {errors.system_name && <div className="err">{errors.system_name}</div>}
              </div>

              <div className="field">
                <label htmlFor={`${fid}-type`}>Loyiha turi *</label>
                <select
                  id={`${fid}-type`}
                  value={f.order_type}
                  onChange={(e) => {
                    const val = e.target.value as OrderTypeValue;
                    setF((prev) => ({
                      ...prev,
                      order_type: val,
                      project: val === "NEW" ? null : prev.project,
                    }));
                  }}
                >
                  <option value="NEW">Yangi loyiha</option>
                  <option value="CONTINUATION">Davom ettiriladigan</option>
                  <option value="NEEDS_CLASSIFICATION">Turlash kerak bo'lgan</option>
                  <option value="MODERNIZATION">Modernizatsiya</option>
                  <option value="MAINTENANCE">Texnik xizmat</option>
                </select>
              </div>

              {f.order_type !== "NEW" && (
                <div className="field">
                  <label htmlFor={`${fid}-proj`}>Tegishli loyiha</label>
                  <select
                    id={`${fid}-proj`}
                    value={f.project || ""}
                    onChange={(e) => {
                      const pid = e.target.value ? Number(e.target.value) : null;
                      const proj = projects.find((p) => p.id === pid);
                      setF((prev) => ({
                        ...prev,
                        project: pid,
                        system_name: proj ? proj.name : prev.system_name,
                      }));
                    }}
                  >
                    <option value="">-- Loyihani tanlang (ixtiyoriy) --</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.key})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="field">
                <label htmlFor={`${fid}-mod`}>Loyiha haqida izoh</label>
                <input
                  id={`${fid}-mod`}
                  value={f.module}
                  placeholder="Loyiha haqida qisqacha izoh yoki qo'shimcha ma'lumot..."
                  onChange={(e) => set("module", e.target.value)}
                />
                {errors.module && <div className="err">{errors.module}</div>}
              </div>

              <div className="row" style={{ gap: 12 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor={`${fid}-dep`}>Buyurtma qilayotgan bo'linma *</label>
                  <input
                    id={`${fid}-dep`}
                    value={f.department}
                    required
                    onChange={(e) => set("department", e.target.value)}
                  />
                  {errors.department && <div className="err">{errors.department}</div>}
                </div>

                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor={`${fid}-resp`}>Mas'ul shaxs (F.I.Sh.) *</label>
                  <input
                    id={`${fid}-resp`}
                    value={f.responsible_person}
                    required
                    onChange={(e) => set("responsible_person", e.target.value)}
                  />
                  {errors.responsible_person && <div className="err">{errors.responsible_person}</div>}
                </div>
              </div>

              <div className="field">
                <label htmlFor={`${fid}-due`}>Kerakli muddat</label>
                <input
                  id={`${fid}-due`}
                  type="date"
                  value={f.due_date}
                  onChange={(e) => set("due_date", e.target.value)}
                />
              </div>

              <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor={`${fid}-files`} style={{ fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Biriktirilgan hujjatlar va fayllar (TZ, texnik topshiriq)</span>
                  <span className="muted" style={{ fontSize: 11.5, fontWeight: 400 }}>Ko'p fayl yuklash mumkin</span>
                </label>
                <div
                  style={{
                    border: "2px dashed var(--border-color, #cbd5e1)",
                    borderRadius: 8,
                    padding: "16px 20px",
                    textAlign: "center",
                    background: "var(--surface-2, #f8fafc)",
                    cursor: "pointer",
                  }}
                  onClick={() => document.getElementById(`${fid}-files`)?.click()}
                >
                  <input
                    type="file"
                    id={`${fid}-files`}
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.rar,.7z,.png,.jpg,.webp"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        const newFiles = Array.from(e.target.files);
                        setFiles((prev) => [...prev, ...newFiles]);
                        e.target.value = "";
                      }
                    }}
                  />
                  <div style={{ fontSize: 24, marginBottom: 4 }}>📎</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text, #0f172a)" }}>
                    Fayllarni tanlash yoki bu yerga bosing
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                    PDF, Word (.doc, .docx), Excel (.xls, .xlsx), ZIP, rasmlar (har biri 50MB gacha)
                  </div>
                </div>

                {/* Tanlangan yangi fayllar ro'yxati */}
                {files.length > 0 && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
                      Yuklanadigan fayllar ({files.length}):
                    </div>
                    {files.map((file, idx) => (
                      <div
                        key={`${file.name}-${idx}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "6px 12px",
                          background: "rgba(16, 185, 129, 0.08)",
                          border: "1px solid rgba(16, 185, 129, 0.25)",
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          📄 <strong>{file.name}</strong>{" "}
                          <span className="muted">
                            ({file.size < 1024 * 1024
                              ? `${Math.round(file.size / 1024)} KB`
                              : `${(file.size / (1024 * 1024)).toFixed(1)} MB`})
                          </span>
                        </span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ padding: "2px 6px", minHeight: "auto", fontSize: 12 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setFiles((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          title="O'chirish"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Mavjud fayllar (tahrirlash rejimida) */}
                {editing && existingAttachments.length > 0 && (
                  <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
                      Mavjud biriktirilgan fayllar ({existingAttachments.length}):
                    </div>
                    {existingAttachments.map((att) => (
                      <div
                        key={att.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "6px 12px",
                          background: "var(--surface-2, #f1f5f9)",
                          border: "1px solid var(--border-color, #e2e8f0)",
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                      >
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          📎{" "}
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontWeight: 600, textDecoration: "underline" }}
                          >
                            {att.original_name}
                          </a>{" "}
                          <span className="muted">({att.size_display})</span>
                          {att.uploaded_by_name && (
                            <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
                              — {att.uploaded_by_name}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ padding: "2px 6px", minHeight: "auto", fontSize: 12, color: "var(--danger, #dc2626)" }}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!id) return;
                            if (window.confirm("Ushbu biriktirilgan faylni o'chirishni tasdiqlaysizmi?")) {
                              try {
                                await deleteOrderAttachment(id, att.id);
                                setExistingAttachments((prev) => prev.filter((a) => a.id !== att.id));
                              } catch (err) {
                                setError(err instanceof Error ? err.message : "Faylni o'chirishda xatolik.");
                              }
                            }
                          }}
                          title="Faylni o'chirish"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pastki o'ng burchakdagi sana va vaqt (oq va qora uslubda) */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  marginTop: 18,
                  paddingTop: 12,
                  borderTop: "1px solid #f1f5f9",
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: "#ffffff",
                    border: "1px solid #0f172a",
                    borderRadius: 6,
                    padding: "5px 12px",
                    fontSize: 12,
                    color: "#0f172a",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                  }}
                >
                  <span style={{ color: "#475569", fontWeight: 500 }}>
                    {editing ? "Yaratilgan vaqti:" : "Sana va vaqt:"}
                  </span>
                  <strong style={{ fontWeight: 700, color: "#000000" }}>
                    {editing && existingItem?.created_at
                      ? fmtDateTime(existingItem.created_at)
                      : fmtDateTime(now.toISOString())}
                  </strong>
                </div>
              </div>
            </Card>
          </div>
        </form>
      </div>
    </>
  );
}
