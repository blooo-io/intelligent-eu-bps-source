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
 * INT-256: while Refine revalidates auth (`isFetching`), keep already-
 * authenticated routes mounted. Swapping to `<Spin>` unmounted Privacy /
 * Reports mid-submit and wiped local state (e2e "flaky" Request status).
 */
export function ProtectedOutlet() {
  const { isFetching, data } = useIsAuthenticated();
  const authenticated = Boolean(data?.authenticated);

  if (isFetching && !authenticated) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spin size="large" />
      </main>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
