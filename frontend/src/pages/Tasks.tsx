import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFetch } from "@/api/useFetch";
import type { TeamWorkloadData, WorkloadRow, WorkloadStats } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { IconCalendar } from "@/components/icons";
import {
  Avatar, DUE_PERIODS, DateField, Empty, ErrorMsg, FilterBar, Loading, PageHeader, Pager, Progress,
  SpecialtyTag, fmtDate,
} from "@/components/ui";
import { toTask, toUser } from "@/nav";
import { tx } from "@/i18n";
import { Button, LinkButton } from "@/components/Button";

/**
 * «Vazifalar» - menejer va admin uchun alohida sahifa: kim nima qilayapti.
 *
 * NEGA ALOHIDA SAHIFA. Bu ro'yxat avval «Loyihalar» sahifasining ostida
 * turardi va uni ko'rish uchun loyiha kartalaridan oshib o'tish kerak
 * edi. Ikkovi ikki xil savolga javob beradi: «Loyihalar» - qaysi loyiha
 * qay ahvolda, bu yer esa - qaysi odam nima ustida ishlayapti. Shuning
 * uchun yon panelda o'z joyi bor.
 *
 * NEGA YIG'ILGAN. Avval har bir odamning hamma vazifasi ochiq turardi:
 * o'ttiz kishilik jamoada sahifa bir necha ekran pastga cho'zilib ketar,
 * "kimda nima bor" degan umumiy manzara esa yo'qolardi. Endi har bir odam
 * BITTA qator - ismi, mutaxassisligi va raqamlari. Vazifalar qator
 * bosilganda ochiladi, «Umumiy tarix» dagi kabi.
 *
 * KIMGA KO'RINADI. Faqat loyiha boshqaradigan odamga - yon panelda
 * ijrochiga bu havola umuman chizilmaydi, marshrut ham himoyalangan
 * (`App.tsx`). Serverda ham shunday: `/team/workload/` faqat
 * BOSHQARUVDAGI loyihalarni qaytaradi (`managed_projects_q`), ya'ni bu
 * yashirish emas, chegara.
 */
