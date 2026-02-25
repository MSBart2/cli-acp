# ACP Agent Orchestrator

A beautiful web interface for orchestrating GitHub Copilot CLI agents across multiple repositories using the Agent Client Protocol (ACP).

![ACP Agent Orchestrator](https://github.com/user-attachments/assets/fcc7670a-b082-4ba9-b46e-5567027078f3)

## Features

- **Launch Copilot CLI agents** for any GitHub repository
- **Real-time streaming output** via WebSocket (Socket.IO)
- **Interactive card-based UI** for each agent
- **Send prompts** to individual agents
- **Permission request handling** with interactive approval
- **Agent lifecycle management** (start/stop)
- **Modern dark theme** with glassmorphism design

## Architecture

| Layer           | Technology                    |
| --------------- | ----------------------------- |
| Backend         | Node.js + Express + Socket.IO |
| Frontend        | React + Vite + Tailwind CSS   |
| ACP Integration | `@agentclientprotocol/sdk`    |

Each repo gets its own `copilot --acp --stdio` process with an isolated ACP session.

## Prerequisites

- **Node.js 18+**
- **GitHub Copilot CLI** installed and authenticated (`copilot` command available on PATH)
- **Git**

## Getting Started

```bash
# Install dependencies
cd webapp/server && npm install
cd ../client && npm install

# Start the backend server (port 3001)
cd ../server && npm run dev

# In another terminal, start the frontend dev server (port 5173)
cd webapp/client && npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Usage

1. **Enter a GitHub repo URL** and click **"Launch Agent"**.
2. The server clones the repo and spawns a Copilot CLI ACP session.
3. A card appears showing the agent status and output.
4. **Type prompts** in the card's input to interact with the agent.
5. **Handle permission requests** when the agent needs tool approval.
6. **Stop agents** when done.

## Configuration

### Environment Variables

| Variable           | Description                              | Default              |
| ------------------ | ---------------------------------------- | -------------------- |
| `PORT`             | Server port                              | `3001`               |
| `COPILOT_CLI_PATH` | Path to copilot CLI binary               | `copilot`            |
| `REPO_BASE_DIR`    | Directory where repos are shallow-cloned | `<tmpdir>/acp-repos` |

### UI Settings (in the header bar)

| Setting            | Description                                                                                                                                                                                                                                                              | Default                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| **Clone to**       | Local directory where repos are cloned. Takes precedence over the `REPO_BASE_DIR` environment variable — effectively replacing it for the session.                                                                                                                       | `C:\users\rmathis\source` |
| **Reuse existing** | When checked, uses the repo name as the folder (no random suffix) and skips cloning if the folder already exists. The agent runs against your local working copy — uncommitted changes may be read or modified. Reused folders are **not** deleted when the agent stops. | unchecked                 |

## How It Works

This project is built on the [Agent Client Protocol (ACP)](https://agentclientprotocol.com), a standard for communicating with AI coding agents over stdio. See the [GitHub Copilot ACP docs](https://docs.github.com/en/copilot/reference/acp-server) for more details.

- Spawns one `copilot --acp --stdio` process per repository
- Creates isolated sessions scoped to each repo's working directory
- Streams agent responses in real-time to the browser via Socket.IO

---

Pick an Orchestrator:

https://github.com/MSBart2/CopilotTraining

Then some remote repos to talk to (Aninmalia is GIANT, so it's going to take a long time to clone/ready)

https://github.com/MSBart2/FanHub

https://github.com/rbmathis/Animalia

https://github.com/rbmathis/flowlens
