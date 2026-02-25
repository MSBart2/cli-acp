# Plan: Cross-Repo Dependency Awareness & Orchestration

The system gains a shared **dependency graph** built from per-repo manifest files (`acp-manifest.json`). If a manifest is missing, the orchestrator notices and offers to create it via the relevant worker agent. Once the graph exists, every prompt is contextually enriched, downstream cards show impact badges, and the orchestrator drives cascaded follow-up work that the user approves step-by-step.

---

## Step 1 — Define the manifest schema

Each worker repo gets an `acp-manifest.json` at its root. Both directions of every dependency relationship are declared explicitly:

```json
{
  "repoName": "api-gateway",
  "description": "...",
  "role": "library" | "api" | "webapp" | "service" | "other",
  "techStack": ["node", "typescript"],
  "dependsOn":  ["class-lib-a", "class-lib-b"],
  "dependedBy": ["webapp"]
}
```

- `dependsOn` — repos this repo consumes (upstream). When this repo changes a public interface, changes must be backward-compatible or coordinated downstream.
- `dependedBy` — repos that consume this repo (downstream). When this repo publishes a breaking change, these repos will be impacted.

Both fields default to `[]` if absent. The server is the source of truth for cross-population (see Step 3).

---

## Step 2 — Enhance the startup verification prompt (`server/index.js` ~L466)

Replace the current one-liner with a richer prompt:

- Ask the agent to check if `acp-manifest.json` exists at the repo root.
- If it exists, read and return its full content as JSON.
- If it doesn't, describe the repo's apparent role and tech stack briefly so the server can store a provisional (unverified) summary.

Server handling of the response:

- Accumulate the agent's response into a new `manifestText` field on the agent entry.
- Attempt `JSON.parse()` — if it succeeds, store under `agent.manifest`; if it fails, store `agent.manifest = null` and set `agent.manifestMissing = true`.
- After verification completes, call `buildDependencyGraph()` and emit `graph:updated` to the client.

If the file is missing, the provisional description reports repo role/tech stack only — the system does **not** guess dependency lists.

---

## Step 3 — Add new agent registry fields (`server/index.js` ~L449)

Add to the per-agent entry:

```js
manifest: null,          // parsed acp-manifest.json, or null
manifestMissing: false,  // true when agent confirmed the file doesn't exist
```

### `buildDependencyGraph()` in `server/helpers.js`

Pure function (testable). Iterates all agents with non-null manifests:

1. Uses **both** `dependsOn` and `dependedBy` to build edges — explicit beats inferred.
2. Cross-validates: if `api-gateway.dependsOn` includes `class-lib-a` but `class-lib-a.dependedBy` doesn't include `api-gateway`, emit a `graph:inconsistency` warning to the UI.
3. Returns `{ nodes: [{ agentId, repoName, role, techStack }], edges: [{ from, to }], warnings: [] }`.

### `dependedBy` cross-population (server-driven)

When `api-gateway`'s manifest is parsed and lists `class-lib-a` in `dependsOn`:

- If `class-lib-a` is a loaded agent, the server automatically sends `class-lib-a`'s agent a targeted file-update prompt: add `"api-gateway"` to its `dependedBy` array (or create the file if missing).
- All manifest writes go through the agent's `connection.prompt()` — never direct disk writes — so changes flow cleanly into git.

### Unloaded dependency detection

After every `buildDependencyGraph()` call, collect all `repoName` values in any loaded agent's `dependsOn` or `dependedBy` that don't have a corresponding loaded agent. Emit `graph:unloaded_deps`:

```js
{ agentId, repoName, unloaded: [{ repoName, direction: "dependsOn" | "dependedBy" }] }
```

Also notify the orchestrator:

```
Worker "{repoName}" has been loaded. Its manifest declares dependencies not currently loaded:
- dependsOn (not loaded): class-lib-b
- dependedBy (not loaded): webapp

Would you like me to recommend loading these as workers? List URLs if known, otherwise ask the user.
```

In `AgentCard.jsx`, show a blue info chip: **"2 deps not loaded"** with an expand list and per-entry **"Load as Worker"** button. Clicking emits `agent:create` with `role: "worker"` and prompts the user for the URL (pre-filled if the orchestrator suggested one).

---

## Step 4 — Manifest sync auto-prompt

When a new manifest is created for repo A that lists repo B in `dependsOn`, the server automatically sends B's agent a prompt to add A to its `dependedBy`. Fully agent-directed — no server disk writes. Triggered after every successful manifest parse or re-parse.

---

## Step 5 — Inject dependency context into every worker prompt (`server/index.js` ~L609)

In `agent:prompt` and `agent:prompt_all` handlers, before calling `connection.prompt()`:

- Look up `agent.manifest?.dependsOn` → upstream repos this worker uses.
- Invert the graph to find downstream dependents.
- If either set is non-empty, prepend a `## Cross-Repo Context` block:

```
## Cross-Repo Context (injected by ACP Orchestrator)
This repo depends on: class-lib-a, class-lib-b (also loaded in this session).
The following repos in this session depend on this repo: api-gateway, webapp.
Keep cross-repo compatibility in mind. If your changes affect public interfaces, flag them explicitly.
```

