/**
 * Loyiha formasidagi dasturchilar ro'yxati.
 *
 * Qulflanadigan qoidalar:
 *   1. ro'yxat serverdan so'raladi (`/users/?role=DEVELOPER`) - komponentda
 *      qotirilgan odam yo'q;
 *   2. jami son `count` dan olinadi, ekrandagi qatorlardan emas;
 *   3. jamoaga olingan odam ro'yxatda qayta ko'rinmaydi, «+» uni qaytaradi.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserBrief } from "@/api/types";

const get = vi.fn();
vi.mock("@/api/client", async (orig) => ({
  ...(await orig<typeof import("@/api/client")>()),
  api: { get: (...args: unknown[]) => get(...args) },
}));

import DeveloperList from "./DeveloperList";

const dev = (id: number, full_name: string) =>
  ({ id, full_name, email: `d${id}@t.uz`, global_role: "DEVELOPER" }) as UserBrief;

describe("DeveloperList", () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue({ count: 23, results: [dev(1, "Ali Valiyev"), dev(2, "Vali Aliyev")] });
  });

  it("dasturchilarni serverdan so'raydi", async () => {
    render(<DeveloperList pickedIds={[]} onPick={() => {}} />);
    expect(await screen.findByText("Ali Valiyev")).toBeTruthy();
    const [path, params] = get.mock.calls[0];
    expect(path).toBe("/users/");
    expect(params).toMatchObject({ role: "DEVELOPER", page: 1 });
  });

  it("jami sonni `count` dan oladi va sahifalaydi", async () => {
    render(<DeveloperList pickedIds={[]} onPick={() => {}} />);
    await screen.findByText("Ali Valiyev");
    // 23 ta / 10 tadan = 3 sahifa: Pager ko'rinadi.
    expect(screen.getByRole("navigation")).toBeTruthy();
  });

  it("tanlanganlar ko'rinmaydi, «+» odamni qaytaradi", async () => {
    const onPick = vi.fn();
    const { container } = render(<DeveloperList pickedIds={[1]} onPick={onPick} />);
    await screen.findByText("Vali Aliyev");
    expect(screen.queryByText("Ali Valiyev")).toBeNull();
    fireEvent.click(container.querySelector(".dev-list-rows button") as HTMLButtonElement);
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 2 })));
  });
});
