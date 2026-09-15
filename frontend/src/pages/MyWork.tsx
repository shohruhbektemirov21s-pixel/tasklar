import { useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { DueColumnKey, MyWorkData, Task } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import { IconCalendar } from "@/components/icons";
import {
  Empty, ErrorMsg, Loading, Pager, StatusBadge, fmtDate, fmtDateTime,
} from "@/components/ui";
import { toTask, useNavParams } from "@/nav";
import { tx } from "@/i18n";

/**
 * Doska ustunlari — MUDDAT bo'yicha, chapdan o'ngga torayib boradi.
 *
 * Kalit serverdan keladi (`/my-work/?board=due`), nom esa bazadan: ustun
 * nomlari holat nomlari EMAS, ya'ni ularni `meta.task_status` dan olib
 * bo'lmaydi.
 *
 * Nuqta rangi shoshilinchlikni aytadi: kulrangdan (hammasi) sariqqacha
 * (bugun), bajarilgani esa yashil.
 */
const COLUMNS: { key: DueColumnKey; label: string; dot: string }[] = [
  { key: "ALL", label: tx("my_work.ustun_barchasi"), dot: "var(--subtle)" },
  { key: "WEEK", label: tx("my_work.ustun_shu_haftalik"), dot: "var(--accent)" },
  { key: "TODAY", label: tx("my_work.ustun_bugun"), dot: "var(--attention)" },
  { key: "DONE", label: tx("my_work.ustun_bajarilganlar"), dot: "var(--success)" },
];

const COLUMN = new Map(COLUMNS.map((c) => [c.key as string, c]));

/**
 * «Muddat» tanlagichi. Qiymatlar SERVER tushunadigan kalitlar
 * (`due_span`): kalendar hafta, oy va yil - «oxirgi 7 kun» emas. Shu
 * sababdan chegara bu yerda hisoblanmaydi, faqat kalit yuboriladi.
 */
const TERMS = [
  { value: "week", label: tx("my_work.muddat_1_haftalik") },
  { value: "month", label: tx("my_work.muddat_1_oylik") },
  { value: "year", label: tx("my_work.muddat_1_yillik") },
];

/**
 * «Mening ishim» — muddat bo'yicha ustunlar.
 */
export default function MyWork() {
  const fid = useId();
  const { user } = useAuth();
  const [dragId, setDragId] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [params, setParams] = useNavParams();
  const period = params.get("period") || "";
  const projectId = params.get("project") || "";
  const half = params.get("half") || "";
  const scope = params.get("scope") || "";

  const pageOf = (key: string) => Number(params.get(`page_${key.toLowerCase()}`)) || 1;

  const { data, error: loadError, reload } = useFetch<MyWorkData>("/my-work/", {
    board: "due",
    period,
    project: projectId,
    half,
    scope,
    ...Object.fromEntries(COLUMNS.map((c) => [`page_${c.key.toLowerCase()}`, String(pageOf(c.key))])),
  });

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const setPeriod = (v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set("period", v);
    else next.delete("period");
    COLUMNS.forEach((c) => next.delete(`page_${c.key.toLowerCase()}`));
    setParams(next, { replace: true });
  };

  const setProject = (v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set("project", v);
    else next.delete("project");
    COLUMNS.forEach((c) => next.delete(`page_${c.key.toLowerCase()}`));
    setParams(next, { replace: true });
  };

  const setScope = (v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set("scope", v);
    else next.delete("scope");
    COLUMNS.forEach((c) => next.delete(`page_${c.key.toLowerCase()}`));
    setParams(next, { replace: true });
  };

  const error = actionError || loadError;
  const groups = data?.groups || [];
  const managed = data?.managed_projects || [];

  /**
   * Kartani SHU ustunga tashlab bo'ladimi.
   *
   * KO'CHIRISH IKKI TOMONLAMA. «Bugun» va «Shu haftalik» muddatni qo'yadi,
   * «Barchasi» esa uni OLIB TASHLAYDI - ya'ni ish rejadan chiqib, muddatsiz
   * ro'yxatda qoladi. Shu sababdan «Barchasi» faqat muddati BOR kartani
   * qabul qiladi: muddatsiz ishni unga tashlash hech nimani o'zgartirmasdi.
   *
   * Muddatni ODDIY IJROCHI ham suradi - u o'z ishini rejalashtiradi. Buning
   * uchun tor eshik bor (`/tasks/<id>/due/`): u faqat `due_date` ni
   * o'zgartiradi va loyiha a'zosiga ochiq. Vazifani TAHRIRLASH esa
   * avvalgidek menejer va adminda qoladi - sarlavha, ijrochi, prioritet
   * shu bilan birga ochilib ketmasin.
   *
   * «Bajarilganlar» esa MUDDAT emas, HOLAT: «Bajarildi» ni qo'lda qo'yib
   * bo'lmaydi, u faqat TEKSHIRUVDAGI ishni tekshiruvchi tasdiqlaganda
   * qo'yiladi (qoida serverda - `DEVELOPER_TRANSITIONS` va `move_status`).
   * Shuning uchun u yagona ustun bo'lib, boshqaruv huquqini talab qiladi.
   *
   * Yopilgan ish umuman sudralmaydi: uning muddati endi hech nimani
   * anglatmaydi va muddat ustunlari faqat OCHIQ ishni oladi - karta o'z
   * joyidan qimirlamasdi.
   */
  function accepts(key: string, task?: Task) {
    if (!task) return false;
    if (key === "DONE") {
      return managed.includes(task.project) && task.status === "IN_REVIEW";
    }
    if (task.status === "DONE" || task.status === "CANCELLED") return false;
    if (key === "ALL") return Boolean(task.due_date);
    return key === "WEEK" || key === "TODAY";
  }

  /** Ayni damda sudralayotgan vazifa. FUNKSIYA, o'zgaruvchi emas: ref
      qayta chizishni tug'dirmaydi va render paytida hisoblangan qiymat
      `drop` ga eskirib yetib borardi - ya'ni yuqoridagi poyganing o'zi. */
  const draggedTask = () => groups.flatMap((g) => g.tasks).find((t) => t.id === dragRef.current);

  /** Ko'chirish - sudrash ham, kartadagi menyu ham shu yerdan o'tadi. */
  async function move(task: Task, key: string) {
    const column = groups.find((g) => g.status === key);
    setActionError(null);
    try {
      if (key === "DONE") {
        await api.post(`/tasks/${task.id}/status/`, { status: "DONE" });
      } else {
        // Sana SERVERDAN kelgan (`due_target`): «hafta oxiri» qaysi kun
        // ekanini mijoz qayta hisoblamaydi, aks holda karta o'zi tushgan
        // ustunda turmay qolishi mumkin edi. «Barchasi» da nishon yo'q -
        // u muddatni bo'shatadi.
        await api.post(`/tasks/${task.id}/due/`,
                       { due_date: key === "ALL" ? null : column?.due_target });
      }
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : tx("my_work.kochirib_bolmadi"));
    }
  }

  async function drop(key: string) {
    setOver(null);
    const task = draggedTask();
    dragRef.current = null;
    setDragId(null);
    if (!task || !accepts(key, task)) return;
    await move(task, key);
  }
  // Doska HAR DOIM to'rt ustunli - bo'sh ustun ham qaytadi. Shuning uchun
  // "ish bormi" degan savolga ustunlar soni javob bera olmaydi: kartalar
  // sanaladi. Aks holda hech vazifasi yo'q odam to'rtta bo'sh ustunni
  // ko'rib, sahifa buzuq deb o'ylardi.
  const hasAny = groups.some((g) => g.count > 0);

  return (
    <>
      <PageHead
        title={<strong>{tx("my_work.mening_ishim")}</strong>}
      />
      <div className="content">
        {error ? (
          <ErrorMsg error={error} />
        ) : !data ? (
          <Loading />
        ) : (
          <>
            <div className="filters">
              {(user?.is_boss || user?.is_platform_admin) && (
                <div className="f">
                  <label htmlFor={`${fid}-scope`}>{tx("my_work.qamrov")}</label>
                  <select id={`${fid}-scope`} value={scope} onChange={(e) => setScope(e.target.value)}>
                    <option value="">{tx("my_work.boshliq_barchasi")}</option>
                    <option value="mine">{tx("my_work.boshliq_meniki")}</option>
                  </select>
                </div>
              )}

              {Boolean(data?.projects?.length) && (
                <div className="f">
                  <label htmlFor={`${fid}-project`}>{tx("my_work.loyiha")}</label>
                  <select id={`${fid}-project`} value={projectId} onChange={(e) => setProject(e.target.value)}>
                    <option value="">{tx("my_work.barcha_loyihalar")}</option>
                    {(data?.projects || []).map((p) => (
                      <option key={p.id} value={String(p.id)}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}


              <div className="f">
                <label htmlFor={`${fid}-0`}>{tx("common.muddat")}</label>
                <select id={`${fid}-0`} value={period} onChange={(e) => setPeriod(e.target.value)}>
                  <option value="">{tx("my_work.barcha_muddatlar")}</option>
                  {TERMS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {hasAny ? (
              /* `fit`: ko'rinish loyiha doskasi bilan bir xil (ustun o'z
                 qutisida), faqat to'rt ustun ekranga bo'linib sig'adi. */
              <div className="board fit">
                {groups.map((g) => (
                  <div
                    key={g.status}
                    className={`column ${over === g.status ? "drag-over" : ""}`}
                    /* Qabul qilmaydigan ustun `preventDefault` qilmaydi -
                       brauzer «bu yerga bo'lmaydi» kursorini o'zi
                       ko'rsatadi va odam kartani tortib borib, keyin xato
                       o'qimaydi. */
                    onDragOver={(e) => {
                      if (dragRef.current != null && !accepts(g.status, draggedTask())) return;
                      e.preventDefault();
                      setOver(g.status);
                    }}
                    onDragLeave={() => setOver((o) => (o === g.status ? null : o))}
                    onDrop={() => void drop(g.status)}
                  >
                    <div className="column-head">
                      <span className="dot"
                            style={{ background: COLUMN.get(g.status)?.dot || "var(--subtle)" }} />
                      {COLUMN.get(g.status)?.label || g.label}
                      <span className="n">{g.count}</span>
                    </div>
                    <div className="column-body">
                      {g.tasks.map((t) => {
                        // Boshqa ustunga o'tkazsa bo'ladimi. Bo'lmasa karta
                        // umuman sudralmaydi - qo'l bejiz tortmasin.
                        const movable = COLUMNS.some(
                          (c) => c.key !== g.status && accepts(c.key, t));
                        const day = t.due_date ? parseInt(fmtDate(t.due_date).split(".")[0], 10) : null;
                        const halfNum = day ? (day <= 15 ? 1 : 2) : null;

                        return (
                          <Link className={`tcard ${t.is_overdue ? "overdue" : ""} ${dragId === t.id ? "dragging" : ""}`}
                                {...toTask(t.id)} key={t.id}
                                draggable={movable}
                                onDragStart={() => { dragRef.current = t.id; setDragId(t.id); }}
                                onDragEnd={() => {
                                  dragRef.current = null; setDragId(null); setOver(null);
                                }}>
                            {t.project_name && (
                              <div style={{ marginBottom: 4 }}>
                                <span className="badge badge-subtle" style={{ fontSize: 10.5, padding: "1px 6px", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {t.project_name}
                                </span>
                              </div>
                            )}
                            <div className="title" style={{ margin: 0 }}>{t.title}</div>
                            {t.description && (
                              <div className="muted" style={{
                                fontSize: 12,
                                marginTop: 4,
                                marginBottom: 2,
                                whiteSpace: "pre-wrap",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                                lineHeight: 1.35,
                              }}>
                                {t.description}
                              </div>
                            )}
                            <div className="foot" style={{ marginTop: 8, alignItems: "center" }}>
                              <StatusBadge task={t} />
                              <span className="spacer" />
                              {t.due_date && (
                                <span className="row middle" style={{ gap: 4 }}>
                                  {halfNum && (
                                    <span
                                      className="badge"
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        padding: "1px 5px",
                                        borderRadius: 4,
                                        background: halfNum === 1 ? "var(--accent-bg, #eff6ff)" : "var(--warning-bg, #fef3c7)",
                                        color: halfNum === 1 ? "var(--accent, #2563eb)" : "var(--warning, #d97706)",
                                        border: `1px solid ${halfNum === 1 ? "rgba(37,99,235,0.2)" : "rgba(217,119,6,0.2)"}`,
                                      }}
                                      title={halfNum === 1 ? tx("my_work.davr_1") : tx("my_work.davr_2")}
                                    >
                                      {halfNum}
                                    </span>
                                  )}
                                  <span className="tcard-due" title={tx("task_detail.tugash_vaqti")}>
                                    <IconCalendar size={12} /> {fmtDateTime(t.due_date)}
                                  </span>
                                </span>
                              )}
                            </div>
                          </Link>
                        );
                      })}
                      {!g.tasks.length && (
                        <p className="muted center" style={{ fontSize: 12.5, padding: "14px 6px" }}>
                          {tx("my_work.bu_ustun_bosh")}
                        </p>
                      )}
                      {/* Sahifa raqamlari - faqat bo'linadigan ustunda.
                          Sarlavhadagi son JAMI ishni aytadi, ya'ni u
                          sahifadan sahifaga o'zgarmaydi. */}
                      {(g.pages || 1) > 1 && (
                        <Pager page={g.page || 1} pages={g.pages || 1}
                               onPick={(n) => set(`page_${g.status.toLowerCase()}`, String(n))} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card">
                <Empty icon="☐" title={tx("my_work.sizga_hali_vazifa_biriktirilmagan")}
                       text={tx("my_work.loyihaga_qoshiling_menejer_mutaxassisligingi")}>
                  <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 12 }}>
                    <Link className="btn btn-primary" to="/loyihalar">
                      {tx("common.loyihalar")}
                    </Link>
                    <Link className="btn" to="/qoshilish">
                      {tx("projects.loyiha_topish")}
                    </Link>
                  </div>
                </Empty>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
