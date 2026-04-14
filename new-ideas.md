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

## Top picks by impact/effort ratio

1. **Diff viewer** — high visibility, can be read-only (call `git diff HEAD` per agent), would make every demo 10x more compelling
2. **Saved playbooks** — moderate effort, huge daily-use value for repeat operators
3. **Partial broadcast retry** — small targeted fix, eliminates a genuinely frustrating failure mode
