import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const { mockSocket } = vi.hoisted(() => {
  let listeners = {};
  return {
    mockSocket: {
      on: vi.fn((event, handler) => {
        listeners[event] = [...(listeners[event] || []), handler];
      }),
      off: vi.fn((event) => {
        if (!event) {
          listeners = {};
          return;
        }
        delete listeners[event];
      }),
      emit: vi.fn(),
      reset() {
        listeners = {};
        this.on.mockClear();
        this.off.mockClear();
        this.emit.mockClear();
      },
      _emit(event, payload) {
        for (const handler of listeners[event] || []) {
          handler(payload);
        }
      },
    },
  };
});

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => mockSocket),
}));

vi.mock("react-hot-toast", () => ({
  Toaster: () => null,
  default: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("lucide-react", () => ({
  Terminal: () => <div data-testid="terminal-icon" />,
}));

vi.mock("../hooks/useNotifications", () => ({
  useNotifications: () => ({
    requestBrowserPermission: vi.fn(),
    browserPermission: "granted",
  }),
}));

vi.mock("../components/Header", () => ({
  default: ({ connected, repoBaseDir, reuseExisting }) => (
    <div data-testid="header">
      connected:{String(connected)};base:{repoBaseDir};reuse:{String(reuseExisting)}
    </div>
  ),
}));

vi.mock("../components/RepoInput", () => ({
  default: () => <div data-testid="repo-input" />,
}));

vi.mock("../components/OrchestratorInput", () => ({
  default: () => <div data-testid="orchestrator-input" />,
}));

vi.mock("../components/OrchestratorCard", () => ({
  default: ({ agent }) => (
    <div data-testid="orchestrator-card">
      {agent.repoName}:{agent.status}
    </div>
  ),
}));

vi.mock("../components/AgentCard", () => ({
  default: ({ agent, onLoadWorker, onCreateManifest }) => (
    <div data-testid={`agent-${agent.agentId}`}>
      <div>{agent.repoName}</div>
      <div>status:{agent.status}</div>
      <div>manifestMissing:{String(agent.manifestMissing)}</div>
      <div>unloaded:{agent.unloadedDeps?.length ?? 0}</div>
      <div>dependsOn:{(agent.manifest?.dependsOn || []).join(",")}</div>
      <div>dependedBy:{(agent.manifest?.dependedBy || []).join(",")}</div>
      <div>impact:{String(agent.impactChecking)}</div>
      {agent.manifestMissing && (
        <button onClick={() => onCreateManifest(agent.agentId)}>
          create-manifest
        </button>
      )}
      {agent.unloadedDeps?.[0] && (
        <button onClick={() => onLoadWorker(`https://github.com/acme/${agent.unloadedDeps[0].repoName}.git`)}>
          load-worker
        </button>
      )}
    </div>
  ),
}));

vi.mock("../components/BroadcastInput", () => ({
  default: ({ onBroadcast, broadcasting }) => (
    <div data-testid="broadcast-input">
      <div>broadcasting:{String(broadcasting)}</div>
      <button onClick={() => onBroadcast("update downstream contract", "summarize it", ["webapp"])}>
        start-broadcast
      </button>
    </div>
  ),
}));

vi.mock("../components/BroadcastResults", () => ({
  default: ({ broadcastResults }) => (
    <div data-testid="broadcast-results">
      results:{broadcastResults.results.length}
    </div>
  ),
}));

vi.mock("../components/DependencyGraph", () => ({
  default: ({ graph, onRefresh }) => (
    <div>
      <div data-testid="dependency-graph">
        {graph ? `nodes:${graph.nodes.length};edges:${graph.edges.length}` : "no-graph"}
      </div>
      <button onClick={onRefresh}>refresh-graph</button>
    </div>
  ),
}));

vi.mock("../components/MissionContext", () => ({
  default: ({ value, onChange }) => (
    <div>
      <div data-testid="mission-context">{value}</div>
      <button onClick={() => onChange("shared mission")}>set-mission</button>
    </div>
  ),
}));

vi.mock("../components/RoutingPlanPanel", () => ({
  default: ({ plan, onApprove, onCancel }) =>
    plan ? (
      <div data-testid="routing-plan">
        <div>{plan.sourceRepoName}</div>
        <div>routes:{plan.routes.length}</div>
        <button onClick={() => onApprove(plan.planId, plan.routes)}>approve-plan</button>
        <button onClick={() => onCancel(plan.planId)}>cancel-plan</button>
      </div>
    ) : null,
}));

vi.mock("../components/WorkItemTracker", () => ({
  default: ({ items, onDismiss }) => (
    <div data-testid="work-item-tracker">
      items:{items.length}
      <button onClick={onDismiss}>dismiss-work-items</button>
    </div>
  ),
}));

vi.mock("../components/BroadcastHistory", () => ({
  default: ({ history }) => (
    <div data-testid="broadcast-history">history:{history.length}</div>
  ),
}));

import App from "../App";

function emitSocket(event, payload) {
  act(() => {
    mockSocket._emit(event, payload);
  });
}

function buildAgent(overrides) {
  return {
    agentId: overrides.agentId,
    repoUrl: `https://github.com/acme/${overrides.repoName}.git`,
    repoName: overrides.repoName,
    repoPath: `C:\\repos\\${overrides.repoName}`,
    role: "worker",
    status: "ready",
    manifest: null,
    manifestMissing: false,
    unloadedDeps: [],
    ...overrides,
  };
}

describe("App dependency workflows", () => {
  beforeEach(() => {
    mockSocket.reset();
  });

  it("requests initial hydration data when the socket connects", () => {
    render(<App />);

    emitSocket("connect");

    expect(mockSocket.emit).toHaveBeenCalledWith("workitems:list");
    expect(mockSocket.emit).toHaveBeenCalledWith("broadcast:list_history");
    expect(mockSocket.emit).toHaveBeenCalledWith("graph:list");
    expect(mockSocket.emit).toHaveBeenCalledWith("mission:get");
    expect(screen.getByTestId("header")).toHaveTextContent("connected:true");
  });

  it("hydrates dependency state from graph events and clears stale flags via agent:snapshot", () => {
    render(<App />);

    emitSocket("agent:created", buildAgent({
      agentId: "orch-1",
      repoName: "ops",
      role: "orchestrator",
    }));
    emitSocket("agent:created", buildAgent({
      agentId: "worker-1",
      repoName: "api",
      manifest: { dependsOn: ["library"], dependedBy: [] },
    }));

    emitSocket("graph:manifest_missing", { agentId: "worker-1" });
    emitSocket("graph:unloaded_deps", {
      agentId: "worker-1",
      unloaded: [{ repoName: "webapp", direction: "downstream" }],
    });

    const workerCard = screen.getByTestId("agent-worker-1");
    expect(workerCard).toHaveTextContent("manifestMissing:true");
    expect(workerCard).toHaveTextContent("unloaded:1");

    emitSocket("agent:snapshot", {
      agentId: "worker-1",
      manifest: { dependsOn: ["library"], dependedBy: ["webapp"] },
      manifestMissing: false,
      unloadedDeps: [],
      status: "ready",
    });

    expect(workerCard).toHaveTextContent("manifestMissing:false");
    expect(workerCard).toHaveTextContent("unloaded:0");
    expect(workerCard).toHaveTextContent("dependedBy:webapp");
  });

  it("clears stale missing-manifest and unloaded-dependency flags when graph state recovers", () => {
    render(<App />);

    emitSocket("agent:created", buildAgent({
      agentId: "orch-1",
      repoName: "ops",
      role: "orchestrator",
    }));
    emitSocket("agent:created", buildAgent({
      agentId: "worker-1",
      repoName: "api",
      manifestMissing: true,
      unloadedDeps: [{ repoName: "webapp", direction: "downstream" }],
    }));

    const workerCard = screen.getByTestId("agent-worker-1");
    expect(workerCard).toHaveTextContent("manifestMissing:true");
    expect(workerCard).toHaveTextContent("unloaded:1");

    emitSocket("graph:updated", {
      nodes: [{ agentId: "worker-1", repoName: "api", role: "api", techStack: ["node"] }],
      edges: [],
      warnings: [],
      unloadedDeps: [],
    });

    expect(workerCard).toHaveTextContent("manifestMissing:false");
    expect(workerCard).toHaveTextContent("unloaded:0");
  });

  it("emits manifest creation and load-worker actions for dependency recovery flows", () => {
    render(<App />);

    emitSocket("agent:created", buildAgent({
      agentId: "orch-1",
      repoName: "ops",
      role: "orchestrator",
    }));
    emitSocket("agent:created", buildAgent({
      agentId: "worker-1",
      repoName: "api",
      manifestMissing: true,
      unloadedDeps: [{ repoName: "webapp", direction: "downstream" }],
    }));

    fireEvent.click(screen.getByText("create-manifest"));
    expect(mockSocket.emit).toHaveBeenCalledWith("orchestrator:create_manifest", {
      agentId: "worker-1",
    });

    fireEvent.click(screen.getByText("load-worker"));
    expect(mockSocket.emit).toHaveBeenCalledWith("agent:create", {
      repoUrl: "https://github.com/acme/webapp.git",
      role: "worker",
      repoBaseDir: "C:\\users\\rmathis\\source",
      reuseExisting: true,
      model: undefined,
    });
  });

  it("applies restored session settings so follow-up worker loads use the restored values", () => {
    render(<App />);

    emitSocket("agent:created", buildAgent({
      agentId: "orch-1",
      repoName: "ops",
      role: "orchestrator",
    }));
    emitSocket("agent:created", buildAgent({
      agentId: "worker-1",
      repoName: "api",
      unloadedDeps: [{ repoName: "webapp", direction: "downstream" }],
    }));

    emitSocket("session:loaded", {
      name: "saved-session",
      settings: {
        repoBaseDir: "C:\\restored-base",
        reuseExisting: false,
      },
    });

    expect(screen.getByTestId("header")).toHaveTextContent(
      "base:C:\\restored-base;reuse:false",
    );

    fireEvent.click(screen.getByText("load-worker"));
    expect(mockSocket.emit).toHaveBeenCalledWith("agent:create", {
      repoUrl: "https://github.com/acme/webapp.git",
      role: "worker",
      repoBaseDir: "C:\\restored-base",
      reuseExisting: false,
      model: undefined,
    });
  });

  it("routes approval actions back to the server and marks downstream workers as impact-checking", () => {
    render(<App />);

    emitSocket("agent:created", buildAgent({
      agentId: "orch-1",
      repoName: "ops",
      role: "orchestrator",
    }));
    emitSocket("agent:created", buildAgent({
      agentId: "worker-api",
      repoName: "api",
    }));
    emitSocket("agent:created", buildAgent({
      agentId: "worker-web",
      repoName: "webapp",
    }));

    emitSocket("orchestrator:routing_plan", {
      planId: "plan-1",
      sourceAgentId: "worker-api",
      sourceRepoName: "api",
      originalPromptText: "update contract",
      routes: [{ repoName: "webapp", promptText: "adjust UI for new contract" }],
    });

    emitSocket("agent:impact_checking", {
      downstreamRepoNames: ["webapp"],
      checking: true,
    });

    expect(screen.getByTestId("routing-plan")).toHaveTextContent("routes:1");
    expect(screen.getByTestId("agent-worker-web")).toHaveTextContent("impact:true");
    expect(screen.getByTestId("agent-worker-api")).toHaveTextContent("impact:undefined");

    fireEvent.click(screen.getByText("approve-plan"));

    expect(mockSocket.emit).toHaveBeenCalledWith("orchestrator:approve_routing_plan", {
      planId: "plan-1",
      routes: [{ repoName: "webapp", promptText: "adjust UI for new contract" }],
    });
    expect(screen.queryByTestId("routing-plan")).not.toBeInTheDocument();
  });

  it("keeps broadcast synthesis flow while supporting targeted worker state changes", () => {
    render(<App />);

    emitSocket("agent:created", buildAgent({
      agentId: "orch-1",
      repoName: "ops",
      role: "orchestrator",
    }));
    emitSocket("agent:created", buildAgent({
      agentId: "worker-api",
      repoName: "api",
    }));
    emitSocket("agent:created", buildAgent({
      agentId: "worker-web",
      repoName: "webapp",
    }));

    fireEvent.click(screen.getByText("start-broadcast"));

    expect(mockSocket.emit).toHaveBeenCalledWith("agent:prompt_all", {
      text: "update downstream contract",
      synthesisInstructions: "summarize it",
      targetRepoNames: ["webapp"],
    });
    expect(screen.getByTestId("agent-worker-web")).toHaveTextContent("status:busy");
    expect(screen.getByTestId("agent-worker-api")).toHaveTextContent("status:ready");

    emitSocket("agent:broadcast_results", {
      promptText: "update downstream contract",
      timestamp: "2026-03-18T00:00:00.000Z",
      results: [{ agentId: "worker-web", repoName: "webapp", status: "completed", output: "done" }],
    });
    emitSocket("graph:updated", {
      nodes: [{ agentId: "worker-api", repoName: "api" }],
      edges: [{ from: "worker-web", to: "worker-api" }],
      warnings: [],
    });
    emitSocket("agent:prompt_all_complete");

    expect(screen.getByTestId("broadcast-results")).toHaveTextContent("results:1");
    expect(screen.getByTestId("dependency-graph")).toHaveTextContent("nodes:1;edges:1");
    expect(screen.getByTestId("broadcast-input")).toHaveTextContent("broadcasting:false");

    fireEvent.click(screen.getByText("refresh-graph"));
    expect(mockSocket.emit).toHaveBeenCalledWith("graph:list");
  });

  it("renders restored worker cards even when no orchestrator is present", () => {
    render(<App />);

    emitSocket("agent:created", buildAgent({
      agentId: "worker-api",
      repoName: "api",
      status: "stopped",
    }));

    expect(screen.getByTestId("agent-worker-api")).toHaveTextContent("status:stopped");
    expect(screen.getByTestId("repo-input")).toBeInTheDocument();
  });

  it("can hydrate missing restored cards from agent:snapshot after session:loaded", () => {
    render(<App />);

    emitSocket("session:loaded", {
      name: "saved-session",
      settings: {
        repoBaseDir: "C:\\restored-base",
        reuseExisting: true,
      },
    });

    expect(mockSocket.emit).toHaveBeenCalledWith("graph:list");

    emitSocket("agent:snapshot", buildAgent({
      agentId: "worker-api",
      repoName: "api",
      status: "stopped",
    }));

    expect(screen.getByTestId("agent-worker-api")).toHaveTextContent("status:stopped");
  });

  it("surfaces restored broadcast history and work items for history-only sessions", () => {
    render(<App />);

    emitSocket("workitems:updated", {
      items: [{ url: "https://github.com/acme/api/issues/1", type: "issue", number: 1 }],
    });
    emitSocket("broadcast:history", {
      history: [
        {
          promptText: "audit repos",
          timestamp: "2026-03-18T00:00:00.000Z",
          results: [],
        },
      ],
    });

    expect(screen.getByTestId("work-item-tracker")).toHaveTextContent("items:1");
    expect(screen.getByTestId("broadcast-history")).toHaveTextContent("history:1");

    fireEvent.click(screen.getByText("dismiss-work-items"));
    expect(screen.queryByTestId("work-item-tracker")).not.toBeInTheDocument();
  });
});

describe("App config:defaults auto-launch", () => {
  beforeEach(() => {
    mockSocket.reset();
  });

  it("launches the orchestrator and all workers when both are configured", () => {
    render(<App />);

    emitSocket("config:defaults", {
      orchestratorUrl: "https://github.com/acme/ops",
      workerUrls: [
        "https://github.com/acme/api",
        "https://github.com/acme/webapp",
      ],
    });

    expect(mockSocket.emit).toHaveBeenCalledWith("agent:create", {
      repoUrl: "https://github.com/acme/ops",
      role: "orchestrator",
      repoBaseDir: "C:\\users\\rmathis\\source",
      reuseExisting: true,
    });
    expect(mockSocket.emit).toHaveBeenCalledWith("agent:create", {
      repoUrl: "https://github.com/acme/api",
      role: "worker",
      repoBaseDir: "C:\\users\\rmathis\\source",
      reuseExisting: true,
    });
    expect(mockSocket.emit).toHaveBeenCalledWith("agent:create", {
      repoUrl: "https://github.com/acme/webapp",
      role: "worker",
      repoBaseDir: "C:\\users\\rmathis\\source",
      reuseExisting: true,
    });
  });

  it("launches only the orchestrator when no workers are configured", () => {
    render(<App />);

    emitSocket("config:defaults", {
      orchestratorUrl: "https://github.com/acme/ops",
      workerUrls: [],
    });

    const createCalls = mockSocket.emit.mock.calls.filter(
      ([event]) => event === "agent:create",
    );
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0][1]).toMatchObject({ role: "orchestrator" });
  });

  it("launches only workers when the orchestrator URL is null", () => {
    render(<App />);

    emitSocket("config:defaults", {
      orchestratorUrl: null,
      workerUrls: ["https://github.com/acme/api"],
    });

    const createCalls = mockSocket.emit.mock.calls.filter(
      ([event]) => event === "agent:create",
    );
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0][1]).toMatchObject({ role: "worker", repoUrl: "https://github.com/acme/api" });
  });

  it("emits no agent:create calls when both orchestrator and workers are absent", () => {
    render(<App />);

    emitSocket("config:defaults", { orchestratorUrl: null, workerUrls: [] });

    expect(mockSocket.emit).not.toHaveBeenCalledWith(
      "agent:create",
      expect.anything(),
    );
  });

  it("ignores a second config:defaults event — auto-launch is idempotent", () => {
    render(<App />);

    emitSocket("config:defaults", {
      orchestratorUrl: "https://github.com/acme/ops",
      workerUrls: [],
    });
    emitSocket("config:defaults", {
      orchestratorUrl: "https://github.com/acme/ops",
      workerUrls: ["https://github.com/acme/api"],
    });

    const createCalls = mockSocket.emit.mock.calls.filter(
      ([event]) => event === "agent:create",
    );
    // Only the first event's orchestrator launch, second event ignored entirely
    expect(createCalls).toHaveLength(1);
  });

  it("uses current repoBaseDir and reuseExisting when session:loaded fires before config:defaults", () => {
    render(<App />);

    // Simulate a session restore updating settings before auto-launch fires
    emitSocket("session:loaded", {
      name: "saved-session",
      settings: { repoBaseDir: "C:\\restored-base", reuseExisting: false },
    });

    emitSocket("config:defaults", {
      orchestratorUrl: "https://github.com/acme/ops",
      workerUrls: [],
    });

    expect(mockSocket.emit).toHaveBeenCalledWith("agent:create", {
      repoUrl: "https://github.com/acme/ops",
      role: "orchestrator",
      repoBaseDir: "C:\\restored-base",
      reuseExisting: false,
    });
  });
});
