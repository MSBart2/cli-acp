/**
 * Canonical repo URLs used across all e2e test suites.
 *
 * Update these when the demo repos move or you want to point at different repos.
 * The display name (owner/repo) must match what the UI shows in AgentCard —
 * it is derived from the last two URL path segments, case-preserved.
 */

export const ORCHESTRATOR_URL = "https://github.com/MSBart2/cli-acp";
export const WORKER_FANHUB_URL = "https://github.com/MSBart2/FanHub";
export const WORKER_ASPIRE1_URL = "https://github.com/MSBart2/aspire1";

/** Display names as shown in AgentCard (owner/repo, case-preserved from URL) */
export const ORCHESTRATOR_REPO = "MSBart2/cli-acp";
export const WORKER_FANHUB_REPO = "MSBart2/FanHub";
export const WORKER_ASPIRE1_REPO = "MSBart2/aspire1";

/** Short name used in OrchestratorCard (basename only) */
export const ORCHESTRATOR_NAME = "cli-acp";
