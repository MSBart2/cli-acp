# Next Steps — Remaining Tier 2 Features

Priority scale: `P1` = do next, `P2` = important follow-up, `P3` = valuable polish

Criticality scale: `Critical` = core workflow/correctness gap, `High` = strong product value, `Medium` = meaningful UX improvement, `Low` = convenience/polish

## 1. Rich Markdown + Diff Output Viewer
- [P3][Medium] Render agent output with `react-markdown` (headers, code blocks, bold/italic)
- [P2][High] Syntax-highlighted diff blocks for code changes
- [P3][Medium] Fullscreen modal / expand button on AgentCard and OrchestratorCard output panels
- [P3][Low] Optional: copy-to-clipboard button on code blocks

## 2. Active Markdown in Orchestrator Output
- [P2][High] Parse the orchestrator's output for actionable links (e.g., `[Prompt workers: ...]`)
- [P2][High] Render them as clickable buttons that pre-fill the BroadcastInput
- [P2][High] Enable one-click execution of the orchestrator's recommended next steps

## 3. Work-Item Lifecycle Dashboard
- [P3][Medium] Poll GitHub API for open/merged/closed status of detected PRs and issues
- [P3][Medium] Display status badges (open 🟢 / merged 🟣 / closed 🔴) on WorkItemTracker cards
- [P3][Low] Auto-refresh on a configurable interval

## 4. Workflow Playbooks
- [P3][High] JSON template format defining multi-phase orchestration sequences
- [P3][High] UI to load a playbook, review its steps, and execute phase-by-phase
- [P3][Medium] Example playbook: cross-repo doc audit → dependency check → PR creation
- [P3][Low] Store playbooks in `~/.acp-orchestrator/playbooks/` (similar to session storage)

## 5. Cross-Repo Dependency Awareness Follow-Through

Status: all currently tracked follow-through items are complete.

Recommended implementation order:
1. `plan-p1-manifest-client-hydration.md`
2. `plan-p1-manifest-reparse-graph-update.md`
3. `plan-p1-bidirectional-cross-repo-context.md`
4. `plan-p1-cross-population-reparse.md`
5. `plan-p1-cascade-routing-approval.md`
6. `plan-p1-cascade-chained-followups.md`
7. `plan-p1-broadcast-cascade-parity.md`
8. `plan-p1-dependency-integration-tests.md`

- [Done][P1][High] Push manifest metadata into client agent state on `agent:created` / session restore so dependency pills render immediately on cards ([plan](./plan-p1-manifest-client-hydration.md))
- [Done][P1][Critical] Re-parse manifests and rebuild `graph:updated` after manifest creation, manifest sync prompts, and any graph refresh action ([plan](./plan-p1-manifest-reparse-graph-update.md))
- [Done][P2][High] Make `DependencyGraph` refresh re-run manifest verification across loaded workers instead of only rebuilding from cached server state
- [Done][P1][Critical] Complete the cascade-routing flow: parse orchestrator output with `parseRoutingPlan()`, emit `orchestrator:routing_plan`, show approval/edit UI, and only send downstream prompts after approval ([plan](./plan-p1-cascade-routing-approval.md))
- [Done][P1][Critical] Capture cascade results end-to-end so follow-up prompts can chain from repo to repo instead of stopping after the first impact check ([plan](./plan-p1-cascade-chained-followups.md))
- [Done][P2][Medium] Notify the orchestrator about unloaded dependency neighbors and support suggested/pre-filled URLs for “Load as Worker”
- [Done][P1][High] Use both `dependsOn` and `dependedBy` when deriving injected cross-repo prompt context so explicit reverse-only manifests are respected ([plan](./plan-p1-bidirectional-cross-repo-context.md))
- [Done][P2][High] Make create-manifest generate useful initial dependency data where possible instead of always writing empty `dependsOn` / `dependedBy` arrays
- [Done][P2][Medium] Re-verify and re-emit `graph:manifest_missing` / unloaded-dependency state on reconnect, refresh, and session load so UI stays consistent
- [Done][P2][Medium] Clear stale client dependency-state flags when manifests load successfully or previously-missing repos are later added
- [Done][P1][High] Re-parse manifests after server-driven `dependedBy` cross-population prompts so graph edges and pills reflect the synced file contents ([plan](./plan-p1-cross-population-reparse.md))
- [Done][P1][High] Ensure broadcast-driven worker prompts participate in the same cascade-analysis path as single-agent prompts ([plan](./plan-p1-broadcast-cascade-parity.md))
- [Done][P1][High] Add integration-style tests for manifest verification → graph update, manifest creation → graph refresh, reverse-sync reconciliation, restore hydration, broadcast cascade behavior, and cascade approval → targeted downstream prompts ([plan](./plan-p1-dependency-integration-tests.md))
