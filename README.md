# ACP Agent Orchestrator

A beautiful web interface for orchestrating GitHub Copilot CLI agents across multiple repositories using the Agent Client Protocol (ACP), now with **orchestrator + worker roles**, **broadcast prompts**, and **automatic synthesis** of cross-repo results.

## Highlights

- **Launch orchestrator + worker agents** with optional per-repo model selection (one `copilot --acp --stdio` process per repo)
- **Broadcast prompts** to all worker agents with optional orchestrator focus guidance
- **Broadcast follow-up cascades** that can raise the same downstream routing-plan approval flow used by single-agent prompts
- **Coalesced results panel** plus auto-forward to the orchestrator card
- **Dependency-aware prompt context and cascades** driven by manifest relationships in either direction (`dependsOn` or `dependedBy`)
- **Issue/PR tracking loop** (worker issues → orchestrator issue map → coordinated PRs)
- **Interactive card UI** with streaming output and permission approvals
- **Session persistence & resume** — save named sessions to disk, reload them later, and optionally re-spawn agents in one click
- **Modern dark theme** with glassmorphism styling

## Screenshots

![Multiple agents working simultaneously](https://github.com/user-attachments/assets/178093ff-603a-4827-b715-a3db978cf1cb)
![Coalesced broadcast results panel](https://github.com/user-attachments/assets/7b2a38bc-eb95-4ad3-be5d-86f8b9e07c2a)

## Scenario spotlight

The scenario docs now live as a small set of focused walkthroughs under
[`SCENARIO.md`](./SCENARIO.md), which acts as the landing page and scenario
index.

Recommended reading order:

1. [`01-first-broadcast-and-synthesis`](./docs/scenarios/01-first-broadcast-and-synthesis.md)
2. [`02-documentation-audit-with-issues-and-prs`](./docs/scenarios/02-documentation-audit-with-issues-and-prs.md)
3. [`03-dependency-aware-routing-and-cascades`](./docs/scenarios/03-dependency-aware-routing-and-cascades.md)
4. [`04-loading-missing-dependency-workers`](./docs/scenarios/04-loading-missing-dependency-workers.md)
5. [`05-saving-restoring-and-respawning-sessions`](./docs/scenarios/05-saving-restoring-and-respawning-sessions.md)

The documentation audit remains the flagship end-to-end demo, but the new
scenario set also covers dependency-aware routing, graph completion with
`Load as Worker`, and the session restore vs. re-spawn workflow.

## Architecture

| Layer           | Technology                    |
| --------------- | ----------------------------- |
| Backend         | Node.js + Express + Socket.IO |
| Frontend        | React + Vite + Tailwind CSS   |
| ACP Integration | `@agentclientprotocol/sdk`    |

Each repo gets its own `copilot --acp --stdio` process with an isolated ACP session. Orchestrator agents are first-class: they sit above worker cards and receive synthesized results automatically after broadcasts.

When dependency manifests are present, the server also injects cross-repo
context into worker prompts and can propose downstream follow-up routing. Those
relationships are graph-derived, so reverse-only `dependedBy` declarations are
honored the same way as forward `dependsOn` links.

## Prerequisites

- **Node.js 18+**
- **GitHub Copilot CLI** installed and authenticated (`copilot` command available on PATH)
- **Git**

## Getting Started

```bash
cd webapp

# Install dependencies
npm run install:all

# Start server (port 3001) + Vite dev server (5173)
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Usage

1. **Launch an orchestrator** by entering the coordination repo URL, optionally choosing a Copilot model, and clicking **Launch Orchestrator**.
2. **Launch worker agents** for each target repo using **Add Worker**; each worker can use the default model or an explicitly selected model.
3. **Broadcast a prompt** to workers; optionally add **Orchestrator Focus** to shape the final synthesis.
4. **Track work with issues** by broadcasting an issue-creation prompt; the orchestrator captures the issue map.
5. Review **coalesced results** and the orchestrator’s synthesized output.
6. **Send targeted prompts**, approve permissions, and stop agents when finished.

## Configuration

### Environment Variables

| Variable           | Description                              | Default              |
| ------------------ | ---------------------------------------- | -------------------- |
| `PORT`             | Server port                              | `3001`               |
| `COPILOT_CLI_PATH` | Path to copilot CLI binary               | `copilot`            |
| `REPO_BASE_DIR`    | Directory where repos are shallow-cloned | `<tmpdir>/acp-repos` |
| `ACP_SESSION_DIR`  | Directory where session files are saved  | `~/.acp-orchestrator/sessions` |

### UI Settings (in the header bar)

| Setting            | Description                                                                                                                                                                                                                                                              | Default                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| **Clone to**       | Local directory where repos are cloned. Takes precedence over the `REPO_BASE_DIR` environment variable — effectively replacing it for the session.                                                                                                                       | `C:\users\rmathis\source` |
| **Reuse existing** | When checked, uses the repo name as the folder (no random suffix) and skips cloning if the folder already exists. The agent runs against your local working copy — uncommitted changes may be read or modified. Reused folders are **not** deleted when the agent stops. | unchecked                 |
| **Per-launch model** | Each orchestrator or worker launch form includes an optional model field. Leave it blank to use the Copilot CLI default, or provide a specific model ID to pin that agent to a model. | blank / CLI default       |

---

## Session Persistence & Resume

Long-running multi-repo operations often span multiple sittings. The session system lets you save all meaningful state to disk, reload it later, and pick up exactly where you left off.

### What gets saved

Each session snapshot is a JSON file stored in `~/.acp-orchestrator/sessions/`. A snapshot captures:

- **Agent roster** — repo URLs, names, local paths, roles (orchestrator vs worker), selected models, dependency manifests
- **Work items** — every issue and PR URL detected from agent output
- **Broadcast history** — the last 10 broadcast prompts and their per-worker results
- **Settings** — the "Clone to" directory and "Reuse existing" flag

What is _not_ saved: live copilot processes, ACP connections, in-flight prompts, or streaming output. Sessions capture _metadata and history_, not process state.

### How to use it

#### Saving a session

The session autosaves automatically whenever:
- An agent is created or stopped
- A broadcast wave completes
- A new work item (issue or PR) is detected

The current session name appears in the **Sessions** button in the header bar. It defaults to `default`, then is automatically renamed to `<orchestrator-repo>-<date>` once an orchestrator agent is running (e.g. `cross-repo-ops-2026-03-17`).

To save with a custom name, click the **Sessions** button → **Save as…** → type a name → press **Enter**.

#### Loading a session

Click the **Sessions** button to open the session panel. Each saved session shows:
- Session name and last-saved time ("2m ago")
- Pills for how many agents, work items, and broadcasts it contains

Each session has two load options:

| Button | What it does |
|--------|-------------|
| **▶ Restore** (default) | Restores agent cards, work items, and broadcast history as display state. Agents appear as **Stopped** — no copilot processes are launched. |
| **⟳ Re-spawn** | Does everything Restore does, then also re-launches a copilot process for each saved agent (using **Reuse existing** = on, so no re-cloning). |

> **Recommendation:** Use **Restore** when you just want to review what happened or copy output. Use **Re-spawn** when you're continuing work and need live agents again.

#### Restarting a single stopped agent

After a Restore load, individual agent cards show a **⟳ restart** button instead of the stop button. Clicking it re-spawns just that agent without affecting others.

#### Managing saved sessions

From the Sessions panel you can:
- **Save as…** — save the current state under a new name
- **▶ Restore** or **⟳ Re-spawn** any saved session
- **🗑 Delete** — click once to arm (button pulses red), click again within 2 seconds to confirm

Sessions are kept automatically pruned to the 25 most recent.

### How it works (technical)

Sessions are stored as plain JSON in `~/.acp-orchestrator/sessions/<name>.json`. The server exposes four Socket.IO events:

| Event | Direction | Description |
|---|---|---|
| `session:list` | C→S | Request the session catalog |
| `session:save { name }` | C→S | Save current state under a name |
| `session:load { name, mode }` | C→S | Restore a session (`mode: "ui"` or `"respawn"`) |
| `session:delete { name }` | C→S | Remove a saved session |

On `session:load`, the server clears its in-memory maps, reads the snapshot, repopulates `agents`, `workItems`, and `broadcastHistory`, then re-emits the normal hydration events (`agent:created`, `workitems:updated`, `broadcast:history`, `graph:updated`) — so the client code path for loading a session is identical to the normal connection-time hydration flow. Before emitting dependency graph state, the server now re-reads any saved repos' manifests from disk so missing-manifest and unloaded-dependency indicators reflect the current workspace, not just the serialized snapshot. Agent hydration includes manifest-driven fields used by dependency pills and missing-manifest chips, and later manifest refreshes are pushed through `agent:snapshot`.

When workers reference repos that are not currently loaded, the UI now surfaces those unloaded dependency neighbors in two places: each worker card offers a suggested pre-filled repo URL for `Load as Worker`, and the orchestrator card shows a deduplicated summary banner with one-click load actions so the coordinator can pull missing repos into the session quickly.

---

## Testing

```bash
cd webapp
npm test
```

## How It Works

This project is built on the [Agent Client Protocol (ACP)](https://agentclientprotocol.com), a standard for communicating with AI coding agents over stdio. See the [GitHub Copilot ACP docs](https://docs.github.com/en/copilot/reference/acp-server) for more details.

- Spawns one `copilot --acp --stdio` process per repository
- Creates isolated sessions scoped to each repo's working directory
- Streams agent responses in real-time to the browser via Socket.IO
- Coalesces broadcast results and forwards them to the orchestrator agent
- Saves named session snapshots to disk; restores them on reload via the Sessions panel in the header
