import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { tx } from "@/i18n";

export interface NavHistoryItem {
  /** React Router tarix indeksi (window.history.state.idx) */
  idx: number;
  /** React Router location.key */
  key: string;
  /** Marshrut yo'li, masalan /xodimlar yoki /profil */
  pathname: string;
  /** Qidiruv yoki query parametri, agar bo'lsa */
  search: string;
  /** Sahifa holati (nav state) */
  state: any;
  /** Sahifa nomi (PageHead dan olingan yoki marshrut bo'yicha) */
  title: string;
  /** Qadam yaratilgan vaqt */
  timestamp: number;
}

const STORAGE_KEY = "tf_nav_history_stack_v1";
const EVENT_NAME = "tf:history-updated";
const MAX_HISTORY = 50;

/** Sarlavhadagi ortiqcha bo'shliqlar va belgilarni tozalash */
export function cleanHistoryTitle(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (cleaned.length > 55) {
    return cleaned.slice(0, 52) + "...";
  }
  return cleaned;
}

/** Marshrut bo'yicha zaxira nom (hali PageHead yuklanmagan paytda) */
export function getFallbackRouteTitle(pathname: string, state?: any): string {
  if (pathname === "/panel") return tx("layout.bosh_panel", undefined, "Bosh panel");
  if (pathname === "/mening-ishim") return tx("layout.mening_ishim", undefined, "Mening ishim");
  if (pathname === "/loyihalar") return tx("projects.loyihalar", undefined, "Loyihalar");
  if (pathname.startsWith("/loyiha/yangi")) return tx("workspace_form.yangi_loyiha", undefined, "Yangi loyiha");
  if (pathname.startsWith("/loyiha/tahrir")) return tx("project_detail.loyiha_tahrirlash", undefined, "Loyiha tahrirlash");
  if (pathname.startsWith("/loyiha/vazifa-yaratish")) return tx("project_detail.vazifa_yaratish", undefined, "Vazifa yaratish");
  if (pathname.startsWith("/loyiha/koplab-vazifa")) return tx("project_detail.koplab_vazifa", undefined, "Ko'plab vazifa");
  if (pathname.startsWith("/loyiha/dasturchi")) return tx("project_detail.dasturchi_hisoboti", undefined, "Dasturchi hisoboti");
  if (pathname.startsWith("/loyiha/qoshilish")) return tx("discover.loyihaga_qoshilish", undefined, "Loyihaga qo'shilish");
  if (pathname.startsWith("/loyiha")) return tx("projects.loyiha", undefined, "Loyiha");
  if (pathname === "/vazifalar") return tx("common.vazifalar", undefined, "Vazifalar");
  if (pathname.startsWith("/vazifa/tahrir")) return tx("task_detail.vazifani_tahrirlash", undefined, "Vazifa tahrirlash");
  if (pathname.startsWith("/vazifa")) return tx("task_detail.vazifa", undefined, "Vazifa");
  if (pathname === "/jamoa" || pathname === "/xodimlar") return tx("people.foydalanuvchilar", undefined, "Xodimlar");
  if (pathname.startsWith("/profil")) {
    return state?.user ? tx("profile.xodim_profili", undefined, "Xodim profili") : tx("profile.profil", undefined, "Profil");
  }
  if (pathname === "/ish-maydonlari") return tx("workspaces.ish_maydonlari", undefined, "Ish maydonlari");
  if (pathname.startsWith("/ish-maydoni/yangi")) return tx("workspace_form.yangi_ish_maydoni", undefined, "Yangi ish maydoni");
  if (pathname.startsWith("/ish-maydoni/chat")) return tx("workspace_detail.chat", undefined, "Ish maydoni suhbati");
  if (pathname.startsWith("/ish-maydoni")) return tx("workspaces.ish_maydoni", undefined, "Ish maydoni");
  if (pathname === "/tekshiruv") return tx("review.tekshiruv_navbati", undefined, "Tekshiruv navbati");
  if (pathname === "/tarix") return tx("feed.umumiy_tarix", undefined, "Umumiy tarix");
  if (pathname === "/taqvim") return tx("calendar.taqvim", undefined, "Taqvim");
  if (pathname === "/xabarlar") return tx("messages.xabarlar", undefined, "Xabarlar");
  if (pathname === "/bildirishnomalar") return tx("notifications.bildirishnomalar", undefined, "Bildirishnomalar");
  if (pathname === "/takliflar") return tx("suggestions.takliflar", undefined, "Takliflar");
  if (pathname.startsWith("/taklif")) return tx("suggestions.taklif", undefined, "Taklif");
  if (pathname === "/sorovlar") return tx("inquiries.sorovlar", undefined, "So'rovlar");
  if (pathname === "/buyurtmalar") return tx("change_requests.buyurtmalar", undefined, "Buyurtmalar");
  if (pathname.startsWith("/buyurtma")) return tx("change_requests.buyurtma", undefined, "Buyurtma");
  if (pathname === "/admin") return tx("admin.boshqaruv_paneli", undefined, "Admin panel");
  return tx("common.sahifa", undefined, "Sahifa");
}

