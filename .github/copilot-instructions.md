# Copilot Instructions — ACP Agent Orchestrator

> **For detailed architecture, data flow, and implementation reference, see
> [`ARCHITECTURE.md`](../ARCHITECTURE.md).** Use that document to understand
> how the codebase is organized, what each component does, and where to make
> changes.

## Project Overview

This is the **ACP Agent Orchestrator**, a web UI that spawns and manages multiple
GitHub Copilot CLI agents across different repositories using the
[Agent Client Protocol (ACP)](https://agentclientprotocol.com).

Each repository gets its own `copilot --acp --stdio` child process with an
isolated ACP session scoped to that repo's working directory.

## Quick Navigation

| I want to...                        | Look at...                                  |
| ----------------------------------- | ------------------------------------------- |
| Understand the overall architecture | [`ARCHITECTURE.md`](../ARCHITECTURE.md)     |
| See the demo scenario               | [`SCENARIO.md`](../SCENARIO.md)             |
| Add a Socket.IO event               | `server/index.js` + `client/src/App.jsx`    |
| Add a new UI component              | `client/src/components/` + update `App.jsx` |
| Modify URL validation               | `server/helpers.js` → `isValidGitUrl()`     |
| Add server-side tests               | `server/__tests__/` (Vitest)                |
| Add client-side tests               | `client/src/__tests__/` (Vitest + RTL)      |

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

### JavaScript / Node.js

- **ES Modules everywhere** — both `server/` and `client/` use
  `"type": "module"`. Always use `import`/`export`, never `require`.
- **Async/await over raw promises** — use `async`/`await` for readability;
  avoid `.then()` chains unless composing multiple promises.
- **Destructure early** — destructure function parameters and imports at the
  top to surface dependencies clearly.
- **Const by default** — use `const` unless reassignment is required; avoid
  `var` entirely.
- **JSDoc on public helpers** — add `@param` / `@returns` / `@typedef`
  annotations to exported or shared functions in the server.
- **Error-first callbacks are banned** — this codebase uses promises; do not
  introduce callback-style error handling.

### React / Frontend

- **Functional components only** — use hooks (`useState`, `useEffect`,
  `useCallback`, `useRef`, `useMemo`). No class components.
- **One component per file** — component name must match the filename.
- **Props destructuring in signature** — `function Foo({ bar, baz })` not
  `function Foo(props)`.
- **Tailwind CSS for all styling** — no CSS modules, no styled-components.
  Follow the existing dark-theme / glassmorphism aesthetic
  (`bg-white/5 backdrop-blur-xl`, gradient borders, etc.).
- **`lucide-react`** for icons — import individual icons by name.
- **Prefer named exports** except for React page/component default exports.
- **Keep components ≤ 250 lines** — extract sub-components or hooks when a
  file grows beyond this.

### Naming Conventions

| Entity           | Convention         | Example                              |
| ---------------- | ------------------ | ------------------------------------ |
| React component  | PascalCase         | `AgentCard.jsx`                      |
| Hook             | camelCase, `use`-  | `useBroadcast()`                     |
| Utility function | camelCase          | `isValidGitUrl()`                    |
| Constant         | UPPER_SNAKE_CASE   | `PROMPT_INACTIVITY_TIMEOUT_MS`       |
| Socket.IO event  | `namespace:action` | `agent:create`, `broadcast:progress` |
| CSS class        | Tailwind utilities | `bg-purple-500/30`                   |

### Comments & Documentation

- **Educational comments** — when generating code, include brief comments that
  explain _why_ something is done, not just _what_. Help future readers
  understand the reasoning behind non-obvious decisions.
- **TODO format** — `// TODO(username): description` with your GitHub handle.
- **No commented-out code** — delete dead code; git has history.

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

Both client and server use **Vitest**. Tests live next to the code they cover:

| Layer  | Location                       | Run                            |
| ------ | ------------------------------ | ------------------------------ |
| Server | `webapp/server/__tests__/`     | `cd webapp/server && npm test` |
| Client | `webapp/client/src/__tests__/` | `cd webapp/client && npm test` |

### Testing Conventions

- **Test file naming** — `ComponentName.test.jsx` or `helperName.test.js`.
- **Testing Library** — use `@testing-library/react` for component tests;
  query by accessible role/text, not implementation details.
- **Arrange-Act-Assert** — structure tests with clear setup, action, and
  assertion phases.
- **Mock Socket.IO sparingly** — most component tests render in isolation
  without needing a socket mock.
- **One assertion focus per test** — a test should verify one behaviour;
  split multi-step scenarios into separate tests.

### Coverage Priorities

1. **Server helpers** — URL validation, repo naming, work-item extraction.
2. **Component states** — spawning, ready, busy, error, permission pending.
3. **User interactions** — button clicks, form submissions, keyboard events.
4. **Edge cases** — empty input, disconnection, truncated output.

Integration / E2E tests (Playwright) are a future addition.

## Environment Variables

| Variable           | Description                    | Default              |
| ------------------ | ------------------------------ | -------------------- |
| `PORT`             | Server listen port             | `3001`               |
| `COPILOT_CLI_PATH` | Path to the Copilot CLI binary | `copilot`            |
| `REPO_BASE_DIR`    | Where repos are shallow-cloned | `<tmpdir>/acp-repos` |
