import { vi, describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock react-hot-toast before importing the hook
vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  }),
}));
import toast from "react-hot-toast";

import { useNotifications } from "../hooks/useNotifications";

function makeMockSocket() {
  const listeners = {};
  return {
    on: vi.fn((event, handler) => {
      listeners[event] = handler;
    }),
    off: vi.fn(),
    emit: vi.fn(),
    // Simulate the server pushing an event to the client
    _emit: (event, data) => listeners[event]?.(data),
  };
}

const SOCKET_EVENTS = [
  "connect",
  "disconnect",
  "agent:created",
  "agent:error",
  "agent:prompt_all_complete",
  "agent:permission_request",
  "session:loaded",
  "session:error",
  "graph:inconsistency",
];

describe("useNotifications", () => {
  let socket;
  let audioContextState;
  let oscillatorInstances;
  let requestPermission;

  beforeEach(() => {
    socket = makeMockSocket();
    vi.clearAllMocks();
    localStorage.clear();

    oscillatorInstances = [];
    audioContextState = {
      currentTime: 0,
      state: "running",
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
      createOscillator: vi.fn(() => {
        const oscillator = {
          type: "sine",
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
        oscillatorInstances.push(oscillator);
        return oscillator;
      }),
      createGain: vi.fn(() => ({
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      })),
    };
    function MockAudioContext() {
      return audioContextState;
    }
    vi.stubGlobal("AudioContext", MockAudioContext);
    requestPermission = vi.fn().mockResolvedValue("granted");
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission,
    });
  });

  // ---------------------------------------------------------------------------
  // agent:created
  // ---------------------------------------------------------------------------

  it("agent:created fires toast.success containing the repo name", () => {
    const { result } = renderHook(() => useNotifications(socket));
    act(() => socket._emit("agent:created", { repoName: "my-repo" }));
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("my-repo")
    );
  });

  // ---------------------------------------------------------------------------
  // agent:error
  // ---------------------------------------------------------------------------

  it("agent:error fires toast.error containing the repo name and error", () => {
    renderHook(() => useNotifications(socket));
    act(() =>
      socket._emit("agent:error", {
        repoName: "my-repo",
        error: "Something broke",
      })
    );
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("my-repo")
    );
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Something broke")
    );
  });

  it("agent:error truncates errors longer than 80 characters with an ellipsis", () => {
    renderHook(() => useNotifications(socket));
    const longError = "x".repeat(81);
    act(() =>
      socket._emit("agent:error", { repoName: "r", error: longError })
    );
    const [message] = toast.error.mock.calls[0];
    expect(message).toMatch(/…$/);
    // The truncated portion should not contain the full error
    expect(message).not.toContain(longError);
  });

  it("agent:error plays the error alert sound", async () => {
    renderHook(() => useNotifications(socket));
    await act(async () =>
      socket._emit("agent:error", { repoName: "my-repo", error: "Something broke" })
    );
    expect(audioContextState.createOscillator).toHaveBeenCalledTimes(2);
    expect(oscillatorInstances[0].start).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // agent:prompt_all_complete
  // ---------------------------------------------------------------------------

  it("agent:prompt_all_complete fires toast.success with 'Broadcast complete'", () => {
    renderHook(() => useNotifications(socket));
    act(() => socket._emit("agent:prompt_all_complete", {}));
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("Broadcast complete")
    );
  });

  it("agent:prompt_all_complete plays the completion alert sound", async () => {
    renderHook(() => useNotifications(socket));
    await act(async () => socket._emit("agent:prompt_all_complete", {}));
    expect(audioContextState.createOscillator).toHaveBeenCalledTimes(2);
  });

  // ---------------------------------------------------------------------------
  // agent:permission_request
  // ---------------------------------------------------------------------------

  it("agent:permission_request fires the default toast (not success/error) with 'needs permission'", () => {
    renderHook(() => useNotifications(socket));
    act(() =>
      socket._emit("agent:permission_request", { repoName: "r" })
    );
    // The base toast() should have been called, not toast.success / toast.error
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining("needs permission"),
      expect.any(Object)
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("agent:permission_request plays the permission alert sound", async () => {
    renderHook(() => useNotifications(socket));
    await act(async () => socket._emit("agent:permission_request", { repoName: "r" }));
    expect(audioContextState.createOscillator).toHaveBeenCalledTimes(2);
  });

  // ---------------------------------------------------------------------------
  // disconnect
  // ---------------------------------------------------------------------------

  it("disconnect fires a sticky toast.error with id 'disconnect' and duration 0", () => {
    renderHook(() => useNotifications(socket));
    act(() => socket._emit("disconnect", {}));
    expect(toast.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: "disconnect", duration: 0 })
    );
  });

  // ---------------------------------------------------------------------------
  // connect
  // ---------------------------------------------------------------------------

  it("connect dismisses the disconnect toast via toast.dismiss('disconnect')", () => {
    renderHook(() => useNotifications(socket));
    act(() => socket._emit("connect", {}));
    expect(toast.dismiss).toHaveBeenCalledWith("disconnect");
  });

  // ---------------------------------------------------------------------------
  // session:loaded
  // ---------------------------------------------------------------------------

  it("session:loaded fires toast.success", () => {
    renderHook(() => useNotifications(socket));
    act(() => socket._emit("session:loaded", {}));
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("Session loaded")
    );
  });

  it("session:loaded plays the completion alert sound", async () => {
    renderHook(() => useNotifications(socket));
    await act(async () => socket._emit("session:loaded", {}));
    expect(audioContextState.createOscillator).toHaveBeenCalledTimes(2);
  });

  // ---------------------------------------------------------------------------
  // session:error
  // ---------------------------------------------------------------------------

  it("session:error fires toast.error containing the message", () => {
    renderHook(() => useNotifications(socket));
    act(() =>
      socket._emit("session:error", { message: "load failed" })
    );
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("load failed")
    );
  });

  it("session:error plays the error alert sound", async () => {
    renderHook(() => useNotifications(socket));
    await act(async () => socket._emit("session:error", { message: "load failed" }));
    expect(audioContextState.createOscillator).toHaveBeenCalledTimes(2);
  });

  // ---------------------------------------------------------------------------
  // graph:inconsistency
  // ---------------------------------------------------------------------------

  it("graph:inconsistency fires the default toast (not success/error)", () => {
    renderHook(() => useNotifications(socket));
    act(() => socket._emit("graph:inconsistency", {}));
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining("conflict"),
      expect.any(Object)
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  it("unmounting calls socket.off for every registered event", () => {
    const { unmount } = renderHook(() => useNotifications(socket));
    unmount();
    const offEvents = socket.off.mock.calls.map(([event]) => event);
    for (const event of SOCKET_EVENTS) {
      expect(offEvents).toContain(event);
    }
  });

  // ---------------------------------------------------------------------------
  // requestBrowserPermission
  // ---------------------------------------------------------------------------

  it("requestBrowserPermission calls Notification.requestPermission()", async () => {
    const { result } = renderHook(() => useNotifications(socket));
    await act(async () => {
      await result.current.requestBrowserPermission();
    });
    expect(requestPermission).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // browserPermission initial state
  // ---------------------------------------------------------------------------

  it("browserPermission reflects Notification.permission on mount", () => {
    vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn() });

    const { result } = renderHook(() => useNotifications(socket));
    expect(result.current.browserPermission).toBe("granted");
  });

  it("toggleSoundEnabled updates the preference and suppresses sounds when muted", async () => {
    const { result } = renderHook(() => useNotifications(socket));

    act(() => result.current.toggleSoundEnabled());
    expect(result.current.soundEnabled).toBe(false);
    expect(localStorage.getItem("acp-alert-sounds-enabled")).toBe("false");

    await act(async () => socket._emit("agent:prompt_all_complete", {}));
    expect(audioContextState.createOscillator).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Null socket guard
  // ---------------------------------------------------------------------------

  it("does not throw and fires no toasts when socket is null", () => {
    expect(() => renderHook(() => useNotifications(null))).not.toThrow();
    expect(toast).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
