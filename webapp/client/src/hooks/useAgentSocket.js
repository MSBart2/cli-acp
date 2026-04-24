import { useEffect, useRef } from "react";
import { mergeAgentSnapshot } from "../agentState.js";
import { resolveAutoApproval } from "./usePermissionPreset.js";

/**
 * Wires all Socket.IO event listeners for the agent orchestrator.
 * Called once from App.jsx; manages its own cleanup via useEffect.
 *
 * @param {import('socket.io-client').Socket} socket
 * @param {{ setAgents, setConnected, setBroadcasting, setBroadcastResults,
 *           setBroadcastProgress, setWorkItems, setBroadcastHistory,
 *           setDepGraph, setUnloadedDeps, setMissionContext,
 *           setRoutingPlan, setRepoBaseDir, setReuseExisting }} setters
 * @param {{ permissionPreset?: string }} [options]
 */
export function useAgentSocket(socket, setters, options = {}) {
  const {
    setAgents,
    setConnected,
    setBroadcasting,
    setBroadcastResults,
    setBroadcastProgress,
    setWorkItems,
    setBroadcastHistory,
    setDepGraph,
    setUnloadedDeps,
    setMissionContext,
    setRoutingPlan,
    setRepoBaseDir,
    setReuseExisting,
  } = setters;

  // Keep a ref so the permission handler always reads the latest preset without
  // needing to re-register all socket handlers when the preset changes.
  const permissionPresetRef = useRef(options.permissionPreset ?? "ask");
  // Sync ref on every render (no deps array = runs after each render)
  useEffect(() => {
    permissionPresetRef.current = options.permissionPreset ?? "ask";
  });

  useEffect(() => {
    // Define all handlers as named consts so the cleanup can pass the exact
    // same reference to socket.off — preventing over-removal in React Strict Mode.

    // Merged connect handler: mark connected AND request server state
    const onConnect = () => {
      setConnected(true);
      socket.emit("workitems:list");
      socket.emit("broadcast:list_history");
      socket.emit("graph:list");
      socket.emit("mission:get");
    };

    const onDisconnect = () => setConnected(false);

    // Show a placeholder card immediately while the agent is being spawned
    const onAgentSpawning = (data) => {
      setAgents((prev) => {
        const existing = prev[data.agentId];
        return {
          ...prev,
          [data.agentId]: mergeAgentSnapshot(existing, {
            agentId: data.agentId,
            repoUrl: data.repoUrl,
            repoName: data.repoName,
            role: data.role || existing?.role || "worker",
            status: "spawning",
            spawnStep: data.step,
            spawnMessage: data.message,
          }),
        };
      });
    };

    // Agent is fully ready — transition from spawning to ready
    const onAgentCreated = (data) => {
      setAgents((prev) => {
        const existing = prev[data.agentId];
        return {
          ...prev,
          [data.agentId]: mergeAgentSnapshot(existing, {
            ...data,
            spawnStep: null,
            spawnMessage: null,
          }),
        };
      });
    };

    const onAgentSnapshot = (data) => {
      setAgents((prev) => {
        const existing = prev[data.agentId];
        return {
          ...prev,
          [data.agentId]: mergeAgentSnapshot(existing, data),
        };
      });
    };

    const onAgentUpdate = (data) => {
      setAgents((prev) => {
        const agent = prev[data.agentId];
        if (!agent) return prev;

        const updated = { ...agent };

        if (data.type === "text") {
          // Merge consecutive text chunks into one entry so streaming
          // fragments don't each get their own line in the output
          const lastEntry = agent.output[agent.output.length - 1];
          if (lastEntry?.type === "text") {
            const merged = [...agent.output];
            merged[merged.length - 1] = {
              ...lastEntry,
              content: lastEntry.content + data.content,
            };
            updated.output = merged;
          } else {
            updated.output = [
              ...agent.output,
              { type: "text", content: data.content },
            ];
          }
        } else if (data.type === "tool_call") {
          updated.output = [
            ...agent.output,
            {
              type: "tool_call",
              name: data.content?.title,
              args: data.content?.status,
            },
          ];
        } else if (data.type === "tool_call_update") {
          updated.output = [
            ...agent.output,
            {
              type: "tool_call",
              name: data.content?.toolCallId,
              args: data.content?.status,
            },
          ];
        } else if (data.type === "status") {
          updated.status = data.content;
        }

        return { ...prev, [data.agentId]: updated };
      });
    };

    const onAgentPromptComplete = (data) => {
      setAgents((prev) => {
        const agent = prev[data.agentId];
        if (!agent) return prev;
        return { ...prev, [data.agentId]: { ...agent, status: "ready" } };
      });
    };

    // Receives the context strings that were prepended to the prompt before it
    // was sent to the ACP agent — allows the user to inspect what was injected.
    const onAgentContextInjected = (data) => {
      setAgents((prev) => {
        const agent = prev[data.agentId];
        if (!agent) return prev;
        return { ...prev, [data.agentId]: { ...agent, injectedContext: data.injectedContext } };
      });
    };

    const onAgentPermissionRequest = (data) => {
      // Check if the current preset auto-approves this request
      const autoOptionId = resolveAutoApproval(
        permissionPresetRef.current,
        data.title,
        data.options,
      );
      if (autoOptionId) {
        // Auto-respond without surfacing the banner to the user
        socket.emit("agent:permission_response", {
          agentId: data.agentId,
          optionId: autoOptionId,
        });
        return;
      }
      // No auto-approval — show the permission banner on the card
      setAgents((prev) => {
        const agent = prev[data.agentId];
        if (!agent) return prev;
        return {
          ...prev,
          [data.agentId]: {
            ...agent,
            pendingPermission: {
              title: data.title,
              options: data.options,
            },
          },
        };
      });
    };

    const onAgentError = (data) => {
      if (data.agentId) {
        setAgents((prev) => {
          const agent = prev[data.agentId];
          if (!agent) return prev;
          return {
            ...prev,
            [data.agentId]: {
              ...agent,
              status: "error",
              output: [...agent.output, { type: "error", content: data.error }],
            },
          };
        });
      }
    };

    const onAgentStopped = (data) => {
      setAgents((prev) => {
        const next = { ...prev };
        delete next[data.agentId];
        return next;
      });
    };

    // Broadcast wave finished — clear the broadcasting spinner and progress
    const onAgentPromptAllComplete = () => {
      setBroadcasting(false);
      setBroadcastProgress(null);
    };

    // Coalesced results from a broadcast wave
    const onAgentBroadcastResults = (data) => {
      setBroadcastResults(data);
    };

    // Per-agent broadcast progress (X of Y completed)
    const onAgentBroadcastProgress = (data) => {
      setBroadcastProgress(data);
    };

    // Work items (issues / PRs) detected from agent output
    const onWorkitemsUpdated = (data) => {
      setWorkItems(data.items || []);
    };

    // Broadcast history
    const onBroadcastHistory = (data) => {
      setBroadcastHistory(data.history || []);
    };

    // Mission / global context sync
    const onMissionUpdated = ({ text }) => {
      setMissionContext(text ?? "");
    };

    // Dependency graph updated
    const onGraphUpdated = (graph) => {
      setDepGraph(graph);
      const unloadedByAgentId = Object.fromEntries(
        (graph.unloadedDeps || []).map((entry) => [
          entry.agentId,
          entry.missing,
        ]),
      );
      const graphNodeIds = new Set(
        (graph.nodes || []).map((node) => node.agentId),
      );
      setUnloadedDeps(unloadedByAgentId);
      setAgents((prev) => {
        const next = { ...prev };
        for (const agentId of Object.keys(next)) {
          const agent = next[agentId];
          next[agentId] = {
            ...agent,
            unloadedDeps: unloadedByAgentId[agentId] ?? [],
            manifestMissing: graphNodeIds.has(agentId)
              ? false
              : agent.manifestMissing,
          };
        }
        return next;
      });
    };

    // An agent confirmed its manifest is missing
    const onGraphManifestMissing = ({ agentId }) => {
      setAgents((prev) => {
        const agent = prev[agentId];
        if (!agent) return prev;
        return { ...prev, [agentId]: { ...agent, manifestMissing: true } };
      });
    };

    // Unloaded dep notification for an agent
    const onGraphUnloadedDeps = ({ agentId, unloaded }) => {
      setUnloadedDeps((prev) => ({ ...prev, [agentId]: unloaded }));
      setAgents((prev) => {
        const agent = prev[agentId];
        if (!agent) return prev;
        return { ...prev, [agentId]: { ...agent, unloadedDeps: unloaded } };
      });
    };

    // Graph inconsistency warnings
    const onGraphInconsistency = ({ warnings }) => {
      setDepGraph((prev) =>
        prev
          ? { ...prev, warnings: [...(prev.warnings || []), ...warnings] }
          : null,
      );
    };

    const onSessionLoaded = ({ settings }) => {
      if (
        typeof settings?.repoBaseDir === "string" &&
        settings.repoBaseDir.trim()
      ) {
        setRepoBaseDir(settings.repoBaseDir);
      }
      if (typeof settings?.reuseExisting === "boolean") {
        setReuseExisting(settings.reuseExisting);
      }
      // Session load restores cards, history, and work items separately.
      // Clear transient panels that are not part of the saved snapshot.
      setBroadcastResults(null);
      setBroadcastProgress(null);
      setRoutingPlan(null);
      // Ask the server to re-emit the current graph-backed snapshots.
      // This makes restore resilient even if the initial agent:created hydration
      // wave was missed by the browser for any reason.
      socket.emit("graph:list");
    };

    const onOrchestratorRoutingPlan = (data) => {
      setRoutingPlan(data);
    };

    // Impact checking state for downstream workers
    const onAgentImpactChecking = ({ downstreamRepoNames, checking }) => {
      setAgents((prev) => {
        const next = { ...prev };
        for (const id of Object.keys(next)) {
          if (downstreamRepoNames.includes(next[id].repoName)) {
            next[id] = { ...next[id], impactChecking: checking };
          }
        }
        return next;
      });
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("agent:spawning", onAgentSpawning);
    socket.on("agent:created", onAgentCreated);
    socket.on("agent:snapshot", onAgentSnapshot);
    socket.on("agent:update", onAgentUpdate);
    socket.on("agent:prompt_complete", onAgentPromptComplete);
    socket.on("agent:context_injected", onAgentContextInjected);
    socket.on("agent:permission_request", onAgentPermissionRequest);
    socket.on("agent:error", onAgentError);
    socket.on("agent:stopped", onAgentStopped);
    socket.on("agent:prompt_all_complete", onAgentPromptAllComplete);
    socket.on("agent:broadcast_results", onAgentBroadcastResults);
    socket.on("agent:broadcast_progress", onAgentBroadcastProgress);
    socket.on("workitems:updated", onWorkitemsUpdated);
    socket.on("broadcast:history", onBroadcastHistory);
    socket.on("mission:updated", onMissionUpdated);
    socket.on("graph:updated", onGraphUpdated);
    socket.on("graph:manifest_missing", onGraphManifestMissing);
    socket.on("graph:unloaded_deps", onGraphUnloadedDeps);
    socket.on("graph:inconsistency", onGraphInconsistency);
    socket.on("session:loaded", onSessionLoaded);
    socket.on("orchestrator:routing_plan", onOrchestratorRoutingPlan);
    socket.on("agent:impact_checking", onAgentImpactChecking);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("agent:spawning", onAgentSpawning);
      socket.off("agent:created", onAgentCreated);
      socket.off("agent:snapshot", onAgentSnapshot);
      socket.off("agent:update", onAgentUpdate);
      socket.off("agent:prompt_complete", onAgentPromptComplete);
      socket.off("agent:context_injected", onAgentContextInjected);
      socket.off("agent:permission_request", onAgentPermissionRequest);
      socket.off("agent:error", onAgentError);
      socket.off("agent:stopped", onAgentStopped);
      socket.off("agent:prompt_all_complete", onAgentPromptAllComplete);
      socket.off("agent:broadcast_results", onAgentBroadcastResults);
      socket.off("agent:broadcast_progress", onAgentBroadcastProgress);
      socket.off("workitems:updated", onWorkitemsUpdated);
      socket.off("broadcast:history", onBroadcastHistory);
      socket.off("mission:updated", onMissionUpdated);
      socket.off("graph:updated", onGraphUpdated);
      socket.off("graph:manifest_missing", onGraphManifestMissing);
      socket.off("graph:unloaded_deps", onGraphUnloadedDeps);
      socket.off("graph:inconsistency", onGraphInconsistency);
      socket.off("session:loaded", onSessionLoaded);
      socket.off("orchestrator:routing_plan", onOrchestratorRoutingPlan);
      socket.off("agent:impact_checking", onAgentImpactChecking);
    };
  }, []);
}
