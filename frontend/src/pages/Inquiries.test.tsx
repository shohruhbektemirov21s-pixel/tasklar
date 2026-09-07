import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/api/types";

let mockUser: Partial<User> | null = null;
let mockLoading = false;

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: mockLoading,
  }),
}));

vi.mock("@/realtime/RealtimeContext", () => ({
  useLive: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  api: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url.includes("/counts/")) {
        return Promise.resolve({
          open: 1, closed: 0, pending: 1, all: 1, mine: 0, PENDING: 1, APPROVED: 0, REJECTED: 0,
        });
      }
      return Promise.resolve({
        count: 1,
        results: [{
          id: 1,
          title: "Test so'rov",
          body: "So'rov matni",
          scope: "OPEN",
          scope_display: "Ochiq",
          is_anonymous: false,
          status: "PENDING",
          status_display: "Ko'rib chiqilmoqda",
          author: { id: 2, full_name: "Ali Valiyev" },
          decided_by: null,
          decided_at: null,
          decision_note: "",
          for_count: 3,
          against_count: 0,
          neutral_count: 0,
          score: 3,
          my_vote: null,
          files: [],
          is_mine: false,
          can_edit: false,
          can_decide: false,
          can_vote: true,
          created_at: "2026-09-07T10:00:00Z",
          updated_at: "2026-09-07T10:00:00Z",
        }],
      });
    }),
  },
}));

import Inquiries from "./Inquiries";

describe("Inquiries page — ruxsat va ko'rinish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Ruxsatsiz foydalanuvchi /panel ga yo'naltiriladi", () => {
    mockUser = { id: 1, has_inquiries_access: false } as User;
    render(
      <MemoryRouter initialEntries={["/sorovlar"]}>
        <Routes>
          <Route path="/sorovlar" element={<Inquiries />} />
          <Route path="/panel" element={<div data-testid="panel-page">Bosh panel</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId("panel-page")).toBeTruthy();
  });

  it("Ruxsatli foydalanuvchiga So'rovlar sahifasi ochiladi", async () => {
    mockUser = { id: 1, has_inquiries_access: true } as User;
    render(
      <MemoryRouter initialEntries={["/sorovlar"]}>
        <Routes>
          <Route path="/sorovlar" element={<Inquiries />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("So'rovlar")).toBeTruthy();
    expect(await screen.findByText("Test so'rov")).toBeTruthy();
  });
});
