import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProducerAccountOnboarding } from "./producer-account-onboarding";

/** INT-362 / REQ-051 — producer Payout account step error states. */
describe("ProducerAccountOnboarding (INT-362)", () => {
  const base = {
    oidcAuthority: "https://auth.example/realms/int",
    oidcClientId: "web",
    apiBaseUrl: "https://api.example",
  };

  it("shows an error when the publishable key is missing", () => {
    const loadConnect = vi.fn();
    render(
      <ProducerAccountOnboarding
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
      <ProducerAccountOnboarding
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
