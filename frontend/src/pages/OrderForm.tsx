import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  const { user, meta } = useAuth();
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
    current_state: string;
    requested_change: string;
    reason: string;
    affected_modules: string;
    dependent_systems: string;
    change_nature: "USER_FACING" | "BACKEND" | "BOTH";
    additional_materials: string;
    tz_file_url?: string;
    tz_file_name?: string;
  }>({
    system_name: "",
    order_type: "NEW",
    module: "",
    department: userDepartment,
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

  // Foydalanuvchi profili yuklanganda profilidagi bo'linma va ism avtomatik o'rnatiladi
  useEffect(() => {
    if (!editing && userDepartment) {
      setF((prev) => {
        if (!prev.department) {
          return { ...prev, department: userDepartment };
        }
        return prev;
      });
    }
  }, [userDepartment, editing]);

  useEffect(() => {
    if (!editing && user?.full_name) {
      setF((prev) => {
        if (!prev.responsible_person) {
          return { ...prev, responsible_person: user.full_name };
        }
        return prev;
      });
    }
  }, [user?.full_name, editing]);

  const [serverDraftId, setServerDraftId] = useState<number | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Qoralamani yuklash (agar foydalanuvchi oldin kiritib chiqib ketgan bo'lsa)
  useEffect(() => {
    if (editing) return;
    try {
      const raw = localStorage.getItem(ORDER_DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed?.f &&
          (parsed.f.system_name?.trim() ||
            parsed.f.module?.trim() ||
            parsed.f.due_date ||
            parsed.f.project ||
            parsed.f.requested_change?.trim() ||
            parsed.f.current_state?.trim() ||
            parsed.f.reason?.trim() ||
            (parsed.f.order_type && parsed.f.order_type !== "NEW"))
        ) {
          setF((prev) => ({
            ...prev,
            ...parsed.f,
            department: userDepartment || parsed.f.department || prev.department,
            responsible_person: user?.full_name || parsed.f.responsible_person || prev.responsible_person,
          }));
          if (parsed.serverDraftId) {
            setServerDraftId(parsed.serverDraftId);
          }
          if (parsed.lastSavedTime) {
            setLastSavedTime(parsed.lastSavedTime);
            setAutoSaveStatus("saved");
          }
        }
      }
    } catch {
      // ignore
    }
  }, [editing, userDepartment, user?.full_name]);

  // Web-saytda (brauzerda) ma'lumotlarni avtomatik saqlash (har bir o'zgarishda)
  useEffect(() => {
    if (editing) return;
    const isDirty = Boolean(
      f.system_name?.trim() ||
        f.module?.trim() ||
        f.due_date ||
        f.project ||
        f.requested_change?.trim() ||
        f.current_state?.trim() ||
        f.reason?.trim() ||
        f.order_type !== "NEW" ||
        (userDepartment && f.department && f.department !== userDepartment) ||
        (user?.full_name && f.responsible_person && f.responsible_person !== user.full_name)
    );
    if (isDirty) {
      try {
        const nowTime = new Date().toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
        localStorage.setItem(
          ORDER_DRAFT_KEY,
          JSON.stringify({ f, serverDraftId, lastSavedTime: nowTime })
        );
      } catch {
        // ignore
      }
    }
  }, [editing, f, serverDraftId, userDepartment, user?.full_name]);

  // Serverga avtomatik saqlash (fondan bazada DRAFT holatida saqlanadi)
  useEffect(() => {
    if (editing || isPM) return;
    const hasData = Boolean(
      f.system_name?.trim() ||
        f.module?.trim() ||
        f.due_date ||
        f.project ||
        f.requested_change?.trim() ||
        f.current_state?.trim() ||
        f.reason?.trim() ||
        files.length > 0
    );
    if (!hasData) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        if (!isMountedRef.current) return;
        setAutoSaveStatus("saving");
        const payload: Record<string, unknown> = {};
        Object.entries(f).forEach(([key, val]) => {
          if (val === null || val === undefined) return;
          payload[key] = val;
        });
        payload.status = "DRAFT";

        let draftId = serverDraftId;
        if (draftId) {
          await api.patch(`/orders/${draftId}/`, payload);
        } else {
          const res = await api.post<ChangeRequestItem>("/orders/", payload);
          if (res?.id && isMountedRef.current) {
            draftId = res.id;
            setServerDraftId(res.id);
          }
        }
        if (isMountedRef.current) {
          const nowTime = new Date().toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
          try {
            localStorage.setItem(
              ORDER_DRAFT_KEY,
              JSON.stringify({ f, serverDraftId: draftId, lastSavedTime: nowTime })
            );
          } catch {
            // ignore
          }
          setAutoSaveStatus("saved");
          setLastSavedTime(nowTime);
        }
      } catch {
        if (isMountedRef.current) {
          setAutoSaveStatus("saved");
        }
      }
    }, 1200);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [editing, f, isPM, serverDraftId, files.length]);



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
          system_name: item.system_name || "",
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
        });
        setLoaded(true);
      } catch (e) {
        if (alive) {
          setError(e instanceof ApiError ? e.message : tx("orders.buyurtmani_yuklab_bolmadi"));
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

  function handleCancelOrExit() {
    go(toOrders());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.due_date) {
      const today = new Date().toISOString().split("T")[0];
      if (f.due_date < today) {
        setErrors((p) => ({ ...p, due_date: tx("orders.muddat_otgan_xatolik") }));
        setError(tx("orders.muddat_otgan_xatolik"));
        return;
    }
    }
    setBusy(true);
    setError(null);
    setErrors({});

    try {
      const payload: Record<string, unknown> = {};
      Object.entries(f).forEach(([key, val]) => {
        if (val === null || val === undefined) return;
        payload[key] = val;
      });
      payload.status = "NEW";

      const targetId = editing && id ? id : serverDraftId;

      if (targetId) {
        await api.patch(`/orders/${targetId}/`, payload);
        if (files.length > 0) {
          const fd = new FormData();
          files.forEach((file) => fd.append("files", file));
          await addOrderAttachments(targetId, fd);
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
      }
      localStorage.removeItem(ORDER_DRAFT_KEY);
      go(toOrders());
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : tx("orders.saqlashda_xatolik"));
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
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{tx("orders.ruxsat_berilmagan")}</h2>
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
            {tx("orders.pm_yaratish_taqiq_desc")}
          </p>
          <button className="btn btn-primary" onClick={() => go(toOrders())}>
            {tx("orders.buyurtmalarga_qaytish")}
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

  const isLockedSubmitted = Boolean(
    editing &&
    existingItem &&
    existingItem.status !== "DRAFT" &&
    !user?.is_platform_admin &&
    !user?.is_boss
  );

  if (isLockedSubmitted) {
    return (
      <div className="content">
        <div className="card" style={{ maxWidth: 580, margin: "40px auto", padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{tx("orders.locked_after_send_title")}</h2>
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
            «{existingItem?.system_name}» {tx("orders.locked_after_send_desc")}
          </p>
          <button className="btn btn-primary" onClick={() => go(toOrders())}>
            {tx("orders.buyurtmalarga_qaytish")}
          </button>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="content">
        <div className="msg msg-error" style={{ margin: "40px auto", maxWidth: 500, textAlign: "center", padding: 24, borderRadius: 10 }}>
          <h3 style={{ margin: "0 0 10px 0" }}>{tx("orders.tahrirlash_taqiqlangan")}</h3>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            {tx("orders.tahrirlash_taqiq_desc")}
          </p>
          <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => go(toOrders())}>
            {tx("orders.buyurtmalarga_qaytish")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHead
        title={
          <div className="row middle" style={{ gap: 12, flexWrap: "wrap" }}>
            <strong>{editing ? tx("orders.buyurtmani_tahrirlash") : tx("orders.yangi_buyurtma_tz")}</strong>
            {autoSaveStatus === "saving" && (
              <span style={{ fontSize: 12, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 500 }}>
                <span>⏳</span> {tx("orders.autosave_saving")}
              </span>
            )}
            {autoSaveStatus === "saved" && (
              <span style={{ fontSize: 12, color: "#059669", display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 600 }}>
                <span>✓</span> {tx("orders.autosave_saved")} {lastSavedTime ? `(${lastSavedTime})` : ""}
              </span>
            )}
          </div>
        }
        actions={
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" form={formId} disabled={busy}>
              {busy ? tx("orders.submitting") : tx("orders.send_order")}
            </button>
            <button type="button" className="btn" onClick={handleCancelOrExit}>
              {tx("common.bekor_qilish")}
            </button>
          </div>
        }
      />

      <div className="content">
        <ErrorMsg error={error} />

                <form id={formId} onSubmit={submit}>
          <div style={{ maxWidth: 840, margin: "0 auto" }}>
            <Card title={tx("orders.asosiy_malumotlar")}>
              <div className="field">
                <label htmlFor={`${fid}-sys`}>{tx("orders.tizim_nomi_label")} *</label>
                <input
                  id={`${fid}-sys`}
                  list={`${fid}-systems-list`}
                  value={f.system_name}
                  required
                  placeholder={tx("orders.tizim_nomi_placeholder")}
                  onChange={(e) => {
                    const val = e.target.value;
                    const matchedProj = projects.find((p) => p.name.toLowerCase() === val.toLowerCase());
                    setF((prev) => ({
                      ...prev,
                      system_name: val,
                      project: matchedProj ? matchedProj.id : prev.project,
                    }));
                  }}
                />
                <datalist id={`${fid}-systems-list`}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.key ? `(${p.key})` : ""}
                    </option>
                  ))}
                </datalist>
                {errors.system_name && <div className="err">{errors.system_name}</div>}
              </div>

              <div className="row" style={{ gap: 12 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor={`${fid}-type`}>{tx("orders.loyiha_turi_label")} *</label>
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
                    {(meta?.order_type || meta?.project_type || []).map((t) => (
                      <option key={String(t.value)} value={String(t.value)}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor={`${fid}-priority`}>{tx("orders.muhimlik_label")} *</label>
                  <select
                    id={`${fid}-priority`}
                    value={f.priority}
                    onChange={(e) => set("priority", e.target.value)}
                  >
                    {(meta?.order_priority || []).map((p) => (
                      <option key={String(p.value)} value={String(p.value)}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {f.order_type !== "NEW" && (
                <div className="field">
                  <label htmlFor={`${fid}-proj`}>{tx("orders.tegishli_loyiha_label")}</label>
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
                    <option value="">{tx("orders.loyiha_tanlang_placeholder")}</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.key ? `(${p.key})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="field">
                <label htmlFor={`${fid}-mod`}>{tx("orders.loyiha_izoh_label")}</label>
                <input
                  id={`${fid}-mod`}
                  value={f.module}
                  placeholder={tx("orders.loyiha_izoh_placeholder")}
                  onChange={(e) => set("module", e.target.value)}
                />
                {errors.module && <div className="err">{errors.module}</div>}
              </div>

              <div className="row" style={{ gap: 12 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor={`${fid}-dep`}>{tx("orders.bolinma_label")} *</label>
                  <input
                    id={`${fid}-dep`}
                    list={`${fid}-dept-list`}
                    value={f.department}
                    required
                    placeholder={tx("orders.bolinma_placeholder")}
                    onChange={(e) => set("department", e.target.value)}
                  />
                  <datalist id={`${fid}-dept-list`}>
                    {(meta?.departments || []).map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.code ? `(${d.code})` : ""}
                      </option>
                    ))}
                  </datalist>
                  {errors.department && <div className="err">{errors.department}</div>}
                </div>

                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor={`${fid}-resp`}>{tx("orders.masul_shaxs_label")} *</label>
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
                <label htmlFor={`${fid}-due`}>{tx("orders.kerakli_muddat_label")}</label>
                <input
                  id={`${fid}-due`}
                  type="date"
                  min={new Date().toISOString().split("T")[0]}
                  value={f.due_date}
                  onChange={(e) => set("due_date", e.target.value)}
                />
                {errors.due_date && <div className="err">{errors.due_date}</div>}
              </div>
            </Card>

            <Card title={tx("orders.bolim3_nomi")}>
              <div className="field">
                <label htmlFor={`${fid}-add-mat`}>
                  {tx("orders.qoshimcha_materiallar")}
                </label>
                <textarea
                  id={`${fid}-add-mat`}
                  rows={2}
                  value={f.additional_materials}
                  placeholder={tx("orders.additional_materials_placeholder")}
                  onChange={(e) => set("additional_materials", e.target.value)}
                />
              </div>

              <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor={`${fid}-files`} style={{ fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{tx("orders.biriktirilgan_fayllar_label")}</span>
                  <span className="muted" style={{ fontSize: 11.5, fontWeight: 400 }}>{tx("orders.koplab_fayl_yuklash")}</span>
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
                    {tx("orders.dropzone_prompt")}
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                    {tx("orders.dropzone_hint")}
                  </div>
                </div>

                {/* Tanlangan yangi fayllar ro'yxati */}
                {files.length > 0 && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
                      {tx("orders.files_to_upload")} ({files.length}):
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
                          title={tx("common.ochirish")}
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
                      {tx("orders.existing_files")} ({existingAttachments.length}):
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
                            if (window.confirm(tx("orders.confirm_delete_attachment"))) {
                              try {
                                await deleteOrderAttachment(id, att.id);
                                setExistingAttachments((prev) => prev.filter((a) => a.id !== att.id));
                              } catch (err) {
                                setError(err instanceof Error ? err.message : tx("orders.delete_attachment_error"));
                              }
                            }
                          }}
                          title={tx("orders.faylni_ochirish")}
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
                    {editing ? tx("orders.yaratilgan_vaqti_label") : tx("orders.sana_vaqt_label")}
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
