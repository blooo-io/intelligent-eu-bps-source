import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageFrame } from "./page-frame";

describe("PageFrame (INT-187 / INT-188)", () => {
  it("renders title, description, actions and children", () => {
    render(
      <PageFrame title="Invoices" description="Your billing documents" actions={<button type="button">Export</button>}>
        <div>table</div>
      </PageFrame>,
    );
    expect(screen.getByRole("heading", { name: /invoices/i })).toBeInTheDocument();
    expect(screen.getByText(/billing documents/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export/i })).toBeInTheDocument();
    expect(screen.getByText("table")).toBeInTheDocument();
    expect(screen.queryByText(/back to home/i)).not.toBeInTheDocument();
  });

  it("shows a loading spinner when loading", () => {
    render(<PageFrame title="X" loading />);
    expect(screen.getByTestId("page-loading")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^x$/i })).not.toBeInTheDocument();
  });
});
