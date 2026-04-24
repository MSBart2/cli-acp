import { describe, expect, it, vi } from "vitest";

import { shutdownAgents } from "../sessionLifecycle.js";

describe("shutdownAgents", () => {
  it("saves once before bulk shutdown and skips per-agent autosaves", () => {
    const agents = new Map([
      ["agent-1", {}],
      ["agent-2", {}],
    ]);
    const saveCurrentSession = vi.fn();
    const stopAgent = vi.fn((agentId) => {
      agents.delete(agentId);
    });
    const socket = { emit: vi.fn() };

    shutdownAgents({
      agents,
      saveCurrentSession,
      stopAgent,
      socket,
      persistSnapshot: true,
    });

    expect(saveCurrentSession).toHaveBeenCalledTimes(1);
    expect(stopAgent).toHaveBeenCalledTimes(2);
    expect(stopAgent).toHaveBeenNthCalledWith(1, "agent-1", socket, {});
    expect(stopAgent).toHaveBeenNthCalledWith(2, "agent-2", socket, {});
    expect(agents.size).toBe(0);
  });

  it("can bulk shutdown without persisting a snapshot first", () => {
    const agents = new Map([["agent-1", {}]]);
    const saveCurrentSession = vi.fn();
    const stopAgent = vi.fn();

    shutdownAgents({
      agents,
      saveCurrentSession,
      stopAgent,
      persistSnapshot: false,
    });

    expect(saveCurrentSession).not.toHaveBeenCalled();
    expect(stopAgent).toHaveBeenCalledWith("agent-1", null, {});
  });
});
