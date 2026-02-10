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
    expect(onBroadcast).toHaveBeenCalledWith("Update docs", undefined);
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

  // --- Synthesis instructions tests ---

  it("does not show synthesis toggle when hasOrchestrator is false", () => {
    render(<BroadcastInput {...defaults} hasOrchestrator={false} />);
    expect(screen.queryByText(/Synthesis instructions/)).not.toBeInTheDocument();
  });

  it("shows synthesis toggle when hasOrchestrator is true", () => {
    render(<BroadcastInput {...defaults} hasOrchestrator={true} />);
    expect(screen.getByText(/Synthesis instructions/)).toBeInTheDocument();
  });

  it("hides the synthesis textarea by default when toggle is present", () => {
    render(<BroadcastInput {...defaults} hasOrchestrator={true} />);
    // The placeholder for the synthesis textarea should not be visible yet
    expect(screen.queryByPlaceholderText(/Guide the orchestrator/)).not.toBeInTheDocument();
  });

  it("reveals the synthesis textarea when clicking the toggle", () => {
    render(<BroadcastInput {...defaults} hasOrchestrator={true} />);
    fireEvent.click(screen.getByText(/Synthesis instructions/));
    expect(screen.getByPlaceholderText(/Guide the orchestrator/)).toBeInTheDocument();
  });

  it("passes synthesisInstructions to onBroadcast when provided", () => {
    const onBroadcast = vi.fn();
    render(<BroadcastInput {...defaults} onBroadcast={onBroadcast} hasOrchestrator={true} />);

    // Open synthesis panel
    fireEvent.click(screen.getByText(/Synthesis instructions/));

    // Fill in both fields
    fireEvent.change(screen.getByPlaceholderText(/Send a prompt to all agents/), {
      target: { value: "Audit docs" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Guide the orchestrator/), {
      target: { value: "Create parent issue" },
    });

    fireEvent.submit(screen.getByPlaceholderText(/Send a prompt to all agents/).closest("form"));
    expect(onBroadcast).toHaveBeenCalledWith("Audit docs", "Create parent issue");
  });

  it("clears synthesis instructions after submitting", () => {
    render(<BroadcastInput {...defaults} hasOrchestrator={true} />);
    fireEvent.click(screen.getByText(/Synthesis instructions/));

    const synthArea = screen.getByPlaceholderText(/Guide the orchestrator/);
    fireEvent.change(synthArea, { target: { value: "Create parent issue" } });
    fireEvent.change(screen.getByPlaceholderText(/Send a prompt to all agents/), {
      target: { value: "Go" },
    });
    fireEvent.submit(screen.getByPlaceholderText(/Send a prompt to all agents/).closest("form"));
    expect(synthArea.value).toBe("");
  });
});
