import React, { useState, useRef, useEffect } from "react";
import { Rocket, Network, Loader2 } from "lucide-react";

/**
 * @param {{ onLaunch: (url: string, role: "worker"|"orchestrator") => void, connected: boolean, hasOrchestrator: boolean }} props
 */
export default function RepoInput({ onLaunch, connected, hasOrchestrator }) {
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  // Auto-focus the repo input so users can start typing immediately
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e, role = "worker") => {
    e.preventDefault();
    if (!repoUrl.trim() || !connected) return;
    setLoading(true);
    onLaunch(repoUrl.trim(), role);
    setTimeout(() => {
      setLoading(false);
      setRepoUrl("");
    }, 1000);
  };

  return (
    <div className="relative rounded-xl p-[1px] bg-gradient-to-r from-purple-500/50 via-blue-500/50 to-teal-500/50">
      <div className="rounded-xl bg-white/5 backdrop-blur-xl p-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Repository URL
        </label>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            disabled={loading}
            autoFocus
            className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-base text-gray-50 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/60 focus:border-purple-400/50 transition-all"
          />

          {/* Launch as orchestrator — only available when no orchestrator is running */}
          {!hasOrchestrator && (
            <button
              type="button"
              onClick={(e) => handleSubmit(e, "orchestrator")}
              disabled={!repoUrl.trim() || !connected || loading}
              className="flex items-center gap-2 px-5 py-3 rounded-lg bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-medium hover:from-teal-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              title="Launch as the orchestrator agent (coordination repo)"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Network className="w-4 h-4" />
              )}
              Orchestrator
            </button>
          )}

          {/* Launch as worker */}
          <button
            type="submit"
            disabled={!repoUrl.trim() || !connected || loading}
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium hover:from-purple-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Rocket className="w-4 h-4" />
            )}
            Worker
          </button>
        </form>
      </div>
    </div>
  );
}
