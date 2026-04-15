import React from "react";

const STATUS_CONFIGS = {
    worker: {
        ready: { label: "Ready", dot: "bg-green-400", text: "text-green-300", pill: "bg-green-950/60 border-green-500/25", pulse: false },
        busy: { label: "Busy", dot: "bg-amber-400", text: "text-amber-300", pill: "bg-amber-950/60 border-amber-500/25", pulse: true },
        error: { label: "Error", dot: "bg-red-400", text: "text-red-300", pill: "bg-red-950/60 border-red-500/25", pulse: false },
        initializing: { label: "Initializing", dot: "bg-blue-400", text: "text-blue-300", pill: "bg-blue-950/60 border-blue-500/25", pulse: true },
        spawning: { label: "Spawning", dot: "bg-purple-400", text: "text-purple-300", pill: "bg-purple-950/60 border-purple-500/25", pulse: true },
        stopped: { label: "Stopped", dot: "bg-gray-400", text: "text-gray-300", pill: "bg-gray-800/60 border-gray-600/25", pulse: false },
    },
    orchestrator: {
        ready: { label: "Ready", dot: "bg-teal-400", text: "text-teal-300", pill: "bg-teal-950/60 border-teal-500/25", pulse: false },
        busy: { label: "Synthesizing", dot: "bg-amber-400", text: "text-amber-300", pill: "bg-amber-950/60 border-amber-500/25", pulse: true },
        error: { label: "Error", dot: "bg-red-400", text: "text-red-300", pill: "bg-red-950/60 border-red-500/25", pulse: false },
        initializing: { label: "Initializing", dot: "bg-blue-400", text: "text-blue-300", pill: "bg-blue-950/60 border-blue-500/25", pulse: true },
        spawning: { label: "Spawning", dot: "bg-purple-400", text: "text-purple-300", pill: "bg-purple-950/60 border-purple-500/25", pulse: true },
        stopped: { label: "Stopped", dot: "bg-gray-400", text: "text-gray-300", pill: "bg-gray-800/60 border-gray-600/25", pulse: false },
    },
};

/**
 * Pulsing status pill shared between AgentCard and OrchestratorCard.
 *
 * @param {{ status: string, variant?: "worker"|"orchestrator", testId?: string, className?: string }} props
 */
export default function StatusBadge({ status, variant = "worker", testId, className = "" }) {
    const configs = STATUS_CONFIGS[variant] ?? STATUS_CONFIGS.worker;
    const cfg = configs[status] ?? configs.initializing;
    return (
        <span
            data-testid={testId}
            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${cfg.pill} ${cfg.text} ${className}`}
        >
            <span className="relative flex h-2 w-2">
                {cfg.pulse && (
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.dot} opacity-60`} />
                )}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${cfg.dot}`} />
            </span>
            {cfg.label}
        </span>
    );
}
