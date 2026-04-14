import { defineConfig } from "@playwright/test";

/**
 * Playwright configuration for ACP Agent Orchestrator E2E tests.
 *
 * E2E tests run against the Express server which serves the pre-built React
 * client from client/dist/.  Using a single-server setup (no Vite) avoids
 * the port-conflict issues that arise when running dev mode (Vite + Express).
 *
 * Before running E2E tests, ensure the client is built:
 *   npm run build
 *
 * Required env vars (optional overrides):
 *   PLAYWRIGHT_BASE_URL  Override the default http://localhost:3001
 *   CI                   Set to '1' in CI to prevent reusing an existing server
 */
export default defineConfig({
  testDir: "./e2e",

  // Runs once before any test file — stops lingering agents from previous runs
  globalSetup: "./e2e/globalSetup.js",

  // Default for simple UI tests; agent-spawning tests override via test.setTimeout()
  timeout: 30_000,

  // Default assertion timeout; agent wait helpers pass explicit timeout options
  expect: { timeout: 10_000 },

  // Tests are stateful – sequential execution prevents cross-test interference
  fullyParallel: false,
  workers: 1,

  // Allow one retry in CI to capture traces for flaky failures; locally keep 0
  retries: process.env.CI ? 1 : 0,

  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001",
    headless: true,
    trace: "on-first-retry",
    video: "retain-on-failure",
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
  },

  // Start Express (which serves client/dist/) before the test run.
  // Playwright kills the server it starts when the run exits, so no explicit
  // port-clearing is needed here. If a previous run crashed and left a zombie
  // on port 3001, run: fuser -k 3001/tcp
  //
  // COPILOT_CLI_PATH is set explicitly so the spawned Express process finds
  // the copilot binary even when VS Code's PATH extension is not inherited.
  webServer: {
    command: "npm start",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      COPILOT_CLI_PATH: process.env.COPILOT_CLI_PATH ?? "copilot",
    },
  },
});

