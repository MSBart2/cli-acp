# Scenario 1: First Broadcast and Synthesis

This is the fastest way to understand the ACP Agent Orchestrator's core loop.

You will launch one orchestrator, launch a few workers, send a broadcast
prompt, and watch the orchestrator synthesize the combined worker output.

## When to use this scenario

Use this walkthrough when you are new to the tool or when you want a clean
demo that highlights the orchestrator + worker model without introducing issue
tracking or dependency-aware cascades yet.

## Setup

Use one coordination repo plus two or three worker repos:

- Orchestrator repo: `myorg/cross-repo-ops`
- Worker repos: `api-gateway`, `billing-service`, `web-dashboard`

The repos do not need to be related for this first scenario. You just need a
small set of repos where the same question makes sense everywhere.

## Goal

Answer the same cross-repo question everywhere, then have the orchestrator turn
the worker responses into one useful summary.

## Workflow

### 1. Launch the orchestrator first

Enter the coordination repo URL and launch it as the orchestrator.

Why first? Because the orchestrator is where synthesis lands. If you start with
workers only, the tool can still collect results, but you miss the most useful
part of the flow: an agent that turns many outputs into one operator-facing
answer.

### 2. Launch the workers

Launch each target repository as a worker. Wait until all cards show
**Ready**.

### 3. Send a simple broadcast prompt

Start with a prompt that every repo can answer without making changes:

```text
Summarize this repository for a new engineer.

Return:
1. One-sentence purpose
2. Main technologies
3. How to run it locally
4. The biggest unknown or risk you found
```

### 4. Add Orchestrator Focus for this broadcast

If the orchestrator is running, open the **Orchestrator Focus** section and add
something specific:

```text
Combine the worker summaries into a comparison table. Call out shared setup
gaps, major differences in stack, and the top 3 follow-up questions an operator
should answer next.
```

This is a key habit: the broadcast prompt tells workers what to do in their own
repos, while **Orchestrator Focus** tells the orchestrator what to do with the
combined results for this wave.

### 5. Watch the two output surfaces

You should now see:

- each worker streaming its own answer in its card
- the `Broadcast Results` panel filling with coalesced output
- the orchestrator card switching into synthesis work after the worker wave
  completes

### 6. Send one targeted follow-up

After synthesis, pick one worker and send a direct prompt such as:

```text
Expand the local setup section with exact prerequisites and environment
variables. Keep the rest of your prior analysis intact.
```

This teaches the most important control choice in the product:

- **Broadcast** when you want the same job run everywhere
- **Target a worker** when only one repo needs adjustment

## What success looks like

You are done when you can:

1. launch an orchestrator and multiple workers
2. send one broadcast prompt
3. see the `Broadcast Results` panel after the workers finish
4. see the orchestrator automatically synthesize the wave
5. send a targeted follow-up to only one worker

## Common mistakes

- Launching workers but forgetting to start the orchestrator
- Putting repo-specific instructions into the broadcast when only one worker
  needs them
- Forgetting to use Orchestrator Focus, then expecting the orchestrator to
  produce a very specific artifact

## Operator tips

- Keep the first broadcast read-only. It is the safest way to learn the UI.
- Make the worker prompt uniform and the Orchestrator Focus opinionated.
- Read the orchestrator output as the summary, then use worker cards for detail.

## What to read next

Move to [`02-documentation-audit-with-issues-and-prs`](02-documentation-audit-with-issues-and-prs.md)
for the full end-to-end coordination workflow.
