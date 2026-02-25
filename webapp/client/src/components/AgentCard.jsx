import React, { useState, useEffect, useRef } from "react";
import { X, Send, Terminal, GitBranch, Loader2 } from "lucide-react";

const statusConfig = {
  ready: { label: "Ready", color: "bg-green-400", textColor: "text-green-400", pulse: false },
  busy: { label: "Busy", color: "bg-amber-400", textColor: "text-amber-400", pulse: true },
  error: { label: "Error", color: "bg-red-400", textColor: "text-red-400", pulse: false },
  initializing: { label: "Initializing", color: "bg-blue-400", textColor: "text-blue-400", pulse: true },
  spawning: { label: "Spawning", color: "bg-purple-400", textColor: "text-purple-400", pulse: true },
};

function extractRepoName(url) {
  try {
    const parts = url.replace(/\/+$/, "").split("/");
    return parts.slice(-2).join("/");
  } catch {
    return url;
  }
}

export default function AgentCard({ agent, onSendPrompt, onStop, onPermissionResponse }) {
  const [input, setInput] = useState("");
  const outputRef = useRef(null);
  const bottomRef = useRef(null);
  const status = statusConfig[agent.status] || statusConfig.initializing;

  // Only show the last 3 output entries to keep cards compact
  const MAX_VISIBLE = 3;
  const visibleOutput = agent.output.slice(-MAX_VISIBLE);
  const truncatedCount = agent.output.length - visibleOutput.length;

  // Smooth-scroll to the bottom whenever new output arrives
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

  const canSend = agent.status === "ready";

  return (
    <div className="card-appear relative rounded-xl p-[1px] bg-gradient-to-br from-purple-500/40 via-blue-500/40 to-teal-500/40 shadow-lg shadow-purple-500/5">
      <div className="rounded-xl bg-[#12121a] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-1.5 rounded-md bg-blue-500/15">
              <GitBranch className="w-4 h-4 text-blue-300" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm text-gray-50 truncate">
                {extractRepoName(agent.repoUrl)}
              </h3>
              <p className="text-xs text-gray-400 truncate">{agent.repoUrl}</p>
              {agent.repoPath && (
                <p className="text-xs text-gray-500 truncate font-mono" title={agent.repoPath}>
                  {agent.repoPath}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-white/10 ${status.textColor}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.color} ${status.pulse ? "animate-pulse" : ""}`} />
              {status.label}
            </span>
            <button
              onClick={() => onStop(agent.agentId)}
              className="p-1 rounded-md hover:bg-white/10 text-gray-400 hover:text-red-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Output area — slightly taller with better text contrast */}
        <div
          ref={outputRef}
          className="px-4 py-3 bg-black/40 font-mono text-sm leading-relaxed max-h-[140px] overflow-y-auto min-h-[80px]"
        >
          {/* Spawning progress indicator — shows step-by-step status */}
          {agent.status === "spawning" && (
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
              <p className="text-sm text-gray-300 font-medium">{agent.spawnMessage || "Starting…"}</p>
              <div className="flex items-center gap-2 mt-1">
                {["cloning", "starting", "verifying"].map((step, i) => {
                  const steps = ["cloning", "starting", "verifying"];
                  const currentIdx = steps.indexOf(agent.spawnStep);
                  const isDone = i < currentIdx;
                  const isCurrent = i === currentIdx;
                  return (
                    <div key={step} className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full transition-colors ${
                        isDone ? "bg-green-400" : isCurrent ? "bg-purple-400 animate-pulse" : "bg-gray-600"
                      }`} />
                      <span className={`text-xs capitalize ${
                        isDone ? "text-green-400" : isCurrent ? "text-purple-300" : "text-gray-600"
                      }`}>{step}</span>
                      {i < 2 && <span className="text-gray-700 text-xs">→</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {agent.status !== "spawning" && agent.output.length === 0 && (
            <div className="flex items-center gap-2 text-gray-500">
              <Terminal className="w-4 h-4" />
              <span>Waiting for output…</span>
            </div>
          )}
          {truncatedCount > 0 && (
            <div className="text-center text-xs text-gray-600 py-1 border-b border-white/5 mb-2">
              … {truncatedCount} earlier message{truncatedCount === 1 ? "" : "s"} hidden
            </div>
          )}
          {visibleOutput.map((entry, i) => {
            if (entry.type === "text") {
              return (
                <div key={i} className="text-gray-200 whitespace-pre-wrap break-words">
                  {entry.content}
                </div>
              );
            }
            if (entry.type === "tool_call") {
              return (
                <div key={i} className="text-teal-300 my-1.5 flex items-center gap-1">
                  <span>🔧 </span>
                  <span className="font-semibold">{entry.name}</span>
                  {entry.args && (
                    <span className="text-gray-400 ml-1 text-xs">
                      ({typeof entry.args === "string" ? entry.args : JSON.stringify(entry.args)})
                    </span>
                  )}
                </div>
              );
            }
            if (entry.type === "error") {
              return (
                <div key={i} className="text-red-300 my-1.5 flex items-center gap-1">
                  <span>⚠</span> <span>{entry.content}</span>
                </div>
              );
            }
            return null;
          })}
          {/* Invisible sentinel element the smooth-scroll targets */}
          <div ref={bottomRef} />
        </div>

        {/* Permission banner — prominent amber highlight */}
        {agent.pendingPermission && (
          <div className="px-4 py-3 bg-amber-500/15 border-t border-amber-400/30">
            <p className="text-sm font-medium text-amber-200 mb-2">
              {agent.pendingPermission.title}
            </p>
            <div className="flex gap-2 flex-wrap">
              {agent.pendingPermission.options.map((option) => (
                <button
                  key={option.optionId}
                  onClick={() => onPermissionResponse(agent.agentId, option.optionId)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 transition-colors border border-amber-400/30"
                >
                  {option.name || option.optionId}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Command input */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-white/10 bg-white/[0.02]">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={canSend ? "Send a prompt…" : "Agent is " + agent.status + "…"}
            disabled={!canSend}
            className="flex-1 bg-white/15 border border-white/25 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-40 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!canSend || !input.trim()}
            className="p-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {agent.status === "busy" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
