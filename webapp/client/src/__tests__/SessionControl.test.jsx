import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import SessionControl from "../components/SessionControl";

function makeMockSocket(overrides = {}) {
  const handlers = {};
  return {
    on: vi.fn((event, handler) => { handlers[event] = handler; }),
    off: vi.fn(),
    emit: vi.fn(),
    _trigger: (event, data) => handlers[event]?.(data),
    ...overrides,
  };
}

const SESSIONS = [
  {
    id: "s1",
    name: "my-session",
    updatedAt: new Date(Date.now() - 60_000).toISOString(),
    summary: { agentCount: 2, workItemCount: 3, broadcastCount: 1 },
  },
  {
    id: "s2",
    name: "empty-session",
    updatedAt: new Date(Date.now() - 120_000).toISOString(),
    summary: { agentCount: 0, workItemCount: 0, broadcastCount: 0 },
  },
];

describe("SessionControl", () => {
  let socket;

  beforeEach(() => {
    socket = makeMockSocket();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  it("renders the current session name ('default') in the trigger button", () => {
    render(<SessionControl socket={socket} />);
    expect(screen.getByText("default")).toBeInTheDocument();
  });

  it("dropdown is closed by default", () => {
    render(<SessionControl socket={socket} />);
    expect(screen.queryByText("Saved Sessions")).not.toBeInTheDocument();
  });

  it("dropdown opens when trigger button is clicked", () => {
    render(<SessionControl socket={socket} />);
    fireEvent.click(screen.getByText("default"));
    expect(screen.getByText("Saved Sessions")).toBeInTheDocument();
  });

  it("shows 'No saved sessions' when sessions list is empty", () => {
    render(<SessionControl socket={socket} />);
    fireEvent.click(screen.getByText("default"));
    act(() => socket._trigger("session:list", []));
    expect(screen.getByText("No saved sessions")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Socket wiring
  // ---------------------------------------------------------------------------

  it("emits session:list on mount (initial fetch)", () => {
    render(<SessionControl socket={socket} />);
    expect(socket.emit).toHaveBeenCalledWith("session:list");
  });

  it("renders session rows when session:list event fires with data", () => {
    render(<SessionControl socket={socket} />);
    fireEvent.click(screen.getByText("default"));
    act(() => socket._trigger("session:list", SESSIONS));
    expect(screen.getByText("my-session")).toBeInTheDocument();
    expect(screen.getByText("empty-session")).toBeInTheDocument();
  });

  it("updates current session name when session:loaded event fires", () => {
    render(<SessionControl socket={socket} />);
    act(() => socket._trigger("session:loaded", { name: "loaded-session" }));
    expect(screen.getByText("loaded-session")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Session rows
  // ---------------------------------------------------------------------------

  it("shows session name in each row", () => {
    render(<SessionControl socket={socket} />);
    fireEvent.click(screen.getByText("default"));
    act(() => socket._trigger("session:list", SESSIONS));
    expect(screen.getByText("my-session")).toBeInTheDocument();
    expect(screen.getByText("empty-session")).toBeInTheDocument();
  });

  it("shows agent count pill when agentCount > 0", () => {
    render(<SessionControl socket={socket} />);
    fireEvent.click(screen.getByText("default"));
    act(() => socket._trigger("session:list", SESSIONS));
    expect(screen.getByText("2 agents")).toBeInTheDocument();
  });

  it("shows items pill when workItemCount > 0", () => {
    render(<SessionControl socket={socket} />);
    fireEvent.click(screen.getByText("default"));
    act(() => socket._trigger("session:list", SESSIONS));
    expect(screen.getByText("3 items")).toBeInTheDocument();
  });

  it("shows broadcasts pill when broadcastCount > 0", () => {
    render(<SessionControl socket={socket} />);
    fireEvent.click(screen.getByText("default"));
    act(() => socket._trigger("session:list", SESSIONS));
    expect(screen.getByText("1 broadcasts")).toBeInTheDocument();
  });

  it("does NOT show pills when counts are 0", () => {
    render(<SessionControl socket={socket} />);
    fireEvent.click(screen.getByText("default"));
    act(() => socket._trigger("session:list", SESSIONS));
    // empty-session has all counts = 0; only one agents/items/broadcasts pill each
    expect(screen.getAllByText(/agents/).length).toBe(1);
    expect(screen.getAllByText(/items/).length).toBe(1);
    expect(screen.getAllByText(/broadcasts/).length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Load actions
  // ---------------------------------------------------------------------------

  it("clicking Restore button emits session:load with mode: 'ui'", () => {
    render(<SessionControl socket={socket} />);
    fireEvent.click(screen.getByText("default"));
    act(() => socket._trigger("session:list", SESSIONS));
    const restoreBtn = screen.getAllByTitle("Restore (UI only)")[0];
    fireEvent.click(restoreBtn);
    expect(socket.emit).toHaveBeenCalledWith("session:load", { name: "my-session", mode: "ui" });
  });

  it("clicking Re-spawn button emits session:load with mode: 'respawn'", () => {
    render(<SessionControl socket={socket} />);
    fireEvent.click(screen.getByText("default"));
    act(() => socket._trigger("session:list", SESSIONS));
    const respawnBtn = screen.getAllByTitle("Re-spawn agents")[0];
    fireEvent.click(respawnBtn);
    expect(socket.emit).toHaveBeenCalledWith("session:load", { name: "my-session", mode: "respawn" });
  });

  // ---------------------------------------------------------------------------
  // Delete with two-click confirm
  // ---------------------------------------------------------------------------

  it("first click on delete button does NOT emit session:delete (arms confirm state)", () => {
    render(<SessionControl socket={socket} />);
    fireEvent.click(screen.getByText("default"));
    act(() => socket._trigger("session:list", SESSIONS));
    const deleteBtn = screen.getAllByTitle("Delete session")[0];
    fireEvent.click(deleteBtn);
    expect(socket.emit).not.toHaveBeenCalledWith("session:delete", expect.anything());
  });

  it("second click on delete button (same session) emits session:delete with the session name", () => {
    render(<SessionControl socket={socket} />);
    fireEvent.click(screen.getByText("default"));
    act(() => socket._trigger("session:list", SESSIONS));
    // First click arms the confirmation; title changes to "Click again to confirm delete"
    const deleteBtns = screen.getAllByTitle("Delete session");
    fireEvent.click(deleteBtns[0]);
    const confirmBtn = screen.getByTitle("Click again to confirm delete");
    fireEvent.click(confirmBtn);
    expect(socket.emit).toHaveBeenCalledWith("session:delete", { name: "my-session" });
  });

  // ---------------------------------------------------------------------------
  // Save flow
  // ---------------------------------------------------------------------------

  it("'Save as…' button opens inline save input (no browser prompt)", () => {
    render(<SessionControl socket={socket} />);
    fireEvent.click(screen.getByText("default"));
    act(() => socket._trigger("session:list", []));
    fireEvent.click(screen.getByText("Save as…"));
    expect(screen.getByPlaceholderText("Session name")).toBeInTheDocument();
  });

  it("entering a name and pressing Enter emits session:save with the name", () => {
    render(<SessionControl socket={socket} />);
    fireEvent.click(screen.getByText("default"));
    act(() => socket._trigger("session:list", []));
    fireEvent.click(screen.getByText("Save as…"));
    const input = screen.getByPlaceholderText("Session name");
    fireEvent.change(input, { target: { value: "new-name" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(socket.emit).toHaveBeenCalledWith("session:save", { name: "new-name" });
  });

  it("pressing Escape closes save input without saving", () => {
    render(<SessionControl socket={socket} />);
    fireEvent.click(screen.getByText("default"));
    act(() => socket._trigger("session:list", []));
    fireEvent.click(screen.getByText("Save as…"));
    const input = screen.getByPlaceholderText("Session name");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByPlaceholderText("Session name")).not.toBeInTheDocument();
    expect(socket.emit).not.toHaveBeenCalledWith("session:save", expect.anything());
  });

  // ---------------------------------------------------------------------------
  // Auto-saved indicator
  // ---------------------------------------------------------------------------

  it("'auto-saved X ago' label appears after session:list event fires", () => {
    render(<SessionControl socket={socket} />);
    act(() => socket._trigger("session:list", []));
    expect(screen.getByText(/auto-saved/)).toBeInTheDocument();
  });
});
