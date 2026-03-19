import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BroadcastInput from "../components/BroadcastInput";

describe("BroadcastInput", () => {
  const defaults = { onBroadcast: vi.fn(), readyCount: 2, totalCount: 3, broadcasting: false, hasOrchestrator: false };

  it("renders the heading and ready count", () => {
    render(<BroadcastInput {...defaults} />);
    expect(screen.getByText("Broadcast to All Agents")).toBeInTheDocument();
    expect(screen.getByText("2 of 3 agents ready")).toBeInTheDocument();
  });

  it("disables the send button when the textarea is empty", () => {
    render(<BroadcastInput {...defaults} />);
    const button = screen.getByText("Broadcast").closest("button");
    expect(button).toBeDisabled();
  });

  it("enables the send button when text is entered and agents are ready", () => {
    render(<BroadcastInput {...defaults} />);
    const textarea = screen.getByPlaceholderText(/Send a prompt to all agents/);
    fireEvent.change(textarea, { target: { value: "Update docs" } });
    const button = screen.getByText("Broadcast").closest("button");
    expect(button).not.toBeDisabled();
  });

  it("calls onBroadcast with trimmed text on form submit", () => {
    const onBroadcast = vi.fn();
    render(<BroadcastInput {...defaults} onBroadcast={onBroadcast} />);
    const textarea = screen.getByPlaceholderText(/Send a prompt to all agents/);
    fireEvent.change(textarea, { target: { value: "  Update docs  " } });
    fireEvent.submit(textarea.closest("form"));
    // 3rd arg is targetedRepos — undefined when no @mentions present
    expect(onBroadcast).toHaveBeenCalledWith("Update docs", undefined, undefined);
  });

  it("clears the textarea after submitting", () => {
    render(<BroadcastInput {...defaults} />);
    const textarea = screen.getByPlaceholderText(/Send a prompt to all agents/);
    fireEvent.change(textarea, { target: { value: "Update docs" } });
    fireEvent.submit(textarea.closest("form"));
    expect(textarea.value).toBe("");
  });

  it("disables input and button while broadcasting", () => {
    render(<BroadcastInput {...defaults} broadcasting={true} />);
    const textarea = screen.getByPlaceholderText(/Send a prompt to all agents/);
    expect(textarea).toBeDisabled();
  });

  it("disables the send button when no agents are ready", () => {
    render(<BroadcastInput {...defaults} readyCount={0} />);
    const textarea = screen.getByPlaceholderText(/Send a prompt to all agents/);
    fireEvent.change(textarea, { target: { value: "hello" } });
    const button = screen.getByText("Broadcast").closest("button");
    expect(button).toBeDisabled();
  });

  it("uses singular 'agent' text when totalCount is 1", () => {
    render(<BroadcastInput {...defaults} readyCount={1} totalCount={1} />);
    expect(screen.getByText("1 of 1 agent ready")).toBeInTheDocument();
  });

  it("does not call onBroadcast when submitting empty text", () => {
    const onBroadcast = vi.fn();
    render(<BroadcastInput {...defaults} onBroadcast={onBroadcast} />);
    fireEvent.submit(screen.getByPlaceholderText(/Send a prompt to all agents/).closest("form"));
    expect(onBroadcast).not.toHaveBeenCalled();
  });

  // --- Orchestrator Focus tests ---

  it("does not show orchestrator focus toggle when hasOrchestrator is false", () => {
    render(<BroadcastInput {...defaults} hasOrchestrator={false} />);
    expect(screen.queryByText(/Orchestrator Focus/)).not.toBeInTheDocument();
  });

  it("shows orchestrator focus toggle when hasOrchestrator is true", () => {
    render(<BroadcastInput {...defaults} hasOrchestrator={true} />);
    expect(screen.getByText(/Orchestrator Focus/)).toBeInTheDocument();
  });

  it("hides the orchestrator focus textarea by default when toggle is present", () => {
    render(<BroadcastInput {...defaults} hasOrchestrator={true} />);
    expect(screen.queryByPlaceholderText(/Shape the final synthesis/)).not.toBeInTheDocument();
  });

  it("reveals the orchestrator focus textarea when clicking the toggle", () => {
    render(<BroadcastInput {...defaults} hasOrchestrator={true} />);
    fireEvent.click(screen.getByText(/Orchestrator Focus/));
    expect(screen.getByPlaceholderText(/Shape the final synthesis/)).toBeInTheDocument();
  });

  it("passes synthesisInstructions to onBroadcast when provided", () => {
    const onBroadcast = vi.fn();
    render(<BroadcastInput {...defaults} onBroadcast={onBroadcast} hasOrchestrator={true} />);

    fireEvent.click(screen.getByText(/Orchestrator Focus/));

    // Fill in both fields
    fireEvent.change(screen.getByPlaceholderText(/Send a prompt to all agents/), {
      target: { value: "Audit docs" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Shape the final synthesis/), {
      target: { value: "Create parent issue" },
    });

    fireEvent.submit(screen.getByPlaceholderText(/Send a prompt to all agents/).closest("form"));
    // 3rd arg is targetedRepos — undefined when no @mentions present
    expect(onBroadcast).toHaveBeenCalledWith("Audit docs", "Create parent issue", undefined);
  });

  it("clears orchestrator focus after submitting", () => {
    render(<BroadcastInput {...defaults} hasOrchestrator={true} />);
    fireEvent.click(screen.getByText(/Orchestrator Focus/));

    const synthArea = screen.getByPlaceholderText(/Shape the final synthesis/);
    fireEvent.change(synthArea, { target: { value: "Create parent issue" } });
    fireEvent.change(screen.getByPlaceholderText(/Send a prompt to all agents/), {
      target: { value: "Go" },
    });
    fireEvent.submit(screen.getByPlaceholderText(/Send a prompt to all agents/).closest("form"));
    expect(synthArea.value).toBe("");
  });
});
