import React from "react";
import { Terminal, FolderOpen, BellOff, BellRing, Volume2, VolumeX } from "lucide-react";
import SessionControl from "./SessionControl";

export default function Header({
  connected,
  repoBaseDir,
  onRepoBashDirChange,
  reuseExisting,
  onReuseExistingChange,
  socket,
  browserPermission,
  onRequestBrowserPermission,
  soundEnabled,
  onToggleSoundEnabled,
}) {
  return (
    <header className="border-b border-white/10 bg-white/[0.03] backdrop-blur-xl">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
        {/* Logo + title */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 shadow-lg shadow-purple-500/20">
            <Terminal className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-purple-300 via-blue-300 to-teal-300 bg-clip-text text-transparent">
              ACP Agent Orchestrator
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Orchestrate Copilot CLI agents across multiple repositories
            </p>
          </div>
        </div>

        {/* Repo base directory setting */}
        <div className="flex-1 flex flex-col gap-1.5 px-4">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-gray-500 shrink-0" />
            <label className="text-xs text-gray-500 whitespace-nowrap shrink-0">Clone to</label>
            <input
              type="text"
              value={repoBaseDir}
              onChange={(e) => onRepoBashDirChange(e.target.value)}
              placeholder="Local path for cloned repos"
              className="flex-1 bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs text-gray-300 placeholder-gray-600 font-mono focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all"
            />
            {/* Reuse existing checkbox */}
            <label className="flex items-center gap-1.5 whitespace-nowrap cursor-pointer select-none">
              <input
                type="checkbox"
                checked={reuseExisting}
                onChange={(e) => onReuseExistingChange(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-amber-400 cursor-pointer"
              />
              <span className="text-xs text-gray-400">Reuse existing</span>
            </label>
          </div>
          {/* Warning shown only when reuse is enabled */}
          {reuseExisting && (
            <div className="flex items-center gap-1.5 text-amber-400 text-xs px-1">
              <span>⚠</span>
              <span>Reuse mode: agent runs against your local working copy — uncommitted changes may be modified.</span>
            </div>
          )}
        </div>

        {/* Browser notification permission button */}
        {browserPermission !== "granted" && (
          <button
            onClick={onRequestBrowserPermission}
            title={browserPermission === "denied" ? "Notifications blocked by browser" : "Enable background notifications"}
            disabled={browserPermission === "denied"}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all border ${
              browserPermission === "denied"
                ? "border-white/5 text-gray-600 cursor-not-allowed"
                : "border-white/10 text-gray-400 hover:text-purple-300 hover:border-purple-500/30 hover:bg-purple-500/10 cursor-pointer"
            }`}
          >
            <BellOff className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Notify</span>
          </button>
        )}
        {browserPermission === "granted" && (
          <div
            title="Background notifications enabled"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-purple-500/20 text-purple-400"
          >
            <BellRing className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Alerts on</span>
          </div>
        )}

        <button
          onClick={onToggleSoundEnabled}
          title={soundEnabled ? "Mute alert sounds" : "Enable alert sounds"}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all border ${
            soundEnabled
              ? "border-teal-500/20 text-teal-300 hover:bg-teal-500/10"
              : "border-white/10 text-gray-400 hover:text-teal-300 hover:border-teal-500/30 hover:bg-teal-500/10"
          }`}
        >
          {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{soundEnabled ? "Sounds on" : "Sounds off"}</span>
        </button>

        {/* Connection indicator */}
        <div className="flex items-center gap-2 text-sm shrink-0">
          <span
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              connected ? "bg-green-400 shadow-lg shadow-green-400/50" : "bg-red-400 shadow-lg shadow-red-400/50 animate-pulse"
            }`}
          />
          <span className={connected ? "text-green-300" : "text-red-300"}>
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>

        {/* Session Control */}
        <div className="border-l border-white/10 pl-4 ml-2">
          <SessionControl socket={socket} />
        </div>
      </div>
    </header>
  );
}
