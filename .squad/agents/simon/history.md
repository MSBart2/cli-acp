# Simon — History

## Core Context

- **Project:** cli-acp — ACP Agent Orchestrator web UI
- **Operator:** hobobart
- **My domain:** All tests — `webapp/e2e/`, `webapp/server/__tests__/`, `webapp/client/src/__tests__/`
- **E2E:** Playwright, config in `webapp/playwright.config.js` — `timeout: 30_000`, `workers: 1`, `fullyParallel: false`, `reuseExistingServer: !process.env.CI`
- **Unit tests:** Vitest + React Testing Library. 73 server + 173 client = 246 total (all passing as of 2026-04-14)
- **E2E tests:** 21 tests across 3 specs (all passing as of 2026-04-14)
- **Page object:** `webapp/e2e/helpers/AppPage.js` — `openSessionPanel()`, `waitForOrchestratorReady()`, `waitForWorkerReady()`, `loadSession()`
- **Key lessons learned:**
  - `test.setTimeout(N)` must be the FIRST line of `beforeAll` — calling after any `await` misses the 30s default hook timeout
  - Use `evaluate((el) => el.click())` for opacity-0 buttons (CSS group-hover) — `click({force:true})` doesn't reliably fire React events
  - Toast notifications (`[data-rht-toaster]`) intercept pointer events for ~4s — use native DOM click or wait for them to clear
  - Synthesis test needs concurrent permission auto-approval loop (orchestrator requests permission to create `operations/` dir)
  - `data-testid` contract: `orchestrator-status`, `agent-status`, `broadcast-panel`, `broadcast-submit`, `session-trigger`, `session-item`

## Learnings

### Session: 2026-04-14 — Toast intercept fix in re-spawn e2e test

- **Toast pointer-event interception:** react-hot-toast `[role="status"]` elements inside `[data-rht-toaster]` remain in the DOM for ~4s and can block `hover()` on underlying elements. The fix is `page.locator('[data-rht-toaster] [role="status"]').waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {})` before any hover that could race with a toast.
- **Pattern:** Prefer `waitFor({ state: "hidden" })` over `waitForTimeout` — it reacts to actual DOM state rather than sleeping a fixed interval.
- **Decision written:** `.squad/decisions/inbox/simon-toast-intercept-fix.md`

### Session: 2026-04-14 — useAgentSocket and permissionResolver tests

- **Unit test counts after this session:** server ~81 (+8), client ~183 (+10) — totals estimated pending a run
- **Testing custom hooks:** use `renderHook` from `@testing-library/react`; build a `makeMockSocket()` helper that stores handlers in a map keyed by event name and exposes `_emit(event, data)` to simulate server pushes. The hook registers `"connect"` twice (setConnected + re-request state), so store handlers as arrays.
- **Testing state-updater functions:** when a setter is called with a function (e.g. `setAgents(prev => ...)`), capture it from `vi.fn().mock.calls.at(-1)[0]` and invoke it with a fixture state object to assert the transformation.
- **Server algorithm extraction for testability:** when `server/index.js` is not importable in isolation, copy the algorithm into the test file as a pure function and test it directly. Document this in the test with a comment explaining why.
- **permissionResolver cleanup:** the `cleanupOrphanedResolvers` logic must prefer `kind === "block" || kind === "deny"` options, fall back to `[0]`, and call `stopAgentFn` only when `pendingPermissionOptions` is null/empty (no optionId available). After resolution, both `permissionResolver` and `pendingPermissionOptions` must be nulled to prevent double-resolution.

### Session: 2026-04-14 — Deep Dive Review

---

#### E2E Test Inventory (21 tests across 3 spec files)

**01-launch-agents.spec.js** (6 tests)
1. `page loads and shows the orchestrator input panel` — Smoke: no agents needed; verifies OrchestratorInput and Launch button are visible, no agent cards present.
2. `orchestrator card reaches Ready` — Waits for orchestrator status badge to show "Ready" after launch.
3. `fanhub worker card reaches Ready` — Verifies fanhub worker card appears and reaches Ready.
4. `aspire1 worker card reaches Ready` — Same as above for the aspire1 worker.
5. `all three agents are Ready together` — Asserts 2 worker cards in the grid plus both workers and orchestrator simultaneously Ready.
6. `rejects an invalid repo URL and does not spawn an agent` — Launches with a non-git-host URL and expects an "Invalid repository URL" toast (no card created).
7. `stopping an agent removes it from the active card state` — Clicks Stop on fanhub; asserts the card is removed from the DOM.

*(Note: spec has 7 tests including the smoke test outside the describe block)*

