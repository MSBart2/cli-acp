import { vi, describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { act } from "@testing-library/react";

import { useAgentSocket } from "../hooks/useAgentSocket.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock socket that records all registered handlers so tests can
 * simulate events by calling them directly.
 */
function makeMockSocket() {
  const handlers = {};
  return {
    on: vi.fn((event, handler) => {
      // Note: the hook registers "connect" twice (once for setConnected, once
      // for re-requesting state). We store the latest for simplicity, but we
      // also keep the array form for events with multiple handlers.
      if (!handlers[event]) {
        handlers[event] = [];
      }
      handlers[event].push(handler);
    }),
    off: vi.fn(),
    emit: vi.fn(),
    // Fire all handlers registered for an event
    _emit: (event, data) => {
      (handlers[event] || []).forEach((h) => h(data));
    },
    _handlers: handlers,
  };
}

function makeSetters() {
  return {
    setAgents: vi.fn(),
    setConnected: vi.fn(),
    setBroadcasting: vi.fn(),
    setBroadcastResults: vi.fn(),
    setBroadcastProgress: vi.fn(),
    setWorkItems: vi.fn(),
    setBroadcastHistory: vi.fn(),
    setDepGraph: vi.fn(),
    setUnloadedDeps: vi.fn(),
    setMissionContext: vi.fn(),
    setRoutingPlan: vi.fn(),
    setRepoBaseDir: vi.fn(),
    setReuseExisting: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useAgentSocket", () => {
  let socket;
  let setters;

  beforeEach(() => {
    socket = makeMockSocket();
    setters = makeSetters();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Registration — "connect" and "disconnect" are wired
  // -------------------------------------------------------------------------

  it("subscribes to connect and disconnect events on mount", () => {
    renderHook(() => useAgentSocket(socket, setters));

    const registeredEvents = socket.on.mock.calls.map(([event]) => event);
    expect(registeredEvents).toContain("connect");
    expect(registeredEvents).toContain("disconnect");
  });

  // -------------------------------------------------------------------------
  // 2. connect → setConnected(true), disconnect → setConnected(false)
  // -------------------------------------------------------------------------

  it("calls setConnected(true) when the connect event fires", () => {
    renderHook(() => useAgentSocket(socket, setters));

    act(() => socket._emit("connect"));

    expect(setters.setConnected).toHaveBeenCalledWith(true);
  });

  it("calls setConnected(false) when the disconnect event fires", () => {
    renderHook(() => useAgentSocket(socket, setters));

    act(() => socket._emit("disconnect"));

    expect(setters.setConnected).toHaveBeenCalledWith(false);
  });

  // -------------------------------------------------------------------------
  // 3. agent:stopped removes the agent from state
  // -------------------------------------------------------------------------

  it("agent:stopped calls setAgents with a function that deletes the agentId key", () => {
    renderHook(() => useAgentSocket(socket, setters));

    act(() => socket._emit("agent:stopped", { agentId: "agent-42" }));

    // setAgents must have been called with a function (state updater)
    expect(setters.setAgents).toHaveBeenCalledWith(expect.any(Function));

    // Invoke the updater with a fake state map and verify the key is removed
    const updater = setters.setAgents.mock.calls.at(-1)[0];
    const prevState = { "agent-42": { repoName: "my-repo" }, "agent-99": {} };
    const nextState = updater(prevState);

    expect(nextState).not.toHaveProperty("agent-42");
    expect(nextState).toHaveProperty("agent-99");
  });

  // -------------------------------------------------------------------------
  // 4. Cleanup — socket.off called for all registered events
  // -------------------------------------------------------------------------

  it("cleanup calls socket.off for connect, disconnect, agent:stopped, and agent:permission_request", () => {
    const { unmount } = renderHook(() => useAgentSocket(socket, setters));

    // Trigger the useEffect cleanup
    unmount();

    const offEvents = socket.off.mock.calls.map(([event]) => event);
    expect(offEvents).toContain("connect");
    expect(offEvents).toContain("disconnect");
    expect(offEvents).toContain("agent:stopped");
    expect(offEvents).toContain("agent:permission_request");
  });

  it("cleanup calls socket.off for at least 10 distinct events", () => {
    const { unmount } = renderHook(() => useAgentSocket(socket, setters));
    unmount();

    const offEvents = new Set(socket.off.mock.calls.map(([event]) => event));
    expect(offEvents.size).toBeGreaterThanOrEqual(10);
  });

  // -------------------------------------------------------------------------
  // 5. agent:permission_request adds pendingPermission to the agent
  // -------------------------------------------------------------------------

  it("agent:permission_request adds pendingPermission to the matching agent", () => {
    renderHook(() => useAgentSocket(socket, setters));

    act(() =>
      socket._emit("agent:permission_request", {
        agentId: "agent-7",
        title: "Create file?",
        options: [{ optionId: "opt-1", label: "Allow" }],
      }),
    );

    expect(setters.setAgents).toHaveBeenCalledWith(expect.any(Function));

    // Run the updater against a fake agents map that contains the target agent
    const updater = setters.setAgents.mock.calls.at(-1)[0];
    const prevState = {
      "agent-7": { repoName: "test-repo", output: [] },
    };
    const nextState = updater(prevState);

    expect(nextState["agent-7"].pendingPermission).toEqual({
      title: "Create file?",
      options: [{ optionId: "opt-1", label: "Allow" }],
    });
  });

  it("agent:permission_request is a no-op when the agentId does not exist in state", () => {
    renderHook(() => useAgentSocket(socket, setters));

    act(() =>
      socket._emit("agent:permission_request", {
        agentId: "agent-unknown",
        title: "Do something?",
        options: [],
      }),
    );

    const updater = setters.setAgents.mock.calls.at(-1)[0];
    const prevState = { "agent-7": {} };
    const nextState = updater(prevState);

    // State should be returned unchanged when the agent isn't found
    expect(nextState).toBe(prevState);
  });

  // -------------------------------------------------------------------------
  // Additional smoke — other key events are wired
  // -------------------------------------------------------------------------

  it("subscribes to agent:update, agent:created, workitems:updated, and graph:updated", () => {
    renderHook(() => useAgentSocket(socket, setters));

    const registeredEvents = socket.on.mock.calls.map(([event]) => event);
    expect(registeredEvents).toContain("agent:update");
    expect(registeredEvents).toContain("agent:created");
    expect(registeredEvents).toContain("workitems:updated");
    expect(registeredEvents).toContain("graph:updated");
  });

  it("agent:prompt_all_complete clears the broadcasting flag and progress", () => {
    renderHook(() => useAgentSocket(socket, setters));

    act(() => socket._emit("agent:prompt_all_complete"));

    expect(setters.setBroadcasting).toHaveBeenCalledWith(false);
    expect(setters.setBroadcastProgress).toHaveBeenCalledWith(null);
  });

  // -------------------------------------------------------------------------
  // agent:update — text merging
  // -------------------------------------------------------------------------

  it("agent:update merges consecutive text chunks into one output entry", () => {
    renderHook(() => useAgentSocket(socket, setters));

    // Seed agent state
    const agentState = { "a1": { repoName: "r", output: [], status: "busy" } };

    act(() => socket._emit("agent:update", { agentId: "a1", type: "text", content: "Hello " }));
    const updater1 = setters.setAgents.mock.calls.at(-1)[0];
    const after1 = updater1(agentState);

    act(() => socket._emit("agent:update", { agentId: "a1", type: "text", content: "World" }));
    const updater2 = setters.setAgents.mock.calls.at(-1)[0];
    const after2 = updater2(after1);

    // Two consecutive text updates should be merged into a single entry
    expect(after2["a1"].output).toHaveLength(1);
    expect(after2["a1"].output[0]).toEqual({ type: "text", content: "Hello World" });
  });

  it("agent:update appends new text entry after a tool_call entry", () => {
    renderHook(() => useAgentSocket(socket, setters));

    const agentState = {
      "a1": { repoName: "r", output: [{ type: "tool_call", name: "run", args: "ok" }], status: "busy" },
    };

    act(() => socket._emit("agent:update", { agentId: "a1", type: "text", content: "Result" }));
    const updater = setters.setAgents.mock.calls.at(-1)[0];
    const after = updater(agentState);

    expect(after["a1"].output).toHaveLength(2);
    expect(after["a1"].output[1]).toEqual({ type: "text", content: "Result" });
  });

  // -------------------------------------------------------------------------
  // agent:update — tool_call and tool_call_update
  // -------------------------------------------------------------------------

  it("agent:update handles tool_call type", () => {
    renderHook(() => useAgentSocket(socket, setters));

    const agentState = { "a1": { repoName: "r", output: [], status: "busy" } };

    act(() => socket._emit("agent:update", {
      agentId: "a1",
      type: "tool_call",
      content: { title: "readFile", status: "running" },
    }));

    const updater = setters.setAgents.mock.calls.at(-1)[0];
    const after = updater(agentState);

    expect(after["a1"].output).toHaveLength(1);
    expect(after["a1"].output[0]).toEqual({ type: "tool_call", name: "readFile", args: "running" });
  });

  it("agent:update handles tool_call_update type", () => {
    renderHook(() => useAgentSocket(socket, setters));

    const agentState = { "a1": { repoName: "r", output: [], status: "busy" } };

    act(() => socket._emit("agent:update", {
      agentId: "a1",
      type: "tool_call_update",
      content: { toolCallId: "tc-1", status: "completed" },
    }));

    const updater = setters.setAgents.mock.calls.at(-1)[0];
    const after = updater(agentState);

    expect(after["a1"].output[0]).toEqual({ type: "tool_call", name: "tc-1", args: "completed" });
  });

  it("agent:update handles status type", () => {
    renderHook(() => useAgentSocket(socket, setters));

    const agentState = { "a1": { repoName: "r", output: [], status: "busy" } };

    act(() => socket._emit("agent:update", { agentId: "a1", type: "status", content: "ready" }));
    const updater = setters.setAgents.mock.calls.at(-1)[0];
    const after = updater(agentState);

    expect(after["a1"].status).toBe("ready");
  });

  it("agent:update is a no-op for unknown agentId", () => {
    renderHook(() => useAgentSocket(socket, setters));

    act(() => socket._emit("agent:update", { agentId: "unknown", type: "text", content: "hi" }));
    const updater = setters.setAgents.mock.calls.at(-1)[0];
    const state = { "a1": { output: [] } };
    expect(updater(state)).toBe(state);
  });

  // -------------------------------------------------------------------------
  // agent:error
  // -------------------------------------------------------------------------

  it("agent:error sets status to error and appends error to output", () => {
    renderHook(() => useAgentSocket(socket, setters));

    const agentState = { "a1": { repoName: "r", output: [{ type: "text", content: "hi" }], status: "busy" } };

    act(() => socket._emit("agent:error", { agentId: "a1", error: "Process crashed" }));
    const updater = setters.setAgents.mock.calls.at(-1)[0];
    const after = updater(agentState);

    expect(after["a1"].status).toBe("error");
    expect(after["a1"].output).toHaveLength(2);
    expect(after["a1"].output[1]).toEqual({ type: "error", content: "Process crashed" });
  });

  it("agent:error is a no-op when agent not found", () => {
    renderHook(() => useAgentSocket(socket, setters));

    act(() => socket._emit("agent:error", { agentId: "missing", error: "fail" }));
    const updater = setters.setAgents.mock.calls.at(-1)[0];
    const state = { "a1": {} };
    expect(updater(state)).toBe(state);
  });

  // -------------------------------------------------------------------------
  // agent:permission_request with auto-approval
  // -------------------------------------------------------------------------

  it("agent:permission_request auto-approves when preset is allow-all", () => {
    renderHook(() =>
      useAgentSocket(socket, setters, { permissionPreset: "allow-all" }),
    );

    act(() =>
      socket._emit("agent:permission_request", {
        agentId: "a1",
        title: "Write file",
        options: [{ optionId: "opt-1", name: "Allow", kind: "allow_once" }],
      }),
    );

    // Should have emitted a permission response, NOT called setAgents
    expect(socket.emit).toHaveBeenCalledWith("agent:permission_response", {
      agentId: "a1",
      optionId: "opt-1",
    });
  });

  // -------------------------------------------------------------------------
  // agent:prompt_complete
  // -------------------------------------------------------------------------

  it("agent:prompt_complete sets agent status to ready", () => {
    renderHook(() => useAgentSocket(socket, setters));

    act(() => socket._emit("agent:prompt_complete", { agentId: "a1" }));
    const updater = setters.setAgents.mock.calls.at(-1)[0];
    const after = updater({ "a1": { status: "busy", output: [] } });
    expect(after["a1"].status).toBe("ready");
  });

  // -------------------------------------------------------------------------
  // graph:updated
  // -------------------------------------------------------------------------

  it("graph:updated updates dep graph and agent unloadedDeps", () => {
    renderHook(() => useAgentSocket(socket, setters));

    act(() => socket._emit("graph:updated", {
      nodes: [{ agentId: "a1" }],
      edges: [],
      unloadedDeps: [{ agentId: "a1", missing: ["dep-x"] }],
    }));

    expect(setters.setDepGraph).toHaveBeenCalled();
    expect(setters.setUnloadedDeps).toHaveBeenCalledWith({ "a1": ["dep-x"] });

    const agentUpdater = setters.setAgents.mock.calls.at(-1)[0];
    const after = agentUpdater({ "a1": { repoName: "r", manifestMissing: true } });
    expect(after["a1"].unloadedDeps).toEqual(["dep-x"]);
    expect(after["a1"].manifestMissing).toBe(false); // cleared because agentId is in graph nodes
  });

  // -------------------------------------------------------------------------
  // graph:manifest_missing
  // -------------------------------------------------------------------------

  it("graph:manifest_missing sets manifestMissing on the agent", () => {
    renderHook(() => useAgentSocket(socket, setters));

    act(() => socket._emit("graph:manifest_missing", { agentId: "a1" }));
    const updater = setters.setAgents.mock.calls.at(-1)[0];
    const after = updater({ "a1": { repoName: "r" } });
    expect(after["a1"].manifestMissing).toBe(true);
  });

  // -------------------------------------------------------------------------
  // mission:updated
  // -------------------------------------------------------------------------

  it("mission:updated sets mission context", () => {
    renderHook(() => useAgentSocket(socket, setters));

    act(() => socket._emit("mission:updated", { text: "Build the thing" }));
    expect(setters.setMissionContext).toHaveBeenCalledWith("Build the thing");
  });

  // -------------------------------------------------------------------------
  // session:loaded
  // -------------------------------------------------------------------------

  it("session:loaded restores settings and clears transient state", () => {
    renderHook(() => useAgentSocket(socket, setters));

    act(() => socket._emit("session:loaded", {
      settings: { repoBaseDir: "/restored", reuseExisting: true },
    }));

    expect(setters.setRepoBaseDir).toHaveBeenCalledWith("/restored");
    expect(setters.setReuseExisting).toHaveBeenCalledWith(true);
    expect(setters.setBroadcastResults).toHaveBeenCalledWith(null);
    expect(setters.setBroadcastProgress).toHaveBeenCalledWith(null);
    expect(setters.setRoutingPlan).toHaveBeenCalledWith(null);
    expect(socket.emit).toHaveBeenCalledWith("graph:list");
  });

  // -------------------------------------------------------------------------
  // orchestrator:routing_plan
  // -------------------------------------------------------------------------

  it("orchestrator:routing_plan sets routing plan", () => {
    renderHook(() => useAgentSocket(socket, setters));

    const plan = { routes: [{ agentId: "a1", task: "docs" }] };
    act(() => socket._emit("orchestrator:routing_plan", plan));
    expect(setters.setRoutingPlan).toHaveBeenCalledWith(plan);
  });

  // -------------------------------------------------------------------------
  // workitems:updated and broadcast:history
  // -------------------------------------------------------------------------

  it("workitems:updated calls setWorkItems", () => {
    renderHook(() => useAgentSocket(socket, setters));

    act(() => socket._emit("workitems:updated", { items: [{ id: 1 }] }));
    expect(setters.setWorkItems).toHaveBeenCalledWith([{ id: 1 }]);
  });

  it("broadcast:history calls setBroadcastHistory", () => {
    renderHook(() => useAgentSocket(socket, setters));

    act(() => socket._emit("broadcast:history", { history: ["h1"] }));
    expect(setters.setBroadcastHistory).toHaveBeenCalledWith(["h1"]);
  });
});
