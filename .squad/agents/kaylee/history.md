# Kaylee — History

## Core Context

- **Project:** cli-acp — ACP Agent Orchestrator web UI
- **Operator:** hobobart
- **My domain:** `webapp/client/src/` — `App.jsx`, `components/`, `hooks/`, `agentState.js`
- **Stack:** React 18, Vite 6, Tailwind CSS 3, lucide-react icons, Socket.IO client
- **UI style:** Dark theme glassmorphism — `bg-white/5 backdrop-blur-xl`, gradient borders, `card-appear` CSS class on agent cards
- **Key components:** `AgentCard.jsx` (worker), `OrchestratorCard.jsx`, `BroadcastInput.jsx` (has `data-testid="broadcast-panel"`), `SessionControl.jsx` (has `data-testid="session-trigger"`, `data-testid="session-item"`), `Header.jsx`, `RepoInput.jsx`
- **data-testid contract with Simon:** `orchestrator-status`, `agent-status`, `broadcast-panel`, `broadcast-submit`, `session-trigger`, `session-item` — do NOT remove these

## Learnings

### Session: 2026-04-14 — Extract useAgentSocket hook

- Extracted the entire 305-line `useEffect` socket block from `App.jsx` into `hooks/useAgentSocket.js`
- Hook accepts `(socket, setters)` — `setters` is destructured at the top of the hook body
- `mergeAgentSnapshot` import moved from `App.jsx` to the hook (the only consumer)
- `useEffect` removed from `App.jsx`'s React import after extraction (no other `useEffect` in the file)
- `App.jsx` line count: 627 → 333 (within the 250-line charter; still slightly over, but a major reduction)
- Pattern matches `useNotifications.js`: hook owns its own `useEffect` with `[]` dep array and full cleanup

---

### Session: 2026-04-14 — Deep codebase review

---

#### Component Inventory

| Component | What it renders | Key props |
|---|---|---|
| `AgentCard.jsx` | Per-worker card: status badge, dependency pills, manifest chip, unloaded-dep "Load as Worker" buttons, output stream (last 3 entries), permission banner, prompt input | `agent`, `onSendPrompt`, `onStop`, `onRestart`, `onPermissionResponse`, `onCreateManifest`, `onLoadWorker` |
| `OrchestratorCard.jsx` | Full-width orchestrator card: collapsible, teal-themed, larger output window (last 200 entries), spawn-step progress, unloaded-dep panel, permission banner, prompt input | `agent`, `unloadedDependencies`, `onSendPrompt`, `onStop`, `onRestart`, `onPermissionResponse`, `onLoadWorker` |
| `OrchestratorInput.jsx` | Teal-themed input panel shown when no orchestrator is running; launches "orchestrator" role | `onLaunch`, `connected` |
| `RepoInput.jsx` | Worker launch card — styled as a grid card alongside `AgentCard`s; launches "worker" role | `onLaunch`, `connected` |
| `BroadcastInput.jsx` | Broadcast prompt panel with `@repoName` autocomplete, targeting pills, optional Orchestrator Focus textarea | `onBroadcast`, `readyCount`, `totalCount`, `busyCount`, `errorCount`, `spawningCount`, `broadcasting`, `hasOrchestrator`, `broadcastProgress`, `workerRepoNames` |
| `BroadcastResults.jsx` | Coalesced results panel post-broadcast: accordion per repo, copy-to-clipboard markdown export | `broadcastResults`, `onDismiss` |
| `BroadcastHistory.jsx` | Collapsible history of past broadcast waves, most-recent-first | `history` |
| `DependencyGraph.jsx` | Collapsible DAG panel: role-coloured node list with indented consumer rows, warnings banner, refresh button | `graph`, `onRefresh` |
| `WorkItemTracker.jsx` | Live issue/PR dashboard auto-extracted from agent output, grouped by repo | `items`, `onDismiss` |
| `MissionContext.jsx` | Collapsible session-brief textarea below header; auto-expands when server pushes a value | `value`, `onChange` |
| `RoutingPlanPanel.jsx` | Routing plan approval panel: editable downstream prompts per target repo, Approve/Cancel | `plan`, `onApprove`, `onCancel` |
| `SessionControl.jsx` | Dropdown for saving/loading/deleting sessions; shows agent/workItem/broadcast summary pills; restore (UI-only) vs re-spawn modes | `socket` |
| `Header.jsx` | Top bar: logo, Clone-to input, Reuse-existing checkbox, notification bells, sound toggle, connection dot, `SessionControl` | `connected`, `repoBaseDir`, `onRepoBashDirChange`, `reuseExisting`, `onReuseExistingChange`, `socket`, `browserPermission`, `onRequestBrowserPermission`, `soundEnabled`, `onToggleSoundEnabled` |

