/**
 * Playwright globalSetup — runs once before any test file.
 *
 * Calls the test-only reset endpoint on the Express server to stop any agents
 * that were left running by a previous test run or manual session. This
 * ensures every test suite starts with a clean slate (no orchestrator card
 * visible, OrchestratorInput rendered).
 */
export default async function globalSetup() {
  const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";
  try {
    const res = await fetch(`${BASE}/api/test/reset`, { method: "POST" });
    const { stopped } = await res.json();
    if (stopped > 0) {
      console.log(`[globalSetup] Reset: stopped ${stopped} lingering agent(s)`);
    }
  } catch (err) {
    // Server may not be up yet on very first run — that's fine, there are no
    // agents to clear anyway.
    console.warn(`[globalSetup] Could not reach reset endpoint: ${err.message}`);
  }
}
