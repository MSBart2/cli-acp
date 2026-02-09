import React, { useState, useEffect, useCallback, useRef } from "react";
import { io } from "socket.io-client";
import Header from "./components/Header";
import RepoInput from "./components/RepoInput";
import AgentCard from "./components/AgentCard";

const socket = io("http://localhost:3001");

export default function App() {
  const [agents, setAgents] = useState({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("agent:created", (data) => {
      setAgents((prev) => ({
        ...prev,
        [data.agentId]: {
          agentId: data.agentId,
          repoUrl: data.repoUrl,
          repoName: data.repoName,
          status: data.status || "ready",
          output: [],
          pendingPermission: null,
        },
      }));
    });

    socket.on("agent:update", (data) => {
      setAgents((prev) => {
        const agent = prev[data.agentId];
        if (!agent) return prev;

        const updated = { ...agent };

        if (data.type === "text") {
          updated.output = [...agent.output, { type: "text", content: data.content }];
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

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("agent:created");
      socket.off("agent:update");
      socket.off("agent:prompt_complete");
      socket.off("agent:permission_request");
      socket.off("agent:error");
      socket.off("agent:stopped");
    };
  }, []);

  const handleLaunchAgent = useCallback((repoUrl) => {
    socket.emit("agent:create", { repoUrl });
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

  const agentList = Object.values(agents);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Header connected={connected} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <RepoInput onLaunch={handleLaunchAgent} connected={connected} />

        {agentList.length > 0 && (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {agentList.map((agent) => (
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
          <div className="mt-16 text-center text-gray-500">
            <p className="text-lg">No agents running.</p>
            <p className="text-sm mt-1">Enter a repository URL above to launch your first agent.</p>
          </div>
        )}
      </main>
    </div>
  );
}
