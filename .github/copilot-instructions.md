# Copilot Instructions — ACP Agent Orchestrator

## Project Overview

This is the **ACP Agent Orchestrator**, a web UI that spawns and manages multiple
GitHub Copilot CLI agents across different repositories using the
[Agent Client Protocol (ACP)](https://agentclientprotocol.com).

Each repository gets its own `copilot --acp --stdio` child process with an
isolated ACP session scoped to that repo's working directory.

## Repository Structure

```
webapp/
  package.json          # Root orchestrator scripts (build, dev, start)
  server/
    index.js            # Express + Socket.IO server, ACP client logic
    package.json
  client/
    src/
      App.jsx           # Main React app — socket event wiring
      components/
        AgentCard.jsx   # Per-agent card (output stream, prompt input, permissions)
        Header.jsx      # Top bar with connection indicator
        RepoInput.jsx   # Repo URL input + launch button
    vite.config.js      # Vite dev server with proxy to backend
    tailwind.config.js
    package.json
```

- **Root `package.json`** (`webapp/package.json`) contains convenience scripts
  that orchestrate both sub-projects.
- The server serves the built React client from `client/dist/` in production via
  `express.static`.

## Architecture & Key Concepts

| Layer    | Stack                                       |
| -------- | ------------------------------------------- |
| Backend  | Node.js 18+, Express, Socket.IO             |
| Frontend | React 18, Vite 6, Tailwind CSS 3            |
| Protocol | `@agentclientprotocol/sdk` (ACP over stdio) |

### Data flow

1. **Browser → Socket.IO → Server**: user actions (`agent:create`,
   `agent:prompt`, `agent:stop`, `agent:permission_response`).
2. **Server → ACP child process**: each agent is a spawned `copilot --acp
--stdio` process managed via `ClientSideConnection`.
3. **ACP child process → Server → Browser**: streaming updates are forwarded
   back over Socket.IO (`agent:update`, `agent:permission_request`, etc.).

### Agent lifecycle

`agent:create` → clone repo → spawn copilot → ACP `initialize` →
`newSession(cwd)` → **ready** → `prompt` ↔ `sessionUpdate` / `requestPermission`
→ `agent:stop` → kill process + cleanup cloned repo.

## Code Style & Conventions

- **ES Modules everywhere** — both `server/` and `client/` use
  `"type": "module"`. Always use `import`/`export`, never `require`.
- **React functional components only** — use hooks (`useState`, `useEffect`,
  `useCallback`, `useRef`). No class components.
- **Tailwind CSS for all styling** — no CSS modules, no styled-components.
  Follow the existing dark-theme / glassmorphism aesthetic
  (`bg-white/5 backdrop-blur-xl`, gradient borders, etc.).
- **`lucide-react`** for icons — import individual icons by name.
- **Prefer named exports** except for React page/component default exports.
- **Educational comments** — when generating code, include brief comments that
  explain _why_ something is done, not just _what_. Help future readers
  understand the reasoning behind non-obvious decisions.
- **JSDoc on public helpers** — add `@param` / `@returns` annotations to
  exported or shared functions in the server.

## Building & Running

All commands run from `webapp/`:

```bash
npm run install:all   # Install server + client deps
npm run dev           # Start both server (port 3001) & Vite dev server (5173)
npm run dev:server    # Server only (watch mode via --watch)
npm run dev:client    # Vite dev server only
npm run build         # Install deps + production build of the React client
npm start             # Start the Express server (serves built client)
npm run prod          # build + start in one step
```

- Dev proxy: Vite proxies `/socket.io` to `http://localhost:3001` so the client
  can reach the backend during development.
- Production: the Express server serves `client/dist/` as static files.

## ACP / Domain-Specific Guidance

- **One process per agent** — each agent maps to a single `copilot --acp
--stdio` child process. Never share a process across agents.
- **Orchestrator vs worker roles** — `agent:create` accepts a `role` of
  `"orchestrator"` or `"worker"`. Broadcast prompts target workers only, and
  the server auto-forwards coalesced results to the orchestrator agent.
- **`ClientSideConnection`** from `@agentclientprotocol/sdk` manages the JSON
  RPC stream. The two client callbacks that matter most are:
  - `requestPermission` — surfaces tool-execution approvals to the user.
  - `sessionUpdate` — streams incremental agent output (text chunks, tool
    calls, plans, thoughts).
- **Permission flow** — when the agent requests permission, the server stores a
  `Promise` resolver on the agent entry. The frontend shows a banner with
  option buttons. The user's choice is sent back via
  `agent:permission_response`, which resolves the promise.
- **Repo cloning** — repos are shallow-cloned (`--depth 1`) into a temp
  directory (`os.tmpdir()/acp-repos/`). They are cleaned up when the agent
  stops or the server shuts down.
- **URL validation** — only HTTPS Git URLs from GitHub, GitLab, Bitbucket, and
  Azure DevOps are accepted. See `isValidGitUrl()`.
- When adding new Socket.IO events, follow the existing `agent:<action>`
  naming convention and handle them in both the server's `io.on("connection")`
  block and the client's `useEffect` in `App.jsx`.

## Scenario Reference

The canonical demo scenario is documented in [`SCENARIO.md`](../SCENARIO.md).
It covers the cross-repo documentation audit workflow, including the
orchestrator’s role in writing coordination files (issues, PR maps, rollout
plans). Keep this scenario in mind when updating orchestration flows or UI
layout so the orchestrator card, broadcast results, and synthesis steps remain
aligned with the demo narrative.

## Testing

Testing is planned but not yet set up. When adding tests:

- Use **Vitest** for the React client (it integrates naturally with Vite).
- Use Node's built-in test runner or **Vitest** for the server.
- Prioritise tests around ACP session lifecycle, permission flow, and URL
  validation.

## Environment Variables

| Variable           | Description                    | Default   |
| ------------------ | ------------------------------ | --------- |
| `PORT`             | Server listen port             | `3001`    |
| `COPILOT_CLI_PATH` | Path to the Copilot CLI binary | `copilot` |
