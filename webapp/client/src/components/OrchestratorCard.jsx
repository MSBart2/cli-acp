import React, { useState, useEffect, useRef } from "react";
import { X, Send, Network, Loader2, ChevronDown, ChevronUp } from "lucide-react";

/**
 * OrchestratorCard — a full-width, visually distinct card for the
 * orchestrator agent. Sits above the worker grid and acts as the
 * "command centre" for cross-repo operations.
 *
 * Shares most of the behaviour of AgentCard (output stream, prompt
 * input, permission handling) but with a different layout and styling
 * to make it instantly recognisable as the coordinator.
 */

const statusConfig = {
  ready: { label: "Ready", color: "bg-teal-400", textColor: "text-teal-400", pulse: false },
  busy: { label: "Synthesizing", color: "bg-amber-400", textColor: "text-amber-400", pulse: true },
  error: { label: "Error", color: "bg-red-400", textColor: "text-red-400", pulse: false },
  initializing: { label: "Initializing", color: "bg-blue-400", textColor: "text-blue-400", pulse: true },
  spawning: { label: "Spawning", color: "bg-purple-400", textColor: "text-purple-400", pulse: true },
};

const spawnSteps = ["cloning", "starting", "verifying"];

export default function OrchestratorCard({
  agent,
  onSendPrompt,
  onStop,
  onPermissionResponse,
}) {
  const [input, setInput] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const bottomRef = useRef(null);
  const status = statusConfig[agent.status] || statusConfig.initializing;

  const MAX_VISIBLE = 200;
  const visibleOutput =
    agent.output.length > MAX_VISIBLE
      ? agent.output.slice(-MAX_VISIBLE)
      : agent.output;
  const truncatedCount = agent.output.length - visibleOutput.length;

  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === "function") {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [agent.output]);

  const handleSend = () => {
    if (!input.trim() || agent.status === "busy" || agent.status === "initializing") return;
    onSendPrompt(agent.agentId, input.trim());
    setInput("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isSpawning = agent.status === "spawning";
  const currentStepIdx = spawnSteps.indexOf(agent.spawnStep);

  return (
    <div className="relative rounded-xl p-[1px] bg-gradient-to-r from-teal-500/50 via-cyan-500/50 to-teal-500/50">
      <div className="rounded-xl bg-[#0d0d14] p-5">
        {/* Header — click anywhere (except stop button) to collapse/expand */}
        <div
          className={`flex items-center gap-3 cursor-pointer ${collapsed ? "" : "mb-4"}`}
          onClick={() => setCollapsed((c) => !c)}
        >
          <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/20">
            <Network className="w-5 h-5 text-teal-400" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-100 tracking-wide uppercase">
                Orchestrator
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/25 font-medium">
                coordinator
              </span>
            </div>
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {agent.repoName}
            </p>
            {agent.repoPath && (
              <p className="text-xs text-gray-600 truncate font-mono" title={agent.repoPath}>
                {agent.repoPath}
              </p>
            )}
          </div>

          {/* Status badge + collapse toggle + stop */}
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2 h-2 rounded-full ${status.color} ${
                  status.pulse ? "animate-pulse" : ""
                }`}
              />
              <span className={`text-xs font-medium ${status.textColor}`}>
                {status.label}
              </span>
            </div>
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="p-1.5 rounded-md hover:bg-white/10 text-gray-500 hover:text-teal-400 transition-colors"
              title={collapsed ? "Expand" : "Collapse"}
            >
              {collapsed
                ? <ChevronDown className="w-4 h-4" />
                : <ChevronUp className="w-4 h-4" />
              }
            </button>
            <button
              onClick={() => onStop(agent.agentId)}
              className="p-1.5 rounded-md hover:bg-white/10 text-gray-500 hover:text-red-400 transition-colors"
              title="Stop orchestrator"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Spawning progress */}
        {!collapsed && isSpawning && (
          <div className="mb-4 flex items-center gap-4">
            {spawnSteps.map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${
                    i < currentStepIdx
                      ? "bg-teal-500 border-teal-500 text-white"
                      : i === currentStepIdx
                        ? "border-teal-400 text-teal-400 animate-pulse"
                        : "border-gray-600 text-gray-600"
                  }`}
                >
                  {i < currentStepIdx ? "✓" : i + 1}
                </div>
                <span
                  className={`text-xs capitalize ${
                    i <= currentStepIdx ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  {step}
                </span>
                {i < spawnSteps.length - 1 && (
                  <div
                    className={`w-8 h-px ${
                      i < currentStepIdx ? "bg-teal-500" : "bg-gray-700"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Output stream */}
        {!collapsed && !isSpawning && (
          <div className="bg-[#0a0a10] rounded-lg border border-white/10 mb-4 max-h-64 overflow-y-auto">
            <div className="p-4 space-y-1.5">
              {truncatedCount > 0 && (
                <p className="text-xs text-gray-600 italic">
                  ({truncatedCount} earlier entries hidden)
                </p>
              )}
              {visibleOutput.length === 0 && (
                <p className="text-sm text-gray-600 italic">
                  Waiting for broadcast results from workers…
                </p>
              )}
              {visibleOutput.map((entry, idx) => (
                <div key={idx}>
                  {entry.type === "text" && (
                    <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                      {entry.content}
                    </pre>
                  )}
                  {entry.type === "tool_call" && (
                    <div className="text-xs text-cyan-400/80 font-mono flex items-center gap-1.5">
                      <span className="text-cyan-500">⚡</span>
                      {entry.name}
                      {entry.args && (
                        <span className="text-gray-500 ml-1">
                          ({entry.args})
                        </span>
                      )}
                    </div>
                  )}
                  {entry.type === "error" && (
                    <p className="text-sm text-red-400">{entry.content}</p>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </div>
        )}

        {/* Permission banner */}
        {!collapsed && agent.pendingPermission && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <p className="text-sm text-amber-200 font-medium mb-2">
              {agent.pendingPermission.title}
            </p>
            <div className="flex gap-2 flex-wrap">
              {agent.pendingPermission.options.map((opt) => (
                <button
                  key={opt.optionId}
                  onClick={() =>
                    onPermissionResponse(agent.agentId, opt.optionId)
                  }
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    opt.kind === "allow"
                      ? "bg-green-600/80 hover:bg-green-500 text-white"
                      : opt.kind === "deny"
                        ? "bg-red-600/80 hover:bg-red-500 text-white"
                        : "bg-white/10 hover:bg-white/20 text-gray-200"
                  }`}
                >
                  {opt.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Prompt input */}
        {!collapsed && !isSpawning && (
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a prompt to the orchestrator…"
              disabled={
                agent.status === "busy" || agent.status === "initializing"
              }
              className="flex-1 bg-white/15 border border-white/25 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-400/50 disabled:opacity-40 transition-all"
            />
            <button
              onClick={handleSend}
              disabled={
                !input.trim() ||
                agent.status === "busy" ||
                agent.status === "initializing"
              }
              className="px-4 py-2.5 rounded-lg bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {agent.status === "busy" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
