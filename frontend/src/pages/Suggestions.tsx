/**
 * Takliflar — jamoa nima o'zgarishini so'raydi, boshliq qaror qiladi.
 *
 * KO'RINISH «VAZIFALAR» SAHIFASINIKI: tepada filtr paneli, ostida bitta
 * ro'yxat. Ilgari bu yer to'rt ustunli doska edi va ustunlar shu qadar tor
 * ediki, sarlavha ham, ism ham har harfda sinib ketardi - taklifni o'qish
 * uchun uni ochish kerak bo'lardi. Doskaning o'zi ham noto'g'ri va'da
 * berardi: u Kanban emas, bitta ro'yxatning kesimlari edi, ya'ni bitta
 * taklif ikkita ustunda birdan turardi. Endi kesim FILTR bo'lib panelga
 * chiqdi, taklif esa bitta joyda - bitta qatorda - turadi.
 *
 * QATOR QISQA JAVOB BERADI: nima taklif qilingan, qanday holatda, kim
 * yozgan, boshliq nima degan va jamoa qanday ovoz bergan. Taklifning
 * O'ZI - matn, chizmalar, to'liq izoh, ovoz va boshliq paneli - qator
 * bosilganda O'SHA YERNING O'ZIDA, qatorning ostiga yoyiladi.
 *
 * NEGA YOYILADI, SAHIFAGA O'TILMAYDI. Taklif ro'yxati - taqqoslash joyi:
 * odam ketma-ket bir nechtasini o'qib chiqadi va ovoz beradi. Har biri
 * uchun sahifaga o'tib, keyin orqaga qaytish har safar filtrni, sahifa
 * raqamini va aylantirilgan joyni qaytadan topishni anglatardi. Yoyilgan
 * qator esa ro'yxatdagi o'rnini yo'qotmaydi.
 *
 * BIR VAQTDA BITTASI ochiq turadi (`openId`): ikkitasi ochilsa ro'yxat
 * yana bir necha ekranga cho'zilib ketardi - aynan shundan qochilgan edi.
 * Taklifning o'z sahifasi (`pages/SuggestionDetail.tsx`) joyida qoladi:
 * yoyilgan qatorning ostidagi havola o'sha yerga olib boradi, ya'ni
 * taklifni birovga ko'rsatish yo'li yopilmaydi.
 *
 * MA'LUMOT ALLAQACHON QO'LDA. Ro'yxat `SuggestionSerializer` ning to'liq
 * javobini qaytaradi (`body`, `files`, `can_vote`, `can_decide`), shuning
 * uchun yoyish uchun qo'shimcha so'rov YUBORILMAYDI - ochilish darhol.
 *
 * KESISH SERVERDA. Qidiruv, holat, tur, sana va tartib - hammasi
 * so'rovga ketadi (`SuggestionViewSet.get_queryset`). Brauzerda filtrlash
 * faqat OCHILGAN sahifani qirqardi: ro'yxat sahifalangan va «topilmadi»
 * degan javob aslida «birinchi o'ttiztada yo'q» degani bo'lib qolardi.
 *
 * TARTIB SERVERDAN. Standart tartib ovoz bo'yicha (`qo'shilaman` minus
 * `qo'shilmayman`), ya'ni eng ko'p qo'llab-quvvatlangan taklif birinchi
 * o'rinda turadi.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";

import { api, listOf, pagesOf, totalOf } from "@/api/client";
import type {
  Suggestion, SuggestionCounts, SuggestionScopeValue, SuggestionStatusValue,
} from "@/api/types";
import { useFetch } from "@/api/useFetch";
import { useAuth } from "@/auth/AuthContext";
import { useLive } from "@/realtime/RealtimeContext";
import { confirmDialog } from "@/components/Confirm";
import { DateField } from "@/components/dates";
import { PageHead } from "@/components/Layout";
import {
  IconCheck, IconChevron, IconClose, IconFile, IconIdea,
} from "@/components/icons";
import {
  Attachments, BossPanel, DecisionBox, EMPTY_FORM, STATUS_TONE, SuggestionForm,
  VoteBar, formOf,
} from "@/components/suggestion";
import {
  Avatar, Card, DUE_PERIODS, Empty, ErrorMsg, Loading, OkMsg, Pager, Progress,
  RowMenu, timeAgo,
} from "@/components/ui";
import { toSuggestion } from "@/nav";
import { tx } from "@/i18n";

/** Holat kesimi - filtrdagi tartib shu yerdan. */
const STATUSES: SuggestionStatusValue[] = ["PENDING", "APPROVED", "REJECTED"];

