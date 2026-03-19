# Scenario 3: Dependency-Aware Routing and Cascades

This scenario shows how to use the tool effectively when one repo's change can
force follow-up work in other repos.

It is the best walkthrough for the orchestrator's newest coordination features:
dependency-aware prompt context, routing-plan approval, and cascade follow-up
across the graph.

## When to use this scenario

Use this walkthrough when:

- a shared library or schema changes
- one repo's output may require downstream updates
- you want the orchestrator to propose repo-specific follow-up prompts before
  anything is sent

## Setup

Use a small dependency chain such as:

| Repo | Role |
| --- | --- |
| `shared-auth` | starting point for the change |
| `api-gateway` | consumes the shared contract |
| `web-dashboard` | depends on the API |
| `notifications` | downstream service that may not be loaded yet |

The relationship data can come from either direction:

- `dependsOn`
- `dependedBy`

That matters because the tool derives graph context from both, so reverse-only
manifest declarations still inform routing and cascades.

## Goal

Make one upstream change, review the orchestrator's proposed downstream plan,
and approve only the repo-specific prompts that should actually run.

## Workflow

### 1. Load the repos that define the known graph

Launch the orchestrator and the repos you already know are involved.

If dependency pills appear on worker cards, review them before starting. They
are your quick read of the graph from the operator's point of view.

### 2. Start with one upstream prompt

Send a targeted prompt to the upstream repo:

```text
Add a `deprecated: boolean` field to the shared customer contract. Update the
contract definition, any related docs, and summarize possible downstream impact
in your response.
```

### 3. Let the orchestrator analyze downstream impact

When the worker finishes, the orchestrator may detect downstream impact and
raise a **Routing Plan Approval** panel.

This is the main habit to learn:

- do not blindly approve the plan
- read the repo-specific prompts
- tighten each one so the request matches that repo's job

Example edits:

- `api-gateway`: focus on DTOs, validation, and OpenAPI
- `web-dashboard`: focus on UI handling and copy
- `notifications`: focus on background jobs or event payloads

### 4. Approve the routing plan

Approve only the routes you actually want to send.

The orchestrator then fans those prompts out and can continue the same cascade
workflow if a downstream repo reports further impact.

That is the important newer behavior: cascades are not limited to a single hop,
and the same routing logic can be reused after both direct prompts and
broadcasts.

### 5. Use broadcast when the first step is discovery, not implementation

Sometimes you do not yet know which downstream repos need work. In that case,
start with a broadcast:

```text
Assess whether the proposed `deprecated: boolean` field on the customer
contract affects this repository. If yes, explain exactly what would need to
change. If no, say why not.
```

Then let the orchestrator synthesize the results and continue with reviewed
route-specific prompts.

## What success looks like

You are done when you can:

1. start a change in one repo
2. see the orchestrator propose a routing plan
3. edit or trim the repo-specific prompts
4. approve downstream routing deliberately
5. watch the cascade continue only where impact is real

## Common mistakes

- Treating dependency pills as decoration instead of pre-flight signal
- Approving a routing plan without tailoring prompts per repo
- Broadcasting implementation work before you know which downstream repos are
  actually affected

## Operator tips

- Use a targeted upstream prompt when the impact source is clear.
- Use a broadcast first when the impact set is unclear.
- Expect graph-derived context even when only `dependedBy` is declared.
- Treat the routing plan as a review gate, not an automatic conveyor belt.

## What to read next

If the routing plan reveals repos that are referenced but not currently loaded,
continue with
[`04-loading-missing-dependency-workers`](04-loading-missing-dependency-workers.md).
