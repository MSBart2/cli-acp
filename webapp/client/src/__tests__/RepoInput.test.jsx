import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RepoInput from "../components/RepoInput";

describe("RepoInput", () => {
  const defaults = { onLaunch: vi.fn(), connected: true, hasOrchestrator: false };

  it("renders the input and both buttons", () => {
    render(<RepoInput {...defaults} />);
    expect(screen.getByPlaceholderText("https://github.com/owner/repo")).toBeInTheDocument();
    expect(screen.getByText("Worker")).toBeInTheDocument();
    expect(screen.getByText("Orchestrator")).toBeInTheDocument();
  });

  it("disables buttons when input is empty", () => {
    render(<RepoInput {...defaults} />);
    const worker = screen.getByText("Worker").closest("button");
    const orch = screen.getByText("Orchestrator").closest("button");
    expect(worker).toBeDisabled();
    expect(orch).toBeDisabled();
  });

  it("disables buttons when disconnected", () => {
    render(<RepoInput {...defaults} connected={false} />);
    const input = screen.getByPlaceholderText("https://github.com/owner/repo");
    fireEvent.change(input, { target: { value: "https://github.com/owner/repo" } });
    const worker = screen.getByText("Worker").closest("button");
    expect(worker).toBeDisabled();
  });

  it("enables the worker button when connected and input is non-empty", () => {
    render(<RepoInput {...defaults} />);
    const input = screen.getByPlaceholderText("https://github.com/owner/repo");
    fireEvent.change(input, { target: { value: "https://github.com/owner/repo" } });
    const worker = screen.getByText("Worker").closest("button");
    expect(worker).not.toBeDisabled();
  });

  it("auto-focuses the repo URL input on mount", () => {
    render(<RepoInput {...defaults} />);
    const input = screen.getByPlaceholderText("https://github.com/owner/repo");
    expect(input).toHaveFocus();
  });

  it("hides the Orchestrator button when hasOrchestrator is true", () => {
    render(<RepoInput {...defaults} hasOrchestrator={true} />);
    expect(screen.queryByText("Orchestrator")).not.toBeInTheDocument();
  });

  it("shows the Orchestrator button when hasOrchestrator is false", () => {
    render(<RepoInput {...defaults} hasOrchestrator={false} />);
    expect(screen.getByText("Orchestrator")).toBeInTheDocument();
  });
});
