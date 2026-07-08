import { useIsAuthenticated } from "@refinedev/core";
import { Spin } from "antd";
import { Navigate, Outlet } from "react-router";

/**
 * Protects nested routes with a real react-router redirect (INT-181).
 *
 * Refine `<Authenticated>` redirects via `useGo()`. Without a working
 * `routerProvider`, `go()` is a no-op and the gate renders `null` — blank
 * page on `/` while `/login` still works.
 *
 * INT-256: gate only on the *initial* auth query (`isLoading` / no data yet).
 * Background revalidation (`isFetching` with cached data) must not swap the
 * tree for `<Spin>` — that unmounted Privacy / Reports mid-submit and wiped
 * local state (e2e Request status flake).
 */
export function ProtectedOutlet() {
  const { isLoading, data } = useIsAuthenticated();

  if (isLoading) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spin size="large" />
      </main>
    );
  }

  if (!data?.authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
