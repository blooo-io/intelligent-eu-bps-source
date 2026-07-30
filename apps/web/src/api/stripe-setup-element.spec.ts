import { describe, expect, it, vi } from "vitest";
import {
  confirmSetupWithStripe,
  mountSetupPaymentElement,
} from "./stripe-setup-element";

describe("stripe-setup-element (INT-193)", () => {
  it("refuses non-test publishable keys (BR-12)", async () => {
    await expect(
      mountSetupPaymentElement({
        publishableKey: "pk_live_x",
        clientSecret: "seti_secret",
        container: document.createElement("div"),
      }),
    ).rejects.toThrow(/test publishable/);
  });

  it("mounts Payment Element and confirms SetupIntent", async () => {
    const unmount = vi.fn();
    const mount = vi.fn();
    const create = vi.fn().mockReturnValue({ mount, unmount });
    const elements = vi.fn().mockReturnValue({ create });
    const confirmSetup = vi.fn().mockResolvedValue({
      setupIntent: { payment_method: "pm_1" },
    });
    const loadStripeFn = vi.fn().mockResolvedValue({ elements, confirmSetup });
    const container = document.createElement("div");

    const handle = await mountSetupPaymentElement({
      publishableKey: "pk_test_x",
      clientSecret: "seti_secret",
      container,
      loadStripeFn,
    });
    expect(create).toHaveBeenCalledWith("payment", {
      paymentMethodOrder: ["card", "sepa_debit"],
    });
    expect(mount).toHaveBeenCalledWith(container);

    await expect(handle.confirm()).resolves.toEqual({ paymentMethodId: "pm_1" });
    handle.destroy();
    expect(unmount).toHaveBeenCalled();
  });

  it("surfaces confirmSetup errors", async () => {
    await expect(
      confirmSetupWithStripe(
        {
          confirmSetup: vi.fn().mockResolvedValue({
            error: { message: "card declined" },
          }),
        } as never,
        {} as never,
      ),
    ).rejects.toThrow(/card declined/);
  });

  it("extracts payment_method object id", async () => {
    await expect(
      confirmSetupWithStripe(
        {
          confirmSetup: vi.fn().mockResolvedValue({
            setupIntent: { payment_method: { id: "pm_obj" } },
          }),
        } as never,
        {} as never,
      ),
    ).resolves.toBe("pm_obj");
  });
});
