import { defineConfig } from "@playwright/test";

// Runs against the production build served under the same sub-path GitHub Pages uses.
// CI installs Chromium; locally set PW_CHANNEL=chrome to use an installed Chrome.
const base = process.env.BASE_PATH ?? "/qr-canvas/";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:4173${base}`,
    channel: process.env.PW_CHANNEL || undefined,
  },
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: `http://localhost:4173${base}`,
    reuseExistingServer: !process.env.CI,
  },
});
