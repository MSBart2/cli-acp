/**
 * Stops all tracked agents while optionally saving the current session snapshot
 * exactly once before teardown begins.
 *
 * Bulk shutdowns must skip per-agent autosaves. Otherwise the final stop would
 * persist an empty `agents` array and wipe out the session's restorable cards.
 *
 * @param {{
 *   agents: Map<string, unknown>,
 *   saveCurrentSession: () => void,
 *   stopAgent: (agentId: string, socket?: object | null, options?: { skipAutoSave?: boolean }) => void,
 *   socket?: object | null,
 *   persistSnapshot?: boolean,
 * }} options
 */
export function shutdownAgents({
  agents,
  saveCurrentSession,
  stopAgent,
  socket = null,
  persistSnapshot = false,
}) {
  if (persistSnapshot) {
    saveCurrentSession();
  }

  for (const agentId of [...agents.keys()]) {
    stopAgent(agentId, socket, { skipAutoSave: true });
  }
}
