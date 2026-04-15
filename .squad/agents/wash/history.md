# Wash — History

## Core Context

- **Project:** cli-acp — ACP Agent Orchestrator web UI
- **Operator:** hobobart
- **My domain:** `webapp/server/` — `index.js` (Socket.IO events), `helpers.js` (URL validation, repo naming), `sessionStore.js` (session JSON persistence), `sessionLifecycle.js`
- **Stack:** Node.js 18+ ES Modules, Express, Socket.IO, Vitest for tests
- **Session storage:** `~/.acp-orchestrator/sessions/<name>.json` — saves agents, workItems, broadcastHistory, settings
- **Key Socket.IO events I own:** `agent:create`, `agent:stop`, `agent:prompt`, `agent:permission_response`, `session:save`, `session:load`, `session:delete`, `session:list`, `broadcast:prompt`

## Learnings

### Session 2026-04-14 — Invert stopAgent save behaviour

- `stopAgent` now uses **opt-in** saving via `{ saveSession: true }` instead of opt-out via `{ skipAutoSave: true }`. Default is `saveSession = false`.
- Only one call site should pass `{ saveSession: true }`: the `agent:stop` socket handler (user-initiated, intentional stop).
- Test resets (`/api/test/reset`) and bulk shutdowns (`shutdownAgents`) pass no options or `{}` — saving is never triggered inadvertently.
- The bulk-shutdown snapshot is handled by `shutdownAgents` itself via `persistSnapshot`, not by individual `stopAgent` calls.
- Rule: any new caller that wants saving must **explicitly opt in**. Silence = no save. This protects session integrity.

### Session 2026-04-14 — Deep read of server files

#### Socket.IO events I own

**Client → Server (C→S):**

| Event | Payload | What it does |
|---|---|---|
| `agent:create` | `{ repoUrl, role, repoBaseDir, reuseExisting, model }` | Validates URL, clones repo, spawns copilot process, initializes ACP session, runs manifest verification prompt |
| `agent:prompt` | `{ agentId, text }` | Enriches text with mission prefix + cross-repo context, prompts agent, triggers cascade analysis on completion |
| `agent:prompt_all` | `{ text, synthesisInstructions, targetRepoNames }` | Broadcasts to all ready workers in parallel, coalesces results, auto-forwards synthesis to orchestrator |
| `agent:stop` | `{ agentId }` | Kills process, cleans up repo folder (unless reused), auto-saves session |
| `agent:restart` | `{ agentId }` | Re-creates a stopped agent using same repoUrl, role, model |
| `agent:permission_response` | `{ agentId, optionId }` | Resolves the pending `permissionResolver` Promise on the agent entry |
| `orchestrator:approve_routing_plan` | `{ planId, routes }` | Executes approved cascade routes as targeted agent prompts |
| `orchestrator:cancel_routing_plan` | `{ planId }` | Removes pending routing plan, clears cascade run tracking |
| `orchestrator:create_manifest` | `{ agentId }` | Prompts agent to create `acp-manifest.json`, refreshes graph after |
| `session:list` | _(none)_ | Returns list of saved session files |
| `session:save` | `{ name }` | Saves current state under given name; auto-names from orchestrator repo + date if still "default" |
| `session:load` | `{ name, mode }` | Stops all agents, loads snapshot, re-hydrates maps, re-emits hydration events; `mode="respawn"` re-launches all processes |
| `session:delete` | `{ name }` | Deletes the JSON file from disk |
| `workitems:list` | _(none)_ | Returns current work item registry |
| `mission:set` | `{ text }` | Sets global mission context, broadcasts to ALL connected sockets via `io.emit` |
| `mission:get` | _(none)_ | Returns current mission context |
| `broadcast:list_history` | _(none)_ | Returns last 10 broadcast waves |
| `graph:list` | _(none)_ | Refreshes all manifests from disk, emits snapshots + graph state |

**Server → Client (S→C):**

| Event | When emitted |
|---|---|
| `agent:spawning` | During `createAgent` — step "cloning" then "starting" then "verifying" |
| `agent:created` | After successful ACP init + manifest verification |
| `agent:snapshot` | After manifest refresh or graph changes |
| `agent:update` | For each `sessionUpdate` chunk (text, tool_call, tool_call_update, plan, thought) + status changes |
| `agent:stopped` | After `stopAgent` or from `/api/test/reset` |
| `agent:error` | On any failure path |
| `agent:permission_request` | When ACP calls `requestPermission` |
| `agent:prompt_complete` | When prompt resolves successfully |
| `agent:broadcast_progress` | After each worker completes in a `agent:prompt_all` wave |
| `agent:broadcast_results` | After all workers finish — includes coalesced per-agent output |
| `agent:impact_checking` | Start/end of cascade analysis by orchestrator |
| `orchestrator:routing_plan` | When orchestrator emits targeted follow-up routes |
| `workitems:updated` | When new issue/PR URLs are detected in agent output |
| `broadcast:history` | After broadcast wave completes or on `broadcast:list_history` |
| `session:list` | After save/delete/list operations |
| `session:loaded` | After successful `session:load` — includes restored settings |
| `session:error` | On session load/delete failure |
| `mission:updated` | On `mission:set` (all sockets) or `mission:get` |
| `graph:updated` | When dependency graph changes |
| `graph:manifest_missing` | For each agent with `manifestMissing=true` on graph emit |
| `graph:unloaded_deps` | For agents with dependency neighbors not in current session |
| `graph:inconsistency` | When manifest cross-validation or cycle detection finds problems |