/** Turi: ochiq taklifni hamma ko'radi, yopig'ini muallif va boshliq. */
const SCOPES: SuggestionScopeValue[] = ["OPEN", "CLOSED"];

/** Saralash - qiymatlar server tushunadigan kalitlar (`SuggestionViewSet.SORTS`). */
const SORTS = ["top", "new", "old"] as const;
type Sort = typeof SORTS[number];

/** Bir sahifada nechta taklif. */
const PAGE_SIZE = 20;

/** `GET /api/suggestions/` javobi - DRF sahifalagichi. */
interface ListPage {
  count: number;
  results: Suggestion[];
}

/**
 * Filtr paneli holati.
 *
 * Manzilga yozilmaydi: yuqoridagi umumiy qidiruv bilan chalkashmasin -
 * qoida «Vazifalar» sahifasidagi bilan bir xil.
 */
interface Filters {
  search: string;
  status: "" | SuggestionStatusValue;
  scope: "" | SuggestionScopeValue;
  period: string;
  date: string;
  sort: Sort;
  mine: boolean;
}

const NO_FILTERS: Filters = {
  search: "", status: "", scope: "", period: "", date: "", sort: "top", mine: false,
};

/**
 * Qatorning XULOSASI: jamoa nima degan.
 *
 * Uch sanoq ham NOL bo'lganda ham yoziladi - «hech kim qarshi emas» ham
 * javob. Yonidagi chiziq esa qo'llab-quvvatlash ulushi: `qo'shilaman`
 * berilgan ovozlarning qanchasi. Maxrajda betaraflar ham bor: ular ovoz
 * bergan, ya'ni taklifni ko'rgan odamlar.
 *
 * Sonlar SERVERDAN keladi (`for_count`, `against_count`, `neutral_count`),
 * bu yerda faqat ulush hisoblanadi.
 */
function VoteStats({ item }: { item: Suggestion }) {
  const total = item.for_count + item.against_count + item.neutral_count;
  const percent = total ? Math.round((item.for_count * 100) / total) : 0;
  return (
    <div className="wl-stats">
      <div className="wl-counts">
        <span className="wl-stat">
          {tx("suggestions.qoshilaman")} <b>{item.for_count}</b>
        </span>
        <span className={`wl-stat ${item.against_count ? "bad" : ""}`}>
          {tx("suggestions.qoshilmayman")} <b>{item.against_count}</b>
        </span>
        <span className="wl-stat">
          {tx("suggestions.betarafman")} <b>{item.neutral_count}</b>
        </span>
      </div>
      <span className="wl-percent">
        <Progress value={percent} />
        <span className="mono">{item.for_count}/{total}</span>
        <b>{percent}%</b>
      </span>
    </div>
  );
}

/* -------------------------------------------------------------- bitta qator */