Pure string concatenation — no new ACP message types needed.

---

## Step 6 — Cascade check after worker prompt completion (`server/index.js` ~L565)

After `agent:prompt_complete` fires for a worker, trigger an orchestrator cascade check **only when** the original prompt text contains change-signal words:

```
CHANGE_SIGNAL_WORDS = { add, update, remove, delete, rename, refactor, replace,
                         migrate, breaking, deprecate, interface, schema, contract,
                         field, type, endpoint, route }
```

If triggered, send the orchestrator:

```
Worker "{repoName}" just completed a task: "{originalPromptText}"

Dependency context:
- {repoName} is depended on by: webapp, api-gateway (both loaded in this session)

Review the worker's output and decide:
1. Do any changes require follow-up work in downstream repos?
2. If yes, write a targeted prompt for each affected downstream repo:
   @{repoName}: {prompt text}
3. If no downstream impact, reply: NO_CASCADE

Worker output:
{accumulated text}
```

The orchestrator's response flows through `parseRoutingPlan()` (existing helper) and emits `orchestrator:routing_plan` — the existing `RoutingPlan` confirmation UI appears with editable per-repo prompts. User approves before any downstream prompt fires.

---

## Step 7 — Update `AgentCard.jsx`

- **Dependency pills** in card header: teal pills for `dependsOn` repos, gray pills for `dependedBy` repos.
- **Impact badge**: when cascade check is running (orchestrator is busy after this worker's prompt), downstream cards show a pulsing amber **"Impact check…"** badge.
- **Missing manifest chip**: amber "No manifest · Create?" button that emits `orchestrator:create_manifest { agentId }`.
- **Unloaded deps chip**: blue "N deps not loaded" with expand list and "Load as Worker" buttons.

---

## Step 8 — Add `DependencyGraph.jsx` (new component)

Collapsible panel below the orchestrator card (similar to `BroadcastResults`). Shown when `graph:updated` has at least one edge.

- Simple DAG view: each node as a row with indented dependents, color-coded by role:
  - library → teal, api → blue, webapp → purple, service → amber
- Inconsistency warnings shown as a dismissable banner.
- "Refresh" button re-triggers manifest verification across all loaded workers.

---

## Step 9 — Wire new socket events in `App.jsx`

New state:

```js
const [depGraph, setDepGraph] = useState(null);
const [missingManifests, setMissingManifests] = useState([]);
const [unloadedDeps, setUnloadedDeps] = useState({});
```

Events:

- `graph:updated` → `setDepGraph`
- `graph:manifest_missing` → merge into agent state (`manifestMissing: true`)
- `graph:unloaded_deps` → `setUnloadedDeps` (keyed by agentId)
- `graph:inconsistency` → display warning in `DependencyGraph`
- `orchestrator:create_manifest` emitter wired from `AgentCard`

---

## Step 10 — Update tests

- `buildDependencyGraph()` unit tests in `server/__tests__/helpers.test.js`: graph inversion, cross-validation warnings, circular dependency detection (warn, don't crash), unloaded dep detection.
- `AgentCard` tests: manifest pill rendering, "Create?" button, "Load as Worker" button, impact badge.
- `DependencyGraph` snapshot + inconsistency warning test.
- `BroadcastInput` — verify cascade check is skipped when no change-signal words present.

---

## Verification

Load 4 workers: `class-lib-a`, `class-lib-b`, `api-gateway` (depends on both libs), `webapp` (depends on `api-gateway`). Confirm:

1. Cards with `acp-manifest.json` show dependency pills immediately after `agent:created`.
2. Cards without manifests show amber "No manifest · Create?" chip. Clicking fires a creation prompt.
3. After `api-gateway` manifest is created listing `class-lib-a` in `dependsOn`, the server auto-prompts `class-lib-a` to add `api-gateway` to its `dependedBy`.
4. Sending a prompt to `class-lib-a` injects the cross-repo context block (visible in server logs).
5. Prompt containing "add field" to `class-lib-a` triggers cascade check; orchestrator replies with `@api-gateway: ...`; `RoutingPlan` approval UI appears.
6. Approving sends targeted prompt to `api-gateway` only; after it completes, cascade check runs again for `webapp`.
7. `DependencyGraph` panel shows correct DAG with color-coded role nodes and any consistency warnings.

---

## Decisions

- Both `dependsOn` and `dependedBy` are declared explicitly in the manifest — explicit beats inferred.
- The server cross-populates `dependedBy` automatically by prompting the relevant agent — all writes go through the agent, not direct disk I/O.
- Cascade checks are filtered by change-signal words to avoid noise with 4+ workers.
- Cascade checks require user approval — no auto-firing of downstream prompts.
- `buildDependencyGraph()` lives in `helpers.js` and is pure/testable.
- Orchestrator is required for cascade checks and manifest creation; if absent, warnings show but no automation runs.
- Unloaded dependency detection triggers on every `agent:created` so adding a new worker mid-session immediately alerts about still-missing neighbors.
- "Load as Worker" requires the user to supply a URL — the system can't invent repo URLs, but the orchestrator may suggest them from context.
