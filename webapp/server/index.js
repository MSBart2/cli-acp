import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { spawn, execSync } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import * as acp from "@agentclientprotocol/sdk";
import {
  isValidGitUrl,
  repoNameFromUrl,
  extractWorkItems,
  buildDependencyGraph,
  getGraphRelationships,
  inferManifestRelationships,
  CHANGE_SIGNAL_WORDS,
  parseRoutingPlan,
  buildMissionPrefix,
  buildCrossRepoContext,
  enrichPromptText,
  buildSynthesisPrompt,
  buildEventLogEntry,
} from "./helpers.js";
import {
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
  purgeOldSessions,
  getRestorableAgents,
} from "./sessionStore.js";
import { shutdownAgents } from "./sessionLifecycle.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3001;
const COPILOT_CLI_PATH = process.env.COPILOT_CLI_PATH || "copilot";
// Extra args prepended before --acp --stdio (e.g. for test stub: node /path/to/mockWorker.js)
const COPILOT_CLI_EXTRA_ARGS = (process.env.COPILOT_CLI_ARGS ?? "")
  .split(/\s+/)
  .filter(Boolean);
const REPO_BASE_DIR = process.env.REPO_BASE_DIR || join(tmpdir(), "acp-repos");
const DEFAULT_ORCHESTRATOR_URL =
  process.env.DEFAULT_ORCHESTRATOR_URL?.trim() || "";
const DEFAULT_WORKER_URLS = process.env.DEFAULT_WORKER_URLS
  ? process.env.DEFAULT_WORKER_URLS.split(",")
      .map((u) => u.trim())
      .filter(Boolean)
  : [];
const DEFAULT_MODEL = process.env.DEFAULT_MODEL?.trim() || null;
// Inactivity timeout: how long a prompt can go without ANY streaming activity
// (text chunk, tool call, etc.) before we consider it truly stalled.
// This is intentionally generous — a busy agent doing file I/O or long tool
// calls may be silent for several minutes between updates.
const PROMPT_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes of silence
const __filename = fileURLToPath(import.meta.url);

// ---------------------------------------------------------------------------
// Test-mode runtime state — overrides CLI path/args at test runtime without
// requiring a server restart. Only mutated by /api/test/* endpoints, which are
// disabled in production (NODE_ENV=production).
// ---------------------------------------------------------------------------
const testCliOverride = {
  path: /** @type {string|null} */ (null),
  args: /** @type {string[]} */ ([]),
};
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Express + Socket.IO setup
// ---------------------------------------------------------------------------

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

// Serve the built React client in production
app.use(express.static(join(__dirname, "../client/dist")));

// ---------------------------------------------------------------------------
// Test-only reset endpoint — stops all agents so E2E tests start clean.
// Not available in production (NODE_ENV=production).
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV !== "production") {
  app.post("/api/test/reset", (_req, res) => {
    const ids = [...agents.keys()];
    for (const agentId of ids) {
      stopAgent(agentId, null);
      // Broadcast the stop to all connected browser clients
      io.emit("agent:stopped", { agentId });
    }
    console.log(`[test/reset] Stopped ${ids.length} agent(s)`);
    res.json({ stopped: ids.length });
  });

  /**
   * Override the CLI path/args used to spawn agents. Used by e2e mock-worker
   * tests so the server uses the stub without needing a server restart.
   * Body: { path?: string, args?: string[] }
   */
  app.post("/api/test/set-cli", express.json(), (req, res) => {
    const { path: cliPath, args: cliArgs } = req.body ?? {};
    testCliOverride.path = typeof cliPath === "string" ? cliPath : null;
    testCliOverride.args = Array.isArray(cliArgs) ? cliArgs : [];
    console.log(
      `[test/set-cli] Override: ${testCliOverride.path ?? "(none)"} ${testCliOverride.args.join(" ")}`,
    );
    res.json({ ok: true });
  });

  /** Restore CLI to defaults. */
  app.post("/api/test/clear-cli", (_req, res) => {
    testCliOverride.path = null;
    testCliOverride.args = [];
    console.log("[test/clear-cli] Cleared CLI override");
    res.json({ ok: true });
  });

  /**
   * Directly create a mock agent from a local repo path — bypasses git clone
   * and URL validation. Uses whatever CLI override is currently set.
   * Body: { repoPath: string, role?: "orchestrator"|"worker", name?: string }
   */
  app.post("/api/test/create-agent", express.json(), async (req, res) => {
    const { repoPath, role = "worker", name } = req.body ?? {};
    if (typeof repoPath !== "string" || !repoPath) {
      return res.status(400).json({ error: "repoPath is required" });
    }

    const agentId = randomUUID();
    const repoName = name || basename(repoPath);
    const repoUrl = `file://${repoPath}`;

    // Fake socket that broadcasts to all connected browser clients
    const fakeSocket = {
      id: "test-endpoint",
      emit: (event, data) => io.emit(event, data),
    };

    io.emit("agent:spawning", {
      agentId,
      repoUrl,
      repoName,
      model: null,
      role,
      step: "starting",
      message: "Starting mock agent…",
    });

    let copilotProcess, connection, earlyExitPromise;
    try {
      ({
        process: copilotProcess,
        connection,
        earlyExitPromise,
      } = spawnAndConnect({ agentId, model: null, socket: fakeSocket }));
    } catch (err) {
      io.emit("agent:error", {
        agentId,
        error: `Spawn failed: ${err.message}`,
      });
      return res.status(500).json({ error: err.message });
    }

    agents.set(agentId, {
      process: copilotProcess,
      connection,
      sessionId: null,
      repoUrl,
      repoName,
      repoPath,
      repoReused: true, // don't delete on cleanup — test owns the dir
      model: null,
      role,
      status: "initializing",
      permissionResolver: null,
      socketId: "test-endpoint",
      pendingPermissionOptions: null,
      heartbeat: null,
      eventLog: [],
      manifest: null,
      manifestMissing: true,
    });

    // Respond immediately — the agent finishes init asynchronously
    res.json({ agentId });

    // Run ACP init + new session in background
    (async () => {
      try {
        const initResult = await Promise.race([
          connection.initialize({
            protocolVersion: acp.PROTOCOL_VERSION,
            clientCapabilities: {},
          }),
          earlyExitPromise,
        ]);
        console.log(
          `[test/create-agent] ${agentId.slice(0, 8)} connected (v${initResult.protocolVersion})`,
        );

        const sessionResult = await connection.newSession({
          cwd: repoPath,
          mcpServers: [],
        });
        const agent = agents.get(agentId);
        if (!agent) return;
        agent.sessionId = sessionResult.sessionId;

        // Run the verification prompt (mock worker responds with text chunks)
        agent.capturingManifest = true;
        agent.manifestText = [];
        try {
          await connection.prompt({
            sessionId: sessionResult.sessionId,
            prompt: [{ type: "text", text: "NO_MANIFEST: mock test repo" }],
          });
        } catch {
          /* ignore */
        }
        agent.capturingManifest = false;
        agent.status = "ready";

        const graph = buildDependencyGraph(agents);
        io.emit("agent:created", buildAgentSnapshot(agentId, graph, "ready"));
        emitDependencyGraphState(fakeSocket, graph);

        copilotProcess.once("close", (code) => {
          const current = agents.get(agentId);
          if (!current || current.status === "stopped") return;
          current.status = "error";
          io.emit("agent:error", {
            agentId,
            error: `Mock process exited (code ${code ?? "null"})`,
          });
          agents.delete(agentId);
        });
      } catch (err) {
        console.error(`[test/create-agent] ACP init failed: ${err.message}`);
        agents.delete(agentId);
        io.emit("agent:error", {
          agentId,
          error: `ACP init failed: ${err.message}`,
        });
      }
    })();
  });
}

/**
 * Recursively sum file sizes inside a directory.
 * @param {string} dir
 * @returns {number} total bytes
 */
function getDirSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += getDirSize(full);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      try {
        total += statSync(full).size;
      } catch {
        /* skip */
      }
    }
  }
  return total;
}

// Returns the structured event log for a single agent — all sessionUpdate events
// received during this session, in order, as { timestamp, type, content } objects.
app.get("/api/agents/:agentId/events", (req, res) => {
  const agent = agents.get(req.params.agentId);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  res.json({ agentId: req.params.agentId, events: agent.eventLog });
});

// Returns the git diff of the cloned repo for a single agent.
// Shells `git diff HEAD` in the agent's working directory.
// Responses over 50 KB are truncated and flagged.
const DIFF_MAX_BYTES = 50 * 1024;
app.get("/api/agents/:agentId/diff", (req, res) => {
  const agent = agents.get(req.params.agentId);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  if (!agent.repoPath)
    return res.status(400).json({ error: "No repo path for this agent" });
  let diff = "";
  try {
    diff = execSync("git diff HEAD", {
      cwd: agent.repoPath,
      timeout: 5000,
    }).toString();
  } catch {
    // git diff exits non-zero when there are no changes or the repo has no commits
    diff = "";
  }
  const truncated = Buffer.byteLength(diff) > DIFF_MAX_BYTES;
  res.json({
    agentId: req.params.agentId,
    diff: truncated ? diff.slice(0, DIFF_MAX_BYTES) : diff,
    truncated,
  });
});

