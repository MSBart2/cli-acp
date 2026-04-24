import React, { useState } from "react";
import { BookOpen, Trash2, Save, X } from "lucide-react";

/**
 * PlaybookPanel — dropdown that lets users save the current broadcast prompt
 * as a named playbook and load previous playbooks back into the input.
 *
 * @param {{
 *   playbooks: Array<{ id: string, name: string, text: string, savedAt: string }>,
 *   currentText: string,
 *   onLoad: (text: string) => void,
 *   onSave: (name: string, text: string) => void,
 *   onDelete: (id: string) => void,
 *   onClose: () => void
 * }} props
 */
export default function PlaybookPanel({ playbooks, currentText, onLoad, onSave, onDelete, onClose }) {
  const [saveName, setSaveName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const handleSave = () => {
    if (!saveName.trim() || !currentText.trim()) return;
    onSave(saveName, currentText);
    setSaveName("");
  };

  return (
    <div className="absolute bottom-full right-0 mb-2 w-80 rounded-xl bg-[#0d0d14] border border-white/10 shadow-xl shadow-black/50 z-20">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-300">
          <BookOpen className="w-3.5 h-3.5 text-purple-400" />
          Playbooks
        </span>
        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Save current text as a playbook */}
      <div className="px-3 py-2.5 border-b border-white/5">
        <p className="text-xs text-gray-500 mb-1.5">Save current prompt</p>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="Playbook name…"
            maxLength={60}
            className="flex-1 text-xs bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
          />
          <button
            onClick={handleSave}
            disabled={!saveName.trim() || !currentText.trim()}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs bg-purple-600/30 border border-purple-500/30 text-purple-300 hover:bg-purple-600/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-3 h-3" />
            Save
          </button>
        </div>
      </div>

      {/* Saved playbooks list */}
      <div className="max-h-60 overflow-y-auto">
        {playbooks.length === 0 ? (
          <p className="px-3 py-4 text-xs text-gray-600 text-center">No saved playbooks yet.</p>
        ) : (
          <ul className="py-1">
            {playbooks.map((p) => (
              <li key={p.id} className="group flex items-start gap-2 px-3 py-2 hover:bg-white/[0.04] transition-colors">
                <button
                  className="flex-1 text-left"
                  onClick={() => { onLoad(p.text); onClose(); }}
                >
                  <p className="text-xs font-medium text-gray-200 truncate">{p.name}</p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{p.text.slice(0, 60)}{p.text.length > 60 ? "…" : ""}</p>
                </button>
                {confirmDeleteId === p.id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => { onDelete(p.id); setConfirmDeleteId(null); }}
                      className="text-xs text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-red-500/10 transition-colors"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-xs text-gray-500 hover:text-gray-300 px-1 py-0.5 rounded hover:bg-white/5 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(p.id)}
                    className="shrink-0 p-1 rounded text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
