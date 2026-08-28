/**
 * Taklif qatori qatorning O'ZIDA yoyiladimi.
 *
 * NEGA AYNAN SHU. Yoyilish buzilganda hech qanday xato chiqmaydi - qator
 * shunchaki javob bermay qo'yadi yoki, battari, eski holiga qaytib
 * sahifaga o'tib ketadi. Ro'yxatning butun ma'nosi shunda: odam bir
 * nechta taklifni ketma-ket o'qib chiqib ovoz beradi va o'rnini
 * yo'qotmaydi.
 *
 * Uchta qoida qulflanadi:
 *   1. boshida hech biri yoyilmagan va taklif MATNI ko'rinmaydi;
 *   2. qator bosilganda matn o'sha yerda ochiladi - hech qayerga
 *      o'tilmaydi;
 *   3. ikkinchisi ochilganda birinchisi yopiladi (bir vaqtda BITTA).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Suggestion } from "@/api/types";

/* Sahifa serverdan ma'lumot so'raydi va WebSocket ga ulanadi - testda
   ikkovi ham kerak emas. Faqat SHU sahifaning o'z mantiqi sinaladi. */
vi.mock("@/api/useFetch", () => {
  /* Javob HAR renderda bir xil obyekt bo'lishi shart - haqiqiy `useFetch`
     uni `useState` da saqlaydi. Yangi obyekt qaytarilsa sahifadagi
     "javob o'zgardi" effektlari har renderda qayta ishlab, sikl hosil
     qilardi. */
  const cache = new Map<string, unknown>();
  const noop = () => {};
  return {
    useFetch: (path: string) => {
      if (!cache.has(path)) {
        cache.set(path, path === "/suggestions/"
          ? { count: ROWS.length, results: ROWS }
          : { PENDING: ROWS.length, APPROVED: 0, REJECTED: 0 });
      }
      return { data: cache.get(path), error: null, loading: false, reload: noop };
    },
  };
});
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/realtime/RealtimeContext", () => ({ useLive: () => {} }));

import Suggestions from "./Suggestions";

/** Sinov taklifi - faqat qator uchun kerakli maydonlar to'ldirilgan. */
function make(id: number, title: string, body: string): Suggestion {
  return {
    id, title, body,
    scope: "OPEN", scope_display: "Ochiq", is_anonymous: true,
    status: "PENDING", status_display: "Ko'rib chiqilmoqda",
    author: null, decided_by: null, decided_at: null, decision_note: "",
    for_count: 0, against_count: 0, neutral_count: 0, score: 0, my_vote: null,
    files: [],
    is_mine: false, can_edit: false, can_decide: false, can_vote: false,
    created_at: "2026-01-01T10:00:00Z", updated_at: "2026-01-01T10:00:00Z",
  } as Suggestion;
}

const ROWS = [
  make(1, "Birinchi taklif", "Birinchi taklifning to'liq matni"),
  make(2, "Ikkinchi taklif", "Ikkinchi taklifning to'liq matni"),
];

function open() {
  return render(<MemoryRouter><Suggestions /></MemoryRouter>);
}

describe("Takliflar — qator o'z joyida yoyiladi", () => {
  beforeEach(() => sessionStorage.clear());

  it("boshida hech qaysi taklifning matni ko'rinmaydi", () => {
    open();
    expect(screen.getByRole("button", { name: "Birinchi taklif" })
      .getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Birinchi taklifning to'liq matni")).toBeNull();
  });

  it("sarlavha bosilganda matn o'sha yerda ochiladi", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Birinchi taklif" }));

    expect(screen.getByText("Birinchi taklifning to'liq matni")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Birinchi taklif" })
      .getAttribute("aria-expanded")).toBe("true");
  });

  it("qayta bosilganda yig'iladi", () => {
    open();
    const title = screen.getByRole("button", { name: "Birinchi taklif" });
    fireEvent.click(title);
    fireEvent.click(title);
    expect(screen.queryByText("Birinchi taklifning to'liq matni")).toBeNull();
  });

  it("ikkinchisi ochilganda birinchisi yopiladi", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Birinchi taklif" }));
    fireEvent.click(screen.getByRole("button", { name: "Ikkinchi taklif" }));

    expect(screen.queryByText("Birinchi taklifning to'liq matni")).toBeNull();
    expect(screen.getByText("Ikkinchi taklifning to'liq matni")).toBeTruthy();
  });

  it("yoyilgan qatordan taklifning o'z sahifasiga havola qoladi", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Birinchi taklif" }));
    expect(screen.getByRole("link", { name: "suggestions.toliq_sahifada" })
      .getAttribute("href")).toBe("/taklif");
  });
});
