import React, { useState, useMemo } from "react";
import {
  GitBranch,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

/** Role → badge colour mapping */
const ROLE_COLORS = {
  library: "bg-teal-950/60 border-teal-500/30 text-teal-300",
  api: "bg-blue-950/60 border-blue-500/30 text-blue-300",
  webapp: "bg-purple-950/60 border-purple-500/30 text-purple-300",
  service: "bg-amber-950/60 border-amber-500/30 text-amber-300",
  other: "bg-gray-800/60 border-gray-600/30 text-gray-400",
};

/**
 * DependencyGraph — collapsible panel showing cross-repo dependency DAG.
 *
 * @param {{
 *   graph: { nodes: Array<{agentId, repoName, role, techStack}>, edges: Array<{from, to}>, warnings: string[] } | null,
 *   onRefresh: () => void
 * }} props
 */
export default function DependencyGraph({ graph, onRefresh }) {
  const [collapsed, setCollapsed] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState(false);

  // Nothing to render when there's no graph or no edges
  if (!graph || graph.edges.length === 0) return null;

  const { nodes, edges, warnings = [] } = graph;

  // Build adjacency list: nodeId → list of agentIds that depend on it (consumers)
  // edge.from depends on edge.to, so edge.to has edge.from as a consumer
  const consumers = useMemo(() => {
    const map = {};
    for (const node of nodes) map[node.agentId] = [];
    for (const edge of edges) {
      if (map[edge.to]) map[edge.to].push(edge.from);
    }
    return map;
  }, [nodes, edges]);

  const nodeById = useMemo(
    () => Object.fromEntries(nodes.map((n) => [n.agentId, n])),
    [nodes],
  );

  return (
    <div className="rounded-xl p-[1px] bg-gradient-to-br from-teal-500/30 via-blue-500/30 to-purple-500/30 shadow-lg">
      <div className="rounded-xl bg-[#12121a] overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center gap-2 px-4 py-3 hover:bg-white/[0.03] transition-colors"
        >
          <GitBranch className="w-4 h-4 text-teal-400 shrink-0" />
          <span className="text-sm font-semibold text-gray-200">
            Dependency Graph
          </span>
          <span className="ml-2 text-xs text-gray-500">
            {nodes.length} node{nodes.length !== 1 ? "s" : ""} ·{" "}
            {edges.length} edge{edges.length !== 1 ? "s" : ""}
          </span>
          <span className="ml-auto text-gray-500">
            {collapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </span>
        </button>

        {!collapsed && (
          <div className="px-4 pb-4 space-y-3">
            {/* Warnings banner */}
            {warnings.length > 0 && !dismissedWarnings && (
              <div className="bg-amber-950/40 border border-amber-500/30 rounded-lg p-3 text-amber-300 text-sm flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <div className="flex-1">
                  {warnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
                <button
                  onClick={() => setDismissedWarnings(true)}
                  className="shrink-0 text-xs text-amber-400 hover:text-amber-200 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* DAG node list */}
            <div className="space-y-1">
              {nodes.map((node) => {
                const roleColor =
                  ROLE_COLORS[node.role] ?? ROLE_COLORS.other;
                const nodeConsumers = (consumers[node.agentId] ?? []).map(
                  (id) => nodeById[id],
                ).filter(Boolean);

                return (
                  <div key={node.agentId} className="space-y-1">
                    {/* Node row */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium ${roleColor}`}
                      >
                        {node.role ?? "other"}
                      </span>
                      <span className="text-sm text-gray-200 font-medium truncate">
                        {node.repoName}
                      </span>
                      {/* Tech stack tags */}
                      {node.techStack?.length > 0 && (
                        <div className="flex gap-1 ml-auto flex-wrap justify-end">
                          {node.techStack.map((t) => (
                            <span
                              key={t}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800/60 text-gray-400 border border-gray-700/40"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Indented consumers (nodes that depend on this node) */}
                    {nodeConsumers.map((consumer) => {
                      const cColor =
                        ROLE_COLORS[consumer.role] ?? ROLE_COLORS.other;
                      return (
                        <div
                          key={consumer.agentId}
                          className="ml-8 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.02] border-l-2 border-white/10"
                        >
                          <span className="text-gray-600 text-xs">→</span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium ${cColor}`}
                          >
                            {consumer.role ?? "other"}
                          </span>
                          <span className="text-sm text-gray-300 truncate">
                            {consumer.repoName}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="pt-2 border-t border-white/10 flex justify-end">
              <button
                onClick={onRefresh}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-gray-400 bg-white/[0.05] hover:bg-white/10 hover:text-gray-200 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh Manifests
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
