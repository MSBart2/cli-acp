# Agent Instructions — ACP Agent Orchestrator

> For architecture, data flow, and implementation reference, see `ARCHITECTURE.md`.

## Project overview

This repository contains the **ACP Agent Orchestrator**, a web UI that launches and coordinates multiple GitHub Copilot CLI agents across different repositories using the Agent Client Protocol (ACP).

Each repository gets its own `copilot --acp --stdio` child process with an isolated ACP session scoped to that repo's working directory.

## Quick navigation

| I want to... | Look at... |
| --- | --- |
| Understand the overall architecture | `ARCHITECTURE.md` |
| See the demo scenario | `SCENARIO.md` |
| Add a Socket.IO event | `webapp/server/index.js` and `webapp/client/src/App.jsx` |
| Add a new UI component | `webapp/client/src/components/` and update `App.jsx` |
| Modify URL validation | `webapp/server/helpers.js` and `isValidGitUrl()` |
| Add server-side tests | `webapp/server/__tests__/` |
| Add client-side tests | `webapp/client/src/__tests__/` |

## Repository structure

```text
webapp/
  package.json
  server/
    index.js
    helpers.js
    package.json
  client/
    src/
      App.jsx
      components/
        AgentCard.jsx
        Header.jsx
        RepoInput.jsx
```

The root `package.json` is a thin wrapper around the existing `webapp/` scripts so repo-level tooling can discover build and test entry points cleanly.

## Architecture and key concepts

| Layer | Stack |
| --- | --- |
| Backend | Node.js, Express, Socket.IO |
| Frontend | React 18, Vite 6, Tailwind CSS 3 |
| Protocol | `@agentclientprotocol/sdk` over ACP stdio |

### Data flow

1. Browser actions emit Socket.IO events such as `agent:create`, `agent:prompt`, `agent:stop`, and `agent:permission_response`.
2. The server spawns and manages one Copilot CLI process per agent.
3. ACP session updates and permission requests stream back through the server to the browser.

### Agent lifecycle

`agent:create` → clone repo → spawn copilot → ACP `initialize` → `newSession(cwd)` → ready → prompt loop → `agent:stop` → kill process and clean up cloned repo.

## Code style and conventions

### JavaScript and Node.js

- Use ES modules everywhere. Do not introduce `require`.
- Prefer `async`/`await` over promise chains.
- Destructure inputs early when it improves readability.
- Default to `const`; avoid `var`.
- Add JSDoc to exported or shared server helpers.
- Do not introduce callback-style error handling.

### React and frontend

- Use functional components only.
- Destructure props in the function signature.
- Use Tailwind utilities for styling.
- Use `lucide-react` icons.
- Keep components reasonably focused; extract sub-components or hooks when they grow.

### Naming conventions

| Entity | Convention | Example |
| --- | --- | --- |
| React component | PascalCase | `AgentCard.jsx` |
| Hook | camelCase with `use` prefix | `useNotifications` |
| Utility function | camelCase | `repoNameFromUrl` |
| Constant | UPPER_SNAKE_CASE | `PROMPT_INACTIVITY_TIMEOUT_MS` |
| Socket.IO event | `namespace:action` | `agent:create` |

### Comments and documentation

- Prefer short comments that explain **why**, not **what**.
- Use `// TODO(username): description` format for TODOs.
- Do not leave commented-out code behind.

## ACP-specific guidance

- Keep one Copilot process per agent.
- The orchestrator and worker roles have different responsibilities; preserve that split.
- `requestPermission` and `sessionUpdate` are the most important ACP client callbacks.
- When adding new Socket.IO events, wire both the server handler and the client listener path.
- Dependency-aware context, cascade routing, and graph hydration should stay aligned across server and UI behavior.

## Testing

Run the existing Vitest suites from `webapp/`:

```bash
npm test
```

At repo root, the wrapper scripts mirror the same workflows:

```bash
npm run test
npm run build
```

When changing orchestration behavior, prefer:

- helper tests in `webapp/server/__tests__/`
- component tests in `webapp/client/src/__tests__/`
- `App.jsx` integration-style tests for socket-heavy flows

## AgentRC maintenance

Use the local harness to refresh AI-readiness assets:

```bash
npm run agentrc:readiness
npm run agentrc:instructions
npm run agentrc:mcp
npm run agentrc:vscode
npm run agentrc:eval:init
```

Generated reports are written to `.agentrc/reports/`.
