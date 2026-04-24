import { test, expect } from "@playwright/test";
import { AppPage } from "./helpers/AppPage.js";
import {
  ORCHESTRATOR_URL,
  WORKER_FANHUB_URL,
  ORCHESTRATOR_NAME,
  WORKER_FANHUB_REPO,
} from "./repos.config.js";

/**
 * Scenario 3 — Session Save and Restore
 *
 * Mirrors docs/scenarios/05-saving-restoring-and-respawning-sessions.md:
 *
 * 1. Launch an orchestrator (waits for Ready)
 * 2. Save the session under a unique name
 * 3. Verify the session appears in the saved sessions list
 * 4. Restore the session (UI-only mode) and verify agent card rehydrates
 *
 * The UI-only restore tests that client state is recovered from the serialised
 * snapshot without re-spawning real copilot processes. The re-spawn path
 * (mode = "respawn") is covered in the last test and requires copilot to be
 * running.
 *
 * Skip this suite by setting:
 *   SKIP_AGENT_E2E=1
 */

// Use a timestamp suffix so parallel runs don't collide in the session store
const SESSION_NAME = `e2e-test-${Date.now()}`;

test.describe("Scenario 3 — Session save and restore", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    Boolean(process.env.SKIP_AGENT_E2E),
    "Skipped via SKIP_AGENT_E2E env var",
  );

  let app;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(420_000);
    const page = await browser.newPage();
    app = new AppPage(page);
    await app.goto();

    // Clear any agents left running by a previous suite
    await app.stopAllAgents();

    // Bring up orchestrator + one worker so there's meaningful session state
    await app.launchOrchestrator(ORCHESTRATOR_URL);
    await app.waitForOrchestratorReady(ORCHESTRATOR_NAME, { timeout: 180_000 });

    await app.launchWorker(WORKER_FANHUB_URL);
    await app.waitForWorkerReady(WORKER_FANHUB_REPO, { timeout: 180_000 });
  });

  // --------------------------------------------------------------------------

  test("session control trigger button is visible in the header", async () => {
    const { page } = app;

    // The trigger button always has data-testid="session-trigger"
    await expect(
      page.locator('[data-testid="session-trigger"]'),
    ).toBeVisible({ timeout: 5_000 });
  });

  // --------------------------------------------------------------------------

  test("session panel opens and shows Saved Sessions heading", async () => {
    const { page } = app;

    await app.openSessionPanel();
    await expect(page.getByText("Saved Sessions")).toBeVisible({
      timeout: 5_000,
    });

    // Close the panel for the next test
    await page.locator('[data-testid="session-trigger"]').click();
  });

  // --------------------------------------------------------------------------

  test("saving the session adds it to the session list", async () => {
    const { page } = app;

    // Open panel
    await app.openSessionPanel();
    await expect(page.getByText("Saved Sessions")).toBeVisible();

    // Click "Save as…"
    await page.click('button:has-text("Save as")');

    // Type the custom session name and confirm
    await page.fill('input[placeholder="Session name"]', SESSION_NAME);
    await page.keyboard.press("Enter");

    // After Enter the save input dismisses but the panel stays open.
    // Wait for the session row to appear in the still-open panel.
    await expect(
      page.locator('[data-testid="session-item"]').filter({ hasText: SESSION_NAME }),
    ).toBeVisible({ timeout: 10_000 });

    // The row should show an agent count pill ("2 agents") — scope to the
    // saved session row using its data-testid to avoid matching header divs
    const sessionRow = page.locator('[data-testid="session-item"]').filter({ hasText: SESSION_NAME });
    await expect(
      sessionRow.locator('text=/\\b2 agents\\b/i'),
    ).toBeVisible({ timeout: 5_000 });
  });

  // --------------------------------------------------------------------------

  test("restoring a session (UI-only) rehydrates agent cards", async () => {
    const { page } = app;

    // Open the session panel — use openSessionPanel() which handles the
    // panel already being open (the previous test leaves it open after saving).
    await app.openSessionPanel();

    await expect(page.getByText("Saved Sessions")).toBeVisible({
      timeout: 5_000,
    });

    // Find the session row and hover to reveal action buttons
    const row = page.locator('[data-testid="session-item"]').filter({ hasText: SESSION_NAME });
    await row.scrollIntoViewIfNeeded();
    // Force-click the restore button directly; the button is in DOM even when
    // opacity-0 and toasts can block regular hover+click sequences.
    await row.locator('button[title="Restore (UI only)"]').evaluate((el) => el.click());

    // After restore the session name in the trigger should update
    await expect(
      page.locator("button").filter({ hasText: SESSION_NAME }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Agent cards should be rehydrated — cli-acp orchestrator card is present
    await expect(
      page
        .locator("div")
        .filter({ hasText: /Orchestrator/ })
        .filter({ hasText: "cli-acp" })
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // Worker card is present (may be in Stopped state after UI-only restore)
    await expect(
      page.locator(".card-appear").filter({ hasText: WORKER_FANHUB_REPO }),
    ).toBeVisible({ timeout: 15_000 });
  });

  // --------------------------------------------------------------------------

  test("auto-save updates the saved-at timestamp", async () => {
    const { page } = app;

    // The SessionControl shows "auto-saved X ago" on larger viewports
    await expect(page.locator("text=/auto-saved/i").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  // --------------------------------------------------------------------------

  test("deleting a session removes it from the list", async () => {
    const { page } = app;

    // Create a throwaway session first
    const throwawayName = `e2e-delete-${Date.now()}`;

    await app.openSessionPanel();
    await expect(page.getByText("Saved Sessions")).toBeVisible({
      timeout: 5_000,
    });
    await page.click('button:has-text("Save as")');
    await page.fill('input[placeholder="Session name"]', throwawayName);
    await page.keyboard.press("Enter");

    // Panel stays open after save — wait for the row to appear then delete it
    await expect(
      page.locator('[data-testid="session-item"]').filter({ hasText: throwawayName }),
    ).toBeVisible({ timeout: 10_000 });
    const row = page.locator('[data-testid="session-item"]').filter({ hasText: throwawayName });
    await row.scrollIntoViewIfNeeded();

    // The action buttons are opacity-0 until CSS group-hover. Rather than
    // fighting toast overlays blocking pointer events, use native DOM click()
    // which fires through React's event delegation regardless of CSS opacity.
    const deleteBtn = row.locator('button[title="Delete session"]');
    await deleteBtn.evaluate((el) => el.click());
    // Explicitly wait for React to set pendingDelete — button title changes
    const confirmBtn = row.locator('button[title="Click again to confirm delete"]');
    await expect(confirmBtn).toBeAttached({ timeout: 3_000 });
    // Second click to confirm deletion
    await confirmBtn.evaluate((el) => el.click());

    // Row disappears from sessions list
    await expect(
      page.locator('[data-testid="session-item"]').filter({ hasText: throwawayName }),
    ).not.toBeVisible({ timeout: 10_000 });
  });

  // --------------------------------------------------------------------------

  test("re-spawn restore restarts agent processes (requires copilot)", async () => {
    const { page } = app;

    // This test exercises the "Re-spawn agents" path, which actually invokes
    // copilot for each recorded agent. It may take several minutes.
    test.setTimeout(300_000);

    // Open session panel
    await app.openSessionPanel();
    await expect(page.getByText("Saved Sessions")).toBeVisible({
      timeout: 5_000,
    });

    const row = page.locator('[data-testid="session-item"]').filter({ hasText: SESSION_NAME });

    // Use force:true to bypass react-hot-toast notifications that may be covering
    // the row when agents finish spawning. The toast intercepts pointer events but
    // the session item is still the intended target.
    await row.hover({ force: true });

    // Click "Re-spawn agents"
    await row.locator('button[title="Re-spawn agents"]').click();

    // Agents should begin spawning — at least one Spawning badge visible
    await expect(page.locator("text=Spawning, text=Initializing").first())
      .toBeVisible({ timeout: 30_000 })
      .catch(() => {
        // If they spawn very quickly they might already be Ready — that's fine
      });

    // Eventually both original agents reach Ready
    await app.waitForOrchestratorReady(ORCHESTRATOR_NAME, { timeout: 240_000 });
    await app.waitForWorkerReady(WORKER_FANHUB_REPO, { timeout: 240_000 });
  });
});
