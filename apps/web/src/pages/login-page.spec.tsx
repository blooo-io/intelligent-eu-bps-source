import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginPage } from "./login-page";

const loginMock = vi.fn();

vi.mock("@refinedev/core", () => ({
  useLogin: () => ({ mutate: loginMock, isPending: false }),
}));

describe("LoginPage (UAT-043 / INT-188)", () => {
  it("shows IdP sign-in CTA and no password field", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/password/i)).toBeNull();
    expect(screen.getByTestId("login-page")).toBeInTheDocument();
    expect(screen.getByText("INTELLIGENT billing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with community idp/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /continue with community idp/i }));
    expect(loginMock).toHaveBeenCalled();
  });
});
