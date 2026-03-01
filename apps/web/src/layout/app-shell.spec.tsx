import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { AppShell } from "./app-shell";

vi.mock("@refinedev/core", () => ({
  useLogout: () => ({ mutate: vi.fn() }),
}));

const NAV_LABELS = [
  /^home$/i,
  /get ready/i,
  /profile/i,
  /terms/i,
  /payment setup/i,
  /balances/i,
  /invoices/i,
  /privacy/i,
  /community settings/i,
  /participants/i,
  /billing runs/i,
  /payments overview/i,
  /reports/i,
  /operator/i,
];

describe("AppShell (INT-187 / INT-188)", () => {
  it("renders a dark sider with brand mark and every protected nav link", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<div>Home body</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("INTELLIGENT billing")).toBeInTheDocument();
    expect(document.querySelector(".ge-brand-mark")).toBeTruthy();
    expect(screen.getByText("Home body")).toBeInTheDocument();
    for (const label of NAV_LABELS) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    expect(document.querySelector(".ant-menu-dark")).toBeTruthy();
  });

  it("highlights the active route in the sider", () => {
    render(
      <MemoryRouter initialEntries={["/invoices"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="invoices" element={<div>Invoices body</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const invoices = screen.getByRole("link", { name: /invoices/i });
    expect(invoices.closest("li")?.className ?? "").toMatch(/ant-menu-item-selected/);
  });
});
