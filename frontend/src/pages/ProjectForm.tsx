import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, api } from "@/api/client";
import { deleteProject } from "@/api/projects";
import { getOrders } from "@/api/orders";
import FilePicker, { uploadFiles } from "@/components/FilePicker";
import TeamPicker, { addPickedMembers, createPickedTasks, taskCount, tasksOf }
  from "@/components/TeamPicker";
import type { Pick as TeamPick } from "@/components/TeamPicker";
import type { Access, Brief, ChangeRequestItem, Project } from "@/api/types";
import { lockScroll, unlockScroll } from "@/components/scrollLock";

import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { Card, DateField, ErrorMsg, Loading } from "@/components/ui";
import { toProject, useEntityId, useGo, useIsPath } from "@/nav";
import { tx } from "@/i18n";
import { Button } from "@/components/Button";

export interface ProjectFormProps {
  initialOrderId?: number | null;
  initialOrder?: ChangeRequestItem | null;
  onClose?: () => void;
  onSuccess?: (project: Project) => void;
}

export default function ProjectForm({
  initialOrderId,
  initialOrder,
  onClose,
  onSuccess,
}: ProjectFormProps = {}) {
  const fid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const modalBodyRef = useRef<HTMLDivElement>(null);
  // Saqlash tugmasi sarlavhada, ya'ni `<form>` dan tashqarida turadi -
  // `form` atributi orqali bog'lanadi, shuning uchun formaga id kerak.
  const formId = `${fid}-form`;
  // REJIM marshrutdan aniqlanadi, sessiyadagi raqamdan emas: `/loyiha/yangi`
  // da eski loyiha raqami qolgan bo'lsa forma tahrirlash rejimiga tushib
  // ketardi va odam yangi loyiha o'rniga eskisini o'zgartirib qo'yardi.
  const creating = useIsPath("/loyiha/yangi");
  const stored = useEntityId("project");
  const isModal = Boolean(onClose);
  const id = isModal ? null : (creating ? null : stored);
  const go = useGo();
  const { meta, user } = useAuth();
  const editing = Boolean(id);

  useEffect(() => {
    if (!isModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [isModal, onClose]);

  const [loaded, setLoaded] = useState(!editing);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Fayllar loyiha yaratilgandan keyin yuklanadi - avval id kerak.
  const [files, setFiles] = useState<File[]>([]);
  const [fileNote, setFileNote] = useState("");
  // Hujjat sanasi ikki qavat: `fileDate` - butun to'plamga (izoh yonida),
  const [fileDate, setFileDate] = useState("");
  // Jamoa ham loyiha yaratilgandan keyin qo'shiladi - avval id kerak.
  const [team, setTeam] = useState<TeamPick[]>([]);
  // Tahrirlashda loyihaning ruxsatlari kerak: o'chirish faqat menejer va adminda.
  const [acc, setAcc] = useState<Access | null>(null);
  const [brief, setBrief] = useState({
    architecture: "",
    tech_stack: "",
    goal: "",
    pitfalls: "",
  });

  const targetOrderId = initialOrderId ?? initialOrder?.id ?? null;

  // Yangi loyiha yaratishda faqat «Rejalashtirilmoqda» va «Faol» holatlari ko'rinadi
  const statusOptions = useMemo(() => {
    const list = meta?.project_status?.length
      ? meta.project_status
      : [
          { value: "PLANNING", label: "Rejalashtirilmoqda" },
          { value: "ACTIVE", label: "Faol" },
          { value: "PAUSED", label: "Toxtatilgan" },
          { value: "DONE", label: "Yakunlangan" },
          { value: "ARCHIVED", label: "Arxivlangan" },
        ];
    if (!editing) {
      return list.filter((s) => s.value === "PLANNING" || s.value === "ACTIVE");
    }
    return list;
  }, [meta?.project_status, editing]);

  const [f, setF] = useState(() => {
    if (initialOrder) {
      const ordDate = initialOrder.request_date ? initialOrder.request_date.split("T")[0] : "";
      const startDate = initialOrder.pm_start_date || ordDate || "";
      let dueDate = initialOrder.pm_deadline || initialOrder.due_date || "";
      if (startDate && dueDate && dueDate < startDate) {
        dueDate = startDate;
      }
      return {
        name: initialOrder.system_name || `Buyurtma #${initialOrder.id}`,
        description: initialOrder.requested_change || "",
        status: "ACTIVE",
        project_type: initialOrder.order_type || "NEW",
        start_date: startDate,
        due_date: dueDate,
        is_public: true,
        is_listed: true,
        order_id: initialOrder.id,
      };
    }
    return {
      name: "",
      description: "",
      status: "ACTIVE",
      project_type: "NEW",
      start_date: "",
      due_date: "",
      // Ish maydoni ichida ochiq - standart holat, jamoa bir-birining ishini
      // ko'rib tursin. Tashqariga chiqarish esa ATAYLAB belgilanadi.
      is_public: true,
      is_listed: true,
      order_id: targetOrderId,
    };
  });

  const [orders, setOrders] = useState<ChangeRequestItem[]>(() => {
    return initialOrder ? [initialOrder] : [];
  });
  const [ordersLoading, setOrdersLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setOrdersLoading(true);
    getOrders({ page_size: 200 })
      .then((res) => {
        if (!alive) return;
        const list = res.results || [];
        if (initialOrder && !list.some((o) => o.id === initialOrder.id)) {
          setOrders([initialOrder, ...list]);
        } else {
          setOrders(list);
        }
      })
      .catch(() => {
        // Buyurtmalar ruxsati bo'lmasa yoki xato bo'lsa ro'yxat bo'sh qoladi
      })
      .finally(() => {
        if (alive) setOrdersLoading(false);
      });
    return () => { alive = false; };
  }, [initialOrder]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (editing) {
        const [p, b] = await Promise.all([
          api.get<Project>(`/projects/${id}/`),
          api.get<Brief>(`/projects/${id}/brief/`).catch(() => null),
        ]);
        if (!alive) return;
        setAcc(p.access);
        setF({
          name: p.name, description: p.description,
          status: p.status,
          project_type: p.project_type || "NEW",
          start_date: p.start_date || "", due_date: p.due_date || "",
          is_public: p.is_public, is_listed: p.is_listed,
          order_id: p.linked_order?.id || null,
        });
        if (b) {
          setBrief({
            architecture: b.architecture || "",
            tech_stack: b.tech_stack || "",
            goal: b.goal || "",
            pitfalls: b.pitfalls || "",
          });
        }
        setLoaded(true);
      }
    })().catch((e) => {
      // Xato ushlanmasa sahifa abadiy "Yuklanmoqda" da qolardi.
      if (alive) setError(e instanceof ApiError ? e.message : tx("project_form.loyihani_ochib_bolmadi"));
    });
    return () => { alive = false; };
  }, [id, editing]);

  function set(k: string, v: unknown) {
    setF((p) => ({ ...p, [k]: v }));
  }

  const selectedOrder = f.order_id ? orders.find((o) => o.id === f.order_id) : (initialOrder || null);
  const orderReqDate = selectedOrder?.request_date
    ? selectedOrder.request_date.split("T")[0]
    : undefined;
  const orderPmStart = selectedOrder?.pm_start_date || undefined;
  // Agar PM buyurtmada boshlanish sanasini belgilagan bo'lsa, loyiha ham shu sanadan boshlanishi mumkin.
  const minAllowedDate = (orderReqDate && orderPmStart)
    ? (orderPmStart > orderReqDate ? orderPmStart : orderReqDate)
    : (orderReqDate || orderPmStart);

  function showError(msg: string, fErrors?: Record<string, string>) {
    setError(msg);
    if (fErrors) setErrors((prev) => ({ ...prev, ...fErrors }));
    modalBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleOrderChange(selectedId: number | null) {
    set("order_id", selectedId);
    if (selectedId && !editing) {
      const ord = orders.find((o) => o.id === selectedId);
      if (ord) {
        const ordDate = ord.request_date ? ord.request_date.split("T")[0] : "";
        const ordPmStart = ord.pm_start_date || "";
        const ordMinDate = (ordDate && ordPmStart)
          ? (ordPmStart > ordDate ? ordPmStart : ordDate)
          : (ordDate || ordPmStart);
        setF((prev) => {
          const newStart = prev.start_date && ordMinDate && prev.start_date < ordMinDate
            ? ordMinDate
            : (prev.start_date || ordPmStart || ordDate || "");
          let newDue = prev.due_date || ord.pm_deadline || ord.due_date || "";
          if (newStart && newDue && newDue < newStart) {
            newDue = newStart;
          }
          return {
            ...prev,
            order_id: selectedId,
            name: prev.name.trim() ? prev.name : (ord.system_name || `Buyurtma #${ord.id}`),
            description: prev.description.trim() ? prev.description : (ord.requested_change || ""),
            project_type: ord.order_type || prev.project_type,
            start_date: newStart,
            due_date: newDue,
          };
        });
      }
    }
  }

  function handleStartDateChange(v: string) {
    set("start_date", v);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.start_date;
      if (minAllowedDate && v && v < minAllowedDate) {
        next.start_date = tx(
          "project_form.boshlanish_buyurtmadan_oldin_bolmasin",
          undefined,
          "Loyiha boshlanish sanasi buyurtma sanasidan oldin bo'lishi mumkin emas."
        );
      }
      if (f.due_date && v && f.due_date < v) {
        next.due_date = tx(
          "project_form.tugash_boshlanishdan_oldin_bolmasin",
          undefined,
          "Tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas."
        );
      } else if (next.due_date === tx("project_form.tugash_boshlanishdan_oldin_bolmasin", undefined, "Tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas.")) {
        delete next.due_date;
      }
      return next;
    });
  }

  function handleDueDateChange(v: string) {
    set("due_date", v);
    setErrors((prev) => {
      const next = { ...prev };
      if (f.start_date && v && v < f.start_date) {
        next.due_date = tx(
          "project_form.tugash_boshlanishdan_oldin_bolmasin",
          undefined,
          "Tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas."
        );
      } else {
        delete next.due_date;
      }
      return next;
    });
  }

  useEffect(() => {
    if (targetOrderId && !f.name && orders.length > 0) {
      const found = orders.find((o) => o.id === targetOrderId);
      if (found) {
        handleOrderChange(targetOrderId);
      }
    }
  }, [targetOrderId, orders]);

  useEffect(() => {
    try {
      localStorage.removeItem("teamflow_draft_new_project");
    } catch {
      // ignore
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) {
      const msg = tx("project_form.loyiha_nomini_kiriting", undefined, "Loyiha nomini kiriting.");
      showError(msg, { name: msg });
      return;
    }
    if (f.order_id && minAllowedDate && f.start_date && f.start_date < minAllowedDate) {
      const msg = tx(
        "project_form.boshlanish_buyurtmadan_oldin_bolmasin",
        undefined,
        "Loyiha boshlanish sanasi buyurtma sanasidan oldin bo'lishi mumkin emas."
      );
      showError(msg, { start_date: msg });
      return;
    }
    if (f.start_date && f.due_date && f.due_date < f.start_date) {
      const msg = tx(
        "project_form.tugash_boshlanishdan_oldin_bolmasin",
        undefined,
        "Tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas."
      );
      showError(msg, { due_date: msg });
      return;
    }
    if (f.start_date && !editing) {
      for (const p of team) {
        for (const t of tasksOf(p)) {
          if (t.start_date && t.start_date < f.start_date) {
            const formatted = f.start_date.split("-").reverse().join(".");
            const msg = `«${t.title}» vazifasining boshlanish sanasi loyiha boshlanish sanasidan (${formatted}) oldin bo'lishi mumkin emas.`;
            showError(msg);
            return;
          }
        }
      }
    }
    // Hujjat nomsiz va sanasiz yuklanmaydi (server ham shunday tekshiradi) -
    // buni loyiha yaratilgandan KEYIN aytish kech bo'lardi: fayl o'tmay
    // qolar, odam esa uni «Hujjatlar» bo'limidan qayta yuklashi kerak edi.
    if (files.length) {
      if (!fileNote.trim()) {
        showError(tx("project_form.fayllar_uchun_hujjat_nomini_yozing"));
        return;
      }
      if (!fileDate) {
        showError(tx("project_form.hujjat_sanasi_korsatilmagan"));
        return;
      }
    }
    setBusy(true);
    setError(null);
    setErrors({});
    // Ish maydoni yuborilmaydi - server o'zi tanlaydi (`resolve_workspace`).
    const body = {
      ...f,
      order_id: f.order_id || null,
      start_date: f.start_date || null,
      due_date: f.due_date || null,
      brief,
    };
    try {
      const saved = editing
        ? await api.patch<Project>(`/projects/${id}/`, body)
        : await api.post<Project>("/projects/", body);

      const hasBrief = Object.values(brief).some((v) => v.trim().length > 0);
      if (hasBrief || editing) {
        try {
          await api.patch(`/projects/${saved.id}/brief/`, brief);
        } catch {
          // Arxitektura saqlanmasa ham loyiha yaratildi
        }
      }

      // Loyiha saqlandi. Fayl yuklanmasa ham loyiha yo'qolmasin: xato aytiladi,
      // odam fayllarni "Fayllar" bo'limidan qayta yuklay oladi.
      if (files.length) {
        try {
          await uploadFiles(`/projects/${saved.id}/files/`, files, fileNote,
                            files.map(() => fileDate));
        } catch {
          setBusy(false);
          setError(tx("project_form.loyiha_yaratildi_lekin_fayllarni_yuklab")
                   + tx("project_form.ularni_fayllar_bolimidan_qayta_yuklang"));
          if (isModal) {
            onClose?.();
            return;
          }
          go(toProject(saved.id, "fayllar"));
          return;
        }
      }
      // A'zo yoki vazifa o'tmasa ham loyiha qoladi - nima qolib ketganini
      // aytamiz. Vazifa a'zolikka bog'liq emas: odam qo'shilmasa ham
      // yozib qo'yilgan ish doskaga tushaveradi.
      const tasks = taskCount(team);
      if (team.length) {
        const failedMembers = await addPickedMembers(saved.id, team);
        const { failedTasks, failedFiles } = tasks
          ? await createPickedTasks(saved.id, team, false, f.order_id || null)
          : { failedTasks: [], failedFiles: [] };
        if (failedMembers.length || failedTasks.length || failedFiles.length) {
          const parts = [];
          if (failedMembers.length) parts.push(tx("project_form.jamoaga_qoshilmadi") + failedMembers.join(", "));
          if (failedTasks.length) parts.push(tx("project_form.vazifa_yaratilmadi") + failedTasks.join(", "));
          if (failedFiles.length) {
            parts.push(tx("project_form.fayllari_biriktirilmadi") + failedFiles.join(", ")
                       + tx("project_form.vazifaning_ozi_yaratildi"));
          }
          setBusy(false);
          setError(tx("project_form.loyiha_yaratildi_lekin") + parts.join("; ")
                   + tx("project_form.jamoa_va_doska_bolimidan_qayta"));
          if (isModal) {
            onClose?.();
            return;
          }
          go(toProject(saved.id, failedMembers.length ? "jamoa" : "doska"));
          return;
        }
      }

      if (onSuccess) {
        onSuccess(saved);
      }
      if (isModal) {
        onClose?.();
        return;
      }
      // Vazifalar joyiga tushganini o'z ko'zi bilan ko'rsin.
      go(toProject(saved.id, "doska"));
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message, err.fields);
      } else showError(tx("common.saqlashda_xatolik"));
    } finally {
      setBusy(false);
    }
  }

  /** Loyihani butunlay o'chirish - tasdiq `deleteProject` ichida so'raladi. */
  async function removeProject() {
    setError(null);
    setBusy(true);
    try {
      if (await deleteProject(id!, f.name)) {
        go("/loyihalar");
        return;
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("project_form.loyihani_ochirib_bolmadi"));
    }
    setBusy(false);
  }

  if (!loaded) {
    if (isModal) {
      return createPortal(
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100001,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px 16px",
            background: "var(--overlay)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={onClose}
        >
          <div
            className="modal-window card"
            style={{ width: "min(400px, 90vw)", padding: "36px 20px", textAlign: "center", borderRadius: 12, background: "var(--surface)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <Loading text="Loyiha ma'lumotlari yuklanmoqda..." />
          </div>
        </div>,
        document.body
      );
    }
    return <div className="content"><Loading /></div>;
  }

  const formFields = (
    <div className="split">
      {/* Chap ustun: asosiy maydonlar va boshlang'ich fayllar */}
      <div>
        <Card title={tx("project_form.asosiy_malumot")}>
          <div className="field">
            <label htmlFor={`${fid}-order`}>
              {tx("project_form.boglanadigan_buyurtma")}
              <span style={{ fontSize: 12, fontWeight: "normal", color: "var(--muted)", marginLeft: 6 }}>
                ({tx("common.ixtiyoriy")})
              </span>
            </label>
            <select
              id={`${fid}-order`}
              value={f.order_id || ""}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : null;
                handleOrderChange(val);
              }}
              disabled={ordersLoading}
            >
              <option value="">{tx("project_form.buyurtma_tanlanmagan", undefined, "— Tanlanmagan (Buyurtmasiz yangi) —")}</option>
              {orders.filter((ord) => ord.status !== "DRAFT").map((ord) => (
                <option key={ord.id} value={ord.id}>
                  {ord.system_name} — {ord.module || ord.system_name} ({ord.status_display})
                </option>
              ))}
              {f.order_id && !orders.some((o) => o.id === f.order_id) && (
                <option value={f.order_id}>
                  Buyurtma #{f.order_id}
                </option>
              )}
            </select>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
              {tx("project_form.buyurtma_tanlash_izohi")}
            </div>
          </div>
          <div className="field">
            <label htmlFor={`${fid}-0`}>{tx("project_form.loyiha_nomi")}</label>
            <input id={`${fid}-0`} value={f.name} onChange={(e) => set("name", e.target.value)}
                   placeholder={tx("project_form.masalan_mobil_ilova_v2")} />
            {errors.name && <div className="err">{errors.name}</div>}
          </div>
          <div className="field">
            <label htmlFor={`${fid}-type`}>{tx("orders.loyiha_turi_label")}</label>
            <select
              id={`${fid}-ptype`}
              value={f.project_type}
              onChange={(e) => set("project_type", e.target.value)}
            >
              {(meta?.project_type || meta?.order_type || [])
                .filter((t) => t.value === "NEW" || t.value === "CONTINUATION" || t.value === "NEEDS_CLASSIFICATION")
                .map((t) => (
                  <option key={String(t.value)} value={String(t.value)}>{t.label}</option>
                ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${fid}-1`}>{tx("project_form.tavsif")}</label>
            <textarea id={`${fid}-1`} rows={3} value={f.description}
                      onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor={`${fid}-2`}>{tx("project_form.boshlanish_sanasi")}</label>
              <DateField id={`${fid}-2`} value={f.start_date}
                         min={minAllowedDate || undefined}
                         max={f.due_date || undefined}
                         onChange={handleStartDateChange} />
              {errors.start_date && <div className="err">{errors.start_date}</div>}
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor={`${fid}-4`}>{tx("project_form.tugash_sanasi_muddat")}</label>
              {/* min: tugash boshlanishdan oldin bo'lib qolmasin */}
              <DateField id={`${fid}-4`} value={f.due_date}
                         min={f.start_date || undefined}
                         onChange={handleDueDateChange} />
              {errors.due_date && <div className="err">{errors.due_date}</div>}
            </div>
          </div>
        </Card>

        {/* Tahrirlashda fayllar alohida «Fayllar» bolimida boshqariladi -
            bu yerda faqat yangi loyiha uchun boshlangich hujjatlar. */}
        {!editing && (
          <Card title={tx("project_form.boshlangich_fayllar")}>
            {selectedOrder && (selectedOrder.tz_file_name || (selectedOrder.attachments && selectedOrder.attachments.length > 0)) && (
              <div
                style={{
                  marginBottom: "1rem",
                  padding: "0.6rem 0.85rem",
                  borderRadius: "8px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-muted)",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: "var(--accent)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <span>📎</span>
                <span>{tx("project_form.buyurtma_fayli_biriktirildi", undefined, "Buyurtma fayli biriktirildi")}</span>
              </div>
            )}
            <FilePicker
              files={files}
              onChange={setFiles}
              withDescription
              description={fileNote}
              onDescription={setFileNote}
              withDates
              date={fileDate}
              onDate={setFileDate}
              /* Hujjat sanasi loyiha oralig'idan chiqmasin - chegaralar
                 shu formaning o'zidagi maydonlardan olinadi. */
              minDate={f.start_date || undefined}
              maxDate={f.due_date || undefined}
            />
          </Card>
        )}
      </div>

      <div>
        {/* O'chirish huquqini SERVER aytadi (`can_delete_project`):
            menejer, tizim admini va boshliq. Ilgari shart bu yerda
            qo'lda takrorlangan edi va serverdagi qoidadan uzilib
            qolgandi. */}
        {editing && acc?.can_delete_project && (
          <Card title={tx("project_form.loyihani_ochirish")}>
            <Button variant="danger" block disabled={busy}
                    onClick={() => void removeProject()}>
              {tx("project_form.loyihani_butunlay_ochirish")}
            </Button>
          </Card>
        )}

        {/* Tahrirlashda jamoa «Jamoa» bolimida boshqariladi - bu yerda
            faqat yangi loyihaga qoshiladigan odamlar. */}
        {!editing && (
          <Card title={tx("project_form.jamoa_va_vazifalar")}>
            <TeamPicker
              picks={team}
              onChange={setTeam}
              /* Menejer siz bolasiz - bu royxatdan menejer roli berilmaydi */
              roles={(meta?.project_role || []).filter((r) => r.value !== "MANAGER")}
              priorities={meta?.task_priority || []}
              defaultRole="DEVELOPER"
              excludeId={user?.id}
              projectStartDate={f.start_date || minAllowedDate}
              projectDueDate={f.due_date}
              showDevelopers
            />
          </Card>
        )}
      </div>
    </div>
  );

  if (isModal) {
    return createPortal(
      <div
        className="modal-overlay"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100001,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px 16px",
          background: "var(--overlay)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          overflow: "hidden",
        }}
        onClick={onClose}
      >
        <div
          className="modal-window card"
          style={{
            width: "min(1420px, 96vw)",
            height: "92vh",
            display: "flex",
            flexDirection: "column",
            borderRadius: 12,
            boxShadow: "var(--shadow-modal)",
            overflow: "hidden",
            background: "var(--canvas)",
            border: "1px solid var(--border)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 20px",
              borderBottom: "1px solid var(--border)",
              background: "var(--surface)",
              flexShrink: 0,
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <strong style={{ fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {editing ? tx("project_form.loyiha_sozlamalari") : tx("common.yangi_loyiha")}
              </strong>
              {(selectedOrder || initialOrder) && (
                <>
                  <span className="muted">/</span>
                  <span className="muted" style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {(selectedOrder || initialOrder)?.system_name}
                  </span>
                </>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <select
                aria-label={tx("project_form.loyiha_holati")}
                title={tx("project_form.loyiha_holati")}
                value={f.status}
                style={{ width: "auto", minWidth: 140 }}
                onChange={(e) => set("status", e.target.value)}
              >
                {statusOptions.map((s) => (
                  <option key={s.value} value={String(s.value)}>{s.label}</option>
                ))}
              </select>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  if (formRef.current) {
                    if (formRef.current.requestSubmit) {
                      formRef.current.requestSubmit();
                    } else {
                      formRef.current.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
                    }
                  }
                }}
              >
                {busy ? tx("common.saqlanmoqda") : editing ? tx("common.saqlash") : tx("project_form.loyiha_yaratish")}
              </Button>
              <Button iconOnly aria-label={tx("common.yopish")}
                variant="ghost" size="sm"
                onClick={onClose}
                title={tx("common.yopish")}
              >
                ✕
              </Button>
            </div>
          </div>

          {/* Modal Scrollable Body */}
          <div
            ref={modalBodyRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "20px",
            }}
          >
            <ErrorMsg error={error} />
            <form ref={formRef} id={formId} onSubmit={submit}>
              {formFields}
            </form>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <>
      {/* Holat va tugmalar sarlavha qatorida: bitta maydon uchun butun karta
          ketmasin, «Loyiha yaratish» esa formaning oxirigacha aylantirmasdan
          ko'rinib tursin. Tugma formadan tashqarida turgani uchun `form`
          atributi bilan bog'lanadi - bosilganda odatdagidek `submit` bo'ladi. */}
      <PageHead
        title={<strong>{editing ? tx("project_form.loyiha_sozlamalari") : tx("common.yangi_loyiha")}</strong>}
        actions={(
          <div className="row" style={{ gap: 8 }}>
            <select aria-label={tx("project_form.loyiha_holati")} title={tx("project_form.loyiha_holati")} value={f.status}
                    style={{ width: "auto", minWidth: 140 }}
                    onChange={(e) => set("status", e.target.value)}>
              {statusOptions.map((s) => (
                <option key={s.value} value={String(s.value)}>{s.label}</option>
              ))}
            </select>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                if (formRef.current) {
                  if (formRef.current.requestSubmit) {
                    formRef.current.requestSubmit();
                  } else {
                    formRef.current.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
                  }
                }
              }}
            >
              {busy ? tx("common.saqlanmoqda") : editing ? tx("common.saqlash") : tx("project_form.loyiha_yaratish")}
            </Button>
            <Button  onClick={() => go(-1)}>{tx("common.bekor_qilish")}</Button>
          </div>
        )}
      />
      <div className="content">
        <ErrorMsg error={error} />
        <form ref={formRef} id={formId} onSubmit={submit}>
          {formFields}
        </form>
      </div>
    </>
  );
}