// Returns total and per-agent disk usage of cloned repo directories.
app.get("/api/disk-usage", (req, res) => {
  const usage = [];
  for (const [agentId, agent] of agents) {
    if (!agent.repoPath) continue;
    try {
      // Walk the directory tree and sum file sizes
      const bytes = getDirSize(agent.repoPath);
      usage.push({ agentId, repoName: agent.repoName, bytes });
    } catch {
      usage.push({ agentId, repoName: agent.repoName, bytes: 0 });
    }
  }
  const totalBytes = usage.reduce((sum, a) => sum + a.bytes, 0);
  res.json({ totalBytes, agents: usage });
});

// ---------------------------------------------------------------------------
// Agent registry – one entry per spawned copilot process
// ---------------------------------------------------------------------------

/** @type {Map<string, {process, connection, sessionId, repoUrl, repoName, repoPath, role, status, permissionResolver, socketId, pendingPermissionOptions, eventLog: Array<{timestamp: string, type: string, content: unknown}>}>} */
const agents = new Map();

/**
 * Server-side registry of work items (issues & PRs) detected from agent
 * output. Keyed by URL so the same item is never stored twice.
 * @type {Map<string, { url: string, owner: string, repo: string, type: "issue"|"pr", number: number, detectedAt: string, agentId: string, agentRepoName: string }>}
 */
const workItems = new Map();

/**
 * Keeps the last N broadcast waves so the client can review past results.
 * Most recent wave is at the end of the array.
 * @type {Array<{ promptText: string, timestamp: string, results: Array }>}
 */
const broadcastHistory = [];
const MAX_BROADCAST_HISTORY = 10;

/**
 * Tracks the currently-active broadcast wave so we can coalesce results.
 * Only one wave is active at a time — a new broadcast replaces the previous one.
 * @type {{ promptText: string, startedAt: string, participants: Map<string, { repoName: string, repoUrl: string, textChunks: string[], status: string }>, socket: object } | null}
 */
let activeBroadcastWave = null;

/**
 * Stores the prompt and failed-agent IDs from the most-recently completed
 * broadcast wave so the client can trigger a targeted retry.
 * @type {{ promptText: string, synthesisInstructions: string|null, failedAgentIds: string[] } | null}
 */
let lastCompletedWave = null;

/** Pending orchestrator-generated routing plans awaiting user approval. */
const pendingRoutingPlans = new Map();

/** Active cascade runs used to support multi-wave downstream follow-ups. */
const cascadeRuns = new Map();

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

let currentSessionName = "default";

/** Tracks the last repoBaseDir used in agent:create so session:load respawn can reuse it. */
let currentRepoBaseDir = REPO_BASE_DIR;
let currentReuseExisting = true;

/** Global mission/context text prepended to every agent prompt when non-empty. */
let globalMissionContext = "";

function saveCurrentSession() {
  // Auto-name from orchestrator repoName + date when still on the default name
  if (currentSessionName === "default") {
    const orchestrator = [...agents.values()].find(
      (a) => a.role === "orchestrator",
    );
    if (orchestrator?.repoName) {
      const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      currentSessionName = `${orchestrator.repoName}-${date}`;
      console.log(`[session] Auto-named session: ${currentSessionName}`);
    }
  }
  saveSession(currentSessionName, {
    agents,
    workItems,
    broadcastHistory,
    repoBaseDir: currentRepoBaseDir,
    reuseExisting: currentReuseExisting,
  });
  purgeOldSessions();
}

/**
 * Wraps a promise with a fixed wall-clock timeout. Use this for short, bounded
 * operations like initialize() and newSession() where activity-based keepalives
 * don't apply.
 * @param {Promise} promise
 * @param {number} timeoutMs
 * @param {string} errorMessage
 * @returns {Promise}
 */
function withTimeout(promise, timeoutMs, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs),
    ),
  ]);
}

/**
 * Wraps a long-running prompt promise with an *inactivity* timeout instead of
 * a fixed wall-clock timeout. The deadline is reset every time `heartbeat()` is
 * called — so an agent that is actively streaming will never be timed out, but
 * one that goes completely silent for `inactivityMs` will be considered stalled.
 *
 * @param {Promise} promise - The prompt promise to race against
 * @param {number} inactivityMs - Max silence before treating the prompt as stalled
 * @param {string} errorMessage - Error message emitted on inactivity timeout
 * @returns {{ promise: Promise, heartbeat: () => void }}
 */
function withActivityTimeout(promise, inactivityMs, errorMessage) {
  let timeoutHandle;
  let rejectFn;

  // Create a separate promise that we can reject externally via rejectFn
  const inactivityPromise = new Promise((_, reject) => {
    rejectFn = reject;
  });

  /** Call this on every streaming update to reset the inactivity deadline. */
  function heartbeat() {
    clearTimeout(timeoutHandle);
    timeoutHandle = setTimeout(
      () => rejectFn(new Error(errorMessage)),
      inactivityMs,
    );
  }

  // Start the inactivity clock immediately
  heartbeat();

  const raced = Promise.race([promise, inactivityPromise]).finally(() => {
    // Always clean up the dangling timer when the prompt settles either way
    clearTimeout(timeoutHandle);
  });

  return { promise: raced, heartbeat };
}

/**
 * Run downstream impact analysis for a completed worker prompt and emit a
 * routing plan when the orchestrator finds follow-up work.
 *
 * @param {object} socket
 * @param {string} agentId
 * @param {string} originalPromptText
 * @param {string} accumulatedOutput
 * @param {{ cascadeRunId?: string, forceCascade?: boolean } | null} options
 * @returns {Promise<boolean>}
 */
async function runCascadeAnalysis(
  socket,
  agentId,
  originalPromptText,
  accumulatedOutput,
  options = null,
) {
  const agent = agents.get(agentId);
  if (!agent) {
    return false;
  }

  const hasSignal = originalPromptText
    .toLowerCase()
    .split(/\W+/)
    .some((w) => CHANGE_SIGNAL_WORDS.has(w));
  const cascadeRun = options?.cascadeRunId
    ? cascadeRuns.get(options.cascadeRunId)
    : null;
  const visitedRepoNames = cascadeRun?.visitedRepoNames ?? new Set();
  const { downstream } = getGraphRelationships(agents, agentId);
  const filteredDownstream = downstream.filter(
    (repoName) => !visitedRepoNames.has(repoName.toLowerCase()),
  );

  if (
    !(options?.forceCascade || hasSignal) ||
    filteredDownstream.length === 0
  ) {
    return false;
  }

  const orchestratorEntry = [...agents.entries()].find(
    ([, candidate]) =>
      candidate.role === "orchestrator" &&
      candidate.sessionId &&
      candidate.status === "ready",
  );
  if (!orchestratorEntry) {
    return false;
  }

  const [orchestratorId, orchestrator] = orchestratorEntry;
  const cascadePrompt =
    `Worker "${agent.repoName}" just completed a task: "${originalPromptText}"\n\n` +
    `Dependency context:\n- ${agent.repoName} is depended on by: ${filteredDownstream.join(", ")} (loaded in this session)\n\n` +
    `Review the worker's output and decide:\n` +
    `1. Do any changes require follow-up work in downstream repos?\n` +
    `2. If yes, write a targeted prompt for each affected downstream repo:\n   @{repoName}: {prompt text}\n` +
    `3. If no downstream impact, reply: NO_CASCADE\n\n` +
    `Worker output:\n${accumulatedOutput}`;

  socket.emit("agent:impact_checking", {
    downstreamRepoNames: filteredDownstream,
    checking: true,
  });

  orchestrator.status = "busy";
  orchestrator.lastPromptOutput = [];
  socket.emit("agent:update", {
    agentId: orchestratorId,
    type: "status",
    content: "busy",
  });

  try {
    const { promise: cascadePromise, heartbeat: cascadeHeartbeat } =
      withActivityTimeout(
        orchestrator.connection.prompt({
          sessionId: orchestrator.sessionId,
          prompt: [{ type: "text", text: cascadePrompt }],
        }),
        PROMPT_INACTIVITY_TIMEOUT_MS,
        "Cascade check stalled",
      );
    orchestrator.heartbeat = cascadeHeartbeat;

    await cascadePromise;

    const routingText = (orchestrator.lastPromptOutput || []).join("").trim();
    const parsedRoutes = parseRoutingPlan(routingText);

    orchestrator.status = "ready";
    socket.emit("agent:update", {
      agentId: orchestratorId,
      type: "status",
      content: "ready",
    });
    socket.emit("agent:impact_checking", {
      downstreamRepoNames: filteredDownstream,
      checking: false,
    });

    if (!parsedRoutes) {
      return false;
    }

    const routingRunId = options?.cascadeRunId || randomUUID();
    const routingRun = cascadeRuns.get(routingRunId) || {
      runId: routingRunId,
      visitedRepoNames: new Set([agent.repoName.toLowerCase()]),
    };
    routingRun.visitedRepoNames.add(agent.repoName.toLowerCase());
    cascadeRuns.set(routingRunId, routingRun);

    const routes = parsedRoutes.filter(
      (route) => !routingRun.visitedRepoNames.has(route.repoName.toLowerCase()),
    );

    if (routes.length === 0) {
      return false;
    }

    const planId = randomUUID();
    const routingPlan = {
      planId,
      cascadeRunId: routingRunId,
      sourceAgentId: agentId,
      sourceRepoName: agent.repoName,
      originalPromptText,
      routes,
    };
    pendingRoutingPlans.set(planId, routingPlan);
    socket.emit("orchestrator:routing_plan", routingPlan);
    return true;
  } catch (err) {
    console.error(
      `[cascade] Orchestrator cascade check failed: ${err.message}`,
    );
    orchestrator.status = "error";
    socket.emit("agent:update", {
      agentId: orchestratorId,
      type: "status",
      content: "error",
    });
    socket.emit("agent:error", {
      agentId: orchestratorId,
      error: `Cascade check failed: ${err.message}`,
    });
    socket.emit("agent:impact_checking", {
      downstreamRepoNames: filteredDownstream,
      checking: false,
    });
    return false;
  } finally {
    orchestrator.heartbeat = null;
    orchestrator.lastPromptOutput = undefined;
  }
}