---

#### Session storage

- **Location:** `~/.acp-orchestrator/sessions/<name>.json`
- **Format:** `{ version: 1, name, createdAt, savedAt, settings: { repoBaseDir, reuseExisting }, agents: [...], workItems: [...], broadcastHistory: [...] }`
- **Auto-save triggers:** agent created, agent stopped, broadcast wave complete, work item detected
- **Auto-naming:** when session name is still "default" and an orchestrator exists, renames to `<repoName>-<YYYY-MM-DD>`
- **Pruning:** `purgeOldSessions()` keeps max 25 sessions
- **Fallback recovery:** `getRestorableAgents()` falls back to broadcast history if saved `agents` array is empty (handles old buggy autosave path)
- **Manifest re-read on load:** before emitting graph state, server calls `refreshAllAgentManifestsFromDisk()` so unloaded-dep indicators reflect current disk state, not stale snapshot

---

#### helpers.js exports

| Export | What it does |
|---|---|
| `isValidGitUrl(url)` | Allowlist: only HTTPS URLs from github.com, gitlab.com, bitbucket.org, dev.azure.com. Rejects `..` path traversal. Returns boolean. |
| `repoNameFromUrl(url)` | Strips `.git`, takes `basename`, removes non `[a-zA-Z0-9._-]` chars. Filesystem-safe. |
| `extractWorkItems(text)` | Regex-scans free text for GitHub/GitLab/Bitbucket issue and PR URLs. Returns `[{ url, owner, repo, type, number }]`, deduplicated. |
| `CHANGE_SIGNAL_WORDS` | `Set<string>` — keywords like "breaking", "schema", "endpoint" used to decide whether cascade analysis should run after a prompt |
| `buildDependencyGraph(agentsMap)` | Builds `{ nodes, edges, warnings, unloadedDeps }` from agent manifests. Handles both `dependsOn` and `dependedBy`, cross-validates, runs DFS cycle detection. |
| `getGraphRelationships(agentsMap, agentId)` | Returns `{ upstream, downstream }` repo name arrays for a single agent by walking the graph. |
| `inferManifestRelationships(agents, agentId)` | Infers likely `dependsOn`/`dependedBy` seeds from other loaded agents' manifests — used when creating a new manifest. |

---

#### Environment variables the server reads

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | Express listen port |
| `COPILOT_CLI_PATH` | `copilot` | Path/name of the Copilot CLI binary |
| `REPO_BASE_DIR` | `<tmpdir>/acp-repos` | Base directory for shallow clones |
| `NODE_ENV` | — | When `"production"`, disables `/api/test/reset` endpoint |
| `ACP_SESSION_DIR` | `~/.acp-orchestrator/sessions` | (README-documented; actual path computed in sessionStore.js via `homedir()`) |

---

#### `/api/test/reset` endpoint

- `POST /api/test/reset` — only mounted when `NODE_ENV !== "production"`
- Stops all running agents (`stopAgent` with `skipAutoSave: true`) and emits `agent:stopped` to all connected sockets
- Returns `{ stopped: N }` JSON
- Used by E2E tests to guarantee a clean slate between specs

---

#### Patterns and gotchas

- **Inactivity timeout vs. wall-clock timeout:** `withActivityTimeout` is used for prompts — it resets on every `sessionUpdate` heartbeat so long-running agents are never killed mid-work. `withTimeout` (fixed wall-clock) is only used for `initialize()` and `newSession()`.
- **`skipAutoSave` flag on `stopAgent`:** bulk shutdowns (shutdown-all, test reset, session:load teardown) pass `skipAutoSave: true` to avoid wiping the session with an empty agents array before the save-once-at-the-top completes.
- **`agent:prompt_all` targets workers only** — orchestrator is excluded and receives synthesized results separately after all workers complete.
- **`io.emit` vs `socket.emit`:** `mission:set` uses `io.emit` to broadcast to ALL connected tabs; everything else uses the per-socket connection.
- **`cascadeRuns` Map** tracks visited repos across multi-hop cascade chains to prevent routing loops.
- **Manifest cross-population:** when a new agent loads with `dependsOn: [X]`, the server automatically prompts agent X to add this agent to its `dependedBy` array in its manifest file.
- **`sessionLifecycle.js` is tiny but critical:** `shutdownAgents()` enforces the "save once before loop" pattern; calling `stopAgent` inside the loop with `skipAutoSave: true` prevents the last stop from overwriting a good session.
- **`repoReused` flag controls cleanup:** folders created with `reuseExisting: true` are not deleted on `stopAgent` — only freshly-cloned UUID-suffixed folders are cleaned up.
