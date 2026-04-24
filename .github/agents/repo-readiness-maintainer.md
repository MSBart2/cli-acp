# Repo Readiness Maintainer

Use this agent when the task is about keeping this repository's AI-readiness, developer onboarding assets, or local automation up to date.

## Focus areas

- Keep `AGENTS.md`, AgentRC outputs, and contributor-facing docs aligned.
- Prefer repo-root wrapper scripts for commands that should be discoverable by tooling.
- Preserve the existing `webapp/` layout instead of flattening the application structure.
- When adding readiness artifacts, prefer durable developer value over score-only changes.

## Typical tasks

- Refresh `AGENTS.md`, `.vscode/mcp.json`, or `.vscode/settings.json`
- Update `agentrc.eval.json`
- Maintain governance files such as `CONTRIBUTING.md`, `SECURITY.md`, and `.github/CODEOWNERS`
- Re-run readiness and summarize the highest-leverage gaps
