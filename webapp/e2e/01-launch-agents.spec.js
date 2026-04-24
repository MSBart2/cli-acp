import { test, expect } from "@playwright/test";
import { AppPage } from "./helpers/AppPage.js";
import {
  ORCHESTRATOR_URL,
  WORKER_FANHUB_URL,
  WORKER_ASPIRE1_URL,
  ORCHESTRATOR_NAME,
  WORKER_FANHUB_REPO,
  WORKER_ASPIRE1_REPO,
} from "./repos.config.js";

/**
 * Scenario 1 — Launch Agents
 *
 * Mirrors docs/scenarios/01-first-broadcast-and-synthesis.md:
 * launch one orchestrator and two worker agents, then verify all three
 * cards reach the Ready state before any further work begins.
 *
 * Requirements:
 *   - `copilot` CLI installed and authenticated (`copilot --acp --stdio`)
 *   - Outbound GitHub access to clone repos over HTTPS
 *
 * Skip this suite by setting the environment variable:
 *   SKIP_AGENT_E2E=1
 */

// ---------------------------------------------------------------------------
// Smoke test — no agents needed, no SKIP_AGENT_E2E guard
// ---------------------------------------------------------------------------
test("page loads and shows the orchestrator input panel", async ({ page }) => {
  const app = new AppPage(page);
  await app.goto();

  await expect(
    page.locator('input[placeholder*="orchestrator-repo"]'),
  ).toBeVisible();

  await expect(
    page.locator('button:has-text("Launch Orchestrator")'),
  ).toBeVisible();

  // No agent cards present yet
  await expect(page.locator(".card-appear")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Agent-spawning tests (require copilot CLI + GitHub access)
// ---------------------------------------------------------------------------
test.describe("Scenario 1 — Launch agents", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    Boolean(process.env.SKIP_AGENT_E2E),
    "Skipped via SKIP_AGENT_E2E env var",
  );

  let app;

  // Launch all three agents once for the whole describe block.
  // Individual tests assert specific behaviours against the already-running
  // agents rather than re-spawning from scratch each time.
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(600_000); // 10 min to bring up all three agents
    const page = await browser.newPage();
    app = new AppPage(page);
    await app.goto();

    await app.launchOrchestrator(ORCHESTRATOR_URL);
    await app.waitForOrchestratorReady(ORCHESTRATOR_NAME, { timeout: 180_000 });

    await app.launchWorker(WORKER_FANHUB_URL);
    await app.launchWorker(WORKER_ASPIRE1_URL);

    await app.waitForWorkerReady(WORKER_FANHUB_REPO, { timeout: 240_000 });
    await app.waitForWorkerReady(WORKER_ASPIRE1_REPO, { timeout: 240_000 });
  });

  // --------------------------------------------------------------------------

  test("orchestrator card reaches Ready", async () => {
    await app.waitForOrchestratorReady(ORCHESTRATOR_NAME, { timeout: 30_000 });
  });

  // --------------------------------------------------------------------------

  test("fanhub worker card reaches Ready", async () => {
    const { page } = app;
    await expect(
      page.locator(".card-appear").filter({ hasText: WORKER_FANHUB_REPO }),
    ).toBeVisible({ timeout: 15_000 });
    await app.waitForWorkerReady(WORKER_FANHUB_REPO, { timeout: 30_000 });
  });

  // --------------------------------------------------------------------------

  test("aspire1 worker card reaches Ready", async () => {
    const { page } = app;
    await expect(
      page.locator(".card-appear").filter({ hasText: WORKER_ASPIRE1_REPO }),
    ).toBeVisible({ timeout: 15_000 });
    await app.waitForWorkerReady(WORKER_ASPIRE1_REPO, { timeout: 30_000 });
  });

  // --------------------------------------------------------------------------

  test("all three agents are Ready together", async () => {
    const { page } = app;

    // Two worker cards in the grid
    // Count only agent cards (exclude the Add Worker input card)
    await expect(
      page.locator('.card-appear:has([data-testid="agent-status"])'),
    ).toHaveCount(2);

    // Both Ready
    await app.waitForWorkerReady(WORKER_FANHUB_REPO, { timeout: 30_000 });
    await app.waitForWorkerReady(WORKER_ASPIRE1_REPO, { timeout: 30_000 });
    await app.waitForOrchestratorReady(ORCHESTRATOR_NAME, { timeout: 30_000 });

    // Add Worker input is still visible
    await expect(
      page.locator('button:has-text("Launch Worker")'),
    ).toBeVisible();
  });

  // --------------------------------------------------------------------------

  test("rejects an invalid repo URL and does not spawn an agent", async () => {
    const { page } = app;
    test.setTimeout(60_000);

    // Try to launch a worker with an obviously invalid URL — the server
    // will reject it and emit agent:error almost immediately.
    await app.launchWorker("https://not-a-git-host.example.com/bad/repo");

    // The server rejects invalid URLs immediately (agentId: null), so no agent
    // card is created. Instead an error toast is shown by useNotifications.
    await expect(
      page.getByText(/Invalid repository URL/i),
    ).toBeVisible({ timeout: 5_000 });
  });

  // --------------------------------------------------------------------------

  test("stopping an agent removes it from the active card state", async () => {
    const { page } = app;
    test.setTimeout(60_000);

    // Wait for fanhub to be Ready (may have errored in previous test cleanup)
    await app.waitForWorkerReady(WORKER_FANHUB_REPO, { timeout: 30_000 });

    // Stop the fanhub worker
    await app.stopAgent(WORKER_FANHUB_REPO);

    // When an agent is stopped the server emits agent:stopped and the client
    // removes it from state entirely, so the card disappears rather than
    // transitioning to a Stopped badge.
    await expect(
      page
        .locator(".card-appear")
        .filter({ hasText: WORKER_FANHUB_REPO }),
    ).not.toBeVisible({ timeout: 15_000 });
  });
});
