# Exemplar Scenario: Cross-Repo Documentation Audit

## Why this scenario

A documentation audit is the ideal first demo for the ACP Agent Orchestrator
because it's **universally relatable**, **safe** (read-heavy, low blast radius),
and **naturally produces structured results that need coalescing**. Every team
has 3–5 repos with inconsistent READMEs, missing setup instructions, or stale
architecture docs. The pain is real; the fix is tedious; the agents should do it.

---

## Architecture: the orchestrator agent

The system has two distinct agent roles:

### Worker agents

Each worker agent is scoped to a single repository. It reads code, makes
changes, creates branches and PRs, and reports back. Worker agents have no
knowledge of what other workers are doing — they only see their own repo.

### The orchestrator agent

The orchestrator is a **first-class agent** backed by its own **coordination
repository** (e.g. `myorg/cross-repo-ops`). It does NOT modify code in the
worker repos. Instead it:

- **Synthesizes** results from all worker agents into actionable summaries
- **Tracks PRs** created across repos, including their URLs, status, and
  dependencies
- **Maintains a rollout plan** with merge ordering
- **Flags risks** — conflicting changes, missing tests, breaking contracts
- **Writes everything to files** in the coordination repo so there's a
  persistent, versioned, auditable record

The coordination repo structure might look like:

```
cross-repo-ops/
  .github/
    copilot-instructions.md     # "You are the orchestrator agent…"
  operations/
    2026-02-09-doc-audit/
      plan.md                   # What we're doing and why
      discovery.md              # Coalesced discovery results
      issues.md                 # Parent + child issue links
      prs.md                    # Links + status of all created PRs
      rollout.md                # Dependency order, merge sequence
    2026-02-12-add-middlename/
      plan.md
      ...
```

This gives you **history** (past operations are just folders), **resumability**
(the orchestrator can re-read its own docs and pick up where it left off),
**auditability** (git log shows when decisions were made), and **team
visibility** (anyone can open the repo to see cross-repo work in flight).

### Data flow

```
User enters a broadcast prompt
         │
         ▼
┌─────────────────────┐
│  Orchestrator Agent  │ ◄──── coalesced worker outputs
│  (cross-repo-ops)    │ ────► writes prs.md, rollout.md, etc.
└────────┬────────────┘
         │ fans out prompt to workers
         ▼
┌────────────┐  ┌────────────┐  ┌────────────┐
│ api-gateway│  │ billing-svc│  │ web-dash   │  worker agents
└─────┬──────┘  └─────┬──────┘  └─────┬──────┘
      │               │               │
      ▼               ▼               ▼
   PR #42          PR #17          PR #8
```

The orchestrator card sits **above** the worker cards in the UI, always
visible, with a distinct visual treatment. After each broadcast wave
completes, the coalesced worker outputs are automatically fed to the
orchestrator so it can update the coordination documents.

---

## The Setup

You're a tech lead responsible for four repositories:

| Repo                    | Stack                     | State of docs                                                                   |
| ----------------------- | ------------------------- | ------------------------------------------------------------------------------- |
| `myorg/api-gateway`     | Node.js / Express         | Has a README but it's 18 months stale — missing env vars, wrong startup command |
| `myorg/billing-service` | Python / FastAPI          | No README at all — just a bare `main.py`                                        |
| `myorg/web-dashboard`   | React / Vite / TypeScript | Good README but no contributing guide or architecture section                   |
| `myorg/infra-config`    | Terraform + Bash scripts  | Has a README but it documents a different repo (copy-paste accident)            |

You also have a coordination repo, `myorg/cross-repo-ops`, with a
`copilot-instructions.md` that tells the orchestrator agent its role.

Your goal: **bring all four repos up to a consistent documentation standard**,
where each README reflects the repo's actual code, tech stack, and local
conventions — and each change is captured as a PR with a coordination record.

---

## The Workflow (6 phases)

### Phase 1 — Spawn the orchestrator

Launch the orchestrator agent first by entering the coordination repo URL.
The orchestrator card appears at the top of the page in its own distinguished
panel. It's always visible as the "command center" for the operation.

### Phase 2 — Spawn workers

Launch four worker agents from the repo input. Each gets its own card in the
grid below the orchestrator.

Once all five agents (1 orchestrator + 4 workers) show **Ready**, you're set.

### Phase 3 — Discovery (broadcast)

Send a broadcast prompt to all **worker** agents:

> **Broadcast prompt:**
> Audit the documentation in this repository. Examine the actual source code,
> build files, and configuration to determine what the project does, how it's
> built, tested, and run. Then evaluate the existing README (if any) against
> what the code actually does.
>
> Return your findings as a structured summary with these sections:
>
> 1. **Project purpose** — one sentence
> 2. **Tech stack** — languages, frameworks, key dependencies
> 3. **Build / run / test commands** — what actually works today
> 4. **Current README status** — missing, stale, inaccurate, or adequate
> 5. **Gaps** — bullet list of what's missing or wrong
> 6. **Recommended changes** — bullet list of specific documentation updates

