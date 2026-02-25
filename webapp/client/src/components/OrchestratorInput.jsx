import React, { useState, useRef, useEffect } from "react";
import { Network, Loader2 } from "lucide-react";

/**
 * OrchestratorInput — teal-themed input panel shown when no orchestrator is running.
 * Only ever launches an agent in the "orchestrator" role.
 */
export default function OrchestratorInput({ onLaunch, connected }) {
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!repoUrl.trim() || !connected) return;
    setLoading(true);
    onLaunch(repoUrl.trim(), "orchestrator");
    setTimeout(() => {
      setLoading(false);
      setRepoUrl("");
    }, 1000);
  };

  return (
    <div className="relative rounded-xl p-[1px] bg-gradient-to-r from-teal-500/50 via-cyan-500/50 to-teal-500/50">
      <div className="rounded-xl bg-white/5 backdrop-blur-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Network className="w-4 h-4 text-teal-400" />
          <span className="text-sm font-semibold text-teal-300 tracking-wide uppercase">
            Orchestrator
          </span>
          <span className="text-xs text-gray-500">— coordination repo</span>
        </div>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/orchestrator-repo"
            disabled={loading || !connected}
            className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/60 focus:border-teal-400/50 disabled:opacity-40 transition-all"
          />
          <button
            type="submit"
            disabled={!repoUrl.trim() || !connected || loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-teal-600 to-cyan-600 text-white text-sm font-medium hover:from-teal-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Network className="w-4 h-4" />
            )}
            Launch Orchestrator
          </button>
        </form>
      </div>
    </div>
  );
}
