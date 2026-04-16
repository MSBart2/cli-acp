import React, { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Radio,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";

/**
 * BroadcastResults — shows a coalesced summary of all agent responses
 * after a broadcast prompt completes.
 *
 * Design: summary table with one-line headline per repo, click to expand
 * an accordion showing the full output. Only one accordion open at a time
 * to prevent visual overload.
 *
 * @param {{
 *   broadcastResults: { promptText: string, timestamp: string, results: Array<{ agentId: string, repoName: string, repoUrl: string, status: string, output: string }> },
 *   onDismiss: () => void,
 *   onRetryFailed?: () => void
 * }} props
 */
export default function BroadcastResults({ broadcastResults, onDismiss, onRetryFailed }) {
  const [expandedId, setExpandedId] = useState(null);
  const [copied, setCopied] = useState(false);

  const { results, promptText } = broadcastResults;

  // Pull the first line of each agent's output as a headline summary
  const enrichedResults = useMemo(
    () =>
      results.map((r) => {
        const firstLine = r.output.split("\n").find((l) => l.trim()) || "";
        // Strip leading markdown heading markers for a cleaner headline
        const headline = firstLine.replace(/^#+\s*/, "").trim();
        return { ...r, headline };
      }),
    [results],
  );

  const completedCount = results.filter((r) => r.status === "completed").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  const toggleExpand = (agentId) => {
    setExpandedId((prev) => (prev === agentId ? null : agentId));
  };

  /** Build a markdown document from all results for clipboard export */
  const exportAsMarkdown = () => {
    const lines = [
      `# Broadcast Results`,
      "",
      `> ${promptText}`,
      "",
      `_${completedCount} of ${results.length} agents completed${errorCount ? `, ${errorCount} errored` : ""}_`,
      "",
    ];

    for (const r of enrichedResults) {
      lines.push(`---`);
      lines.push("");
      lines.push(`## ${r.repoName}`);
      lines.push("");
      if (r.status === "error") {
        lines.push(`**Error** — agent did not produce output.`);
      } else {
        lines.push(r.output || "_No output_");
      }
      lines.push("");
    }

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative rounded-xl p-[1px] bg-gradient-to-r from-teal-500/30 via-cyan-500/30 to-blue-500/30">
      <div className="rounded-xl bg-[#0d0d14] p-5">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-1">
          <Radio className="w-4 h-4 text-teal-400" />
          <h2 className="text-sm font-semibold text-gray-200">
            Broadcast Results
          </h2>

          <span className="ml-auto text-xs text-gray-500">
            {completedCount}/{results.length} completed
            {errorCount > 0 && (
              <span className="text-red-400 ml-1">
                · {errorCount} error{errorCount !== 1 ? "s" : ""}
              </span>
            )}
          </span>

          <button
            onClick={onDismiss}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors ml-2"
            title="Dismiss results"
          >
            ✕
          </button>
        </div>

        {/* The original prompt, truncated */}
        <p className="text-xs text-gray-500 mb-4 truncate max-w-[80%]">
          Prompt: "{promptText}"
        </p>

        {/* Summary rows — one per agent */}
        <div className="space-y-1">
          {enrichedResults.map((r) => {
            const isExpanded = expandedId === r.agentId;
            const isError = r.status === "error";

            return (
              <div key={r.agentId}>
                {/* Clickable summary row */}
                <button
                  onClick={() => toggleExpand(r.agentId)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    isExpanded
                      ? "bg-white/[0.06]"
                      : "hover:bg-white/[0.04]"
                  }`}
                >
                  {/* Expand/collapse chevron */}
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                  )}

                  {/* Status badge */}
                  {isError ? (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}

                  {/* Repo name */}
                  <span className="text-sm font-medium text-gray-200 shrink-0 w-40 truncate">
                    {r.repoName}
                  </span>

                  {/* Headline (first line of output) */}
                  <span className="text-sm text-gray-400 truncate">
                    {isError
                      ? "Agent errored — no output"
                      : r.headline || "No output"}
                  </span>
                </button>

                {/* Expanded detail pane — capped height, scrollable */}
                {isExpanded && (
                  <div className="ml-10 mt-1 mb-2 rounded-lg bg-white/[0.03] border border-white/10 overflow-hidden">
                    <div className="max-h-72 overflow-y-auto p-4">
                      <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                        {r.output || "No output"}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-3 mt-4 pt-3 border-t border-white/10">
          <button
            onClick={exportAsMarkdown}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-gray-400 bg-white/[0.05] hover:bg-white/10 hover:text-gray-200 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy as Markdown
              </>
            )}
          </button>
          {/* Retry button — only shown when there are failed agents */}
          {errorCount > 0 && onRetryFailed && (
            <button
              onClick={onRetryFailed}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-red-400 bg-red-500/[0.08] hover:bg-red-500/20 hover:text-red-300 border border-red-500/20 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry {errorCount} failed
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
