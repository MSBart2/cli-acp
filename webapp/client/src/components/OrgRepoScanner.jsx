import React, { useState, useCallback } from "react";
import {
  Search,
  Loader2,
  Rocket,
  Building2,
  ChevronDown,
  ChevronRight,
  Check,
  AlertCircle,
} from "lucide-react";

/**
 * OrgRepoScanner — browse a GitHub org's repos and load them as workers.
 *
 * @param {{ onLoadRepo: (repoUrl: string) => void, loadedRepoUrls: string[], connected: boolean }} props
 */
export default function OrgRepoScanner({ onLoadRepo, loadedRepoUrls = [], connected }) {
  const [expanded, setExpanded] = useState(false);
  const [org, setOrg] = useState("");
  const [repos, setRepos] = useState(null); // null | { org, repos, total, limit }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loadingRepo, setLoadingRepo] = useState({}); // { [fullName]: true }

  const loadedSet = new Set(
    loadedRepoUrls.map((u) => u.replace(/\.git$/, "").toLowerCase()),
  );

  const isLoaded = useCallback(
    (url) => loadedSet.has(url.replace(/\.git$/, "").toLowerCase()),
    [loadedSet],
  );

  const handleSearch = async (e) => {
    e?.preventDefault();
    const trimmed = org.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setRepos(null);
    try {
      const res = await fetch(
        `/api/github/org-repos?org=${encodeURIComponent(trimmed)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRepos(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoad = (repo) => {
    setLoadingRepo((prev) => ({ ...prev, [repo.fullName]: true }));
    onLoadRepo(repo.url);
    // Clear loading state after a brief delay (agent:spawning takes over from here)
    setTimeout(() => {
      setLoadingRepo((prev) => {
        const next = { ...prev };
        delete next[repo.fullName];
        return next;
      });
    }, 2000);
  };

  // Language color dot
  const langColor = (lang) => {
    const colors = {
      JavaScript: "bg-yellow-400",
      TypeScript: "bg-blue-400",
      Python: "bg-green-400",
      Go: "bg-cyan-400",
      Rust: "bg-orange-400",
      Java: "bg-red-400",
      Ruby: "bg-red-500",
      "C#": "bg-purple-400",
      Shell: "bg-gray-400",
    };
    return colors[lang] || "bg-gray-500";
  };

  return (
    <div className="rounded-xl p-[1px] bg-gradient-to-r from-indigo-500/30 via-purple-500/30 to-pink-500/30">
      <div className="rounded-xl bg-white/[0.03] backdrop-blur-xl">
        {/* Header toggle */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 w-full px-5 py-3 text-left hover:bg-white/[0.02] transition-colors rounded-xl"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-indigo-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-indigo-400" />
          )}
          <Building2 className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-semibold text-gray-200">
            Browse GitHub Org
          </span>
          <span className="text-xs text-gray-500">
            Scan an org to discover and load repos
          </span>
        </button>

        {expanded && (
          <div className="px-5 pb-5 space-y-3">
            {/* Search form */}
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={org}
                onChange={(e) => setOrg(e.target.value)}
                placeholder="org or username"
                disabled={loading}
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-40 transition-all"
              />
              <button
                type="submit"
                disabled={!org.trim() || loading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-medium hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Scan
              </button>
            </form>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-950/30 border border-red-500/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Results */}
            {repos && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  Showing {repos.total} repo
                  {repos.total !== 1 ? "s" : ""} in{" "}
                  <span className="text-gray-300">{repos.org}</span>
                  {repos.total >= repos.limit && (
                    <span className="text-amber-400">
                      {" "}(first {repos.limit})
                    </span>
                  )}
                </p>

                <div className="max-h-72 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5">
                  {repos.repos.map((repo) => {
                    const loaded = isLoaded(repo.url);
                    const isLoading = !!loadingRepo[repo.fullName];
                    return (
                      <div
                        key={repo.fullName}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.03] transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-200 font-medium truncate">
                            {repo.fullName}
                          </p>
                          {repo.description && (
                            <p className="text-xs text-gray-500 truncate">
                              {repo.description}
                            </p>
                          )}
                        </div>
                        {repo.language && (
                          <span className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
                            <span
                              className={`w-2 h-2 rounded-full ${langColor(repo.language)}`}
                            />
                            {repo.language}
                          </span>
                        )}
                        {loaded ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-400 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                            <Check className="w-3 h-3" />
                            Loaded
                          </span>
                        ) : (
                          <button
                            onClick={() => handleLoad(repo)}
                            disabled={!connected || isLoading}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
                          >
                            {isLoading ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Rocket className="w-3 h-3" />
                            )}
                            Load
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
