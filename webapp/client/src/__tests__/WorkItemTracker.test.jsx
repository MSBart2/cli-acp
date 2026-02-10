import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WorkItemTracker from "../components/WorkItemTracker";

/** Helper to build a realistic set of work items */
function makeItems(overrides = []) {
  const defaults = [
    {
      url: "https://github.com/myorg/api-gateway/issues/12",
      owner: "myorg",
      repo: "api-gateway",
      type: "issue",
      number: 12,
      detectedAt: "2026-02-09T10:00:00Z",
      agentId: "a1",
      agentRepoName: "api-gateway",
    },
    {
      url: "https://github.com/myorg/api-gateway/pull/42",
      owner: "myorg",
      repo: "api-gateway",
      type: "pr",
      number: 42,
      detectedAt: "2026-02-09T10:05:00Z",
      agentId: "a1",
      agentRepoName: "api-gateway",
    },
    {
      url: "https://github.com/myorg/billing-service/issues/3",
      owner: "myorg",
      repo: "billing-service",
      type: "issue",
      number: 3,
      detectedAt: "2026-02-09T10:01:00Z",
      agentId: "a2",
      agentRepoName: "billing-service",
    },
  ];
  return overrides.length > 0 ? overrides : defaults;
}

describe("WorkItemTracker", () => {
  it("renders nothing when items array is empty", () => {
    const { container } = render(
      <WorkItemTracker items={[]} onDismiss={() => {}} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders the title and counts", () => {
    render(<WorkItemTracker items={makeItems()} onDismiss={() => {}} />);
    expect(screen.getByText("Work Item Tracker")).toBeInTheDocument();
    // 1 PR, 2 issues
    expect(screen.getByText(/1 PR/)).toBeInTheDocument();
    expect(screen.getByText(/2 issues/)).toBeInTheDocument();
  });

  it("groups items by owner/repo", () => {
    render(<WorkItemTracker items={makeItems()} onDismiss={() => {}} />);
    expect(screen.getByText("myorg/api-gateway")).toBeInTheDocument();
    expect(screen.getByText("myorg/billing-service")).toBeInTheDocument();
  });

  it("shows issue and PR numbers", () => {
    render(<WorkItemTracker items={makeItems()} onDismiss={() => {}} />);
    expect(screen.getByText("#12")).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("#3")).toBeInTheDocument();
  });

  it("displays type badges", () => {
    render(<WorkItemTracker items={makeItems()} onDismiss={() => {}} />);
    expect(screen.getByText("Pull Request")).toBeInTheDocument();
    expect(screen.getAllByText("Issue")).toHaveLength(2);
  });

  it("calls onDismiss when dismiss button is clicked", () => {
    const onDismiss = vi.fn();
    render(<WorkItemTracker items={makeItems()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTitle("Hide tracker"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("collapses when header is clicked", () => {
    render(<WorkItemTracker items={makeItems()} onDismiss={() => {}} />);
    expect(screen.getByText("#12")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Work Item Tracker"));
    // Items should be hidden after collapsing
    expect(screen.queryByText("#12")).not.toBeInTheDocument();
  });

  it("renders links pointing to the correct URLs", () => {
    render(<WorkItemTracker items={makeItems()} onDismiss={() => {}} />);
    const links = screen.getAllByRole("link");
    const urls = links.map((l) => l.getAttribute("href"));
    expect(urls).toContain("https://github.com/myorg/api-gateway/issues/12");
    expect(urls).toContain("https://github.com/myorg/api-gateway/pull/42");
  });
});
