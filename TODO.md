# ACP Agent Orchestrator — Progress & Next Steps

## Completed

### Build Tooling & DX
- [x] Root `package.json` with `install:all`, `dev`, `build`, `start`, `prod` scripts
- [x] `concurrently` for parallel server + client dev
- [x] `copilot-instructions.md` for Copilot context
- [x] `scripts/teardown.js` — kills processes on ports 3001/5173

### Runtime Fixes
- [x] `shell: true` on spawn for Windows `copilot.cmd` resolution
- [x] Consecutive text chunk merging — stops one-word-per-line streaming

### Visual Polish
- [x] Auto-focus repo input on mount
- [x] Higher-contrast text throughout (gray-50/200 vs gray-300/500)
- [x] Spawning wait state with 3-step progress stepper (clone → start → verify)
- [x] Verification prompt on agent startup (lightweight "describe this repo")
- [x] Output scroll cap (200 entries) with truncation notice
- [x] Radial background glows for depth
- [x] Improved permission banner styling

### Testing (106 tests — all passing)
- [x] Vitest for both server and client
- [x] Extracted `helpers.js` with `isValidGitUrl()`, `repoNameFromUrl()`, `extractWorkItems()`
- [x] 31 server tests (URL validation, repo name extraction, path-traversal rejection, work-item extraction)
- [x] 75 client tests across 8 components:
  - Header (3), RepoInput (7), AgentCard (11), BroadcastInput (15),
    BroadcastResults (12), OrchestratorCard (11), WorkItemTracker (8),
    BroadcastHistory (8)

### Broadcast & Coalescing
- [x] `agent:prompt_all` handler — fans out prompts to all ready workers
- [x] Broadcast wave tracking — accumulates text chunks per agent
- [x] `BroadcastInput` component with ready/total count, Ctrl+Enter shortcut
- [x] `BroadcastResults` component — summary table + accordion, copy as Markdown

### Orchestrator Agent
- [x] Agent `role` field (`"orchestrator"` | `"worker"`)
- [x] Single-orchestrator enforcement on server
- [x] Broadcast excludes orchestrator — only targets workers
- [x] Auto-forward coalesced results to orchestrator with synthesis prompt
- [x] `OrchestratorCard` component — full-width, teal gradient, "coordinator" badge
- [x] RepoInput with two buttons (Worker / Orchestrator)
- [x] App.jsx separates orchestrator from worker grid

### Issue-Based Traceability
- [x] SCENARIO.md updated — Phase 4 split into 4a (create issues) + 4b (do work with PRs referencing issues)
- [x] `synthesisInstructions` field on `agent:prompt_all` — lets users guide orchestrator behavior
- [x] Server appends synthesis instructions to auto-forwarded orchestrator prompt
- [x] BroadcastInput — collapsible "Synthesis instructions for orchestrator" panel
- [x] Success criteria expanded to 14 items covering full issue→PR traceability

### Work Item Tracking & Synchronization
- [x] `extractWorkItems()` helper — parses GitHub/GitLab/Bitbucket issue & PR URLs from agent text
- [x] Server-side `workItems` registry — tracks detected issues and PRs, deduplicates, emits `workitems:updated`
- [x] `WorkItemTracker` component — live dashboard grouping all detected issues/PRs by repo
- [x] Broadcast progress events — `agent:broadcast_progress` shows X/Y agents completed during waves
- [x] Progress bar in `BroadcastInput` — real-time visual indicator during active broadcasts
- [x] Broadcast history — server keeps last 10 waves, `BroadcastHistory` component shows past waves
- [x] Client requests existing state on reconnect (`workitems:list`, `broadcast:list_history`)

---

## Next Steps

### Near-term (high value)

1. **End-to-end live test** — Run the full SCENARIO.md doc-audit workflow
   against real repos to validate the spawn → broadcast → coalesce →
   synthesize → issue → PR loop. Surface any rough edges.

2. **Error recovery & resilience** — Handle edge cases:
   - Agent process crash mid-broadcast (partial wave completion)
   - Network disconnection and reconnection
   - Stale agent cleanup on server restart

3. **Persistent agent state** — Currently agents live only in memory.
   Consider persisting agent registry to disk or SQLite so the server
   can resume after a restart.

### Medium-term

4. **Authentication & multi-user** — Currently single-user. Add
   socket authentication or session tokens so multiple users can
   share a server without cross-talk.

5. **Agent log export** — Let users download the full output of an
   agent session as a markdown or JSON file.

6. **Orchestrator templates** — Pre-built synthesis instruction
   templates for common workflows (doc audit, dependency update,
   security scan, etc.) in a dropdown.

### Longer-term

7. **Agent-to-agent communication** — Let the orchestrator directly
   prompt individual workers (not just broadcast to all). The
   orchestrator could ask a specific worker for clarification.

8. **Webhook integration** — Receive GitHub webhook events (PR
   merged, issue closed) and update the orchestrator's coordination
   docs automatically.

9. **Plugin system** — Let users add custom post-processing steps
   after broadcast waves (e.g. run linters, trigger CI, post to Slack).

