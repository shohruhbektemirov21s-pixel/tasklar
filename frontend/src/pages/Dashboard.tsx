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
import { useId, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type {
  ChangeRequestItem,
  DashboardData,
  DashboardPeriod,
  DashboardPeriodRow,
  DashboardScope,
  OrderPeriodRow,
  OrderStats,
  Task,
} from "@/api/types";
import { ORDER_STATUS_CONFIG, ORDER_TYPE_CONFIG, type PaginatedResponse } from "@/api/orders";
import { useAuth } from "@/auth/AuthContext";
import { useDebouncedLive } from "@/realtime/RealtimeContext";
import { PageHead } from "@/components/Layout";
import {
  AvatarStack, Card, Empty, ErrorMsg, Loading, Pager, Priority, StatusBadge, fmtDate,
} from "@/components/ui";
import { IconPlus } from "@/components/icons";
import TaskDrawer from "@/components/TaskDrawer";
import { toOrder, toTask } from "@/nav";
import { tx } from "@/i18n";

// Davr sarlavhalari. Kalitlar serverdagi `PERIODS` bilan bir xil, tartibni
// esa server beradi - bu yerda faqat o'zbekcha nomi turadi.
const LABELS: Record<DashboardPeriod, string> = {
  year: tx("dashboard.yil_boshidan"),
  month: tx("dashboard.oy_boshidan"),
  week: tx("dashboard.hafta_boshidan"),
};

/**
 * Raqamlar KIMNIKI ekani yozib qo'yiladi.
 *
 * Ilgari panel faqat odamning o'ziga biriktirilgan ishlarini sanardi va
 * menejer loyihasida ikkita ochiq ish tursa ham «0» ko'rardi. Endi qamrov
 * rolga qarab kengayadi - lekin buni AYTIB qo'ymasak, «bu mening ishimmi
 * yoki jamoanikimi» degan savol javobsiz qolardi.
 */
const SCOPE_LABELS: Record<DashboardScope, string> = {
  all: tx("dashboard.butun_tizim_boyicha"),
  managed: tx("dashboard.boshqaruvingizdagi_loyihalar_boyicha"),
  mine: tx("dashboard.sizga_biriktirilgan_ishlar_boyicha"),
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
  // Sarlavha bosilsa - BUTUN taxta: nazoratdagi, muddati o'tgan va
  // bajarilgan ishlar bitta ro'yxatda. Katakning o'zi bosilsa - faqat
  // o'sha ustun.
  //
  // Ya'ni «yil boshidan nima bo'ldi» degan savolga uchta katakni navbat
  // bilan bosmasdan javob olinadi. Shart serverda ham bitta joyda
  // (`panel_metric_q` dagi `period`) - sanoq bilan ro'yxat ajralib
  // ketmasin.
  //
  // Ro'yxatdagi son uchta katakning YIG'INDISI bo'lmasligi mumkin va bu
  // to'g'ri: bitta ish ham «nazoratda», ham «muddati o'tgan» bo'lishi
  // mumkin, ro'yxatda esa u bir marta turadi.
  const hasAny = Boolean(p.todo || p.overdue || p.done);

  const pickBand = () => {
    if (!hasAny) return;
    onPick({ period: p.key, metric: "period",
             title: tx("dashboard.davr_hammasi", { davr: LABELS[p.key] }) });
  };

  return (
    <section className="stat-band">
      {/* `<header>` `<button>` ga aylantirilmadi: ichida `<h2>` va `<p>` bor,
          ular tugma ichida yaroqsiz. Shuning uchun tugma ROLI beriladi -
          klaviatura bilan ham ochiladi. */}
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
        {/* Qaysi sanadan sanalayotgani ko'rinib tursin - «yil boshidan»
            degani odamga aniq kunni aytmaydi. */}
        <p className="stat-band-since">{fmtDate(p.since)} {tx("dashboard.bugun")}</p>
      </header>

      <div className="stat-band-row">
        {COLUMNS.map((col) => {
          const active = picked?.period === p.key && picked?.metric === col.key;
          return (
            // Katak BOSILADI: raqamni ko'rgan odam "bu qaysi ishlar?" degan
            // savolni sahifani tark etmasdan ochadi. Nol bo'lsa bosilmaydi -
            // bo'sh ro'yxat ochish faqat chalg'itadi.
            <button type="button" key={col.key} title={col.hint}
                    className={`stat-band-cell ${p[col.key] ? "pickable" : ""}`
                               + (active ? " picked" : "")}
                    disabled={!p[col.key]}
                    onClick={() => onPick({
                      period: p.key, metric: col.key,
                      title: tx("dashboard.davr_ustun", { davr: LABELS[p.key], ustun: col.label }),
                    })}>
              {/* Nol - so'ngan rangda: bo'sh katak ko'zni tortmasin,
                  haqiqiy son esa darrov ajralib tursin. */}
              <span className={`v ${p[col.key] ? "" : "zero"}`}>{p[col.key]}</span>
              <span className="k">{col.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// Muddat kartalari serverdagi ko'rsatkich nomiga moslanadi: kartaning
// kaliti «overdue», endpointda esa «overdue_now» (davr katagidagi
// «overdue» dan farqli - bu butun tarix bo'yicha).
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
  search: "", due: "", status: "", project: "",
};
type Filters = typeof EMPTY_FILTERS;
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
  // Yopiq turganda maydonda TANLANGANI ko'rinadi, ochilganda - yozilgani.
  const text = open ? q : (chosen?.name || "");

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
             // Fokus tushganda maydon bo'shaydi: tanlangan ismning ustiga
             // yozib o'tirmasdan darrov yangisini izlash mumkin bo'lsin.
             onFocus={() => { setQ(""); setOpen(true); }}
             onBlur={() => setOpen(false)}
             onKeyDown={(e) => {
               if (e.key === "Escape") { setQ(""); setOpen(false); }
             }} />
      {open && (
        // `mousedown` to'xtatiladi: aks holda bosish paytida maydon fokusni
        // yo'qotib, ro'yxat `click` yetib kelgunicha yopilib ketardi.
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
  // Tortmada ochiq turgan vazifa. Yozuvning O'ZI saqlanadi, `id` emas:
  // ro'yxat allaqachon to'liq javobni olgan, ya'ni tortma uchun bazaga
  // qaytadan borish shart emas.
  const [open, setOpen] = useState<Task | null>(null);
  const [f, setF] = useState<Filters>(EMPTY_FILTERS);
  // Sahifa filtrdan ALOHIDA holatda: filtr o'zgarganda u birinchi sahifaga
  // qaytadi (`set` da), aks holda odam beshinchi sahifada turib qidiruv
  // yozsa bo'sh ekranga urilardi - natija ikki sahifaga sig'ib qolgan.
  const [page, setPage] = useState(1);
  const filtered = Object.values(f).some(Boolean);

  // Qidiruv va sahifalash SERVERDA: ekrandagi qatorlar ustida emas.
  // Ro'yxat sahifalarga bo'lingan, ya'ni brauzerdagi filtr faqat joriy
  // o'n beshtasini elasa, qolgan sahifalarda turgan natija «topilmadi»
  // bo'lib ko'rinardi.
  //
  // `debounceMs` - har bosilgan harf uchun so'rov ketmasin: "arxitektura"
  // so'zi 12 ta so'rov tug'dirardi.
  const { data, loading } = useFetch<PanelTasksData>("/dashboard/tasks/",
    { period: picked.period || "", metric: picked.metric, page, ...f },
    { debounceMs: 300 });
  const tasks = data ? listOf<Task>(data) : null;

  const projectOptions: ComboOption[] = (data?.facets.projects || [])
    .map((p) => ({ value: String(p.id), name: p.name }));
  const set = (k: FilterKey, v: string) => {
    setPage(1);
    setF((prev) => ({ ...prev, [k]: v }));
  };
  const clear = () => { setPage(1); setF(EMPTY_FILTERS); };

  return (
    /* Ro'yxat va vazifa paneli yonma-yon: keng ekranda panel ro'yxatning
       o'ng yonida ochiladi va uni yopib qo'ymaydi (`app.css`,
       `.panel-split`). Shuning uchun `TaskDrawer` kartaning ICHIDA emas,
       yonida turadi. */
    <div className="panel-split">
    <Card title={picked.title} padded={false}
          badge={data ? <span className="badge">{data.count}</span> : undefined}
          action={<button type="button" className="btn btn-sm" onClick={onClose}>{tx("common.yopish")}</button>}>
      {/* Filtr qatori kartaning ICHIDA: u shu ro'yxatga tegishli, sahifaga
          emas - katak yopilsa filtr ham u bilan ketadi. */}
      <div className="filters filters-inline">
        <div className="f grow">
          <label htmlFor={fid + "-q"}>{tx("common.qidiruv")}</label>
          <input id={fid + "-q"} value={f.search} placeholder={tx("dashboard.kod_yoki_sarlavha")}
                 onChange={(e) => set("search", e.target.value)} />
        </div>
        <div className="f">
          <label htmlFor={fid + "-due"}>{tx("common.muddat")}</label>
          <select id={fid + "-due"} value={f.due}
                  onChange={(e) => set("due", e.target.value)}>
            <option value="">{tx("common.hammasi")}</option>
            {DUE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
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
        {/* Loyiha tanlagichi faqat tanlanadigan narsa bo'lganda ko'rinadi:
            bitta loyihali ro'yxatda u hech nimani o'zgartirmasdi, joyni
            esa egallardi. */}
        {projectOptions.length > 1 && (
          <Combo id={fid + "-pr"} label={tx("common.loyiha")} options={projectOptions}
                 value={f.project} onChange={(v) => set("project", v)}
                 placeholder={tx("dashboard.loyiha_nomini_yozing")} />
        )}
        {/* IJROCHI tanlagichi yo'q. Ro'yxat odamning O'Z kesimida ochiladi:
            ijrochida u doim bitta ismdan - o'zinikidan - iborat bo'lardi.
            Menejerga «kim nima qilyapti» uchun alohida sahifa bor
            («Vazifalar»), u shu ish uchun ancha qulay. */}
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
          <tbody>
            {tasks.map((t) => (
              /* Qator bosilganda SAHIFA ALMASHMAYDI - o'ng chetdan tortma
                 chiqadi (`components/TaskDrawer.tsx`). Sabab: bu ro'yxat
                 kesim, filtr va sahifa raqami bilan yig'ilgan; boshqa
                 sahifaga o'tib qaytilsa, hammasi qaytadan tanlanardi. */
              <tr className="clickable" key={t.id} onClick={() => setOpen(t)}>
                <td className="nowrap mono muted">{t.code}</td>
                <td>
                  {/* Havola `<a>` bo'lib qoladi: klaviatura yo'li ham,
                      «yangi oynada ochish» ham shu yerdan o'tadi. Oddiy
                      bosishda esa o'tish to'xtatiladi va tortma ochiladi -
                      modifikator bosilgan bosish brauzerga tegilmaydi. */}
                  <Link {...toTask(t.id)}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                          e.preventDefault();
                          e.stopPropagation();
                          setOpen(t);
                        }}>{t.title}</Link>
                  <br /><small className="muted">{t.project_name}</small>
                </td>
                <td className="nowrap"><StatusBadge task={t} /></td>
                <td className="nowrap"><Priority task={t} /></td>
                {/* Kim qilayotgani ro'yxatning o'zida ko'rinsin: ilgari buni
                    bilish uchun har bir vazifani birma-bir ochish kerak edi.
                    Ijrochisi yo'q bo'lsa `AvatarStack` chiziqcha qo'yadi. */}
                <td className="nowrap"><AvatarStack users={t.assignees} /></td>
                <td className="nowrap muted right">{fmtDate(t.due_date)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {/* Ro'yxat sahifalarga bo'lingan - qolgani jimgina qirqilmaydi. */}
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

/** Boshqarma buyurtmalari turi nishoni */
function DashboardOrderTypeBadge({ type }: { type?: string }) {
  const cfg = ORDER_TYPE_CONFIG[type || "NEW"] || ORDER_TYPE_CONFIG.NEW;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        whiteSpace: "nowrap",
      }}
      title={cfg.desc}
    >
      <span>{cfg.icon}</span>
      <span>{cfg.label}</span>
    </span>
  );
}

/** Boshqarma buyurtmalari holati nishoni */
function DashboardOrderStatusBadge({ status }: { status: ChangeRequestItem["status"] }) {
  const cfg = ORDER_STATUS_CONFIG[status] || ORDER_STATUS_CONFIG.NEW;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        whiteSpace: "nowrap",
      }}
      title={cfg.desc}
    >
      <span>{cfg.icon}</span>
      <span>{cfg.label}</span>
    </span>
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

function ListIcon({ size = 15, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function getSystemBadge(name: string) {
  const n = (name || "").toLowerCase();
  if (n.includes("doc") || n.includes("hujjat")) {
    return { bg: "#ecfdf5", color: "#059669", icon: "📄" };
  }
  if (n.includes("bux") || n.includes("hisob") || n.includes("moliya")) {
    return { bg: "#fff7ed", color: "#ea580c", icon: "⚙️" };
  }
  if (n.includes("cloud") || n.includes("bulut") || n.includes("server")) {
    return { bg: "#f0f9ff", color: "#0284c7", icon: "☁️" };
  }
  if (n.includes("baza") || n.includes("data") || n.includes("my3")) {
    return { bg: "#faf5ff", color: "#9333ea", icon: "🗄️" };
  }
  return { bg: "#eff6ff", color: "#2563eb", icon: "💻" };
}

function getStatusPill(status: string) {
  switch (status) {
    case "ACCEPTED":
      return { label: tx("dashboard.tasdiqlangan"), bg: "#dcfce7", color: "#15803d", dot: "#22c55e" };
    case "IN_PROGRESS":
    case "ASSIGNED_TO_DEV":
    case "TESTING":
      return { label: tx("dashboard.jarayonda"), bg: "#dbeafe", color: "#1d4ed8", dot: "#3b82f6" };
    case "COMPLETED":
      return { label: tx("dashboard.bajarilgan"), bg: "#f3e8ff", color: "#7e22ce", dot: "#a855f7" };
    case "NEW":
      return { label: tx("dashboard.kutilyapti"), bg: "#fef3c7", color: "#b45309", dot: "#f59e0b" };
    case "REJECTED":
      return { label: tx("dashboard.rad_etilgan"), bg: "#fee2e2", color: "#b91c1c", dot: "#ef4444" };
    case "READY_FOR_REVIEW":
      return { label: tx("dashboard.boshqarma_tasdigida"), bg: "#f5d0fe", color: "#86198f", dot: "#c026d3" };
    default:
      return { label: status, bg: "#f1f5f9", color: "#475569", dot: "#94a3b8" };
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
  }
> = {
  year: {
    iconBg: "#eff6ff",
    iconColor: "#2563eb",
    title: tx("dashboard.yil_boshidan"),
  },
  month: {
    iconBg: "#f0fdf4",
    iconColor: "#16a34a",
    title: tx("dashboard.oy_boshidan"),
  },
  week: {
    iconBg: "#faf5ff",
    iconColor: "#9333ea",
    title: tx("dashboard.hafta_boshidan"),
  },
};

/** Boshqarma foydalanuvchisi uchun to'liq bosh panel ko'rinishi (yangi UX dizayn) */
function DepartmentDashboard({ user }: { user: any }) {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState<DashboardPeriod | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<"submitted" | "approved" | "completed" | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const scrollToOrders = () => {
    const el = document.getElementById("department-orders-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const { data: stats, reload: reloadStats } = useFetch<OrderStats>("/orders/stats/", { mine: 1 });

  const queryParams = useMemo(() => {
    const p: Record<string, string | number> = { mine: 1, page_size: 20, ordering: "request_no" };
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

  const total = stats?.total ?? 0;
  const inProgressCount =
    (stats?.in_progress ?? 0) + (stats?.assigned_to_dev ?? 0) + (stats?.testing ?? 0);
  const completed = stats?.completed ?? 0;
  const readyForReviewCount = stats?.ready_for_review ?? 0;

  const orders = useMemo(() => {
    if (!ordersData) return [];
    return listOf<ChangeRequestItem>(ordersData);
  }, [ordersData]);

  const defaultSince = new Date().toISOString();
  const periods: OrderPeriodRow[] = stats?.periods || [
    {
      key: "year",
      since: defaultSince,
      submitted: total,
      approved: inProgressCount + completed,
      completed: completed,
      rejected: stats?.rejected ?? 0,
    },
    {
      key: "month",
      since: defaultSince,
      submitted: total,
      approved: inProgressCount + completed,
      completed: completed,
      rejected: stats?.rejected ?? 0,
    },
    {
      key: "week",
      since: defaultSince,
      submitted: total,
      approved: inProgressCount + completed,
      completed: completed,
      rejected: stats?.rejected ?? 0,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40 }}>
      {/* Yuqori o'ng tugmalar: Yangi TZ yuborish & Barcha buyurtmalar */}
      <div className="row end middle" style={{ gap: 12 }}>
        <Link
          to="/buyurtma/yangi"
          className="btn btn-primary"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 18px",
            borderRadius: 8,
            fontSize: 13.5,
            fontWeight: 600,
            background: "#2563eb",
            color: "#fff",
            boxShadow: "0 1px 3px rgba(37,99,235,0.2)",
          }}
        >
          <IconPlus size={15} /> {tx("dashboard.yangi_tz_yuborish")}
        </Link>
        <Link
          to="/buyurtmalar"
          className="btn btn-outline"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 18px",
            borderRadius: 8,
            fontSize: 13.5,
            fontWeight: 600,
            background: "#fff",
            borderColor: "#e2e8f0",
            color: "#334155",
          }}
        >
          <ListIcon size={15} color="#64748b" /> {tx("dashboard.barcha_buyurtmalar")}
        </Link>
      </div>

      {/* Agar Boshqarma tasdiqlashi kutilayotgan ishlar bo'lsa ogohlantiruvchi kartochka */}
      {readyForReviewCount > 0 && (
        <div
          style={{
            background: "rgba(168, 85, 247, 0.08)",
            border: "1px solid rgba(168, 85, 247, 0.3)",
            borderRadius: 12,
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 22 }}>📑</span>
            <div>
              <div style={{ fontWeight: 700, color: "#7e22ce", fontSize: 13.5 }}>
                {tx("dashboard.boshqarma_tasdigida")} ({readyForReviewCount})
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 1 }}>
                {tx("dashboard.boshqarma_tasdigida_izoh")}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => setStatusFilter("READY_FOR_REVIEW")}
          >
            {tx("dashboard.korish")} →
          </button>
        </div>
      )}

      {/* 3 ta Davriy Statistika kartasi (Yil boshidan, Oy boshidan, Hafta boshidan) */}
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
                background: "#fff",
                borderRadius: 16,
                border: isSelected ? "2px solid #2563eb" : "1px solid #f1f5f9",
                boxShadow: isSelected
                  ? "0 4px 12px rgba(37,99,235,0.08)"
                  : "0 1px 3px rgba(0,0,0,0.03)",
                padding: "20px 22px",
                transition: "all 0.15s ease",
              }}
            >
              {/* Tepa qator: Kvadrat taqvim + Sarlavha/Sana + Strelka */}
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
                title={`${theme.title} bo'yicha barcha buyurtmalarni ko'rish`}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: theme.iconBg,
                      color: theme.iconColor,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <CalendarIcon size={22} color={theme.iconColor} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#0f172a" }}>
                      {theme.title}
                    </h3>
                    <p style={{ fontSize: 12, color: "#94a3b8", margin: "2px 0 0" }}>
                      {fmtDate(p.since)} – {tx("dashboard.bugun")}
                    </p>
                  </div>
                </div>
                <div style={{ color: isSelected ? "#2563eb" : "#cbd5e1", display: "flex", alignItems: "center" }}>
                  <ChevronRightIcon size={18} />
                </div>
              </div>

              {/* Pastki qator: Jami, Tasdiqlangan, Bajarilgan (3 ta alohida mini-kartochka) */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  marginTop: 18,
                  paddingTop: 14,
                  borderTop: "1px solid #f1f5f9",
                  gap: 10,
                }}
              >
                {/* 1. Jami */}
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
                    borderRadius: 12,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    background:
                      selectedPeriod === p.key && selectedMetric === "submitted"
                        ? "#eff6ff"
                        : "#f8fafc",
                    border:
                      selectedPeriod === p.key && selectedMetric === "submitted"
                        ? "2px solid #2563eb"
                        : "1px solid #e2e8f0",
                    boxShadow:
                      selectedPeriod === p.key && selectedMetric === "submitted"
                        ? "0 3px 10px rgba(37,99,235,0.15)"
                        : "0 1px 2px rgba(0,0,0,0.02)",
                  }}
                  onMouseEnter={(e) => {
                    if (!(selectedPeriod === p.key && selectedMetric === "submitted")) {
                      e.currentTarget.style.background = "#eff6ff";
                      e.currentTarget.style.borderColor = "#bfdbfe";
                      e.currentTarget.style.transform = "translateY(-2px)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!(selectedPeriod === p.key && selectedMetric === "submitted")) {
                      e.currentTarget.style.background = "#f8fafc";
                      e.currentTarget.style.borderColor = "#e2e8f0";
                      e.currentTarget.style.transform = "none";
                    }
                  }}
                  title={`${theme.title} — ${tx("dashboard.jami")} (${p.submitted ?? 0})`}
                >
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "#64748b",
                      fontWeight: 600,
                      marginBottom: 4,
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#2563eb",
                        display: "inline-block",
                      }}
                    />
                    {tx("dashboard.jami")}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "#2563eb", lineHeight: 1.1 }}>
                    {p.submitted ?? 0}
                  </div>
                </div>

                {/* 2. Tasdiqlangan */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedPeriod === p.key && selectedMetric === "approved") {
                      setSelectedPeriod(null);
                      setSelectedMetric(null);
                    } else {
                      setSelectedPeriod(p.key);
                      setSelectedMetric("approved");
                      setStatusFilter("");
                      scrollToOrders();
                    }
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    background:
                      selectedPeriod === p.key && selectedMetric === "approved"
                        ? "#f0fdf4"
                        : "#f8fafc",
                    border:
                      selectedPeriod === p.key && selectedMetric === "approved"
                        ? "2px solid #16a34a"
                        : "1px solid #e2e8f0",
                    boxShadow:
                      selectedPeriod === p.key && selectedMetric === "approved"
                        ? "0 3px 10px rgba(22,163,74,0.15)"
                        : "0 1px 2px rgba(0,0,0,0.02)",
                  }}
                  onMouseEnter={(e) => {
                    if (!(selectedPeriod === p.key && selectedMetric === "approved")) {
                      e.currentTarget.style.background = "#f0fdf4";
                      e.currentTarget.style.borderColor = "#bbf7d0";
                      e.currentTarget.style.transform = "translateY(-2px)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!(selectedPeriod === p.key && selectedMetric === "approved")) {
                      e.currentTarget.style.background = "#f8fafc";
                      e.currentTarget.style.borderColor = "#e2e8f0";
                      e.currentTarget.style.transform = "none";
                    }
                  }}
                  title={`${theme.title} — ${tx("dashboard.tasdiqlangan")} (${p.approved ?? 0})`}
                >
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "#64748b",
                      fontWeight: 600,
                      marginBottom: 4,
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#16a34a",
                        display: "inline-block",
                      }}
                    />
                    {tx("dashboard.tasdiqlangan_buyurtmalar")}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "#16a34a", lineHeight: 1.1 }}>
                    {p.approved ?? 0}
                  </div>
                </div>

                {/* 3. Bajarilgan */}
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
                    borderRadius: 12,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    background:
                      selectedPeriod === p.key && selectedMetric === "completed"
                        ? "#faf5ff"
                        : "#f8fafc",
                    border:
                      selectedPeriod === p.key && selectedMetric === "completed"
                        ? "2px solid #9333ea"
                        : "1px solid #e2e8f0",
                    boxShadow:
                      selectedPeriod === p.key && selectedMetric === "completed"
                        ? "0 3px 10px rgba(147,51,234,0.15)"
                        : "0 1px 2px rgba(0,0,0,0.02)",
                  }}
                  onMouseEnter={(e) => {
                    if (!(selectedPeriod === p.key && selectedMetric === "completed")) {
                      e.currentTarget.style.background = "#faf5ff";
                      e.currentTarget.style.borderColor = "#e9d5ff";
                      e.currentTarget.style.transform = "translateY(-2px)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!(selectedPeriod === p.key && selectedMetric === "completed")) {
                      e.currentTarget.style.background = "#f8fafc";
                      e.currentTarget.style.borderColor = "#e2e8f0";
                      e.currentTarget.style.transform = "none";
                    }
                  }}
                  title={`${theme.title} — ${tx("dashboard.bajarilgan")} (${p.completed ?? 0})`}
                >
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "#64748b",
                      fontWeight: 600,
                      marginBottom: 4,
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#9333ea",
                        display: "inline-block",
                      }}
                    />
                    {tx("dashboard.bajarilgan_buyurtmalar")}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "#9333ea", lineHeight: 1.1 }}>
                    {p.completed ?? 0}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pastki qism: "Buyurtmalar" bo'limi */}
      <div id="department-orders-section" style={{ scrollMarginTop: 24 }}>
        <div className="row between middle" style={{ flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: "#0f172a" }}>
              {selectedMetric === "approved"
                ? `${tx("dashboard.tasdiqlangan")} buyurtmalar`
                : selectedMetric === "completed"
                ? `${tx("dashboard.bajarilgan")} buyurtmalar`
                : selectedMetric === "submitted"
                ? `${tx("dashboard.jami")} buyurtmalar`
                : tx("dashboard.buyurtmalar")}
            </h2>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "#64748b" }}>
              ({orders.length} ta)
            </span>
            {selectedPeriod && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#eff6ff",
                  color: "#2563eb",
                  borderRadius: 20,
                  padding: "4px 12px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  border: "1px solid #bfdbfe",
                }}
              >
                <span>📅 {PERIOD_THEMES[selectedPeriod]?.title}</span>
                {selectedMetric && (
                  <span
                    style={{
                      color:
                        selectedMetric === "approved"
                          ? "#16a34a"
                          : selectedMetric === "completed"
                          ? "#9333ea"
                          : "#2563eb",
                    }}
                  >
                    •{" "}
                    {selectedMetric === "approved"
                      ? tx("dashboard.tasdiqlangan")
                      : selectedMetric === "completed"
                      ? tx("dashboard.bajarilgan")
                      : tx("dashboard.jami")}
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
                    color: "#2563eb",
                    fontSize: 13,
                    fontWeight: 700,
                    marginLeft: 4,
                  }}
                  title="Filtrni olib tashlash"
                >
                  ✕
                </button>
              </span>
            )}
          </div>
        </div>

        {/* Qidiruv va Holat filtrlari satri */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          {/* Qidiruv input */}
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

          {/* Holat filtri dropdown */}
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
              <option value="ACCEPTED">{tx("dashboard.tasdiqlangan")}</option>
              <option value="IN_PROGRESS">{tx("dashboard.jarayonda")}</option>
              <option value="COMPLETED">{tx("dashboard.bajarilgan")}</option>
              <option value="NEW">{tx("dashboard.kutilyapti")}</option>
              <option value="REJECTED">{tx("dashboard.rad_etilgan")}</option>
              <option value="READY_FOR_REVIEW">{tx("dashboard.boshqarma_tasdigida")}</option>
            </select>
          </div>
        </div>

        {/* Jadval kartasi */}
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
              <div style={{ fontSize: 38, marginBottom: 12 }}>📝</div>
              <h4 style={{ fontSize: 15, fontWeight: 600, color: "#334155", margin: "0 0 6px" }}>
                {tx("dashboard.talabnoma_topilmadi")}
              </h4>
              <p className="muted" style={{ fontSize: 13, maxWidth: 420, margin: "0 auto 16px" }}>
                {tx("dashboard.talabnoma_topilmadi_izoh")}
              </p>
              <Link
                to="/buyurtma/yangi"
                className="btn btn-primary btn-sm"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
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
                      background: "#f8fafc",
                      borderBottom: "1px solid #e2e8f0",
                      textAlign: "left",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#64748b",
                    }}
                  >
                    <th style={{ width: 44, textAlign: "center", padding: "12px 14px" }}>№</th>
                    <th style={{ padding: "12px 14px" }}>{tx("dashboard.talabnoma_no")}</th>
                    <th style={{ padding: "12px 14px" }}>{tx("dashboard.axborot_tizimi")}</th>
                    <th style={{ padding: "12px 14px" }}>{tx("dashboard.talab_mazmuni")}</th>
                    <th style={{ padding: "12px 14px" }}>{tx("dashboard.muddati")}</th>
                    <th style={{ padding: "12px 14px" }}>{tx("dashboard.holati")}</th>
                    <th style={{ padding: "12px 14px" }}>{tx("dashboard.masul_pm")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o, idx) => {
                    const sysBadge = getSystemBadge(o.system_name);
                    const pill = getStatusPill(o.status);
                    const pmInitials = getAvatarInitials(o.assigned_pm_name || "");

                    return (
                      <tr
                        key={o.id}
                        onClick={() => navigate(toOrder(o.id).to)}
                        style={{
                          borderBottom: "1px solid #f8fafc",
                          transition: "background 0.1s ease",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#f8fafc";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        {/* 1. Tartib raqami */}
                        <td
                          style={{
                            textAlign: "center",
                            fontSize: 13,
                            fontWeight: 700,
                            color: "#0f172a",
                            padding: "14px",
                          }}
                        >
                          {idx + 1}
                        </td>

                        {/* 2. Talabnoma № va sana */}
                        <td style={{ padding: "14px", whiteSpace: "nowrap" }}>
                          <Link
                            {...toOrder(o.id)}
                            style={{
                              fontWeight: 700,
                              fontSize: 13.5,
                              color: "#2563eb",
                              textDecoration: "none",
                            }}
                          >
                            {o.request_no || `#${o.id}`}
                          </Link>
                          {o.request_date && (
                            <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>
                              {fmtDate(o.request_date)}
                            </div>
                          )}
                        </td>

                        {/* 3. Axborot tizimi */}
                        <td style={{ padding: "14px", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                background: sysBadge.bg,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 15,
                              }}
                            >
                              {sysBadge.icon}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>
                                {o.system_name}
                              </div>
                              {o.module && (
                                <div style={{ fontSize: 11.5, color: "#94a3b8" }}>{o.module}</div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 4. Talab mazmuni */}
                        <td style={{ padding: "14px", maxWidth: 300 }}>
                          <div
                            style={{
                              fontSize: 13,
                              color: "#334155",
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

                        {/* 5. Muddati */}
                        <td style={{ padding: "14px", whiteSpace: "nowrap", fontSize: 12.5, color: "#475569" }}>
                          {o.pm_deadline || o.due_date ? (
                            fmtDate(o.pm_deadline || o.due_date)
                          ) : (
                            <span style={{ color: "#cbd5e1" }}>—</span>
                          )}
                        </td>

                        {/* 6. Holati (Ovalsirangan badge nuqta bilan) */}
                        <td style={{ padding: "14px", whiteSpace: "nowrap" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "4px 12px",
                              borderRadius: 20,
                              fontSize: 12,
                              fontWeight: 600,
                              background: pill.bg,
                              color: pill.color,
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: pill.dot,
                              }}
                            />
                            {pill.label}
                          </span>
                        </td>

                        {/* 7. Mas'ul PM */}
                        <td style={{ padding: "14px", whiteSpace: "nowrap" }}>
                          {o.assigned_pm_name ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: "50%",
                                  background: "#60a5fa",
                                  color: "#fff",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {pmInitials}
                              </div>
                              <span style={{ fontSize: 12.5, fontWeight: 500, color: "#334155" }}>
                                {o.assigned_pm_name}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: "#cbd5e1", fontSize: 13 }}>—</span>
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
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [picked, setPicked] = useState<Picked | null>(null);

  // Faqat sohaviy boshqarmalar akkaunti uchun (PM, Admin yoki oddiy dasturchiga chiqmaydi)
  const isDepartmentUser = Boolean(
    user?.is_sohaviy_boshqarma ||
    user?.global_role === "SOHAVIY" ||
    user?.specialty === "SOHAVIY"
  );

  // Xato yutilmaydi: sabab ekranga chiqadi, aks holda sahifa abadiy
  // «Yuklanmoqda» da qolardi.
  const { data: d, error, loading, reload } = useFetch<DashboardData>("/dashboard/");

  // Jonli: vazifa yoki loyiha o'zgarsa raqamlar o'zini yangilaydi (debounce bilan himoyalangan).
  useDebouncedLive((e) => {
    if (e.event === "task.update" || e.event === "project.update") reload();
  }, 1500);

  // Nom yuklanayotganda ham turadi: aks holda paneldagi joyi bo'sh qolib,
  // ma'lumot kelgach sakrab paydo bo'lardi.
  const name = <strong>{tx("layout.bosh_panel")}</strong>;

  if (isDepartmentUser) {
    return (
      <>
        <PageHead title={name} />
        <div className="content">
          <DepartmentDashboard user={user} />
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

  return (
    <>
      <PageHead title={name} />

      <div className="content">
        <p className="scope-note">{SCOPE_LABELS[d.scope]}</p>

        <div className="period-grid">
          {d.periods.map((p) => (
            <Band p={p} key={p.key} picked={picked} onPick={setPicked} />
          ))}
        </div>
        <Deadlines d={d.deadlines} picked={picked} onPick={setPicked} />

        {picked && (
          <div className="mt">
            {/* `key` - boshqa katak bosilganda ro'yxat YANGIDAN
                yig'ilsin: aks holda oldingi katakda qo'yilgan filtr
                yangisiga o'tib, odam bo'sh ro'yxat ko'rardi. */}
            <PickedTasks key={`${picked.period || ""}:${picked.metric}`}
                         picked={picked} onClose={() => setPicked(null)} />
          </div>
        )}
      </div>
    </>
  );
}
