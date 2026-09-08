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

  const [loaded, setLoaded] = useState(!editing);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const [tzFile, setTzFile] = useState<File | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

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
    current_state: string;
    requested_change: string;
    reason: string;
    affected_modules: string;
    dependent_systems: string;
    change_nature: "BOTH" | "USER_FACING" | "BACKEND";
    additional_materials: string;
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
    current_state: "",
    requested_change: "",
    reason: "",
    affected_modules: "",
    dependent_systems: "",
    change_nature: "BOTH",
    additional_materials: "",
  });

  // Tahrirlash rejimida mavjud buyurtmani yuklash
  useEffect(() => {
    let alive = true;
    if (!editing || !id) return;
    void (async () => {
      try {
        const item = await api.get<ChangeRequestItem>(`/orders/${id}/`);
        if (!alive) return;
        setF({
          system_name: item.system_name || "TeamFlow",
          order_type: item.order_type || "NEW",
          module: item.module || "",
          department: item.department || "",
          responsible_person: item.responsible_person || "",
          priority: item.priority || "HIGH",
          due_date: item.due_date ? item.due_date.split("T")[0] : "",
          project: item.project || null,
          current_state: item.current_state || "",
          requested_change: item.requested_change || "",
          reason: item.reason || "",
          affected_modules: item.affected_modules || "",
          dependent_systems: item.dependent_systems || "",
          change_nature: item.change_nature || "BOTH",
          additional_materials: item.additional_materials || "",
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

  // Qoralamani yuklash (agar oldin to'ldirib chiqib ketgan bo'lsa)
  useEffect(() => {
    if (editing) return;
    try {
      const raw = localStorage.getItem(ORDER_DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          (parsed.module?.trim() ||
            parsed.requested_change?.trim() ||
            parsed.reason?.trim() ||
            parsed.current_state?.trim() ||
            parsed.system_name?.trim())
        ) {
          setF((prev) => ({ ...prev, ...parsed }));
          setDraftRestored(true);
        }
      }
    } catch {
      // ignore
    }
  }, [editing]);

  // Qoralamani avtomatik saqlash
  useEffect(() => {
    if (editing) return;
    const hasData =
      f.module.trim() ||
      f.requested_change.trim() ||
      f.reason.trim() ||
      f.current_state.trim() ||
      f.affected_modules.trim();
    if (!hasData) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(ORDER_DRAFT_KEY, JSON.stringify(f));
      } catch {
        // ignore
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [editing, f]);

  const set = (k: string, v: unknown) => {
    setF((p) => ({ ...p, [k]: v }));
  };

  const clearDraft = () => {
    localStorage.removeItem(ORDER_DRAFT_KEY);
    setF({
      system_name: "TeamFlow",
      order_type: "NEW",
      module: "",
      department: user?.department_name || "",
      responsible_person: user?.full_name || "",
      priority: "HIGH",
      due_date: "",
      project: null,
      current_state: "",
      requested_change: "",
      reason: "",
      affected_modules: "",
      dependent_systems: "",
      change_nature: "BOTH",
      additional_materials: "",
    });
    setDraftRestored(false);
  };

  const selectedProject = useMemo(() => {
    if (!f.project) return null;
    return projects.find((p) => p.id === Number(f.project)) || null;
  }, [f.project, projects]);

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

  if (!loaded) {
    return (
      <div className="content">
        <Loading />
      </div>
    );
  }

  return (
    <>
      <PageHead
        title={
          <strong>
            {editing ? "Buyurtmani tahrirlash" : "Yangi buyurtma (TZ talabnomasi)"}
          </strong>
        }
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
              {busy
                ? "Yuborilmoqda..."
                : editing
                ? "O'zgarishlarni saqlash"
                : "Buyurtma yuborish"}
            </button>
            <button type="button" className="btn" onClick={() => go(toOrders())}>
              Bekor qilish
            </button>
          </div>
        }
      />

      <div className="content">
        <ErrorMsg error={error} />

        {draftRestored && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(59, 130, 246, 0.08)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 14,
              fontSize: 13,
              color: "var(--color-fg-default)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>📝</span>
              <span>
                <strong>Qoralama tiklandi:</strong> Oldin to'ldirilgan buyurtma ma'lumotlari avtomatik yuklandi.
              </span>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={clearDraft}
              style={{ color: "var(--color-danger, #ef4444)" }}
            >
              Qoralamani tozalash
            </button>
          </div>
        )}

        <form id={formId} onSubmit={submit}>
          <div className="split">
            {/* Chap ustun: Asosiy ma'lumotlar va TZ bo'limlari */}
            <div>
              <Card title="Asosiy ma'lumot">
                <div className="field">
                  <label htmlFor={`${fid}-sys`}>Tizim / Mahsulot nomi *</label>
                  <input
                    id={`${fid}-sys`}
                    value={f.system_name}
                    required
                    onChange={(e) => set("system_name", e.target.value)}
                    placeholder="Masalan: Yagona darcha, TeamFlow, Elektron ta'lim"
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
                    <option value="MODERNIZATION">⚡ Modernizatsiya va takomillashtirish</option>
                    <option value="MAINTENANCE">🛠️ Texnik qo'llab-quvvatlash</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor={`${fid}-mod`}>Modul / Yo'nalish *</label>
                  <input
                    id={`${fid}-mod`}
                    value={f.module}
                    required
                    onChange={(e) => set("module", e.target.value)}
                    placeholder="Masalan: Xavfsizlik, Auth, Integratsiya, Hisobotlar"
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
                      placeholder="Masalan: Axborot xavfsizligi boshqarmasi"
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
                      placeholder="F.I.Sh."
                    />
                    {errors.responsible_person && <div className="err">{errors.responsible_person}</div>}
                  </div>
                </div>

                <div className="row" style={{ gap: 12 }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label htmlFor={`${fid}-due`}>Kerakli muddat (so'ralgan sana)</label>
                    <input
                      id={`${fid}-due`}
                      type="date"
                      value={f.due_date}
                      onChange={(e) => set("due_date", e.target.value)}
                    />
                  </div>
                </div>
              </Card>

              <Card title="TZ va Talabnoma mazmuni (Буюртма.docx)">
                <div className="field">
                  <label htmlFor={`${fid}-cur`}>
                    1.1 Joriy holat (nima ishlamayapti / nimani o'zgartirish kerak) *
                  </label>
                  <textarea
                    id={`${fid}-cur`}
                    rows={4}
                    required
                    value={f.current_state}
                    onChange={(e) => set("current_state", e.target.value)}
                    placeholder="Mavjud kamchilik yoki tizimning joriy holatini batafsil bayon qiling..."
                  />
                  {errors.current_state && <div className="err">{errors.current_state}</div>}
                </div>

                <div className="field">
                  <label htmlFor={`${fid}-req`}>
                    1.2 Talab qilinayotgan o'zgartirish (aniq va batafsil tavsif) *
                  </label>
                  <textarea
                    id={`${fid}-req`}
                    rows={5}
                    required
                    value={f.requested_change}
                    onChange={(e) => set("requested_change", e.target.value)}
                    placeholder="Tizimga nimalar qo'shilishi, o'zgartirilishi yoki yangilanishi kerak..."
                  />
                  {errors.requested_change && <div className="err">{errors.requested_change}</div>}
                </div>

                <div className="field">
                  <label htmlFor={`${fid}-rea`}>
                    1.3 Sabab / maqsad (qonun talabi, biznes ehtiyoji va h.k.) *
                  </label>
                  <textarea
                    id={`${fid}-rea`}
                    rows={3}
                    required
                    value={f.reason}
                    onChange={(e) => set("reason", e.target.value)}
                    placeholder="Ushbu o'zgartirish nima sababdan kiritilmoqda..."
                  />
                  {errors.reason && <div className="err">{errors.reason}</div>}
                </div>
              </Card>

              <Card title="Ta'sir doirasi va qo'shimcha ma'lumotlar">
                <div className="field">
                  <label htmlFor={`${fid}-aff`}>2.1 Qaysi modul / funksionallikka ta'sir qiladi</label>
                  <input
                    id={`${fid}-aff`}
                    value={f.affected_modules}
                    onChange={(e) => set("affected_modules", e.target.value)}
                    placeholder="Ta'sirlanuvchi modullar..."
                  />
                </div>

                <div className="field">
                  <label htmlFor={`${fid}-dep-sys`}>2.2 Bog'liq tizimlar / integratsiyalar</label>
                  <input
                    id={`${fid}-dep-sys`}
                    value={f.dependent_systems}
                    onChange={(e) => set("dependent_systems", e.target.value)}
                    placeholder="Tashqi yoki ichki integratsiyalar..."
                  />
                </div>

                <div className="field">
                  <label htmlFor={`${fid}-nature`}>2.3 O'zgarish xarakteri</label>
                  <select
                    id={`${fid}-nature`}
                    value={f.change_nature}
                    onChange={(e) => set("change_nature", e.target.value as "BOTH" | "USER_FACING" | "BACKEND")}
                  >
                    <option value="BOTH">🔄 Ikkalasi ham (To'liq tizim bo'ylab)</option>
                    <option value="USER_FACING">💻 Foydalanuvchiga ko'rinadigan (Frontend / UI)</option>
                    <option value="BACKEND">⚙️ Ichki o'zgarish (Backend / Baza / API)</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor={`${fid}-mat`}>3. Qo'shimcha materiallar va havolalar</label>
                  <textarea
                    id={`${fid}-mat`}
                    rows={2}
                    value={f.additional_materials}
                    onChange={(e) => set("additional_materials", e.target.value)}
                    placeholder="Skrinshotlar havolalari, texnik talablar, me'yoriy hujjatlar raqami..."
                  />
                </div>
              </Card>
            </div>

            {/* O'ng ustun: Loyiha tanlash va Fayl yuklash */}
            <div>
              <Card title="Tegishli loyiha (Project)">
                <div className="field">
                  <label htmlFor={`${fid}-proj`}>Mavjud loyihaga biriktirish</label>
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
                {selectedProject && (
                  <div
                    style={{
                      padding: 12,
                      background: "var(--color-canvas-subtle, #f6f8fa)",
                      borderRadius: 6,
                      border: "1px solid var(--border-color)",
                      fontSize: 12.5,
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      📁 {selectedProject.name}
                    </div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {selectedProject.description || "Loyiha tavsifi kiritilmagan"}
                    </div>
                  </div>
                )}
              </Card>

              <Card title="TZ Fayli (Texnik topshiriq)">
                <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 12 }}>
                  Rasmiy Texnik topshiriq (TZ), Word (.docx) yoki PDF faylini biriktiring.
                </p>
                <input
                  type="file"
                  id={`${fid}-tz`}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.zip"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setTzFile(e.target.files[0]);
                    }
                  }}
                  style={{ display: "none" }}
                />
                <label
                  htmlFor={`${fid}-tz`}
                  className="btn btn-outline"
                  style={{
                    width: "100%",
                    textAlign: "center",
                    cursor: "pointer",
                    display: "block",
                  }}
                >
                  📎 {tzFile ? "Faylni o'zgartirish" : "Fayl tanlash (Word, PDF, TZ)"}
                </label>

                {tzFile && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: "8px 12px",
                      background: "rgba(16, 185, 129, 0.08)",
                      border: "1px solid rgba(16, 185, 129, 0.25)",
                      borderRadius: 6,
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      📄 <strong>{tzFile.name}</strong> ({(tzFile.size / 1024).toFixed(0)} KB)
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setTzFile(null)}
                      style={{ padding: "0 4px", marginLeft: 8 }}
                    >
                      ✕
                    </button>
                  </div>
                )}

                {editing && f.tz_file_url && !tzFile && (
                  <div style={{ marginTop: 10, fontSize: 12 }} className="muted">
                    Mavjud TZ fayli:{" "}
                    <a href={f.tz_file_url} target="_blank" rel="noreferrer">
                      {f.tz_file_name || "Hujjat"}
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
