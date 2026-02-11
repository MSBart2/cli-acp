import React, { useState, useEffect, useCallback, useRef } from "react";
import { io } from "socket.io-client";
import { Terminal } from "lucide-react";
import Header from "./components/Header";
import RepoInput from "./components/RepoInput";
import AgentCard from "./components/AgentCard";
import OrchestratorCard from "./components/OrchestratorCard";
import BroadcastInput from "./components/BroadcastInput";
import BroadcastResults from "./components/BroadcastResults";
import WorkItemTracker from "./components/WorkItemTracker";
import BroadcastHistory from "./components/BroadcastHistory";

const SOCKET_URL = import.meta.env.DEV ? "http://localhost:3001" : undefined;
const socket = io(SOCKET_URL);

export default function App() {
  const [agents, setAgents] = useState({});
  const [connected, setConnected] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResults, setBroadcastResults] = useState(null);
  const [broadcastProgress, setBroadcastProgress] = useState(null);
  const [workItems, setWorkItems] = useState([]);
  const [broadcastHistory, setBroadcastHistory] = useState([]);
  const [showWorkTracker, setShowWorkTracker] = useState(true);

  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    // Show a placeholder card immediately while the agent is being spawned
    socket.on("agent:spawning", (data) => {
      setAgents((prev) => {
        const existing = prev[data.agentId];
        return {
          ...prev,
          [data.agentId]: {
            agentId: data.agentId,
            repoUrl: data.repoUrl,
            repoName: data.repoName,
            role: data.role || existing?.role || "worker",
            status: "spawning",
            spawnStep: data.step,
            spawnMessage: data.message,
            output: existing?.output || [],
            pendingPermission: null,
          },
        };
      });
    });

    // Agent is fully ready — transition from spawning to ready
    socket.on("agent:created", (data) => {
      setAgents((prev) => {
        const existing = prev[data.agentId];
        return {
          ...prev,
          [data.agentId]: {
            ...existing,
            agentId: data.agentId,
            repoUrl: data.repoUrl,
            repoName: data.repoName,
            role: data.role || existing?.role || "worker",
            status: data.status || "ready",
            spawnStep: null,
            spawnMessage: null,
            pendingPermission: existing?.pendingPermission || null,
          },
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
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("agent:spawning");
      socket.off("agent:created");
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
    };
  }, []);

  const handleLaunchAgent = useCallback((repoUrl, role = "worker") => {
    socket.emit("agent:create", { repoUrl, role });
  }, []);

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

  const handlePermissionResponse = useCallback((agentId, option) => {
    socket.emit("agent:permission_response", { agentId, optionId: option });
    setAgents((prev) => {
      const agent = prev[agentId];
      if (!agent) return prev;
      return { ...prev, [agentId]: { ...agent, pendingPermission: null } };
    });
  }, []);

  /** Fan-out: send the same prompt to every ready agent at once */
  const handleBroadcastPrompt = useCallback((text, synthesisInstructions) => {
    setBroadcasting(true);
    // Clear previous results when a new broadcast starts
    setBroadcastResults(null);
    socket.emit("agent:prompt_all", { text, synthesisInstructions });

    // Optimistically mark every ready worker agent as busy
    setAgents((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        if (next[id].status === "ready" && next[id].role !== "orchestrator") {
          next[id] = { ...next[id], status: "busy" };
        }
      }
      return next;
    });
  }, []);

  const agentList = Object.values(agents);
  const orchestrator = agentList.find((a) => a.role === "orchestrator");
  const workers = agentList.filter((a) => a.role !== "orchestrator");
  const readyCount = workers.filter((a) => a.status === "ready").length;
  const hasOrchestrator = Boolean(orchestrator);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Subtle radial glow behind the page content for depth */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-purple-600/[0.07] rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[400px] bg-blue-600/[0.05] rounded-full blur-3xl" />
      </div>

      <div className="relative">
        <Header connected={connected} />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <RepoInput onLaunch={handleLaunchAgent} connected={connected} hasOrchestrator={hasOrchestrator} />

          {/* Orchestrator card — full-width, always above everything else */}
          {orchestrator && (
            <div className="mt-6">
              <OrchestratorCard
                agent={orchestrator}
                onSendPrompt={handleSendPrompt}
                onStop={handleStopAgent}
                onPermissionResponse={handlePermissionResponse}
              />
            </div>
          )}

          {/* Show the broadcast bar once there are worker agents to target */}
          {workers.length > 0 && (
            <div className="mt-6">
              <BroadcastInput
                onBroadcast={handleBroadcastPrompt}
                readyCount={readyCount}
                totalCount={workers.length}
                broadcasting={broadcasting}
                hasOrchestrator={hasOrchestrator}
                broadcastProgress={broadcastProgress}
              />
            </div>
          )}

          {/* Work item tracker — shows all detected issues and PRs */}
          {workItems.length > 0 && showWorkTracker && (
            <div className="mt-4">
              <WorkItemTracker
                items={workItems}
                onDismiss={() => setShowWorkTracker(false)}
              />
            </div>
          )}

          {/* Coalesced broadcast results — appears after a broadcast wave completes */}
          {broadcastResults && (
            <div className="mt-4">
              <BroadcastResults
                broadcastResults={broadcastResults}
                onDismiss={() => setBroadcastResults(null)}
              />
            </div>
          )}

          {/* Broadcast history — past broadcast waves */}
          {broadcastHistory.length > 0 && (
            <div className="mt-4">
              <BroadcastHistory history={broadcastHistory} />
            </div>
          )}

          {workers.length > 0 && (
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {workers.map((agent) => (
                <AgentCard
                  key={agent.agentId}
                  agent={agent}
                  onSendPrompt={handleSendPrompt}
                  onStop={handleStopAgent}
                  onPermissionResponse={handlePermissionResponse}
                />
              ))}
            </div>
          )}

          {agentList.length === 0 && (
            <div className="mt-20 text-center">
              <div className="inline-flex p-4 rounded-2xl bg-white/[0.03] border border-white/10 mb-5">
                <Terminal className="w-8 h-8 text-purple-400/60" />
              </div>
              <p className="text-lg text-gray-300 font-medium">No agents running</p>
              <p className="text-sm text-gray-500 mt-1">Enter a repository URL above to launch your first agent.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
