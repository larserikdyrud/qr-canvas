import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages serves project sites from /<repo>/. Override with BASE_PATH
// (e.g. "/" for a custom domain or a user site).
export default defineConfig({
  base: process.env.BASE_PATH ?? "/qr-canvas/",
  plugins: [react(), tailwindcss()],
  test: {
    include: ["src/**/*.test.ts"],
  },
});
