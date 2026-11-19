import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AppShellSider } from "./app-shell-sider";

describe("AppShellSider (INT-248)", () => {
  it("shows the community label when expanded", () => {
    render(
      <AppShellSider
        collapsed={false}
        onCollapse={vi.fn()}
        communityLabel="Zurich pilot"
        menuItems={[{ key: "home", label: "Home" }]}
        selectedKeys={["home"]}
      />,
    );
    expect(screen.getByText(/intelligent billing/i)).toBeInTheDocument();
    expect(screen.getByText("Zurich pilot")).toBeInTheDocument();
  });

  it("shows the compact monogram when collapsed", () => {
    render(
      <AppShellSider
        collapsed
        onCollapse={vi.fn()}
        communityLabel={null}
        menuItems={[{ key: "home", label: "Home" }]}
        selectedKeys={["home"]}
      />,
    );
    expect(screen.getByText("IB")).toBeInTheDocument();
    expect(screen.queryByText(/intelligent billing/i)).toBeNull();
  });

  it("notifies when the sider collapses", () => {
    const onCollapse = vi.fn();
    render(
      <AppShellSider
        collapsed={false}
        onCollapse={onCollapse}
        communityLabel={null}
        menuItems={[{ key: "home", label: "Home" }]}
        selectedKeys={["home"]}
      />,
    );
    const toggle = document.querySelector(".ant-layout-sider-trigger");
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle!);
    expect(onCollapse).toHaveBeenCalled();
  });
});