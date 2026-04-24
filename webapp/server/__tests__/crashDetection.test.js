import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Post-init crash detection — extracted algorithm for testability
//
// The crash watcher is a once("close") listener attached to the copilot
// child process after createAgent succeeds. It can't be tested by importing
// server/index.js (side effects), so we model the algorithm here.
// ---------------------------------------------------------------------------

/**
 * Mirrors the once("close") listener registered in createAgent after the agent
 * reaches "ready". Handles unexpected process death: updates agent status,
 * appends a crash event to the log, notifies the client, and removes the
 * agent from the registry.
 *
 * @param {string}   agentId
 * @param {Map}      agents       - Live agents map
 * @param {object}   socket       - Socket.IO socket
 * @param {number|null} code      - Process exit code
 */
function handleProcessClose(agentId, agents, socket, code) {
  const current = agents.get(agentId);
  // Ignore intentional stops and already-removed entries
  if (!current || current.status === "stopped") return;

  const msg = `Copilot process exited unexpectedly (code ${code ?? "null"})`;
  current.status = "error";
  current.eventLog?.push({ timestamp: new Date().toISOString(), type: "crash", content: { code } });
  socket.emit("agent:error", { agentId, error: msg });
  agents.delete(agentId);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleProcessClose (crash watcher)", () => {
  function makeAgent(overrides = {}) {
    return {
      status: "ready",
      eventLog: [],
      repoName: "my-repo",
      ...overrides,
    };
  }

  function makeSocket() {
    return { emit: vi.fn() };
  }

  it("sets agent status to error and removes it from the map on unexpected close", () => {
    const agents = new Map([["agent-1", makeAgent()]]);
    const socket = makeSocket();

    handleProcessClose("agent-1", agents, socket, 1);

    expect(agents.has("agent-1")).toBe(false);
  });

  it("emits agent:error with the expected message on unexpected close", () => {
    const agents = new Map([["agent-1", makeAgent()]]);
    const socket = makeSocket();

    handleProcessClose("agent-1", agents, socket, 1);

    expect(socket.emit).toHaveBeenCalledWith("agent:error", {
      agentId: "agent-1",
      error: "Copilot process exited unexpectedly (code 1)",
    });
  });

  it("includes the exit code in the error message", () => {
    const agents = new Map([["agent-1", makeAgent()]]);
    const socket = makeSocket();

    handleProcessClose("agent-1", agents, socket, 137);

    const [, payload] = socket.emit.mock.calls[0];
    expect(payload.error).toContain("137");
  });

  it("uses 'null' when exit code is null (signal kill)", () => {
    const agents = new Map([["agent-1", makeAgent()]]);
    const socket = makeSocket();

    handleProcessClose("agent-1", agents, socket, null);

    const [, payload] = socket.emit.mock.calls[0];
    expect(payload.error).toContain("null");
    expect(socket.emit).toHaveBeenCalledTimes(1);
  });

  it("appends a crash event to the agent eventLog", () => {
    const agent = makeAgent({ eventLog: [] });
    const agents = new Map([["agent-1", agent]]);
    const socket = makeSocket();

    handleProcessClose("agent-1", agents, socket, 2);

    // After deletion the ref still holds the object
    expect(agent.eventLog).toHaveLength(1);
    expect(agent.eventLog[0].type).toBe("crash");
    expect(agent.eventLog[0].content).toEqual({ code: 2 });
    expect(agent.eventLog[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("does nothing when the agent has already been stopped", () => {
    const agents = new Map([["agent-1", makeAgent({ status: "stopped" })]]);
    const socket = makeSocket();

    handleProcessClose("agent-1", agents, socket, 0);

    expect(socket.emit).not.toHaveBeenCalled();
    // Agent not deleted — stopAgent owns cleanup in this path
    expect(agents.has("agent-1")).toBe(true);
  });

  it("does nothing when the agent is not in the map (already cleaned up)", () => {
    const agents = new Map();
    const socket = makeSocket();

    expect(() => handleProcessClose("agent-1", agents, socket, 1)).not.toThrow();
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it("does not throw when agent has no eventLog", () => {
    const agents = new Map([["agent-1", makeAgent({ eventLog: undefined })]]);
    const socket = makeSocket();

    expect(() => handleProcessClose("agent-1", agents, socket, 1)).not.toThrow();
  });

  it("handles a busy agent crashing mid-prompt", () => {
    const agents = new Map([["agent-1", makeAgent({ status: "busy", eventLog: [] })]]);
    const socket = makeSocket();

    handleProcessClose("agent-1", agents, socket, 1);

    expect(agents.has("agent-1")).toBe(false);
    expect(socket.emit).toHaveBeenCalledWith("agent:error", expect.objectContaining({ agentId: "agent-1" }));
  });
});
