# Scenario 2: Documentation Audit with Issues and PRs

This is the flagship end-to-end scenario for the ACP Agent Orchestrator.

It keeps the spirit of the original `SCENARIO.md`, but narrows the doc to one
job: coordinate a documentation campaign across several repositories and keep a
clean audit trail from discovery to PRs.

## When to use this scenario

Use this when you need a safe but realistic multi-repo workflow:

- the work is mostly read-heavy at first
- every worker can follow the same playbook
- you want issue and PR links preserved in one coordination repo

## Setup

You are responsible for four repositories:

| Repo | Stack | Current doc state |
| --- | --- | --- |
| `myorg/api-gateway` | Node.js / Express | README exists but is stale |
| `myorg/billing-service` | Python / FastAPI | README is missing |
| `myorg/web-dashboard` | React / Vite / TypeScript | README is decent but incomplete |
| `myorg/infra-config` | Terraform + Bash | README documents the wrong repo |

You also have a coordination repo:

- `myorg/cross-repo-ops`

The orchestrator will use that repo to keep durable coordination notes such as
`discovery.md`, `issues.md`, and `prs.md`.

## Goal

Bring all four repositories up to a consistent documentation standard and keep
full traceability from discovery to issues to pull requests.

## Workflow

### Phase 1: Spawn the orchestrator and workers

Launch the coordination repo as the orchestrator, then launch the four target
repos as workers.

Wait for all five cards to show **Ready**.

### Phase 2: Run a discovery broadcast

Send this broadcast prompt to all workers:

```text
Audit the documentation in this repository. Examine the actual source code,
build files, and configuration to determine what the project does, how it is
built, tested, and run. Then evaluate the existing README (if any) against what
the code actually does.

Return your findings as:
1. Project purpose
2. Tech stack
3. Build / run / test commands
4. Current README status
5. Gaps
6. Recommended changes
```

Add **Orchestrator Focus** for the orchestrator:

```text
Create a coordination summary in `operations/2026-02-09-doc-audit/discovery.md`.
Highlight the overall state, common documentation failures, and a priority
order for fixing the repos.
```

### Phase 3: Create tracking issues

Now that discovery is complete, broadcast an issue-creation prompt:

```text
Create a GitHub issue in this repository titled "Documentation Audit - update
README". Summarize the documentation gaps you found earlier. Label it
`documentation` and include the issue URL in your response.
```

Add **Orchestrator Focus**:

```text
Create a parent tracking issue in this repo titled "Cross-Repo Documentation
Audit". Reference each child issue URL and write the issue map to
`operations/2026-02-09-doc-audit/issues.md`.
```

This is where the orchestrator becomes more than a summarizer. It turns
parallel repo work into a durable coordination record.

### Phase 4: Generate README PRs

Send the implementation broadcast:

```text
Based on your analysis, rewrite or create the README.md for this repository.
Create a branch named `docs/update-readme`, commit your changes, and open a pull
request.

Reference the documentation audit issue in the PR description using `Closes #N`.

Include the PR URL in your response.

Use this README structure:
- Title and one-line description
- Prerequisites
- Getting Started
- Testing
- Architecture
- Contributing
```

Add **Orchestrator Focus**:

```text
Extract each PR URL and its linked issue. Write a PR tracker to
`operations/2026-02-09-doc-audit/prs.md` with repo, issue, PR, status, and
recommended merge order.
```

### Phase 5: Review and adjust

Use the orchestrator output as your control tower:

- review the combined discovery summary
- confirm each repo has a child issue
- confirm each PR references the correct issue
- identify any repo that needs a targeted follow-up

If one repo needs extra work, send a direct prompt to that worker instead of
re-broadcasting to everyone.

Example:

```text
Your README still needs database bootstrap steps. Update the existing PR branch
and keep the rest of the README structure intact.
```

## What success looks like

The scenario is complete when you have:

1. a discovery summary in the orchestrator repo
2. one issue per worker repo
3. one parent tracking issue in the coordination repo
4. one README PR per worker repo
5. a coordination file that maps issues to PRs

## Why this scenario works so well

It teaches almost every important operator behavior in one workflow:

- launch orchestrator before workers
- use broadcasts for consistent repo-wide asks
- use Orchestrator Focus to shape the orchestrator's artifact
- use targeted prompts for exceptions
- keep the coordination repo as the durable source of truth

## Common mistakes

- Asking the orchestrator to create worker-repo artifacts directly
- Skipping issue creation, which weakens traceability later
- Re-broadcasting a repo-specific correction to every worker

## What to read next

If your work includes shared libraries, APIs, or downstream contract changes,
continue with
[`03-dependency-aware-routing-and-cascades`](03-dependency-aware-routing-and-cascades.md).
