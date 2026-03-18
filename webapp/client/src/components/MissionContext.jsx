import { useState, useEffect } from "react";
import { Target } from "lucide-react";

export default function MissionContext({ value, onChange }) {
  const [expanded, setExpanded] = useState(!!value);

  // Auto-expand when a value is pushed in from the server
  useEffect(() => {
    if (value) setExpanded(true);
  }, [value]);

  const handleClear = () => {
    onChange("");
    setExpanded(false);
  };

  return (
    <div className="bg-purple-950/20 border-b border-purple-500/15 px-4 sm:px-6 lg:px-8 py-2">
      {!expanded ? (
        /* ── Collapsed / empty prompt ── */
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors group w-full"
        >
          <Target className="w-4 h-4 text-purple-400/50 group-hover:text-purple-400 transition-colors" />
          <span className="italic">Add mission context…</span>
          <span className="ml-1 w-5 h-5 rounded flex items-center justify-center bg-white/5 border border-white/10 text-gray-400 group-hover:border-purple-500/40 group-hover:text-purple-300 transition-colors text-xs leading-none">
            +
          </span>
        </button>
      ) : (
        /* ── Expanded / active state ── */
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs text-purple-400/70 font-medium tracking-wide uppercase">
              <Target className="w-3.5 h-3.5" />
              Mission Context
            </div>
            <div className="flex items-center gap-3">
              {value.length > 0 && (
                <span className="text-xs text-gray-600">{value.length} chars</span>
              )}
              <button
                onClick={handleClear}
                aria-label="Clear mission context"
                className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-gray-200 hover:bg-white/10 transition-colors text-sm leading-none"
              >
                ×
              </button>
            </div>
          </div>
          <textarea
            autoFocus
            rows={3}
            placeholder="e.g. We are migrating auth to Clerk. Use JWTs."
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full resize-y bg-white/5 border border-purple-500/20 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-colors"
          />
        </div>
      )}
    </div>
  );
}