function SuggestionRow({ item, rank, open, onToggle, onPatch, onEdit, onDelete }: {
  item: Suggestion;
  /** Ro'yxatdagi o'rni - faqat ovoz bo'yicha saralanganda. */
  rank: number | null;
  /** Qator yoyilganmi. Bir vaqtda bittasi ochiq - qarori sahifada. */
  open: boolean;
  onToggle: () => void;
  /** Ovoz yoki qarordan keyin qaytgan taklif - ro'yxatdagi nusxa yangilansin. */
  onPatch: (saved: Suggestion) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  /* Qaror chiqqach boshliq paneli yopiladi. Fikr o'zgarsa yo'l ochiq:
     «Qarorni o'zgartirish» uni qaytadan ochadi - taklif sahifasidagi
     qoidaning aynan o'zi. Qator yig'ilganda bu holat ham unutiladi,
     aks holda keyingi ochishda panel sababsiz ochiq turardi. */
  const [redeciding, setRedeciding] = useState(false);
  useEffect(() => { if (!open) setRedeciding(false); }, [open]);

  const votes = item.for_count + item.against_count + item.neutral_count;
  const decided = item.status !== "PENDING";

  return (
    /* Qatorning istalgan yeriga bosilsa taklif YOYILADI - sarlavhani aniq
       nishonga olish shart emas. Sarlavhaning o'zi esa haqiqiy tugma:
       klaviatura bilan yetib boriladi va `aria-expanded` yoyilganini
       aytadi. */
    <div className={`repo-item clickable${open ? " sg-row-open" : ""}`} onClick={onToggle}>
      <div className="row wrap">
        {rank !== null && <span className="sg-rank">{rank}</span>}
        <h3 className="sg-title">
          <button type="button" className="sg-title-btn" aria-expanded={open}
                  title={tx(open ? "suggestions.yigish" : "suggestions.yoyish")}
                  onClick={(e) => { e.stopPropagation(); onToggle(); }}>
            {item.title}
          </button>
        </h3>
        <span className={`badge ${STATUS_TONE[item.status]}`}>{item.status_display}</span>
        {/* Ochiq taklif - odatdagi hol, uni yozib o'tirish shart emas.
            Yopig'i esa alohida belgi bilan turadi: uni hamma ko'rmaydi. */}
        {item.scope === "CLOSED" && (
          <span className="badge badge-info">{item.scope_display}</span>
        )}
        <span className="spacer" />
        {!!item.files.length && (
          <span className="badge" title={tx("suggestions.fayllar")}>
            <IconFile size={11} /> {item.files.length}
          </span>
        )}

        {/* Muallifning amallari - qatorning o'ng chekkasida, loyihalar
            ro'yxatidagi kabi. Menyu qatorning ustida turadi, shuning uchun
            bosilganda taklif yoyilib ketmasin. */}
        {item.can_edit && (
          <div className="sg-actions" onClick={(e) => e.stopPropagation()}>
            <RowMenu>
              <button type="button" onClick={onEdit}>{tx("common.tahrirlash")}</button>
              <button type="button" onClick={onDelete}>{tx("common.ochirish")}</button>
            </RowMenu>
          </div>
        )}

        {/* Burchak - qator YOYILADIGANINING yagona ko'rinadigan belgisi.
            `aria-hidden`: holatni sarlavha tugmasidagi `aria-expanded`
            allaqachon aytadi, ikki marta takrorlanmasin. */}
        <span className={`sg-chevron${open ? " on" : ""}`} aria-hidden="true">
          <IconChevron size={15} />
        </span>
      </div>

      {/* Kim yozgani va qachon. Anonim taklifda ism O'RNIGA emas, umuman
          yo'q: muallif hech kimga - boshliqqa ham - ochilmaydi. */}
      <div className="repo-meta">
        <span className="sg-by">
          {item.author
            ? <><Avatar user={item.author} size="sm" /> {item.author.full_name}</>
            : <span className="sg-anon">{tx("suggestions.anonim_muallif")}</span>}
        </span>
        <span>{timeAgo(item.created_at)}</span>
        {decided && item.decided_by && (
          <span>{tx("suggestions.qaror_qildi", { ism: item.decided_by.full_name })}</span>
        )}
      </div>

      {/* QAROR YIG'ILGAN QATORDA. Nishonning yolg'iz o'zi «tasdiqlandi»
          deydi-yu, NEGA ekanini aytmaydi - boshliqning izohi esa javobning
          yarmi, ayniqsa rad etilganda (izohsiz rad etib bo'lmaydi ham:
          `DecisionSerializer`). Shuning uchun bu yerda izohning bir
          qatorlik boshi turadi. Qator YOYILGANDA chizilmaydi: ostida
          o'sha qaror to'lig'icha (`DecisionBox`) turibdi va takrorlash
          faqat chalkashtirardi. Javob kutayotgan taklifda ham yozilmaydi:
          uning nishoni allaqachon «Ko'rib chiqilmoqda» deb turibdi. */}
      {decided && !open && (
        <div className={`sg-verdict ${item.status === "APPROVED" ? "ok" : "no"}`}>
          {item.status === "APPROVED" ? <IconCheck size={12} /> : <IconClose size={12} />}
          <strong>{item.status_display}</strong>
          {item.decision_note && (
            <span className="sg-verdict-note">
              {tx("suggestions.qaror_izoh_qisqa", { izoh: item.decision_note })}
            </span>
          )}
        </div>
      )}

      {/* Ovoz berilmagan taklifda chiziq ham, nollar ham chizilmaydi:
          «0/0 · 0%» hech nima aytmaydi, faqat joy egallaydi. */}
      {votes > 0 && <VoteStats item={item} />}

      {/* TAKLIFNING O'ZI. Ichkaridagi bosishlar qatorga YETIB BORMAYDI:
          aks holda ovoz tugmasi yoki rasm bosilganda qator yig'ilib
          qolardi. Yopish uchun sarlavha, burchak va qatorning bo'sh
          yeri bor. */}
      {open && (
        <div className="sg-open" onClick={(e) => e.stopPropagation()}>
          <p className="sg-body">{item.body}</p>

          <Attachments item={item} />

          {item.can_vote && <VoteBar item={item} onChange={onPatch} />}

          <DecisionBox item={item} />

          {item.can_decide && (item.status === "PENDING" || redeciding) && (
            <BossPanel item={item}
                       onDone={(saved) => { setRedeciding(false); onPatch(saved); }}
                       onCancel={redeciding ? () => setRedeciding(false) : undefined} />
          )}
          {item.can_decide && decided && !redeciding && (
            <button type="button" className="btn btn-sm sg-redecide"
                    onClick={() => setRedeciding(true)}>
              {tx("suggestions.qarorni_ozgartirish")}
            </button>
          )}

          {/* Taklifning O'Z sahifasiga yo'l. Yoyilgan qator hamma narsani
              ko'rsatadi, lekin uning manzili yo'q - havolani birovga
              yuborish yoki yangi oynada ochish uchun shu yerda haqiqiy
              `<a>` turadi. */}
          <div className="sg-open-foot">
            <Link {...toSuggestion(item.id)}>{tx("suggestions.toliq_sahifada")}</Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- sahifa */
export default function Suggestions() {
  const fid = useId();
  const { user } = useAuth();
  /* «Turi» tanlagichi FAQAT BOSHLIQDA. Qolgan hamma uchun bu tanlov
     deyarli bo'sh: u barcha OCHIQ takliflarni va o'zining sanoqli yopiq
     taklifini ko'radi, ya'ni kesim ro'yxatni deyarli o'zgartirmasdi.
     Boshliq esa ikkovini ham to'liq ko'radi va «yopiq gaplar» ni ajratib
     olishi kerak. Bu YASHIRISH emas, panelni tozalash: chegara serverda
     (`SuggestionViewSet.visible`) va `?scope=` har kimga o'zi ko'radigan
     doirada baribir ishlaydi. */
  const canPickScope = Boolean(user?.is_boss);

  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  /* Yoyilgan qator - BITTA. Ro'yxatning o'zi qisqa javob berish uchun
     bor; ikkita taklif birdan yoyilsa u yana bir necha ekranga cho'zilib
     ketardi va taqqoslash o'rniga aylantirish boshlanardi. */
  const [openId, setOpenId] = useState<number | null>(null);
  /* Ovoz berilgan yoki qaror chiqqan taklifning YANGI holati.
     Ro'yxatni qaytadan so'ramaymiz: standart tartib ovoz bo'yicha, ya'ni
     qayta so'rov qatorni odamning ko'z oldida boshqa joyga ko'chirib
     yuborardi. Kalit - taklif raqami; ro'yxat yangilanganda tashlanadi. */
  const [patched, setPatched] = useState<Record<number, Suggestion>>({});
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Suggestion | null>(null);
  const [ok, setOk] = useState("");
  /* Taklif saqlandi-yu, fayl yuklanmadi. */
  const [warn, setWarn] = useState("");

  /* «Saqlandi» o'zi so'nadi; ogohlantirish qoladi - unda bajarilmagan ish bor. */
  useEffect(() => {
    if (!ok) return;
    const timer = setTimeout(() => setOk(""), 10_000);
    return () => clearTimeout(timer);
  }, [ok]);

  // Qidiruv har harfda emas, yozish to'xtagach ketadi.
  const list = useFetch<ListPage>("/suggestions/", {
    search: f.search,
    status: f.status,
    scope: f.scope,
    period: f.period,
    date: f.date,
    sort: f.sort,
    ...(f.mine ? { mine: 1 } : {}),
    page,
    page_size: PAGE_SIZE,
  }, { debounceMs: 300 });

  /* Holat tanlagichidagi sonlar - SERVERDAN, ekrandagi qatorlardan emas
     (ro'yxat sahifalangan). Ular ko'rinish shartidan chiqadi
     (`SuggestionViewSet.visible`), ya'ni panel filtrlaridan qat'i nazar
     «navbatda nechta taklif bor» degan savolga javob beradi. */
  const counts = useFetch<SuggestionCounts>("/suggestions/counts/");

  /* Serverdan yangi javob kelgan - qo'ldagi yamoqlar eskirdi. Ular
     saqlanib qolsa filtr almashtirilganda eski sonlar yangi ro'yxatning
     ustiga chizilardi. */
  const listData = list.data;
  useEffect(() => {
    // Bo'sh yamoqni qayta bo'shatmaymiz: `setPatched({})` HAR safar yangi
    // obyekt beradi, ya'ni javob o'zgarmagan bo'lsa ham qo'shimcha render
    // bo'lardi - `data` ning o'zi ham yangi bo'lsa ikkovi bir-birini
    // qo'zg'atib cheksiz aylanardi.
    setPatched((cur) => (Object.keys(cur).length ? {} : cur));
  }, [listData]);

  const rows = listOf<Suggestion>(listData).map((r) => patched[r.id] ?? r);
  const total = totalOf(list.data);
  const pages = pagesOf(list.data, PAGE_SIZE);

  const reloadList = list.reload;
  const reloadCounts = counts.reload;
  const reload = useCallback(() => {
    reloadList();
    reloadCounts();
  }, [reloadList, reloadCounts]);

  // Ochiq turgan sahifa o'zi yangilansin - qo'ng'iroqning o'zi yetarli emas.
  useLive((d) => {
    if (d.event !== "notification") return;
    const kind = d.notification?.kind;
    if (kind === "suggestion.new" || kind === "suggestion.decided") reload();
  });

  function set<K extends keyof Filters>(k: K, v: Filters[K]) {
    // Filtr almashganda sahifa birinchisiga qaytadi - aks holda beshinchi
    // sahifada turgan odam qidiruv yozib bo'sh ekranga urilardi.
    setPage(1);
    setEditing(null);
    // Ekrandagi qatorlar butunlay almashadi - ochiq qator ham yopiladi.
    setOpenId(null);
    // Davr va aniq sana bir-birini almashtiradi: ikkovi birga tanlangan
    // ekranda "qaysi biri ishlayapti?" degan savol tug'ilardi.
    setF((prev) => ({
      ...prev,
      [k]: v,
      ...(k === "period" ? { date: "" } : {}),
      ...(k === "date" ? { period: "" } : {}),
    }));
  }

  function clear() {
    setPage(1);
    setEditing(null);
    setOpenId(null);
    setF(NO_FILTERS);
  }

  /* Saralash filtr emas - «Tozalash» uni o'z holicha qoldiradi. */
  const dirty = Boolean(f.search || f.status || f.scope || f.period || f.date || f.mine);
  /* Faqat «meniki» tanlangan bo'lsa bo'sh ekran boshqacha gapiradi: bu
     «topilmadi» emas, «siz hali yozmagansiz» - va'da ham boshqa. */
  const onlyMine = f.mine && !(f.search || f.status || f.scope || f.period || f.date);

  async function remove(item: Suggestion) {
    const yes = await confirmDialog({
      title: tx("suggestions.ochirilsinmi", { nom: item.title }),
      body: tx("suggestions.ochirish_izohi"),
      confirmText: tx("common.ochirish"),
      danger: true,
    });
    if (!yes) return;
    await api.delete("/suggestions/" + item.id + "/");
    setOpenId((cur) => (cur === item.id ? null : cur));
    setOk(tx("suggestions.ochirildi"));
    reload();
  }

  function afterSave(_saved: Suggestion, note?: string) {
    setCreating(false);
    setEditing(null);
    setWarn(note || "");
    setOk(note ? "" : tx("suggestions.saqlandi"));
    reload();
  }

  return (
    <>
      <PageHead
        title={<strong>{tx("suggestions.sarlavha_sahifa")}</strong>}
        actions={
          <>
            {/* Sanoq JAMI takliflarniki, ekrandagilarniki emas - u tanlangan
                kesim qanchaligini aytadi. */}
            {!!list.data && (
              <span className="badge">{tx("suggestions.nechta_taklif", { n: total })}</span>
            )}
            {!creating && !editing && (
              <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
                <IconIdea size={14} /> {tx("suggestions.yangi_taklif")}
              </button>
            )}
          </>
        }
      />

      <div className="content wl sg">
        {ok && <OkMsg text={ok} />}
        {warn && <ErrorMsg error={warn} />}
        <ErrorMsg error={list.error} />

        {(creating || editing) && (
          /* Forma zich ro'yxatning qoidasidan tashqarida - sabab
             `.sg-form` yonida yozilgan. */
          <div className="sg-form">
            <SuggestionForm
              key={editing ? "edit-" + editing.id : "new"}
              editing={editing}
              initial={editing ? formOf(editing) : EMPTY_FORM}
              onCancel={() => { setCreating(false); setEditing(null); }}
              onSaved={afterSave}
            />
          </div>
        )}

        {/* Qidiruv chapda va keng, tanlovlar o'ngda - ular tor va soni
            o'zgarmaydi. Tuzilish «Vazifalar» sahifasidagi panel bilan
            bir xil. */}
        <div className="filters">
          <div className="f wl-search">
            <label htmlFor={`${fid}-q`}>{tx("common.qidiruv")}</label>
            {/* Bitta maydon - uchta savol: SARLAVHA, taklif MATNI va
                MUALLIF ismi. Uchalasini ham server sinab ko'radi
                (`SuggestionViewSet.searched`). Anonim taklif ism bo'yicha
                topilmaydi - aks holda anonimlik qidiruv orqali buzilardi. */}
            <input id={`${fid}-q`} value={f.search} placeholder={tx("suggestions.qidiruv_placeholder")}
                   onChange={(e) => set("search", e.target.value)} />
          </div>

          <div className="wl-filters">
            <div className="f sg-status">
              <label htmlFor={`${fid}-s`}>{tx("suggestions.holat")}</label>
              <select id={`${fid}-s`} value={f.status}
                      onChange={(e) => set("status", e.target.value as Filters["status"])}>
                <option value="">{tx("suggestions.holat_all")}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {tx("suggestions.holat_" + s.toLowerCase())} ({counts.data?.[s] ?? 0})
                  </option>
                ))}
              </select>
            </div>

            {canPickScope && (
              <div className="f">
                <label htmlFor={`${fid}-t`}>{tx("suggestions.turi")}</label>
                <select id={`${fid}-t`} value={f.scope}
                        onChange={(e) => set("scope", e.target.value as Filters["scope"])}>
                  <option value="">{tx("suggestions.barcha_turlar")}</option>
                  {SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {tx(s === "OPEN" ? "suggestions.ochiq" : "suggestions.yopiq")}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="f">
              {/* Davr KALENDAR bo'yicha: «shu hafta» dushanbadan
                  yakshanbagacha. Oraliqni server hisoblaydi (`due_span`) -
                  vazifalar ro'yxati ham aynan shu mantiqda sanaydi. */}
              <label htmlFor={`${fid}-p`}>{tx("common.davr")}</label>
              <select id={`${fid}-p`} value={f.period}
                      onChange={(e) => set("period", e.target.value)}>
                <option value="">{tx("suggestions.barcha_vaqt")}</option>
                {DUE_PERIODS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="f wl-date">
              {/* AYNAN shu kuni yozilgan takliflar. */}
              <label htmlFor={`${fid}-d`}>{tx("common.sana")}</label>
              <DateField id={`${fid}-d`} value={f.date} onChange={(v) => set("date", v)} />
            </div>

            <div className="f sg-sort">
              <label htmlFor={`${fid}-o`}>{tx("suggestions.saralash")}</label>
              <select id={`${fid}-o`} value={f.sort}
                      onChange={(e) => set("sort", e.target.value as Sort)}>
                {SORTS.map((v) => (
                  <option key={v} value={v}>{tx("suggestions.saralash_" + v)}</option>
                ))}
              </select>
            </div>

            <label className="sg-only-mine">
              <input type="checkbox" checked={f.mine}
                     onChange={(e) => set("mine", e.target.checked)} />
              {tx("suggestions.meniki")}
            </label>

            {dirty && (
              <button type="button" className="btn btn-ghost" onClick={clear}>
                {tx("common.tozalash")}
              </button>
            )}
          </div>
        </div>

        {list.loading ? <Loading /> : !list.data ? null : !rows.length ? (
          <Card>
            <Empty icon="💡"
                   title={onlyMine ? tx("suggestions.meniki_bosh")
                     : dirty ? tx("suggestions.topilmadi")
                       : tx("suggestions.bosh_holat")}
                   text={onlyMine ? tx("suggestions.meniki_bosh_matn")
                     : dirty ? tx("suggestions.topilmadi_matn")
                       : tx("suggestions.bosh_holat_matn")} />
          </Card>
        ) : (
          <div className="card">
            <div className="card-list">
              {rows.map((item, i) => (
                <SuggestionRow
                  key={item.id}
                  item={item}
                  /* O'rin faqat OVOZ bo'yicha saralanganda ma'noga ega va
                     sahifadan sahifaga davom etadi. Sana bo'yicha
                     saralanganda raqam «birinchi o'rin» degan yolg'on
                     va'da berardi. */
                  rank={f.sort === "top" ? (page - 1) * PAGE_SIZE + i + 1 : null}
                  open={openId === item.id}
                  onToggle={() => setOpenId((cur) => (cur === item.id ? null : item.id))}
                  onPatch={(saved) => setPatched((cur) => ({ ...cur, [saved.id]: saved }))}
                  onEdit={() => { setEditing(item); setCreating(false); setOpenId(null); }}
                  onDelete={() => void remove(item)}
                />
              ))}
            </div>

            {/* Sahifa raqamlari - faqat bo'linadigan narsa bo'lsa. */}
            {pages > 1 && (
              <div className="card-body pager-bar">
                <span className="muted">
                  {tx("suggestions.natija_soni", {
                    jami: total,
                    dan: (page - 1) * PAGE_SIZE + 1,
                    gacha: Math.min(page * PAGE_SIZE, total),
                  })}
                </span>
                <Pager page={page} pages={pages}
                       onPick={(n) => { setEditing(null); setOpenId(null); setPage(n); }} />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
