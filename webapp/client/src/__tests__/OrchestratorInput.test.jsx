import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OrchestratorInput from "../components/OrchestratorInput";

describe("OrchestratorInput", () => {
  const defaults = { onLaunch: vi.fn(), connected: true };

  it("renders the header, input, and launch button", () => {
    render(<OrchestratorInput {...defaults} />);
    expect(screen.getByText("Orchestrator")).toBeInTheDocument();
    expect(screen.getByText("— coordination repo")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("https://github.com/owner/orchestrator-repo"),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Default model")).toBeInTheDocument();
    expect(screen.getByText("Launch Orchestrator")).toBeInTheDocument();
  });

  it("disables button when input is empty", () => {
    render(<OrchestratorInput {...defaults} />);
    const button = screen.getByText("Launch Orchestrator").closest("button");
    expect(button).toBeDisabled();
  });

  it("disables input and button when disconnected", () => {
    render(<OrchestratorInput {...defaults} connected={false} />);
    const input = screen.getByPlaceholderText(
      "https://github.com/owner/orchestrator-repo",
    );
    const button = screen.getByText("Launch Orchestrator").closest("button");
    expect(input).toBeDisabled();
    expect(button).toBeDisabled();
  });

  it("enables the button when connected and input is non-empty", () => {
    render(<OrchestratorInput {...defaults} />);
    const input = screen.getByPlaceholderText(
      "https://github.com/owner/orchestrator-repo",
    );
    fireEvent.change(input, {
      target: { value: "https://github.com/owner/repo" },
    });
    const button = screen.getByText("Launch Orchestrator").closest("button");
    expect(button).not.toBeDisabled();
  });

  it("auto-focuses the input on mount", () => {
    render(<OrchestratorInput {...defaults} />);
    const input = screen.getByPlaceholderText(
      "https://github.com/owner/orchestrator-repo",
    );
    expect(input).toHaveFocus();
  });

  it("calls onLaunch with repo URL and orchestrator role on submit", () => {
    const onLaunch = vi.fn();
    render(<OrchestratorInput onLaunch={onLaunch} connected={true} />);
    const input = screen.getByPlaceholderText(
      "https://github.com/owner/orchestrator-repo",
    );
    fireEvent.change(input, {
      target: { value: "https://github.com/owner/repo" },
    });
    fireEvent.click(screen.getByText("Launch Orchestrator"));
    expect(onLaunch).toHaveBeenCalledWith(
      "https://github.com/owner/repo",
      "orchestrator",
      undefined,
    );
  });

  it("submits on form submit (Enter key)", () => {
    const onLaunch = vi.fn();
    render(<OrchestratorInput onLaunch={onLaunch} connected={true} />);
    const input = screen.getByPlaceholderText(
      "https://github.com/owner/orchestrator-repo",
    );
    fireEvent.change(input, {
      target: { value: "https://github.com/owner/repo" },
    });
    fireEvent.submit(input.closest("form"));
    expect(onLaunch).toHaveBeenCalledWith(
      "https://github.com/owner/repo",
      "orchestrator",
      undefined,
    );
  });

  it("trims whitespace from the URL before calling onLaunch", () => {
    const onLaunch = vi.fn();
    render(<OrchestratorInput onLaunch={onLaunch} connected={true} />);
    const input = screen.getByPlaceholderText(
      "https://github.com/owner/orchestrator-repo",
    );
    fireEvent.change(input, {
      target: { value: "  https://github.com/owner/repo  " },
    });
    fireEvent.click(screen.getByText("Launch Orchestrator"));
    expect(onLaunch).toHaveBeenCalledWith(
      "https://github.com/owner/repo",
      "orchestrator",
      undefined,
    );
  });

  it("passes the selected model when provided", () => {
    const onLaunch = vi.fn();
    render(<OrchestratorInput onLaunch={onLaunch} connected={true} />);
    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/orchestrator-repo"), {
      target: { value: "https://github.com/owner/repo" },
    });
    fireEvent.change(screen.getByPlaceholderText("Default model"), {
      target: { value: "gpt-5.4" },
    });
    fireEvent.click(screen.getByText("Launch Orchestrator"));
    expect(onLaunch).toHaveBeenCalledWith(
      "https://github.com/owner/repo",
      "orchestrator",
      "gpt-5.4",
    );
  });
});