/**
 * Build the client-facing snapshot for an agent, including manifest hydration
 * fields and graph-derived unloaded dependency state.
 *
 * @param {string} agentId
 * @param {{ unloadedDeps?: Array<{ agentId: string, missing: Array<{ repoName: string, direction: string }> }> } | null} [graph]
 * @param {string|null} [statusOverride]
 * @returns {object|null}
 */
function buildAgentSnapshot(agentId, graph = null, statusOverride = null) {
  const agent = agents.get(agentId);
  if (!agent) return null;

  const unloadedDeps =
    graph?.unloadedDeps?.find((entry) => entry.agentId === agentId)?.missing ??
    [];

  return {
    agentId,
    repoUrl: agent.repoUrl,
    repoName: agent.repoName,
    repoPath: agent.repoPath,
    model: agent.model ?? null,
    role: agent.role,
    status: statusOverride ?? agent.status,
    manifest: agent.manifest,
    manifestMissing: agent.manifestMissing,
    unloadedDeps,
  };
}

/**
 * Refresh a single agent's manifest state from the repo on disk.
 *
 * @param {string} agentId
 * @returns {{ ok: boolean, exists: boolean }}
 */
function refreshAgentManifestFromDisk(agentId) {
  const agent = agents.get(agentId);
  if (!agent?.repoPath) {
    return { ok: false, exists: false };
  }

  const manifestPath = join(agent.repoPath, "acp-manifest.json");
  if (!existsSync(manifestPath)) {
    agent.manifest = null;
    agent.manifestMissing = true;
    return { ok: true, exists: false };
  }

  try {
    const manifestText = readFileSync(manifestPath, "utf-8");
    agent.manifest = JSON.parse(manifestText);
    agent.manifestMissing = false;
    return { ok: true, exists: true };
  } catch (err) {
    agent.manifest = null;
    agent.manifestMissing = true;
    console.warn(
      `[manifest:refresh] Failed to parse acp-manifest.json for ${agent.repoName}: ${err.message}`,
    );
    return { ok: false, exists: true };
  }
}

/**
 * Refresh all known agents from disk and return the refreshed graph.
 *
 * @returns {ReturnType<typeof buildDependencyGraph>}
 */
function refreshAllAgentManifestsFromDisk() {
  for (const agentId of agents.keys()) {
    refreshAgentManifestFromDisk(agentId);
  }
  return buildDependencyGraph(agents);
}

/**
 * Emit refreshed dependency graph state to the client.
 *
 * @param {object} socket
 * @param {ReturnType<typeof buildDependencyGraph>} graph
 */
function emitDependencyGraphState(socket, graph) {
  socket.emit("graph:updated", graph);
  for (const [agentId, agent] of agents.entries()) {
    if (agent.manifestMissing) {
      socket.emit("graph:manifest_missing", { agentId });
    }
  }
  for (const unloaded of graph.unloadedDeps) {
    socket.emit("graph:unloaded_deps", {
      agentId: unloaded.agentId,
      repoName: unloaded.repoName,
      unloaded: unloaded.missing,
    });
  }
  if (graph.warnings.length > 0) {
    socket.emit("graph:inconsistency", { warnings: graph.warnings });
  }
}

/**
 * Emit agent snapshots for every known agent using a shared graph payload.
 *
 * @param {object} socket
 * @param {ReturnType<typeof buildDependencyGraph>} graph
 * @param {string} eventName
 * @param {string|null} [statusOverride]
 */
function emitAgentSnapshots(
  socket,
  graph,
  eventName = "agent:snapshot",
  statusOverride = null,
) {
  for (const agentId of agents.keys()) {
    socket.emit(eventName, buildAgentSnapshot(agentId, graph, statusOverride));
  }
}

/**
 * Clone a repository to a directory.
 * @param {string} repoUrl      HTTPS git URL to clone
 * @param {string} [baseDir]    Override the base directory (falls back to REPO_BASE_DIR)
 * @param {boolean} [reuseExisting]  When true, use the repo name as the folder (no UUID suffix)
 *                              and skip cloning if the folder already exists.
 * @returns {Promise<{repoPath: string, reused: boolean}>}
 */
