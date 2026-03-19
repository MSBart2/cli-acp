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
    expect(onLaunch).toHaveBeenCalledWith("https://github.com/owner/repo", "worker", undefined);
  });

  it("submits on Enter key press", () => {
    const onLaunch = vi.fn();
    render(<RepoInput onLaunch={onLaunch} connected={true} />);
    const input = screen.getByPlaceholderText("https://github.com/owner/repo");
    fireEvent.change(input, { target: { value: "https://github.com/owner/repo" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onLaunch).toHaveBeenCalledWith("https://github.com/owner/repo", "worker", undefined);
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
    );
  });

  it("shows subheading text", () => {
    render(<RepoInput {...defaults} />);
    expect(screen.getByText("Connect another repository")).toBeInTheDocument();
  });
});
