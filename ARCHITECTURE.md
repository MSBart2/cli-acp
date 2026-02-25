# Architecture

This document describes the internal structure of the ACP Agent Orchestrator.
Use it to navigate the codebase, understand data flow, and make informed
implementation decisions.

---

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser (React)                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │OrchestratorIn│  │OrchestratorCa│  │  AgentCard   │  │ BroadcastInput   │ │
│  │    put.jsx   │  │    rd.jsx    │  │    .jsx      │  │ BroadcastResults │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘ │
│                          │                  │                  │            │
│                          └──────────────────┼──────────────────┘            │
│                                             │                               │
│                                    Socket.IO Client                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              │ WebSocket (Socket.IO)
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Node.js Server (Express)                          │
│                                                                             │
│   ┌─────────────────┐    ┌─────────────────────────────────────────────┐   │
│   │   Socket.IO     │    │              Agent Registry                 │   │
│   │   Event Router  │◄──►│   Map<agentId, {process, connection, ...}>  │   │
│   └─────────────────┘    └─────────────────────────────────────────────┘   │
│            │                              │                                 │
│            │              ┌───────────────┼───────────────┐                 │
│            ▼              ▼               ▼               ▼                 │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │
│   │ copilot CLI  │ │ copilot CLI  │ │ copilot CLI  │ │ copilot CLI  │      │
│   │ (orchestrator)│ │  (worker 1)  │ │  (worker 2)  │ │  (worker N)  │      │
│   └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘      │
│         │                 │                 │                 │            │
│         └─────────────────┴─────────────────┴─────────────────┘            │
│                           ACP over stdio (JSON-RPC)                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
cli-acp/
├── .github/
│   └── copilot-instructions.md   # Copilot context for this repo
├── ARCHITECTURE.md               # ← You are here
├── SCENARIO.md                   # Demo script: cross-repo doc audit
├── README.md                     # User-facing overview
└── webapp/
    ├── package.json              # Root scripts: install:all, dev, build, prod
    ├── scripts/
    │   └── teardown.js           # Cleanup script for orphaned processes/repos
    ├── server/
    │   ├── index.js              # Express + Socket.IO + ACP orchestration
    │   ├── helpers.js            # URL validation, repo naming, work-item extraction
    │   ├── package.json
    │   └── __tests__/
    │       └── helpers.test.js   # Vitest unit tests for helpers
    └── client/
        ├── index.html
        ├── vite.config.js        # Dev server + proxy to backend
        ├── tailwind.config.js
        ├── package.json
        └── src/
            ├── App.jsx           # Main app: socket wiring, state, layout
            ├── main.jsx          # React entry point
            ├── index.css         # Tailwind imports + custom animations
            ├── components/
            │   ├── Header.jsx           # Connection indicator, settings
            │   ├── OrchestratorInput.jsx# Teal-themed launcher (orchestrator only)
            │   ├── OrchestratorCard.jsx # Full-width orchestrator agent card
            │   ├── RepoInput.jsx        # Purple-themed worker launcher
            │   ├── AgentCard.jsx        # Worker agent card (output, prompt, perms)
            │   ├── BroadcastInput.jsx   # Multi-agent prompt + @mentions + synthesis
            │   ├── BroadcastResults.jsx # Coalesced per-worker outputs
            │   ├── BroadcastHistory.jsx # Past broadcast prompts (collapsible)
            │   └── WorkItemTracker.jsx  # Detected issues/PRs from agent output
            └── __tests__/
                └── *.test.jsx           # Vitest + Testing Library tests
