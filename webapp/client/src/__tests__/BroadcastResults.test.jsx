import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BroadcastResults from "../components/BroadcastResults";

/** Helper to build a realistic broadcastResults prop */
function makeResults(overrides = []) {
  const defaults = [
    {
      agentId: "a1",
      repoName: "api-gateway",
      repoUrl: "https://github.com/org/api-gateway",
      status: "completed",
      output: "Stale README — wrong start command, 3 missing env vars\n\nDetailed analysis follows…",
    },
    {
      agentId: "a2",
      repoName: "billing-service",
      repoUrl: "https://github.com/org/billing-service",
      status: "completed",
      output: "No README exists\n\nThis repo has no documentation at all.",
    },
    {
      agentId: "a3",
      repoName: "infra-config",
      repoUrl: "https://github.com/org/infra-config",
      status: "error",
      output: "",
    },
  ];

  // Merge overrides by index
  const results = defaults.map((d, i) => ({ ...d, ...(overrides[i] || {}) }));
  return {
    promptText: "Audit the documentation in this repo",
    timestamp: "2026-02-09T12:00:00.000Z",
    results,
  };
}

describe("BroadcastResults", () => {
  let onDismiss;

  beforeEach(() => {
    onDismiss = vi.fn();
  });

  it("renders the header with correct counts", () => {
    render(<BroadcastResults broadcastResults={makeResults()} onDismiss={onDismiss} />);
    expect(screen.getByText("Broadcast Results")).toBeInTheDocument();
    expect(screen.getByText("2/3 completed")).toBeInTheDocument();
    expect(screen.getByText(/1 error/)).toBeInTheDocument();
  });

  it("shows the truncated prompt text", () => {
    render(<BroadcastResults broadcastResults={makeResults()} onDismiss={onDismiss} />);
    expect(screen.getByText(/Audit the documentation/)).toBeInTheDocument();
  });

  it("renders one summary row per agent with repo names", () => {
    render(<BroadcastResults broadcastResults={makeResults()} onDismiss={onDismiss} />);
    expect(screen.getByText("api-gateway")).toBeInTheDocument();
    expect(screen.getByText("billing-service")).toBeInTheDocument();
    expect(screen.getByText("infra-config")).toBeInTheDocument();
  });

  it("shows headline (first line) for completed agents", () => {
    render(<BroadcastResults broadcastResults={makeResults()} onDismiss={onDismiss} />);
    expect(screen.getByText(/Stale README/)).toBeInTheDocument();
    expect(screen.getByText(/No README exists/)).toBeInTheDocument();
  });

  it("shows error text for errored agents", () => {
    render(<BroadcastResults broadcastResults={makeResults()} onDismiss={onDismiss} />);
    expect(screen.getByText(/Agent errored/)).toBeInTheDocument();
  });

  it("expands a row on click to show full output", () => {
    render(<BroadcastResults broadcastResults={makeResults()} onDismiss={onDismiss} />);

    // Full output should not be visible initially
    expect(screen.queryByText(/Detailed analysis follows/)).not.toBeInTheDocument();

    // Click the api-gateway row
    fireEvent.click(screen.getByText("api-gateway"));

    // Now the detail pane should be visible
    expect(screen.getByText(/Detailed analysis follows/)).toBeInTheDocument();
  });

  it("collapses a previously expanded row when clicking another", () => {
    render(<BroadcastResults broadcastResults={makeResults()} onDismiss={onDismiss} />);

    // Expand api-gateway
    fireEvent.click(screen.getByText("api-gateway"));
    expect(screen.getByText(/Detailed analysis follows/)).toBeInTheDocument();

    // Expand billing-service — should collapse api-gateway
    fireEvent.click(screen.getByText("billing-service"));
    expect(screen.queryByText(/Detailed analysis follows/)).not.toBeInTheDocument();
    expect(screen.getByText(/This repo has no documentation/)).toBeInTheDocument();
  });

  it("collapses the row when clicking the same row again", () => {
    render(<BroadcastResults broadcastResults={makeResults()} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByText("api-gateway"));
    expect(screen.getByText(/Detailed analysis follows/)).toBeInTheDocument();

    // Click again to collapse
    fireEvent.click(screen.getByText("api-gateway"));
    expect(screen.queryByText(/Detailed analysis follows/)).not.toBeInTheDocument();
  });

  it("calls onDismiss when the close button is clicked", () => {
    render(<BroadcastResults broadcastResults={makeResults()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTitle("Dismiss results"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("strips markdown heading markers from headlines", () => {
    const data = makeResults([
      { output: "## Project Purpose\n\nThis is an API gateway." },
    ]);
    render(<BroadcastResults broadcastResults={data} onDismiss={onDismiss} />);
    // Should show "Project Purpose" not "## Project Purpose"
    expect(screen.getByText("Project Purpose")).toBeInTheDocument();
  });

  it("shows no error count when all agents completed", () => {
    const data = makeResults([{}, {}, { status: "completed", output: "All good" }]);
    render(<BroadcastResults broadcastResults={data} onDismiss={onDismiss} />);
    expect(screen.getByText("3/3 completed")).toBeInTheDocument();
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it("renders the Copy as Markdown button", () => {
    render(<BroadcastResults broadcastResults={makeResults()} onDismiss={onDismiss} />);
    expect(screen.getByText("Copy as Markdown")).toBeInTheDocument();
  });
});
