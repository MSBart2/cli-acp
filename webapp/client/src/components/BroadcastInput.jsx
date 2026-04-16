import React, { useState, useRef, useCallback } from "react";
import { Send, Loader2, Radio, ChevronDown, ChevronRight, Sparkles, AtSign, BookOpen } from "lucide-react";
import { getMentionAt, parseAtMentions } from "../hooks/mentionUtils.js";
import { usePlaybooks } from "../hooks/usePlaybooks.js";
import PlaybookPanel from "./PlaybookPanel.jsx";

/**
 * BroadcastInput — sends a prompt to all (or @mentioned) ready agents at once.
 * Supports `@repoName` autocomplete to target specific workers.
 *
 * @param {{ onBroadcast: Function, readyCount: number, totalCount: number, busyCount: number, errorCount: number, spawningCount: number, broadcasting: boolean, hasOrchestrator: boolean, broadcastProgress: object|null, workerRepoNames: string[] }} props
 */
export default function BroadcastInput({ onBroadcast, readyCount, totalCount, busyCount = 0, errorCount = 0, spawningCount = 0, broadcasting, hasOrchestrator, broadcastProgress, workerRepoNames = [] }) {
  const [text, setText] = useState("");
  const [synthesisInstructions, setSynthesisInstructions] = useState("");
  const [showSynthesis, setShowSynthesis] = useState(false);

  // Compose history — arrow-up/down to recall previous broadcasts
  const historyRef = useRef([]); // ring of past prompts, newest at end
  const historyIdxRef = useRef(-1); // -1 = not browsing history
  const draftRef = useRef(""); // saved draft before entering history mode

  // @mention autocomplete state
  const [mention, setMention] = useState(null); // { fragment, start } | null
  const [activeIdx, setActiveIdx] = useState(0);
  const textareaRef = useRef(null);

  // Playbook panel
  const [showPlaybooks, setShowPlaybooks] = useState(false);
  const { playbooks, savePlaybook, deletePlaybook } = usePlaybooks();

  // Suggestions filtered by the partial fragment the user has typed after @
  const suggestions = mention
    ? workerRepoNames.filter((n) =>
      n.toLowerCase().startsWith(mention.fragment.toLowerCase())
    )
    : [];

  // Targeting pills derived from fully-typed @mentions in the text
  const { matched: targetedRepos, unmatched: unknownMentions } = parseAtMentions(text, workerRepoNames);
  const isTargeted = targetedRepos.length > 0 || unknownMentions.length > 0;
  // Workers that are present but NOT mentioned when targeting is active
  const untargetedRepos = isTargeted
    ? workerRepoNames.filter((n) => !targetedRepos.includes(n))
    : [];

  /** Replace the current @fragment with the chosen repo name. */
  const applySuggestion = useCallback(
    (repoName) => {
      if (!mention) return;
      const cursorPos = textareaRef.current?.selectionStart ?? text.length;
      const newText =
        text.slice(0, mention.start) + "@" + repoName + " " + text.slice(cursorPos);
      setText(newText);
      setMention(null);
      setActiveIdx(0);
      // Restore focus & move cursor after the inserted mention
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const pos = mention.start + repoName.length + 2; // '@' + name + ' '
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(pos, pos);
        }
      });
    },
    [mention, text]
  );

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);
    const cursor = e.target.selectionStart;
    const detected = getMentionAt(val, cursor);
    setMention(detected);
    setActiveIdx(0);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim() || readyCount === 0 || broadcasting) return;
    // Save to compose history before sending
    const trimmed = text.trim();
    if (historyRef.current[historyRef.current.length - 1] !== trimmed) {
      historyRef.current.push(trimmed);
    }
    historyIdxRef.current = -1;
    draftRef.current = "";
    // Pass targetedRepos so the server can filter to only those workers.
    // When no @mentions are present, targetedRepos is empty and the server broadcasts to all.
    onBroadcast(
      trimmed,
      synthesisInstructions.trim() || undefined,
      targetedRepos.length > 0 ? targetedRepos : undefined,
    );
    setText("");
    setSynthesisInstructions("");
    setMention(null);
  };

  const handleKeyDown = (e) => {
    // When the autocomplete dropdown is open, intercept navigation keys
    if (mention && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        applySuggestion(suggestions[activeIdx]);
        return;
      }
      if (e.key === "Escape") {
        setMention(null);
        return;
      }
    }
    // Arrow-up/down compose history (only when caret is at start/end of single-line content)
    if (e.key === "ArrowUp" && !mention) {
      const history = historyRef.current;
      if (history.length === 0) return;
      e.preventDefault();
      if (historyIdxRef.current === -1) {
        // Save current draft before entering history
        draftRef.current = text;
        historyIdxRef.current = history.length - 1;
      } else if (historyIdxRef.current > 0) {
        historyIdxRef.current -= 1;
      }
      setText(history[historyIdxRef.current]);
      setMention(null);
      return;
    }
    if (e.key === "ArrowDown" && historyIdxRef.current !== -1) {
      e.preventDefault();
      const history = historyRef.current;
      if (historyIdxRef.current < history.length - 1) {
        historyIdxRef.current += 1;
        setText(history[historyIdxRef.current]);
      } else {
        // Return to the draft
        historyIdxRef.current = -1;
        setText(draftRef.current);
      }
      setMention(null);
      return;
    }
    // Cmd/Ctrl+Enter to send (regular Enter creates newlines)
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const canSend = readyCount > 0 && !broadcasting;
  // Derive badge appearance from the current worker states.
  // Priority: error > busy/broadcasting > spawning > ready
  const badge =
    errorCount > 0
      ? {
        pill: "bg-red-950/60 border-red-500/25 text-red-300",
        dot: "bg-red-400",
        ping: false,
        label: `${errorCount} of ${totalCount} agent${totalCount !== 1 ? "s" : ""} errored`,
      }
      : broadcasting || busyCount > 0
        ? {
          pill: "bg-amber-950/60 border-amber-500/25 text-amber-300",
          dot: "bg-amber-400",
          ping: true,
          label: `${busyCount} of ${totalCount} agent${totalCount !== 1 ? "s" : ""} busy`,
        }
        : spawningCount > 0
          ? {
            pill: "bg-purple-950/60 border-purple-500/25 text-purple-300",
            dot: "bg-purple-400",
            ping: true,
            label: `${spawningCount} of ${totalCount} agent${totalCount !== 1 ? "s" : ""} spawning`,
          }
          : {
            pill: "bg-emerald-950/60 border-emerald-500/25 text-emerald-300",
            dot: "bg-emerald-400",
            ping: readyCount > 0,
            label: `${readyCount} of ${totalCount} agent${totalCount !== 1 ? "s" : ""} ready`,
          };

  const sendLabel = isTargeted
    ? `Send to ${targetedRepos.length} worker${targetedRepos.length !== 1 ? "s" : ""}`
    : "Broadcast";

  return (
    <div data-testid="broadcast-panel" className="relative rounded-xl p-[1px] bg-gradient-to-r from-teal-500/40 via-blue-500/40 to-purple-500/40">
      <div className="rounded-xl bg-white/[0.03] backdrop-blur-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Radio className="w-4 h-4 text-teal-400" />
          <h2 className="text-sm font-semibold text-gray-200">Broadcast to All Agents</h2>
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <AtSign className="w-3 h-3" />mention a repo name to target
          </span>
          <span className={`ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${badge.pill}`}>
            <span className="relative flex h-2 w-2">
              {badge.ping && (
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${badge.dot} opacity-60`} />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${badge.dot}`} />
            </span>
            {badge.label}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Textarea wrapped in a relative container so the dropdown can be positioned */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Send a prompt to all agents… use @repo-name to target specific workers (Ctrl+Enter to send)"
                disabled={broadcasting}
                rows={2}
                className="w-full bg-white/15 border border-white/25 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-400/50 disabled:opacity-40 transition-all resize-none"
              />

              {/* @mention autocomplete dropdown */}
              {mention && suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-white/15 bg-[#0f1117] shadow-xl overflow-hidden">
                  {suggestions.map((name, i) => (
                    <li
                      key={name}
                      onMouseDown={(e) => {
                        // Use mousedown so the textarea doesn't lose focus before we can read selection
                        e.preventDefault();
                        applySuggestion(name);
                      }}
                      className={`flex items-center gap-2 px-4 py-2 text-sm cursor-pointer transition-colors ${i === activeIdx
                        ? "bg-teal-500/20 text-teal-300"
                        : "text-gray-300 hover:bg-white/5"
                        }`}
                    >
                      <AtSign className="w-3.5 h-3.5 opacity-50" />
                      {name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Playbook button + panel */}
            <div className="relative self-end">
              <button
                type="button"
                data-testid="playbook-toggle"
                onClick={() => setShowPlaybooks((v) => !v)}
                title="Saved playbooks"
                className={`flex items-center gap-1.5 px-3 py-3 rounded-lg text-sm border transition-all ${
                  showPlaybooks
                    ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                    : "bg-white/5 border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/10"
                }`}
              >
                <BookOpen className="w-4 h-4" />
              </button>
              {showPlaybooks && (
                <PlaybookPanel
                  playbooks={playbooks}
                  currentText={text}
                  onLoad={setText}
                  onSave={savePlaybook}
                  onDelete={deletePlaybook}
                  onClose={() => setShowPlaybooks(false)}
                />
              )}
            </div>

            <button
              type="submit"
              data-testid="broadcast-submit"
              disabled={!text.trim() || !canSend || (isTargeted && targetedRepos.length === 0)}
              className="self-end flex items-center gap-2 px-5 py-3 rounded-lg bg-gradient-to-r from-teal-600 to-blue-600 text-white font-medium hover:from-teal-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all whitespace-nowrap"
            >
              {broadcasting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {sendLabel}
            </button>
          </div>

          {/* Targeting pills — visible whenever @mentions are present in the text */}
          {isTargeted && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <span className="text-xs text-gray-500 self-center mr-1">Targeting:</span>
              {targetedRepos.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
                >
                  <AtSign className="w-3 h-3" />{name}
                </span>
              ))}
              {unknownMentions.map((tok) => (
                <span
                  key={tok}
                  title="No loaded worker matches this repo name"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 border border-amber-500/30 text-amber-300"
                >
                  <AtSign className="w-3 h-3" />{tok} ?
                </span>
              ))}
              {untargetedRepos.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/5 border border-white/10 text-gray-500"
                >
                  <AtSign className="w-3 h-3" />{name}
                </span>
              ))}
            </div>
          )}


          {/* Progress bar — visible during active broadcasts */}
          {broadcasting && broadcastProgress && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>
                  {broadcastProgress.completed} of {broadcastProgress.total} agent{broadcastProgress.total !== 1 ? "s" : ""} completed
                </span>
                <span>
                  {Math.round((broadcastProgress.completed / broadcastProgress.total) * 100)}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal-500 to-blue-500 transition-all duration-500"
                  style={{ width: `${(broadcastProgress.completed / broadcastProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Collapsible orchestrator focus — only shown when an orchestrator exists */}
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
                Orchestrator Focus
                <span className="text-[11px] text-gray-500">Orchestrator only &middot; This broadcast</span>
              </button>

              {showSynthesis && (
                <textarea
                  value={synthesisInstructions}
                  onChange={(e) => setSynthesisInstructions(e.target.value)}
                  placeholder="Shape the final synthesis — e.g. 'Create a parent issue that references each child issue URL…'"
                  disabled={broadcasting}
                  rows={2}
                  className="mt-2 w-full bg-teal-950/40 border border-teal-500/30 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400/40 disabled:opacity-40 transition-all resize-none"
                />
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