```

---

## Core Concepts

### Agent Registry

The server maintains a `Map<agentId, AgentEntry>` where each entry contains:

| Field                | Type                       | Description                                    |
| -------------------- | -------------------------- | ---------------------------------------------- |
| `process`            | `ChildProcess`             | The spawned `copilot --acp --stdio` process    |
| `connection`         | `ClientSideConnection`     | ACP SDK handle for JSON-RPC communication      |
| `sessionId`          | `string`                   | ACP session ID returned by `newSession()`      |
| `repoUrl`            | `string`                   | Original Git URL                               |
| `repoName`           | `string`                   | Extracted repo name (used for display)         |
| `repoPath`           | `string`                   | Local filesystem path to cloned repo           |
| `role`               | `"orchestrator"\|"worker"` | Determines UI treatment and broadcast behavior |
| `status`             | `string`                   | `spawning`, `ready`, `busy`, `error`           |
| `permissionResolver` | `Function \| null`         | Resolves pending permission request promise    |

### Roles: Orchestrator vs Worker

| Aspect           | Orchestrator                         | Worker                              |
| ---------------- | ------------------------------------ | ----------------------------------- |
| Count            | 0 or 1 at a time                     | 0 to N                              |
| UI Position      | Full-width card above worker grid    | Grid card alongside other workers   |
| Broadcast target | Receives synthesized results AFTER   | Receives broadcast prompts directly |
| Purpose          | Coordination, synthesis, PR tracking | Code changes in a single repo       |
| Color theme      | Teal/cyan                            | Purple/blue                         |

### Broadcast Flow

```
1. User enters prompt in BroadcastInput (optional: synthesis instructions)
2. Server fans out prompt to all READY workers (role === "worker")
3. Each worker runs the prompt; streaming updates flow back
4. When all workers complete, server coalesces results
5. Coalesced output sent to:
   a) Frontend → BroadcastResults panel
   b) Orchestrator agent (if present) → auto-prompted with synthesis context
6. Orchestrator generates synthesis; updates flow back to OrchestratorCard
```

---

## Socket.IO Event Reference

### Client → Server

| Event                       | Payload                                          | Description                           |
| --------------------------- | ------------------------------------------------ | ------------------------------------- |
| `agent:create`              | `{repoUrl, role, repoBaseDir?, reuseExisting?}`  | Clone repo and spawn copilot process  |
| `agent:prompt`              | `{agentId, text}`                                | Send prompt to specific agent         |
| `agent:stop`                | `{agentId}`                                      | Kill agent process and cleanup        |
| `agent:permission_response` | `{agentId, optionId}`                            | User's response to permission request |
| `broadcast:prompt`          | `{text, synthesisInstructions?, targetedRepos?}` | Fan-out prompt to workers             |
| `workitems:list`            | –                                                | Request current work item registry    |
| `broadcast:list_history`    | –                                                | Request broadcast history             |

### Server → Client

| Event                      | Payload                                                | Description                               |
| -------------------------- | ------------------------------------------------------ | ----------------------------------------- |
| `agent:spawning`           | `{agentId, repoUrl, repoName, role, step, message}`    | Spawn in progress                         |
| `agent:created`            | `{agentId, repoUrl, repoName, repoPath, role, status}` | Agent ready                               |
| `agent:update`             | `{agentId, ...sessionUpdate}`                          | Streaming output (text, tool calls, etc.) |
| `agent:status`             | `{agentId, status}`                                    | Status change (busy → ready, etc.)        |
| `agent:error`              | `{agentId, error}`                                     | Error message                             |
| `agent:stopped`            | `{agentId}`                                            | Agent terminated                          |
| `agent:permission_request` | `{agentId, title, options}`                            | Permission approval needed                |
| `broadcast:started`        | `{targetAgents}`                                       | Broadcast wave started                    |
| `broadcast:progress`       | `{completed, total, agentId, repoName, status}`        | Per-worker completion tick                |
| `broadcast:complete`       | `{results, synthesisInstructions}`                     | All workers done, coalesced results       |
| `workitems:updated`        | `[...workItems]`                                       | Work item registry changed                |
| `broadcast:history`        | `[...history]`                                         | Past broadcast prompts                    |

---

## ACP Integration

Communication with each `copilot` process uses the
[Agent Client Protocol](https://agentclientprotocol.com/) SDK:

```javascript
import * as acp from "@agentclientprotocol/sdk";

const connection = acp.createClientSideConnection({
  inputStream, // Readable from copilot stdout
  outputStream, // Writable to copilot stdin
  requestPermission: async (params) => {
    /* UI approval flow */
  },
  sessionUpdate: (update) => {
    /* stream to frontend */
  },
  logMessage: (msg) => {
    /* console logging */
  },
});

