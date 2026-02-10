import React, { useState } from "react";
import {
  History,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";

/**
 * BroadcastHistory — collapsible panel showing past broadcast waves.
 * Each entry shows the prompt text, timestamp, and a summary of results.
 * Users can expand an entry to see per-repo output details.
 *
 * @param {{ history: Array<{ promptText: string, timestamp: string, results: Array<{ agentId: string, repoName: string, status: string, output: string }> }> }} props
 */
export default function BroadcastHistory({ history }) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState(null);

  if (history.length === 0) return null;

  return (
    <div className="relative rounded-xl p-[1px] bg-gradient-to-r from-gray-500/20 via-gray-400/20 to-gray-500/20">
      <div className="rounded-xl bg-[#0d0d14] p-4">
        {/* Toggle header */}
        <button
          onClick={() => setIsOpen((v) => !v)}
          className="flex items-center gap-2 w-full text-left"
        >
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          <History className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-300">
            Broadcast History
          </span>
          <span className="ml-auto text-xs text-gray-600">
            {history.length} wave{history.length !== 1 ? "s" : ""}
          </span>
        </button>

        {/* Expanded history list — most recent first */}
        {isOpen && (
          <div className="mt-3 space-y-2">
            {[...history].reverse().map((wave, reverseIdx) => {
              const waveIdx = history.length - 1 - reverseIdx;
              const isExpanded = expandedIdx === waveIdx;
              const completedCount = wave.results.filter(
                (r) => r.status === "completed",
              ).length;
              const errorCount = wave.results.filter(
                (r) => r.status === "error",
              ).length;

              // Format timestamp as a short local time
              const time = new Date(wave.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div key={waveIdx} className="rounded-lg bg-white/[0.02] border border-white/5">
                  <button
                    onClick={() =>
                      setExpandedIdx(isExpanded ? null : waveIdx)
                    }
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors rounded-lg"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                    )}

                    <span className="text-xs text-gray-500 shrink-0 w-14">
                      {time}
                    </span>

                    <span className="text-sm text-gray-400 truncate flex-1">
                      {wave.promptText}
                    </span>

                    <span className="text-xs text-gray-600 shrink-0">
                      {completedCount}/{wave.results.length}
                      {errorCount > 0 && (
                        <span className="text-red-400 ml-1">
                          · {errorCount} err
                        </span>
                      )}
                    </span>
                  </button>

                  {/* Expanded per-repo results */}
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-1">
                      {wave.results.map((r) => (
                        <div
                          key={r.agentId}
                          className="flex items-start gap-2 px-2 py-1.5 rounded-md bg-white/[0.02]"
                        >
                          {r.status === "error" ? (
                            <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-gray-300">
                              {r.repoName}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {r.status === "error"
                                ? "Agent errored"
                                : (r.output || "No output")
                                    .split("\n")
                                    .find((l) => l.trim())
                                    ?.replace(/^#+\s*/, "")
                                    .trim() || "No output"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