function cloneRepo(repoUrl, baseDir, reuseExisting = false) {
  return new Promise((resolve, reject) => {
    // Per-request override takes precedence over the env/default base dir
    const effectiveBase =
      baseDir && baseDir.trim() ? baseDir.trim() : REPO_BASE_DIR;
    mkdirSync(effectiveBase, { recursive: true });

    const repoName = repoNameFromUrl(repoUrl);

    // When reusing, use a stable folder name (repo name only, no UUID suffix)
    // so repeated launches hit the same directory.
    const folderName = reuseExisting
      ? repoName
      : `${repoName}-${randomUUID().slice(0, 8)}`;
    const repoPath = join(effectiveBase, folderName);

    // If the folder already exists and reuse is enabled, skip cloning entirely
    if (reuseExisting && existsSync(repoPath)) {
      console.log(`[clone] Reusing existing folder: ${repoPath}`);
      return resolve({ repoPath, reused: true });
    }

    console.log(`[clone] Cloning ${repoUrl} → ${repoPath}`);

    const git = spawn("git", ["clone", "--depth", "1", repoUrl, repoPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    git.stderr.on("data", (chunk) => {
      const line = chunk.toString().trim();
      stderr += line;
      // Forward clone progress so it's visible in server logs
      if (line) console.log(`[clone] ${repoName}: ${line}`);
    });

    git.on("close", (code) => {
      if (code === 0) {
        console.log(`[clone] Done: ${repoPath}`);
        resolve({ repoPath, reused: false });
      } else {
        reject(new Error(`git clone failed (exit ${code}): ${stderr.trim()}`));
      }
    });

    git.on("error", (err) => reject(err));
  });
}

// ---------------------------------------------------------------------------
// Work-item detection — scans agent text for issue / PR URLs
// ---------------------------------------------------------------------------

/**
 * Scan text from an agent for GitHub issue/PR URLs and register any new
 * ones found. Emits `workitems:updated` to the socket when the registry
 * changes.
 *
 * @param {object} socket  Socket.IO socket to notify
 * @param {string} agentId Agent that produced the text
 * @param {string} text    Raw text chunk from the agent
 */
function detectWorkItems(socket, agentId, text) {
  const agent = agents.get(agentId);
  if (!agent) return;

  const found = extractWorkItems(text);
  let changed = false;

  for (const item of found) {
    if (!workItems.has(item.url)) {
      workItems.set(item.url, {
        ...item,
        detectedAt: new Date().toISOString(),
        agentId,
        agentRepoName: agent.repoName,
      });
      changed = true;
    }
  }

  if (changed) {
    socket.emit("workitems:updated", {
      items: [...workItems.values()],
    });
  }
}

/**
 * Prompt a single agent using the standard prompt flow, including prompt
 * enrichment, streaming timeout handling, and cascade analysis.
 *
 * @param {object} socket
 * @param {string} agentId
 * @param {string} text
 * @param {{ cascadeRunId?: string, forceCascade?: boolean } | null} [options]
 * @returns {Promise<boolean>}
 */
async function promptAgent(socket, agentId, text, options = null) {
  if (!agentId || typeof text !== "string" || text.length === 0) {
    socket.emit("agent:error", {
      agentId,
      error: "agentId and non-empty text are required",
    });
    return false;
  }

  const agent = agents.get(agentId);
  if (!agent) {
    socket.emit("agent:error", { agentId, error: "Agent not found" });
    return false;
  }

  console.log(
    `[socket] agent:prompt → ${agentId.slice(0, 8)} (${agent.repoName}): ${text.slice(0, 80)}`,
  );
  agent.status = "busy";
  socket.emit("agent:update", { agentId, type: "status", content: "busy" });

  const originalPromptText = text;
  const missionPrefix = buildMissionPrefix(globalMissionContext);
  const crossRepoContext = buildCrossRepoContext(agents, agentId);
  const enrichedText = enrichPromptText(text, missionPrefix, crossRepoContext);
  agent.lastPromptOutput = [];
  agent.eventLog?.push({
    timestamp: new Date().toISOString(),
    type: "prompt_start",
    content: { text: originalPromptText },
  });

  // Inform the client about the context that was injected into this prompt
  if (missionPrefix || crossRepoContext) {
    const injectedParts = [missionPrefix, crossRepoContext]
      .filter(Boolean)
      .join("\n\n");
    socket.emit("agent:context_injected", {
      agentId,
      injectedContext: injectedParts,
    });
  }

  const startTime = Date.now();
  try {
    const { promise: promptPromise, heartbeat } = withActivityTimeout(
      agent.connection.prompt({
        sessionId: agent.sessionId,
        prompt: [{ type: "text", text: enrichedText }],
      }),
      PROMPT_INACTIVITY_TIMEOUT_MS,
      `Prompt stalled — no activity for ${PROMPT_INACTIVITY_TIMEOUT_MS / 1000}s`,
    );
    agent.heartbeat = heartbeat;
    const result = await promptPromise;

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[agent:prompt] ${agentId.slice(0, 8)} completed in ${duration}s (${result.stopReason})`,
    );

    agent.status = "ready";
    socket.emit("agent:prompt_complete", {
      agentId,
      stopReason: result.stopReason,
    });
    agent.eventLog?.push({
      timestamp: new Date().toISOString(),
      type: "prompt_complete",
      content: { stopReason: result.stopReason },
    });

    const accumulatedOutput = (agent.lastPromptOutput || []).join("");
    void runCascadeAnalysis(
      socket,
      agentId,
      originalPromptText,
      accumulatedOutput,
      options,
    );

    return true;
  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(
      `[agent:prompt] ${agentId.slice(0, 8)} failed after ${duration}s: ${err.message}`,
    );
    agent.status = "error";
    socket.emit("agent:error", {
      agentId,
      error: `Prompt failed: ${err.message}`,
    });
    agent.eventLog?.push({
      timestamp: new Date().toISOString(),
      type: "prompt_error",
      content: { error: err.message },
    });
    return false;
  } finally {
    agent.heartbeat = null;
    agent.lastPromptOutput = undefined;
  }
}

// ---------------------------------------------------------------------------
// ACP client callback factories — defined at module level so they can be
// tested and reasoned about independently of the createAgent closure.
// ---------------------------------------------------------------------------

/**
 * Creates the requestPermission callback for an ACP agent connection.
 * @param {import('socket.io').Socket} socket
 * @param {string} agentId
 * @param {{ agents: Map }} deps
 * @returns {Function} requestPermission callback
 */
function createRequestPermissionHandler(socket, agentId, { agents }) {
  return async function requestPermission(params) {
    console.log(
      `[agent:${agentId.slice(0, 8)}] Permission requested: ${params.toolCall?.title}`,
    );

    const options = params.options.map((o) => ({
      optionId: o.optionId,
      name: o.name,
      kind: o.kind,
    }));

    socket.emit("agent:permission_request", {
      agentId,
      repoName: agents.get(agentId)?.repoName,
      title: params.toolCall?.title ?? "Permission requested",
      options,
    });

    // Wait until the frontend responds via `agent:permission_response`
    return new Promise((resolve) => {
      const agent = agents.get(agentId);
      if (agent) {
        agent.permissionResolver = resolve;
        agent.pendingPermissionOptions = options;
      }
    });
  };
}

/**
 * Creates the sessionUpdate callback for an ACP agent connection.
 * @param {import('socket.io').Socket} socket
 * @param {string} agentId
 * @param {{ agents: Map, getActiveBroadcastWave: () => object|null, setActiveBroadcastWave: (w: object|null) => void }} deps
 * @returns {Function} sessionUpdate callback
 */
function createSessionUpdateHandler(
  socket,
  agentId,
  { agents, getActiveBroadcastWave, setActiveBroadcastWave },
) {
  return async function sessionUpdate(params) {
    // Reset the inactivity timeout whenever the agent sends any update.
    // This is the core of the keepalive mechanism — as long as the agent
    // keeps streaming (text, tool calls, thoughts, plans) the deadline stays
    // pushed forward and the prompt will never be timed out mid-work.
    const currentAgent = agents.get(agentId);
    currentAgent?.heartbeat?.();

    const update = params.update;
    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        if (update.content.type === "text") {
          socket.emit("agent:update", {
            agentId,
            type: "text",
            content: update.content.text,
          });

          // Scan for issue/PR URLs in real-time as text streams in
          detectWorkItems(socket, agentId, update.content.text);

          // Accumulate text during manifest capture (startup verification)
          if (currentAgent?.capturingManifest) {
            currentAgent.manifestText.push(update.content.text);
          }
          // Accumulate text for cascade analysis after prompt completes
          if (currentAgent?.lastPromptOutput !== undefined) {
            currentAgent.lastPromptOutput.push(update.content.text);
          }

          // If this agent is part of an active broadcast wave, accumulate
          // its text so we can coalesce results when the wave completes
          const activeBroadcastWave = getActiveBroadcastWave();
          if (activeBroadcastWave?.participants.has(agentId)) {
            activeBroadcastWave.participants
              .get(agentId)
              .textChunks.push(update.content.text);
          }

          // Append to the persistent structured event log for this agent
          currentAgent?.eventLog?.push(buildEventLogEntry(update));
        }
        break;

      case "tool_call":
        socket.emit("agent:update", {
          agentId,
          type: "tool_call",
          content: {
            toolCallId: update.toolCallId,
            title: update.title,
            status: update.status,
          },
        });
        currentAgent?.eventLog?.push(buildEventLogEntry(update));
        break;

      case "tool_call_update":
        socket.emit("agent:update", {
          agentId,
          type: "tool_call_update",
          content: { toolCallId: update.toolCallId, status: update.status },
        });
        currentAgent?.eventLog?.push(buildEventLogEntry(update));
        break;

      case "plan":
        socket.emit("agent:update", {
          agentId,
          type: "plan",
          content: update,
        });
        currentAgent?.eventLog?.push(buildEventLogEntry(update));
        break;

      case "agent_thought_chunk":
        socket.emit("agent:update", {
          agentId,
          type: "thought",
          content: update,
        });
        currentAgent?.eventLog?.push(buildEventLogEntry(update));
        break;

      default:
        break;
    }
  };
}

// ---------------------------------------------------------------------------
// Core: spawn copilot, create ACP session, wire events to socket
// ---------------------------------------------------------------------------

/**
 * Fires background prompts to existing agents to update their `dependedBy`
 * array when a newly-loaded agent declares them in its `dependsOn`.
 * Fire-and-forget — failures are logged but do not block agent creation.
 *
 * @param {object} socket
 * @param {string} newAgentRepoName - repoName of the newly-loaded agent
 * @param {object} manifest - parsed manifest for the new agent
 * @param {Map} agentsMap
 */
function crossPopulateDependedBy(
  socket,
  newAgentRepoName,
  manifest,
  agentsMap,
) {
  for (const depRepoName of manifest.dependsOn || []) {
    const depEntry = [...agentsMap.entries()].find(
      ([, a]) => a.repoName === depRepoName,
    );
    if (!depEntry) continue;

    const [depAgentId, depAgent] = depEntry;
    if (
      !depAgent.connection ||
      !depAgent.sessionId ||
      depAgent.status === "busy"
    )
      continue;

    console.log(
      `[manifest:cross-pop] Prompting ${depRepoName} to add ${newAgentRepoName} to its dependedBy`,
    );
    depAgent.connection
      .prompt({
        sessionId: depAgent.sessionId,
        prompt: [
          {
            type: "text",
            text: `In \`acp-manifest.json\` at the repo root, add "${newAgentRepoName}" to the \`dependedBy\` array if it is not already present. Keep all other fields unchanged. Do not explain, just make the edit.`,
          },
        ],
      })
      .then(() => {
        refreshAgentManifestFromDisk(depAgentId);
        const refreshedGraph = buildDependencyGraph(agents);
        socket.emit(
          "agent:snapshot",
          buildAgentSnapshot(depAgentId, refreshedGraph),
        );
        emitDependencyGraphState(socket, refreshedGraph);
      })
      .catch((err) => {
        console.warn(
          `[manifest:cross-pop] Failed to prompt ${depRepoName}: ${err.message}`,
        );
      });
  }
}

/**
 * Spawns the Copilot CLI process and wires up the ACP connection.
 * Returns synchronously — callers must register the agent in `agents` before
 * calling `connection.initialize()` so permission callbacks can resolve.
 *
 * @param {{ agentId: string, model: string|null, socket: object }} params
 * @returns {{ process: import('node:child_process').ChildProcess, connection: object, earlyExitPromise: Promise<never> }}
 * @throws {Error} if the process cannot be spawned
 */
function spawnAndConnect({ agentId, model, socket }) {
  // Use runtime test override if set, otherwise fall back to env/default
  const effectiveCli = testCliOverride.path ?? COPILOT_CLI_PATH;
  const extraArgs =
    testCliOverride.args.length > 0
      ? testCliOverride.args
      : COPILOT_CLI_EXTRA_ARGS;

  const copilotArgs = [...extraArgs, "--acp", "--stdio"];
  if (typeof model === "string" && model.trim()) {
    copilotArgs.push("--model", model.trim());
  }

  // shell: true lets Windows resolve .cmd/.ps1 wrappers (e.g. copilot.cmd)
  const copilotProcess = spawn(effectiveCli, copilotArgs, {
    stdio: ["pipe", "pipe", "inherit"],
    shell: true,
  });

  // Detect early crashes (e.g. binary not found, process exits before init)
  const earlyExitPromise = new Promise((_, reject) => {
    copilotProcess.on("error", (err) =>
      reject(new Error(`Copilot process error: ${err.message}`)),
    );
    copilotProcess.on("close", (code) => {
      if (
        code !== 0 &&
        agents.has(agentId) &&
        agents.get(agentId).status !== "stopped"
      ) {
        reject(new Error(`Copilot process exited unexpectedly (code ${code})`));
      }
    });
  });

  // Build the ACP stream & connection
  const output = Writable.toWeb(copilotProcess.stdin);
  const input = Readable.toWeb(copilotProcess.stdout);
  const stream = acp.ndJsonStream(output, input);

  /** Wire up ACP client callbacks via module-level factories. */
  const onSessionUpdate = createSessionUpdateHandler(socket, agentId, {
    agents,
    getActiveBroadcastWave: () => activeBroadcastWave,
    setActiveBroadcastWave: (w) => {
      activeBroadcastWave = w;
    },
  });
  const client = {
    requestPermission: createRequestPermissionHandler(socket, agentId, {
      agents,
    }),
    sessionUpdate: onSessionUpdate,
  };

  const connection = new acp.ClientSideConnection((_agent) => client, stream);
  return { process: copilotProcess, connection, earlyExitPromise };
}

