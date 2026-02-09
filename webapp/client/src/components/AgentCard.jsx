import React, { useState, useEffect, useRef } from "react";
import { X, Send, Terminal, GitBranch, Loader2 } from "lucide-react";

const statusConfig = {
  ready: { label: "Ready", color: "bg-green-400", textColor: "text-green-400", pulse: false },
  busy: { label: "Busy", color: "bg-amber-400", textColor: "text-amber-400", pulse: true },
  error: { label: "Error", color: "bg-red-400", textColor: "text-red-400", pulse: false },
  initializing: { label: "Initializing", color: "bg-blue-400", textColor: "text-blue-400", pulse: true },
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
  const status = statusConfig[agent.status] || statusConfig.initializing;

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
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
    <div className="card-appear relative rounded-xl p-[1px] bg-gradient-to-br from-purple-500/30 via-blue-500/30 to-teal-500/30">
      <div className="rounded-xl bg-white/5 backdrop-blur-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-1.5 rounded-md bg-white/10">
              <GitBranch className="w-4 h-4 text-blue-400" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm text-gray-100 truncate">
                {extractRepoName(agent.repoUrl)}
              </h3>
              <p className="text-xs text-gray-500 truncate">{agent.repoUrl}</p>
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

        {/* Output area */}
        <div
          ref={outputRef}
          className="px-4 py-3 bg-black/30 font-mono text-xs leading-relaxed max-h-[400px] overflow-y-auto min-h-[120px]"
        >
          {agent.output.length === 0 && (
            <div className="flex items-center gap-2 text-gray-600">
              <Terminal className="w-3.5 h-3.5" />
              <span>Waiting for output...</span>
            </div>
          )}
          {agent.output.map((entry, i) => {
            if (entry.type === "text") {
              return (
                <div key={i} className="text-gray-300 whitespace-pre-wrap break-words">
                  {entry.content}
                </div>
              );
            }
            if (entry.type === "tool_call") {
              return (
                <div key={i} className="text-teal-400 my-1">
                  <span>🔧 </span>
                  <span className="font-semibold">{entry.name}</span>
                  {entry.args && (
                    <span className="text-gray-500 ml-1 text-[11px]">
                      ({typeof entry.args === "string" ? entry.args : JSON.stringify(entry.args)})
                    </span>
                  )}
                </div>
              );
            }
            if (entry.type === "error") {
              return (
                <div key={i} className="text-red-400 my-1">
                  ⚠ {entry.content}
                </div>
              );
            }
            return null;
          })}
        </div>

        {/* Permission banner */}
        {agent.pendingPermission && (
          <div className="px-4 py-3 bg-amber-500/10 border-t border-amber-500/20">
            <p className="text-sm font-medium text-amber-300 mb-2">
              {agent.pendingPermission.title}
            </p>
            <div className="flex gap-2 flex-wrap">
              {agent.pendingPermission.options.map((option) => (
                <button
                  key={option.optionId}
                  onClick={() => onPermissionResponse(agent.agentId, option.optionId)}
                  className="px-3 py-1 text-xs rounded-md bg-white/10 text-gray-200 hover:bg-white/20 transition-colors border border-white/10"
                >
                  {option.name || option.optionId}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Command input */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-white/10">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={canSend ? "Send a prompt..." : "Agent is " + agent.status + "..."}
            disabled={!canSend}
            className="flex-1 bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-40 transition-all"
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