**02-broadcast-synthesis.spec.js** (7 tests)
1. `broadcast input shows correct ready-worker count` — Verifies "2 of 2 agents ready" badge and that button is enabled once text is present.
2. `broadcast button is disabled when there are no ready workers` — Checks disabled state with empty textarea; enabled once text added.
3. `broadcasting a prompt transitions workers to Busy` — Broadcasts a prompt and asserts at least one "Busy" badge appears.
4. `broadcast results panel appears after workers complete` — Waits for BroadcastResults heading and "2/2 completed" badge.
5. `orchestrator synthesises broadcast results and returns to Ready` — Runs auto-approval loop for permission banners; waits for orchestrator-status badge to re-show "Ready".
6. `@mention targeting restricts broadcast to a single worker` — Types `@fanhub …`, checks for a targeting pill and button text "Send to 1 worker".
7. `broadcast history records the completed broadcast` — Verifies a "Broadcast History" or "Past broadcast" heading appears after completion.

**03-session-save-restore.spec.js** (7 tests)
1. `session control trigger button is visible in the header` — Asserts `data-testid="session-trigger"` is visible.
2. `session panel opens and shows Saved Sessions heading` — Opens session panel; checks heading.
3. `saving the session adds it to the session list` — Saves with a timestamp-unique name; verifies the session row and "2 agents" pill appear.
4. `restoring a session (UI-only) rehydrates agent cards` — Uses `evaluate((el) => el.click())` on the Restore button; checks orchestrator and worker cards are rehydrated.
5. `auto-save updates the saved-at timestamp` — Asserts "auto-saved" text is visible.
6. `deleting a session removes it from the list` — Creates throwaway session, double-clicks delete (first click → confirm state, second confirms); row disappears.
7. `re-spawn restore restarts agent processes (requires copilot)` — Clicks "Re-spawn agents" from session row; waits for orchestrator and worker to reach Ready.

---

#### AppPage Helper Methods (full inventory)

| Method | What it does |
|---|---|
| `goto()` | Navigates to `/` and waits for `"Connected"` (exact) to appear — confirms Socket.IO handshake. |
| `stopAllAgents()` | POSTs to `/api/test/reset`, then calls `goto()` to reload clean state. |
| `launchOrchestrator(repoUrl)` | Fills `input[placeholder*="orchestrator-repo"]` and clicks "Launch Orchestrator". Waits for input to be enabled first. |
| `launchWorker(repoUrl)` | Fills `input[placeholder*="github.com/owner/repo"]` and clicks "Launch Worker". |
| `autoApprovePermissions({ duration, interval })` | Polls for "Allow once" buttons for `duration` ms, clicking each when visible. |
| `waitForOrchestratorReady(repoName, { timeout })` | Asserts `[data-testid="orchestrator-status"]` with text "Ready" is visible. |
| `waitForWorkerReady(repoPath, { timeout })` | Locates `.card-appear` by `repoPath`, asserts `[data-testid="agent-status"]` with "Ready" inside it. |
| `waitForAgentError(repoPath, { timeout })` | Same card scoping but asserts "Error" badge — useful as negative assertion. |
| `broadcast(text, synthesisInstructions?)` | Fills broadcast textarea; optionally expands Orchestrator Focus section and fills it; clicks "Broadcast". |
| `waitForBroadcastResults({ timeout })` | Waits for `text=Broadcast Results` to appear. |
| `waitForOrchestratorIdle({ timeout })` | Polls orchestrator card `textContent` until it includes "Ready" and not "Busy". |
| `openSessionPanel()` | Clicks `[data-testid="session-trigger"]` if "Saved Sessions" heading not already visible. |
| `saveSession(name)` | Opens panel → "Save as" → fills name input → Enter → closes panel. |
| `expectSessionInList(name)` | Asserts `[data-testid="session-item"]` with matching text is visible. |
| `loadSession(name, mode?)` | Hovers the session row, then uses `evaluate((el) => el.click())` on the restore button (title varies: "Restore (UI only)" vs "Re-spawn agents"). |
| `stopAgent(repoPath)` | Finds the `.card-appear` card by `repoPath`, clicks `button[title="Stop Agent"]`. |
| `sendPromptToAgent(repoPath, text)` | Fills the last input/textarea in the agent card and clicks "Send". |

---

#### Current Coverage Gaps (flows not yet covered by E2E)

- **Dependency-aware routing** (scenario 03) — No E2E for `acp-manifest.json` dependency context injection, cascade routing plan, or the RoutingPlanPanel approval flow.
- **Load as Worker** (scenario 04) — No test for the "load missing dependency as worker" suggestion and launch path.
- **Orchestrator single-prompt** — No E2E for sending a direct targeted prompt to the orchestrator card (not broadcast).
- **Model selection** — No test that a non-default Copilot model can be selected and passed to agent spawn.
- **Permission deny / deny-all path** — Only "Allow once" is auto-approved in tests; "Deny" and "Always allow" paths are untested.
- **Broadcast follow-up cascade** — Scenario 03 mentions broadcast follow-up cascades raising a routing-plan approval; no E2E covers this.
- **Issue/PR tracking loop** — Scenarios 02/03 describe issue maps and coordinated PRs; no E2E exercises this flow.
- **MissionContext panel** — No E2E checks that the mission context input is visible or affects broadcast behavior.
- **WorkItemTracker** — No E2E verifies work items are surfaced from agent output.
- **Header Clone-to / Reuse-existing toggles** — UI settings in the header are not exercised by any E2E.
- **Disconnection recovery** — No test for socket disconnect/reconnect behavior.

