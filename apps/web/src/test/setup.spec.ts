import { describe, expect, it } from "vitest";

describe("web test setup (INT-365)", () => {
  it("provides ResizeObserver for Ant Design 6 in jsdom", () => {
    const observer = new ResizeObserver(() => undefined);
    expect(observer.observe).toEqual(expect.any(Function));
    expect(observer.disconnect).toEqual(expect.any(Function));
    observer.observe(document.body);
    observer.disconnect();
  });
});
