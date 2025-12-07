import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { CallbackPage } from "./callback-page";
import type { OidcFacade } from "../auth/oidc";

const navigate = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

describe("CallbackPage", () => {
  it("navigates home after a successful callback", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn().mockResolvedValue({}),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn(),
    };

    render(
      <MemoryRouter>
        <CallbackPage oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("shows an error when the callback fails", async () => {
    const oidc: OidcFacade = {
      login: vi.fn(),
      handleCallback: vi.fn().mockRejectedValue(new Error("bad code")),
      logout: vi.fn(),
      getUser: vi.fn(),
      getAccessToken: vi.fn(),
    };

    render(
      <MemoryRouter>
        <CallbackPage oidc={oidc} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/bad code/i)).toBeInTheDocument();
    });
  });
});
