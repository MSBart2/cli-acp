import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// cleanupOrphanedResolvers — extracted algorithm for testability
//
// This models the disconnect cleanup logic that lives inside the
// `io.on("connection", socket => { socket.on("disconnect", ...) })` closure
// in server/index.js.  Because that module has many side effects it cannot
// be imported in isolation, so we test the algorithm directly here.
// ---------------------------------------------------------------------------

/**
 * When a socket disconnects while one of its agents still holds an unresolved
 * permission prompt, we must resolve it (deny-style) so the ACP child process
 * is not left blocked forever.
 *
 * @param {Map<string, object>} agents          - Live agents map
 * @param {string}              disconnectedSocketId
 * @param {(agentId: string) => void} stopAgentFn
 */
function cleanupOrphanedResolvers(agents, disconnectedSocketId, stopAgentFn) {
  for (const [agentId, agent] of agents) {
    if (agent.socketId === disconnectedSocketId && agent.permissionResolver) {
      const denyOption = agent.pendingPermissionOptions?.find(
        (o) => o.kind === "block" || o.kind === "deny",
      );
      const fallbackOption = agent.pendingPermissionOptions?.[0];
      const optionId = denyOption?.optionId ?? fallbackOption?.optionId;
      if (optionId) {
        agent.permissionResolver({ outcome: { outcome: "selected", optionId } });
      } else {
        stopAgentFn(agentId);
      }
      agent.permissionResolver = null;
      agent.pendingPermissionOptions = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("cleanupOrphanedResolvers", () => {
  // -------------------------------------------------------------------------
  // 1. Deny / block option is selected when available
  // -------------------------------------------------------------------------

  it("calls the resolver with the block-kind optionId when a block option is present", () => {
    const resolver = vi.fn();
    const stopAgent = vi.fn();

    const agents = new Map([
      [
        "agent-1",
        {
          socketId: "socket-abc",
          permissionResolver: resolver,
          pendingPermissionOptions: [
            { optionId: "opt-allow", kind: "allow" },
            { optionId: "opt-block", kind: "block" },
          ],
        },
      ],
    ]);

    cleanupOrphanedResolvers(agents, "socket-abc", stopAgent);

    expect(resolver).toHaveBeenCalledOnce();
    expect(resolver).toHaveBeenCalledWith({
      outcome: { outcome: "selected", optionId: "opt-block" },
    });
    expect(stopAgent).not.toHaveBeenCalled();
  });

  it("clears permissionResolver and pendingPermissionOptions after resolving", () => {
    const resolver = vi.fn();
    const agent = {
      socketId: "socket-abc",
      permissionResolver: resolver,
      pendingPermissionOptions: [{ optionId: "opt-block", kind: "block" }],
    };
    const agents = new Map([["agent-1", agent]]);

    cleanupOrphanedResolvers(agents, "socket-abc", vi.fn());

    expect(agent.permissionResolver).toBeNull();
    expect(agent.pendingPermissionOptions).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 2. Falls back to the first option when no deny/block option exists
  // -------------------------------------------------------------------------

  it("calls the resolver with the first optionId when no block/deny option is present", () => {
    const resolver = vi.fn();
    const stopAgent = vi.fn();

    const agents = new Map([
      [
        "agent-2",
        {
          socketId: "socket-xyz",
          permissionResolver: resolver,
          pendingPermissionOptions: [
            { optionId: "opt-always-allow", kind: "always-allow" },
            { optionId: "opt-allow", kind: "allow" },
          ],
        },
      ],
    ]);

    cleanupOrphanedResolvers(agents, "socket-xyz", stopAgent);

    expect(resolver).toHaveBeenCalledOnce();
    expect(resolver).toHaveBeenCalledWith({
      outcome: { outcome: "selected", optionId: "opt-always-allow" },
    });
    expect(stopAgent).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. stopAgent called when there are no options at all
  // -------------------------------------------------------------------------

  it("calls stopAgentFn with the agentId when pendingPermissionOptions is null", () => {
    const resolver = vi.fn();
    const stopAgent = vi.fn();

    const agents = new Map([
      [
        "agent-3",
        {
          socketId: "socket-null-opts",
          permissionResolver: resolver,
          pendingPermissionOptions: null,
        },
      ],
    ]);

    cleanupOrphanedResolvers(agents, "socket-null-opts", stopAgent);

    expect(stopAgent).toHaveBeenCalledOnce();
    expect(stopAgent).toHaveBeenCalledWith("agent-3");
    // Resolver should NOT have been called — stopAgent handles teardown
    expect(resolver).not.toHaveBeenCalled();
  });

  it("calls stopAgentFn with the agentId when pendingPermissionOptions is an empty array", () => {
    const stopAgent = vi.fn();

    const agents = new Map([
      [
        "agent-4",
        {
          socketId: "socket-empty-opts",
          permissionResolver: vi.fn(),
          pendingPermissionOptions: [],
        },
      ],
    ]);

    cleanupOrphanedResolvers(agents, "socket-empty-opts", stopAgent);

    expect(stopAgent).toHaveBeenCalledWith("agent-4");
  });

  // -------------------------------------------------------------------------
  // 4. Only the agent matching the disconnected socket is cleaned up
  // -------------------------------------------------------------------------

  it("only resolves the agent whose socketId matches the disconnecting socket", () => {
    const resolverA = vi.fn();
    const resolverB = vi.fn();
    const stopAgent = vi.fn();

    const agents = new Map([
      [
        "agent-a",
        {
          socketId: "socket-disconnecting",
          permissionResolver: resolverA,
          pendingPermissionOptions: [{ optionId: "opt-deny", kind: "deny" }],
        },
      ],
      [
        "agent-b",
        {
          socketId: "socket-still-connected",
          permissionResolver: resolverB,
          pendingPermissionOptions: [{ optionId: "opt-allow", kind: "allow" }],
        },
      ],
    ]);

    cleanupOrphanedResolvers(agents, "socket-disconnecting", stopAgent);

    expect(resolverA).toHaveBeenCalledOnce();
    expect(resolverB).not.toHaveBeenCalled();
    expect(stopAgent).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. Agents without a pending resolver are skipped silently
  // -------------------------------------------------------------------------

  it("does not call resolver or stopAgent when the agent has no permissionResolver", () => {
    const stopAgent = vi.fn();

    const agents = new Map([
      [
        "agent-no-resolver",
        {
          socketId: "socket-abc",
          permissionResolver: null,
          pendingPermissionOptions: [{ optionId: "opt-block", kind: "block" }],
        },
      ],
    ]);

    // Should not throw or call anything
    expect(() =>
      cleanupOrphanedResolvers(agents, "socket-abc", stopAgent),
    ).not.toThrow();
    expect(stopAgent).not.toHaveBeenCalled();
  });

  it("does nothing when no agents match the disconnecting socket", () => {
    const resolver = vi.fn();
    const stopAgent = vi.fn();

    const agents = new Map([
      [
        "agent-other",
        {
          socketId: "socket-different",
          permissionResolver: resolver,
          pendingPermissionOptions: [{ optionId: "opt-block", kind: "block" }],
        },
      ],
    ]);

    cleanupOrphanedResolvers(agents, "socket-never-seen", stopAgent);

    expect(resolver).not.toHaveBeenCalled();
    expect(stopAgent).not.toHaveBeenCalled();
  });
});