Each worker streams its analysis in its own card. When all workers finish, the
coalesced results are **automatically forwarded to the orchestrator** with a
synthesis prompt:

> Here are the documentation audit results from 4 repositories. Synthesize
> these into a coordination document. Identify the overall state, flag any
> cross-repo dependencies, and recommend a priority order for fixes. Write
> your synthesis to `operations/2026-02-09-doc-audit/discovery.md`.

The orchestrator processes the combined results, writes the coordination doc,
and its output appears in its card.

### Phase 4a — Create issues for traceability (broadcast)

Before any work begins, each repo gets a tracking issue so that every branch
and PR has a paper trail. The user broadcasts with **synthesis instructions**
that tell the orchestrator what to do with the results:

> **Broadcast prompt:**
> Create a GitHub issue in this repository titled "Documentation Audit —
> update README" with a body that summarizes the gaps you found in Phase 3.
> Label it `documentation`. Include the issue URL in your response.

> **Synthesis instructions:**
> Create a parent tracking issue in this repo titled "Cross-Repo Documentation
> Audit" that references each child issue URL. Write the issue map to
> `operations/2026-02-09-doc-audit/issues.md`.

Each worker creates an issue and reports its URL. The coalesced results are
forwarded to the orchestrator along with the user's synthesis instructions.
The orchestrator creates a parent issue in the coordination repo and writes
`issues.md`:

```markdown
# Issues — Documentation Audit (2026-02-09)

## Parent issue

- [cross-repo-ops#5](https://github.com/myorg/cross-repo-ops/issues/5)

## Child issues

| Repo            | Issue                                                   | Title                               |
| --------------- | ------------------------------------------------------- | ----------------------------------- |
| api-gateway     | [#12](https://github.com/myorg/api-gateway/issues/12)   | Documentation Audit — update README |
| billing-service | [#3](https://github.com/myorg/billing-service/issues/3) | Documentation Audit — update README |
| web-dashboard   | [#21](https://github.com/myorg/web-dashboard/issues/21) | Documentation Audit — update README |
| infra-config    | [#9](https://github.com/myorg/infra-config/issues/9)    | Documentation Audit — update README |
```

This creates the traceability spine: parent issue → child issues → (soon) PRs.

### Phase 4b — Execute the work (broadcast)

Now send the second broadcast that produces the actual changes:

> **Broadcast prompt:**
> Based on your analysis, rewrite (or create) the README.md for this
> repository. Create a new branch named `docs/update-readme` and commit
> your changes. Then create a pull request with a clear title and
> description summarizing what changed and why.
>
> **Reference the documentation audit issue you created earlier** in the
> PR description (e.g. "Closes #12") so the PR is linked to the issue.
>
> Include the PR URL in your response.
>
> Follow these conventions:
>
> - Title and one-line description
> - Prerequisites section
> - Getting Started (clone, install, configure, run)
> - Testing (how to run tests, what framework)
> - Architecture (brief overview of project structure)
> - Contributing (branch strategy, PR process, code style)

Each worker creates a branch, rewrites the README, pushes, and opens a PR
that references the issue from Phase 4a. Their outputs include PR URLs.

### Phase 5 — PR coordination (auto-forwarded to orchestrator)

When all workers complete, the coalesced results — including the PR URLs
each worker reported — are forwarded to the orchestrator:

> Here are the results from 4 workers after creating documentation PRs.
> Extract each PR URL and the issue it references. Write the results to
> `operations/2026-02-09-doc-audit/prs.md` with a table of PRs, their
> linked issues, status, and any dependencies. Recommend a merge order.

The orchestrator writes `prs.md`:

```markdown
# PRs — Documentation Audit (2026-02-09)

| Repo            | Issue                                                   | PR                                                      | Status | Dependencies | Notes                              |
| --------------- | ------------------------------------------------------- | ------------------------------------------------------- | ------ | ------------ | ---------------------------------- |
| api-gateway     | [#12](https://github.com/myorg/api-gateway/issues/12)   | [#42](https://github.com/myorg/api-gateway/pull/42)     | Open   | None         | Rewrote README, added env var docs |
| billing-service | [#3](https://github.com/myorg/billing-service/issues/3) | [#17](https://github.com/myorg/billing-service/pull/17) | Open   | None         | Created README from scratch        |
| web-dashboard   | [#21](https://github.com/myorg/web-dashboard/issues/21) | [#8](https://github.com/myorg/web-dashboard/pull/8)     | Open   | None         | Added contributing + architecture  |
| infra-config    | [#9](https://github.com/myorg/infra-config/issues/9)    | [#31](https://github.com/myorg/infra-config/pull/31)    | Open   | None         | Replaced incorrect README          |

## Issue → PR map

All PRs reference their respective issues via `Closes #N` in the PR body.
When PRs are merged, the issues will auto-close.

## Merge order

