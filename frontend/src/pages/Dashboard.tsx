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
import { Suspense, lazy, useId, useMemo, useState } from "react";
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
} from "@/api/types";
import type { PaginatedResponse } from "@/api/orders";
import { useAuth } from "@/auth/AuthContext";
import { useDebouncedLive } from "@/realtime/RealtimeContext";
import { PageHead } from "@/components/Layout";
import {
  AvatarStack, Card, DateField, Empty, ErrorMsg, Loading, Pager, Priority, StatusBadge, fmtDate, fmtDateTime,
} from "@/components/ui";
import { IconPlus } from "@/components/icons";
import TaskDrawer from "@/components/TaskDrawer";
import { toTask } from "@/nav";
import { tx } from "@/i18n";

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
          action={<button type="button" className="btn btn-sm" onClick={onClose}>{tx("common.yopish")}</button>}>
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
          <button type="button" className="btn" onClick={clear}>{tx("common.tozalash")}</button>
        )}
      </div>
      {loading ? <Loading /> : !tasks?.length ? (
        <Empty title={tx("dashboard.ish_yoq")}
               text={filtered
                 ? tx("dashboard.tanlangan_filtrga_mos_vazifa_topilmadi")
                 : tx("dashboard.bu_katakka_kirgan_vazifa_topilmadi")}>
          {filtered && (
            <button type="button" className="btn" onClick={clear}>{tx("common.filtrni_tozalash")}</button>
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
                            background: halfNum === 1 ? "var(--accent-bg, #eff6ff)" : "var(--warning-bg, #fef3c7)",
                            color: halfNum === 1 ? "var(--accent, #2563eb)" : "var(--warning, #d97706)",
                            border: `1px solid ${halfNum === 1 ? "rgba(37,99,235,0.2)" : "rgba(217,119,6,0.2)"}`,
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
function getStatusPill(status: string) {
  switch (status) {
    case "ACCEPTED":
      return { label: tx("dashboard.tasdiqlangan"), bg: "#f4f4f5", color: "#18181b", border: "#d4d4d8" };
    case "IN_PROGRESS":
    case "ASSIGNED_TO_DEV":
    case "TESTING":
      return { label: tx("dashboard.jarayonda"), bg: "#f4f4f5", color: "#18181b", border: "#d4d4d8" };
    case "COMPLETED":
      return { label: tx("dashboard.bajarilgan"), bg: "#18181b", color: "#ffffff", border: "#18181b" };
    case "NEW":
      return { label: tx("dashboard.kutilyapti"), bg: "#ffffff", color: "#52525b", border: "#a1a1aa", dashed: true };
    case "REJECTED":
      return { label: tx("dashboard.rad_etilgan"), bg: "#fafafa", color: "#71717a", border: "#e4e4e7" };
    case "READY_FOR_REVIEW":
      return { label: tx("dashboard.boshqarma_tasdigida"), bg: "#f4f4f5", color: "#18181b", border: "#18181b" };
    default:
      return { label: status, bg: "#fafafa", color: "#52525b", border: "#e4e4e7" };
  }
}
function getAvatarInitials(name: string) {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}
const PERIOD_THEMES: Record<
  DashboardPeriod,
  {
    iconBg: string;
    iconColor: string;
    title: string;
    activeBg: string;
  }
> = {
  year: {
    iconBg: "#fef3c7",
    iconColor: "#d97706",
    title: tx("dashboard.yil_boshidan"),
    activeBg: "#fffbeb",
  },
  month: {
    iconBg: "#e0e7ff",
    iconColor: "#4f46e5",
    title: tx("dashboard.oy_boshidan"),
    activeBg: "#eef2ff",
  },
  week: {
    iconBg: "#d1fae5",
    iconColor: "#059669",
    title: tx("dashboard.hafta_boshidan"),
    activeBg: "#ecfdf5",
  },
};
/** Boshqarma foydalanuvchisi uchun to'liq bosh panel ko'rinishi (yangi UX dizayn) */
function DepartmentDashboard() {
  const { meta } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState<DashboardPeriod | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<"submitted" | "approved" | "in_progress" | "completed" | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [openOrderId, setOpenOrderId] = useState<number | null>(null);
  const scrollToOrders = () => {
    const el = document.getElementById("department-orders-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  const { data: stats, reload: reloadStats } = useFetch<OrderStats>("/orders/stats/", { mine: 1 });
  const queryParams = useMemo(() => {
    const p: Record<string, string | number> = { mine: 1, page_size: 20, ordering: "-request_date,-id" };
    if (selectedPeriod) p.period = selectedPeriod;
    if (selectedMetric) p.metric = selectedMetric;
    if (statusFilter) p.status = statusFilter;
    if (searchQuery.trim()) p.search = searchQuery.trim();
    return p;
  }, [selectedPeriod, selectedMetric, statusFilter, searchQuery]);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40 }}>
      {readyForReviewCount > 0 && (
        <div
          role="button"
          tabIndex={0}
          style={{
            background: "#fffbeb",
            border: "1px solid #fcd34d",
            borderRadius: 12,
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            cursor: "pointer",
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
            <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 13.5 }}>
              {tx("dashboard.boshqarma_tasdigida")} ({readyForReviewCount})
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 1, color: "#64748b" }}>
              {tx("dashboard.boshqarma_tasdigida_izoh")}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            style={{ background: "#0f172a", color: "#fff", border: "1px solid #0f172a", borderRadius: 6 }}
            onClick={(e) => {
              e.stopPropagation();
              void handleOpenReviewOrder();
            }}
          >
            {tx("dashboard.korish")} →
          </button>
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
          const isSelected = selectedPeriod === p.key;
          return (
            <div
              key={p.key}
              style={{
                background: isSelected ? theme.activeBg : "#fff",
                borderRadius: 14,
                border: isSelected ? `2px solid ${theme.iconColor}` : "1px solid #e2e8f0",
                boxShadow: isSelected
                  ? "0 4px 12px rgba(15,23,42,0.06)"
                  : "0 1px 3px rgba(0,0,0,0.02)",
                padding: "20px 22px",
                transition: "all 0.15s ease",
              }}
            >
              <div
                onClick={() => {
                  if (selectedPeriod === p.key && !selectedMetric) {
                    setSelectedPeriod(null);
                  } else {
                    setSelectedPeriod(p.key);
                    setSelectedMetric(null);
                    setStatusFilter("");
                    scrollToOrders();
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                }}
                title={tx("orders.davr_buyurtmalarini_korish", { davr: theme.title })}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: theme.iconBg,
                      color: theme.iconColor,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <CalendarIcon size={20} color={theme.iconColor} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: 0, color: "#0f172a" }}>
                      {theme.title}
                    </h3>
                    <p style={{ fontSize: 12, color: "#64748b", margin: "2px 0 0" }}>
                      {fmtDate(p.since)} – {tx("dashboard.bugun")}
                    </p>
                  </div>
                </div>
                <div style={{ color: isSelected ? "#0f172a" : "#cbd5e1", display: "flex", alignItems: "center" }}>
                  <ChevronRightIcon size={18} />
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  marginTop: 18,
                  paddingTop: 14,
                  borderTop: "1px solid #f4f4f5",
                  gap: 10,
                }}
              >
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedPeriod === p.key && selectedMetric === "submitted") {
                      setSelectedPeriod(null);
                      setSelectedMetric(null);
                    } else {
                      setSelectedPeriod(p.key);
                      setSelectedMetric("submitted");
                      setStatusFilter("");
                      scrollToOrders();
                    }
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    background:
                      selectedPeriod === p.key && selectedMetric === "submitted"
                        ? theme.iconColor
                        : "#ffffff",
                    border:
                      selectedPeriod === p.key && selectedMetric === "submitted"
                        ? `1px solid ${theme.iconColor}`
                        : "1px solid #e4e4e7",
                    boxShadow:
                      selectedPeriod === p.key && selectedMetric === "submitted"
                        ? "0 2px 8px rgba(0,0,0,0.15)"
                        : "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!(selectedPeriod === p.key && selectedMetric === "submitted")) {
                      e.currentTarget.style.background = "#f4f4f5";
                      e.currentTarget.style.borderColor = "#d4d4d8";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!(selectedPeriod === p.key && selectedMetric === "submitted")) {
                      e.currentTarget.style.background = "#ffffff";
                      e.currentTarget.style.borderColor = "#e4e4e7";
                    }
                  }}
                  title={`${theme.title} — ${tx("dashboard.jami")} (${p.submitted ?? 0})`}
                >
                  <div
                    style={{
                      fontSize: 11.5,
                      color:
                        selectedPeriod === p.key && selectedMetric === "submitted"
                          ? "#ffffff"
                          : "#71717a",
                      fontWeight: 600,
                      marginBottom: 4,
                    }}
                  >
                    {tx("dashboard.jami")}
                  </div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 800,
                      color:
                        selectedPeriod === p.key && selectedMetric === "submitted"
                          ? "#ffffff"
                          : "#18181b",
                      lineHeight: 1.1,
                    }}
                  >
                    {p.submitted ?? 0}
                  </div>
                </div>
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedPeriod === p.key && (selectedMetric === "in_progress" || selectedMetric === "approved")) {
                      setSelectedPeriod(null);
                      setSelectedMetric(null);
                    } else {
                      setSelectedPeriod(p.key);
                      setSelectedMetric("in_progress");
                      setStatusFilter("");
                      scrollToOrders();
                    }
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    background:
                      selectedPeriod === p.key && (selectedMetric === "in_progress" || selectedMetric === "approved")
                        ? theme.iconColor
                        : "#ffffff",
                    border:
                      selectedPeriod === p.key && (selectedMetric === "in_progress" || selectedMetric === "approved")
                        ? `1px solid ${theme.iconColor}`
                        : "1px solid #e4e4e7",
                    boxShadow:
                      selectedPeriod === p.key && (selectedMetric === "in_progress" || selectedMetric === "approved")
                        ? "0 2px 8px rgba(0,0,0,0.15)"
                        : "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!(selectedPeriod === p.key && (selectedMetric === "in_progress" || selectedMetric === "approved"))) {
                      e.currentTarget.style.background = "#f4f4f5";
                      e.currentTarget.style.borderColor = "#d4d4d8";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!(selectedPeriod === p.key && (selectedMetric === "in_progress" || selectedMetric === "approved"))) {
                      e.currentTarget.style.background = "#ffffff";
                      e.currentTarget.style.borderColor = "#e4e4e7";
                    }
                  }}
                  title={`${theme.title} — ${tx("dashboard.tasdiqlangan_buyurtmalar")} (${p.in_progress ?? p.approved ?? 0})`}
                >
                  <div
                    style={{
                      fontSize: 11.5,
                      color:
                        selectedPeriod === p.key && (selectedMetric === "in_progress" || selectedMetric === "approved")
                          ? "#ffffff"
                          : "#71717a",
                      fontWeight: 600,
                      marginBottom: 4,
                    }}
                  >
                    {tx("dashboard.tasdiqlangan_buyurtmalar")}
                  </div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 800,
                      color:
                        selectedPeriod === p.key && (selectedMetric === "in_progress" || selectedMetric === "approved")
                          ? "#ffffff"
                          : "#18181b",
                      lineHeight: 1.1,
                    }}
                  >
                    {p.in_progress ?? p.approved ?? 0}
                  </div>
                </div>
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedPeriod === p.key && selectedMetric === "completed") {
                      setSelectedPeriod(null);
                      setSelectedMetric(null);
                    } else {
                      setSelectedPeriod(p.key);
                      setSelectedMetric("completed");
                      setStatusFilter("");
                      scrollToOrders();
                    }
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    background:
                      selectedPeriod === p.key && selectedMetric === "completed"
                        ? theme.iconColor
                        : "#ffffff",
                    border:
                      selectedPeriod === p.key && selectedMetric === "completed"
                        ? `1px solid ${theme.iconColor}`
                        : "1px solid #e4e4e7",
                    boxShadow:
                      selectedPeriod === p.key && selectedMetric === "completed"
                        ? "0 2px 8px rgba(0,0,0,0.15)"
                        : "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!(selectedPeriod === p.key && selectedMetric === "completed")) {
                      e.currentTarget.style.background = "#f4f4f5";
                      e.currentTarget.style.borderColor = "#d4d4d8";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!(selectedPeriod === p.key && selectedMetric === "completed")) {
                      e.currentTarget.style.background = "#ffffff";
                      e.currentTarget.style.borderColor = "#e4e4e7";
                    }
                  }}
                  title={`${theme.title} — ${tx("dashboard.bajarilgan")} (${p.completed ?? 0})`}
                >
                  <div
                    style={{
                      fontSize: 11.5,
                      color:
                        selectedPeriod === p.key && selectedMetric === "completed"
                          ? "#ffffff"
                          : "#71717a",
                      fontWeight: 600,
                      marginBottom: 4,
                    }}
                  >
                    {tx("dashboard.bajarilgan_buyurtmalar")}
                  </div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 800,
                      color:
                        selectedPeriod === p.key && selectedMetric === "completed"
                          ? "#ffffff"
                          : "#18181b",
                      lineHeight: 1.1,
                    }}
                  >
                    {p.completed ?? 0}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div id="department-orders-section" style={{ scrollMarginTop: 24 }}>
        <div className="row between middle" style={{ flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: "#0f172a" }}>
              {selectedMetric === "approved"
                ? tx("dashboard.tasdiqlangan_buyurtmalar")
                : selectedMetric === "completed"
                ? tx("dashboard.bajarilgan_buyurtmalar")
                : selectedMetric === "submitted"
                ? tx("dashboard.jami_buyurtmalar")
                : tx("dashboard.buyurtmalar")}
            </h2>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "#64748b" }}>
              ({orders.length} {tx("common.ta")})
            </span>
            {selectedPeriod && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#f4f4f5",
                  color: "#18181b",
                  borderRadius: 20,
                  padding: "4px 12px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  border: "1px solid #e4e4e7",
                }}
              >
                <span>{PERIOD_THEMES[selectedPeriod]?.title}</span>
                {selectedMetric && (
                  <span style={{ color: "#71717a" }}>
                    /{" "}
                    <strong style={{ color: "#18181b" }}>
                      {selectedMetric === "approved"
                        ? tx("dashboard.tasdiqlangan")
                        : selectedMetric === "completed"
                        ? tx("dashboard.bajarilgan")
                        : tx("dashboard.jami")}
                    </strong>
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPeriod(null);
                    setSelectedMetric(null);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: "#71717a",
                    fontSize: 13,
                    fontWeight: 700,
                    marginLeft: 4,
                  }}
                  title={tx("common.filtrni_tozalash")}
                >
                  ✕
                </button>
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ position: "relative", width: 340, maxWidth: "100%" }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#94a3b8",
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
                height: 40,
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                padding: "8px 14px 8px 36px",
                fontSize: 13,
                background: "#fff",
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
                color: "#64748b",
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
                height: 40,
                width: "100%",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                padding: "0 14px 0 34px",
                fontSize: 13,
                background: "#fff",
                color: "#334155",
                fontWeight: 500,
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="">{tx("dashboard.barcha_holatlar")}</option>
              {(meta?.order_status || []).map((s) => (
                <option key={String(s.value)} value={String(s.value)}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            border: "1px solid #f1f5f9",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          {ordersLoading && !orders.length ? (
            <div style={{ padding: 40, textAlign: "center" }}>
              <Loading text={tx("dashboard.panel_yuklanmoqda")} />
            </div>
          ) : orders.length === 0 ? (
            <div style={{ padding: "48px 20px", textAlign: "center" }}>
              <h4 style={{ fontSize: 15, fontWeight: 600, color: "#18181b", margin: "0 0 6px" }}>
                {tx("dashboard.talabnoma_topilmadi")}
              </h4>
              <p className="muted" style={{ fontSize: 13, maxWidth: 420, margin: "0 auto 16px", color: "#71717a" }}>
                {tx("dashboard.talabnoma_topilmadi_izoh")}
              </p>
              <Link
                to="/buyurtma/yangi"
                className="btn btn-sm"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#18181b",
                  color: "#fff",
                  border: "1px solid #18181b",
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontWeight: 600,
                }}
              >
                <IconPlus size={14} /> {tx("dashboard.birinchi_tz_yuborish")}
              </Link>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table" style={{ width: "100%", borderCollapse: "collapse", margin: 0 }}>
                <thead>
                  <tr
                    style={{
                      background: "#fafafa",
                      borderBottom: "1px solid #e4e4e7",
                      textAlign: "left",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#71717a",
                    }}
                  >
                    <th style={{ width: 44, textAlign: "center", padding: "12px 14px" }}>№</th>
                    <th style={{ padding: "12px 14px" }}>{tx("dashboard.axborot_tizimi")}</th>
                    <th style={{ padding: "12px 14px" }}>{tx("dashboard.talab_mazmuni")}</th>
                    <th style={{ padding: "12px 14px" }}>{tx("dashboard.muddati")}</th>
                    <th style={{ padding: "12px 14px" }}>{tx("dashboard.holati")}</th>
                    <th style={{ padding: "12px 14px" }}>{tx("dashboard.masul_pm")}</th>
                    <th style={{ padding: "12px 14px" }}>{tx("dashboard.sanasi")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o, idx) => {
                    const pill = getStatusPill(o.status);
                    const pmInitials = getAvatarInitials(o.assigned_pm_name || "");
                    return (
                      <tr
                        key={o.id}
                        onClick={() => setOpenOrderId(o.id)}
                        style={{
                          borderBottom: "1px solid #f4f4f5",
                          transition: "background 0.1s ease",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#fafafa";
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
                            color: "#71717a",
                            padding: "14px",
                          }}
                        >
                          {idx + 1}
                        </td>
                        <td style={{ padding: "14px", whiteSpace: "nowrap" }}>
                          <div style={{ fontWeight: 600, fontSize: 13.5, color: "#18181b" }}>
                            {o.system_name}
                          </div>
                          {o.module && (
                            <div style={{ fontSize: 11.5, color: "#71717a", marginTop: 2 }}>
                              {o.module}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "14px", maxWidth: 300 }}>
                          <div
                            style={{
                              fontSize: 13,
                              color: "#3f3f46",
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
                        <td style={{ padding: "14px", whiteSpace: "nowrap", fontSize: 12.5, color: "#52525b" }}>
                          {o.pm_deadline || o.due_date ? (
                            fmtDate(o.pm_deadline || o.due_date)
                          ) : (
                            <span style={{ color: "#a1a1aa" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "14px", whiteSpace: "nowrap" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "4px 10px",
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              background: pill.bg,
                              color: pill.color,
                              border: `1px ${pill.dashed ? "dashed" : "solid"} ${pill.border}`,
                            }}
                          >
                            {pill.label}
                          </span>
                        </td>
                        <td style={{ padding: "14px", whiteSpace: "nowrap" }}>
                          {o.assigned_pm_name ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: "50%",
                                  background: "#18181b",
                                  color: "#ffffff",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {pmInitials}
                              </div>
                              <span style={{ fontSize: 12.5, fontWeight: 500, color: "#27272a" }}>
                                {o.assigned_pm_name}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: "#a1a1aa", fontSize: 13 }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "14px", whiteSpace: "nowrap", fontSize: 12.5, color: "#52525b" }}>
                          {o.request_date ? (
                            fmtDate(o.request_date)
                          ) : (
                            <span style={{ color: "#a1a1aa" }}>—</span>
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
        <PageHead title={name} />
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
              <Link className="btn btn-primary" to="/loyihalar">
                {tx("dashboard.loyihalarga_otish")}
              </Link>
              <Link className="btn" to="/qoshilish">
                {tx("projects.loyiha_topish")}
              </Link>
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
