import { useIsAuthenticated } from "@refinedev/core";
import { Spin } from "antd";
import { Navigate, Outlet } from "react-router";

/**
 * Protects nested routes with a real react-router redirect (INT-181).
 *
 * Refine `<Authenticated>` redirects via `useGo()`. Without a working
 * `routerProvider`, `go()` is a no-op and the gate renders `null` — blank
 * page on `/` while `/login` still works.
 */
export function ProtectedOutlet() {
  const { isFetching, data } = useIsAuthenticated();

  if (isFetching) {
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
