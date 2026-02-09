import React, { useState } from "react";
import { Rocket, Loader2 } from "lucide-react";

export default function RepoInput({ onLaunch, connected }) {
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!repoUrl.trim() || !connected) return;
    setLoading(true);
    onLaunch(repoUrl.trim());
    setTimeout(() => {
      setLoading(false);
      setRepoUrl("");
    }, 1000);
  };

  return (
    <div className="relative rounded-xl p-[1px] bg-gradient-to-r from-purple-500/50 via-blue-500/50 to-teal-500/50">
      <div className="rounded-xl bg-white/5 backdrop-blur-xl p-6">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            disabled={loading}
            className="flex-1 bg-white/10 border border-white/10 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all"
          />
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
            Launch Agent
          </button>
        </form>
      </div>
    </div>
  );
}
