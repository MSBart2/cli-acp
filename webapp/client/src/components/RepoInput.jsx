import React, { useState, useRef } from "react";
import { Rocket, Loader2, PlusCircle } from "lucide-react";

/**
 * WorkerInput — rendered as a grid card so it sits flush alongside running worker cards.
 * When no workers exist yet it appears as the sole item in the grid.
 */
export default function RepoInput({ onLaunch, connected }) {
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!repoUrl.trim() || !connected) return;
    setLoading(true);
    onLaunch(repoUrl.trim(), "worker");
    setTimeout(() => {
      setLoading(false);
      setRepoUrl("");
      inputRef.current?.focus();
    }, 1000);
  };

  return (
    // Matches AgentCard outer wrapper — gradient border, same border-radius
    <div className="card-appear relative rounded-xl p-[1px] bg-gradient-to-br from-purple-500/30 via-blue-500/30 to-purple-500/30 shadow-lg">
      <div className="rounded-xl bg-[#12121a] flex flex-col h-full min-h-[200px]">
        {/* Header strip — mirrors AgentCard header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-white/[0.03]">
          <div className="p-1.5 rounded-md bg-purple-500/15">
            <PlusCircle className="w-4 h-4 text-purple-300" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-gray-50">Add Worker</h3>
            <p className="text-xs text-gray-500">Connect another repository</p>
          </div>
        </div>

        {/* Body — centered vertically so it feels balanced */}
        <div className="flex-1 flex flex-col justify-center gap-3 px-4 py-5">
          <input
            ref={inputRef}
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit(e)}
            placeholder="https://github.com/owner/repo"
            disabled={loading || !connected}
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-40 transition-all"
          />
          <button
            onClick={handleSubmit}
            disabled={!repoUrl.trim() || !connected || loading}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-medium hover:from-purple-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Rocket className="w-4 h-4" />
            )}
            Launch Worker
          </button>
        </div>
      </div>
    </div>
  );
}
