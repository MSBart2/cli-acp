import React from "react";
import { Terminal } from "lucide-react";

export default function Header({ connected }) {
  return (
    <header className="border-b border-white/10 bg-white/5 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500">
            <Terminal className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-teal-400 bg-clip-text text-transparent">
              ACP Agent Orchestrator
            </h1>
            <p className="text-xs text-gray-400">
              Orchestrate Copilot CLI agents across multiple repositories
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-green-400 shadow-lg shadow-green-400/50" : "bg-red-400 shadow-lg shadow-red-400/50"
            }`}
          />
          {connected ? "Connected" : "Disconnected"}
        </div>
      </div>
    </header>
  );
}
