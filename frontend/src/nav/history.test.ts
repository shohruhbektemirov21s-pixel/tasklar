import { describe, expect, it, beforeEach } from "vitest";
import {
  cleanHistoryTitle,
  clearNavHistory,
  getFallbackRouteTitle,
  readHistory,
  recordNavStep,
  updateStepTitle,
} from "./history";

describe("Navigation History Tracker", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("tozalanmagan sarlavhani to'g'ri tozalaydi va qisqartiradi", () => {
    expect(cleanHistoryTitle("   Mening    ishim   ")).toBe("Mening ishim");
    expect(cleanHistoryTitle("")).toBe("");

    const longTitle = "A".repeat(100);
    const cleaned = cleanHistoryTitle(longTitle);
    expect(cleaned.length).toBeLessThanOrEqual(55);
    expect(cleaned.endsWith("...")).toBe(true);
  });

  it("marshrutlar bo'yicha zaxira nomlarni aniqlaydi", () => {
    expect(getFallbackRouteTitle("/panel")).toBe("Bosh panel");
    expect(getFallbackRouteTitle("/jamoa")).toBe("Xodimlar");
    expect(getFallbackRouteTitle("/xodimlar")).toBe("Xodimlar");
    expect(getFallbackRouteTitle("/profil", { user: 5 })).toBe("Xodim profili");
    expect(getFallbackRouteTitle("/profil")).toBe("Profil");
    expect(getFallbackRouteTitle("/loyihalar")).toBe("Loyihalar");
    expect(getFallbackRouteTitle("/vazifa")).toBe("Vazifa");
  });

  it("ketma-ket navigatsiya qilinganda qadamlarni tarixga to'g'ri yozadi", () => {
    // 1-qadam: Bosh panel
    recordNavStep({ pathname: "/panel", search: "", state: null, key: "k0" }, 0, "Bosh panel");
    let items = readHistory();
    expect(items).toHaveLength(1);
    expect(items[0].idx).toBe(0);
    expect(items[0].title).toBe("Bosh panel");

    // 2-qadam: Xodimlar
    recordNavStep({ pathname: "/xodimlar", search: "", state: null, key: "k1" }, 1, "Xodimlar");
    items = readHistory();
    expect(items).toHaveLength(2);
    expect(items[1].idx).toBe(1);
    expect(items[1].title).toBe("Xodimlar");

    // 3-qadam: Sherzod profili
    recordNavStep({ pathname: "/profil", search: "", state: { user: 14 }, key: "k2" }, 2, "Profil: Sherzod Temirov");
    items = readHistory();
    expect(items).toHaveLength(3);
    expect(items[2].idx).toBe(2);
    expect(items[2].title).toBe("Profil: Sherzod Temirov");
    expect(items[2].state).toEqual({ user: 14 });
  });

  it("orqaga qaytib yangi sahifaga o'tilganda eski oldinga shoxlarni kesadi", () => {
    recordNavStep({ pathname: "/panel", search: "", state: null, key: "k0" }, 0, "Bosh panel");
    recordNavStep({ pathname: "/xodimlar", search: "", state: null, key: "k1" }, 1, "Xodimlar");
    recordNavStep({ pathname: "/profil", search: "", state: { user: 14 }, key: "k2" }, 2, "Profil: Sherzod");

    // Foydalanuvchi orqaga qaytdi (idx: 1) va yangi sahifaga (idx: 2) bordi
    recordNavStep({ pathname: "/loyihalar", search: "", state: null, key: "k2_new" }, 2, "Loyihalar");

    const items = readHistory();
    expect(items).toHaveLength(3);
    expect(items[0].title).toBe("Bosh panel");
    expect(items[1].title).toBe("Xodimlar");
    expect(items[2].title).toBe("Loyihalar");
  });

  it("sahifada filtr o'zgarganda (replace: true) xuddi shu indeksdagi yozuv yangilanadi", () => {
    recordNavStep({ pathname: "/xodimlar", search: "", state: null, key: "k1" }, 1, "Xodimlar");

    // Filtr o'zgardi (idx: 1 o'zgarishsiz qoldi)
    recordNavStep(
      { pathname: "/xodimlar", search: "", state: { f: "search=dev&page=2" }, key: "k1" },
      1,
    );

    const items = readHistory();
    expect(items).toHaveLength(1);
    expect(items[0].idx).toBe(1);
    expect(items[0].state).toEqual({ f: "search=dev&page=2" });
    expect(items[0].title).toBe("Xodimlar");
  });

  it("PageHead yuklangandan keyin sarlavha updateStepTitle orqali aniq yangilanadi", () => {
    recordNavStep({ pathname: "/profil", search: "", state: { user: 99 }, key: "k1" }, 1);
    expect(readHistory()[0].title).toBe("Xodim profili");

    updateStepTitle(1, "Profil: Jasur Rahimov");
    expect(readHistory()[0].title).toBe("Profil: Jasur Rahimov");
  });

  it("tarix tozalanganda faqat hozirgi qadam qoladi", () => {
    recordNavStep({ pathname: "/panel", search: "", state: null, key: "k0" }, 0, "Bosh panel");
    recordNavStep({ pathname: "/xodimlar", search: "", state: null, key: "k1" }, 1, "Xodimlar");

    // window.history.state ni simulyatsiya qilish
    window.history.replaceState({ idx: 1 }, "");

    clearNavHistory();
    const items = readHistory();
    expect(items).toHaveLength(1);
    expect(items[0].idx).toBe(1);
    expect(items[0].title).toBe("Xodimlar");
  });
});
