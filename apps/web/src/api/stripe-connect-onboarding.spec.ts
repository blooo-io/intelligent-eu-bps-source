import { describe, expect, it, vi } from "vitest";
import { mountAccountOnboarding } from "./stripe-connect-onboarding";

/** INT-362 / REQ-051 — embedded Account onboarding mount (BR-12 test keys only). */
describe("mountAccountOnboarding (INT-362)", () => {
  function fakeConnect() {
    const element = Object.assign(document.createElement("div"), {
      setOnExit: vi.fn(),
    });
    const create = vi.fn().mockReturnValue(element);
    const load = vi.fn().mockReturnValue({ create });
    return { element, create, load };
  }

  it("creates account-onboarding, wires onExit and unmounts on destroy", () => {
    const { element, create, load } = fakeConnect();
    const container = document.createElement("div");
    const onExit = vi.fn();
    const fetchClientSecret = vi.fn().mockResolvedValue("accs_secret");

    const handle = mountAccountOnboarding({
      publishableKey: "pk_test_x",
      fetchClientSecret,
      container,
      onExit,
      loadConnectFn: load as never,
    });

    expect(load).toHaveBeenCalledWith({
      publishableKey: "pk_test_x",
      fetchClientSecret,
    });
    expect(create).toHaveBeenCalledWith("account-onboarding");
    expect(element.setOnExit).toHaveBeenCalledWith(onExit);
    expect(container.contains(element)).toBe(true);

    handle.destroy();
    expect(container.contains(element)).toBe(false);
  });

  it("rejects live publishable keys (BR-12)", () => {
    const { load } = fakeConnect();
    expect(() =>
      mountAccountOnboarding({
        publishableKey: "pk_live_x",
        fetchClientSecret: vi.fn(),
        container: document.createElement("div"),
        onExit: vi.fn(),
        loadConnectFn: load as never,
      }),
    ).toThrow(/test publishable keys/);
    expect(load).not.toHaveBeenCalled();
  });
});
