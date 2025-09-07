import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as server from "./server.js";
import { isDirectRun, main } from "./main.js";

describe("cd-smoke main", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts the listener and logs without personal data", () => {
    const fake = { listen: vi.fn() } as unknown as ReturnType<typeof server.listen>;
    const listenSpy = vi.spyOn(server, "listen").mockReturnValue(fake);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    main();

    expect(listenSpy).toHaveBeenCalled();
    const logged = String(logSpy.mock.calls[0]?.[0] ?? "");
    expect(logged).toContain("cd-smoke listening");
    expect(logged).not.toMatch(/@|email|password|secret/i);
  });

  it("isDirectRun matches only the process entry path", () => {
    const entry = "/tmp/cd-smoke-main.js";
    expect(isDirectRun(pathToFileURL(entry).href, entry)).toBe(true);
    expect(isDirectRun(pathToFileURL(entry).href, undefined)).toBe(false);
    expect(isDirectRun(pathToFileURL(entry).href, "/other.js")).toBe(false);
  });
});