10. **Dashboard view** — A summary page showing all active operations,
    their status, and links to coordination docs across the org.

---

## Copilot Agents & Hooks — Exploration

Currently we broadcast plain-text prompts to each worker terminal.
A natural next step is to let the orchestrator (and workers) **invoke
Copilot agents** (`@agent-name` extensions with domain-specific skills)
and to wire **hooks** (pre/post processing around agent operations) into
the broadcast lifecycle. Both unlock capabilities that raw text prompts
alone can't achieve.

### Why agents matter here

Copilot Extensions expose specialized agents (e.g. `@docker`, `@azure`,
`@github`, custom org-private agents) that a prompt can delegate to for
domain expertise. If a broadcast prompt or orchestrator synthesis could
reference these agents, each worker gains access to tools that go beyond
base Copilot — container image analysis, cloud resource provisioning, CI
pipeline authoring, etc. — without the user hand-writing tool-specific
instructions every time.

### Use cases unlocked by agent invocation

1. **Specialized broadcast waves** — A broadcast that invokes `@docker`
   across all workers to audit Dockerfiles, or `@github` to create
   issues with labels and milestones. Workers get agent-specific
   capabilities instead of relying solely on the base model.

2. **Orchestrator-driven agent chaining** — After workers report back,
   the orchestrator invokes a security-focused agent (e.g. `@codeql` or
   a custom `@security-review`) on the coalesced diffs to catch
   cross-repo vulnerabilities before PRs are merged.

3. **MCP tool servers per agent** — Each worker spawned with access to
   custom MCP tool servers (database introspection, internal API docs,
   Terraform state). The orchestrator's synthesis prompt can reference
   results from these tools when reasoning about cross-repo impact.

4. **Agent-as-validator** — Post-broadcast, invoke a contract-validation
   agent that compares API schemas across worker repos to detect
   breaking changes before any PR is opened.

5. **Org-private knowledge agents** — Companies can build internal
   agents that know their architecture (service mesh topology, team
   ownership, deployment tiers). The orchestrator invokes these when
   building rollout plans so merge ordering reflects real dependency
   chains, not guesses.

### Use cases unlocked by hooks

Hooks are event-driven callbacks wired into the broadcast lifecycle.
They enable automation without the user manually prompting each step.

1. **Pre-broadcast hooks** — Before fanning out prompts, validate
   preconditions (e.g. all workers have clean git status, required
   branches exist, no active PRs conflict). Abort early with a clear
   message if a check fails.

2. **Post-wave hooks** — After a broadcast wave completes, auto-run
   quality gates on each worker: linters, type checks, test suites.
   Feed pass/fail results back to the orchestrator so the synthesis
   includes CI-like status without waiting for actual CI.

3. **Result transformation hooks** — Transform raw worker text before
   the orchestrator sees it: strip boilerplate, extract structured
   JSON, normalize URL formats. Keeps synthesis prompts clean and
   reduces orchestrator token usage.

4. **Auto-escalation hooks** — If a worker errors or times out during
   a broadcast, automatically retry once, then surface the failure
   prominently to the orchestrator with context so it can adapt its
   synthesis.

5. **Notification hooks** — After key lifecycle events (broadcast
   complete, all PRs created, orchestrator synthesis written), fire
   notifications to Slack, Teams, or email. Keeps stakeholders in the
   loop without polling the UI.

6. **Permission policy hooks** — Codify permission decisions as rules
   (auto-approve reads, require approval for writes, always deny
   network access). Reduces prompt fatigue during large broadcast
   waves where 10+ workers each request multiple permissions.

### Suggested implementation plan

- [ ] **Define hook lifecycle events** — Map the broadcast lifecycle
  into named events: `pre-broadcast`, `post-wave`, `pre-synthesis`,
  `post-synthesis`, `agent-error`, `broadcast-complete`. Document the
  payload shape for each.

- [ ] **Hook registration API** — Let users register hooks via config
  file or UI. A hook is a named event + handler (initially a server-side
  JS function; later, a webhook URL or plugin script).

- [ ] **Agent reference syntax in prompts** — Determine how agent
  invocation works within ACP prompts. If `@agent-name` is natively
  supported by Copilot CLI, document and surface it. If not, explore
  whether the orchestrator can proxy prompts to registered Copilot
  Extensions via their API.

- [ ] **Built-in hooks: quality gates** — Ship a default post-wave
  hook that runs `npm test` / `pytest` / `go test` (auto-detected from
  repo) in each worker's cloned directory and appends results to the
  coalesced output.

- [ ] **Built-in hooks: permission policies** — Ship a default
  permission policy hook with common presets (permissive, cautious,
  read-only) selectable from the UI.

- [ ] **Orchestrator agent invocation** — Let the orchestrator's
  synthesis prompt reference a configurable agent (e.g. `@security`)
  that runs after coalescing, before the orchestrator writes its
  coordination docs.

- [ ] **UI surface** — Add a hooks/agents configuration panel (likely
  in a settings drawer) where users can enable/disable built-in hooks,
  set permission policies, and configure agent references for
  broadcast templates.
