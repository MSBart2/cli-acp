# Scenarios

Use this page as the entry point for the ACP Agent Orchestrator's user-facing
scenario docs.

The old `SCENARIO.md` tried to do everything in one place. It worked as a
flagship demo, but it made the product harder to learn because setup, core
usage, dependency-aware flows, and session recovery were all mixed together.

The scenario set below breaks that material into focused walkthroughs. Each
file teaches one job to be done.

## Start here

If you are new to the tool, read these in order:

1. [`01-first-broadcast-and-synthesis`](docs/scenarios/01-first-broadcast-and-synthesis.md)
2. [`02-documentation-audit-with-issues-and-prs`](docs/scenarios/02-documentation-audit-with-issues-and-prs.md)
3. [`03-dependency-aware-routing-and-cascades`](docs/scenarios/03-dependency-aware-routing-and-cascades.md)
4. [`04-loading-missing-dependency-workers`](docs/scenarios/04-loading-missing-dependency-workers.md)
5. [`05-saving-restoring-and-respawning-sessions`](docs/scenarios/05-saving-restoring-and-respawning-sessions.md)

## Scenario chooser

| If you want to... | Read this |
| --- | --- |
| Learn the basic operator workflow | [`01-first-broadcast-and-synthesis`](docs/scenarios/01-first-broadcast-and-synthesis.md) |
| Run a full cross-repo operation with issues and PRs | [`02-documentation-audit-with-issues-and-prs`](docs/scenarios/02-documentation-audit-with-issues-and-prs.md) |
| Roll a change downstream through dependent repos | [`03-dependency-aware-routing-and-cascades`](docs/scenarios/03-dependency-aware-routing-and-cascades.md) |
| Pull missing repos into the session when the graph is incomplete | [`04-loading-missing-dependency-workers`](docs/scenarios/04-loading-missing-dependency-workers.md) |
| Pause work and resume it later safely | [`05-saving-restoring-and-respawning-sessions`](docs/scenarios/05-saving-restoring-and-respawning-sessions.md) |

## Scenario summaries

### 1. First broadcast and synthesis

The shortest happy path. Launch one orchestrator and a few workers, send a
broadcast prompt, review the `Broadcast Results` panel, and watch the
orchestrator turn the raw worker output into a combined answer.

### 2. Documentation audit with issues and PRs

The flagship end-to-end scenario. Audit several repositories, create tracking
issues, generate README PRs, and let the orchestrator keep the issue/PR map in
one coordination repo.

### 3. Dependency-aware routing and cascades

The rollout scenario for contract or shared-library changes. It shows how the
tool uses graph-derived relationships from either `dependsOn` or `dependedBy`,
proposes a routing plan, and lets you approve downstream prompts before they
fan out.

### 4. Loading missing dependency workers

The graph-completion scenario. When a worker or the orchestrator detects repos
that are referenced but not loaded, this walkthrough shows how to use
`Load as Worker`, repair missing manifest context, and keep the dependency view
trustworthy.

### 5. Saving, restoring, and re-spawning sessions

The long-running operation scenario. Save a session, restore it in UI-only
mode, re-spawn agents when you want live copilots again, and restart a single
stopped agent without rebuilding the whole workspace.

## Suggested combinations

- **Quick demo:** 1
- **Full documentation campaign:** 1 -> 2
- **Safe dependency rollout:** 1 -> 3 -> 4
- **Long-running multi-repo operation:** 1 or 2 -> 5

## How these docs are written

Each scenario focuses on operator decisions rather than raw feature inventory:

- when to broadcast vs. target a single worker
- when to add Orchestrator Focus for the orchestrator
- when to load more repos before proceeding
- when to restore UI state vs. re-spawn live agents

If you are updating or extending the scenario docs, keep that bias: teach users
how to run the tool effectively, not just what controls exist in the UI.
