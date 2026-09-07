/**
 * Senior QA Test Suite — AdminGate komponenti testlari.
 *
 * Tekshiriladigan xavfsizlik va foydalanish ssenariylari:
 *   1. Yuklanish holati (loading) to'g'ri ko'rsatilishi.
 *   2. Tizim admini hisobi bilan kirilganda Outlet ochilishi.
 *   3. Huquqi bo'lmagan foydalanuvchiga taqiq xabari va chiqish (logout) tugmasi ko'rsatilishi.
 *   4. Tizimga kirmagan holatda login va parol formasi ko'rsatilishi.
 *   5. Kirish formasida xato yuz berganda xatolik xabari aks etishi.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/api/types";
import { ApiError } from "@/api/client";

// Kontekst holatini boshqarish uchun o'zgaruvchilar
let mockUser: Partial<User> | null = null;
let mockLoading = false;
const mockLogin = vi.fn();
const mockLogout = vi.fn();

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: mockLoading,
    login: mockLogin,
    logout: mockLogout,
  }),
}));

vi.mock("@/theme", () => ({
  useTheme: () => ({
    theme: "light",
    toggle: vi.fn(),
  }),
}));

import AdminGate from "./AdminGate";

function renderGate() {
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route path="/admin" element={<AdminGate />}>
          <Route index element={<div data-testid="admin-panel-content">Boshqaruv Paneli</div>} />
        </Route>
        <Route path="/panel" element={<div>Asosiy Panel</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("AdminGate — Senior QA ruxsatlar va ko'rinish testi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    mockLoading = false;
  });

  it("yuklanayotgan paytda yuklanish ko'rsatkichini beradi", () => {
    mockLoading = true;
    renderGate();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByTestId("admin-panel-content")).toBeNull();
  });

  it("platforma admini bo'lsa ichki panelni to'g'ridan-to'g'ri ochadi", () => {
    mockUser = {
      id: 1,
      full_name: "Bosh Admin",
      is_platform_admin: true,
      global_role: "ADMIN",
      global_role_display: "Administrator",
    } as User;

    renderGate();
    expect(screen.getByTestId("admin-panel-content")).toBeTruthy();
    expect(screen.getByText("Boshqaruv Paneli")).toBeTruthy();
  });

  it("admin bo'lmagan foydalanuvchiga ogohlantirish va chiqish tugmasini ko'rsatadi", () => {
    mockUser = {
      id: 2,
      full_name: "Jasur Dasturchi",
      is_platform_admin: false,
      global_role: "DEVELOPER",
      global_role_display: "Dasturchi",
    } as User;

    renderGate();
    // Ichki panel ochilmasligi shart
    expect(screen.queryByTestId("admin-panel-content")).toBeNull();

    // Foydalanuvchi ismi va ogohlantirish ko'rinishi shart
    expect(screen.getByText("Jasur Dasturchi")).toBeTruthy();

    // Chiqish tugmasi mavjudligi va bosilganda logout chaqirilishi
    const logoutBtn = screen.getByRole("button", { name: "common.chiqish" });
    expect(logoutBtn).toBeTruthy();
    fireEvent.click(logoutBtn);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it("tizimga kirmagan bo'lsa kirish formasini ko'rsatadi va submit ishlaydi", async () => {
    mockUser = null;
    mockLogin.mockResolvedValueOnce(undefined);

    renderGate();
    expect(screen.queryByTestId("admin-panel-content")).toBeNull();

    const usernameInput = screen.getByLabelText("admin_gate.login");
    const passwordInput = screen.getByLabelText("common.parol");
    const submitBtn = screen.getByRole("button", { name: "common.kirish" });

    expect(usernameInput).toBeTruthy();
    expect(passwordInput).toBeTruthy();
    expect(submitBtn).toBeTruthy();

    fireEvent.change(usernameInput, { target: { value: "admin@teamflow.uz" } });
    fireEvent.change(passwordInput, { target: { value: "admin12345" } });
    fireEvent.click(submitBtn);

    expect(mockLogin).toHaveBeenCalledWith("admin@teamflow.uz", "admin12345");
  });

  it("login xatosi bo'lganda foydalanuvchiga xatolik matnini chiqaradi", async () => {
    mockUser = null;
    mockLogin.mockRejectedValueOnce(new ApiError(400, "Login yoki parol noto'g'ri."));

    renderGate();
    const usernameInput = screen.getByLabelText("admin_gate.login");
    const passwordInput = screen.getByLabelText("common.parol");
    const submitBtn = screen.getByRole("button", { name: "common.kirish" });

    fireEvent.change(usernameInput, { target: { value: "xato@teamflow.uz" } });
    fireEvent.change(passwordInput, { target: { value: "xatoparol" } });
    fireEvent.click(submitBtn);

    const errMsg = await screen.findByText("Login yoki parol noto'g'ri.");
    expect(errMsg).toBeTruthy();
  });
});
