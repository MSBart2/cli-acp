import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Header from "../components/Header";

// Stub fetch globally for disk usage polling
const originalFetch = globalThis.fetch;

function defaults(overrides = {}) {
  return {
    connected: false,
    repoBaseDir: "/tmp/repos",
    onRepoBashDirChange: vi.fn(),
    reuseExisting: false,
    onReuseExistingChange: vi.fn(),
    socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    browserPermission: "default",
    onRequestBrowserPermission: vi.fn(),
    soundEnabled: false,
    onToggleSoundEnabled: vi.fn(),
    permissionPreset: "ask",
    onPermissionPresetChange: vi.fn(),
    ...overrides,
  };
}

describe("Header", () => {
  beforeEach(() => {
    // Stub fetch to prevent real network calls from disk-usage polling
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ totalBytes: 0, agents: [] }),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders the app title", () => {
    render(<Header {...defaults()} />);
    expect(screen.getByText("ACP Agent Orchestrator")).toBeInTheDocument();
  });

  it("shows 'Connected' when connected is true", () => {
    render(<Header {...defaults({ connected: true })} />);
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("shows 'Disconnected' when connected is false", () => {
    render(<Header {...defaults()} />);
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  // --- Sound toggle ---

  it("shows 'Sounds off' when soundEnabled is false", () => {
    render(<Header {...defaults({ soundEnabled: false })} />);
    expect(screen.getByText("Sounds off")).toBeInTheDocument();
  });

  it("shows 'Sounds on' when soundEnabled is true", () => {
    render(<Header {...defaults({ soundEnabled: true })} />);
    expect(screen.getByText("Sounds on")).toBeInTheDocument();
  });

  it("calls onToggleSoundEnabled when sound button is clicked", () => {
    const onToggleSoundEnabled = vi.fn();
    render(<Header {...defaults({ onToggleSoundEnabled })} />);
    fireEvent.click(screen.getByText("Sounds off"));
    expect(onToggleSoundEnabled).toHaveBeenCalled();
  });

  // --- Browser notification permission ---

  it("shows Notify button when browser permission is 'default'", () => {
    render(<Header {...defaults({ browserPermission: "default" })} />);
    expect(screen.getByText("Notify")).toBeInTheDocument();
  });

  it("hides Notify button and shows Alerts on when permission is granted", () => {
    render(<Header {...defaults({ browserPermission: "granted" })} />);
    expect(screen.queryByText("Notify")).not.toBeInTheDocument();
    expect(screen.getByText("Alerts on")).toBeInTheDocument();
  });

  it("disables Notify button when permission is denied", () => {
    render(<Header {...defaults({ browserPermission: "denied" })} />);
    const btn = screen.getByText("Notify").closest("button");
    expect(btn).toBeDisabled();
  });

  it("calls onRequestBrowserPermission when Notify is clicked", () => {
    const onRequestBrowserPermission = vi.fn();
    render(<Header {...defaults({ onRequestBrowserPermission })} />);
    fireEvent.click(screen.getByText("Notify"));
    expect(onRequestBrowserPermission).toHaveBeenCalled();
  });

  // --- Permission preset cycling ---

  it('shows "Always ask" label when preset is "ask"', () => {
    render(<Header {...defaults({ permissionPreset: "ask" })} />);
    expect(screen.getByText("Always ask")).toBeInTheDocument();
  });

  it('shows "Auto-approve reads" label when preset is "allow-reads"', () => {
    render(<Header {...defaults({ permissionPreset: "allow-reads" })} />);
    expect(screen.getByText("Auto-approve reads")).toBeInTheDocument();
  });

  it('shows "Auto-approve all" label when preset is "allow-all"', () => {
    render(<Header {...defaults({ permissionPreset: "allow-all" })} />);
    expect(screen.getByText("Auto-approve all")).toBeInTheDocument();
  });

  it("cycles to next preset on click", () => {
    const onPermissionPresetChange = vi.fn();
    render(<Header {...defaults({ permissionPreset: "ask", onPermissionPresetChange })} />);
    fireEvent.click(screen.getByText("Always ask"));
    expect(onPermissionPresetChange).toHaveBeenCalledWith("allow-reads");
  });

  // --- Reuse existing ---

  it("shows warning when reuseExisting is true", () => {
    render(<Header {...defaults({ reuseExisting: true })} />);
    expect(screen.getByText(/Reuse mode/)).toBeInTheDocument();
  });

  it("does not show warning when reuseExisting is false", () => {
    render(<Header {...defaults({ reuseExisting: false })} />);
    expect(screen.queryByText(/Reuse mode/)).not.toBeInTheDocument();
  });

  it("calls onReuseExistingChange when checkbox is toggled", () => {
    const onReuseExistingChange = vi.fn();
    render(<Header {...defaults({ onReuseExistingChange })} />);
    fireEvent.click(screen.getByText("Reuse existing"));
    expect(onReuseExistingChange).toHaveBeenCalledWith(true);
  });

  // --- Repo base dir ---

  it("calls onRepoBashDirChange when input changes", () => {
    const onRepoBashDirChange = vi.fn();
    render(<Header {...defaults({ onRepoBashDirChange })} />);
    const input = screen.getByPlaceholderText("Local path for cloned repos");
    fireEvent.change(input, { target: { value: "/new/path" } });
    expect(onRepoBashDirChange).toHaveBeenCalledWith("/new/path");
  });

  // --- Disk usage display ---

  it("shows disk usage when agents exist", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        totalBytes: 52428800,
        agents: [{ repoName: "my-repo", bytes: 52428800 }],
      }),
    });
    render(<Header {...defaults()} />);
    await waitFor(() => expect(screen.getByText("50.0 MB")).toBeInTheDocument());
  });

  it("hides disk usage when no agents", async () => {
    render(<Header {...defaults()} />);
    // Default stub returns empty agents — disk usage indicator should not appear
    await waitFor(() => {
      expect(screen.queryByText(/MB|KB|B$/)).not.toBeInTheDocument();
    });
  });
});
