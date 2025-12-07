import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Vite SPA build for AC-01 (TD-5). Output lands in dist/ for the static server. */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
