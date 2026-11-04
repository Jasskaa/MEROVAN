import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 5190);

// Critical public flows. Uses the running dev server if there is one, otherwise starts it.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${port}`, locale: "es-ES", trace: "retain-on-failure" },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"] } },
    { name: "movil", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: `npm run dev -- --port=${port}`, port, reuseExistingServer: true, timeout: 120_000 },
});
