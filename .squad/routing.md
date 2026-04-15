# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Architecture, design decisions, cross-cutting concerns | Mal | API shape, data flow, security trade-offs |
| Backend — server, Socket.IO events, session storage, REST | Wash | `server/index.js` socket events, `server/helpers.js`, `sessionStore.js` |
| ACP protocol, Copilot CLI, agent lifecycle, permissions | Zoe | `ClientSideConnection`, spawn logic, streaming, broadcast forwarding, manifests |
| Frontend — React components, hooks, Tailwind, client state | Kaylee | `App.jsx`, `components/`, `agentState.js`, Vite config |
| Tests — e2e (Playwright), unit/component (Vitest + RTL) | Simon | `e2e/`, `server/__tests__/`, `client/src/__tests__/`, `AppPage.js` |
| Code review | Mal | Review PRs, quality gates, approve or reject with reassignment |
| Scope & priorities | Mal | What to build next, trade-offs, deferral decisions |
| Session logging | Scribe | Automatic — never needs routing |

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, assign `squad:{member}` label | Mal |
| `squad:mal` | Pick up issue | Mal |
| `squad:wash` | Pick up issue | Wash |
| `squad:kaylee` | Pick up issue | Kaylee |
| `squad:zoe` | Pick up issue | Zoe |
| `squad:simon` | Pick up issue | Simon |

### How Issue Assignment Works

1. When a GitHub issue gets the `squad` label, **Mal** triages it — analyzing content, assigning the right `squad:{member}` label, and commenting with triage notes.
2. When a `squad:{member}` label is applied, that member picks up the issue in their next session.
3. Members can reassign by swapping labels.
4. The `squad` label is the "inbox" — untriaged issues waiting for Mal review.

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn the tester to write test cases from requirements simultaneously.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. The Lead handles all `squad` (base label) triage.
