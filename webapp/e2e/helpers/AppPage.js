import { expect } from "@playwright/test";

/**
 * AppPage — Page Object Model for the ACP Agent Orchestrator UI.
 *
 * Wraps Playwright's `page` with domain-specific helpers so spec files stay
 * readable and don't duplicate locator logic. All timeout parameters come from
 * the caller so individual specs can tune them for slow operations like cloning.
 */
export class AppPage {
  /** @param {import("@playwright/test").Page} page */
  constructor(page) {
    this.page = page;
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  async goto() {
    await this.page.goto("/");
    // Wait for the Socket.IO connection to be established — the header shows
    // "Connected" once the socket handshake completes. Use exact:true so we
    // don't accidentally match the "Disconnected" label (which contains the
    // substring "Connected") before the socket has actually connected.
    await this.page
      .getByText("Connected", { exact: true })
      .waitFor({ state: "visible", timeout: 30_000 });
  }

  /**
   * Stop all currently running agents via the server reset endpoint, then
   * wait for the OrchestratorInput to reappear. Call this at the start of a
   * beforeAll to ensure a clean state before launching agents for a new suite.
   */
  async stopAllAgents() {
    const { page } = this;
    // Use the test-only server endpoint — more reliable than clicking buttons
    // Use a relative URL so Playwright's `baseURL` is respected across
    // environments (CI, local overrides). This avoids hardcoding localhost.
    await page.request.post("/api/test/reset");
    // Reload so the React state reflects the now-empty agent list
    await this.goto();
  }

  // ---------------------------------------------------------------------------
  // Agent launching
  // ---------------------------------------------------------------------------

  /**
   * Fill the Orchestrator URL input and click Launch Orchestrator.
   * @param {string} repoUrl
   */
  async launchOrchestrator(repoUrl) {
    // The input is disabled until the socket connects; wait for it to be editable.
    const input = this.page.locator('input[placeholder*="orchestrator-repo"]');
    await input.waitFor({ state: "visible", timeout: 10_000 });
    await expect(input).toBeEnabled({ timeout: 10_000 });
    await input.fill(repoUrl);
    await this.page.click('button:has-text("Launch Orchestrator")');
  }

  /**
   * Fill the Add Worker URL input and click Launch Worker.
   * The input field is cleared by the component after each launch so this can
   * be called multiple times in sequence.
   * @param {string} repoUrl
   */
  async launchWorker(repoUrl) {
    // The input placeholder is "https://github.com/owner/repo"
    const input = this.page.locator(
      'input[placeholder*="github.com/owner/repo"]',
    );
    await input.waitFor({ state: "visible", timeout: 10_000 });
    await expect(input).toBeEnabled({ timeout: 10_000 });
    await input.fill(repoUrl);
    await this.page.click('button:has-text("Launch Worker")');
  }

  // ---------------------------------------------------------------------------
  // Agent status waits
  // ---------------------------------------------------------------------------

  /**
   * Poll for pending permission requests and auto-click "Allow once" until
   * `duration` ms have elapsed or until the caller cancels via the returned
   * stop function. Useful when a test needs the orchestrator to run a tool
   * (e.g., create files) without manual user approval.
   *
   * @param {{ duration?: number, interval?: number }} [opts]
   * @returns {Promise<void>} resolves when duration expires
   */
  async autoApprovePermissions({ duration = 90_000, interval = 2_000 } = {}) {
    const deadline = Date.now() + duration;
    while (Date.now() < deadline) {
      const btn = this.page
        .locator('button:has-text("Allow once")')
        .first();
      const visible = await btn.isVisible().catch(() => false);
      if (visible) {
        await btn.click({ force: true }).catch(() => {});
      }
      // Short sleep between polls — keep the loop lightweight
      await this.page.waitForTimeout(interval);
    }
  }

  /**
   * Wait until the OrchestratorCard shows "Ready" in its status badge.
   * The card is identified by the "Orchestrator" heading anchored in the card,
   * combined with the repoName subtitle.
   * @param {string} repoName  Short repo name (e.g. "cli-acp")
   * @param {{ timeout?: number }} [opts]
   */
  async waitForOrchestratorReady(repoName, { timeout = 120_000 } = {}) {
    // Use data-testid on the status badge to avoid matching outer wrapper divs
    // that can report hidden despite their content being visible.
    await expect(
      this.page.locator('[data-testid="orchestrator-status"]', {
        hasText: "Ready",
      }),
    ).toBeVisible({ timeout });
  }

  /**
   * Wait until a worker AgentCard for `repoPath` reaches "Ready".
   * AgentCard renders the URL as "owner/repo" via extractRepoName(), so pass
   * the "owner/repo" form of the path (e.g. "MSBart2/FanHub").
   * @param {string} repoPath  "owner/repo" as shown in the card header
   * @param {{ timeout?: number }} [opts]
   */
  async waitForWorkerReady(repoPath, { timeout = 120_000 } = {}) {
    // Locate the card by repoPath text, then assert the status badge within it.
    await expect(
      this.page
        .locator(".card-appear", { hasText: repoPath })
        .locator('[data-testid="agent-status"]', { hasText: "Ready" }),
    ).toBeVisible({ timeout });
  }

  /**
   * Wait until a card for any agent shows an "Error" badge.
   * Useful as a negative assertion helper.
   * @param {string} repoPath
   * @param {{ timeout?: number }} [opts]
   */
  async waitForAgentError(repoPath, { timeout = 90_000 } = {}) {
    await expect(
      this.page
        .locator(".card-appear", { hasText: repoPath })
        .locator('[data-testid="agent-status"]', { hasText: "Error" }),
    ).toBeVisible({ timeout });
  }

  // ---------------------------------------------------------------------------
  // Broadcast
  // ---------------------------------------------------------------------------

  /**
   * Type a broadcast prompt and optionally expand + fill Orchestrator Focus,
   * then submit.
   * @param {string} text                         Main broadcast text
   * @param {string} [synthesisInstructions]      Optional orchestrator focus text
   */
  async broadcast(text, synthesisInstructions) {
    await this.page.fill(
      'textarea[placeholder*="Send a prompt to all agents"]',
      text,
    );

    if (synthesisInstructions) {
      // "Orchestrator Focus" toggle is a collapsible section
      const toggle = this.page.locator("button", {
        hasText: /Orchestrator Focus|synthesis/i,
      });
      if (await toggle.isVisible()) {
        await toggle.click();
      }
      const synthesisArea = this.page.locator("textarea").nth(1);
      await synthesisArea.fill(synthesisInstructions);
    }

    await this.page.click('button:has-text("Broadcast")');
  }

  /**
   * Wait for the BroadcastResults panel to appear.
   * @param {{ timeout?: number }} [opts]
   */
  async waitForBroadcastResults({ timeout = 180_000 } = {}) {
    await this.page
      .locator("text=Broadcast Results")
      .first()
      .waitFor({ timeout });
  }

  /**
   * Wait for the orchestrator card to leave Busy/Synthesizing and return to Ready.
   * @param {{ timeout?: number }} [opts]
   */
  async waitForOrchestratorIdle({ timeout = 180_000 } = {}) {
    await expect
      .poll(
        async () => {
          const orchCard = this.page
            .locator("div")
            .filter({ hasText: /Orchestrator/ })
            .first();
          const text = await orchCard.textContent();
          // Idle when status is Ready (not Busy / Synthesizing)
          return text?.includes("Ready") && !text?.includes("Busy");
        },
        { timeout, intervals: [3_000] },
      )
      .toBeTruthy();
  }

  // ---------------------------------------------------------------------------
  // Session control (lives inside the Header)
  // ---------------------------------------------------------------------------

  /** Open the session panel. If it's already open, does nothing. */
  async openSessionPanel() {
    // If the panel is already open ("Saved Sessions" heading is visible), skip.
    const heading = this.page.getByText("Saved Sessions", { exact: true });
    const alreadyOpen = await heading.isVisible();
    if (alreadyOpen) return;

    await this.page.locator('[data-testid="session-trigger"]').click();
    await expect(heading).toBeVisible({ timeout: 5_000 });
  }

  /**
   * Open the session panel and save the current session under `name`.
   * @param {string} name
   */
  async saveSession(name) {
    await this.openSessionPanel();
    await this.page.click('button:has-text("Save as")');
    await this.page.fill('input[placeholder="Session name"]', name);
    await this.page.keyboard.press("Enter");
    // Close the panel
    await this.openSessionPanel();
  }

  /**
   * Assert that a saved session row with the given name is visible in the
   * session panel. Assumes the panel is already open.
   * @param {string} name
   */
  async expectSessionInList(name) {
    await expect(
      this.page.locator('[data-testid="session-item"]').filter({ hasText: name }),
    ).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Load a session by name using the "Restore (UI only)" button.
   * Hovers over the row first because the action buttons are opacity-0 until hover.
   * @param {string} name
   * @param {"ui" | "respawn"} [mode="ui"]
   */
  async loadSession(name, mode = "ui") {
    const row = this.page.locator('[data-testid="session-item"]').filter({ hasText: name });
    await row.scrollIntoViewIfNeeded();
    const title = mode === "ui" ? "Restore (UI only)" : "Re-spawn agents";
    // force: true bypasses the opacity-0 / pointer-events constraint on the action buttons
    await row.locator(`button[title="${title}"]`).click({ force: true });
  }

  // ---------------------------------------------------------------------------
  // Agent card actions
  // ---------------------------------------------------------------------------

  /**
   * Click the Stop button on the first card that contains `repoPath`.
   * @param {string} repoPath  "owner/repo" or repoName
   */
  async stopAgent(repoPath) {
    const card = this.page
      .locator(".card-appear")
      .filter({ hasText: repoPath })
      .first();
    await card.locator('button[title="Stop Agent"]').click();
  }

  /**
   * Send a direct prompt to an agent card.
   * @param {string} repoPath
   * @param {string} text
   */
  async sendPromptToAgent(repoPath, text) {
    const card = this.page
      .locator(".card-appear")
      .filter({ hasText: repoPath })
      .first();
    await card.locator("input, textarea").last().fill(text);
    await card
      .locator('button[title*="Send"], button:has-text("Send")')
      .click();
  }

  // ---------------------------------------------------------------------------
  // Test-infrastructure helpers (mock worker / /api/test/* endpoints)
  // ---------------------------------------------------------------------------

  /**
   * Configure the server to use a custom CLI path/args for spawning agents.
   * Only works when the server is NOT running in production mode.
   * @param {string} cliPath  Executable path (e.g. "node")
   * @param {string[]} cliArgs  Extra args prepended before --acp --stdio
   */
  async setCliOverride(cliPath, cliArgs = []) {
    await this.page.request.post("/api/test/set-cli", {
      data: { path: cliPath, args: cliArgs },
    });
  }

  /** Restore the server's CLI to defaults. */
  async clearCliOverride() {
    await this.page.request.post("/api/test/clear-cli");
  }

  /**
   * Create a mock agent directly from a local repo path, bypassing git clone
   * and URL validation. The server uses whatever CLI override is active.
   * Resolves with the assigned agentId.
   *
   * @param {string} repoPath  Absolute path to a local git repo on the server host
   * @param {"worker"|"orchestrator"} [role="worker"]
   * @param {string} [name]  Optional display name (defaults to basename of repoPath)
   * @returns {Promise<string>}  agentId
   */
  async createMockAgent(repoPath, role = "worker", name) {
    const res = await this.page.request.post("/api/test/create-agent", {
      data: { repoPath, role, name },
    });
    const body = await res.json();
    return body.agentId;
  }

  /**
   * Wait for the session error banner to become visible in the session panel.
   * @param {{ timeout?: number }} [opts]
   */
  async waitForSessionError({ timeout = 10_000 } = {}) {
    await expect(
      this.page.locator('[data-testid="session-restore-error"]'),
    ).toBeVisible({ timeout });
  }

  /**
   * Click the "Retry N failed" button in the BroadcastResults panel.
   */
  async clickRetryFailed() {
    await this.page
      .locator('button:has-text("Retry")')
      .filter({ hasText: /failed/i })
      .click();
  }

  /**
   * Wait for the BroadcastResults panel to show at least one error result row.
   * @param {{ timeout?: number }} [opts]
   */
  async waitForBroadcastError({ timeout = 60_000 } = {}) {
    await this.page
      .locator('[data-testid="broadcast-result-error"], .text-red-400')
      .filter({ hasText: /error|fail/i })
      .first()
      .waitFor({ state: "visible", timeout });
  }
}