await connection.connect();
await connection.initialize({ clientVersion: "..." });
const { sessionId } = await connection.newSession({
  workingDirectory: repoPath,
});
await connection.prompt(sessionId, { text: "..." });
```

Key callbacks:

- **`sessionUpdate`**: Receives incremental output (text chunks, tool calls,
  plans, thoughts). Server re-emits as `agent:update`.
- **`requestPermission`**: Called when the agent needs approval. Server stores
  a promise resolver and emits `agent:permission_request` to the frontend.

---

## State Management (Client)

All state lives in `App.jsx` using React hooks:

| State               | Type                      | Purpose                                |
| ------------------- | ------------------------- | -------------------------------------- |
| `agents`            | `{[agentId]: AgentState}` | All agent data (status, output, perms) |
| `connected`         | `boolean`                 | Socket.IO connection status            |
| `broadcasting`      | `boolean`                 | Broadcast in flight                    |
| `broadcastResults`  | `object \| null`          | Latest coalesced results               |
| `broadcastProgress` | `object \| null`          | Per-worker progress during broadcast   |
| `workItems`         | `array`                   | Detected issues/PRs                    |
| `broadcastHistory`  | `array`                   | Past broadcast prompts                 |
| `repoBaseDir`       | `string`                  | Custom clone directory                 |
| `reuseExisting`     | `boolean`                 | Reuse existing clones                  |

---

## Error Handling

| Scenario                      | Server behavior                            | Client behavior                            |
| ----------------------------- | ------------------------------------------ | ------------------------------------------ |
| Invalid repo URL              | Rejects with validation error (no spawn)   | Error shown in console/toast               |
| Git clone fails (auth/404)    | Emits `agent:error` with git stderr        | Card shows Error status + red message      |
| Copilot spawn fails           | Emits `agent:error`, cleans up cloned repo | Card shows Error status                    |
| ACP handshake fails           | Emits `agent:error`, kills process         | Card shows Error status                    |
| Prompt times out (5 min idle) | Emits `agent:error`, transitions to ready  | Error appended to output                   |
| Permission timeout            | Currently no timeout (promise hangs)       | User must respond or stop agent            |
| Socket disconnect             | Agents continue running; reconnect resumes | `connected` goes false; UI disables inputs |

---

## Testing

| Layer  | Framework            | Location                       | Run command          |
| ------ | -------------------- | ------------------------------ | -------------------- |
| Server | Vitest               | `webapp/server/__tests__/`     | `npm test` in server |
| Client | Vitest + Testing Lib | `webapp/client/src/__tests__/` | `npm test` in client |

Tests focus on:

- **Helpers**: URL validation, repo name extraction, work-item detection
- **Components**: Render states, user interactions, prop combinations

Integration/E2E tests (Playwright) are a future addition.

---

## Performance Considerations

1. **Output truncation**: `AgentCard` limits visible output to last 3 entries
   to keep the DOM light. `OrchestratorCard` uses 200.
2. **Shallow clones**: `git clone --depth 1` minimizes disk and network usage.
3. **Inactivity timeout**: Prompts that produce no output for 5 minutes are
   aborted to prevent runaway sessions.
4. **Socket.IO reconnection**: Built-in auto-reconnect; agents survive brief
   disconnects.

---

## Security Notes

- **URL allowlist**: Only HTTPS URLs from GitHub, GitLab, Bitbucket, and Azure
  DevOps are accepted. No arbitrary hosts.
- **No credential storage**: Git auth relies on the host machine's credential
  helper (e.g., Git Credential Manager).
- **Local-only by default**: Server binds to `localhost:3001` unless you
  change the config.
- **Process isolation**: Each agent is a separate OS process; one agent
  crashing doesn't affect others.

---

## Extension Points

| To add...                   | Modify...                                           |
| --------------------------- | --------------------------------------------------- |
| New Socket.IO event         | `server/index.js` + `client/src/App.jsx` useEffect  |
| New agent card variant      | Add component in `components/`, update `App.jsx`    |
| Additional git host support | `server/helpers.js` `isValidGitUrl()` regex         |
| Custom synthesis logic      | `server/index.js` `handleBroadcastComplete()`       |
| Persistent storage          | Add database layer; server currently uses in-memory |
