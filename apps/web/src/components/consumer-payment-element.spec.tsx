import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConsumerPaymentElement } from "./consumer-payment-element";
import type { WebConfig } from "../api/config";

const config: WebConfig = {
  oidcAuthority: "https://auth.example/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.example",
  stripePublishableKey: "pk_test_fixture",
};

describe("ConsumerPaymentElement (INT-193)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("mounts the element and attaches on confirm", async () => {
    const onAttached = vi.fn().mockResolvedValue(undefined);
    const unmount = vi.fn();
    const loadStripe = vi.fn().mockResolvedValue({
      elements: vi.fn().mockReturnValue({
        create: vi.fn().mockReturnValue({
          mount: vi.fn(),
          unmount,
        }),
      }),
      confirmSetup: vi.fn().mockResolvedValue({
        setupIntent: { payment_method: "pm_visa" },
      }),
    });

    render(
      <ConsumerPaymentElement
        config={config}
        clientSecret="seti_secret"
        onAttached={onAttached}
        loadStripe={loadStripe}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save payment method/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /save payment method/i }));
    await waitFor(() => {
      expect(onAttached).toHaveBeenCalledWith("pm_visa");
    });
  });

  it("shows an error when publishable key is missing", async () => {
    render(
      <ConsumerPaymentElement
        config={{ ...config, stripePublishableKey: "" }}
        clientSecret="seti_secret"
        onAttached={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/publishable key missing/i)).toBeInTheDocument();
    });
  });
});
