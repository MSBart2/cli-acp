import { useEffect } from "react";
import { mergeAgentSnapshot } from "../agentState.js";

/**
 * Wires all Socket.IO event listeners for the agent orchestrator.
 * Called once from App.jsx; manages its own cleanup via useEffect.
 *
 * @param {import('socket.io-client').Socket} socket
 * @param {{ setAgents, setConnected, setBroadcasting, setBroadcastResults,
 *           setBroadcastProgress, setWorkItems, setBroadcastHistory,
 *           setDepGraph, setUnloadedDeps, setMissionContext,
 *           setRoutingPlan, setRepoBaseDir, setReuseExisting }} setters
 */
export function useAgentSocket(socket, setters) {
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

  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    // Show a placeholder card immediately while the agent is being spawned
    socket.on("agent:spawning", (data) => {
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
    });

    // Agent is fully ready — transition from spawning to ready
    socket.on("agent:created", (data) => {
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
    });

    socket.on("agent:snapshot", (data) => {
      setAgents((prev) => {
        const existing = prev[data.agentId];
        return {
          ...prev,
          [data.agentId]: mergeAgentSnapshot(existing, data),
        };
      });
    });

    socket.on("agent:update", (data) => {
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
    });

    socket.on("agent:prompt_complete", (data) => {
      setAgents((prev) => {
        const agent = prev[data.agentId];
        if (!agent) return prev;
        return { ...prev, [data.agentId]: { ...agent, status: "ready" } };
      });
    });

    socket.on("agent:permission_request", (data) => {
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
    });

    socket.on("agent:error", (data) => {
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
    });

    socket.on("agent:stopped", (data) => {
      setAgents((prev) => {
        const next = { ...prev };
        delete next[data.agentId];
        return next;
      });
    });

    // Broadcast wave finished — clear the broadcasting spinner and progress
    socket.on("agent:prompt_all_complete", () => {
      setBroadcasting(false);
      setBroadcastProgress(null);
    });

    // Coalesced results from a broadcast wave
    socket.on("agent:broadcast_results", (data) => {
      setBroadcastResults(data);
    });

    // Per-agent broadcast progress (X of Y completed)
    socket.on("agent:broadcast_progress", (data) => {
      setBroadcastProgress(data);
    });

    // Work items (issues / PRs) detected from agent output
    socket.on("workitems:updated", (data) => {
      setWorkItems(data.items || []);
    });

    // Broadcast history
    socket.on("broadcast:history", (data) => {
      setBroadcastHistory(data.history || []);
    });

    // Request existing state from the server on (re)connect
    socket.on("connect", () => {
      socket.emit("workitems:list");
      socket.emit("broadcast:list_history");
      socket.emit("graph:list");
      socket.emit("mission:get");
    });

    // Mission / global context sync
    socket.on("mission:updated", ({ text }) => {
      setMissionContext(text ?? "");
    });

    // Dependency graph updated
    socket.on("graph:updated", (graph) => {
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
    });

    // An agent confirmed its manifest is missing
    socket.on("graph:manifest_missing", ({ agentId }) => {
      setAgents((prev) => {
        const agent = prev[agentId];
        if (!agent) return prev;
        return { ...prev, [agentId]: { ...agent, manifestMissing: true } };
      });
    });

    // Unloaded dep notification for an agent
    socket.on("graph:unloaded_deps", ({ agentId, unloaded }) => {
      setUnloadedDeps((prev) => ({ ...prev, [agentId]: unloaded }));
      setAgents((prev) => {
        const agent = prev[agentId];
        if (!agent) return prev;
        return { ...prev, [agentId]: { ...agent, unloadedDeps: unloaded } };
      });
    });

    // Graph inconsistency warnings
    socket.on("graph:inconsistency", ({ warnings }) => {
      setDepGraph((prev) =>
        prev
          ? { ...prev, warnings: [...(prev.warnings || []), ...warnings] }
          : null,
      );
    });

    socket.on("session:loaded", ({ settings }) => {
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
    });

    socket.on("orchestrator:routing_plan", (data) => {
      setRoutingPlan(data);
    });

    // Impact checking state for downstream workers
    socket.on("agent:impact_checking", ({ downstreamRepoNames, checking }) => {
      setAgents((prev) => {
        const next = { ...prev };
        for (const id of Object.keys(next)) {
          if (downstreamRepoNames.includes(next[id].repoName)) {
            next[id] = { ...next[id], impactChecking: checking };
          }
        }
        return next;
      });
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("agent:spawning");
      socket.off("agent:created");
      socket.off("agent:snapshot");
      socket.off("agent:update");
      socket.off("agent:prompt_complete");
      socket.off("agent:permission_request");
      socket.off("agent:error");
      socket.off("agent:stopped");
      socket.off("agent:prompt_all_complete");
      socket.off("agent:broadcast_results");
      socket.off("agent:broadcast_progress");
      socket.off("workitems:updated");
      socket.off("broadcast:history");
      socket.off("graph:updated");
      socket.off("graph:manifest_missing");
      socket.off("graph:unloaded_deps");
      socket.off("graph:inconsistency");
      socket.off("orchestrator:routing_plan");
      socket.off("agent:impact_checking");
      socket.off("mission:updated");
      socket.off("session:loaded");
    };
  }, []);
}
