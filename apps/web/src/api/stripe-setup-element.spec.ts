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
      paymentMethodOrder: ["card"],
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

  it("rejects when Stripe.js does not load", async () => {
    await expect(
      mountSetupPaymentElement({
        publishableKey: "pk_test_x",
        clientSecret: "seti_secret",
        container: document.createElement("div"),
        loadStripeFn: vi.fn().mockResolvedValue(null),
      }),
    ).rejects.toThrow(/failed to load/i);
  });

  it("propagates confirm errors from the mounted element", async () => {
    const unmount = vi.fn();
    const mount = vi.fn();
    const create = vi.fn().mockReturnValue({ mount, unmount });
    const elements = vi.fn().mockReturnValue({ create });
    const confirmSetup = vi.fn().mockResolvedValue({
      error: { message: "Card declined" },
    });
    const loadStripeFn = vi.fn().mockResolvedValue({ elements, confirmSetup });
    const handle = await mountSetupPaymentElement({
      publishableKey: "pk_test_x",
      clientSecret: "seti_secret",
      container: document.createElement("div"),
      loadStripeFn,
    });
    await expect(handle.confirm()).rejects.toThrow(/declined/i);
  });

  it("rejects setup without a payment method", async () => {
    const unmount = vi.fn();
    const mount = vi.fn();
    const create = vi.fn().mockReturnValue({ mount, unmount });
    const elements = vi.fn().mockReturnValue({ create });
    const confirmSetup = vi.fn().mockResolvedValue({ setupIntent: {} });
    const loadStripeFn = vi.fn().mockResolvedValue({ elements, confirmSetup });
    const handle = await mountSetupPaymentElement({
      publishableKey: "pk_test_x",
      clientSecret: "seti_secret",
      container: document.createElement("div"),
      loadStripeFn,
    });
    await expect(handle.confirm()).rejects.toThrow(/without payment_method/i);
  });

  it("defaults confirmSetup error text when message is absent", async () => {
    await expect(
      confirmSetupWithStripe(
        {
          confirmSetup: vi.fn().mockResolvedValue({ error: {} }),
        } as never,
        {} as never,
      ),
    ).rejects.toThrow(/confirmSetup failed/);
  });

  it("rejects confirm without payment_method", async () => {
    await expect(
      confirmSetupWithStripe(
        {
          confirmSetup: vi.fn().mockResolvedValue({ setupIntent: {} }),
        } as never,
        {} as never,
      ),
    ).rejects.toThrow(/missing payment_method/);
  });
});
