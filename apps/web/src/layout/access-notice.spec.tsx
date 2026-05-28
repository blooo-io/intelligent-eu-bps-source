import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AccessNotice } from "./access-notice";

describe("AccessNotice (INT-245)", () => {
  it("explains the role block and links home", () => {
    render(
      <MemoryRouter>
        <AccessNotice title="Community settings need a manager role" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("access-notice")).toBeInTheDocument();
    expect(screen.getByText(/need a manager role/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to home/i })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
