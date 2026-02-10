import React from "react";
import { Terminal } from "lucide-react";

export default function Header({ connected }) {
  return (
    <header className="border-b border-white/10 bg-white/[0.03] backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
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

        <div className="flex items-center gap-2 text-sm">
          <span
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              connected ? "bg-green-400 shadow-lg shadow-green-400/50" : "bg-red-400 shadow-lg shadow-red-400/50 animate-pulse"
            }`}
          />
          <span className={connected ? "text-green-300" : "text-red-300"}>
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>
    </header>
  );
}