export default function Tasks() {
  const fid = useId();
  const { meta } = useAuth();
  // Filtrlar shu bo'limning ichida: manzilga ham, sahifa holatiga ham
  // yozilmaydi - yuqoridagi loyiha qidiruvi bilan chalkashmasin.
  const [f, setF] = useState({ search: "", project: "", period: "week", due_from: "", due_to: "", status: "" });
  // Bir vaqtda BITTA odam ochiq turadi: ikkitasi ochilsa ro'yxat yana
  // cho'zilib ketardi va yig'ishdan maqsad yo'qolardi.
  const [open, setOpen] = useState<number | null>(null);
  // Sahifa filtrdan alohida: filtr o'zgarganda birinchisiga qaytadi
  // (`set` da), aks holda beshinchi sahifada turgan odam qidiruv yozib
  // bo'sh ekranga urilardi.
  const [page, setPage] = useState(1);

  const fetchParams = useMemo(() => ({
    ...f,
    page,
  }), [f, page]);

  // Qidiruv har harfda emas, yozish to'xtagach ketadi.
  const { data, error, loading } = useFetch<TeamWorkloadData>(
    "/team/workload/", fetchParams, { debounceMs: 300 });

  const set = (k: keyof typeof f, v: string) => {
    // Filtr almashganda ochiq qator yopiladi: ro'yxat butunlay boshqa
    // odamlardan iborat bo'lishi mumkin.
    setOpen(null);
    setPage(1);
    // Davr va aniq sana bir-birini almashtiradi: ikkovi birga tanlangan
    // ekranda "qaysi biri ishlayapti?" degan savol tug'ilardi.
    setF((prev) => {
      const next = { ...prev, [k]: v };
      if (k === "period" && v) {
        next.due_from = "";
        next.due_to = "";
      } else if (k === "due_from") {
        next.period = "";
        // Boshlanish sanasi tugash sanasidan katta bo'lishiga yo'l qo'yilmaydi:
        if (v && next.due_to && v > next.due_to) {
          next.due_to = v;
        }
      } else if (k === "due_to") {
        next.period = "";
        // Tugash sanasi boshlanish sanasidan kichik bo'lishiga yo'l qo'yilmaydi:
        if (v && next.due_from && v < next.due_from) {
          next.due_from = v;
        }
      }
      return next;
    });
  };
  const clear = () => {
    setOpen(null);
    setPage(1);
    setF({ search: "", project: "", period: "week", due_from: "", due_to: "", status: "" });
  };
  const dirty = Boolean(f.search || f.project || f.period !== "week" || f.due_from || f.due_to || f.status);
  const rows = data?.developers || null;

  return (
    <div className="content wl" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader
        title={tx("common.vazifalar") || "Vazifalar"}
        subtitle="Jamoa yuklamasi va vazifalar ijrosi"
        breadcrumbs={[
          { label: tx("nav.bosh_sahifa") || "Bosh sahifa", href: "/" },
          { label: tx("common.vazifalar") || "Vazifalar" },
        ]}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!!data && <span className="badge" style={{ fontSize: 13, padding: "5px 12px" }}>{data.count} {tx("common.kishi")}</span>}
            <LinkButton variant="primary" size="sm" to="/loyiha/vazifa-yaratish">
              + {tx("common.yangi_vazifa", undefined, "Yangi vazifa")}
            </LinkButton>
          </div>
        }
      />

      <ErrorMsg error={error} />

      <FilterBar>
        <div className="filter-search-box" style={{ minWidth: 260 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>🔍</span>
          <input
            id={`${fid}-q`}
            value={f.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder={tx("tasks.ism_vazifa_kod_hir_75") || "Qidiruv (ism, vazifa, kod)..."}
          />
        </div>

        <div className="filter-select-box">
          <label>{tx("common.loyiha")}:</label>
          <select id={`${fid}-p`} value={f.project} onChange={(e) => set("project", e.target.value)}>
            <option value="">{tx("common.barcha_loyihalar") || "Barchasi"}</option>
            {(data?.projects || []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="filter-select-box">
          <label>{tx("common.davr")}:</label>
          <select id={`${fid}-r`} value={f.period} onChange={(e) => set("period", e.target.value)}>
            <option value="">{tx("tasks.barcha_muddatlar") || "Barchasi"}</option>
            {DUE_PERIODS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="filter-select-box">
          <label>{tx("common.sana_dan", undefined, "Dan")}:</label>
          <DateField
            id={`${fid}-df`}
            value={f.due_from}
            max={f.due_to || undefined}
            onChange={(v) => set("due_from", v)}
          />
        </div>

        <div className="filter-select-box">
          <label>{tx("common.sana_gacha", undefined, "Gacha")}:</label>
          <DateField
            id={`${fid}-dt`}
            value={f.due_to}
            min={f.due_from || undefined}
            onChange={(v) => set("due_to", v)}
          />
        </div>

        <div className="filter-select-box">
          <label>{tx("tasks.vazifa_holati") || "Holat"}:</label>
          <select id={`${fid}-t`} value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="">{tx("tasks.tugallanmaganlar") || "Tugallanmaganlar"}</option>
            {(meta?.task_status || []).map((s) => (
              <option key={s.value} value={String(s.value)}>{s.label}</option>
            ))}
          </select>
        </div>

        {dirty && (
          <Button
            variant="ghost" size="sm"
            onClick={clear}
            style={{ alignSelf: "flex-end" }}
          >
            {tx("common.tozalash")}
          </Button>
        )}
      </FilterBar>

        {loading ? <Loading /> : !rows ? null : !rows.length ? (
          <div className="card">
            <Empty icon="☺" title={tx("tasks.dasturchi_topilmadi")}
                   text={dirty
                     ? tx("tasks.tanlangan_filtrga_mos_ijrochi_yoq")
                     : tx("tasks.boshqaruvingizdagi_loyihalarda_hali_ijrochi_")}>
              <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 12 }}>
                {dirty ? (
                  <Button  onClick={clear}>
                    {tx("common.tozalash")}
                  </Button>
                ) : (
                  <LinkButton variant="primary" to="/loyihalar">
                    {tx("common.loyihalar")}
                  </LinkButton>
                )}
              </div>
            </Empty>
          </div>
        ) : (
          <div className="card">
            <div className="card-list">
              {rows.map((row) => (
                <DeveloperRow key={row.user.id} row={row} filtered={Boolean(f.status)}
                              open={open === row.user.id}
                              onToggle={() => setOpen(open === row.user.id ? null : row.user.id)} />
              ))}
            </div>
            {/* Sahifa raqamlari - faqat bo'linadigan narsa bo'lsa. Qator
                ochiq bo'lsa yopiladi: yangi sahifada u boshqa odamniki. */}
            {data && data.pages > 1 && (
              <div className="card-body pager-bar">
                <span className="muted">
                  {data.count} {tx("common.tadan")} {(data.page - 1) * data.page_size + 1}—
                  {Math.min(data.page * data.page_size, data.count)} {tx("common.tasi")}
                </span>
                <Pager page={data.page} pages={data.pages}
                       onPick={(n) => { setOpen(null); setPage(n); }} />
              </div>
            )}
          </div>
        )}
      </div>
  );
}

/**
 * Ijrochi qatorining XULOSASI: nechtasi bajarildi, nechtasi yo'q.
 *
 * NEGA KERAK. Yig'ilgan qatorda faqat «8 ta vazifa» turardi va u savolga
 * yarim javob berardi: sakkiztasi qanday ahvolda? Menejerga kerak bo'lgani
 * esa «nechtasi hali nazoratda, nechtasining muddati o'tgan, nechtasi
 * yopilgan» - qatorni ochmasdan.
 *
 * QAYSI UCHTASI DOIM TURADI. Nazoratda, muddati o'tgan va bajarilgan -
 * ular NOL bo'lganda ham yoziladi, chunki «bajarilgani yo'q» ham javob.
 * Qolganlari (jarayonda, tekshiruvda, tuzatish kerak, to'xtab qolgan)
 * faqat bor bo'lsa qo'shiladi: aks holda qator sakkizta nishondan iborat
 * bo'lib, o'qilmay qolardi.
 *
 * Sanoqlar SERVERDA hisoblanadi (`core/team.py`, `_summary`) va holat
 * filtridan tashqari hamma kesimga bo'ysunadi: «shu hafta» tanlansa foiz
 * ham shu haftaniki bo'ladi.
 */
function RowStats({ stats }: { stats: WorkloadStats }) {
  const extra: [string, number][] = [
    [tx("common.jarayonda"), stats.in_progress],
    [tx("common.tekshiruvda"), stats.review],
    [tx("tasks.tuzatish_kerak"), stats.changes_requested],
    [tx("tasks.toxtab_qolgan"), stats.blocked],
  ];
  return (
    // Uch ustunli setka: sanoqlar chapda (ismi bilan bir chiziqda), foiz
    // o'rtada, o'ng ustun esa bo'sh - u faqat muvozanat uchun. Ilgari
    // foiz `margin-left: auto` bilan o'ng chekkada osilib turardi va
    // orada butun ekran kengligicha bo'sh joy qolardi.
    <div className="wl-stats">
      <div className="wl-counts">
        <span className="wl-stat">{tx("common.nazoratda")} <b>{stats.todo}</b></span>
        {extra.filter(([, n]) => n > 0).map(([label, n]) => (
          <span key={label} className="wl-stat">{label} <b>{n}</b></span>
        ))}
        <span className={`wl-stat ${stats.overdue ? "bad" : ""}`}>
          {tx("common.muddati_otgan")} <b>{stats.overdue}</b>
        </span>
        <span className="wl-stat">{tx("common.bajarilgan")} <b>{stats.done}</b></span>
      </div>
      {/* Foiz - shu kesimdagi ishning qanchasi yopilgani. Maxrajda bekor
          qilinganlar yo'q: ular na bajarilgan, na kutilyapti. */}
      <span className="wl-percent">
        <Progress value={stats.done_percent} />
        <span className="mono">{stats.done}/{stats.total}</span>
        <b>{stats.done_percent}%</b>
      </span>
    </div>
  );
}

/**
 * Bitta ijrochi - yig'ilgan qator.
 *
 * Yig'ilgan holatda ham asosiy javob ko'rinib turadi: nechta ishi bor va
 * muddati o'tgani bormi. Ya'ni ochmasdan ham "kim band" ma'lum bo'ladi,
 * ochish esa "aynan nima ustida" uchun kerak.
 */
function DeveloperRow({ row, filtered, open, onToggle }: {
  row: WorkloadRow; filtered: boolean; open: boolean; onToggle: () => void;
}) {
  const u = row.user;
  const panelId = useId();
  return (
    <div>
      {/* Butun qator ochish tugmasi - kichik uchburchakni aniq nishonga
          olish shart emas. Bu SICHQONCHA uchun qulaylik.

          KLAVIATURA UCHUN ALOHIDA TUGMA. Bu yerda ichki havola boshqa
          joyga (profilga) olib boradi, ya'ni qatorni ochadigan yagona yo'l
          `onClick` edi - va u klaviaturaga berilmagan. Ya'ni faqat
          klaviatura bilan ishlaydigan odam ijrochining vazifalarini
          UMUMAN ocholmasdi. Uchburchak endi haqiqiy `<button>`:
          `aria-expanded` holatni aytadi, `aria-controls` esa qaysi
          bo'limni ochishini. */}
      <div className="repo-item clickable" onClick={onToggle}>
        <div className="row wrap">
          <Avatar user={u} />
          <h3 style={{ margin: 0 }}>
            <Link {...toUser(u.id)} onClick={(e) => e.stopPropagation()}>{u.full_name}</Link>
          </h3>
          <SpecialtyTag user={u} />
          <span className="spacer" />
          {row.overdue_count > 0 && (
            <span className="badge badge-danger">{row.overdue_count} {tx("tasks.ta_muddati_otgan")}</span>
          )}
          {/* Ishi yo'qligi ham javob: menejer aynan shu odamga ish beradi. */}
          <span className={`badge ${row.task_count ? "" : "badge-ok"}`}>
            {row.task_count
              ? tx("tasks.nechta_vazifa", { n: row.task_count })
              : tx("tasks.ish_yoq")}
          </span>
          <button type="button" className="wl-toggle muted"
                  aria-expanded={open} aria-controls={panelId}
                  aria-label={open
                    ? tx("tasks.vazifalarni_yigish", { ism: u.full_name })
                    : tx("tasks.vazifalarni_ochish", { ism: u.full_name })}
                  /* Qator ham bosiladi - hodisa ikki marta o'tmasin. */
                  onClick={(e) => { e.stopPropagation(); onToggle(); }}>
            {open ? "▴" : "▾"}
          </button>
        </div>
        {/* Odam bir nechta loyihada bo'lishi mumkin - qaysilarida ekani
            yig'ilgan holatda ham ko'rinib tursin. */}
        <div className="repo-meta">
          {row.projects.map((p) => (
            <span key={p.id}>
              <span className="lang-dot" style={{ background: p.color }} /> {p.name}
            </span>
          ))}
        </div>
        {/* Ishi umuman bo'lmasa xulosa ham, chiziqcha ham chizilmaydi:
            «0/0 · 0%» hech nima aytmaydi, faqat joy egallaydi. */}
        {row.stats.total > 0 && <RowStats stats={row.stats} />}
      </div>

      {open && (
        <div className="card-body wl-tasks" id={panelId}>
          {!row.tasks.length ? (
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              {filtered ? tx("tasks.bu_holatda_vazifasi_yoq") : tx("tasks.ochiq_vazifasi_yoq_ish_berish")}
            </p>
          ) : (
            <>
              {row.tasks.map((t) => (
                <Link className={`tline ${t.is_overdue ? "overdue" : ""}`} {...toTask(t.id)} key={t.id}>
                  <span className="tline-title">{t.title}</span>
                  {t.due_date && (
                    <span className={t.is_overdue ? "badge badge-danger" : "wl-due"}>
                      <IconCalendar size={11} /> {fmtDate(t.due_date)}
                    </span>
                  )}
                  <span className="badge">{t.status_display}</span>
                </Link>
              ))}
              {row.task_count > row.tasks.length && (
                <p className="muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
                  {tx("common.yana")} {row.task_count - row.tasks.length} {tx("tasks.ta_loyiha_ichidagi_royxatda")}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
