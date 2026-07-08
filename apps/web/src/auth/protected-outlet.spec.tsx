import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { Refine, type AuthProvider, useIsAuthenticated } from "@refinedev/core";
import { ProtectedOutlet } from "./protected-outlet";

vi.mock("@refinedev/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@refinedev/core")>();
  return {
    ...actual,
    useIsAuthenticated: vi.fn(),
  };
});

const useIsAuthenticatedMock = vi.mocked(useIsAuthenticated);

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

describe("ProtectedOutlet (INT-181 / INT-256)", () => {
  beforeEach(() => {
    useIsAuthenticatedMock.mockReset();
  });

  it("redirects unauthenticated visitors to /login", async () => {
    useIsAuthenticatedMock.mockReturnValue({
      isLoading: false,
      isFetching: false,
      data: { authenticated: false },
    } as ReturnType<typeof useIsAuthenticated>);

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
    useIsAuthenticatedMock.mockReturnValue({
      isLoading: false,
      isFetching: false,
      data: { authenticated: true },
    } as ReturnType<typeof useIsAuthenticated>);

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

  it("keeps authenticated routes mounted while auth revalidates (INT-256)", () => {
    useIsAuthenticatedMock.mockReturnValue({
      isLoading: false,
      isFetching: true,
      data: { authenticated: true },
    } as ReturnType<typeof useIsAuthenticated>);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Refine authProvider={authProvider(true)} options={{ disableRouteChangeHandler: true }}>
          <Routes>
            <Route element={<ProtectedOutlet />}>
              <Route index element={<div data-testid="kept">Form state</div>} />
            </Route>
          </Routes>
        </Refine>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("kept")).toBeInTheDocument();
    expect(document.querySelector(".ant-spin")).toBeNull();
  });

  it("shows a spinner only on the initial auth check", () => {
    useIsAuthenticatedMock.mockReturnValue({
      isLoading: true,
      isFetching: true,
      data: undefined,
    } as ReturnType<typeof useIsAuthenticated>);

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

    expect(screen.queryByText("Home secret")).not.toBeInTheDocument();
    expect(document.querySelector(".ant-spin")).toBeTruthy();
  });
});
