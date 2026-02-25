import { describe, it, expect } from "vitest";
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

const noop = () => {};

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
});
