import React from "react";

/**
 * Renders a list of agent output entries (text, tool_call, error).
 * Used by both AgentCard (variant="worker") and OrchestratorCard (variant="orchestrator").
 *
 * @param {{ entries: Array<{type: string, content?: string, name?: string, args?: any}>, variant?: "worker"|"orchestrator" }} props
 */
export default function OutputLog({ entries, variant = "worker" }) {
    return (
        <>
            {entries.map((entry, i) => {
                if (entry.type === "text") {
                    return (
                        <div
                            key={i}
                            className={
                                variant === "orchestrator"
                                    ? "text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed"
                                    : "text-gray-200 whitespace-pre-wrap break-words"
                            }
                        >
                            {entry.content}
                        </div>
                    );
                }
                if (entry.type === "tool_call") {
                    return variant === "orchestrator" ? (
                        <div key={i} className="text-xs text-cyan-400/80 font-mono flex items-center gap-1.5">
                            <span className="text-cyan-500">⚡</span>
                            {entry.name}
                            {entry.args && <span className="text-gray-500 ml-1">({entry.args})</span>}
                        </div>
                    ) : (
                        <div key={i} className="text-teal-300 my-1.5 flex items-center gap-1">
                            <span>🔧 </span>
                            <span className="font-semibold">{entry.name}</span>
                            {entry.args && (
                                <span className="text-gray-400 ml-1 text-xs">
                                    ({typeof entry.args === "string" ? entry.args : JSON.stringify(entry.args)})
                                </span>
                            )}
                        </div>
                    );
                }
                if (entry.type === "error") {
                    return (
                        <div key={i} className={`my-1.5 flex items-center gap-1 ${variant === "orchestrator" ? "text-sm text-red-400" : "text-red-300"}`}>
                            {variant !== "orchestrator" && <span>⚠</span>}
                            <span>{entry.content}</span>
                        </div>
                    );
                }
                return null;
            })}
        </>
    );
}
