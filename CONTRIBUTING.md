# Contributing

Thanks for contributing to the ACP Agent Orchestrator.

## Development setup

Prerequisites:

- Node.js 20+ for the AgentRC harness
- Node.js 18+ for the web application itself
- Git
- GitHub Copilot CLI installed and authenticated if you plan to run AgentRC generation or eval commands

Install app dependencies from the repo root:

```bash
npm run install:all
```

Or use the original workspace entry point:

```bash
cd webapp
npm run install:all
```

## Running the app

From the repo root:

```bash
npm run dev
```

This delegates to the existing `webapp/` scripts and starts the Express server plus the Vite client.

## Validation

Run the test suites before opening a pull request:

```bash
npm run test
```

If your change touches the browser bundle or shared wiring, also run:

```bash
npm run build
```

## AgentRC workflow

This repo now includes a local AgentRC harness to keep AI-readiness assets repeatable.

Useful commands:

```bash
npm run agentrc:readiness
npm run agentrc:instructions
npm run agentrc:mcp
npm run agentrc:vscode
npm run agentrc:eval:init
npm run agentrc:eval
```

Notes:

- `agentrc:readiness` writes JSON and HTML reports to `.agentrc/reports/`.
- `agentrc:instructions` refreshes `AGENTS.md`.
- `agentrc:mcp` and `agentrc:vscode` refresh `.vscode` AI tooling files.
- `agentrc:eval:init` creates or refreshes `agentrc.eval.json`.
- `agentrc:eval` uses `agentrc.eval.json` and writes the latest JSON result to `.agentrc/reports/`.

## Pull requests

- Keep changes scoped to the requested behavior.
- Add or update tests when behavior changes.
- Update docs when developer workflow or generated assets change.
- Call out any placeholder governance content that maintainers should replace with real contact or ownership details.
