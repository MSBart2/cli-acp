import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import { AppPage } from "./helpers/AppPage.js";
import { createTestRepo, cleanupTestRepo } from "./helpers/testRepos.js";

/**
 * Scenario 4 — Mock Worker Integration
 *
 * Uses the mock ACP worker (`helpers/mockAcpWorker.js`) as the CLI backend so
 * the full broadcast → results → retry flow can be exercised without a real
 * Copilot CLI or outbound network access.
 *
 * Flow:
 *  1. Override the server CLI to the mock worker
 *  2. Create two local git repos on disk
 *  3. Register mock agents directly via /api/test/create-agent (no git clone)
 *  4. Wait for agents to reach Ready
 *  5. Broadcast → verify BroadcastResults panel populates
 *  6. Test retry: override to error behavior, broadcast → verify retry button
 *
 * Requires:
 *  - Server running in non-production mode (NODE_ENV !== "production")
 *  - MOCK_E2E=1 env var (skip otherwise to keep CI fast)
 */

const MOCK_WORKER_PATH = fileURLToPath(
  new URL("./helpers/mockAcpWorker.js", import.meta.url),
);

test.describe("Scenario 4 — Mock worker integration", () => {
  test.describe.configure({ mode: "serial" });

  // Gate behind env var — avoids running in CI environments where mock deps
  // may not be available, while still letting devs opt in locally.
  test.skip(
    !process.env.MOCK_E2E,
    "Set MOCK_E2E=1 to run mock-worker integration tests",
  );

  let app;
  let repo1Dir, repo2Dir;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await browser.newPage();
    app = new AppPage(page);
    await app.goto();
    await app.stopAllAgents();

    // Override server CLI to the mock worker (success behavior)
    await app.setCliOverride("node", [MOCK_WORKER_PATH, "--behavior=success", "--chunks=2"]);

    // Create two minimal git repos on the host filesystem
    repo1Dir = createTestRepo("mock-worker-a");
    repo2Dir = createTestRepo("mock-worker-b");
  });

  test.afterAll(async () => {
    if (app) {
      await app.stopAllAgents();
      await app.clearCliOverride();
    }
    cleanupTestRepo(repo1Dir);
    cleanupTestRepo(repo2Dir);
  });

  // ---------------------------------------------------------------------------

  test("mock workers reach Ready state", async () => {
    const { page } = app;

    // Create two mock workers via the test endpoint (bypasses git clone + URL validation)
    await app.createMockAgent(repo1Dir, "worker");
    await app.createMockAgent(repo2Dir, "worker");

    // Both should reach Ready — mock worker initializes fast
    await app.waitForWorkerReady(basename(repo1Dir), { timeout: 30_000 });
    await app.waitForWorkerReady(basename(repo2Dir), { timeout: 30_000 });
  });

  // ---------------------------------------------------------------------------

  test("broadcast to mock workers populates BroadcastResults panel", async () => {
    const { page } = app;

    await app.broadcast("What is this repo?");
    await app.waitForBroadcastResults({ timeout: 30_000 });

    // Both workers should have result entries
    const results = page.locator('[data-testid="broadcast-result"]');
    await expect(results).toHaveCount(2, { timeout: 30_000 });
  });

  // ---------------------------------------------------------------------------

  test("broadcast history records the completed wave", async () => {
    const { page } = app;

    // Broadcast history panel shows the prompt text
    const historyEntry = page.locator("text=What is this repo?").first();
    await expect(historyEntry).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Retry flow — uses error behavior so the retry button appears
// ---------------------------------------------------------------------------

test.describe("Scenario 4b — Mock worker retry flow", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    !process.env.MOCK_E2E,
    "Set MOCK_E2E=1 to run mock-worker integration tests",
  );

  let app;
  let repo1Dir;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await browser.newPage();
    app = new AppPage(page);
    await app.goto();
    await app.stopAllAgents();

    // Override to error behavior — agent will fail during prompt
    await app.setCliOverride("node", [MOCK_WORKER_PATH, "--behavior=error"]);

    repo1Dir = createTestRepo("mock-error-worker");
  });

  test.afterAll(async () => {
    if (app) {
      await app.stopAllAgents();
      await app.clearCliOverride();
    }
    cleanupTestRepo(repo1Dir);
  });

  // ---------------------------------------------------------------------------

  test("error worker reaches Ready (init succeeds, prompt will fail)", async () => {
    // The error behavior only throws during prompt(), not during init.
    // So the agent still reaches Ready — it just fails when prompted.
    await app.createMockAgent(repo1Dir, "worker");
    await app.waitForWorkerReady(basename(repo1Dir), { timeout: 30_000 });
  });

  test("broadcast with error worker shows Retry failed button", async () => {
    const { page } = app;

    await app.broadcast("Update the docs");

    // Wait for broadcast results to appear (may show error status)
    await app.waitForBroadcastResults({ timeout: 30_000 });

    // The "Retry N failed" button should appear since the worker errored
    await expect(
      page.locator('button').filter({ hasText: /retry.*failed/i }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
