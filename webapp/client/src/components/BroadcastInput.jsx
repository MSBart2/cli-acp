import React, { useState } from "react";
import { Send, Loader2, Radio, ChevronDown, ChevronRight, Sparkles } from "lucide-react";

/**
 * BroadcastInput — sends a single prompt to ALL ready agents at once.
 * Optionally includes synthesis instructions that guide what the orchestrator
 * does with the coalesced worker results.
 *
 * @param {{ onBroadcast: (text: string, synthesisInstructions?: string) => void, readyCount: number, totalCount: number, broadcasting: boolean, hasOrchestrator: boolean }} props
 */
export default function BroadcastInput({ onBroadcast, readyCount, totalCount, broadcasting, hasOrchestrator }) {
  const [text, setText] = useState("");
  const [synthesisInstructions, setSynthesisInstructions] = useState("");
  const [showSynthesis, setShowSynthesis] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim() || readyCount === 0 || broadcasting) return;
    onBroadcast(text.trim(), synthesisInstructions.trim() || undefined);
    setText("");
    setSynthesisInstructions("");
  };

  const handleKeyDown = (e) => {
    // Cmd/Ctrl+Enter to send (regular Enter creates newlines)
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const canSend = readyCount > 0 && !broadcasting;

  return (
    <div className="relative rounded-xl p-[1px] bg-gradient-to-r from-teal-500/40 via-blue-500/40 to-purple-500/40">
      <div className="rounded-xl bg-white/[0.03] backdrop-blur-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Radio className="w-4 h-4 text-teal-400" />
          <h2 className="text-sm font-semibold text-gray-200">Broadcast to All Agents</h2>
          <span className="text-xs text-gray-500 ml-auto">
            {readyCount} of {totalCount} agent{totalCount !== 1 ? "s" : ""} ready
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a prompt to all agents… (Ctrl+Enter to send)"
              disabled={broadcasting}
              rows={2}
              className="flex-1 bg-white/10 border border-white/15 rounded-lg px-4 py-3 text-sm text-gray-50 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-400/50 disabled:opacity-40 transition-all resize-none"
            />
            <button
              type="submit"
              disabled={!text.trim() || !canSend}
              className="self-end flex items-center gap-2 px-5 py-3 rounded-lg bg-gradient-to-r from-teal-600 to-blue-600 text-white font-medium hover:from-teal-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {broadcasting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Broadcast
            </button>
          </div>

          {/* Collapsible synthesis instructions — only shown when an orchestrator exists */}
          {hasOrchestrator && (
            <div>
              <button
                type="button"
                onClick={() => setShowSynthesis((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 transition-colors"
              >
                {showSynthesis ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
                <Sparkles className="w-3.5 h-3.5" />
                Synthesis instructions for orchestrator
              </button>

              {showSynthesis && (
                <textarea
                  value={synthesisInstructions}
                  onChange={(e) => setSynthesisInstructions(e.target.value)}
                  placeholder="Guide the orchestrator — e.g. 'Create a parent issue that references each child issue URL…'"
                  disabled={broadcasting}
                  rows={2}
                  className="mt-2 w-full bg-teal-950/30 border border-teal-500/20 rounded-lg px-4 py-3 text-sm text-gray-50 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400/40 disabled:opacity-40 transition-all resize-none"
                />
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