/**
 * @param {object} socket  Socket.IO socket
 * @param {string} repoUrl HTTPS Git URL
 * @param {"orchestrator"|"worker"} role  Agent role — only one orchestrator allowed
 * @param {string} [repoBaseDir]  Client-supplied base directory for cloning (overrides REPO_BASE_DIR)
 * @param {boolean} [reuseExisting]  Reuse existing cloned folder instead of creating a fresh one
 */
async function createAgent(
  socket,
  repoUrl,
  role = "worker",
  repoBaseDir,
  reuseExisting = false,
  model = null,
  existingId = null,
) {
  // Enforce single-orchestrator rule
  if (role === "orchestrator") {
    const existing = [...agents.values()].find(
      (a) =>
        a.role === "orchestrator" &&
        a.agentId !== existingId &&
        a.status !== "stopped",
    );
    if (existing) {
      socket.emit("agent:error", {
        agentId: null,
        error:
          "An orchestrator agent is already running. Stop it before creating a new one.",
      });
      return;
    }
  }

  const agentId = existingId || randomUUID();
  const repoName = repoNameFromUrl(repoUrl);

  // Immediately tell the frontend a spawn is in progress so it can show a wait state
  socket.emit("agent:spawning", {
    agentId,
    repoUrl,
    repoName,
    model,
    role,
    step: "cloning",
    message: reuseExisting
      ? "Checking for existing clone…"
      : "Cloning repository…",
  });

  let repoPath;
  let repoReused = false;
  try {
    ({ repoPath, reused: repoReused } = await cloneRepo(
      repoUrl,
      repoBaseDir,
      reuseExisting,
    ));
  } catch (err) {
    console.error(`[agent:create] Clone failed: ${err.message}`);
    socket.emit("agent:error", {
      agentId,
      error: `Failed to clone repository: ${err.message}`,
    });
    return;
  }

  socket.emit("agent:spawning", {
    agentId,
    repoUrl,
    repoName,
    model,
    role,
    step: "starting",
    message: "Starting Copilot CLI…",
  });

  let copilotProcess, connection, earlyExitPromise;
  try {
    ({
      process: copilotProcess,
      connection,
      earlyExitPromise,
    } = spawnAndConnect({ agentId, model, socket }));
  } catch (err) {
    console.error(`[agent:create] Spawn failed: ${err.message}`);
    socket.emit("agent:error", {
      agentId,
      error: `Failed to start copilot CLI. Is "${COPILOT_CLI_PATH}" installed and on the PATH?`,
    });
    return;
  }

  // Register agent early so permission resolver is accessible
  agents.set(agentId, {
    process: copilotProcess,
    connection,
    sessionId: null,
    repoUrl,
    repoName,
    repoPath,
    // Track whether we reused an existing folder so cleanup skips deletion
    repoReused,
    model: model?.trim() || null,
    role,
    status: "initializing",
    permissionResolver: null,
    socketId: socket.id,
    pendingPermissionOptions: null,
    // Heartbeat function set while a prompt is in-flight; called from
    // sessionUpdate to reset the inactivity timeout on each streaming update.
    heartbeat: null,
    // Ordered log of all ACP sessionUpdate events for this agent — { timestamp, type, content }.
    // Grows throughout the session; persisted in session snapshots.
    eventLog: [],
    manifest: null, // parsed acp-manifest.json, or null
    manifestMissing: false, // true when agent confirmed the file doesn't exist
  });

  try {
    // Race initialization against early process exit
    const initResult = await Promise.race([
      connection.initialize({
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {},
      }),
      earlyExitPromise,
    ]);

    console.log(
      `[agent:${agentId.slice(0, 8)}] Connected (protocol v${initResult.protocolVersion})`,
    );

    const sessionResult = await connection.newSession({
      cwd: repoPath,
      mcpServers: [],
    });

    const agent = agents.get(agentId);
    agent.sessionId = sessionResult.sessionId;
    agent.status = "verifying";

    console.log(
      `[agent:${agentId.slice(0, 8)}] Session ${sessionResult.sessionId} ready — running verification prompt`,
    );

    // Tell the frontend the session is live but we're verifying the agent works
    socket.emit("agent:spawning", {
      agentId,
      repoUrl,
      repoName,
      model,
      role,
      step: "verifying",
      message: "Verifying agent is responsive…",
    });

    // Send a startup prompt to check for acp-manifest.json and gather repo context
    const manifestText = [];
    agent.capturingManifest = true;
    agent.manifestText = manifestText;

    try {
      const verifyResult = await connection.prompt({
        sessionId: sessionResult.sessionId,
        prompt: [
          {
            type: "text",
            text: `Check if the file \`acp-manifest.json\` exists at the root of this repository.
- If it exists, read it and return ONLY the raw JSON content (no markdown fences, no explanation).
- If it does not exist, respond with a single line: NO_MANIFEST: then a one-sentence description of this repo's apparent role and primary tech stack.`,
          },
        ],
      });

      agent.status = "ready";
      agent.capturingManifest = false;

      // Accumulate any text chunks we received during verification
      const responseText = manifestText.join("").trim();

      if (responseText && !responseText.startsWith("NO_MANIFEST:")) {
        // Try to parse as JSON manifest
        try {
          const parsed = JSON.parse(responseText);
          agent.manifest = parsed;
          console.log(
            `[agent:${agentId.slice(0, 8)}] Manifest loaded for ${agent.repoName}`,
          );

          // Cross-populate dependedBy on other agents whose repos are in this agent's dependsOn
          crossPopulateDependedBy(socket, agent.repoName, parsed, agents);
        } catch {
          agent.manifestMissing = true;
          console.log(
            `[agent:${agentId.slice(0, 8)}] Manifest parse failed for ${agent.repoName} — marking missing`,
          );
        }
      } else if (responseText.startsWith("NO_MANIFEST:")) {
        agent.manifestMissing = true;
        console.log(
          `[agent:${agentId.slice(0, 8)}] No manifest for ${agent.repoName}: ${responseText}`,
        );
      }

      refreshAgentManifestFromDisk(agentId);

      console.log(
        `[agent:${agentId.slice(0, 8)}] Verification complete (${verifyResult.stopReason})`,
      );
    } catch (verifyErr) {
      agent.capturingManifest = false;
      // Verification failed but the session is still usable — mark ready anyway
      console.warn(
        `[agent:${agentId.slice(0, 8)}] Verification prompt failed: ${verifyErr.message}`,
      );
      agent.status = "ready";
    }

    const graph = buildDependencyGraph(agents);
    socket.emit("agent:created", buildAgentSnapshot(agentId, graph, "ready"));
    emitDependencyGraphState(socket, graph);

    // Auto-save on successful creation
    saveCurrentSession();

    // Persistent crash watcher — active from this point forward.
    // The earlyExitPromise above only races during init; once the agent is
    // ready we need a separate listener so an unexpected process death
    // doesn't leave a zombie "busy" card with no recovery path.
    copilotProcess.once("close", (code) => {
      const current = agents.get(agentId);
      // Ignore if the agent was intentionally stopped or already cleaned up
      if (!current || current.status === "stopped") return;

      const msg = `Copilot process exited unexpectedly (code ${code ?? "null"})`;
      console.error(`[agent:${agentId.slice(0, 8)}] ${msg}`);
      current.status = "error";
      current.eventLog?.push({
        timestamp: new Date().toISOString(),
        type: "crash",
        content: { code },
      });
      socket.emit("agent:error", { agentId, error: msg });
      agents.delete(agentId);
      socket.emit("agent:stopped", { agentId });
    });
  } catch (err) {
    console.error(`[agent:create] ACP init failed: ${err.message}`);
    copilotProcess.kill();
    agents.delete(agentId);
    socket.emit("agent:error", {
      agentId,
      error: `ACP initialization failed: ${err.message}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Orchestrator synthesis dispatch
// ---------------------------------------------------------------------------

/**
 * Re-creates agent processes from a session snapshot.
 * Used by `session:load` in "respawn" mode.
 *
 * @param {object} socket
 * @param {Array<{ id: string, repoUrl: string, role: string, repoReused?: boolean, model?: string }>} restoredAgents
 */
async function respawnAgentsFromSnapshot(socket, restoredAgents) {
  for (const a of restoredAgents) {
    try {
      await createAgent(
        socket,
        a.repoUrl,
        a.role,
        currentRepoBaseDir,
        a.repoReused || currentReuseExisting,
        a.model ?? null,
        a.id,
      );
    } catch (err) {
      socket.emit("agent:error", {
        agentId: a.id,
        error: `Respawn failed: ${err.message}`,
      });
    }
  }
}

/**
 * Dispatch a synthesis prompt to the orchestrator agent and return a Promise
 * that resolves when the orchestrator finishes (or rejects on error/timeout).
 * Manages orchestrator status transitions and socket event emission.
 *
 * @param {object} socket
 * @param {string} orchestratorId
 * @param {object} orchestrator - agent entry from the agents Map
 * @param {string} synthesisPrompt
 * @returns {Promise<void>}
 */
function forwardToOrchestrator(
  socket,
  orchestratorId,
  orchestrator,
  synthesisPrompt,
) {
  console.log(
    `[orchestrator] Forwarding to ${orchestratorId?.slice(0, 8)} (${orchestrator.repoName})`,
  );

  orchestrator.status = "busy";
  socket.emit("agent:update", {
    agentId: orchestratorId,
    type: "status",
    content: "busy",
  });

  const startTime = Date.now();
  const { promise: synthPromise, heartbeat: synthHeartbeat } =
    withActivityTimeout(
      orchestrator.connection.prompt({
        sessionId: orchestrator.sessionId,
        prompt: [{ type: "text", text: synthesisPrompt }],
      }),
      PROMPT_INACTIVITY_TIMEOUT_MS,
      `Orchestrator synthesis stalled — no activity for ${PROMPT_INACTIVITY_TIMEOUT_MS / 1000}s`,
    );
  orchestrator.heartbeat = synthHeartbeat;

  return synthPromise
    .then((result) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[orchestrator] ${orchestratorId?.slice(0, 8)} synthesis completed in ${duration}s (${result.stopReason})`,
      );
      orchestrator.status = "ready";
      socket.emit("agent:update", {
        agentId: orchestratorId,
        type: "status",
        content: "ready",
      });
      socket.emit("agent:prompt_complete", {
        agentId: orchestratorId,
        stopReason: result.stopReason,
      });
    })
    .catch((err) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(
        `[orchestrator] ${orchestratorId?.slice(0, 8)} synthesis failed after ${duration}s: ${err.message}`,
      );
      orchestrator.status = "error";
      socket.emit("agent:update", {
        agentId: orchestratorId,
        type: "status",
        content: "error",
      });
      socket.emit("agent:error", {
        agentId: orchestratorId,
        error: `Synthesis failed: ${err.message}`,
      });
    })
    .finally(() => {
      orchestrator.heartbeat = null;
    });
}

