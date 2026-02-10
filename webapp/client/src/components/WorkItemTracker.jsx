import React, { useState, useMemo } from "react";
import {
  GitPullRequest,
  CircleDot,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

/**
 * WorkItemTracker — a live dashboard showing all PRs and issues detected
 * from agent output. Items are auto-extracted from GitHub/GitLab/Bitbucket
 * URLs in agent text and grouped by repository.
 *
 * @param {{ items: Array<{ url: string, owner: string, repo: string, type: "issue"|"pr", number: number, detectedAt: string, agentRepoName: string }>, onDismiss: () => void }} props
 */
export default function WorkItemTracker({ items, onDismiss }) {
  const [collapsed, setCollapsed] = useState(false);

  const prCount = useMemo(() => items.filter((i) => i.type === "pr").length, [items]);
  const issueCount = useMemo(() => items.filter((i) => i.type === "issue").length, [items]);

  // Group items by "owner/repo"
  const grouped = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const key = `${item.owner}/${item.repo}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="relative rounded-xl p-[1px] bg-gradient-to-r from-violet-500/30 via-purple-500/30 to-fuchsia-500/30">
      <div className="rounded-xl bg-[#0d0d14] p-5">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-200 hover:text-gray-100 transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            )}
            Work Item Tracker
          </button>

          <span className="ml-auto flex items-center gap-3 text-xs text-gray-500">
            {prCount > 0 && (
              <span className="flex items-center gap-1">
                <GitPullRequest className="w-3.5 h-3.5 text-green-400" />
                {prCount} PR{prCount !== 1 ? "s" : ""}
              </span>
            )}
            {issueCount > 0 && (
              <span className="flex items-center gap-1">
                <CircleDot className="w-3.5 h-3.5 text-purple-400" />
                {issueCount} issue{issueCount !== 1 ? "s" : ""}
              </span>
            )}
          </span>

          <button
            onClick={onDismiss}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors ml-2"
            title="Hide tracker"
          >
            ✕
          </button>
        </div>

        {/* Table of work items, grouped by repo */}
        {!collapsed && (
          <div className="space-y-3">
            {grouped.map(([repoKey, repoItems]) => (
              <div key={repoKey}>
                <h3 className="text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                  {repoKey}
                </h3>
                <div className="space-y-1">
                  {repoItems.map((item) => (
                    <a
                      key={item.url}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group"
                    >
                      {item.type === "pr" ? (
                        <GitPullRequest className="w-4 h-4 text-green-400 shrink-0" />
                      ) : (
                        <CircleDot className="w-4 h-4 text-purple-400 shrink-0" />
                      )}

                      <span className="text-sm text-gray-300 font-mono">
                        #{item.number}
                      </span>

                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-400">
                        {item.type === "pr" ? "Pull Request" : "Issue"}
                      </span>

                      <span className="text-xs text-gray-600 ml-auto">
                        via {item.agentRepoName}
                      </span>

                      <ExternalLink className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-colors shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
