import { useEffect, useId, useMemo, useState } from "react";
import { ApiError, api, listOf } from "@/api/client";
import type { ChangeRequestItem, OrderTypeValue, Project } from "@/api/types";
import { useFetch } from "@/api/useFetch";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Card, ErrorMsg, Loading } from "@/components/ui";
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
  const [loaded, setLoaded] = useState(!editing);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const [tzFile, setTzFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { data: projectsData } = useFetch<{ count: number; results: Project[] } | Project[]>(
    "/projects/",
    { scope: "visible" }
  );
  const projects: Project[] = useMemo(() => (projectsData ? listOf<Project>(projectsData) : []), [projectsData]);

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
    department: user?.department_name || "",
    responsible_person: user?.full_name || "",
    priority: "HIGH",
    due_date: "",
    project: null,
  });

  // Tahrirlash rejimida mavjud buyurtmani yuklash
  useEffect(() => {
    let alive = true;
    if (!editing || !id) return;
    void (async () => {
      try {
        const item = await api.get<ChangeRequestItem>(`/orders/${id}/`);
        if (!alive) return;
        setExistingItem(item);
        setF({
          system_name: item.system_name || "TeamFlow",
          order_type: item.order_type || "NEW",
          module: item.module || "",
          department: item.department || "",
          responsible_person: item.responsible_person || "",
          priority: item.priority || "HIGH",
          due_date: item.due_date ? item.due_date.split("T")[0] : "",
          project: item.project || null,
          tz_file_url: item.tz_file_url || "",
          tz_file_name: item.tz_file_name || "",
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

  // Rasm preview tayyorlash
  useEffect(() => {
    if (!tzFile) {
      setImagePreview(null);
      return;
    }
    const isImg = tzFile.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(tzFile.name);
    if (isImg) {
      const url = URL.createObjectURL(tzFile);
      setImagePreview(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setImagePreview(null);
    }
  }, [tzFile]);

  // Clipboard orqali paste (Ctrl+V) hodisasi
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            setTzFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const set = (k: string, v: unknown) => {
    setF((p) => ({ ...p, [k]: v }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});

    try {
      const formData = new FormData();
      Object.entries(f).forEach(([key, val]) => {
        if (key === "tz_file_url" || key === "tz_file_name" || val === null || val === undefined) {
          return;
        }
        formData.append(key, String(val));
      });

      if (tzFile) {
        formData.append("tz_file", tzFile);
      }

      if (editing && id) {
        await api.patch(`/orders/${id}/`, formData);
      } else {
        await api.post("/orders/", formData);
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
              <option value="URGENT">🔴 Shoshilinch</option>
              <option value="HIGH">🟠 Yuqori</option>
              <option value="MEDIUM">🔵 O'rta</option>
              <option value="LOW">⚪ Past</option>
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
          <div className="split">
            {/* Chap ustun: Asosiy ma'lumotlar */}
            <div>
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
                    onChange={(e) => set("order_type", e.target.value as OrderTypeValue)}
                  >
                    <option value="NEW">🚀 Yangi loyiha</option>
                    <option value="CONTINUATION">🔄 Davom ettiriladigan</option>
                    <option value="NEEDS_CLASSIFICATION">🏷️ Turlash kerak bo'lgan</option>
                    <option value="MODERNIZATION">⚡ Modernizatsiya</option>
                    <option value="MAINTENANCE">🛠️ Texnik xizmat</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor={`${fid}-proj`}>Tegishli loyiha</label>
                  <select
                    id={`${fid}-proj`}
                    value={f.project || ""}
                    onChange={(e) => set("project", e.target.value ? Number(e.target.value) : null)}
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
                  <label htmlFor={`${fid}-mod`}>Modul / Yo'nalish</label>
                  <input
                    id={`${fid}-mod`}
                    value={f.module}
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
              </Card>
            </div>

            {/* O'ng ustun: TZ Fayli yoki Rasmi */}
            <div>
              <Card title="TZ Fayli yoki Rasmi">
                <input
                  type="file"
                  id={`${fid}-tz`}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.png,.jpg,.jpeg,.webp,image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setTzFile(e.target.files[0]);
                    }
                  }}
                  style={{ display: "none" }}
                />

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      setTzFile(e.dataTransfer.files[0]);
                    }
                  }}
                  style={{
                    border: isDragging ? "2px dashed var(--brand, #2563eb)" : "2px dashed #cbd5e1",
                    backgroundColor: isDragging ? "rgba(37, 99, 235, 0.05)" : "#f8fafc",
                    borderRadius: 10,
                    padding: 24,
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onClick={() => document.getElementById(`${fid}-tz`)?.click()}
                >
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📎</div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                    {tzFile ? "Boshqa fayl tanlash" : "Fayl yoki rasm tanlang"}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Word, PDF, Excel yoki Rasm (PNG, JPG)
                  </div>
                </div>

                {/* Yuklangan fayl yoki rasm preview */}
                {tzFile && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 12,
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: 8,
                    }}
                  >
                    <div className="row between middle">
                      <div className="row middle" style={{ gap: 8, overflow: "hidden" }}>
                        <span style={{ fontSize: 18 }}>{imagePreview ? "🖼️" : "📄"}</span>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#166534" }}>
                            {tzFile.name}
                          </div>
                          <div style={{ fontSize: 11, color: "#15803d" }}>
                            {(tzFile.size / 1024).toFixed(0)} KB
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setTzFile(null)}
                        style={{ padding: "2px 8px", color: "#dc2626" }}
                        title="Faylni o'chirish"
                      >
                        ✕
                      </button>
                    </div>

                    {imagePreview && (
                      <div style={{ marginTop: 10, textAlign: "center" }}>
                        <img
                          src={imagePreview}
                          alt="TZ Rasmi"
                          style={{
                            maxWidth: "100%",
                            maxHeight: 280,
                            borderRadius: 6,
                            border: "1px solid #dcfce7",
                            objectFit: "contain",
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Tahrirlash rejimida mavjud TZ fayli */}
                {editing && f.tz_file_url && !tzFile && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 12,
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                    }}
                  >
                    <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
                      Mavjud biriktirilgan TZ:
                    </div>
                    <a
                      href={f.tz_file_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontWeight: 600, fontSize: 13, color: "var(--brand)" }}
                    >
                      📎 {f.tz_file_name || "Faylni ko'rish"}
                    </a>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
