import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  PaymentMethodReadyCard,
  PayoutAccountReadyCard,
} from "./payment-setup-ready-cards";

describe("payment-setup-ready-cards (INT-255)", () => {
  it("shows a default brand when none is provided", () => {
    render(<PaymentMethodReadyCard brandLabel={null} last4="4242" />);
    expect(screen.getByTestId("payment-method-ready")).toHaveTextContent("Card ···· 4242");
  });

  it("renders from pspAccountRef and shows a Stripe dashboard link when available", () => {
    render(
      <PayoutAccountReadyCard
        account={{
          status: "complete",
          pspAccountRef: "acct_123",
          dashboardUrl: "https://dashboard.stripe.test/acct",
        }}
      />,
    );
    expect(screen.getByTestId("payout-account-ready")).toHaveTextContent("acct_123");
    expect(screen.getByRole("link", { name: /open stripe dashboard/i })).toHaveAttribute(
      "href",
      "https://dashboard.stripe.test/acct",
    );
  });

  it("hides the dashboard link when no URL is returned", () => {
    render(
      <PayoutAccountReadyCard
        account={{
          status: "complete",
          pspAccountRef: "acct_456",
        }}
      />,
    );
    expect(screen.getByTestId("payout-account-ready")).toHaveTextContent("acct_456");
    expect(screen.queryByRole("link", { name: /open stripe dashboard/i })).toBeNull();
  });
});
