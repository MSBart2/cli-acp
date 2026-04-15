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
});