---

#### Socket.IO Events — App.jsx listens to

| Event | State updated |
|---|---|
| `connect` | `connected = true`; emits `workitems:list`, `broadcast:list_history`, `graph:list`, `mission:get` |
| `disconnect` | `connected = false` |
| `agent:spawning` | `agents[id]` — status `"spawning"`, `spawnStep`, `spawnMessage` |
| `agent:created` | `agents[id]` — full agent entry, clears spawnStep/spawnMessage |
| `agent:snapshot` | `agents[id]` — merges snapshot via `mergeAgentSnapshot` |
| `agent:update` | `agents[id].output` — merges text chunks, appends tool_call/status entries |
| `agent:prompt_complete` | `agents[id].status = "ready"` |
| `agent:permission_request` | `agents[id].pendingPermission = { title, options }` |
| `agent:error` | `agents[id].status = "error"`, appends error entry to output |
| `agent:stopped` | Deletes `agents[id]` from map |
| `agent:prompt_all_complete` | `broadcasting = false`, `broadcastProgress = null` |
| `agent:broadcast_results` | `broadcastResults = data` |
| `agent:broadcast_progress` | `broadcastProgress = data` |
| `workitems:updated` | `workItems = data.items` |
| `broadcast:history` | `broadcastHistory = data.history` |
| `mission:updated` | `missionContext = text` |
| `graph:updated` | `depGraph`, `unloadedDeps`, `agents[id].unloadedDeps/manifestMissing` |
| `graph:manifest_missing` | `agents[id].manifestMissing = true` |
| `graph:unloaded_deps` | `unloadedDeps[agentId]`, `agents[id].unloadedDeps` |
| `graph:inconsistency` | `depGraph.warnings` appended |
| `session:loaded` | `repoBaseDir`, `reuseExisting` from settings; clears transient panels; emits `graph:list` |
| `orchestrator:routing_plan` | `routingPlan = data` |
| `agent:impact_checking` | `agents[id].impactChecking = checking` for matching `downstreamRepoNames` |

App.jsx emits: `agent:create`, `agent:prompt`, `agent:stop`, `agent:restart`, `agent:permission_response`, `agent:prompt_all`, `orchestrator:create_manifest`, `orchestrator:approve_routing_plan`, `orchestrator:cancel_routing_plan`, `mission:set`, `graph:list`, `workitems:list`, `broadcast:list_history`.

---

#### agentState.js — Agent entry shape

Fields produced by `mergeAgentSnapshot()`:

| Field | Type | Notes |
|---|---|---|
| `agentId` | string | Unique agent identifier |
| `repoUrl` | string | Git URL of the repo |
| `repoName` | string | Short repo name |
| `repoPath` | string \| null | Local cloned path |
| `model` | string \| null | Copilot model in use or null for default |
| `role` | `"worker"` \| `"orchestrator"` | Defaults to `"worker"` |
| `status` | `"ready"` \| `"busy"` \| `"spawning"` \| `"initializing"` \| `"stopped"` \| `"error"` | |
| `spawnStep` | `"cloning"` \| `"starting"` \| `"verifying"` \| null | Active during spawning |
| `spawnMessage` | string \| null | Human-readable spawn status |
| `manifest` | object \| null | ACP manifest with `dependsOn[]`, `dependedBy[]` |
| `manifestMissing` | boolean | true if server reports no manifest found |
| `unloadedDeps` | `Array<{repoName, direction, suggestedUrl?}>` | Dependency repos not yet loaded as workers |
| `output` | `Array<{type: "text"\|"tool_call"\|"error", content, name?, args?}>` | Streamed output entries — client-only, never overwritten by server |
| `pendingPermission` | `{title, options}` \| null | Active permission request — client-only |
| `impactChecking` | boolean | Set by `agent:impact_checking` event, not in mergeAgentSnapshot |

