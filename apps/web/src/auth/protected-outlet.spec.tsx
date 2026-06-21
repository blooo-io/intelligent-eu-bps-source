import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { Refine, type AuthProvider } from "@refinedev/core";
import { ProtectedOutlet } from "./protected-outlet";

function authProvider(authenticated: boolean): AuthProvider {
  return {
    login: async () => ({ success: true }),
    logout: async () => ({ success: true }),
    check: async () =>
      authenticated
        ? { authenticated: true }
        : { authenticated: false, redirectTo: "/login" },
    onError: async () => ({}),
  };
}

describe("ProtectedOutlet (INT-181)", () => {
  it("redirects unauthenticated visitors to /login", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Refine authProvider={authProvider(false)} options={{ disableRouteChangeHandler: true }}>
          <Routes>
            <Route element={<ProtectedOutlet />}>
              <Route index element={<div>Home secret</div>} />
            </Route>
            <Route path="/login" element={<button type="button">Continue with community IdP</button>} />
          </Routes>
        </Refine>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /continue with community idp/i })).toBeInTheDocument();
    });
    expect(screen.queryByText("Home secret")).not.toBeInTheDocument();
  });

  it("renders nested routes when authenticated", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Refine authProvider={authProvider(true)} options={{ disableRouteChangeHandler: true }}>
          <Routes>
            <Route element={<ProtectedOutlet />}>
              <Route index element={<div>Home secret</div>} />
            </Route>
          </Routes>
        </Refine>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Home secret")).toBeInTheDocument();
    });
  });
});
