import React, { useState } from "react";
import { X, Send, Terminal, GitBranch, Loader2, RotateCw } from "lucide-react";
import { suggestRepoUrl } from "../dependencySuggestions";
import StatusBadge from "./StatusBadge.jsx";
import OutputLog from "./OutputLog.jsx";

function extractRepoName(url) {
  try {
    const parts = url.replace(/\/+$/, "").split("/");
    return parts.slice(-2).join("/");
  } catch {
    return url;
  }
}

export default function AgentCard({
  agent,
  onSendPrompt,
  onStop,
  onRestart,
  onPermissionResponse,
  onCreateManifest,
  onLoadWorker,
}) {
  const [input, setInput] = useState("");
  const [unloadedOpen, setUnloadedOpen] = useState(false);
  const [loadingDepUrl, setLoadingDepUrl] = useState({}); // { [depIndex]: string }

  // Only show the last 3 output entries to keep cards compact
  const MAX_VISIBLE = 3;
  const visibleOutput = agent.output.slice(-MAX_VISIBLE);
  const truncatedCount = agent.output.length - visibleOutput.length;

  const handleSend = () => {
    if (
      !input.trim() ||
      agent.status === "busy" ||
      agent.status === "initializing"
    )
      return;
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
    <div className="card-appear relative h-full min-h-[420px] rounded-xl p-[1px] bg-gradient-to-br from-purple-500/40 via-blue-500/40 to-teal-500/40 shadow-lg shadow-purple-500/5">
      <div className="rounded-xl bg-[#12121a] overflow-hidden flex h-full flex-col">
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
                <p
                  className="text-xs text-gray-500 truncate font-mono"
                  title={agent.repoPath}
                >
                  {agent.repoPath}
                </p>
              )}
              <p className="text-xs text-gray-500 truncate">
                Model: {agent.model || "default"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <StatusBadge status={agent.status} variant="worker" testId="agent-status" />
            {agent.impactChecking && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-500/30 text-amber-300 animate-pulse">
                Impact check…
              </span>
            )}
            {agent.status === "stopped" ? (
              <button
                onClick={() => onRestart?.(agent.agentId)}
                className="p-1 rounded-md hover:bg-white/10 text-gray-400 hover:text-green-400 transition-colors"
                title="Restart Agent"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => onStop(agent.agentId)}
                className="p-1 rounded-md hover:bg-white/10 text-gray-400 hover:text-red-400 transition-colors"
                title="Stop Agent"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Dependency pills, manifest chip, unloaded deps */}
        {(agent.manifest?.dependsOn?.length > 0 ||
          agent.manifest?.dependedBy?.length > 0 ||
          agent.manifestMissing ||
          agent.unloadedDeps?.length > 0) && (
            <div className="px-4 py-2 border-b border-white/10 flex flex-wrap items-center gap-2">
              {agent.manifest?.dependsOn?.length > 0 && (
                <>
                  <span className="text-xs text-gray-500">uses:</span>
                  {agent.manifest.dependsOn.map((dep, i) => (
                    <span
                      key={i}
                      className="bg-teal-950/60 border border-teal-500/30 text-teal-300 text-xs px-2 py-0.5 rounded-full"
                    >
                      {dep}
                    </span>
                  ))}
                </>
              )}
              {agent.manifest?.dependedBy?.length > 0 && (
                <>
                  <span className="text-xs text-gray-500">used by:</span>
                  {agent.manifest.dependedBy.map((dep, i) => (
                    <span
                      key={i}
                      className="bg-gray-800/60 border border-gray-600/30 text-gray-400 text-xs px-2 py-0.5 rounded-full"
                    >
                      {dep}
                    </span>
                  ))}
                </>
              )}
              {agent.manifestMissing && !agent.manifest && (
                <button
                  onClick={() => onCreateManifest?.(agent.agentId)}
                  className="text-xs px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-500/30 text-amber-300 hover:bg-amber-900/60 transition-colors"
                >
                  No manifest · Create?
                </button>
              )}
              {agent.unloadedDeps?.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    onClick={() => setUnloadedOpen((v) => !v)}
                    className="text-xs px-2 py-0.5 rounded-full bg-blue-950/60 border border-blue-500/30 text-blue-300"
                  >
                    {agent.unloadedDeps.length} dep
                    {agent.unloadedDeps.length !== 1 ? "s" : ""} not loaded
                  </button>
                  {unloadedOpen &&
                    agent.unloadedDeps.map((dep, i) => {
                      const suggested = dep.suggestedUrl || suggestRepoUrl(agent.repoUrl, dep.repoName);
                      const inputVal = loadingDepUrl[i] ?? suggested ?? "";
                      return (
                        <div key={i} className="flex items-center gap-1 flex-wrap">
                          <span className="text-xs text-blue-300">
                            {dep.repoName} ({dep.direction})
                          </span>
                          <input
                            type="text"
                            value={inputVal}
                            onChange={(e) =>
                              setLoadingDepUrl((prev) => ({ ...prev, [i]: e.target.value }))
                            }
                            placeholder="Repo URL…"
                            className="text-xs bg-blue-950/40 border border-blue-500/20 text-blue-200 rounded px-2 py-0.5 w-48 focus:outline-none focus:ring-1 focus:ring-blue-400/40"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && inputVal) {
                                onLoadWorker?.(inputVal);
                                setLoadingDepUrl((prev) => {
                                  const next = { ...prev };
                                  delete next[i];
                                  return next;
                                });
                              }
                            }}
                          />
                          <button
                            onClick={() => {
                              if (inputVal) {
                                onLoadWorker?.(inputVal);
                                setLoadingDepUrl((prev) => {
                                  const next = { ...prev };
                                  delete next[i];
                                  return next;
                                });
                              }
                            }}
                            className="text-xs px-2 py-0.5 rounded-full bg-blue-950/40 border border-blue-500/20 text-blue-300 hover:bg-blue-900/40 transition-colors"
                          >
                            Load as Worker
                          </button>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

        {/* Output area — slightly taller with better text contrast */}
        <div className="min-h-[160px] flex-1 overflow-y-auto bg-black/40 px-4 py-3 font-mono text-sm leading-relaxed">
          {/* Spawning progress indicator — shows step-by-step status */}
          {agent.status === "spawning" && (
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
              <p className="text-sm text-gray-300 font-medium">
                {agent.spawnMessage || "Starting…"}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {["cloning", "starting", "verifying"].map((step, i) => {
                  const steps = ["cloning", "starting", "verifying"];
                  const currentIdx = steps.indexOf(agent.spawnStep);
                  const isDone = i < currentIdx;
                  const isCurrent = i === currentIdx;
                  return (
                    <div key={step} className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full transition-colors ${isDone
                            ? "bg-green-400"
                            : isCurrent
                              ? "bg-purple-400 animate-pulse"
                              : "bg-gray-600"
                          }`}
                      />
                      <span
                        className={`text-xs capitalize ${isDone
                            ? "text-green-400"
                            : isCurrent
                              ? "text-purple-300"
                              : "text-gray-600"
                          }`}
                      >
                        {step}
                      </span>
                      {i < 2 && (
                        <span className="text-gray-700 text-xs">→</span>
                      )}
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
              … {truncatedCount} earlier message
              {truncatedCount === 1 ? "" : "s"} hidden
            </div>
          )}
          <OutputLog entries={visibleOutput} variant="worker" />
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
                  onClick={() =>
                    onPermissionResponse(agent.agentId, option.optionId)
                  }
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
            placeholder={
              canSend ? "Send a prompt…" : "Agent is " + agent.status + "…"
            }
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