---

#### data-testid Contract

| testid | Component | Element |
|---|---|---|
| `agent-status` | `AgentCard.jsx:126` | Status pill `<span>` |
| `orchestrator-status` | `OrchestratorCard.jsx:153` | Status pill `<div>` |
| `broadcast-panel` | `BroadcastInput.jsx:190` | Outer wrapper `<div>` |
| `broadcast-submit` | `BroadcastInput.jsx:250` | Submit `<button>` |
| `session-trigger` | `SessionControl.jsx:88` | Session dropdown trigger `<button>` |
| `session-item` | `SessionControl.jsx:146` | Each session row `<div>` |

**Do not remove any of these without checking with Simon.**

---

#### Key Tailwind Patterns (dark theme / glassmorphism)

- **Page background:** `bg-[#0a0a0f]`
- **Card inner bg:** `bg-[#12121a]` (worker), `bg-[#0d0d14]` (orchestrator/results panels)
- **Gradient border trick:** outer `p-[1px] rounded-xl bg-gradient-to-br from-X/40 via-Y/40 to-Z/40`, inner `rounded-xl bg-[#12121a]`
- **Glass surfaces:** `bg-white/5 backdrop-blur-xl`, `bg-white/[0.03]`
- **Subtle borders:** `border border-white/10`
- **Status pill colours:** ready=teal (orchestrator) or green (worker), busy=amber, error=red, spawning=purple, initializing=blue
- **Input fields:** `bg-white/10 border border-white/20 rounded-lg focus:ring-2 focus:ring-purple-500/50`
- **Button gradients:** `bg-gradient-to-r from-purple-600 to-blue-600` (worker), `from-teal-600 to-cyan-600` (orchestrator)
- **Dependency pills:** teal=dependsOn, gray=dependedBy, amber=manifest missing, blue=unloaded deps
- **Card animation:** `card-appear` CSS class (defined in `index.css`)
- **Pulse animation on busy status dots:** `animate-ping` inner span + outer static span

---

#### Components Exceeding 250-line Limit (⚠️ flag for extraction)

| File | Lines | Extraction candidates |
|---|---|---|
| `App.jsx` | **627** | Socket event wiring could move to a custom hook; handlers could be grouped |
| `AgentCard.jsx` | **392** | Spawn progress, dependency pills section, and output renderer are each extractable |
| `OrchestratorCard.jsx` | **373** | Unloaded deps banner and output renderer are extractable |
| `BroadcastInput.jsx` | **350** | `@mention` autocomplete logic (`getMentionAt`, `parseAtMentions`, suggestion dropdown) is extractable into a hook |

`SessionControl.jsx` is at 199 lines — close to limit but currently fine.

---

#### Hooks Inventory

| Hook | File | Returns | What it does |
|---|---|---|---|
| `useNotifications` | `hooks/useNotifications.js` (210 lines) | `{ requestBrowserPermission, browserPermission, soundEnabled, toggleSoundEnabled }` | Wires Socket.IO events (`agent:created`, `agent:error`, `agent:permission_request`, `agent:prompt_complete`) to react-hot-toast toasts, browser Notification API (background-only), and Web Audio API sound cues. Persists sound preference in `localStorage`. |

---

#### README / Scenario notes (UI-relevant)

- Two UI settings live in the header: **Clone to** (overrides `REPO_BASE_DIR`) and **Reuse existing** checkbox.
- Reuse mode shows an amber warning banner when checked.
- The flagship scenario is the documentation audit (scenario 02); scenario 03 covers the dependency-aware routing flow that produces the `RoutingPlanPanel`.
- Session persist/restore scenario (05) is served by `SessionControl` — "Play" = UI-only restore, "RotateCw" = re-spawn live agents.
- `@repoName` mention targeting in `BroadcastInput` maps to `targetedRepos` passed to `agent:prompt_all`.
