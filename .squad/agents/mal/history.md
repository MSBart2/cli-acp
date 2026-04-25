# Mal — History

## Core Context

- **Project:** cli-acp — ACP Agent Orchestrator web UI
- **Operator:** hobobart
- **Stack:** Node.js 18+ / Express / Socket.IO (backend) + React 18 / Vite 6 / Tailwind CSS 3 (frontend) + `@agentclientprotocol/sdk` (ACP)
- **Repo structure:** `webapp/server/` (backend), `webapp/client/src/` (frontend), `webapp/e2e/` (Playwright tests), `webapp/server/__tests__/` + `webapp/client/src/__tests__/` (Vitest tests)
- **Key files:** `server/index.js` (main server + ACP + Socket.IO), `server/helpers.js`, `server/sessionStore.js`, `client/src/App.jsx`, `client/src/components/`

## Learnings

### 2026-04-25 — Complete codebase review (Mal)

Performed comprehensive review of all server + client source, tests, and documentation. Reviewed 2449 lines in `server/index.js`, all helpers, all client components, hooks, and utils. 424 total tests (130 server, 294 client) all passing.

**Overall assessment:** Codebase is in strong shape. Architecture is clean, error handling is present, no security red flags beyond known constraints. Found 2 critical items needing fixes, 4 important items for improvement, and several minor items for polish.

**Key findings:**
- Race condition in `repoBseDirRef` typo could cause subtle config bugs
- Missing early-return guard in `orchestrator:approve_routing_plan` allows operations on empty plan
- Several helper functions lack null/undefined guards
- JSDoc coverage incomplete across many server helpers
- Documentation drift in model lists and component inventories

**What I didn't find (good news):**
- No TODO/FIXME/HACK comments left in code
- No obvious memory leaks or unbounded growth
- All tests passing, good coverage of critical paths
- Security boundaries (URL validation, permission resolvers, NODE_ENV checks) all tight
- Broadcast concurrency guard in place (activeBroadcastWave check)

### 2026-04-14 — Server code simplification + testability refactor (completed)

Resolved the broadcast concurrency risk flagged in the initial deep-read: `activeBroadcastWave` guard added to `agent:prompt_all` — second broadcast rejected if first wave is still active (Wash).

Full extraction batch:
- **Zoe:** `createSessionUpdateHandler` + `createRequestPermissionHandler` moved to module level; ACP wiring now unit-testable without spawning copilot
- **Wash:** `spawnAndConnect`, `crossPopulateDependedBy`, `forwardToOrchestrator`, `respawnAgentsFromSnapshot` extracted from `index.js`; `parseRoutingPlan`, `buildMissionPrefix`, `buildCrossRepoContext`, `enrichPromptText`, `buildSynthesisPrompt` moved to `helpers.js` as named exports
- **Simon:** 29 new server tests for extracted helpers — server 110, client 184 = 294 total, all passing

No behavior change. Reduces cognitive load in `createAgent` and `index.js` socket handlers.

**Risk closed:** broadcast wave state overwrite (was item 3 in Cross-Cutting Concerns from initial deep-read).

---

### 2026-04-14 — Initial deep-read

#### System Overview
This is a **web-based multi-agent orchestrator** that lets an operator launch one `copilot --acp --stdio` child process per Git repo (up to 1 orchestrator + N workers), send broadcast prompts across all workers, coalesce results, and auto-forward synthesis work to the orchestrator agent. Sessions are persistable and restorable. The flagship scenario is cross-repo documentation audits with issue/PR tracking.

#### Key Architectural Patterns

