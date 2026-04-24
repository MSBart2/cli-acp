import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { io } from "socket.io-client";
import { Terminal } from "lucide-react";
import { Toaster } from "react-hot-toast";
import Header from "./components/Header";
import RepoInput from "./components/RepoInput";
import AgentCard from "./components/AgentCard";
import OrchestratorCard from "./components/OrchestratorCard";
import OrchestratorInput from "./components/OrchestratorInput";
import BroadcastInput from "./components/BroadcastInput";
import BroadcastResults from "./components/BroadcastResults";
import WorkItemTracker from "./components/WorkItemTracker";
import BroadcastHistory from "./components/BroadcastHistory";
import DependencyGraph from "./components/DependencyGraph";
import MissionContext from "./components/MissionContext";
import RoutingPlanPanel from "./components/RoutingPlanPanel";
import { useNotifications } from "./hooks/useNotifications";
import { useAgentSocket } from "./hooks/useAgentSocket.js";
import { usePermissionPreset } from "./hooks/usePermissionPreset.js";
import { buildOrchestratorUnloadedDeps } from "./dependencySuggestions";

const SOCKET_URL = import.meta.env.DEV ? "http://localhost:3001" : undefined;
const socket = io(SOCKET_URL);

export default function App() {
  const [agents, setAgents] = useState({});
  const [connected, setConnected] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResults, setBroadcastResults] = useState(null);
  // Default to the env-var override, or empty string so the server uses its own
  // OS-appropriate default (REPO_BASE_DIR, resolved to /tmp/acp-repos on Linux).
  const [repoBaseDir, setRepoBaseDir] = useState(
    import.meta.env.VITE_REPO_BASE_DIR ?? "",
  );
  const [reuseExisting, setReuseExisting] = useState(true);
  const [broadcastProgress, setBroadcastProgress] = useState(null);
  const [workItems, setWorkItems] = useState([]);
  const [broadcastHistory, setBroadcastHistory] = useState([]);
  const [showWorkTracker, setShowWorkTracker] = useState(true);
  const [depGraph, setDepGraph] = useState(null);
  const [unloadedDeps, setUnloadedDeps] = useState({});
  const [missionContext, setMissionContext] = useState("");
  const [routingPlan, setRoutingPlan] = useState(null);
  // Ensures env-default repos are launched at most once per page load
  const hasAutoLaunchedRef = useRef(false);
  // Keep refs in sync so the config:defaults closure always sees current values
  const repoBseDirRef = useRef(repoBaseDir);
  const reuseExistingRef = useRef(reuseExisting);

  repoBseDirRef.current = repoBaseDir;
  reuseExistingRef.current = reuseExisting;

  // Toast + browser notifications wired to socket events
  const {
    requestBrowserPermission,
    browserPermission,
    soundEnabled,
    toggleSoundEnabled,
  } = useNotifications(socket);

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
            updated.output = [...agent.output, { type: "text", content: data.content }];
          }
        } else if (data.type === "tool_call") {
          updated.output = [
            ...agent.output,
            { type: "tool_call", name: data.content?.title, args: data.content?.status },
          ];
        } else if (data.type === "tool_call_update") {
          updated.output = [
            ...agent.output,
            { type: "tool_call", name: data.content?.toolCallId, args: data.content?.status },
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
              output: [
                ...agent.output,
                { type: "error", content: data.error },
              ],
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
        (graph.unloadedDeps || []).map((entry) => [entry.agentId, entry.missing]),
      );
      const graphNodeIds = new Set((graph.nodes || []).map((node) => node.agentId));
      setUnloadedDeps(unloadedByAgentId);
      setAgents((prev) => {
        const next = { ...prev };
        for (const agentId of Object.keys(next)) {
          const agent = next[agentId];
          next[agentId] = {
            ...agent,
            unloadedDeps: unloadedByAgentId[agentId] ?? [],
            manifestMissing: graphNodeIds.has(agentId) ? false : agent.manifestMissing,
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
      setDepGraph((prev) => prev ? { ...prev, warnings: [...(prev.warnings || []), ...warnings] } : null);
    });

    socket.on("session:loaded", ({ settings }) => {
      if (typeof settings?.repoBaseDir === "string" && settings.repoBaseDir.trim()) {
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

    // Auto-launch env-configured repos on first connect
    socket.on("config:defaults", ({ orchestratorUrl, workerUrls, model }) => {
      if (hasAutoLaunchedRef.current) return;
      hasAutoLaunchedRef.current = true;
      if (orchestratorUrl) {
        socket.emit("agent:create", { repoUrl: orchestratorUrl, role: "orchestrator", repoBaseDir: repoBseDirRef.current, reuseExisting: reuseExistingRef.current, model: model || undefined });
      }
      for (const url of workerUrls || []) {
        socket.emit("agent:create", { repoUrl: url, role: "worker", repoBaseDir: repoBseDirRef.current, reuseExisting: reuseExistingRef.current, model: model || undefined });
      }
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
      socket.off("config:defaults");
    };
  }, []);

  const handleLaunchAgent = useCallback((repoUrl, role = "worker", model) => {
    socket.emit("agent:create", {
      repoUrl,
      role,
      repoBaseDir,
      reuseExisting,
      model,
    });
  }, [repoBaseDir, reuseExisting]);

  const handleSendPrompt = useCallback((agentId, text) => {
    socket.emit("agent:prompt", { agentId, text });
    setAgents((prev) => {
      const agent = prev[agentId];
      if (!agent) return prev;
      return { ...prev, [agentId]: { ...agent, status: "busy" } };
    });
  }, []);

  const handleStopAgent = useCallback((agentId) => {
    socket.emit("agent:stop", { agentId });
  }, []);

  const handleRestartAgent = useCallback((agentId) => {
    socket.emit("agent:restart", { agentId });
  }, []);

  const handlePermissionResponse = useCallback((agentId, option) => {
    socket.emit("agent:permission_response", { agentId, optionId: option });
    setAgents((prev) => {
      const agent = prev[agentId];
      if (!agent) return prev;
      return { ...prev, [agentId]: { ...agent, pendingPermission: null } };
    });
  }, []);

  const handleCreateManifest = useCallback((agentId) => {
    socket.emit("orchestrator:create_manifest", { agentId });
  }, []);

  const handleLoadWorker = useCallback(
    (url) => {
      if (url) handleLaunchAgent(url, "worker");
    },
    [handleLaunchAgent],
  );

  const handleRefreshGraph = useCallback(() => {
    socket.emit("graph:list");
  }, []);

  const handleApproveRoutingPlan = useCallback((planId, routes) => {
    socket.emit("orchestrator:approve_routing_plan", { planId, routes });
    setRoutingPlan(null);
  }, []);

  const handleCancelRoutingPlan = useCallback((planId) => {
    socket.emit("orchestrator:cancel_routing_plan", { planId });
    setRoutingPlan(null);
  }, []);

  const handleMissionChange = useCallback((text) => {
    setMissionContext(text);
    socket.emit("mission:set", { text });
  }, []);

  /** Fan-out: send the same prompt to every ready agent at once, or only to @mentioned ones */
  const handleBroadcastPrompt =
    useCallback((text, synthesisInstructions, targetRepoNames) => {
      setBroadcasting(true);
      // Clear previous results when a new broadcast starts
      setBroadcastResults(null);
      socket.emit("agent:prompt_all", {
        text,
        synthesisInstructions,
        targetRepoNames,
      });

      // Optimistically mark targeted (or all, if no targeting) ready workers as busy
      const targetSet = targetRepoNames?.length
        ? new Set(targetRepoNames.map((n) => n.toLowerCase()))
        : null;
      setAgents((prev) => {
        const next = { ...prev };
        for (const id of Object.keys(next)) {
          const a = next[id];
          if (
            a.status === "ready" &&
            a.role !== "orchestrator" &&
            (!targetSet || targetSet.has(a.repoName.toLowerCase()))
          ) {
            next[id] = { ...a, status: "busy" };
          }
        }
        return next;
      });
    }, []);

  /** Retry the failed agents from the last broadcast wave */
  const handleRetryFailed = useCallback(() => {
    setBroadcasting(true);
    socket.emit("agent:prompt_retry_failed");
  }, []);

  const agentList = Object.values(agents);
  const orchestrator = agentList.find((a) => a.role === "orchestrator");
  const workers = agentList.filter((a) => a.role !== "orchestrator");
  const orchestratorUnloadedDeps = useMemo(
    () => buildOrchestratorUnloadedDeps(workers),
    [workers],
  );
  const workerRepoNames = workers.map((a) => a.repoName);
  const readyCount = workers.filter((a) => a.status === "ready").length;
  const busyCount = workers.filter((a) => a.status === "busy").length;
  const errorCount = workers.filter((a) => a.status === "error").length;
  const spawningCount = workers.filter((a) =>
    ["spawning", "initializing"].includes(a.status),
  ).length;
  const hasOrchestrator = Boolean(orchestrator);
  const showWorkerSection =
    workers.length > 0 ||
    (orchestrator &&
      !["spawning", "initializing"].includes(orchestrator.status));

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Toast notifications — top-right corner, dark theme */}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "rgba(15,15,25,0.95)",
            color: "#e2e8f0",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(12px)",
            fontSize: "0.8125rem",
          },
          success: { iconTheme: { primary: "#a78bfa", secondary: "#0f0f19" } },
          error: { iconTheme: { primary: "#f87171", secondary: "#0f0f19" } },
        }}
      />
      {/* Subtle radial glow behind the page content for depth */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-purple-600/[0.07] rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[400px] bg-blue-600/[0.05] rounded-full blur-3xl" />
      </div>

      <div className="relative">
        <Header
          connected={connected}
          repoBaseDir={repoBaseDir}
          onRepoBashDirChange={setRepoBaseDir}
          reuseExisting={reuseExisting}
          onReuseExistingChange={setReuseExisting}
          socket={socket}
          browserPermission={browserPermission}
          onRequestBrowserPermission={requestBrowserPermission}
          soundEnabled={soundEnabled}
          onToggleSoundEnabled={toggleSoundEnabled}
          permissionPreset={permissionPreset}
          onPermissionPresetChange={setPermissionPreset}
        />

        <main className="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <MissionContext value={missionContext} onChange={handleMissionChange} />
          {/* ── Orchestrator section ── always first */}
          {!orchestrator && (
            <OrchestratorInput
              onLaunch={handleLaunchAgent}
              connected={connected}
            />
          )}
          {orchestrator && (
            <OrchestratorCard
              agent={orchestrator}
              unloadedDependencies={orchestratorUnloadedDeps}
              onSendPrompt={handleSendPrompt}
              onStop={handleStopAgent}
              onRestart={handleRestartAgent}
              onPermissionResponse={handlePermissionResponse}
              onLoadWorker={handleLoadWorker}
            />
          )}

          <DependencyGraph graph={depGraph} onRefresh={handleRefreshGraph} />
          <RoutingPlanPanel
            plan={routingPlan}
            onApprove={handleApproveRoutingPlan}
            onCancel={handleCancelRoutingPlan}
          />

          {/* ── Worker section — available for restored worker-only sessions too ── */}
          {showWorkerSection && (
            <div className="space-y-6">
              {/* Broadcast bar — only when there are workers to target */}
              {workers.length > 0 && (
                <BroadcastInput
                  onBroadcast={handleBroadcastPrompt}
                  readyCount={readyCount}
                  totalCount={workers.length}
                  busyCount={busyCount}
                  errorCount={errorCount}
                  spawningCount={spawningCount}
                  broadcasting={broadcasting}
                  hasOrchestrator={hasOrchestrator}
                  workerRepoNames={workerRepoNames}
                />
              )}

              {/* Worker grid — RepoInput always appears as the last card */}
              <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
                {workers.map((agent) => (
                  <AgentCard
                    key={agent.agentId}
                    agent={agent}
                    onSendPrompt={handleSendPrompt}
                    onStop={handleStopAgent}
                    onRestart={handleRestartAgent}
                    onPermissionResponse={handlePermissionResponse}
                    onCreateManifest={handleCreateManifest}
                    onLoadWorker={handleLoadWorker}
                  />
                ))}
                <RepoInput onLaunch={handleLaunchAgent} connected={connected} />
              </div>

              {/* Broadcast results — below all worker cards */}
              {broadcastResults && (
                <BroadcastResults
                  broadcastResults={broadcastResults}
                  onDismiss={() => setBroadcastResults(null)}
                  onRetryFailed={handleRetryFailed}
                />
              )}
            </div>
          )}

          {showWorkTracker && (
            <WorkItemTracker
              items={workItems}
              onDismiss={() => setShowWorkTracker(false)}
            />
          )}

          <BroadcastHistory history={broadcastHistory} />

          {/* Empty state — no agents at all */}
          {agentList.length === 0 && (
            <div className="mt-16 text-center">
              <div className="inline-flex p-4 rounded-2xl bg-white/[0.03] border border-white/10 mb-5">
                <Terminal className="w-8 h-8 text-purple-400/60" />
              </div>
              <p className="text-lg text-gray-300 font-medium">
                No agents running
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Enter an orchestrator repo URL above to get started.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
