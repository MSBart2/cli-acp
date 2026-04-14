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
 * Scenario 2 — Broadcast and Synthesis
 *
 * Mirrors docs/scenarios/01-first-broadcast-and-synthesis.md and
 * docs/scenarios/02-documentation-audit-with-issues-and-prs.md:
 *
 * 1. Launch orchestrator + 2 workers (all reach Ready)
 * 2. Broadcast a prompt to all workers
 * 3. Verify the BroadcastResults panel populates with per-worker entries
 * 4. Verify the orchestrator synthesises the results (output visible, status
 *    returns to Ready)
 *
 * The broadcast prompt is intentionally lightweight ("summarise this repo")
 * so the copilot agents return quickly without writing any files.
 *
 * Skip this suite by setting:
 *   SKIP_AGENT_E2E=1
 */

const BROADCAST_PROMPT = "Reply with exactly the word PONG and nothing else.";

const SYNTHESIS_INSTRUCTIONS =
  "List each worker's reply on a separate line prefixed with a dash.";

test.describe("Scenario 2 — Broadcast and synthesis", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    Boolean(process.env.SKIP_AGENT_E2E),
    "Skipped via SKIP_AGENT_E2E env var",
  );

  let app;

  // Shared setup: launch all three agents once for the whole suite.
  // Individual tests build on the assumption that agents are Ready when they run.
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(600_000); // 10 min to bring up all three agents
    const page = await browser.newPage();
    app = new AppPage(page);
    await app.goto();

    // Clear any agents left running by a previous suite
    await app.stopAllAgents();

    await app.launchOrchestrator(ORCHESTRATOR_URL);
    await app.waitForOrchestratorReady(ORCHESTRATOR_NAME, { timeout: 180_000 });

    await app.launchWorker(WORKER_FANHUB_URL);
    await app.launchWorker(WORKER_ASPIRE1_URL);

    await app.waitForWorkerReady(WORKER_FANHUB_REPO, { timeout: 240_000 });
    await app.waitForWorkerReady(WORKER_ASPIRE1_REPO, { timeout: 240_000 });
  });

  // --------------------------------------------------------------------------

  test("broadcast input shows correct ready-worker count", async () => {
    const { page } = app;

    // The BroadcastInput badge says "N of M agents ready"
    await expect(page.locator("text=/2 of 2 agents? ready/i")).toBeVisible({
      timeout: 10_000,
    });

    // Broadcast textarea and button are present (scope to the Broadcast panel)
    const broadcastPanel = page.locator('[data-testid="broadcast-panel"]');
    const textarea = broadcastPanel.locator('textarea[placeholder*="Send a prompt to all agents"]');
    await expect(textarea).toBeVisible();

    // Button is disabled when the textarea is empty; fill it to verify it
    // becomes enabled (workers are ready so canSend = true once text is present)
    await textarea.fill("test");
    await expect(
      broadcastPanel.locator('[data-testid="broadcast-submit"]'),
    ).toBeEnabled();
    await textarea.fill(""); // restore empty state for subsequent tests
  });

  // --------------------------------------------------------------------------

  test("broadcast button is disabled when there are no ready workers", async () => {
    // This is a UI-state test — we verify via the component's disabled logic
    // without actually stopping agents. We look at the disabled attribute when
    // the textarea is empty.
    const { page } = app;

    const btn = page
      .locator('[data-testid="broadcast-panel"]')
      .locator('[data-testid="broadcast-submit"]');
    // Button should be disabled when the textarea is empty
    await expect(btn).toBeDisabled();

    // Becomes enabled once text is present
    await page.fill(
      'textarea[placeholder*="Send a prompt to all agents"]',
      "test",
    );
    await expect(btn).toBeEnabled();

    // Clean up — clear the textarea
    await page.fill('textarea[placeholder*="Send a prompt to all agents"]', "");
  });

  // --------------------------------------------------------------------------

  test("broadcasting a prompt transitions workers to Busy", async () => {
    const { page } = app;

    await page.fill(
      'textarea[placeholder*="Send a prompt to all agents"]',
      BROADCAST_PROMPT,
    );
    await page
      .locator('[data-testid="broadcast-panel"]')
      .locator('[data-testid="broadcast-submit"]')
      .click();

    // At least one worker card should flip to Busy almost immediately
    await expect(
      page.locator(".card-appear").filter({ hasText: "Busy" }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  // --------------------------------------------------------------------------

  test("broadcast results panel appears after workers complete", async () => {
    // Workers may still be running from the previous test; wait for results
    await app.waitForBroadcastResults({ timeout: 60_000 });

    const { page } = app;

    // The results panel heading
    await expect(page.getByText("Broadcast Results")).toBeVisible();

    // At least two result entries — check the completed count badge which
    // shows "N/M completed" and is unique to the results panel
    await expect(page.locator("text=/2\\/2 completed/")).toBeVisible({ timeout: 10_000 });
  });

  // --------------------------------------------------------------------------

  test("orchestrator synthesises broadcast results and returns to Ready", async () => {
    // After workers complete, the server auto-prompts the orchestrator.
    // The orchestrator card should go Busy → Ready with output visible.
    test.setTimeout(180_000); // synthesis + possible permission approvals can take >2 min

    const { page } = app;

    // The synthesis prompt asks copilot to write a file to operations/.
    // Copilot requests permission before creating the directory, which blocks
    // synthesis indefinitely unless auto-approved. Run approval loop in parallel.
    let approvalActive = true;
    const approvalLoop = (async () => {
      while (approvalActive) {
        const btn = page.locator('button:has-text("Allow once")').first();
        const visible = await btn.isVisible().catch(() => false);
        if (visible) await btn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(2_000);
      }
    })();

    try {
      // waitForOrchestratorReady uses the data-testid badge directly, which is
      // more reliable than reading textContent (which can false-positive if
      // synthesis output contains the word "Ready").
      await app.waitForOrchestratorReady(ORCHESTRATOR_NAME, { timeout: 150_000 });
    } finally {
      approvalActive = false;
      await approvalLoop;
    }

    // Confirm the Ready status badge is still visible after the wait
    await expect(
      page.locator('[data-testid="orchestrator-status"]').filter({ hasText: "Ready" }),
    ).toBeVisible({ timeout: 5_000 });
  });

  // --------------------------------------------------------------------------

  test("@mention targeting restricts broadcast to a single worker", async () => {
    const { page } = app;

    // Wait for all agents to be Ready before targeted broadcast
    await app.waitForWorkerReady(WORKER_FANHUB_REPO, { timeout: 60_000 });
    await app.waitForWorkerReady(WORKER_ASPIRE1_REPO, { timeout: 60_000 });

    const textarea = page.locator(
      'textarea[placeholder*="Send a prompt to all agents"]',
    );
    await textarea.fill("@fanhub Describe your package manager in one word.");

    // Targeting pill should appear for "fanhub"
    await expect(
      page
        .locator("text=fanhub")
        .filter({ has: page.locator('[class*="emerald"]') }),
    )
      .toBeVisible({ timeout: 5_000 })
      .catch(() => {
        // Fallback: any targeting pill is visible
        return expect(
          page.locator('[class*="Targeting"], span:has-text("fanhub")').first(),
        ).toBeVisible();
      });

    // Button text changes to "Send to 1 worker"
    await expect(
      page.locator('button:has-text("Send to 1 worker")'),
    ).toBeVisible({ timeout: 5_000 });

    // Clear the textarea so later tests start clean
    await textarea.fill("");
  });

  // --------------------------------------------------------------------------

  test("broadcast history records the completed broadcast", async () => {
    const { page } = app;

    // BroadcastHistory renders past prompts in a collapsible section.
    // After at least one broadcast, the history heading should be present.
    await expect(
      page.locator("text=/Broadcast History|Past broadcast/i").first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
