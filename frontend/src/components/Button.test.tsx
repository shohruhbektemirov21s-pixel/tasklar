/**
 * Yagona tugma komponenti.
 *
 * Qulflanadigan qoidalar:
 *   1. standart `type="button"` - forma ichida tasodifan yuborib yubormasin;
 *   2. `loading` tugmani bosib bo'lmaydigan qiladi va `aria-busy` beradi;
 *   3. `active` ekran o'quvchiga `aria-pressed` bo'lib yetadi;
 *   4. variant va o'lcham faqat klass orqali - `style` yo'q.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { Button, ButtonGroup, LinkButton, buttonClass } from "./Button";

describe("Button", () => {
  it("defaults to type=button and the secondary variant", () => {
    render(<Button>Saqlash</Button>);
    const btn = screen.getByRole("button", { name: "Saqlash" });
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.className).toBe("btn btn-secondary");
    expect(btn.hasAttribute("style")).toBe(false);
  });

  it("keeps an explicit submit type", () => {
    render(<Button type="submit" variant="primary">Yuborish</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("submit");
  });

  it("blocks clicks while loading", () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Yuklash</Button>);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
  });

  it("exposes the active state as aria-pressed", () => {
    render(
      <ButtonGroup>
        <Button active>Oy</Button>
        <Button active={false}>Hafta</Button>
      </ButtonGroup>,
    );
    expect(screen.getByRole("group").classList.contains("btn-group")).toBe(true);
    expect(screen.getByRole("button", { name: "Oy" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Hafta" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("maps props to classes", () => {
    expect(buttonClass({ variant: "danger", size: "sm", block: true, iconOnly: true, className: "x" }))
      .toBe("btn btn-danger btn-sm btn-block btn-icon x");
    expect(buttonClass({})).toBe("btn btn-secondary");
  });

  it("renders a router link with button classes", () => {
    render(
      <MemoryRouter>
        <LinkButton to="/panel" variant="primary" size="sm">Panel</LinkButton>
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Panel" });
    expect(link.getAttribute("href")).toBe("/panel");
    expect(link.className).toBe("btn btn-primary btn-sm");
  });
});
