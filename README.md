# ACP Agent Orchestrator

A beautiful web interface for orchestrating GitHub Copilot CLI agents across multiple repositories using the Agent Client Protocol (ACP), now with **orchestrator + worker roles**, **broadcast prompts**, and **automatic synthesis** of cross-repo results.

![ACP Agent Orchestrator](https://github.com/user-attachments/assets/fcc7670a-b082-4ba9-b46e-5567027078f3)

## Highlights

- **Launch orchestrator + worker agents** (one `copilot --acp --stdio` process per repo)
- **Broadcast prompts** to all worker agents with optional synthesis instructions
- **Coalesced results panel** plus auto-forward to the orchestrator card
- **Interactive card UI** with streaming output and permission approvals
- **Modern dark theme** with glassmorphism styling

## Scenario spotlight: Cross-Repo Documentation Audit

The flagship scenario lives in [`SCENARIO.md`](./SCENARIO.md). It demonstrates how a **coordination repo** and an **orchestrator agent** can manage multi-repo work end-to-end:

- **One orchestrator repo** (e.g. `myorg/cross-repo-ops`) stores durable coordination docs like `operations/2026-02-09-doc-audit/`.
- **Four worker repos** (`api-gateway`, `billing-service`, `web-dashboard`, `infra-config`) run the actual audits and README updates.
- **Broadcast workflow**: audit prompts → coalesced worker output → orchestrator synthesis → issue creation → README PRs → merge coordination.
- **Success criteria**: orchestrator receives auto-forwarded synthesis results, writes coordination files, and tracks issue/PR links across repos.

The scenario walkthrough includes prompt templates, a six-phase workflow, and the exact coordination artifacts the orchestrator writes—use it as the canonical demo script.

## Architecture

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express + Socket.IO |
| Frontend | React + Vite + Tailwind CSS |
| ACP Integration | `@agentclientprotocol/sdk` |

Each repo gets its own `copilot --acp --stdio` process with an isolated ACP session. Orchestrator agents are first-class: they sit above worker cards and receive synthesized results automatically after broadcasts.

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

1. **Launch an orchestrator** by entering the coordination repo URL and clicking **Orchestrator**.
2. **Launch worker agents** for each target repo using the **Worker** button.
3. **Broadcast a prompt** to workers; add synthesis instructions to guide the orchestrator’s follow-up.
4. Review **coalesced results** and the orchestrator’s synthesized output.
5. **Send targeted prompts**, approve permissions, and stop agents when finished.

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `COPILOT_CLI_PATH` | Path to copilot CLI binary | `copilot` |

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