No cross-repo dependencies — all PRs can be merged independently.
```

### Phase 6 — Review + follow-up

The tech lead reviews the orchestrator's summary. If something needs
adjustment, they can either:

- Send a **targeted prompt** to one worker: "The billing-service README is
  missing the database setup steps — add them and push to the PR branch."
- Send a **broadcast follow-up**: "Add a badge for CI status at the top of
  each README."

After follow-ups complete, results flow back to the orchestrator, which
updates `prs.md` with the new commit activity.

---

## What "coalescing" means with the orchestrator model

With the orchestrator agent in place, coalescing is no longer just a
client-side display concern — it's an **agent-to-agent data flow**:

1. **Workers finish** → server collects all text outputs
2. **Server builds a synthesis prompt** containing all worker outputs
3. **Synthesis prompt is sent to the orchestrator agent** automatically
4. **Orchestrator reasons about the combined results** and writes
   coordination documents in its repo
5. **Client shows the orchestrator's output** as the authoritative coalesced
   view — the orchestrator card becomes the single pane of glass

This is better than pure client-side coalescing because the orchestrator can
**reason** about the results: spot conflicts, infer dependencies, recommend
merge ordering, and write persistent records.

The client-side `BroadcastResults` panel still shows the raw per-agent
summary table (headline + expand-to-detail), but the orchestrator card
above it provides the intelligent synthesis.

---

## What this means for the codebase

### Server changes

- **Agent role field**: each agent entry gets a `role` property —
  `"orchestrator"` or `"worker"`. Only one orchestrator is allowed at a time.
- **`agent:create` event**: accepts an optional `role` field. Defaults to
  `"worker"`. The orchestrator agent is created with `role: "orchestrator"`.
- **Broadcast exclusion**: `agent:prompt_all` only targets worker agents.
  The orchestrator receives prompts separately.
- **Auto-forward to orchestrator**: after `agent:broadcast_results` is
  emitted, the server checks if an orchestrator agent exists and is ready.
  If so, it builds a synthesis prompt from the coalesced results and sends
  it to the orchestrator agent automatically.
- **Orchestrator events**: `orchestrator:synthesizing` (started), output
  streams via usual `agent:update`, `agent:prompt_complete` when done.

### Client changes

- **`agent:create` UI**: the RepoInput gets a toggle or separate button to
  launch an agent as the orchestrator vs. a worker.
- **OrchestratorCard component**: a full-width card rendered above the
  worker grid. Distinct visual treatment (different gradient border, icon,
  label). Shows the orchestrator's streaming output, prompt input, and
  permission handling. Always visible when an orchestrator is active.
- **App.jsx layout**: orchestrator card at the top → broadcast input →
  broadcast results → worker cards grid.
- **Worker count in broadcast**: `readyCount` and `totalCount` exclude the
  orchestrator agent.

### Data shape

```js
// agent:created event (updated)
{
  agentId: "abc-123",
  repoUrl: "https://github.com/myorg/cross-repo-ops",
  repoName: "cross-repo-ops",
  role: "orchestrator",   // NEW — "orchestrator" | "worker"
  status: "ready"
}

// agent:prompt_all event (updated — accepts optional synthesis instructions)
{
  text: "Create a GitHub issue titled 'Documentation Audit'…",
  synthesisInstructions: "Create a parent tracking issue in this repo…"
  // When present, appended to the auto-forwarded synthesis prompt
  // so the user can guide what the orchestrator does with the results
}

// Synthesis prompt auto-sent to orchestrator (server-side)
{
  text: `Here are the results from 4 worker agents after a broadcast prompt.

Original prompt: "Audit the documentation..."

## api-gateway
Stale README — wrong start command, 3 missing env vars...

## billing-service
No README exists...

## web-dashboard
Good README, missing contributing and architecture sections...

## infra-config
README documents a different repo...

Synthesize these results into a coordination document. Write it to
operations/<date>-doc-audit/discovery.md in this repo.

--- User synthesis instructions ---
Create a parent tracking issue in this repo titled "Cross-Repo Documentation
Audit" that references each child issue URL. Write the issue map to
operations/2026-02-09-doc-audit/issues.md.`
}
```

---

## Success criteria

The scenario is "done" when a user can:

1. Launch an orchestrator agent from a coordination repo
2. Launch 3+ worker agents from different repos
3. Send a broadcast prompt to workers
4. See individual workers streaming in their cards
5. See the coalesced results panel appear when all workers finish
6. See the orchestrator automatically receive and synthesize the results
7. Provide **synthesis instructions** with a broadcast to guide what the
   orchestrator does with the coalesced outputs
8. See the orchestrator's synthesis in its dedicated card
9. Send a broadcast to create tracking issues in every worker repo
10. See the orchestrator create a parent issue and write `issues.md`
11. Send a follow-up broadcast ("now create PRs referencing the issues")
12. See PRs linked to issues via `Closes #N` for auto-close traceability
13. See the orchestrator update its coordination docs with PR + issue links
14. Send a targeted prompt to one worker for adjustment

That's the complete **issue → broadcast → coalesce → synthesize → PR → close**
loop with full traceability from parent issue through child issues to PRs.