- **Event-driven via Socket.IO** — Browser ↔ Server communicate exclusively over WebSocket events (`agent:create`, `agent:update`, `agent:permission_request`, `broadcast:start`, etc.). All state transitions originate as server-emitted events; the client is essentially a dumb renderer of those events.
- **Orchestrator / Worker role split** — The server's `agents` Map tags each entry with `role: "orchestrator" | "worker"`. Broadcasts fan out only to workers; synthesized results are then auto-prompted to the orchestrator. The UI reflects this with separate teal (orchestrator) vs. purple (worker) card styling and position.
- **ACP lifecycle per agent** — Each agent follows: `spawn process → ACP initialize → newSession(cwd) → ready → prompt ↔ sessionUpdate/requestPermission → stop → kill + cleanup`. The `ClientSideConnection` SDK handle owns the JSON-RPC stream to the child process.
- **Dependency graph as a first-class concept** — `buildDependencyGraph()` in `helpers.js` constructs a bidirectional graph from `acp-manifest.json` `dependsOn`/`dependedBy` declarations. The server uses this for prompt injection (upstream context) and cascade routing (downstream follow-ups). Graph is authoritative — one-sided `dependedBy` is honored the same as forward `dependsOn`.
- **Inactivity vs. wall-clock timeouts** — Short bounded ops (`initialize`, `newSession`) use `withTimeout()` (fixed wall-clock). Long-running prompts use `withActivityTimeout()` with a heartbeat reset on every streaming chunk — so active agents never time out, silent ones do after 5 minutes.
- **Session persistence** — `sessionStore.js` handles save/load/list/delete of named sessions. `sessionLifecycle.js` handles bulk shutdown. Auto-save triggers on agent stop; auto-naming uses orchestrator repoName + date.

#### Cross-Cutting Concerns to Watch

- **Security — URL validation is the gate**: `isValidGitUrl()` in `helpers.js` is the only guard against arbitrary repo cloning. It must remain restrictive (HTTPS only, GitHub/GitLab/Bitbucket/AzureDevOps allow-list). Any relaxation is a SSRF/path-traversal risk.
- **Security — test-only reset endpoint**: `/api/test/reset` is guarded by `NODE_ENV !== "production"` check. Must never ship in production. Confirm this check is tight.
- **Security — CORS**: Socket.IO CORS is hardcoded to `http://localhost:5173`. Fine for dev/demo; would need env-var parameterization before any hosted deployment.
- **Error handling**: Server errors are forwarded to the client as `agent:error` events and appended to the agent's output array. Need to audit that all async paths in `index.js` have a try/catch that emits `agent:error` — otherwise errors swallow silently.
- **Timeout strategy**: The 5-minute inactivity timeout is generous. Risk: a genuinely stalled agent (e.g., waiting for user input that never comes) holds a child process open. No currently visible circuit-breaker beyond that timeout.
- **Temp dir cleanup**: Repos are cloned into `<tmpdir>/acp-repos/`. Cleanup happens on `agent:stop`. If the server crashes mid-session, orphaned clones remain. `scripts/teardown.js` is the recovery path — worth verifying it's robust.
- **Broadcast wave serialization**: Only one `activeBroadcastWave` at a time. If a second broadcast fires before the first settles, state will be overwritten. The UI should be blocking this but needs a code-level check too.

#### Questions / Risks for the Team

1. **Is `isValidGitUrl()` tested against path-traversal and double-encoded URLs?** Need to check `helpers.test.js` coverage depth. (@Wash/@Simon)
2. **What happens to `permissionResolver` if the agent process dies mid-permission?** The promise may leak if the resolver is never called. (@Zoe)
3. **Cascade routing + broadcast: is the replay-after-synthesis ordering guaranteed?** The ARCHITECTURE.md says cascade analysis is replayed after the orchestrator finishes synthesis — need to verify the control flow handles race conditions. (@Zoe/@Wash)
4. **Session restore vs. re-spawn UX**: Docs cover this, but does the server have a time/staleness guard on restored sessions that reference clones that may no longer exist on disk? (@Wash)
5. **Model selection persisted in session**: If a model is deprecated between save and restore, what's the error path? Surfaced to user or silently falls back? (@Kaylee/@Wash)

#### Key File Locations (for my reference)

| What | Where |
|---|---|
| Server entry + ACP orchestration | `webapp/server/index.js` |
| URL validation, dep graph, work-item extraction | `webapp/server/helpers.js` |
| Session save/load/list/delete | `webapp/server/sessionStore.js` |
| Agent shutdown lifecycle | `webapp/server/sessionLifecycle.js` |
| React app + all socket event wiring | `webapp/client/src/App.jsx` |
| Agent state merge logic | `webapp/client/src/agentState.js` |
| Dependency suggestion logic | `webapp/client/src/dependencySuggestions.js` |
| Architecture reference | `ARCHITECTURE.md` |
| Squad decisions log | `.squad/decisions.md` |
| Copilot instructions | `.github/copilot-instructions.md` |
