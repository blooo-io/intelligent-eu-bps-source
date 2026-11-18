import React from "react";
import "@testing-library/jest-dom/vitest";

// INT-412 — vitest 3 + classic JSX in some deps still expects a global React
// (react-router MemoryRouter in specs). Keep the automatic runtime for app
// code; expose React for those paths.
globalThis.React = React;

// Ant Design 6 measures layout with ResizeObserver, which jsdom does not provide.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// Ant Design Grid / responsive hooks need matchMedia in jsdom.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});
