import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createOidcFacade, createUserManager } from "./oidc";

describe("createOidcFacade (REQ-033 / UAT-043)", () => {
  it("login redirects to the IdP and never collects a password", async () => {
    const signinRedirect = vi.fn().mockResolvedValue(undefined);
    const facade = createOidcFacade({
      signinRedirect,
      signinRedirectCallback: vi.fn(),
      signoutRedirect: vi.fn(),
      getUser: vi.fn(),
    } as never);

    await facade.login();
    expect(signinRedirect).toHaveBeenCalledTimes(1);
  });

  it("handleCallback and logout delegate to UserManager", async () => {
    const signinRedirectCallback = vi.fn().mockResolvedValue({ access_token: "t" });
    const signoutRedirect = vi.fn().mockResolvedValue(undefined);
    const getUser = vi.fn().mockResolvedValue({ expired: false, access_token: "t" });
    const facade = createOidcFacade({
      signinRedirect: vi.fn(),
      signinRedirectCallback,
      signoutRedirect,
      getUser,
    } as never);

    await facade.handleCallback();
    await facade.logout();
    expect(signinRedirectCallback).toHaveBeenCalled();
    expect(signoutRedirect).toHaveBeenCalled();
    expect(await facade.getUser()).toMatchObject({ access_token: "t" });
  });

  it("getAccessToken returns null when the session is expired", async () => {
    const facade = createOidcFacade({
      signinRedirect: vi.fn(),
      signinRedirectCallback: vi.fn(),
      signoutRedirect: vi.fn(),
      getUser: vi.fn().mockResolvedValue({ expired: true, access_token: "x" }),
    } as never);

    expect(await facade.getAccessToken()).toBeNull();
  });

  it("getAccessToken returns null when there is no user", async () => {
    const facade = createOidcFacade({
      signinRedirect: vi.fn(),
      signinRedirectCallback: vi.fn(),
      signoutRedirect: vi.fn(),
      getUser: vi.fn().mockResolvedValue(null),
    } as never);

    expect(await facade.getAccessToken()).toBeNull();
  });

  it("getAccessToken returns the bearer when the session is valid", async () => {
    const facade = createOidcFacade({
      signinRedirect: vi.fn(),
      signinRedirectCallback: vi.fn(),
      signoutRedirect: vi.fn(),
      getUser: vi.fn().mockResolvedValue({ expired: false, access_token: "tok" }),
    } as never);

    expect(await facade.getAccessToken()).toBe("tok");
  });
});

describe("createUserManager", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { origin: "http://localhost:5173" },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("builds a PKCE UserManager for the web client", () => {
    const manager = createUserManager({
      oidcAuthority: "https://auth.example/realms/int",
      oidcClientId: "web",
      apiBaseUrl: "https://api.example",
    });
    expect(manager.settings.client_id).toBe("web");
    expect(manager.settings.redirect_uri).toBe("http://localhost:5173/auth/callback");
    expect(manager.settings.response_type).toBe("code");
  });
});
