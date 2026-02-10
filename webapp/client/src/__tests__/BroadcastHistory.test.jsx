import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BroadcastHistory from "../components/BroadcastHistory";

/** Helper to build a set of broadcast history entries */
function makeHistory(count = 2) {
  return Array.from({ length: count }, (_, i) => ({
    promptText: `Broadcast prompt ${i + 1}`,
    timestamp: new Date(2026, 1, 9, 10 + i, 0).toISOString(),
    results: [
      {
        agentId: `a${i}-1`,
        repoName: "api-gateway",
        repoUrl: "https://github.com/org/api-gateway",
        status: "completed",
        output: `Output from api-gateway for wave ${i + 1}`,
      },
      {
        agentId: `a${i}-2`,
        repoName: "billing-service",
        repoUrl: "https://github.com/org/billing-service",
        status: i === 1 ? "error" : "completed",
        output: i === 1 ? "" : `Output from billing-service for wave ${i + 1}`,
      },
    ],
  }));
}

describe("BroadcastHistory", () => {
  it("renders nothing when history is empty", () => {
    const { container } = render(<BroadcastHistory history={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the header with wave count", () => {
    render(<BroadcastHistory history={makeHistory(3)} />);
    expect(screen.getByText("Broadcast History")).toBeInTheDocument();
    expect(screen.getByText("3 waves")).toBeInTheDocument();
  });

  it("is collapsed by default — no prompt text visible", () => {
    render(<BroadcastHistory history={makeHistory()} />);
    expect(screen.queryByText("Broadcast prompt 1")).not.toBeInTheDocument();
  });

  it("expands to show wave entries when clicked", () => {
    render(<BroadcastHistory history={makeHistory()} />);
    fireEvent.click(screen.getByText("Broadcast History"));
    expect(screen.getByText("Broadcast prompt 1")).toBeInTheDocument();
    expect(screen.getByText("Broadcast prompt 2")).toBeInTheDocument();
  });

  it("shows completed/total count for each wave", () => {
    render(<BroadcastHistory history={makeHistory()} />);
    fireEvent.click(screen.getByText("Broadcast History"));
    // Wave 1: 2/2, Wave 2: 1/2 with 1 error
    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("expands a wave to show per-repo details", () => {
    render(<BroadcastHistory history={makeHistory()} />);
    // Open the history panel
    fireEvent.click(screen.getByText("Broadcast History"));
    // Click on wave 1 to expand it
    fireEvent.click(screen.getByText("Broadcast prompt 1"));
    expect(screen.getByText("api-gateway")).toBeInTheDocument();
  });

  it("shows most recent wave first", () => {
    render(<BroadcastHistory history={makeHistory(3)} />);
    fireEvent.click(screen.getByText("Broadcast History"));
    const prompts = screen.getAllByText(/Broadcast prompt \d/);
    // Most recent (3) should appear first
    expect(prompts[0].textContent).toBe("Broadcast prompt 3");
    expect(prompts[1].textContent).toBe("Broadcast prompt 2");
    expect(prompts[2].textContent).toBe("Broadcast prompt 1");
  });

  it("uses singular 'wave' for a single entry", () => {
    render(<BroadcastHistory history={makeHistory(1)} />);
    expect(screen.getByText("1 wave")).toBeInTheDocument();
  });
});
