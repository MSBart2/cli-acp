# AgentRC Readiness

## When to use this skill

Use this skill when the task involves:

- improving AgentRC readiness scores
- refreshing generated AI-readiness assets
- diagnosing which repository pillars are currently failing
- keeping governance, docs, and local harness scripts aligned

## Repo-specific guidance

- Run repo-level wrapper commands such as `npm run agentrc:readiness`.
- Treat `AGENTS.md` as the primary instruction file for this repository.
- Keep generated reports under `.agentrc/reports/`.
- Preserve the existing `webapp/` scripts and architecture when adding repo-root automation.

## Validation checklist

1. Run readiness and inspect the per-pillar failures.
2. Update only the files that materially improve maintainability.
3. Re-run `npm run test` and `npm run build` when code or build wiring changes.
