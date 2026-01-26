import { Refine } from "@refinedev/core";
import { ConfigProvider, App as AntApp } from "antd";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { createAuthProvider } from "./auth/auth-provider";
import { ProtectedOutlet } from "./auth/protected-outlet";
import type { OidcFacade } from "./auth/oidc";
import type { WebConfig } from "./api/config";
import { LoginPage } from "./pages/login-page";
import { CallbackPage } from "./pages/callback-page";
import { HomePage } from "./pages/home-page";
import { ProfilePage } from "./pages/profile-page";
import { TermsPage } from "./pages/terms-page";
import { PaymentSetupPage } from "./pages/payment-setup-page";
import { BalancesPage } from "./pages/balances-page";
import { InvoicesPage } from "./pages/invoices-page";
import { PrivacyPage } from "./pages/privacy-page";
import { CommunitySettingsPage } from "./pages/community-settings-page";
import { ParticipantsPage } from "./pages/participants-page";
import { BillingRunsPage } from "./pages/billing-runs-page";
import { PaymentsOverviewPage } from "./pages/payments-overview-page";
import { ReportsPage } from "./pages/reports-page";
import { OperatorPage } from "./pages/operator-page";
import { appTheme } from "./theme";

/**
 * AC-01 shell (TD-5): Refine + Ant Design + OIDC auth + public API.
 * Screens through INT-149 operator ops (AC-01 factory screens complete).
 *
 * Auth gate uses react-router `<Navigate>` (INT-181) — not Refine
 * `<Authenticated>` / `useGo`, which no-ops without a routerProvider.
 */
export function App({ config, oidc }: { config: WebConfig; oidc: OidcFacade }) {
  const authProvider = createAuthProvider(oidc);

  return (
    <BrowserRouter>
      <ConfigProvider theme={appTheme}>
        <AntApp>
          <Refine
            authProvider={authProvider}
            options={{
              syncWithLocation: true,
              warnWhenUnsavedChanges: false,
              disableRouteChangeHandler: true,
            }}
          >
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/auth/callback" element={<CallbackPage oidc={oidc} />} />
              <Route element={<ProtectedOutlet />}>
                <Route index element={<HomePage config={config} oidc={oidc} />} />
                <Route path="profile" element={<ProfilePage config={config} oidc={oidc} />} />
                <Route path="terms" element={<TermsPage config={config} oidc={oidc} />} />
                <Route path="payment-setup" element={<PaymentSetupPage config={config} oidc={oidc} />} />
                <Route path="balances" element={<BalancesPage config={config} oidc={oidc} />} />
                <Route path="invoices" element={<InvoicesPage config={config} oidc={oidc} />} />
                <Route path="privacy" element={<PrivacyPage config={config} oidc={oidc} />} />
                <Route
                  path="community-settings"
                  element={<CommunitySettingsPage config={config} oidc={oidc} />}
                />
                <Route
                  path="participants"
                  element={<ParticipantsPage config={config} oidc={oidc} />}
                />
                <Route
                  path="billing-runs"
                  element={<BillingRunsPage config={config} oidc={oidc} />}
                />
                <Route
                  path="payments-overview"
                  element={<PaymentsOverviewPage config={config} oidc={oidc} />}
                />
                <Route path="reports" element={<ReportsPage config={config} oidc={oidc} />} />
                <Route path="operator" element={<OperatorPage config={config} oidc={oidc} />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Refine>
        </AntApp>
      </ConfigProvider>
    </BrowserRouter>
  );
}