export function readHistory(): NavHistoryItem[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeHistory(items: NavHistoryItem[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // sessionStorage to'lgan bo'lsa yoki shaxsiy rejimda
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }
}

/** Navigatsiya sodir bo'lganda qadamni tarixga qo'shish yoki yangilash */
export function recordNavStep(
  location: { pathname: string; search: string; state: any; key: string },
  currentIdx: number,
  title?: string,
): NavHistoryItem[] {
  const items = readHistory();
  const fallback = getFallbackRouteTitle(location.pathname, location.state);
  const clean = cleanHistoryTitle(title || fallback);

  const existingIdx = items.findIndex((x) => x.idx === currentIdx);

  let nextItems: NavHistoryItem[];
  if (existingIdx >= 0) {
    // Joriy indeksdagi qadamni yangilaymiz
    const updated = {
      ...items[existingIdx],
      pathname: location.pathname,
      search: location.search || "",
      state: location.state,
      title: title ? clean : items[existingIdx].title || clean,
      key: location.key,
      timestamp: Date.now(),
    };
    nextItems = items.slice(0, existingIdx);
    nextItems.push(updated);
  } else {
    // Yangi qadam qo'shilyapti: joriy indeksdan keyingi eski shoxlar kesiladi
    nextItems = items.filter((x) => x.idx < currentIdx);
    nextItems.push({
      idx: currentIdx,
      key: location.key,
      pathname: location.pathname,
      search: location.search || "",
      state: location.state,
      title: clean,
      timestamp: Date.now(),
    });
  }

  // Maksimal o'lcham chegarasi
  if (nextItems.length > MAX_HISTORY) {
    nextItems = nextItems.slice(nextItems.length - MAX_HISTORY);
  }

  writeHistory(nextItems);
  return nextItems;
}

/** PageHead yuklangach haqiqiy aniq sarlavhani yozish */
export function updateStepTitle(currentIdx: number, rawTitle: string): void {
  if (!rawTitle) return;
  const items = readHistory();
  const target = items.find((x) => x.idx === currentIdx);
  if (!target) return;

  const cleaned = cleanHistoryTitle(rawTitle);
  if (cleaned && cleaned !== target.title) {
    target.title = cleaned;
    writeHistory(items);
  }
}

/** Tarixni tozalash (faqat hozirgi qadamni qoldiradi) */
export function clearNavHistory(): void {
  const currentIdx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  const items = readHistory().filter((x) => x.idx === currentIdx);
  writeHistory(items);
}

/** Bosilgan qadamlar tarixidan foydalanish hook'i */
export function useNavHistory() {
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState<NavHistoryItem[]>(readHistory);

  const currentIdx = useMemo(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    return typeof idx === "number" ? idx : 0;
  }, [location.key]);

  useEffect(() => {
    const onUpdate = () => setItems(readHistory());
    window.addEventListener(EVENT_NAME, onUpdate);
    return () => window.removeEventListener(EVENT_NAME, onUpdate);
  }, []);

  const goBackTo = useCallback(
    (step: NavHistoryItem) => {
      const curr = (window.history.state as { idx?: number } | null)?.idx;
      if (typeof curr === "number" && typeof step.idx === "number") {
        const delta = step.idx - curr;
        if (delta !== 0) {
          navigate(delta);
          return;
        }
      }
      navigate(step.pathname + (step.search || ""), { state: step.state });
    },
    [navigate],
  );

  return {
    history: items,
    currentIdx,
    goBackTo,
    clearHistory: clearNavHistory,
  };
}

/** Layout da o'tirib har bir qadamni va sarlavhani avtomatik kuzatuvchi hook */
export function useHistoryTracker(titleSlot: HTMLElement | null) {
  const location = useLocation();
  const currentIdx = (window.history.state as { idx?: number } | null)?.idx ?? 0;

  // Marshrut o'zgarganda qadamni yozish
  useEffect(() => {
    recordNavStep(location, currentIdx);
  }, [location.pathname, location.search, location.key, location.state, currentIdx]);

  // PageHead slotiga yangi sarlavha tushganda uni aniq yozish
  useEffect(() => {
    if (!titleSlot) return;

    const syncTitle = () => {
      const text = titleSlot.textContent?.trim();
      if (text) {
        updateStepTitle(currentIdx, text);
      }
    };

    // Darhol tekshirish
    syncTitle();

    // Keyingi o'zgarishlarni (masalan API dan nom kelganda) kuzatish
    const observer = new MutationObserver(syncTitle);
    observer.observe(titleSlot, { childList: true, subtree: true, characterData: true });

    return () => observer.disconnect();
  }, [titleSlot, currentIdx]);
}
