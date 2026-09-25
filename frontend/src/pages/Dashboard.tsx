/**
 * Bosh panel — davr kesimi va muddat holati, boshqa hech narsa.
 *
 * Panel ilgari hamma narsani bir ekranga sig'dirardi: salomlashuv, bugungi
 * kesim, olti-yettita katak, ogohlantirish, menejer kesimi, tekshiruv
 * navbati, jamoa jadvali, loyihalar ro'yxati va jamoa yig'gich. Har biri
 * alohida foydali edi-yu, birga turganda asosiy savol — «qancha ish bor va
 * qanchasi bajarildi» — ekranning pastiga tushib ketardi.
 *
 * Endi yuqorida yil, oy va hafta kesimi BIRVARAKAYIGA ko'rinadi — tanlagich
 * bo'lsa, odam yillik sonni oylik bilan solishtirish uchun tugmani u yoq-bu
 * yoqqa bosib turishi kerak bo'lardi. Pastda esa muddat holati.
 *
 * Hamma raqam `/api/dashboard/` dan keladi va u Db2 ni ORM orqali o'qiydi:
 * bu yerda hech qanday hisob-kitob ham, namuna qiymat ham yo'q.
 */
import { Suspense, lazy, useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, listOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type {
  ChangeRequestItem,
  DashboardData,
  DashboardPeriod,
  DashboardPeriodRow,
  OrderPeriodRow,
  OrderStats,
  Task,
  UserBrief,
} from "@/api/types";
import type { PaginatedResponse } from "@/api/orders";
import { downloadOrderDocx } from "@/api/orders";
import { useAuth } from "@/auth/AuthContext";
import { useDebouncedLive } from "@/realtime/RealtimeContext";
import { PageHead } from "@/components/Layout";
import {
  AvatarStack, Card, DateField, Empty, ErrorMsg, Loading, Pager, Priority, StatusBadge, fmtDate, fmtDateTime,
} from "@/components/ui";
import { IconPlus } from "@/components/icons";
import TaskDrawer from "@/components/TaskDrawer";
import { toNewOrder, toTask, useGo } from "@/nav";
import { tx } from "@/i18n";
import { Button, LinkButton } from "@/components/Button";

const OrderDetailModal = lazy(() => import("@/pages/OrderDetail"));
const LABELS: Record<DashboardPeriod, string> = {
  year: tx("dashboard.yil_boshidan"),
  month: tx("dashboard.oy_boshidan"),
  week: tx("dashboard.hafta_boshidan"),
};
/** Taxtadagi uchta ustun: nomi, kaliti va nimani sanashi. */
const COLUMNS = [
  { key: "todo", label: tx("common.nazoratda"),
    hint: tx("dashboard.shu_davrda_ochilgan_va_hamon") },
  { key: "overdue", label: tx("dashboard.muddati_otgan"),
    hint: tx("dashboard.muddati_shu_davrga_tushgan_va") },
  { key: "done", label: tx("dashboard.bajarilganlar"),
    hint: tx("dashboard.shu_davrda_yakunlangan_ishlaringiz") },
] as const;
/**
 * Muddat holati — pastki qator.
 *
 * Uchovi butun tarix bo'yicha va bir-birini takrorlamaydi: yopilmagan ish
 * yo kechikkan, yo hali kutilmoqda.
 */
const DEADLINE_CARDS = [
  { key: "late_done", label: tx("dashboard.muddati_buzib_bajarilgan"),
    hint: tx("dashboard.yakunlangan_lekin_muddatidan_keyin_yopilgan") },
  { key: "overdue", label: tx("dashboard.muddati_otgan"),
    hint: tx("dashboard.hali_yopilmagan_va_muddati_otib") },
  { key: "waiting", label: tx("dashboard.kutilmoqda"),
    hint: tx("dashboard.yopilmagan_muddati_hali_kelmagan_yoki") },
] as const;
/** Bosilgan katak: qaysi davr va qaysi ko'rsatkich. */
interface Picked {
  period?: DashboardPeriod;
  metric: string;
  title: string;
}
function Band({ p, onPick, picked }: {
  p: DashboardPeriodRow;
  onPick: (v: Picked) => void;
  picked: Picked | null;
}) {
  const hasAny = Boolean(p.todo || p.overdue || p.done);
  const pickBand = () => {
    if (!hasAny) return;
    onPick({ period: p.key, metric: "period",
             title: tx("dashboard.davr_hammasi", { davr: LABELS[p.key] }) });
  };
  return (
    <section className="stat-band">
      <header className={`stat-band-head ${hasAny ? "pickable" : ""}`
                         + (picked?.period === p.key && picked?.metric === "period"
                            ? " picked" : "")}
              role={hasAny ? "button" : undefined}
              tabIndex={hasAny ? 0 : undefined}
              title={hasAny
                ? tx("dashboard.davr_kesimi_izohi", { davr: LABELS[p.key] })
                : tx("dashboard.bu_davrda_ish_yoq")}
              onClick={pickBand}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  pickBand();
                }
              }}>
        <h2 className="stat-band-title">{LABELS[p.key]}</h2>
        <p className="stat-band-since">{fmtDate(p.since)} {tx("dashboard.bugun")}</p>
      </header>
      <div className="stat-band-row">
        {COLUMNS.map((col) => {
          const active = picked?.period === p.key && picked?.metric === col.key;
          return (
            <button type="button" key={col.key} title={col.hint}
                    className={`stat-band-cell ${p[col.key] ? "pickable" : ""}`
                               + (active ? " picked" : "")}
                    disabled={!p[col.key]}
                    onClick={() => onPick({
                      period: p.key, metric: col.key,
                      title: tx("dashboard.davr_ustun", { davr: LABELS[p.key], ustun: col.label }),
                    })}>
              <span className={`v ${p[col.key] ? "" : "zero"}`}>{p[col.key]}</span>
              <span className="k">{col.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
const DEADLINE_METRIC: Record<string, string> = {
  late_done: "late_done", overdue: "overdue_now", waiting: "waiting",
};
function Deadlines({ d, onPick, picked }: {
  d: DashboardData["deadlines"];
  onPick: (v: Picked) => void;
  picked: Picked | null;
}) {
  return (
    <div className="deadline-grid">
      {DEADLINE_CARDS.map((c) => {
        const metric = DEADLINE_METRIC[c.key];
        const active = !picked?.period && picked?.metric === metric;
        return (
          <button type="button" key={c.key} title={c.hint}
                  className={`deadline-card ${d[c.key] ? "pickable" : ""}`
                             + (active ? " picked" : "")}
                  disabled={!d[c.key]}
                  onClick={() => onPick({ metric, title: c.label })}>
            <span className="k">{c.label}</span>
            <span className={`v ${d[c.key] ? "" : "zero"}`}>{d[c.key]}</span>
          </button>
        );
      })}
    </div>
  );
}
/**
 * Ro'yxat ustidagi «Muddat» tanlagichi.
 *
 * Kalitlar serverdagi `DUE_RANGES` bilan bir xil, oraliqni ham server
 * hisoblaydi: «shu hafta» dushanbadan yakshanbagacha, «shu oy» oyning
 * birinchi kunidan oxirigacha - ya'ni KALENDAR davri, «oxirgi 7 kun»
 * emas. Chegara Toshkent kunidan yasalgani uchun tunda ham siljimaydi.
 */
const DUE_OPTIONS = [
  { value: "today", label: tx("common.bugun") },
  { value: "yesterday", label: tx("dashboard.kecha") },
  { value: "tomorrow", label: tx("dashboard.ertaga") },
  { value: "week", label: tx("dashboard.shu_hafta") },
  { value: "month", label: tx("dashboard.shu_oy") },
  { value: "year", label: tx("dashboard.shu_yil") },
] as const;
const EMPTY_FILTERS = {
  search: "", due: "week", date: "", status: "", project: "", assignee: "", half: "",
};
const RESET_FILTERS = {
  search: "", due: "", date: "", status: "", project: "", assignee: "", half: "",
};
type Filters = typeof RESET_FILTERS;
type FilterKey = keyof Filters;
/** `/dashboard/tasks/` javobi. */
interface PanelTasksData {
  count: number;
  /** Joriy sahifa (1 dan boshlanadi) va jami sahifalar soni. */
  page: number;
  pages: number;
  page_size: number;
  results: Task[];
  /**
   * Tanlagichlar uchun ro'yxatlar - SHU katakdagi ishlardan yig'ilgan.
   *
   * Server ularni filtrdan OLDINGI to'plamdan oladi: aks holda loyihani
   * tanlagan odam qolgan loyihalarni tanlagichdan yo'qotib qo'yardi va
   * tanlovini ortga qaytara olmasdi.
   */
  facets: {
    projects: { id: number; name: string }[];
    assignees?: { id: number; name: string }[];
  };
}
interface ComboOption {
  value: string;
  name: string;
}
/**
 * YOZIB qidiriladigan tanlagich.
 *
 * Oddiy `<select>` yigirmata odam bo'lganda ish bermay qoldi: ochilgan
 * ro'yxat butun ekranni to'ldirar, kerakli ismni topish uchun uni ko'z
 * bilan aylantirib chiqish kerak edi. Bu yerda maydonga YOZILADI -
 * ro'yxat harflar bo'yicha qisqaradi, sichqoncha bilan tanlash esa
 * joyida qoladi.
 *
 * Ro'yxat serverdan emas, TAYYOR massivdan elanadi: u allaqachon shu
 * katakdagi odamlar (yoki loyihalar) bilan cheklangan va o'nlab
 * yozuvdan oshmaydi - har harfga so'rov yuborishning hojati yo'q.
 */
function Combo({ id, label, options, value, onChange, placeholder }: {
  id: string;
  label: string;
  options: ComboOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const chosen = options.find((o) => o.value === value) || null;
  const text = open ? q : (chosen?.name || value || "");
  const needle = q.trim().toLowerCase();
  const hits = needle
    ? options.filter((o) => o.name.toLowerCase().includes(needle))
    : options;
  const pick = (v: string) => {
    onChange(v);
    setQ("");
    setOpen(false);
  };
  return (
    <div className="f combo">
      <label htmlFor={id}>{label}</label>
      <input id={id} value={text} placeholder={placeholder} autoComplete="off"
             role="combobox" aria-expanded={open} aria-controls={id + "-list"}
             onChange={(e) => { setQ(e.target.value); setOpen(true); }}
             onFocus={() => { setQ(""); setOpen(true); }}
             onBlur={() => setOpen(false)}
             onKeyDown={(e) => {
               if (e.key === "Escape") { setQ(""); setOpen(false); }
               if (e.key === "Enter") {
                 if (hits.length > 0) {
                   pick(hits[0].value);
                 } else if (q.trim()) {
                   pick(q.trim());
                 }
               }
             }} />
      {open && (
        <div className="combo-list" id={id + "-list"} role="listbox"
             onMouseDown={(e) => e.preventDefault()}>
          <button type="button" className={"combo-item " + (value ? "" : "on")}
                  onClick={() => pick("")}>{tx("common.hammasi")}</button>
          {hits.map((o) => (
            <button key={o.value} type="button"
                    className={"combo-item " + (o.value === value ? "on" : "")}
                    onClick={() => pick(o.value)}>{o.name}</button>
          ))}
          {hits.length === 0 && <div className="combo-empty muted">{tx("dashboard.topilmadi")}</div>}
        </div>
      )}
    </div>
  );
}
/** Bosilgan katakdagi ishlar - panelning ostida. */
function PickedTasks({ picked, onClose }: { picked: Picked; onClose: () => void }) {
  const fid = useId();
  const { meta } = useAuth();
  const [open, setOpen] = useState<Task | null>(null);
  const [f, setF] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const filtered = Object.values(f).some(Boolean);
  const { data, loading } = useFetch<PanelTasksData>("/dashboard/tasks/",
    { period: picked.period || "", metric: picked.metric, page, ...f },
    { debounceMs: 300 });
  const tasks = data ? listOf<Task>(data) : null;
  const projectOptions: ComboOption[] = (data?.facets.projects || [])
    .map((p) => ({ value: String(p.id), name: p.name }));
  const assigneeOptions: ComboOption[] = (data?.facets.assignees || [])
    .map((u) => ({ value: String(u.id), name: u.name }));
  const set = (k: FilterKey, v: string) => {
    setPage(1);
    setF((prev) => ({ ...prev, [k]: v }));
  };
  const clear = () => { setPage(1); setF(RESET_FILTERS); };
  return (
    /* Ro'yxat va vazifa paneli yonma-yon: keng ekranda panel ro'yxatning
       o'ng yonida ochiladi va uni yopib qo'ymaydi (`app.css`,
       `.panel-split`). Shuning uchun `TaskDrawer` kartaning ICHIDA emas,
       yonida turadi. */
    <div className="panel-split">
    <Card title={picked.title} padded={false}
          badge={data ? <span className="badge">{data.count}</span> : undefined}
          action={<Button size="sm" onClick={onClose}>{tx("common.yopish")}</Button>}>
      <div className="filters filters-inline">
        <div className="f grow">
          <label htmlFor={fid + "-q"}>{tx("common.qidiruv")}</label>
          <input id={fid + "-q"} value={f.search} placeholder={tx("dashboard.kod_yoki_sarlavha")}
                 onChange={(e) => set("search", e.target.value)} />
        </div>
        <div className="f">
          <label htmlFor={fid + "-due"}>{tx("common.muddat")}</label>
          <select id={fid + "-due"} value={f.due}
                  onChange={(e) => {
                    setPage(1);
                    setF((prev) => ({ ...prev, due: e.target.value, date: "" }));
                  }}>
            <option value="">{tx("common.hammasi")}</option>
            {DUE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="f wl-date">
          <label htmlFor={fid + "-date"}>{tx("common.sana", undefined, "Sana")}</label>
          <DateField id={fid + "-date"} value={f.date}
                     onChange={(v) => {
                       setPage(1);
                       setF((prev) => ({ ...prev, date: v, due: v ? "" : prev.due }));
                     }} />
        </div>
        <div className="f">
          <label htmlFor={fid + "-half"}>{tx("dashboard.oy_yarmi", undefined, "Oy yarmi")}</label>
          <select id={fid + "-half"} value={f.half}
                  onChange={(e) => set("half", e.target.value)}>
            <option value="">{tx("common.hammasi")}</option>
            <option value="1">{tx("dashboard.davr_1", undefined, "1 (1—15 sanalar)")}</option>
            <option value="2">{tx("dashboard.davr_2", undefined, "2 (16—30 sanalar)")}</option>
          </select>
        </div>
        <div className="f">
          <label htmlFor={fid + "-st"}>{tx("common.holat")}</label>
          <select id={fid + "-st"} value={f.status}
                  onChange={(e) => set("status", e.target.value)}>
            <option value="">{tx("common.hammasi")}</option>
            {(meta?.task_status || []).map((s) => (
              <option key={s.value} value={String(s.value)}>{s.label}</option>
            ))}
          </select>
        </div>
        {projectOptions.length > 1 && (
          <Combo id={fid + "-pr"} label={tx("common.loyiha")} options={projectOptions}
                 value={f.project} onChange={(v) => set("project", v)}
                 placeholder={tx("dashboard.loyiha_nomini_yozing")} />
        )}
        <Combo id={fid + "-as"} label={tx("dashboard.xodim")} options={assigneeOptions}
                value={f.assignee} onChange={(v) => set("assignee", v)}
                placeholder={tx("dashboard.xodim_nomini_yozing")} />
        {filtered && (
          <Button  onClick={clear}>{tx("common.tozalash")}</Button>
        )}
      </div>
      {loading ? <Loading /> : !tasks?.length ? (
        <Empty title={tx("dashboard.ish_yoq")}
               text={filtered
                 ? tx("dashboard.tanlangan_filtrga_mos_vazifa_topilmadi")
                 : tx("dashboard.bu_katakka_kirgan_vazifa_topilmadi")}>
          {filtered && (
            <Button  onClick={clear}>{tx("common.filtrni_tozalash")}</Button>
          )}
        </Empty>
      ) : (
        <div className="table-wrap"><table className="table">
          <thead>
            <tr>
              <th style={{ width: 44, textAlign: "center" }}>№</th>
              <th>{tx("common.vazifalar")}</th>
              <th className="nowrap">{tx("common.holat")}</th>
              <th className="nowrap">{tx("common.muhimlik")}</th>
              <th className="nowrap">{tx("common.ijrochilar")}</th>
              <th className="nowrap right">{tx("common.muddat")}</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t, idx) => {
              const rowNum = (data ? (data.page - 1) * data.page_size : 0) + idx + 1;
              const day = t.due_date ? parseInt(fmtDate(t.due_date).split(".")[0], 10) : null;
              const halfNum = day ? (day <= 15 ? 1 : 2) : null;
              return (
              /* Qator bosilganda SAHIFA ALMASHMAYDI - o'ng chetdan tortma
                 chiqadi (`components/TaskDrawer.tsx`). Sabab: bu ro'yxat
                 kesim, filtr va sahifa raqami bilan yig'ilgan; boshqa
                 sahifaga o'tib qaytilsa, hammasi qaytadan tanlanardi. */
              <tr className="clickable" key={t.id} onClick={() => setOpen(t)}>
                <td style={{ textAlign: "center", color: "var(--muted)", fontWeight: 600, fontSize: 13, width: 44 }}>
                  {rowNum}
                </td>
                <td>
                  <Link {...toTask(t.id)}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                          e.preventDefault();
                          e.stopPropagation();
                          setOpen(t);
                        }}>{t.title}</Link>
                  {t.description && (
                    <div className="muted" style={{
                      fontSize: 12,
                      marginTop: 2,
                      display: "-webkit-box",
                      WebkitLineClamp: 1,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      maxWidth: 420,
                    }}>
                      {t.description}
                    </div>
                  )}
                </td>
                <td className="nowrap"><StatusBadge task={t} /></td>
                <td className="nowrap"><Priority task={t} /></td>
                <td className="nowrap">
                  {t.assignees?.length ? (
                    <span className="row middle" style={{ gap: 8 }}>
                      <AvatarStack users={t.assignees} />
                      <span style={{ fontSize: 13, fontWeight: 500 }}>
                        {t.assignees.map((u) => u.full_name).join(", ")}
                      </span>
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="nowrap muted right">
                  {t.due_date ? (
                    <span className="row middle" style={{ gap: 4, justifyContent: "flex-end" }}>
                      {halfNum && (
                        <span
                          className="badge"
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "1px 5px",
                            borderRadius: 4,
                            background: halfNum === 1 ? "var(--accent-soft)" : "var(--attention-soft)",
                            color: halfNum === 1 ? "var(--accent)" : "var(--attention)",
                            border: `1px solid ${halfNum === 1 ? "var(--accent-border)" : "var(--attention-border)"}`,
                          }}
                          title={halfNum === 1 ? tx("my_work.davr_1") : tx("my_work.davr_2")}
                        >
                          {halfNum}
                        </span>
                      )}
                      <span>{fmtDateTime(t.due_date)}</span>
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
      {data && data.pages > 1 && (
        <div className="card-body pager-bar">
          <span className="muted">
            {data.count} {tx("common.tadan")} {(data.page - 1) * data.page_size + 1}—
            {Math.min(data.page * data.page_size, data.count)} {tx("common.tasi")}
          </span>
          <Pager page={data.page} pages={data.pages} onPick={setPage} />
        </div>
      )}
    </Card>
    <TaskDrawer task={open} onClose={() => setOpen(null)} />
    </div>
  );
}
function CalendarIcon({ size = 20, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function ChevronRightIcon({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
function SearchIcon({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function FilterIcon({ size = 15, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}
function MoreIcon({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1.5" fill={color} stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill={color} stroke="none" />
      <circle cx="12" cy="19" r="1.5" fill={color} stroke="none" />
    </svg>
  );
}
function getAvatarInitials(name: string) {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}
/** Davr kartasining rangi — mavzu bo'yicha bitta manba (fon, chegara, ikonka). */
const PERIOD_THEMES: Record<
  DashboardPeriod,
  {
    iconColor: string;
    cardBg: string;
    cardBorder: string;
    title: string;
  }
> = {
  year: {
    iconColor: "var(--accent)",
    cardBg: "var(--accent-soft)",
    cardBorder: "var(--accent-border)",
    title: tx("dashboard.yil_boshidan"),
  },
  month: {
    iconColor: "var(--done)",
    cardBg: "var(--done-soft)",
    cardBorder: "var(--done-border)",
    title: tx("dashboard.oy_boshidan"),
  },
  week: {
    iconColor: "var(--success)",
    cardBg: "var(--success-soft)",
    cardBorder: "var(--success-border)",
    title: tx("dashboard.hafta_boshidan"),
  },
};
/** Davr kartasidagi to'rtta ko'rsatkich — kaliti, rangi va server metrikasi. */
type OrderMetric = "submitted" | "in_progress" | "completed" | "overdue";
const METRIC_TILES: { metric: OrderMetric; color: string }[] = [
  { metric: "submitted", color: "var(--text)" },
  { metric: "in_progress", color: "var(--attention)" },
  { metric: "completed", color: "var(--success)" },
  { metric: "overdue", color: "var(--danger)" },
];
const METRIC_LABELS: Record<OrderMetric, string> = {
  submitted: tx("dashboard.jami"),
  in_progress: tx("dashboard.jarayonda"),
  completed: tx("dashboard.bajarilgan"),
  overdue: tx("dashboard.kechikkan"),
};
const METRIC_TITLES: Record<OrderMetric, string> = {
  submitted: tx("dashboard.jami_buyurtmalar"),
  in_progress: tx("dashboard.jarayonda_buyurtmalar"),
  completed: tx("dashboard.bajarilgan_buyurtmalar"),
  overdue: tx("dashboard.kechikkan_buyurtmalar"),
};
function metricValue(p: OrderPeriodRow, metric: OrderMetric): number {
  if (metric === "submitted") return p.submitted ?? 0;
  if (metric === "in_progress") return p.in_progress ?? p.approved ?? 0;
  if (metric === "completed") return p.completed ?? 0;
  return p.overdue ?? 0;
}
const UNFINISHED_ORDER_STATUSES = new Set([
  "NEW", "ACCEPTED", "ASSIGNED_TO_DEV", "IN_PROGRESS", "TESTING", "READY_FOR_REVIEW",
]);
/**
 * Buyurtma qatoridagi "Holati" nishoni — to'rtta soddalashtirilgan holat.
 *
 * Backendda 9 ta status bor (`ChangeRequestStatus`), lekin jadvalda ularning
 * hammasini ko'rsatish ko'zni charchatadi. Shu yerda to'rttaga yig'iladi:
 * muddati o'tgan HAR QANDAY ochiq buyurtma — holatidan qat'iy nazar —
 * «Kechikkan» bo'lib chiqadi (backenddagi `overdue_orders_q` bilan bir xil
 * shart). Rad etilgan / bekor qilingan buyurtmani esa «Kechikkan» deb
 * atash noto'g'ri bo'lardi — ular o'z nomi bilan qoladi.
 */
function dashboardStatusPill(order: ChangeRequestItem): { label: string; bg: string; color: string } {
  const deadline = order.pm_deadline || order.due_date;
  const todayIso = new Date().toISOString().slice(0, 10);
  const overdue = Boolean(deadline) && (deadline as string) < todayIso
    && UNFINISHED_ORDER_STATUSES.has(order.status);
  if (overdue) {
    return { label: tx("dashboard.kechikkan"), bg: "var(--danger-soft)", color: "var(--danger)" };
  }
  if (order.status === "NEW" || order.status === "READY_FOR_REVIEW") {
    return { label: tx("dashboard.korilayapti"), bg: "var(--accent-soft)", color: "var(--accent)" };
  }
  if (order.status === "ACCEPTED" || order.status === "ASSIGNED_TO_DEV"
    || order.status === "IN_PROGRESS" || order.status === "TESTING") {
    return { label: tx("dashboard.jarayonda"), bg: "var(--attention-soft)", color: "var(--attention)" };
  }
  if (order.status === "COMPLETED") {
    return { label: tx("dashboard.tasdiqlangan"), bg: "var(--success-soft)", color: "var(--success)" };
  }
  return { label: order.status_display || order.status, bg: "var(--danger-soft)", color: "var(--danger)" };
}
/** Buyurtmalar ro'yxatini CSV (Excel bilan ochiladigan) faylga eksport qiladi. */
function exportOrdersCsv(orders: ChangeRequestItem[]) {
  const header = [
    tx("dashboard.axborot_tizimi"), tx("dashboard.talab_mazmuni"), tx("dashboard.muddat"),
    tx("dashboard.holati"), tx("dashboard.masul_shaxs_pm"), tx("dashboard.yaratilgan"),
  ];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = orders.map((o) => [
    o.project_detail?.name || o.system_name || "",
    o.requested_change || o.current_state || "",
    o.pm_deadline || o.due_date ? fmtDate(o.pm_deadline || o.due_date) : "",
    o.status_display || o.status,
    o.assigned_pm_name || "",
    fmtDate(o.created_at || o.request_date),
  ]);
  const csv = [header, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `buyurtmalar_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
/** Boshqarma foydalanuvchisi uchun to'liq bosh panel ko'rinishi (yangi UX dizayn) */
function DepartmentDashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState<DashboardPeriod | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<OrderMetric | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [pmFilter, setPmFilter] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"-request_date" | "request_date">("-request_date");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [openOrderId, setOpenOrderId] = useState<number | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  useEffect(() => {
    if (openMenuId === null) return;
    const close = () => setOpenMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openMenuId]);
  const scrollToOrders = () => {
    const el = document.getElementById("department-orders-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  const { data: stats, reload: reloadStats } = useFetch<OrderStats>("/orders/stats/", { mine: 1 });
  const { data: usersData } = useFetch<{ count: number; results: UserBrief[] } | UserBrief[]>(
    "/users/", { is_active: true, page_size: 200 }
  );
  /** «Barcha loyiha menejerlari» tanlagichi — sohaviy vakil emas, PM yoki boshqaruvchi rol. */
  const pmList = useMemo(() => {
    const list = usersData ? listOf<UserBrief>(usersData) : [];
    return list.filter((u) => {
      if (u.is_sohaviy_boshqarma || u.specialty === "SOHAVIY" || u.global_role === "SOHAVIY") return false;
      if (u.global_role === "MANAGER" || u.is_manager || u.specialty === "PM") return true;
      if (u.global_role === "BOSS" || u.is_boss || u.global_role === "ADMIN" || u.is_platform_admin) return true;
      return false;
    });
  }, [usersData]);
  const queryParams = useMemo(() => {
    const p: Record<string, string | number> = { mine: 1, page_size: 20, ordering: `${sortOrder},-id` };
    if (selectedPeriod) p.period = selectedPeriod;
    if (selectedMetric) p.metric = selectedMetric;
    if (statusFilter) p.status = statusFilter;
    if (pmFilter) p.assigned_pm = pmFilter;
    if (searchQuery.trim()) p.search = searchQuery.trim();
    return p;
  }, [selectedPeriod, selectedMetric, statusFilter, pmFilter, sortOrder, searchQuery]);
  const { data: ordersData, loading: ordersLoading, reload: reloadOrders } = useFetch<
    PaginatedResponse<ChangeRequestItem> | ChangeRequestItem[]
  >("/orders/", queryParams);
  useDebouncedLive((e) => {
    if (
      e.event === "notification" ||
      e.event === "order.create" ||
      e.event === "order.update" ||
      e.event === "order.delete"
    ) {
      reloadStats();
      reloadOrders();
    }
  }, 800);
  const readyForReviewCount = stats?.ready_for_review ?? 0;
  const orders = useMemo(() => {
    if (!ordersData) return [];
    return listOf<ChangeRequestItem>(ordersData);
  }, [ordersData]);
  const periods: OrderPeriodRow[] = stats?.periods || [];

  const handleOpenReviewOrder = async () => {
    setStatusFilter("READY_FOR_REVIEW");
    const cached = orders.find((o) => o.status === "READY_FOR_REVIEW");
    if (cached) {
      setOpenOrderId(cached.id);
      return;
    }
    try {
      const res = await api.get<PaginatedResponse<ChangeRequestItem>>("/orders/", {
        mine: 1,
        status: "READY_FOR_REVIEW",
        page_size: 1,
      });
      const items = listOf<ChangeRequestItem>(res);
      if (items.length > 0 && items[0]) {
        setOpenOrderId(items[0].id);
      } else {
        scrollToOrders();
      }
    } catch {
      scrollToOrders();
    }
  };
  /** Davr kartasi ustiga bosilganda — shu davrning HAMMASI (metrikasiz). */
  const pickPeriod = (period: DashboardPeriod) => {
    if (selectedPeriod === period && !selectedMetric) {
      setSelectedPeriod(null);
    } else {
      setSelectedPeriod(period);
      setSelectedMetric(null);
      setStatusFilter("");
      scrollToOrders();
    }
  };
  /** Katakdagi to'rtta ko'rsatkichdan biri bosilganda. */
  const pickMetric = (period: DashboardPeriod, metric: OrderMetric) => {
    if (selectedPeriod === period && selectedMetric === metric) {
      setSelectedPeriod(null);
      setSelectedMetric(null);
    } else {
      setSelectedPeriod(period);
      setSelectedMetric(metric);
      setStatusFilter("");
      scrollToOrders();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40 }}>
      {readyForReviewCount > 0 && (
        <div
          role="button"
          tabIndex={0}
          style={{
            background: "var(--attention-soft)",
            border: "1px solid var(--attention-border)",
            borderRadius: 14,
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            cursor: "pointer",
            boxShadow: "var(--shadow-xs)",
          }}
          onClick={() => void handleOpenReviewOrder()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              void handleOpenReviewOrder();
            }
          }}
        >
          <div>
            <div style={{ fontWeight: 700, color: "var(--attention)", fontSize: 14 }}>
              {tx("dashboard.boshqarma_tasdigida")} ({readyForReviewCount})
            </div>
            <div style={{ fontSize: 12.5, marginTop: 2, color: "var(--attention)" }}>
              {tx("dashboard.boshqarma_tasdigida_izoh")}
            </div>
          </div>
          <Button
            variant="primary" size="sm"
            onClick={(e) => {
              e.stopPropagation();
              void handleOpenReviewOrder();
            }}
          >
            {tx("dashboard.korish")} →
          </Button>
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 16,
        }}
      >
        {periods.map((p) => {
          const theme = PERIOD_THEMES[p.key] || PERIOD_THEMES.year;
          const isPeriodSelected = selectedPeriod === p.key;
          return (
            <div
              key={p.key}
              style={{
                background: theme.cardBg,
                borderRadius: 16,
                border: `1px solid ${isPeriodSelected ? theme.iconColor : theme.cardBorder}`,
                boxShadow: isPeriodSelected ? "var(--shadow-md)" : "var(--shadow-sm)",
                padding: "20px 22px",
                transition: "box-shadow 0.15s ease, border-color 0.15s ease",
              }}
            >
              <div
                onClick={() => pickPeriod(p.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                }}
                title={tx("orders.davr_buyurtmalarini_korish", { davr: theme.title })}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: "var(--surface)",
                      color: theme.iconColor,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      boxShadow: "var(--shadow-xs)",
                    }}
                  >
                    <CalendarIcon size={22} color={theme.iconColor} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--text)" }}>
                      {theme.title}
                    </h3>
                    <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "2px 0 0" }}>
                      {fmtDate(p.since)} – {tx("dashboard.bugun")}
                    </p>
                  </div>
                </div>
                <div style={{ color: isPeriodSelected ? theme.iconColor : "var(--border-strong)", display: "flex", alignItems: "center" }}>
                  <ChevronRightIcon size={18} />
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  marginTop: 18,
                  paddingTop: 16,
                  borderTop: `1px solid ${theme.cardBorder}`,
                  gap: 6,
                }}
              >
                {METRIC_TILES.map((tile) => {
                  const value = metricValue(p, tile.metric);
                  const active = selectedPeriod === p.key && selectedMetric === tile.metric;
                  return (
                    <button
                      type="button"
                      key={tile.metric}
                      onClick={(e) => {
                        e.stopPropagation();
                        pickMetric(p.key, tile.metric);
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        borderBottom: `2px solid ${active ? tile.color : "transparent"}`,
                        padding: "2px 4px 8px",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                      title={`${theme.title} — ${METRIC_LABELS[tile.metric]} (${value})`}
                    >
                      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, marginBottom: 4 }}>
                        {METRIC_LABELS[tile.metric]}
                      </div>
                      <div style={{ fontSize: 21, fontWeight: 750, color: value ? tile.color : "var(--subtle)", lineHeight: 1.1 }}>
                        {value}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div id="department-orders-section" style={{ scrollMarginTop: 24 }}>
        <div className="row between middle" style={{ flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "var(--text)" }}>
              {selectedMetric ? METRIC_TITLES[selectedMetric] : tx("dashboard.buyurtmalar")}
            </h2>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>
              ({orders.length} {tx("common.ta")})
            </span>
            {selectedPeriod && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "var(--primary-soft)",
                  color: "var(--primary)",
                  borderRadius: 9999,
                  padding: "4px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  border: "1px solid var(--primary-border)",
                }}
              >
                <span>{PERIOD_THEMES[selectedPeriod]?.title}</span>
                {selectedMetric && (
                  <span style={{ opacity: 0.85 }}>
                    / <strong>{METRIC_LABELS[selectedMetric]}</strong>
                  </span>
                )}
                <button
                  type="button"
                  className="chip-x"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPeriod(null);
                    setSelectedMetric(null);
                  }}
                  title={tx("common.filtrni_tozalash")}
                  aria-label={tx("common.filtrni_tozalash")}
                >
                  ✕
                </button>
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 260px", minWidth: 220, maxWidth: 340 }}>
            <span
              style={{
                position: "absolute",
                left: 14,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--muted)",
                display: "flex",
                alignItems: "center",
                pointerEvents: "none",
              }}
            >
              <SearchIcon size={16} />
            </span>
            <input
              type="search"
              placeholder={tx("dashboard.qidiruv_placeholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                height: 42,
                borderRadius: 10,
                border: "1px solid var(--border)",
                padding: "8px 14px 8px 38px",
                fontSize: 13.5,
                background: "var(--surface)",
                color: "var(--text)",
                outline: "none",
                transition: "border-color 0.15s ease",
              }}
            />
          </div>
          <div style={{ position: "relative", minWidth: 170 }}>
            <div
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--muted)",
                display: "flex",
                alignItems: "center",
                pointerEvents: "none",
              }}
            >
              <FilterIcon size={14} />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                height: 42,
                width: "100%",
                borderRadius: 10,
                border: "1px solid var(--border)",
                padding: "0 14px 0 34px",
                fontSize: 13,
                background: "var(--surface)",
                color: "var(--text)",
                fontWeight: 500,
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="">{tx("dashboard.barcha_holatlar", undefined, "Barcha holatlar")}</option>
              <option value="NEW">{tx("orders.status_yangi", undefined, "Yangi")}</option>
              <option value="ACCEPTED">{tx("orders.status_qabul_qilindi", undefined, "Qabul qilindi")}</option>
              <option value="REJECTED">{tx("orders.status_rad_etildi", undefined, "Rad etildi")}</option>
            </select>
          </div>
          {pmList.length > 0 && (
            <div style={{ position: "relative", minWidth: 210 }}>
              <select
                value={pmFilter}
                onChange={(e) => setPmFilter(e.target.value)}
                style={{
                  height: 42,
                  width: "100%",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  padding: "0 14px",
                  fontSize: 13,
                  background: "var(--surface)",
                  color: "var(--text)",
                  fontWeight: 500,
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                <option value="">{tx("dashboard.barcha_loyiha_menejerlari")}</option>
                {pmList.map((u) => (
                  <option key={u.id} value={String(u.id)}>{u.full_name}</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ position: "relative", minWidth: 150 }}>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as "-request_date" | "request_date")}
              style={{
                height: 42,
                width: "100%",
                borderRadius: 10,
                border: "1px solid var(--border)",
                padding: "0 14px",
                fontSize: 13,
                background: "var(--surface)",
                color: "var(--text)",
                fontWeight: 500,
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="-request_date">{tx("common.sana", undefined, "Sana")}: {tx("dashboard.eng_yangi", undefined, "eng yangi")}</option>
              <option value="request_date">{tx("common.sana", undefined, "Sana")}: {tx("dashboard.eng_eski", undefined, "eng eski")}</option>
            </select>
          </div>
          <Button
            variant="secondary"
            onClick={() => exportOrdersCsv(orders)}
            disabled={!orders.length}
            title={tx("dashboard.eksport")}
          >
            {tx("dashboard.eksport")}
          </Button>
        </div>
        <div
          style={{
            background: "var(--surface)",
            borderRadius: 16,
            border: "1px solid var(--border)",
            overflow: "hidden",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          {ordersLoading && !orders.length ? (
            <div style={{ padding: 48, textAlign: "center" }}>
              <Loading text={tx("dashboard.panel_yuklanmoqda")} />
            </div>
          ) : orders.length === 0 ? (
            <div style={{ padding: "48px 20px", textAlign: "center" }}>
              <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", margin: "0 0 6px" }}>
                {tx("dashboard.talabnoma_topilmadi")}
              </h4>
              <p style={{ fontSize: 13, maxWidth: 420, margin: "0 auto 18px", color: "var(--muted)" }}>
                {tx("dashboard.talabnoma_topilmadi_izoh")}
              </p>
              <LinkButton
                to="/buyurtma/yangi"
                variant="primary" size="sm"
              >
                <IconPlus size={14} /> {tx("dashboard.birinchi_tz_yuborish")}
              </LinkButton>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table" style={{ width: "100%", borderCollapse: "collapse", margin: 0 }}>
                <thead>
                  <tr
                    style={{
                      background: "var(--surface-2)",
                      borderBottom: "1px solid var(--border)",
                      textAlign: "left",
                      fontSize: 12,
                      fontWeight: 650,
                      color: "var(--text-secondary)",
                    }}
                  >
                    <th style={{ width: 44, textAlign: "center", padding: "12px 14px" }}>№</th>
                    <th style={{ padding: "12px 14px" }}>{tx("dashboard.axborot_tizimi")}</th>
                    <th style={{ padding: "12px 14px" }}>{tx("dashboard.talab_mazmuni")}</th>
                    <th style={{ padding: "12px 14px" }}>{tx("dashboard.muddat")}</th>
                    <th style={{ padding: "12px 14px" }}>{tx("dashboard.holati")}</th>
                    <th style={{ padding: "12px 14px" }}>{tx("dashboard.masul_shaxs_pm")}</th>
                    <th style={{ padding: "12px 14px" }}>{tx("dashboard.yaratilgan")}</th>
                    <th style={{ width: 56, padding: "12px 14px" }}>{tx("dashboard.amallar")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o, idx) => {
                    const pmInitials = getAvatarInitials(o.assigned_pm_name || "");
                    return (
                      <tr
                        key={o.id}
                        onClick={() => setOpenOrderId(o.id)}
                        style={{
                          borderBottom: "1px solid var(--border-muted)",
                          transition: "background 0.1s ease",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--surface-2)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        <td
                          style={{
                            textAlign: "center",
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--muted)",
                            padding: "14px",
                          }}
                        >
                          {idx + 1}
                        </td>
                        <td style={{ padding: "14px", whiteSpace: "nowrap" }}>
                          <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}>
                            {o.project_detail?.name || o.system_name}
                          </div>
                          {o.module && (
                            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                              {o.module}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "14px", maxWidth: 300 }}>
                          <div
                            style={{
                              fontSize: 13,
                              color: "var(--text-secondary)",
                              lineHeight: 1.4,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                            }}
                            title={o.requested_change}
                          >
                            {o.requested_change}
                          </div>
                        </td>
                        <td style={{ padding: "14px", whiteSpace: "nowrap", fontSize: 12.5, color: "var(--text-secondary)" }}>
                          {o.pm_deadline || o.due_date ? (
                            fmtDate(o.pm_deadline || o.due_date)
                          ) : (
                            <span style={{ color: "var(--subtle)" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "14px", whiteSpace: "nowrap" }}>
                          {(() => {
                            const pill = dashboardStatusPill(o);
                            return (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  padding: "3px 10px",
                                  borderRadius: 9999,
                                  fontSize: 11.5,
                                  fontWeight: 600,
                                  background: pill.bg,
                                  color: pill.color,
                                }}
                              >
                                {pill.label}
                              </span>
                            );
                          })()}
                        </td>
                        <td style={{ padding: "14px", whiteSpace: "nowrap" }}>
                          {o.assigned_pm_name ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: "50%",
                                  background: "var(--primary-soft)",
                                  color: "var(--primary)",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              >
                                {pmInitials}
                              </div>
                              <div>
                                <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)" }}>
                                  {o.assigned_pm_name}
                                </div>
                                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                                  {tx("dashboard.loyiha_menejeri")}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: "var(--subtle)", fontSize: 13 }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "14px", whiteSpace: "nowrap", fontSize: 12.5, color: "var(--text-secondary)" }}>
                          {fmtDate(o.created_at || o.request_date)}
                        </td>
                        <td style={{ padding: "14px", textAlign: "center", position: "relative" }} onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost" size="sm" iconOnly
                            title={tx("dashboard.amallar")}
                            aria-label={tx("dashboard.amallar")}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(openMenuId === o.id ? null : o.id);
                            }}
                          >
                            <MoreIcon size={18} color="var(--muted)" />
                          </Button>
                          {openMenuId === o.id && (
                            <div
                              style={{
                                position: "absolute",
                                right: 14,
                                top: "100%",
                                marginTop: 4,
                                background: "var(--surface)",
                                border: "1px solid var(--border)",
                                borderRadius: 10,
                                boxShadow: "var(--shadow-lg)",
                                zIndex: 20,
                                minWidth: 220,
                                overflow: "hidden",
                                textAlign: "left",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className="combo-item"
                                style={{ width: "100%", textAlign: "left", padding: "10px 14px" }}
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setOpenOrderId(o.id);
                                }}
                              >
                                {tx("common.korish")}
                              </button>
                              <button
                                type="button"
                                className="combo-item"
                                style={{ width: "100%", textAlign: "left", padding: "10px 14px" }}
                                onClick={() => {
                                  setOpenMenuId(null);
                                  void downloadOrderDocx(o.id, String(o.id));
                                }}
                              >
                                {tx("dashboard.word_blankini_yuklab_olish")}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {openOrderId && (
        <Suspense fallback={null}>
          <OrderDetailModal
            orderId={openOrderId}
            onClose={() => {
              setOpenOrderId(null);
              reloadOrders();
              reloadStats();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
export default function Dashboard() {
  const { user } = useAuth();
  const go = useGo();
  const [picked, setPicked] = useState<Picked | null>(null);
  const isDepartmentUser = Boolean(
    user?.is_sohaviy_boshqarma ||
    user?.global_role === "SOHAVIY" ||
    user?.specialty === "SOHAVIY"
  );
  const { data: d, error, loading, reload } = useFetch<DashboardData>("/dashboard/");
  useDebouncedLive((e) => {
    if (e.event === "task.update" || e.event === "project.update") reload();
  }, 1500);
  const name = <strong>{tx("layout.bosh_panel")}</strong>;
  if (isDepartmentUser) {
    return (
      <>
        <PageHead
          title={name}
          subtitle={tx("dashboard.sahifa_tavsifi")}
          actions={
            <Button variant="primary" onClick={() => go(toNewOrder())}>
              <IconPlus size={16} /> {tx("orders.yangi_buyurtma")}
            </Button>
          }
        />
        <div className="content">
          <DepartmentDashboard />
        </div>
      </>
    );
  }
  if (loading) {
    return (
      <>
        <PageHead title={name} />
        <div className="content"><Loading text={tx("dashboard.panel_yuklanmoqda")} /></div>
      </>
    );
  }
  if (!d) {
    return (
      <>
        <PageHead title={name} />
        <div className="content">
          <ErrorMsg error={error || tx("dashboard.panelni_yuklab_bolmadi")} />
        </div>
      </>
    );
  }
  const isFresh =
    d.periods.every((p) => (p.todo ?? 0) === 0 && (p.overdue ?? 0) === 0 && (p.done ?? 0) === 0) &&
    (d.deadlines.late_done ?? 0) === 0 &&
    (d.deadlines.overdue ?? 0) === 0 &&
    (d.deadlines.waiting ?? 0) === 0;
  return (
    <>
      <PageHead
        title={name}
      />
      <div className="content">
        <div className="period-grid">
          {d.periods.map((p) => (
            <Band p={p} key={p.key} picked={picked} onPick={setPicked} />
          ))}
        </div>
        <Deadlines d={d.deadlines} picked={picked} onPick={setPicked} />
        {isFresh && !picked && (
          <div className="card mt" style={{ padding: "24px 20px", textAlign: "center" }}>
            <p className="muted" style={{ margin: "0 0 16px", fontSize: 14 }}>
              {tx("dashboard.boshlash_uchun_tavsiya")}
            </p>
            <div className="row" style={{ justifyContent: "center", gap: 10 }}>
              <LinkButton variant="primary" to="/loyihalar">
                {tx("dashboard.loyihalarga_otish")}
              </LinkButton>
              <LinkButton  to="/qoshilish">
                {tx("projects.loyiha_topish")}
              </LinkButton>
            </div>
          </div>
        )}
        {picked && (
          <div className="mt">
            <PickedTasks key={`${picked.period || ""}:${picked.metric}`}
                         picked={picked} onClose={() => setPicked(null)} />
          </div>
        )}
      </div>
    </>
  );
}
