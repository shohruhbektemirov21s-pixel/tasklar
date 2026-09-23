import { createContext, useCallback, useContext, useEffect, useState, Suspense } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, listOf } from "@/api/client";
import type { SidebarCounts, UserBrief } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { useRealtime } from "@/realtime/RealtimeContext";
import ErrorBoundary from "./ErrorBoundary";
import { LogoWord } from "./Logo";
import { IconArrowUp, IconBack, IconBell, IconBoard, IconCalendar, IconChat, IconCheck, IconClose, IconDashboard, IconHistory, IconIdea, IconInbox, IconLayers, IconLogout, IconMenu, IconOrder, IconReview, IconSearch, IconSettings, IconTasks, IconUsers } from "./icons";
import ThemeToggle from "./ThemeToggle";
import { Avatar, Loading, SpecialtyTag } from "./ui";
import { toFeed, toMessages, toSelfProfile, toUser, type NavTarget, useGo, useHistoryTracker, useNavHistory, getFallbackParentRoute } from "@/nav";
import { tx } from "@/i18n";
import { lockScroll, unlockScroll, resetScrollLock } from "./scrollLock";

/**
 * Sahifa nomi turadigan UYA - yuqori paneldagi bo'sh tugun.
 *
 * NEGA PORTAL. Nom sahifaning o'zida yasaladi (`PageHead`): u ko'pincha
 * yuklab olingan ma'lumotdan keladi - loyihaning nomi, odamning ismi,
 * vazifaning kodi. Panel esa `Layout` da, sahifadan TASHQARIDA chiziladi.
 * Nomni tepaga chiqarishning uchta yo'li bor edi:
 *
 *   1. har bir sahifa nomni holatga yozsin - `useEffect` bilan. Nom JSX
 *      tuguni, ya'ni har chizishda YANGI obyekt: bog'liqlik ro'yxatida u
 *      doim "o'zgargan" bo'lib ko'rinadi va cheksiz qayta chizish boshlanadi;
 *   2. `Layout` nomni manzildan taxmin qilsin - unda `/loyiha` da loyihaning
 *      nomi emas, "Loyiha" degan umumiy so'z turardi;
 *   3. PORTAL - nom o'z sahifasida qoladi, faqat DOM da boshqa joyga
 *      chiziladi. Holat ham, takrorlash ham kerak emas.
 *
 * Uya `null` bo'lishi mumkin: birinchi chizishda panel hali DOM ga
 * tushmagan. Shunda nom bir kadr ko'rinmaydi va keyin o'z joyiga tushadi.
 */
const TitleSlot = createContext<HTMLElement | null>(null);

/**
 * Sahifani boshiga qaytaradi.
 *
 * Uzun ro'yxatlarda (jamoa yuklamasi, tarix, vazifalar) pastga tushgan
 * odam tepaga qaytish uchun aylantirib chiqishi kerak edi. Panel yopishib
 * turadi, ya'ni sahifa nomi doim ko'z oldida - uni bosish shu ishni bir
 * harakatda qiladi. Aylantiriladigan tugun - oynaning o'zi: ilovada
 * ichki aylanuvchi ustun yo'q (yon panel bundan mustasno).
 */
function toPageTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Orqaga qaytish tugmasi.
 *
 * NEGA KERAK. Manzilda endi identifikator yo'q (`/loyiha`, `/vazifa`) va
 * qaysi yozuv ochilgani sahifa holatida saqlanadi. Brauzerning o'z
 * tugmasi buni to'g'ri tiklaydi, lekin u ekranning tepasida, ilovadan
 * tashqarida - ayniqsa to'liq ekran rejimida ko'rinmaydi. Shuning uchun
 * ilovaning o'zida ham bo'lsin.
 *
 * QAYERDA TURADI. Yuqori panelning eng chapida, sahifa nomidan oldin -
 * kun bo'yi bosiladigan tugma ko'z bilan qidirilmasin. Qidiruv esa
 * panelning o'ng chetiga, boshqa nishonlar yoniga o'tgan.
 *
 * QACHON O'CHIQ. Faqat bosh panelda (/panel) va orqaga qaytadigan tarix
 * bo'lmaganda o'chadi. Boshqa ichki sahifalarda tarix bo'lmasa ham
 * tegishli bosh bo'limga (/loyihalar, /ish-maydonlari va h.k.) olib boradi.
 */
function BackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const { history, currentIdx, goBackTo, clearHistory } = useNavHistory();
  const isRootPage = location.pathname === "/panel" || location.pathname === "/";
  const hasHistory = currentIdx > 0 || (typeof window !== "undefined" && window.history.length > 1);
  const canGoBack = hasHistory || !isRootPage;

  const handleBack = useCallback(() => {
    if (currentIdx > 0) {
      navigate(-1);
    } else if (!isRootPage) {
      navigate(getFallbackParentRoute(location.pathname));
    }
  }, [currentIdx, isRootPage, location.pathname, navigate]);



  return (
    <div className="top-back-wrap">
      <div className="top-back-btn-group">
        <button
          type="button"
          className="top-icon top-back"
          disabled={!canGoBack}
          onClick={handleBack}
          title={canGoBack ? tx("layout.orqaga_qaytish") : tx("layout.orqaga_qaytadigan_sahifa_yoq")}
          aria-label={tx("layout.orqaga_qaytish")}
        >
          <IconBack size={17} />
        </button>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  // Loyiha boshqaradimi - yon panel shunga qarab boshqacha yoziladi.
  const manages = Boolean(
    user?.is_boss ||
    user?.is_platform_admin ||
    user?.can_create_project ||
    user?.manages_projects
  );
  const isPm = Boolean(
    user?.is_manager ||
    user?.global_role === "MANAGER" ||
    user?.specialty === "PM"
  );
  const { subscribe, connected, reload: reloadRealtime, unread } = useRealtime();
  const go = useGo();
  const loc = useLocation();
  const [counts, setCounts] = useState({ open: 0, reviews: 0, joins: 0, orders: 0, suggestions: 0 });
  const notifCount = typeof unread === "number" && unread > 0 ? unread : 0;
  const [q, setQ] = useState("");
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  useHistoryTracker(titleSlot);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onRefresh = () => {
      setTick((t) => t + 1);
      void reloadRealtime();
    };

    window.addEventListener("teamflow:refresh", onRefresh);
    return () => {
      window.removeEventListener("teamflow:refresh", onRefresh);
    };
  }, [reloadRealtime]);
  // Tepadagi qidiruv odamni ham topadi: ism, familiya yoki email bo'yicha.
  const [people, setPeople] = useState<UserBrief[]>([]);
  const [openHits, setOpenHits] = useState(false);
  // Telefonda yon panel chetdan chiqadigan tortma bo'ladi.
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    // Sahifadan sahifaga tez o'tilganda eski javob yangi sanoqni bosmasin.
    let alive = true;
    void (async () => {
      try {
        // Yengil endpoint: faqat hisoblar (`COUNT`).
        const d = await api.get<SidebarCounts>("/counts/");
        if (alive) {
          setCounts({
            open: d.open,
            reviews: d.reviews,
            joins: d.joins,
            orders: d.orders || 0,
            suggestions: d.suggestions || 0,
          });
        }
      } catch { /* jim */ }
    })();
    return () => { alive = false; };
  }, [tick]);

  // Sanoq navigatsiyada emas, HODISADA yangilanadi.
  useEffect(() => subscribe((data) => {
    const isNotif = data.event === "notification";
    const isOrderNotif =
      isNotif && Boolean(data.notification?.kind?.startsWith("order."));
    const isSuggestionNotif =
      isNotif && Boolean(data.notification?.kind?.startsWith("suggestion."));
    const joinRequest =
      isNotif && data.notification?.kind === "join.request";
    if (
      isNotif ||
      joinRequest ||
      isOrderNotif ||
      isSuggestionNotif ||
      data.event === "task.update" ||
      data.event === "order.update" ||
      data.event === "order.create" ||
      data.event === "order.delete" ||
      data.event === "suggestion.new" ||
      data.event === "suggestion.decided"
    ) {
      setTick((n) => n + 1);
    }
  }), [subscribe]);

  // Yozish to'xtagach odam qidiriladi - har harfda so'rov yubormaymiz.
  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) {
      setPeople([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void api.get<unknown>("/users/", { search: needle, page_size: 6 })
        .then((d) => setPeople(listOf<UserBrief>(d)))
        .catch(() => setPeople([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  const [showScrollTop, setShowScrollTop] = useState(false);

  // Sahifa skrollini kuzatish (tepaga qaytish tugmasi uchun)
  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 280);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Sahifa almashsa qidiruv oynasi ham, tortma ham yopilsin, skroll holati tozalansin.
  useEffect(() => {
    setOpenHits(false);
    setMenu(false);
    resetScrollLock();
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [loc.pathname, loc.key]);

  // Tortma ochiq turganda: Esc yopadi va orqadagi sahifa siljimaydi.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [menu]);

  /**
   * Bo'lim O'Z manzilidan tashqarida ham belgilanadi.
   *
   * `NavLink` faqat o'z manzilini biladi, loyiha sahifasi esa butunlay
   * boshqa marshrutda turadi: ro'yxat `/loyihalar`, bittasi `/loyiha/...`.
   * Ya'ni loyiha ichida (yoki uning vazifasida) turgan odam yon panelda
   * hech nima yonmaganini ko'rardi va "men qayerdaman" degan savol
   * javobsiz qolardi. Nom bo'yicha ham bog'lab bo'lmaydi - `/loyiha`
   * `/loyihalar` ning boshlanishi emas, aksincha.
   *
   * Sahifaning o'zi buni allaqachon aytadi: loyiha va vazifa sarlavhasi
   * «loyihalar / ...» dan boshlanadi. Yon panel shu bilan mos bo'lsin.
   */
  const NAV_FAMILY: Record<string, string[]> = {
    "/loyihalar": ["/loyiha", "/vazifa"],
    "/jamoa": ["/xodimlar"],
  };

  const inFamily = (to: string) =>
    (NAV_FAMILY[to] || []).some(
      (base) => loc.pathname === base || loc.pathname.startsWith(base + "/"));

  const item = (to: string, icon: React.ReactNode, label: string, count?: number, hot = false, title?: string) =>
    itemTo({ to, state: {} }, icon, label, count, hot, title);

  // Ba'zi bo'limlar sessiyadagi raqamni ATAYLAB tozalaydi (masalan
  // «Xabarlar» - suhbatdosh emas, ro'yxat ochilsin), shuning uchun
  // maqsadni to'liq qabul qiladigan variant ham bor.
  const itemTo = (target: NavTarget, icon: React.ReactNode, label: string,
                  count?: number, hot = false, title?: string) => (
    <NavLink to={target.to} state={target.state}
             title={title || label}
             className={({ isActive }) =>
               `nav-item ${isActive || inFamily(target.to) ? "active" : ""}`} end>
      <span className="ico">{icon}</span>
      <span className="label">{label}</span>
      {!!count && <span className={`count ${hot ? "hot" : ""}`}>{count}</span>}
    </NavLink>
  );

  // Yuqori panel: yon panelning o'ng tomonida turadi, shuning uchun u
  // `.main` ustuni ichida chiziladi. Logotip esa yon panelning tepasida -
  // dizaynda shunday: chapda brend va navigatsiya, o'ngda qidiruv va
  // amallar. Ikkalasi bir marta yoziladi va shu yerda yig'iladi.
  const header = (
    <header className="gh-top">
      <button type="button" className="top-icon menu-btn" onClick={() => setMenu((v) => !v)}
              aria-label={menu ? tx("layout.menyuni_yopish") : tx("layout.menyuni_ochish")} aria-expanded={menu}>
        {menu ? <IconClose size={17} /> : <IconMenu size={17} />}
      </button>

      {/* Yuqori panelda navigatsiya havolalari yo'q: «Loyihalar» va
          «Mening ishim» yon panelda turadi va u har doim ko'rinadi
          (mobilda menyu tugmasi bilan). Bir xil havola ikki joyda
          turgani foyda bermaydi - odam qaysi biri "asosiy" ekanini
          o'ylab qoladi. */}

        {/* «ORQAGA» ENG CHAPDA - pastdagi ustunning boshi bilan bir
            tekislikda. Bu paneldagi eng ko'p bosiladigan tugma: odam
            ro'yxatdan yozuvga kiradi va yana ro'yxatga qaytadi. Ilgari u
            qidiruvdan keyin, boshqa nishonlar orasida turardi va har safar
            ko'z bilan qidirishga to'g'ri kelardi. */}
        <BackButton />

        {/* Sahifa nomi - o'q bilan yonma-yon. Bo'sh tugun: ichini o'sha
            paytda ochilgan sahifa `PageHead` orqali to'ldiradi. */}
        <div className="top-title" ref={setTitleSlot} />

        {/* Nom chapda, qolgani o'ngda - orasi bo'sh qoladi */}
        <span className="spacer" />

        {/* Qidiruv - amallar guruhining boshida, o'ng chetda. Topilgan
            odamlar ro'yxati ham o'ngga tekislanadi (`.top-hits`), aks holda
            u ekranning o'ng chetidan chiqib ketardi. */}
        <div className="top-search">
          <form
            className="gh-search"
            onSubmit={(e) => {
              e.preventDefault();
              setOpenHits(false);
              go(toFeed(q));
            }}
          >
            <IconSearch size={14} />
            {/* `name` va `aria-label` SHART. Placeholder yorliq emas: odam
                yoza boshlagan zahoti u yo'qoladi va ekran o'quvchi maydonni
                nomsiz deb e'lon qiladi. Brauzer ham nomsiz maydonni eslab
                qololmaydi - Chrome buni «A form field element should have an
                id or name attribute» deb ogohlantiradi. */}
            <input
              type="search"
              name="qidiruv"
              aria-label={tx("layout.odam_tarix_va_loyihalardan_qidirish")}
              placeholder={tx("layout.odam_tarix_va_loyihalardan_qidirish")}
              value={q}
              onChange={(e) => { setQ(e.target.value); setOpenHits(true); }}
              onFocus={() => setOpenHits(true)}
              /* Havolaga bosilguncha ro'yxat yopilib qolmasin */
              onBlur={() => window.setTimeout(() => setOpenHits(false), 160)}
            />
          </form>

          {openHits && q.trim().length >= 2 && (
            /* Sichqoncha bosilganda maydon fokusni yo'qotmasin: aks holda blur
               ro'yxatni yopadi va havola bosilishga ulgurmaydi (mousedown bilan
               mouseup orasida 160 ms dan ko'p vaqt o'tsa - odatiy hol). */
            <div className="top-hits" onMouseDown={(e) => e.preventDefault()}>
              {people.length > 0 && <div className="top-hits-head">{tx("layout.odamlar")}</div>}
              {people.map((u) => (
                <Link key={u.id} className="top-hit" {...toUser(u.id)}
                      onClick={() => { setOpenHits(false); setQ(""); }}>
                  <Avatar user={u} size="sm" />
                  <span className="top-hit-text">
                    <strong>{u.full_name}</strong>
                    <span className="muted mono">{u.email}</span>
                  </span>
                  <SpecialtyTag user={u} compact />
                </Link>
              ))}
              {!people.length && (
                <div className="muted" style={{ padding: "10px 12px", fontSize: 13 }}>
                  {tx("layout.bu_ism_boyicha_odam_topilmadi")}
                </div>
              )}
              <button type="button" className="top-hit top-hit-all"
                      onClick={() => { setOpenHits(false); go(toFeed(q)); }}>
                «{q.trim()}{tx("layout.boyicha_tarix_va_loyihalarni_qidirish")}
              </button>
            </div>
          )}
        </div>

        <ThemeToggle />
        {/* Tekshiruv navbati - faqat ish qabul qiladigan odamga: loyiha
            menejeri va admin. Ijrochida bu navbat har doim bo'sh edi
            (server uni boshqariladigan loyihalar bo'yicha qirqadi), ya'ni
            menyuda doim bo'sh sahifaga olib boradigan yozuv turardi. */}
        {manages && !user?.is_boss && (
          <Link className="top-icon hide-sm" to="/tekshiruv" title={tx("common.tekshiruv_navbati")}>
            <IconInbox size={17} />
            {!!counts.reviews && <span className="dot">{counts.reviews}</span>}
          </Link>
        )}
        <Link {...toSelfProfile()} aria-label={user?.full_name}>
          <Avatar user={user} placement="bottom" />
        </Link>
    </header>
  );

  return (
    <>
      <div className="layout">
        {menu && <button type="button" className="scrim" aria-label={tx("layout.menyuni_yopish")}
                         onClick={() => setMenu(false)} />}
        <aside className={`sidebar ${menu ? "open" : ""}`}>
          <Link to="/panel" className="logo-link">
            <LogoWord size={28} />
          </Link>

          {/* 1. ASOSIY ISH JARAYONI */}
          <div className="nav-section">
            <div className="nav-title">{tx("layout.bolim_ish")}</div>
            {item("/panel", <IconDashboard />, tx("layout.bosh_panel"), undefined, false, tx("layout.tooltip_panel"))}
            {manages || user?.is_sohaviy_boshqarma
              ? item("/loyihalar", <IconBoard />, tx("common.loyihalar"), undefined, false, tx("layout.tooltip_loyihalar"))
              : item("/loyihalar", <IconLayers />, tx("common.vazifalar"), undefined, false, tx("layout.tooltip_loyihalar"))}
            {user?.is_boss ? (
              item("/qilingan-ishlar", <IconCheck />, tx("layout.qilingan_ishlar", undefined, "Qilingan ishlar"), undefined, false, tx("layout.tooltip_qilingan_ishlar", undefined, "Qilingan ishlar, izohlar va yangilanishlar"))
            ) : (
              !user?.is_sohaviy_boshqarma && !isPm &&
              item("/mening-ishim", <IconTasks />, tx("layout.mening_ishim"), counts.open, false, tx("layout.tooltip_mening_ishim"))
            )}
            {user?.is_sohaviy_boshqarma &&
              item("/buyurtmalar", <IconOrder />, tx("orders.sarlavha"), counts.orders, true, tx("layout.tooltip_buyurtmalar"))}
            {!user?.is_sohaviy_boshqarma &&
              (user?.can_access_orders || user?.is_platform_admin || user?.is_manager || user?.is_boss) &&
              item("/buyurtmalar", <IconOrder />, tx("orders.sarlavha"), counts.orders, true, tx("layout.tooltip_buyurtmalar"))}
            {manages && !user?.is_boss && item("/vazifalar", <IconLayers />, tx("common.vazifalar"), undefined, false, tx("layout.tooltip_vazifalar"))}
            {user?.is_boss && item("/jamoa", <IconUsers />, tx("layout.xodimlar", undefined, "Xodimlar"), undefined, false, tx("layout.tooltip_xodimlar", undefined, "Xodimlar — tashkilot xodimlari"))}
            {item("/taqvim", <IconCalendar />, tx("layout.taqvim"), undefined, false, tx("layout.tooltip_taqvim"))}
          </div>

          {/* 2. MULOQOT VA HAMKORLIK */}
          <div className="nav-section">
            <div className="nav-title">{tx("layout.bolim_muloqot")}</div>
            {item("/bildirishnomalar", <IconBell />, tx("common.bildirishnomalar"), notifCount, true, tx("layout.tooltip_bildirishnomalar"))}
            {manages && !user?.is_boss && item("/tekshiruv", <IconReview />, tx("common.tekshiruv_navbati"), counts.reviews, true, tx("layout.tooltip_tekshiruv"))}
            {item("/takliflar", <IconIdea />, tx("layout.takliflar"), counts.suggestions, true, tx("layout.tooltip_takliflar"))}
            {itemTo(toMessages(), <IconChat />, tx("layout.xabarlar"), undefined, false, tx("layout.tooltip_xabarlar"))}
          </div>

          {/* 3. KUZATUV VA BOSHQARUV */}
          <div className="nav-section">
            <div className="nav-title">{tx("layout.bolim_boshqaruv")}</div>
            {item("/tarix", <IconHistory />, tx("layout.umumiy_tarix"), undefined, false, tx("layout.tooltip_tarix"))}
            {user?.is_platform_admin &&
              item("/admin", <IconSettings />, tx("common.admin_panel") || "Admin panel", undefined, false, tx("layout.tooltip_admin"))}
          </div>

          <div className="sidebar-footer">
            <Link {...toSelfProfile()} className="sidebar-user">
              <Avatar user={user} showHoverCard={false} />
              <span style={{ minWidth: 0 }}>
                <span className="name">{user?.full_name}</span>
                <br />
                {/* Ism ostidagi satr - odam KIM ekani.
                    BOSHLIQ va TIZIM ADMINI uchun bu mutaxassislik emas.
                    `specialty` hamma hisobda bor va standarti «Backend
                    dasturchi» - ikkovi ham uni hech qachon tanlamagan,
                    kartada esa u lavozimdek ko'rinardi. Ularga tizimdagi
                    roli yoziladi, qolganlarga oldingidek yo'nalishi. */}
                <span className="role">
                  {user && (user.is_boss || user.is_platform_admin)
                    ? user.global_role_display
                    : user?.specialty_display}
                </span>
                <br />
                <span className="email">{user?.email}</span>
              </span>
            </Link>
            <button
              className="btn btn-sm btn-block btn-logout"
              onClick={() => {
                logout();
                go("/kirish");
              }}
            >
              <IconLogout size={14} /> {tx("common.chiqish")}
            </button>
          </div>
        </aside>

        <div className="main">
          {header}
          {/* Sahifa to'sig'i: bitta bo'lim yiqilsa yon panel, qidiruv va
              bildirishnomalar joyida qoladi - odam boshqa bo'limga o'tib
              ketaveradi. `key` manzil: yangi sahifada to'siq o'zi tiklanadi,
              aks holda xato holati saqlanib qolardi.

              O'sha `key` endi tashqi qatlamda turadi va qisqa o'tishni ham
              boshqaradi: bo'lim almashganda tugun yangidan chiziladi, ya'ni
              animatsiya o'z-o'zidan qaytadan boshlanadi. Manzilning FAQAT
              yo'l qismi olinadi - qidiruv parametri emas: aks holda filtr
              yozayotgan odam har harfda sahifaning yonib-o'chishini
              ko'rardi. */}
          <div className="page-swap" key={loc.pathname}>
            <ErrorBoundary>
              <TitleSlot.Provider value={titleSlot}>
                <Suspense fallback={<Loading text={tx("app.yuklanmoqda")} />}>
                  <Outlet />
                </Suspense>
              </TitleSlot.Provider>
            </ErrorBoundary>
          </div>
        </div>
        {showScrollTop && (
          <button
            type="button"
            className="scroll-top-float"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            title={tx("layout.tepaga_qaytish")}
            aria-label={tx("layout.tepaga_qaytish")}
          >
            <IconArrowUp size={18} />
          </button>
        )}
      </div>
    </>
  );
}

/**
 * Sahifa sarlavhasi.
 *
 * NOM TEPADA. `title` sahifaning ustida emas, YUQORI PANELDA - «orqaga»
 * tugmasidan keyin - chiziladi (`TitleSlot`). Shu sabab har bir sahifada
 * nom bir xil joyda turadi va mazmun uchun bir qator baland joy bo'shaydi.
 * Bu yerda qoladigani: amallar va bo'limlar.
 *
 * TAVSIF QATORI YO'Q. Ilgari nom ostida bir qator tushuntirish turardi
 * («Menga biriktirilgan barcha shaxsiy vazifalar»). U hech qachon o'qilmasdi:
 * sahifa nima qilishini nomi ham, mazmuni ham aytib turibdi. Endi sahifa
 * to'g'ridan-to'g'ri ishdan boshlanadi.
 */
export function PageHead({
  title,
  subtitle,
  actions,
  tabs,
  sticky = false,
}: {
  /** Yuqori panelga chiqadigan nom - matn ham, tugunlar ham bo'ladi */
  title: React.ReactNode;
  /** Sahifa vazifasini 1 qarashda tushuntiruvchi qisqa izoh / ma'lumot */
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  /**
   * Aylantirilganda sarlavha tepada YOPISHIB qoladi.
   */
  sticky?: boolean;
}) {
  const slot = useContext(TitleSlot);

  return (
    <>
      {/* Sahifaning YAGONA `h1` i - u endi panelda turadi. */}
      {slot && createPortal(
        <h1 onClick={toPageTop} title={tx("layout.sahifa_boshiga")}>{title}</h1>, slot)}

      {(subtitle || actions || tabs) && (
        <div className={`page-head ${sticky ? "sticky" : ""}`}>
          {(subtitle || actions) && (
            <div className="title-row">
              {subtitle && <div className="page-subtitle">{subtitle}</div>}
              <span className="spacer" />
              {actions}
            </div>
          )}
          {tabs && <div className="tabs">{tabs}</div>}
        </div>
      )}
    </>
  );
}
