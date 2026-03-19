import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OrchestratorCard from "../components/OrchestratorCard";

function makeAgent(overrides = {}) {
  return {
    agentId: "orch-1",
    repoUrl: "https://github.com/myorg/cross-repo-ops",
    repoName: "cross-repo-ops",
    role: "orchestrator",
    status: "ready",
    spawnStep: null,
    spawnMessage: null,
    output: [],
    pendingPermission: null,
    ...overrides,
  };
}

describe("OrchestratorCard", () => {
  const handlers = {
    onSendPrompt: vi.fn(),
    onStop: vi.fn(),
    onPermissionResponse: vi.fn(),
    onLoadWorker: vi.fn(),
  };

  it("renders the orchestrator heading and repo name", () => {
    render(<OrchestratorCard agent={makeAgent()} {...handlers} />);
    expect(screen.getByText("Orchestrator")).toBeInTheDocument();
    expect(screen.getByText("coordinator")).toBeInTheDocument();
    expect(screen.getByText("cross-repo-ops")).toBeInTheDocument();
  });

  it("shows Ready status when agent is ready", () => {
    render(<OrchestratorCard agent={makeAgent()} {...handlers} />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows Synthesizing status when agent is busy", () => {
    render(<OrchestratorCard agent={makeAgent({ status: "busy" })} {...handlers} />);
    expect(screen.getByText("Synthesizing")).toBeInTheDocument();
  });

  it("shows the spawning progress stepper during spawn", () => {
    const agent = makeAgent({
      status: "spawning",
      spawnStep: "starting",
    });
    render(<OrchestratorCard agent={agent} {...handlers} />);
    expect(screen.getByText("cloning")).toBeInTheDocument();
    expect(screen.getByText("starting")).toBeInTheDocument();
    expect(screen.getByText("verifying")).toBeInTheDocument();
  });

  it("shows the prompt input when ready", () => {
    render(<OrchestratorCard agent={makeAgent()} {...handlers} />);
    expect(
      screen.getByPlaceholderText("Send a prompt to the orchestrator…"),
    ).toBeInTheDocument();
  });

  it("hides the prompt input during spawning", () => {
    const agent = makeAgent({ status: "spawning", spawnStep: "cloning" });
    render(<OrchestratorCard agent={agent} {...handlers} />);
    expect(
      screen.queryByPlaceholderText("Send a prompt to the orchestrator…"),
    ).not.toBeInTheDocument();
  });

  it("renders text output entries", () => {
    const agent = makeAgent({
      output: [{ type: "text", content: "Synthesis complete." }],
    });
    render(<OrchestratorCard agent={agent} {...handlers} />);
    expect(screen.getByText("Synthesis complete.")).toBeInTheDocument();
  });

  it("does not auto-scroll the page when orchestrator output updates", () => {
    const scrollSpy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollSpy,
    });

    const { rerender } = render(<OrchestratorCard agent={makeAgent()} {...handlers} />);
    rerender(
      <OrchestratorCard
        agent={makeAgent({
          output: [{ type: "text", content: "Updated synthesis" }],
        })}
        {...handlers}
      />,
    );

    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it("calls onStop when the stop button is clicked", () => {
    const onStop = vi.fn();
    render(
      <OrchestratorCard
        agent={makeAgent()}
        {...handlers}
        onStop={onStop}
      />,
    );
    fireEvent.click(screen.getByTitle("Stop orchestrator"));
    expect(onStop).toHaveBeenCalledWith("orch-1");
  });

  it("shows the permission banner when permission is pending", () => {
    const agent = makeAgent({
      pendingPermission: {
        title: "Run git push?",
        options: [
          { optionId: "allow", name: "Allow", kind: "allow" },
          { optionId: "deny", name: "Deny", kind: "deny" },
        ],
      },
    });
    render(<OrchestratorCard agent={agent} {...handlers} />);
    expect(screen.getByText("Run git push?")).toBeInTheDocument();
    expect(screen.getByText("Allow")).toBeInTheDocument();
    expect(screen.getByText("Deny")).toBeInTheDocument();
  });

  it("shows empty state message when no output", () => {
    render(<OrchestratorCard agent={makeAgent()} {...handlers} />);
    expect(
      screen.getByText("Waiting for broadcast results from workers…"),
    ).toBeInTheDocument();
  });

  it("disables input when agent is busy", () => {
    render(
      <OrchestratorCard agent={makeAgent({ status: "busy" })} {...handlers} />,
    );
    const input = screen.getByPlaceholderText(
      "Send a prompt to the orchestrator…",
    );
    expect(input).toBeDisabled();
  });

  it("shows unloaded dependency neighbors and loads them via the orchestrator card", () => {
    const onLoadWorker = vi.fn();
    render(
      <OrchestratorCard
        agent={makeAgent()}
        {...handlers}
        onLoadWorker={onLoadWorker}
        unloadedDependencies={[
          {
            repoName: "webapp",
            referencedBy: ["api-gateway"],
            directions: ["downstream"],
            suggestedUrl: "https://github.com/myorg/webapp",
          },
        ]}
      />,
    );

    expect(screen.getByText("Unloaded dependency neighbors detected")).toBeInTheDocument();
    expect(screen.getByText(/referenced by api-gateway/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByText("Load as Worker")[0]);
    expect(onLoadWorker).toHaveBeenCalledWith("https://github.com/myorg/webapp");
  });
});