---

#### Unit Test Inventory

**Server (3 files)**
- `helpers.test.js` — Covers `isValidGitUrl` (accepts GitHub/GitLab/Bitbucket/Azure DevOps HTTPS; rejects HTTP, SSH, unknown hosts, missing repo, query strings, fragments, path traversal), `repoNameFromUrl`, `extractWorkItems`, `buildDependencyGraph`, `getGraphRelationships`, `inferManifestRelationships`.
- `sessionStore.test.js` — Covers `saveSession`, `loadSession`, `listSessions`, `deleteSession`, `purgeOldSessions`, `getRestorableAgents`. Uses a full in-memory `node:fs` mock via `vi.hoisted` + `vi.mock`.
- `sessionLifecycle.test.js` — Covers `shutdownAgents`: validates that it saves once before bulk shutdown, calls `stopAgent` for each with `skipAutoSave: true`, and can skip persisting altogether.

**Client (17 test files)**
- `App.test.jsx` — Integration-style; mocks `socket.io-client` and stubs child components; exercises top-level socket event wiring and state transitions.
- `AgentCard.test.jsx` — Renders repo name, status badges (Ready/Spawning/Busy/Error), disables input during busy/spawning, shows permission banner, calls `onSendPrompt`/`onStop`/`onPermissionResponse`.
- `BroadcastInput.test.jsx` — Heading/badge rendering, disabled states (empty textarea, 0 ready agents, broadcasting), submit calls `onBroadcast` with trimmed text and clears field, singular "agent" text.
- `SessionControl.test.jsx` — Trigger button renders session name, panel open/close, list sessions, save, restore, delete flows.
- `AgentCard.test.jsx`, `BroadcastHistory.test.jsx`, `BroadcastResults.test.jsx`, `DependencyGraph.test.jsx`, `Header.test.jsx`, `MissionContext.test.jsx`, `OrchestratorCard.test.jsx`, `OrchestratorInput.test.jsx`, `RepoInput.test.jsx`, `RoutingPlanPanel.test.jsx`, `WorkItemTracker.test.jsx` — Each covers the named component's render states, interactions, and edge cases.
- `agentState.test.js`, `dependencySuggestions.test.js` — Pure logic modules tested in isolation.
- `useNotifications.test.js` — Hook unit test for browser notification permission state.

---

#### Test Environment Setup

- **globalSetup** (`webapp/e2e/globalSetup.js`): Runs once before any spec file. POSTs to `/api/test/reset` to kill lingering agents from prior runs. Gracefully swallows errors if the server isn't up yet (first cold start).
- **teardown** (`webapp/scripts/teardown.js`): Manual script (`npm run teardown`). Frees ports 3001 and 5173. Windows: `netstat -ano | findstr :PORT | findstr LISTENING` → `taskkill /PID`. Unix: `lsof -ti :PORT` → `kill`. Not invoked by Playwright automatically — run after a crashed dev session.
- **`SKIP_AGENT_E2E=1`**: Setting this env var causes all three `test.describe` blocks (01, 02, 03) to call `test.skip()`. The one smoke test in spec 01 (outside the describe) still runs. Enables fast UI-only validation without copilot CLI or GitHub access.

---

#### Playwright Config Key Settings

| Setting | Value / Notes |
|---|---|
| `testDir` | `./e2e` |
| `globalSetup` | `./e2e/globalSetup.js` |
| `timeout` | 30,000 ms (default per test; agent-spawning tests override with `test.setTimeout(600_000)`) |
| `expect.timeout` | 10,000 ms |
| `fullyParallel` | `false` — tests are stateful, sequential only |
| `workers` | 1 |
| `retries` | `1` in CI, `0` locally |
| `reporter` | HTML (never auto-open) + list |
| `baseURL` | `process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001"` |
| `headless` | `true` |
| `trace` | `"on-first-retry"` |
| `video` | `"retain-on-failure"` |
| `actionTimeout` | 5,000 ms |
| `navigationTimeout` | 15,000 ms |
| `webServer.command` | `npm start` (serves `client/dist/`) |
| `webServer.reuseExistingServer` | `true` locally, `false` in CI |
| `webServer.timeout` | 120,000 ms |
