import { test, expect } from "@playwright/test";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { AppPage } from "./helpers/AppPage.js";

/**
 * Scenario 5 — Session Restore Failure (client-side error path)
 *
 * Mirrors the failure path described in
 * docs/scenarios/05-saving-restoring-and-respawning-sessions.md:
 *
 * 1. Save a session so it appears in the Saved Sessions list
 * 2. Delete the session file on disk (simulating a file that was moved,
 *    corrupted, or purged by another process)
 * 3. Attempt to restore from the UI — the session still appears in the list
 *    because the client hasn't refreshed
 * 4. Verify the error banner appears inside the session panel
 *
 * No copilot CLI or agent processes are required — this is a pure UI/socket test.
 */

// Session files live at ~/.acp-orchestrator/sessions/{name}.json
const SESSIONS_DIR = join(homedir(), ".acp-orchestrator", "sessions");

const SESSION_NAME = `e2e-restore-fail-${Date.now()}`;

test.describe("Scenario 5 — Session restore failure", () => {
  test.describe.configure({ mode: "serial" });

  let app;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(60_000);
    const page = await browser.newPage();
    app = new AppPage(page);
    await app.goto();
    await app.stopAllAgents();
  });

  // ---------------------------------------------------------------------------

  test("session panel shows 'Saved Sessions' heading", async () => {
    await app.openSessionPanel();
    await expect(
      app.page.getByText("Saved Sessions", { exact: true }),
    ).toBeVisible({ timeout: 5_000 });
    // Close for next test
    await app.openSessionPanel();
  });

  // ---------------------------------------------------------------------------

  test("saved session appears in the sessions list", async () => {
    // Save a session with a known name (no agents running — that's fine)
    await app.saveSession(SESSION_NAME);
    await app.openSessionPanel();
    await app.expectSessionInList(SESSION_NAME);
    // Keep panel open for the delete+restore test below
  });

  // ---------------------------------------------------------------------------

  test("restoring a deleted session shows an error banner", async () => {
    const { page } = app;

    // Open the panel and confirm the row is visible BEFORE deleting the file,
    // so the panel's session list is loaded while the file still exists on disk.
    await app.openSessionPanel();
    await app.expectSessionInList(SESSION_NAME);

    // Now delete the file — the panel still shows the stale row.
    const sessionFile = join(SESSIONS_DIR, `${SESSION_NAME}.json`);
    await unlink(sessionFile);

    // Click "Restore (UI only)" on the stale row.
    // The server will attempt to read the file, fail, and emit session:error.
    await app.loadSession(SESSION_NAME, "ui");

    // Verify the error banner appears inside the session panel.
    // The panel must stay open after an error (no setIsOpen(false) on session:error).
    await app.waitForSessionError({ timeout: 10_000 });

    const errorBanner = page.locator('[data-testid="session-restore-error"]');
  });

  // ---------------------------------------------------------------------------

  test("dismissing the error banner removes it", async () => {
    const { page } = app;

    // The X button on the error banner should dismiss it
    const dismissBtn = page
      .locator('[data-testid="session-restore-error"]')
      .locator("button");
    await dismissBtn.click();

    await expect(
      page.locator('[data-testid="session-restore-error"]'),
    ).not.toBeVisible({ timeout: 5_000 });
  });
});
