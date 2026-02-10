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

### Testing (81 tests — all passing)
- [x] Vitest for both server and client
- [x] Extracted `helpers.js` with `isValidGitUrl()` and `repoNameFromUrl()`
- [x] 22 server tests (URL validation, repo name extraction, path-traversal rejection)
- [x] 59 client tests across 6 components:
  - Header (3), RepoInput (7), AgentCard (11), BroadcastInput (15),
    BroadcastResults (12), OrchestratorCard (11)

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

4. **Multi-wave history** — The client only shows the most recent
   broadcast results. Consider keeping a history of past waves so the
   user can scroll back through previous broadcasts.

### Medium-term

5. **Authentication & multi-user** — Currently single-user. Add
   socket authentication or session tokens so multiple users can
   share a server without cross-talk.

6. **Agent log export** — Let users download the full output of an
   agent session as a markdown or JSON file.

7. **Orchestrator templates** — Pre-built synthesis instruction
   templates for common workflows (doc audit, dependency update,
   security scan, etc.) in a dropdown.

8. **Progress indicators for broadcasts** — Show a progress bar
   during broadcast waves (X of Y agents completed).

### Longer-term

9. **Agent-to-agent communication** — Let the orchestrator directly
   prompt individual workers (not just broadcast to all). The
   orchestrator could ask a specific worker for clarification.

10. **Webhook integration** — Receive GitHub webhook events (PR
    merged, issue closed) and update the orchestrator's coordination
    docs automatically.

11. **Plugin system** — Let users add custom post-processing steps
    after broadcast waves (e.g. run linters, trigger CI, post to Slack).

12. **Dashboard view** — A summary page showing all active operations,
    their status, and links to coordination docs across the org.
