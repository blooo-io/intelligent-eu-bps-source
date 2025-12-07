import { Authenticated, Refine } from "@refinedev/core";
import { RefineThemes } from "@refinedev/antd";
import { ConfigProvider, App as AntApp } from "antd";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import { createAuthProvider } from "./auth/auth-provider";
import type { OidcFacade } from "./auth/oidc";
import type { WebConfig } from "./api/config";
import { LoginPage } from "./pages/login-page";
import { CallbackPage } from "./pages/callback-page";
import { HomePage } from "./pages/home-page";

/**
 * AC-01 shell (TD-5): Refine + Ant Design + OIDC auth + public API.
 * INT-137: sign-in and readiness home only; further screens are INT-138+.
 */
export function App({ config, oidc }: { config: WebConfig; oidc: OidcFacade }) {
  const authProvider = createAuthProvider(oidc);

  return (
    <BrowserRouter>
      <ConfigProvider theme={RefineThemes.Blue}>
        <AntApp>
          <Refine
            authProvider={authProvider}
            options={{
              syncWithLocation: true,
              warnWhenUnsavedChanges: false,
            }}
          >
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/auth/callback" element={<CallbackPage oidc={oidc} />} />
              <Route
                element={
                  <Authenticated key="auth" redirectOnFail="/login" appendCurrentPathToQuery={false}>
                    <Outlet />
                  </Authenticated>
                }
              >
                <Route index element={<HomePage config={config} oidc={oidc} />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Refine>
        </AntApp>
      </ConfigProvider>
    </BrowserRouter>
  );
}
