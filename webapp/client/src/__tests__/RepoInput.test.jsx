import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RepoInput from "../components/RepoInput";

describe("RepoInput", () => {
  const defaults = { onLaunch: vi.fn(), connected: true };

  it("renders the header, input, and launch button", () => {
    render(<RepoInput {...defaults} />);
    expect(screen.getByText("Add Worker")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("https://github.com/owner/repo")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Default model")).toBeInTheDocument();
    expect(screen.getByText("Launch Worker")).toBeInTheDocument();
  });

  it("disables button when input is empty", () => {
    render(<RepoInput {...defaults} />);
    const button = screen.getByText("Launch Worker").closest("button");
    expect(button).toBeDisabled();
  });

  it("disables input and button when disconnected", () => {
    render(<RepoInput {...defaults} connected={false} />);
    const input = screen.getByPlaceholderText("https://github.com/owner/repo");
    const button = screen.getByText("Launch Worker").closest("button");
    expect(input).toBeDisabled();
    expect(button).toBeDisabled();
  });

  it("enables the button when connected and input is non-empty", () => {
    render(<RepoInput {...defaults} />);
    const input = screen.getByPlaceholderText("https://github.com/owner/repo");
    fireEvent.change(input, { target: { value: "https://github.com/owner/repo" } });
    const button = screen.getByText("Launch Worker").closest("button");
    expect(button).not.toBeDisabled();
  });

  it("calls onLaunch with repo URL and worker role on submit", () => {
    const onLaunch = vi.fn();
    render(<RepoInput onLaunch={onLaunch} connected={true} />);
    const input = screen.getByPlaceholderText("https://github.com/owner/repo");
    fireEvent.change(input, { target: { value: "https://github.com/owner/repo" } });
    fireEvent.click(screen.getByText("Launch Worker"));
    expect(onLaunch).toHaveBeenCalledWith("https://github.com/owner/repo", "worker", undefined, undefined);
  });

  it("submits on Enter key press", () => {
    const onLaunch = vi.fn();
    render(<RepoInput onLaunch={onLaunch} connected={true} />);
    const input = screen.getByPlaceholderText("https://github.com/owner/repo");
    fireEvent.change(input, { target: { value: "https://github.com/owner/repo" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onLaunch).toHaveBeenCalledWith("https://github.com/owner/repo", "worker", undefined, undefined);
  });

  it("passes the selected model when provided", () => {
    const onLaunch = vi.fn();
    render(<RepoInput onLaunch={onLaunch} connected={true} />);
    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "https://github.com/owner/repo" },
    });
    fireEvent.change(screen.getByPlaceholderText("Default model"), {
      target: { value: "claude-sonnet-4.6" },
    });
    fireEvent.click(screen.getByText("Launch Worker"));
    expect(onLaunch).toHaveBeenCalledWith(
      "https://github.com/owner/repo",
      "worker",
      "claude-sonnet-4.6",
      undefined,
    );
  });

  it("shows subheading text", () => {
    render(<RepoInput {...defaults} />);
    expect(screen.getByText("Connect another repository")).toBeInTheDocument();
  });

  it("passes custom ACP command when advanced options are filled", () => {
    const onLaunch = vi.fn();
    render(<RepoInput onLaunch={onLaunch} connected={true} />);
    // Fill repo URL
    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "https://github.com/owner/repo" },
    });
    // Expand advanced options
    fireEvent.click(screen.getByText("Custom ACP Process"));
    // Fill custom command and args
    fireEvent.change(screen.getByPlaceholderText(/Executable/), {
      target: { value: "my-agent" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Extra args/), {
      target: { value: "--verbose --port 8080" },
    });
    fireEvent.click(screen.getByText("Launch Worker"));
    expect(onLaunch).toHaveBeenCalledWith(
      "https://github.com/owner/repo",
      "worker",
      undefined,
      { command: "my-agent", args: ["--verbose", "--port", "8080"] },
    );
  });

  it("does not pass acpCommand when advanced fields are empty", () => {
    const onLaunch = vi.fn();
    render(<RepoInput onLaunch={onLaunch} connected={true} />);
    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "https://github.com/owner/repo" },
    });
    // Expand advanced but leave fields empty
    fireEvent.click(screen.getByText("Custom ACP Process"));
    fireEvent.click(screen.getByText("Launch Worker"));
    expect(onLaunch).toHaveBeenCalledWith(
      "https://github.com/owner/repo",
      "worker",
      undefined,
      undefined,
    );
  });
});
