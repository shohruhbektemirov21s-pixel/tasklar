/**
 * Bitta GET so'rovni sahifaga bog'lab beradigan hook.
 *
 * Uch muammoni birdaniga yopadi.
 *
 * XATOLIK. Ilgari sahifalar `api.get(...).then(setData)` deb yozardi,
 * `.catch` esa yo'q edi. Server xato bersa va'da rad etilardi, holat esa
 * `null` bo'lib qolardi - sahifa abadiy «Yuklanmoqda» da muzlab turardi va
 * odam sababini bilmasdi. Bu yerda xato ushlanadi va matn bo'lib qaytadi.
 *
 * POYGA. Filtrni yoki loyihani tez almashtirsangiz ikkita so'rov yo'lda
 * bo'ladi. Ular qaytish tartibi kafolatlanmagan: kechikkan ESKI javob
 * yangisining ustiga tushib, ekranda noto'g'ri ma'lumot qolardi. Endi eski
 * so'rov `AbortController` bilan bekor qilinadi, ustiga `alive` bayrog'i
 * ham bor - komponent yo'q bo'lgach holat umuman yozilmaydi.
 *
 * HAR HARFDA SO'ROV. Qidiruv maydoni bevosita parametrga ulanganda har
 * bosilgan tugma bitta so'rov tug'dirardi - "arxitektura" so'zini yozguncha
 * 12 ta. `debounceMs` bilan so'rov yozish to'xtaganda ketadi.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "./client";
import { tx } from "@/i18n";

type Params = Record<string, string | number | boolean | undefined | null>;

interface Options {
  /**
   * So'rovni shuncha millisekundga kechiktirish. Qidiruv maydoniga ulangan
   * so'rovlar uchun 250-300 ms qulay: odam yozayotganda so'rov ketmaydi,
   * to'xtagach esa sezilarli kutish bo'lmaydi.
   */
  debounceMs?: number;
  /**
   * Real-time fon yangilanishi davri (ms). Standart: 10 000 ms (10 soniya).
   * 0 bo'lsa fonda avtomatik interval bo'lmaydi.
   */
  pollIntervalMs?: number;
  /**
   * Foydalanuvchi sahifaga / tabga qaytganida avtomatik yangilash. Standart: true.
   */
  refreshOnFocus?: boolean;
}

interface Result<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  pending: boolean;
  reload: () => void;
}

export function useFetch<T>(path: string | null, params?: Params, opts: Options = {}): Result<T> {
  const { debounceMs = 0, pollIntervalMs = 0, refreshOnFocus = true } = opts;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(Boolean(path));
  const [tick, setTick] = useState(0);

  const key = JSON.stringify(params ?? null);
  const lastPath = useRef<string | null>(null);

  // Global refresh hodisasi (WebSocket orqali yoki Ctrl+R tugmasidan, yoki o'zgarishdan 5s keyin)
  useEffect(() => {
    if (!path) return;
    const onRefresh = () => {
      setTick((t) => t + 1);
    };
    window.addEventListener("teamflow:refresh", onRefresh);
    return () => window.removeEventListener("teamflow:refresh", onRefresh);
  }, [path]);

  // Tabga yoki oynaga qaytganda avtomatik yangilanish
  useEffect(() => {
    if (!path || refreshOnFocus === false) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        setTick((t) => t + 1);
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [path, refreshOnFocus]);

  // Davriy fon yangilanishi (agar sahifa alohida pollIntervalMs ko'rsatsa)
  useEffect(() => {
    if (!path) return;
    const interval = pollIntervalMs ?? 0;
    if (interval <= 0) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setTick((t) => t + 1);
      }
    }, interval);
    return () => window.clearInterval(timer);
  }, [path, pollIntervalMs]);

  useEffect(() => {
    if (!path) {
      setPending(false);
      return;
    }
    const ctl = new AbortController();
    let alive = true;

    if (lastPath.current !== path) {
      lastPath.current = path;
      setData(null);
    }
    setError(null);
    setPending(true);

    const run = () => {
      api.get<T>(path, params, ctl.signal)
        .then((d) => {
          if (!alive) return;
          setData(d);
          setPending(false);
        })
        .catch((e) => {
          if (!alive || (e instanceof DOMException && e.name === "AbortError")) return;
          setError(e instanceof ApiError ? e.message : tx("api_use_fetch.malumotni_yuklab_bolmadi"));
          setPending(false);
        });
    };

    let timer: number | undefined;
    if (debounceMs > 0) timer = window.setTimeout(run, debounceMs);
    else run();

    return () => {
      alive = false;
      window.clearTimeout(timer);
      ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key, tick, debounceMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading: pending && data === null, pending, reload };
}