// ---------------------------------------------------------------------------
// Socket.IO connection handler
// ---------------------------------------------------------------------------

io.on("connection", (socket) => {
  console.log(`[socket] Client connected: ${socket.id}`);
  // Send the current session brief to reconnecting clients
  socket.emit("mission:updated", { text: globalMissionContext });
  // Advertise env-configured default repos so the client can auto-launch them
  socket.emit("config:defaults", {
    orchestratorUrl: DEFAULT_ORCHESTRATOR_URL || null,
    workerUrls: DEFAULT_WORKER_URLS,
    model: DEFAULT_MODEL,
  });
  // Re-sync current agent states so reconnecting clients don't lose the UI
  if (agents.size > 0) {
    const graph = buildDependencyGraph(agents);
    for (const [agentId] of agents) {
      socket.emit("agent:snapshot", buildAgentSnapshot(agentId, graph));
    }
  }

  // -- Create a new agent for a repo --
  socket.on(
    "agent:create",
    async ({ repoUrl, role, repoBaseDir, reuseExisting, model }) => {
      if (!repoUrl || typeof repoUrl !== "string") {
        socket.emit("agent:error", {
          agentId: null,
          error: "repoUrl is required",
        });
        return;
      }
      if (!isValidGitUrl(repoUrl)) {
        socket.emit("agent:error", {
          agentId: null,
          error: "Invalid repository URL. Only HTTPS Git URLs are supported.",
        });
        return;
      }
      console.log(
        `[socket] agent:create \u2192 ${repoUrl} (role: ${role || "worker"}) base: ${repoBaseDir || REPO_BASE_DIR} reuse: ${!!reuseExisting}`,
      );
      // Track the base dir so session:load respawn can reuse it
      if (repoBaseDir) currentRepoBaseDir = repoBaseDir;
      currentReuseExisting = !!reuseExisting;
      await createAgent(
        socket,
        repoUrl,
        role || "worker",
        repoBaseDir,
        reuseExisting,
        model,
      );
    },
  );

  // -- Send a prompt to an existing agent --
  socket.on("agent:prompt", async ({ agentId, text }) => {
    await promptAgent(socket, agentId, text);
  });

  // -- Resolve a pending permission request --
  socket.on("agent:permission_response", ({ agentId, optionId }) => {
    const agent = agents.get(agentId);
    if (!agent?.permissionResolver) {
      socket.emit("agent:error", {
        agentId,
        error: "No pending permission request",
      });
      return;
    }

    console.log(
      `[socket] agent:permission_response → ${agentId.slice(0, 8)} (${agent.repoName}): ${optionId}`,
    );

    agent.permissionResolver({
      outcome: { outcome: "selected", optionId },
    });
    agent.permissionResolver = null;
  });

  socket.on("orchestrator:approve_routing_plan", async ({ planId, routes }) => {
    const plan = pendingRoutingPlans.get(planId);
    if (!plan) {
      socket.emit("agent:error", {
        agentId: null,
        error: "Routing plan not found",
      });
      return;
    }

    pendingRoutingPlans.delete(planId);
    const approvedRoutes =
      Array.isArray(routes) && routes.length > 0 ? routes : plan.routes;
    const cascadeRun = plan.cascadeRunId
      ? cascadeRuns.get(plan.cascadeRunId) || {
          runId: plan.cascadeRunId,
          visitedRepoNames: new Set([plan.sourceRepoName.toLowerCase()]),
        }
      : null;

    if (cascadeRun) {
      cascadeRun.visitedRepoNames.add(plan.sourceRepoName.toLowerCase());
      cascadeRuns.set(plan.cascadeRunId, cascadeRun);
    }

    for (const route of approvedRoutes) {
      if (cascadeRun?.visitedRepoNames.has(route.repoName.toLowerCase())) {
        continue;
      }

      const targetEntry = [...agents.entries()].find(
        ([, agent]) =>
          agent.role === "worker" &&
          agent.repoName.toLowerCase() === route.repoName.toLowerCase(),
      );

      if (!targetEntry) {
        socket.emit("agent:error", {
          agentId: null,
          error: `Routing target not found: ${route.repoName}`,
        });
        continue;
      }

      const [targetAgentId] = targetEntry;
      cascadeRun?.visitedRepoNames.add(route.repoName.toLowerCase());
      await promptAgent(socket, targetAgentId, route.promptText, {
        cascadeRunId: plan.cascadeRunId,
        forceCascade: true,
      });
    }
  });

  socket.on("orchestrator:cancel_routing_plan", ({ planId }) => {
    const plan = pendingRoutingPlans.get(planId);
    pendingRoutingPlans.delete(planId);
    if (plan?.cascadeRunId) {
      cascadeRuns.delete(plan.cascadeRunId);
    }
  });

  // -- Stop an agent --
  socket.on("agent:stop", ({ agentId }) => {
    console.log(`[socket] agent:stop → ${agentId.slice(0, 8)}`);
    stopAgent(agentId, null, { saveSession: true });
    socket.emit("agent:stopped", { agentId });
  });

  // -- Broadcast a prompt to all ready agents in parallel --
  // Extracted as a named function so the retry handler can call it directly.
  const handlePromptAll = async ({
    text,
    synthesisInstructions,
    targetRepoNames,
  }) => {
    if (typeof text !== "string" || text.length === 0) {
      socket.emit("agent:error", {
        agentId: null,
        error: "Non-empty text is required for broadcast",
      });
      return;
    }

    // Guard against concurrent broadcasts — only one wave active at a time.
    // A second broadcast while one is in flight would silently corrupt wave
    // state and lose results from the first wave.
    if (activeBroadcastWave) {
      socket.emit("agent:error", {
        agentId: null,
        error:
          "A broadcast is already in progress — please wait for it to complete",
      });
      return;
    }

    // Collect worker agents that are in a promptable state
    // (the orchestrator is excluded — it receives synthesized results separately)
    let readyAgents = [...agents.entries()].filter(
      ([, a]) => a.role === "worker" && a.status === "ready" && a.sessionId,
    );

    // If the user @mentioned specific repos, filter down to only those workers.
    // Case-insensitive match against repoName so the @ token doesn't have to be exact.
    if (Array.isArray(targetRepoNames) && targetRepoNames.length > 0) {
      const targetSet = new Set(targetRepoNames.map((n) => n.toLowerCase()));
      readyAgents = readyAgents.filter(([, a]) =>
        targetSet.has(a.repoName.toLowerCase()),
      );
    }

    if (readyAgents.length === 0) {
      socket.emit("agent:error", {
        agentId: null,
        error: "No agents are ready to receive prompts",
      });
      return;
    }

    console.log(
      `[socket] agent:prompt_all → ${readyAgents.length} agents: ${text.slice(0, 80)}`,
    );

    // Start a new broadcast wave — replaces any previous one
    const participants = new Map();
    for (const [agentId, agent] of readyAgents) {
      participants.set(agentId, {
        repoName: agent.repoName,
        repoUrl: agent.repoUrl,
        textChunks: [],
        status: "pending",
      });
    }
    activeBroadcastWave = {
      promptText: text,
      synthesisInstructions: synthesisInstructions || null,
      startedAt: new Date().toISOString(),
      participants,
      socket,
    };

    // Mark all targeted agents as busy before firing prompts
    for (const [agentId, agent] of readyAgents) {
      agent.status = "busy";
      socket.emit("agent:update", {
        agentId,
        type: "status",
        content: "busy",
      });
    }

    // Fan out prompts — each runs independently so one failure doesn't block others
    let completedCount = 0;
    const totalCount = readyAgents.length;
    const broadcastCascadeCandidates = [];
    const promises = readyAgents.map(async ([agentId, agent]) => {
      const startTime = Date.now();
      agent.lastPromptOutput = [];
      agent.eventLog?.push({
        timestamp: new Date().toISOString(),
        type: "prompt_start",
        content: { text },
      });
      try {
        console.log(
          `[agent:prompt_all] Starting ${agentId.slice(0, 8)} (${agent.repoName})`,
        );

        const missionPrefix = buildMissionPrefix(globalMissionContext);
        const crossRepoCtx = buildCrossRepoContext(agents, agentId);
        const enrichedBroadcastText = enrichPromptText(
          text,
          missionPrefix,
          crossRepoCtx,
        );
        // Inform client about injected context for broadcast prompts too
        if (missionPrefix || crossRepoCtx) {
          const injectedParts = [missionPrefix, crossRepoCtx]
            .filter(Boolean)
            .join("\n\n");
          socket.emit("agent:context_injected", {
            agentId,
            injectedContext: injectedParts,
          });
        }
        const { promise: promptPromise, heartbeat } = withActivityTimeout(
          agent.connection.prompt({
            sessionId: agent.sessionId,
            prompt: [{ type: "text", text: enrichedBroadcastText }],
          }),
          PROMPT_INACTIVITY_TIMEOUT_MS,
          `Broadcast prompt stalled — no activity for ${PROMPT_INACTIVITY_TIMEOUT_MS / 1000}s`,
        );
        agent.heartbeat = heartbeat;
        const result = await promptPromise;

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(
          `[agent:prompt_all] ${agentId.slice(0, 8)} completed in ${duration}s (${result.stopReason})`,
        );

        agent.status = "ready";
        if (activeBroadcastWave?.participants.has(agentId)) {
          activeBroadcastWave.participants.get(agentId).status = "completed";
        }
        socket.emit("agent:prompt_complete", {
          agentId,
          stopReason: result.stopReason,
        });
        agent.eventLog?.push({
          timestamp: new Date().toISOString(),
          type: "prompt_complete",
          content: { stopReason: result.stopReason },
        });

        broadcastCascadeCandidates.push({
          agentId,
          accumulatedOutput: (agent.lastPromptOutput || []).join(""),
        });
      } catch (err) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(
          `[agent:prompt_all] ${agentId.slice(0, 8)} (${agent.repoName}) failed after ${duration}s: ${err.message}`,
        );
        agent.status = "error";
        if (activeBroadcastWave?.participants.has(agentId)) {
          activeBroadcastWave.participants.get(agentId).status = "error";
        }
        socket.emit("agent:error", {
          agentId,
          error: `Prompt failed: ${err.message}`,
        });
        agent.eventLog?.push({
          timestamp: new Date().toISOString(),
          type: "prompt_error",
          content: { error: err.message },
        });
      } finally {
        agent.heartbeat = null;
        agent.lastPromptOutput = undefined;
        // Emit progress so the frontend can show "X of Y agents done"
        completedCount += 1;
        socket.emit("agent:broadcast_progress", {
          completed: completedCount,
          total: totalCount,
        });
      }
    });

    await Promise.allSettled(promises);

    // Build coalesced results from the wave data
    if (activeBroadcastWave) {
      const results = [...activeBroadcastWave.participants.entries()].map(
        ([agentId, p]) => ({
          agentId,
          repoName: p.repoName,
          repoUrl: p.repoUrl,
          status: p.status,
          output: p.textChunks.join(""),
        }),
      );

      // Broadcast results to ALL connected sockets so reconnected clients
      // still receive them even if the originating socket dropped mid-broadcast.
      io.emit("agent:broadcast_results", {
        promptText: activeBroadcastWave.promptText,
        timestamp: activeBroadcastWave.startedAt,
        results,
      });

      // Store in broadcast history so users can review past waves
      const historyEntry = {
        promptText: activeBroadcastWave.promptText,
        timestamp: activeBroadcastWave.startedAt,
        results,
      };
      broadcastHistory.push(historyEntry);
      if (broadcastHistory.length > MAX_BROADCAST_HISTORY) {
        broadcastHistory.shift();
      }
      io.emit("broadcast:history", { history: broadcastHistory });

      // Auto-forward coalesced results to the orchestrator agent (if one exists)
      const orchestratorEntry = [...agents.entries()].find(
        ([, a]) =>
          a.role === "orchestrator" && a.sessionId && a.status === "ready",
      );

      let postSynthesisWork = Promise.resolve();

      if (orchestratorEntry) {
        const [orchestratorId, orchestrator] = orchestratorEntry;

        // Build a synthesis prompt containing all worker outputs
        const synthesisPrompt = buildSynthesisPrompt(
          results,
          activeBroadcastWave.promptText,
          synthesisInstructions,
          globalMissionContext,
        );

        console.log(
          `[orchestrator] Auto-forwarding broadcast results to orchestrator ${orchestratorId?.slice(0, 8)} (${orchestrator.repoName})`,
        );

        postSynthesisWork = forwardToOrchestrator(
          socket,
          orchestratorId,
          orchestrator,
          synthesisPrompt,
        );
      }

      void postSynthesisWork.finally(async () => {
        for (const candidate of broadcastCascadeCandidates) {
          await runCascadeAnalysis(
            socket,
            candidate.agentId,
            text,
            candidate.accumulatedOutput,
          );
        }
      });

      // Capture the failed agent IDs so the client can trigger a targeted retry
      const failedAgentIds = [...activeBroadcastWave.participants.entries()]
        .filter(([, p]) => p.status === "error")
        .map(([id]) => id);
      lastCompletedWave = {
        promptText: activeBroadcastWave.promptText,
        synthesisInstructions: activeBroadcastWave.synthesisInstructions,
        failedAgentIds,
      };

      activeBroadcastWave = null;
    }

    // Notify the frontend the entire broadcast round is done
    socket.emit("agent:prompt_all_complete");

    // Auto-save history
    saveCurrentSession();
  };
  socket.on("agent:prompt_all", handlePromptAll);

  // -- Retry failed agents from the last broadcast wave --
  socket.on("agent:prompt_retry_failed", async () => {
    if (!lastCompletedWave || lastCompletedWave.failedAgentIds.length === 0) {
      socket.emit("agent:error", {
        agentId: null,
        error: "No failed agents from the last broadcast to retry",
      });
      return;
    }
    if (activeBroadcastWave) {
      socket.emit("agent:error", {
        agentId: null,
        error:
          "A broadcast is already in progress — please wait for it to complete",
      });
      return;
    }

    // Only retry agents that still exist and are now ready
    const failedSet = new Set(lastCompletedWave.failedAgentIds);
    const retryReadyNames = [...agents.entries()]
      .filter(
        ([agentId, a]) =>
          failedSet.has(agentId) &&
          a.role === "worker" &&
          a.status === "ready" &&
          a.sessionId,
      )
      .map(([, a]) => a.repoName);

    if (retryReadyNames.length === 0) {
      socket.emit("agent:error", {
        agentId: null,
        error: "Failed agents are not ready — restart them first",
      });
      return;
    }

    console.log(
      `[socket] agent:prompt_retry_failed → retrying ${retryReadyNames.length} agent(s)`,
    );

    const retryPromptText = lastCompletedWave.promptText;
    const retrySynthesis = lastCompletedWave.synthesisInstructions;
    // Clear before calling — prevents double-retry on a second click during the new wave
    lastCompletedWave = null;

    await handlePromptAll({
      text: retryPromptText,
      synthesisInstructions: retrySynthesis || undefined,
      targetRepoNames: retryReadyNames,
    });
  });

  // -- Session Management --
  socket.on("session:list", () => {
    socket.emit("session:list", listSessions());
  });

  socket.on("session:save", ({ name }) => {
    if (name) currentSessionName = name;
    saveCurrentSession();
    socket.emit("session:list", listSessions());
  });

  socket.on("session:delete", ({ name }) => {
    const result = deleteSession(name);
    if (result.success) {
      socket.emit("session:list", listSessions());
    } else {
      socket.emit("session:error", { message: result.error });
    }
  });

  socket.on("session:load", async ({ name, mode }) => {
    console.log(
      `[session] Loading session: ${name} (mode: ${mode || "display"})`,
    );

    // Validate the session file BEFORE tearing down the current session.
    // If the file is missing or corrupt we return an error and leave everything
    // in its current state — there is nothing to restore.
    const result = loadSession(name);
    if (!result.success) {
      socket.emit("session:error", { message: result.error });
      return;
    }

    // Stop all running agents
    shutdownAll(socket, { persistSnapshot: true });

    // Clear maps
    agents.clear();
    workItems.clear();
    broadcastHistory.length = 0;

    currentSessionName = name;
    const { data } = result;
    const restoredRepoBaseDir =
      typeof data.settings?.repoBaseDir === "string" &&
      data.settings.repoBaseDir.trim()
        ? data.settings.repoBaseDir
        : currentRepoBaseDir;
    const restoredReuseExisting =
      typeof data.settings?.reuseExisting === "boolean"
        ? data.settings.reuseExisting
        : currentReuseExisting;

    currentRepoBaseDir = restoredRepoBaseDir;
    currentReuseExisting = restoredReuseExisting;

    // Restore WorkItems
    if (Array.isArray(data.workItems)) {
      data.workItems.forEach((item) => workItems.set(item.url, item));
    }

    // Restore BroadcastHistory
    if (Array.isArray(data.broadcastHistory)) {
      broadcastHistory.push(...data.broadcastHistory);
    }

    // Restore Agents as stopped (display state), then optionally respawn.
    // Older buggy autosaves could wipe the saved `agents` array on shutdown,
    // so fall back to unique agent identities found in broadcast history.
    const restoredAgents = getRestorableAgents(data);
    if (restoredAgents.length > 0) {
      if (
        (data.agents?.length ?? 0) === 0 &&
        restoredAgents.some((a) => a.recoveredFromHistory)
      ) {
        console.warn(
          `[session] Recovered ${restoredAgents.length} agents for '${name}' from broadcast history`,
        );
      }

      for (const a of restoredAgents) {
        agents.set(a.id, {
          process: null,
          connection: null,
          sessionId: null,
          repoUrl: a.repoUrl,
          repoName: a.repoName,
          repoPath: a.repoPath,
          repoReused: a.repoReused,
          model: a.model ?? null,
          role: a.role,
          status: "stopped",
          manifest: a.manifest,
          manifestMissing: a.manifestMissing,
        });
      }

      const graph = refreshAllAgentManifestsFromDisk();

      emitAgentSnapshots(socket, graph, "agent:created", "stopped");
      emitDependencyGraphState(socket, graph);

      // Respawn mode: re-create each agent process using the previously-cloned repo
      if (mode === "respawn") {
        await respawnAgentsFromSnapshot(socket, restoredAgents);
      }
    }

    socket.emit("workitems:updated", { items: [...workItems.values()] });
    socket.emit("broadcast:history", { history: broadcastHistory });
    socket.emit("session:loaded", {
      name,
      settings: {
        repoBaseDir: currentRepoBaseDir,
        reuseExisting: currentReuseExisting,
      },
    });
  });

  // -- Restart an agent --
  socket.on("agent:restart", async ({ agentId }) => {
    const agent = agents.get(agentId);
    if (!agent) {
      socket.emit("agent:error", { agentId, error: "Agent not found" });
      return;
    }
    if (agent.status !== "stopped") {
      socket.emit("agent:error", { agentId, error: "Agent is not stopped" });
      return;
    }

    console.log(`[agent:restart] Restarting ${agentId} (${agent.repoName})`);

    try {
      await createAgent(
        socket,
        agent.repoUrl,
        agent.role,
        undefined,
        agent.repoReused,
        agent.model ?? null,
        agentId,
      );
    } catch (err) {
      socket.emit("agent:error", { agentId, error: err.message });
    }
  });

  // -- Request current list of detected work items (issues / PRs) --
  socket.on("workitems:list", () => {
    socket.emit("workitems:updated", { items: [...workItems.values()] });
  });

  // -- Mission / global context --
  socket.on("mission:set", ({ text }) => {
    globalMissionContext = typeof text === "string" ? text : "";
    console.log(
      `[mission] Context updated (${globalMissionContext.length} chars)`,
    );
    // Broadcast to ALL connected clients so every tab stays in sync.
    // This is intentional: agents are server-global (shared across all sockets),
    // so every tab must see the same mission context — otherwise a tab that didn't
    // set the mission would show agents responding to a brief it can't read.
    io.emit("mission:updated", { text: globalMissionContext });
  });

  socket.on("mission:get", () => {
    socket.emit("mission:updated", { text: globalMissionContext });
  });

  // -- Request broadcast history --
  socket.on("broadcast:list_history", () => {
    socket.emit("broadcast:history", { history: broadcastHistory });
  });

  // -- Create acp-manifest.json for an agent --
  socket.on("orchestrator:create_manifest", ({ agentId }) => {
    const agent = agents.get(agentId);
    if (!agent) {
      socket.emit("agent:error", { agentId, error: "Agent not found" });
      return;
    }
    if (!agent.sessionId || agent.status === "busy") {
      socket.emit("agent:error", { agentId, error: "Agent is not ready" });
      return;
    }
    const inferredRelationships = inferManifestRelationships(agents, agentId);
    const dependsOnSeed = JSON.stringify(inferredRelationships.dependsOn);
    const dependedBySeed = JSON.stringify(inferredRelationships.dependedBy);
    const relationshipGuidance =
      inferredRelationships.dependsOn.length > 0 ||
      inferredRelationships.dependedBy.length > 0
        ? `Use the following relationship seeds inferred from other loaded repos in this session unless the repo contents clearly contradict them:\n- dependsOn: ${dependsOnSeed}\n- dependedBy: ${dependedBySeed}`
        : "No dependency relationships could be inferred from the currently loaded repos, so leave the relationship arrays empty unless the repo contents clearly show otherwise.";

    const manifestPrompt = `Create a file named \`acp-manifest.json\` at the root of this repository with the following structure:
{
  "repoName": "${agent.repoName}",
  "description": "<one-sentence description of this repo>",
  "role": "<library|api|webapp|service|other>",
  "techStack": ["<primary language or framework>"],
  "dependsOn": ${dependsOnSeed},
  "dependedBy": ${dependedBySeed}
}
Fill in the description, role, and techStack based on your knowledge of this repo. ${relationshipGuidance} Return only the file contents by making the edit.`;

    agent.status = "busy";
    socket.emit("agent:update", { agentId, type: "status", content: "busy" });

    const { promise: mfPromise, heartbeat: mfHeartbeat } = withActivityTimeout(
      agent.connection.prompt({
        sessionId: agent.sessionId,
        prompt: [{ type: "text", text: manifestPrompt }],
      }),
      PROMPT_INACTIVITY_TIMEOUT_MS,
      "Manifest creation stalled",
    );
    agent.heartbeat = mfHeartbeat;

    mfPromise
      .then(() => {
        agent.status = "ready";
        refreshAgentManifestFromDisk(agentId);
        const graph = buildDependencyGraph(agents);
        socket.emit("agent:snapshot", buildAgentSnapshot(agentId, graph));
        emitDependencyGraphState(socket, graph);
        socket.emit("agent:prompt_complete", {
          agentId,
          stopReason: "manifest_created",
        });
      })
      .catch((err) => {
        agent.status = "error";
        socket.emit("agent:error", {
          agentId,
          error: `Manifest creation failed: ${err.message}`,
        });
      })
      .finally(() => {
        agent.heartbeat = null;
      });
  });

  // -- Request current dependency graph --
  socket.on("graph:list", () => {
    const graph = refreshAllAgentManifestsFromDisk();
    emitAgentSnapshots(socket, graph);
    emitDependencyGraphState(socket, graph);
  });

  socket.on("disconnect", () => {
    console.log(`[socket] Client disconnected: ${socket.id}`);
    // Unblock any agents waiting on a permission response from this socket.
    // Without this, the ACP child process hangs permanently after a browser refresh.
    for (const [agentId, agent] of agents) {
      if (agent.socketId === socket.id && agent.permissionResolver) {
        console.log(
          `[agent:${agentId.slice(0, 8)}] Resolving orphaned permission (socket disconnected)`,
        );
        // Prefer a "block"/"deny"-kind option so the agent can fail gracefully;
        // fall back to the first available option to unblock the process.
        const denyOption = agent.pendingPermissionOptions?.find(
          (o) => o.kind === "block" || o.kind === "deny",
        );
        const fallbackOption = agent.pendingPermissionOptions?.[0];
        const optionId = denyOption?.optionId ?? fallbackOption?.optionId;
        if (optionId) {
          agent.permissionResolver({
            outcome: { outcome: "selected", optionId },
          });
        } else {
          // No options to resolve with — terminate to prevent permanent deadlock
          stopAgent(agentId);
        }
        agent.permissionResolver = null;
        agent.pendingPermissionOptions = null;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

function stopAgent(agentId, socket = null, options = {}) {
  const { saveSession = false } = options;
  const agent = agents.get(agentId);
  if (!agent) return;

  agent.status = "stopped";
  try {
    agent.process.kill();
  } catch {
    /* already dead */
  }

  // Best-effort removal of the cloned repo — skip if folder was reused (not owned by us)
  if (agent.repoReused) {
    console.log(
      `[cleanup] Skipping folder removal for reused path: ${agent.repoPath}`,
    );
  } else {
    try {
      if (agent.repoPath && existsSync(agent.repoPath)) {
        rmSync(agent.repoPath, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn(
        `[cleanup] Could not remove ${agent.repoPath}: ${err.message}`,
      );
    }
  }

  agents.delete(agentId);
  console.log(`[agent:${agentId.slice(0, 8)}] Stopped and cleaned up`);
  socket?.emit("agent:stopped", { agentId });

  if (saveSession) {
    saveCurrentSession();
  }
}

function shutdownAll(socket = null, options = {}) {
  console.log("[shutdown] Cleaning up all agents…");
  shutdownAgents({
    agents,
    saveCurrentSession,
    stopAgent,
    socket,
    persistSnapshot: options.persistSnapshot ?? false,
  });
}

process.on("SIGINT", () => {
  shutdownAll(null, { persistSnapshot: true });
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdownAll(null, { persistSnapshot: true });
  process.exit(0);
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

httpServer.listen(PORT, () => {
  console.log(
    `[server] ACP Orchestrator listening on http://localhost:${PORT}`,
  );
});
