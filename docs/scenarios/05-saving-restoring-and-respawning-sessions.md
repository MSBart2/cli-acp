# Scenario 5: Saving, Restoring, and Re-spawning Sessions

This scenario covers the workflow that matters once your operation spans more
than one sitting.

The main idea is simple: preserve the workspace shape and useful history even
when the live Copilot processes are gone, then decide whether you want a
read-only review or a full return to active work.

## When to use this scenario

Use this walkthrough when:

- you want to pause a multi-repo operation and come back later
- you need to review prior work without restarting every agent
- you want to recover the workspace and then selectively re-spawn agents

## What gets saved

A session snapshot preserves the parts of the operation that are most useful to
recover:

- agent roster, roles, repo metadata, and dependency manifest state
- detected work items such as issues and PRs
- broadcast history and per-worker results
- session settings such as clone directory and reuse behavior

What is not saved:

- live `copilot --acp --stdio` processes
- in-flight prompts
- streaming output that has not already been recorded in saved history

## Goal

Save a session, restore it in UI-only mode, then re-spawn only the agents you
need to continue.

## Workflow

### 1. Let autosave work, but know where manual save helps

The app autosaves when:

- agents are created or stopped
- a broadcast wave completes
- a new work item is detected

Use **Save as...** when the operation has reached a meaningful checkpoint and
you want a memorable session name.

### 2. Choose between `Restore` and `Re-spawn`

From the **Sessions** panel, each saved session gives you two options:

- **Restore**: rebuild the UI state only
- **Re-spawn**: rebuild the UI state and relaunch the saved agents

Use **Restore** when you want to review what happened, copy prompts, inspect
work items, or decide what to continue next.

Use **Re-spawn** when you are actively resuming work and want live agents again.

### 3. Understand what restored cards mean

After a restore load, agent cards appear in the UI but they are not backed by
live copilot processes. They are display state.

That is why the next decision matters:

- keep reviewing in UI-only mode
- or re-spawn the full set
- or restart only one stopped agent

### 4. Restart a single agent when that is enough

If only one repo needs more work, use the single-agent restart action rather
than re-spawning the entire session.

This is often the most efficient way to resume a documentation fix, reopen one
dependency investigation, or continue a single PR follow-up.

### 5. Trust restored dependency state, but read it fresh

On session load, the server re-reads manifests from disk before re-emitting the
graph state. That means restored dependency pills and missing-manifest warnings
reflect the current workspace more accurately than a stale snapshot alone.

Treat a restored session as a fresh hydration of saved intent plus current disk
reality.

## What success looks like

You are done when you can:

1. save a meaningful session
2. restore it without relaunching agents
3. distinguish UI-only state from live agent state
4. re-spawn all agents or restart one agent intentionally

## Common mistakes

- Assuming `Restore` restarts copilots
- Re-spawning every agent when only one repo needs work
- Forgetting that in-flight prompts are not resumed automatically

## Operator tips

- Use **Restore** for review, planning, and handoff.
- Use **Re-spawn** when you are ready to act.
- Prefer single-agent restart for narrow follow-up work.
- After a restore, scan dependency pills and warnings before resuming prompts.

## What to read next

After this scenario, go back to the scenario index in [`SCENARIO.md`](../../SCENARIO.md)
and choose the next operation-specific walkthrough.
