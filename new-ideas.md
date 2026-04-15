# New Feature Ideas & Gaps

## What the app does well today

Multi-agent orchestration, dependency-aware cascades, session save/restore, routing plan approval, work item tracking, and broadcast synthesis — the core loop is solid and well-tested.

---

## The biggest gaps

### 1. Observability — you can't see what happened

- **No diff viewer.** Agents write code but there's zero in-UI view of what changed. You have to go to GitHub to see diffs. An inline "changed files" panel per agent would be transformative.
- **No audit/replay log.** You can see the current output stream but once an agent finishes you lose the ordered record of decisions, tool calls, and prompts across the whole session.
- **No injected-context visibility.** The server injects cross-repo dependency context into worker prompts — but operators never see what was injected. A "view injected context" toggle on each card would build trust.

### 2. Safety — no undo, no guardrails

- **No per-agent permission presets.** Every session you manually approve the same file-read/write permissions. Users need a way to say "auto-approve reads, always ask for writes" once and have it persist.
- **No one-click rollback.** If a broadcast causes bad changes across 5 repos, recovery means manually reverting each one. A session-scoped "revert all repos to pre-session HEAD" would be huge.

### 3. Discovery — users have to know everything upfront

- **No org-level repo scanner.** You have to manually know all your repos and type each URL. The app should be able to scan a GitHub org, inspect package.json/pyproject.toml/go.mod dependencies, and suggest which repos to add as workers.
- **No natural language session builder.** "I want to add a deprecation warning to my auth package and propagate it" → app suggests which repos to load and drafts the opening prompt.

### 4. Workflow — prompts are one-shot and ephemeral

- **No saved playbooks/templates.** Common patterns ("documentation audit", "security scan", "dependency upgrade") have to be reconstructed from memory every time. A template library with parameterized prompts would make the tool feel like a product rather than a sandbox.
- **No multi-step workflow sequencer.** The dependency cascade helps, but you can't define a DAG like: step 1 broadcast → wait → step 2 create issues → step 3 create PRs. Right now the user manually does each step in sequence.

### 5. Resilience — fragile to crashes and failures

- **No partial broadcast recovery.** If 2 of 5 workers fail, you have to re-broadcast to all 5. The app should let you re-run only the failed workers.
- **No auto-reconnect/restart.** A crashed agent process shows an error card and requires manual recreation. At minimum, a "Restart" button per card that re-uses the existing cloned path.

### 6. Collaboration — single-operator only

- **No shared live sessions.** A second browser tab sees nothing. Multi-user read-only observation (and optionally shared control) would make this usable in team settings or demos where someone else is driving.
- **No async notifications.** There's no way to kick off a long broadcast and go do something else — no webhook, email, or desktop notification when agents finish or need permission.

### 7. Platform — CLI/API locked

- **No REST API or webhook triggers.** Everything requires the browser. Even a simple POST endpoint to launch a session from CI/CD would open huge use cases (e.g. "on merge to main, run doc audit across all downstream repos").
- **Hardcoded to Copilot CLI.** The ACP protocol is generic but the server only knows how to spawn `copilot --acp --stdio`. Supporting any ACP-compliant process would let this become a general-purpose multi-agent orchestrator.

---

## Team additions (from planning discussion)

Items the team identified that aren't in the gaps above:

- **Agent crash detection.** If the copilot process dies unexpectedly, the card stays stuck as "busy" with no recovery path. Listen to the child process `exit` event, emit `agent:error`, clean up the registry entry. Correctness fix, not a feature — and the "Restart" button is blocked until this exists.
- **Disk cleanup visibility.** No UI shows how much tmpdir space cloned repos are consuming, and there's no emergency escape hatch. A small server endpoint + one line in the UI. Same code path as the diff viewer (touches `repoPath`).
- **Card minimization.** Collapse a card to just its header + status badge. When you have 6 workers running the board is overwhelming. ~30 minutes of work, transforms layout immediately.
- **Broadcast compose history.** Arrow-up to recall the previous broadcast prompt. One `useRef` + array. Trivially natural to anyone who uses a CLI.
- **Output filtering per card.** Toggle pills on the output stream: All | Text | Tool calls | Plans. The data is already typed in `sessionUpdate` — just not surfaced.
- **Mock ACP worker for tests.** A configurable stub `copilot --acp --stdio` process that can be set to succeed or fail on demand. Prerequisite for reliable e2e tests of partial broadcast recovery, disconnection handling, and restart behavior. Build once as shared infrastructure.

### Deferred / cut

Items reviewed and deprioritized:

- **One-click rollback** — sounds safe, isn't. The cloned tmpdir is not the user's real repo. A safe rollback needs to push through the copilot process or execute `git push --force`. Not shipping silently. Needs a full trust-and-safety design pass before this is on the table.
- **REST API / webhook triggers** — high value but requires an auth layer first. An unauthenticated POST endpoint that clones repos and spawns processes is an RCE surface. Localhost-only scoping would be a safe v1, but it's a week of real work. Defer until auth is designed.
- **Shared live sessions** — significant architectural rework. Every `socketId` ownership assumption (including the disconnect cleanup for permission resolvers, which is a documented decision) breaks under multi-socket agent ownership. Needs the ownership model re-specced in decisions before any implementation starts.
- **Natural language session builder** — clever demo, no daily leverage. Deferred.
- **Multi-step DAG sequencer** — a product, not a feature. Hardest thing on the list to test reliably. Come back when two real use cases have a defined shape.

---

## Priority order (team consensus, April 2026)

1. **Agent crash detection** — correctness fix; unblocks the restart button
2. **Diff viewer** — trust-builder and demo-closer; same sprint as disk cleanup
3. **Injected context visibility toggle** — ~40 lines total; immediate operator trust payoff
4. **Disk cleanup visibility** — same `repoPath` code path as diff viewer; do together
5. **Card minimize + broadcast compose history** — quick wins, layout and UX quality
6. **Partial broadcast retry** — after mock ACP worker infrastructure is in place
7. **Missing e2e coverage** — dependency cascade (no Playwright spec exists) + session restore failure client-side path
