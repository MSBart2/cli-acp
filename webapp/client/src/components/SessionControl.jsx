import React, { useState, useEffect, useRef } from "react";
import { Save, Archive, Play, Trash2, RotateCw, Check, X } from "lucide-react";

/** Returns a human-readable "X ago" string for a given date. */
function timeAgo(date) {
  const secs = Math.floor((Date.now() - new Date(date)) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export default function SessionControl({ socket }) {
  const [sessions, setSessions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [currentSessionName, setCurrentSessionName] = useState("default");
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [isSaveMode, setIsSaveMode] = useState(false);
  const [saveInput, setSaveInput] = useState("");
  // Tracks which session id is in the "confirm delete" state
  const [pendingDelete, setPendingDelete] = useState(null);
  const deleteTimerRef = useRef(null);
  const saveInputRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    socket.on("session:list", (list) => {
      setSessions(list);
      // Each incoming list reflects the latest auto-save state
      setLastSavedAt(new Date());
    });

    socket.on("session:loaded", ({ name }) => {
      setCurrentSessionName(name);
      setIsOpen(false);
    });

    socket.emit("session:list");

    return () => {
      socket.off("session:list");
      socket.off("session:loaded");
    };
  }, [socket]);

  // Auto-focus the save input when it becomes visible
  useEffect(() => {
    if (isSaveMode) saveInputRef.current?.focus();
  }, [isSaveMode]);

  const openSaveMode = () => {
    setSaveInput(currentSessionName);
    setIsSaveMode(true);
  };

  const commitSave = () => {
    const name = saveInput.trim();
    if (name) {
      socket.emit("session:save", { name });
      setCurrentSessionName(name);
    }
    setIsSaveMode(false);
  };

  const handleLoad = (name, mode) => {
    socket.emit("session:load", { name, mode });
  };

  const handleDeleteClick = (s) => {
    if (pendingDelete === s.id) {
      // Second click within the confirm window — execute delete
      clearTimeout(deleteTimerRef.current);
      socket.emit("session:delete", { name: s.name });
      setPendingDelete(null);
    } else {
      // First click — arm the confirm state, auto-reset after 2 s
      clearTimeout(deleteTimerRef.current);
      setPendingDelete(s.id);
      deleteTimerRef.current = setTimeout(() => setPendingDelete(null), 2000);
    }
  };

  return (
    <div className="relative flex items-center gap-2">
      {/* Current session trigger + auto-saved indicator */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { socket.emit("session:list"); setIsOpen((o) => !o); }}
          className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-md hover:bg-white/10 transition-colors text-xs text-gray-300"
        >
          <Archive className="w-3.5 h-3.5" />
          <span className="max-w-[100px] truncate">{currentSessionName}</span>
        </button>
        {lastSavedAt && (
          <span className="text-[10px] text-gray-600 whitespace-nowrap hidden sm:inline">
            auto-saved {timeAgo(lastSavedAt)}
          </span>
        )}
      </div>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-[#0a0a0a] border border-white/10 rounded-lg shadow-xl backdrop-blur-xl z-50 p-2 max-h-96 overflow-y-auto">
          {/* Header: inline save input or "Save as…" button */}
          <div className="flex items-center justify-between mb-2 px-2">
            <span className="text-xs font-semibold text-gray-400">Saved Sessions</span>
            {isSaveMode ? (
              <div className="flex items-center gap-1">
                <input
                  ref={saveInputRef}
                  value={saveInput}
                  onChange={(e) => setSaveInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitSave();
                    if (e.key === "Escape") setIsSaveMode(false);
                  }}
                  className="text-xs bg-white/10 border border-white/20 rounded px-2 py-0.5 text-white w-32 outline-none focus:border-purple-500/50"
                  placeholder="Session name"
                />
                <button onClick={commitSave} className="p-0.5 text-green-400 hover:text-green-300 transition-colors" title="Confirm save">
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setIsSaveMode(false)} className="p-0.5 text-gray-500 hover:text-gray-300 transition-colors" title="Cancel">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={openSaveMode}
                className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded hover:bg-purple-500/30 transition-colors flex items-center gap-1"
              >
                <Save className="w-3 h-3" /> Save as…
              </button>
            )}
          </div>

          {/* Session rows */}
          <div className="flex flex-col gap-1">
            {sessions.length === 0 ? (
              <div className="text-xs text-gray-500 px-2 py-2 italic">No saved sessions</div>
            ) : (
              sessions.map((s) => {
                const confirming = pendingDelete === s.id;
                const { agentCount = 0, workItemCount = 0, broadcastCount = 0 } = s.summary ?? {};
                return (
                  <div key={s.id} className="group/item flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 rounded transition-colors">
                    {/* Session name + metadata pills */}
                    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                      <span className="text-xs text-gray-300 truncate">{s.name}</span>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-gray-600">{timeAgo(s.updatedAt)}</span>
                        {agentCount > 0 && (
                          <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1 rounded">{agentCount} agents</span>
                        )}
                        {workItemCount > 0 && (
                          <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1 rounded">{workItemCount} items</span>
                        )}
                        {broadcastCount > 0 && (
                          <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1 rounded">{broadcastCount} broadcasts</span>
                        )}
                      </div>
                    </div>
                    {/* Row actions — visible on hover */}
                    <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => handleLoad(s.name, "ui")}
                        className="p-1 bg-green-500/20 text-green-300 rounded hover:bg-green-500/30 transition-colors"
                        title="Restore (UI only)"
                      >
                        <Play className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleLoad(s.name, "respawn")}
                        className="p-1 bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30 transition-colors"
                        title="Re-spawn agents"
                      >
                        <RotateCw className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(s)}
                        className={`p-1 rounded transition-colors ${
                          confirming
                            ? "bg-red-500/40 text-red-300 animate-pulse"
                            : "bg-red-500/10 text-red-400 hover:bg-red-500/30"
                        }`}
                        title={confirming ? "Click again to confirm delete" : "Delete session"}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
