import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DependencyGraph from "../components/DependencyGraph";

function makeGraph(overrides = {}) {
  return {
    nodes: [
      { agentId: "a1", repoName: "class-lib-a", role: "library", techStack: ["node"] },
      { agentId: "a2", repoName: "api-gateway", role: "api", techStack: ["typescript"] },
    ],
    edges: [{ from: "a2", to: "a1" }],
    warnings: [],
    ...overrides,
  };
}

const noop = () => {};

describe("DependencyGraph", () => {
  it("returns null when graph is null", () => {
    const { container } = render(<DependencyGraph graph={null} onRefresh={noop} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when graph has no edges", () => {
    const { container } = render(
      <DependencyGraph graph={{ nodes: [], edges: [], warnings: [] }} onRefresh={noop} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders when graph has edges", () => {
    render(<DependencyGraph graph={makeGraph()} onRefresh={noop} />);
    expect(screen.getByText("class-lib-a")).toBeInTheDocument();
    // api-gateway appears as both a primary node and as an indented consumer
    expect(screen.getAllByText("api-gateway").length).toBeGreaterThan(0);
  });

  it("shows role badge with correct text", () => {
    render(<DependencyGraph graph={makeGraph()} onRefresh={noop} />);
    // The "library" role badge should appear for class-lib-a
    expect(screen.getAllByText("library").length).toBeGreaterThan(0);
  });

  it("shows inconsistency warning when warnings are present", () => {
    const graph = makeGraph({ warnings: ["Inconsistency: foo → bar"] });
    render(<DependencyGraph graph={graph} onRefresh={noop} />);
    expect(screen.getByText("Inconsistency: foo → bar")).toBeInTheDocument();
  });

  it("dismiss button hides the warnings banner", () => {
    const graph = makeGraph({ warnings: ["Inconsistency: foo → bar"] });
    render(<DependencyGraph graph={graph} onRefresh={noop} />);
    expect(screen.getByText("Inconsistency: foo → bar")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Dismiss"));
    expect(screen.queryByText("Inconsistency: foo → bar")).not.toBeInTheDocument();
  });

  it("calls onRefresh when 'Refresh Manifests' button is clicked", () => {
    const onRefresh = vi.fn();
    render(<DependencyGraph graph={makeGraph()} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByText("Refresh Manifests"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("collapses when header toggle is clicked", () => {
    render(<DependencyGraph graph={makeGraph()} onRefresh={noop} />);
    // Nodes should be visible initially (expanded by default)
    expect(screen.getByText("class-lib-a")).toBeInTheDocument();
    // Click the header button to collapse
    fireEvent.click(screen.getByText("Dependency Graph"));
    expect(screen.queryByText("class-lib-a")).not.toBeInTheDocument();
  });
});
