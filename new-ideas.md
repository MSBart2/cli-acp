# New Feature Ideas & Backlog

Multi-agent orchestration, dependency-aware cascades, session save/restore, routing plan approval, work item tracking, and broadcast synthesis — the core loop is solid and well-tested.

---

## Prioritized backlog

Sorted by ease and risk. Lower tiers first. Within each tier, ordered by daily-use value.

### Tier 3 — Quick wins (hours, self-contained)

1. **Broadcast compose history** — arrow-up to recall the previous broadcast prompt eliminates a small but constant friction point for anyone doing iterative broadcasts. One `useRef` + array; trivially natural to anyone who uses a CLI.

2. **Card minimization** — collapse a card to just its header + status badge so 6+ workers don't overwhelm the board. ~30 minutes of work; transforms the layout immediately.

3. **Output filtering per card** — toggle pills on the output stream (All | Text | Tool calls | Plans) to reduce noise during long runs. The data is already typed in `sessionUpdate` — just not surfaced.

4. **Disk cleanup visibility** — a small server endpoint that reports tmpdir space per agent plus a one-line UI indicator gives operators an emergency escape hatch. Touches the same `repoPath` code path as any diff viewer.

5. **Injected-context visibility** — a "view injected context" toggle on each agent card surfaces what the server injected into worker prompts, building operator trust without changing any server behavior. The data is already in the server; it just needs to be forwarded to the client.

### Tier 4 — Significant (week+, needs design or architecture work first)

1. **Diff viewer** — an inline "changed files" panel per agent is the single highest-leverage observability improvement; right now you have to leave the app to see what changed. Requires a git diff endpoint tied to each agent's `repoPath`.

2. **Audit/replay log** — an ordered record of decisions, tool calls, and prompts across a whole session makes post-mortems and demos possible; the live stream alone is lossy. Needs a structured event store, not just the live stream.

3. **Per-agent permission presets** — persisting "auto-approve reads, always ask for writes" across sessions eliminates the most repetitive manual step in every run. Needs a small preferences store and UI for managing presets.

4. **Partial broadcast recovery** — if 2 of 5 workers fail, re-broadcasting to all 5 wastes time and risks side effects; re-running only failed workers is the correct primitive. Requires tracking per-worker broadcast state.

5. **Mock ACP worker for tests** — a configurable stub `copilot --acp --stdio` process that can be set to succeed or fail on demand is a prerequisite for reliable e2e tests of partial recovery, disconnection, and restart behavior. Build once as shared test infrastructure.

6. **Auto-reconnect / restart button** — a "Restart" button per card that re-uses the existing cloned path reduces the friction of a crashed agent from a full re-setup to one click. Small server change; clear UX win.

7. **Async notifications** — kicking off a long broadcast and walking away is blocked by the absence of any signal when agents finish or need permission. Needs a notification channel design (webhook, desktop, or email) before any code.

8. **Org-level repo scanner** — scanning a GitHub org and inspecting dependency manifests to suggest which repos to load removes the biggest onboarding friction for new users. Real scope; no unblocking dependency; can start any time but won't be quick.

9. **Generic ACP process support** — the server hardcodes `copilot --acp --stdio`; supporting any ACP-compliant process (a ~15-line change in `spawnAndConnect`) turns this into a general-purpose multi-agent orchestrator. Zero user-visible impact until a second ACP process exists to run against.

---

## Deferred / cut

Reviewed and explicitly deprioritized — rationale preserved so the decision doesn't get re-litigated.

- **One-click rollback** — sounds safe, isn't. The cloned tmpdir is not the user's real repo. A safe rollback must push through the copilot process or execute `git push --force`. Needs a full trust-and-safety design pass before it's on the table.

- **REST API / webhook triggers** — high value but requires an auth layer first. An unauthenticated POST endpoint that clones repos and spawns processes is an RCE surface. Localhost-only scoping would be a safe v1, but it's a week of real work. Defer until auth is designed.

- **Shared live sessions** — significant architectural rework. Every `socketId` ownership assumption (including the disconnect cleanup for permission resolvers, which is a documented decision) breaks under multi-socket agent ownership. Needs the ownership model re-specced before any implementation starts.

- **Natural language session builder** — clever demo, no daily leverage. Deferred.

- **Multi-step DAG sequencer** — a product, not a feature. Hardest thing on this list to test reliably. Come back when two real use cases have a defined shape.
