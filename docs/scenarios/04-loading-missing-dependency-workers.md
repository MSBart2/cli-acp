# Scenario 4: Loading Missing Dependency Workers

This scenario teaches how to recover an incomplete workspace when the app knows
about repos that are not yet loaded into the session.

It focuses on one job: turning dependency hints into a more complete and more
trustworthy working set.

## When to use this scenario

Use this walkthrough when:

- a worker card shows unloaded dependency chips
- the orchestrator card shows **Unloaded dependency neighbors detected**
- the dependency graph feels incomplete or inconsistent
- a repo is missing an `acp-manifest.json` and you need better graph context

## Setup

Start with an orchestrator and a few workers, but leave out at least one repo
that another repo references.

For example:

- loaded: `shared-auth`, `api-gateway`, `web-dashboard`
- missing: `notifications`

## Goal

Use the UI's missing-dependency affordances to load the right repos, refresh
manifest-backed context, and bring the graph closer to reality.

## Workflow

### 1. Look for the two missing-dependency surfaces

The app can surface missing neighbors in two places:

- on a worker card, as a per-repo unloaded dependency item with
  `Load as Worker`
- on the orchestrator card, as a deduplicated banner that groups unloaded
  dependency neighbors across the whole session

The orchestrator view is better for deciding what to load next globally. The
worker view is better when you are already focused on one repo's context.

### 2. Use `Load as Worker`

Click `Load as Worker` from either location.

The UI can prefill a suggested repo URL, which removes a lot of friction from
completing the graph while you are already in the middle of an operation.

### 3. Re-check the dependency pills

Once the new worker is loaded, review the dependency pills again:

- `dependsOn` shows what this repo consumes
- `dependedBy` shows what consumes this repo

Because the graph is derived bidirectionally, loading one missing repo can
improve context for several already-loaded cards.

### 4. Repair missing manifest context if needed

If a worker shows **No manifest · Create?**, treat that as a graph-quality
issue, not just a cosmetic warning.

Create or repair the manifest, then refresh the relevant context so the card
and graph can update in place.

### 5. Continue the operation only after the graph is believable

This is the whole teaching point of the scenario: it is often worth pausing to
load one or two missing repos before broadcasting more work or approving a
routing plan.

## What success looks like

You are done when:

1. missing dependency neighbors are visible in the UI
2. you can load those repos directly from the hints
3. dependency pills and graph state improve after loading
4. manifest warnings are either addressed or deliberately understood

## Common mistakes

- Ignoring unloaded dependency hints and continuing with an incomplete graph
- Assuming only `dependsOn` matters when `dependedBy` may be the only available
  declaration
- Treating missing manifest warnings as optional when they affect routing
  quality

## Operator tips

- Use the orchestrator banner when deciding what to load next across the whole
  session.
- Use the worker card action when you are already in a repo-specific debugging
  flow.
- Prefer graph completion before large broadcasts or routing approvals.

## What to read next

If your session is long-running and you want to pause without losing the
workspace structure, continue with
[`05-saving-restoring-and-respawning-sessions`](05-saving-restoring-and-respawning-sessions.md).
