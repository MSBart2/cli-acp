import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AgentCard from "../components/AgentCard";

/** Helper to build a minimal agent object for testing. */
function makeAgent(overrides = {}) {
  return {
    agentId: "test-agent-1",
    repoUrl: "https://github.com/owner/my-repo",
    repoName: "my-repo",
    status: "ready",
    output: [],
    pendingPermission: null,
    ...overrides,
  };
}

const noop = () => { };

describe("AgentCard", () => {
  it("renders the repo name from the URL", () => {
    render(
      <AgentCard agent={makeAgent()} onSendPrompt={noop} onStop={noop} onPermissionResponse={noop} />
    );
    expect(screen.getByText("owner/my-repo")).toBeInTheDocument();
  });

  it("shows Ready status badge", () => {
    render(
      <AgentCard agent={makeAgent()} onSendPrompt={noop} onStop={noop} onPermissionResponse={noop} />
    );
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows Spawning status with progress message", () => {
    const agent = makeAgent({
      status: "spawning",
      spawnStep: "cloning",
      spawnMessage: "Cloning repository…",
    });
    render(
      <AgentCard agent={agent} onSendPrompt={noop} onStop={noop} onPermissionResponse={noop} />
    );
    expect(screen.getByText("Spawning")).toBeInTheDocument();
    expect(screen.getByText("Cloning repository…")).toBeInTheDocument();
  });

  it("disables input when agent is busy", () => {
    render(
      <AgentCard agent={makeAgent({ status: "busy" })} onSendPrompt={noop} onStop={noop} onPermissionResponse={noop} />
    );
    const input = screen.getByPlaceholderText(/Agent is busy/);
    expect(input).toBeDisabled();
  });

  it("disables input when agent is spawning", () => {
    const agent = makeAgent({ status: "spawning", spawnStep: "cloning", spawnMessage: "Cloning…" });
    render(
      <AgentCard agent={agent} onSendPrompt={noop} onStop={noop} onPermissionResponse={noop} />
    );
    const input = screen.getByPlaceholderText(/Agent is spawning/);
    expect(input).toBeDisabled();
  });

  it("renders text output", () => {
    const agent = makeAgent({
      output: [{ type: "text", content: "Hello from the agent!" }],
    });
    render(
      <AgentCard agent={agent} onSendPrompt={noop} onStop={noop} onPermissionResponse={noop} />
    );
    expect(screen.getByText("Hello from the agent!")).toBeInTheDocument();
  });

  it("renders error output", () => {
    const agent = makeAgent({
      output: [{ type: "error", content: "Something went wrong" }],
    });
    render(
      <AgentCard agent={agent} onSendPrompt={noop} onStop={noop} onPermissionResponse={noop} />
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders tool call output", () => {
    const agent = makeAgent({
      output: [{ type: "tool_call", name: "readFile", args: "completed" }],
    });
    render(
      <AgentCard agent={agent} onSendPrompt={noop} onStop={noop} onPermissionResponse={noop} />
    );
    expect(screen.getByText("readFile")).toBeInTheDocument();
  });

  it("shows permission banner when pendingPermission is set", () => {
    const agent = makeAgent({
      pendingPermission: {
        title: "Allow file read?",
        options: [
          { optionId: "allow", name: "Allow" },
          { optionId: "deny", name: "Deny" },
        ],
      },
    });
    render(
      <AgentCard agent={agent} onSendPrompt={noop} onStop={noop} onPermissionResponse={noop} />
    );
    expect(screen.getByText("Allow file read?")).toBeInTheDocument();
    expect(screen.getByText("Allow")).toBeInTheDocument();
    expect(screen.getByText("Deny")).toBeInTheDocument();
  });

  it("shows truncation notice when output exceeds MAX_VISIBLE entries", () => {
    // AgentCard uses MAX_VISIBLE = 3, so 10 entries shows "7 earlier messages hidden"
    const output = Array.from({ length: 10 }, (_, i) => ({
      type: "text",
      content: `Line ${i}`,
    }));
    render(
      <AgentCard agent={makeAgent({ output })} onSendPrompt={noop} onStop={noop} onPermissionResponse={noop} />
    );
    expect(screen.getByText(/7 earlier messages? hidden/)).toBeInTheDocument();
  });

  it("does not auto-scroll the page when new output arrives", () => {
    const scrollSpy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollSpy,
    });

    const { rerender } = render(
      <AgentCard agent={makeAgent()} onSendPrompt={noop} onStop={noop} onPermissionResponse={noop} />
    );

    rerender(
      <AgentCard
        agent={makeAgent({
          output: [{ type: "text", content: "Fresh output" }],
        })}
        onSendPrompt={noop}
        onStop={noop}
        onPermissionResponse={noop}
      />
    );

    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it("calls onStop when the close button is clicked", () => {
    let stoppedId = null;
    render(
      <AgentCard
        agent={makeAgent()}
        onSendPrompt={noop}
        onStop={(id) => { stoppedId = id; }}
        onPermissionResponse={noop}
      />
    );
    // Both icon-only buttons have empty accessible names — grab all and
    // pick the first one (the X / close button in the card header)
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(stoppedId).toBe("test-agent-1");
  });

  describe("dependency-awareness features", () => {
    it("shows teal dependency pills for dependsOn", () => {
      const agent = makeAgent({ manifest: { dependsOn: ["class-lib-a"], dependedBy: [] } });
      render(<AgentCard agent={agent} onSendPrompt={noop} onStop={noop} onPermissionResponse={noop} />);
      expect(screen.getByText("class-lib-a")).toBeInTheDocument();
    });

    it("shows gray dependency pills for dependedBy", () => {
      const agent = makeAgent({ manifest: { dependsOn: [], dependedBy: ["webapp"] } });
      render(<AgentCard agent={agent} onSendPrompt={noop} onStop={noop} onPermissionResponse={noop} />);
      expect(screen.getByText("webapp")).toBeInTheDocument();
    });

    it("shows 'No manifest · Create?' button when manifestMissing is true", () => {
      const agent = makeAgent({ manifestMissing: true, manifest: null });
      render(<AgentCard agent={agent} onSendPrompt={noop} onStop={noop} onPermissionResponse={noop} onCreateManifest={noop} />);
      expect(screen.getByText("No manifest · Create?")).toBeInTheDocument();
    });

    it("calls onCreateManifest when 'No manifest · Create?' button is clicked", () => {
      const onCreateManifest = vi.fn();
      const agent = makeAgent({ manifestMissing: true, manifest: null });
      render(<AgentCard agent={agent} onSendPrompt={noop} onStop={noop} onPermissionResponse={noop} onCreateManifest={onCreateManifest} />);
      fireEvent.click(screen.getByText("No manifest · Create?"));
      expect(onCreateManifest).toHaveBeenCalledWith("test-agent-1");
    });

    it("shows 'N deps not loaded' chip when unloadedDeps is non-empty", () => {
      const agent = makeAgent({ unloadedDeps: [{ repoName: "missing-lib", direction: "dependsOn" }] });
      render(<AgentCard agent={agent} onSendPrompt={noop} onStop={noop} onPermissionResponse={noop} />);
      expect(screen.getByText(/dep.*not loaded/)).toBeInTheDocument();
    });

    it("prefills the suggested repo URL in the inline input when loading an unloaded dependency", () => {
      const onLoadWorker = vi.fn();
      const agent = makeAgent({
        repoUrl: "https://github.com/myorg/api-gateway",
        unloadedDeps: [{ repoName: "webapp", direction: "downstream", suggestedUrl: "https://github.com/myorg/webapp" }],
      });

      render(<AgentCard agent={agent} onSendPrompt={noop} onStop={noop} onPermissionResponse={noop} onLoadWorker={onLoadWorker} />);

      // Expand the unloaded deps section
      fireEvent.click(screen.getByText(/dep.*not loaded/));

      // The inline input should be pre-filled with the suggested URL
      const input = screen.getByPlaceholderText("Repo URL…");
      expect(input.value).toBe("https://github.com/myorg/webapp");

      // Clicking "Load as Worker" calls onLoadWorker with the URL
      fireEvent.click(screen.getByRole("button", { name: /load as worker/i }));
      expect(onLoadWorker).toHaveBeenCalledWith("https://github.com/myorg/webapp");
    });

    it("loads the dependency when Enter is pressed in the URL input", () => {
      const onLoadWorker = vi.fn();
      const agent = makeAgent({
        repoUrl: "https://github.com/myorg/api-gateway",
        unloadedDeps: [{ repoName: "webapp", direction: "downstream", suggestedUrl: "https://github.com/myorg/webapp" }],
      });

      render(<AgentCard agent={agent} onSendPrompt={noop} onStop={noop} onPermissionResponse={noop} onLoadWorker={onLoadWorker} />);

      fireEvent.click(screen.getByText(/dep.*not loaded/));
      const input = screen.getByPlaceholderText("Repo URL…");
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onLoadWorker).toHaveBeenCalledWith("https://github.com/myorg/webapp");
    });

    it("shows pulsing impact badge when impactChecking is true", () => {
      const agent = makeAgent({ impactChecking: true });
      render(<AgentCard agent={agent} onSendPrompt={noop} onStop={noop} onPermissionResponse={noop} />);
      expect(screen.getByText("Impact check…")).toBeInTheDocument();
    });
  });
});
