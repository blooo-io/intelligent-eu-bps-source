import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { KycAccountOnboarding } from "./kyc-account-onboarding";

/** INT-362 / INT-429 / REQ-051 — KYC Connect onboarding error states. */
describe("KycAccountOnboarding (INT-362 / INT-429)", () => {
  const base = {
    oidcAuthority: "https://auth.example/realms/int",
    oidcClientId: "web",
    apiBaseUrl: "https://api.example",
  };

  it("shows an error when the publishable key is missing", () => {
    const loadConnect = vi.fn();
    render(
      <KycAccountOnboarding
        config={base}
        clientSecret="accs_secret"
        refreshClientSecret={vi.fn()}
        onExit={vi.fn()}
        loadConnect={loadConnect as never}
      />,
    );
    expect(screen.getByText(/publishable key missing/i)).toBeInTheDocument();
    expect(loadConnect).not.toHaveBeenCalled();
  });

  it("shows the mount error for a live key (BR-12)", () => {
    render(
      <KycAccountOnboarding
        config={{ ...base, stripePublishableKey: "pk_live_x" }}
        clientSecret="accs_secret"
        refreshClientSecret={vi.fn()}
        onExit={vi.fn()}
        loadConnect={vi.fn() as never}
      />,
    );
    expect(screen.getByText(/test publishable keys/i)).toBeInTheDocument();
  });
});
