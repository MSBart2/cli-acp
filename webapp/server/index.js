import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
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
import { consoleLogger } from "./logger.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3001;
const COPILOT_CLI_PATH = process.env.COPILOT_CLI_PATH || "copilot";
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
const __dirname = dirname(__filename);
const console = consoleLogger;

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
// Agent registry – one entry per spawned copilot process
// ---------------------------------------------------------------------------

/** @type {Map<string, {process, connection, sessionId, repoUrl, repoName, repoPath, role, status, permissionResolver}>} */
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
 * Returns a formatted session brief prefix to prepend to agent prompts.
 * Returns an empty string when no shared brief has been set.
 * @returns {string}
 */
function buildMissionPrefix() {
  if (!globalMissionContext?.trim()) return "";
  return `## Session Brief\n${globalMissionContext.trim()}\n\n---\n\n`;
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
 * Parse orchestrator output for @repo: prompt routing directives.
 * Returns an array of { repoName, promptText } pairs.
 * Returns null if the output contains NO_CASCADE.
 * @param {string} text
 * @returns {Array<{repoName: string, promptText: string}>|null}
 */
function parseRoutingPlan(text) {
  if (!text || /NO_CASCADE/i.test(text)) return null;
  const directives = [];
  const re = /@([\w-]+)\s*:\s*([^\n@]+)/g;
  for (const match of text.matchAll(re)) {
    directives.push({ repoName: match[1].trim(), promptText: match[2].trim() });
  }
  return directives.length > 0 ? directives : null;
}

/**
 * Build the cross-repo context block to prepend to worker prompts.
 * Returns an empty string if the agent has no known dependencies.
 * @param {string} agentId
 * @returns {string}
 */
function buildCrossRepoContext(agentId) {
  const agent = agents.get(agentId);
  if (!agent?.manifest) return "";

  const { upstream, downstream } = getGraphRelationships(agents, agentId);

  if (upstream.length === 0 && downstream.length === 0) return "";

  const lines = ["## Cross-Repo Context (injected by ACP Orchestrator)"];
  if (upstream.length > 0) {
    lines.push(
      `This repo depends on: ${upstream.join(", ")} (also loaded in this session).`,
    );
  }
  if (downstream.length > 0) {
    lines.push(
      `The following repos in this session depend on this repo: ${downstream.join(", ")}.`,
    );
  }
  lines.push(
    "Keep cross-repo compatibility in mind. If your changes affect public interfaces, flag them explicitly.",
  );
  return lines.join("\n") + "\n\n";
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
      stderr += chunk.toString();
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
  const missionPrefix = buildMissionPrefix();
  const crossRepoContext = buildCrossRepoContext(agentId);
  const enrichedText =
    missionPrefix + (crossRepoContext ? crossRepoContext + text : text);
  agent.lastPromptOutput = [];

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
    return false;
  } finally {
    agent.heartbeat = null;
    agent.lastPromptOutput = undefined;
  }
}

// ---------------------------------------------------------------------------
// Core: spawn copilot, create ACP session, wire events to socket
// ---------------------------------------------------------------------------

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

  // Spawn the copilot CLI process
  let copilotProcess;
  try {
    // shell: true lets Windows resolve .cmd/.ps1 wrappers (e.g. copilot.cmd)
    const copilotArgs = ["--acp", "--stdio"];
    if (typeof model === "string" && model.trim()) {
      copilotArgs.push("--model", model.trim());
    }
    copilotProcess = spawn(COPILOT_CLI_PATH, copilotArgs, {
      stdio: ["pipe", "pipe", "inherit"],
      shell: true,
    });
  } catch (err) {
    console.error(`[agent:create] Spawn failed: ${err.message}`);
    socket.emit("agent:error", {
      agentId,
      error: `Failed to start copilot CLI. Is "${COPILOT_CLI_PATH}" installed and on the PATH?`,
    });
    return;
  }

  // Detect early crashes (e.g. binary not found)
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

  // Permission handling – we store a resolver so the frontend can respond
  let permissionResolver = null;

  /** Client callbacks invoked by the ACP agent. */
  const client = {
    async requestPermission(params) {
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
        if (agent) agent.permissionResolver = resolve;
      });
    },

    async sessionUpdate(params) {
      // Reset the inactivity timeout whenever the agent sends any update.
      // This is the core of the keepalive mechanism — as long as the agent
      // keeps streaming (text, tool calls, thoughts, plans) the deadline stays
      // pushed forward and the prompt will never be timed out mid-work.
      agents.get(agentId)?.heartbeat?.();

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
            const currentAgent = agents.get(agentId);
            if (currentAgent?.capturingManifest) {
              currentAgent.manifestText.push(update.content.text);
            }
            // Accumulate text for cascade analysis after prompt completes
            if (currentAgent?.lastPromptOutput !== undefined) {
              currentAgent.lastPromptOutput.push(update.content.text);
            }

            // If this agent is part of an active broadcast wave, accumulate
            // its text so we can coalesce results when the wave completes
            if (activeBroadcastWave?.participants.has(agentId)) {
              activeBroadcastWave.participants
                .get(agentId)
                .textChunks.push(update.content.text);
            }
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
          break;

        case "tool_call_update":
          socket.emit("agent:update", {
            agentId,
            type: "tool_call_update",
            content: { toolCallId: update.toolCallId, status: update.status },
          });
          break;

        case "plan":
          socket.emit("agent:update", {
            agentId,
            type: "plan",
            content: update,
          });
          break;

        case "agent_thought_chunk":
          socket.emit("agent:update", {
            agentId,
            type: "thought",
            content: update,
          });
          break;

        default:
          break;
      }
    },
  };

  const connection = new acp.ClientSideConnection((_agent) => client, stream);

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
    // Heartbeat function set while a prompt is in-flight; called from
    // sessionUpdate to reset the inactivity timeout on each streaming update.
    heartbeat: null,
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
          for (const depRepoName of parsed.dependsOn || []) {
            const depEntry = [...agents.entries()].find(
              ([, a]) => a.repoName === depRepoName,
            );
            if (depEntry) {
              const [depAgentId, depAgent] = depEntry;
              if (
                depAgent.connection &&
                depAgent.sessionId &&
                depAgent.status !== "busy"
              ) {
                console.log(
                  `[manifest:cross-pop] Prompting ${depRepoName} to add ${agent.repoName} to its dependedBy`,
                );
                depAgent.connection
                  .prompt({
                    sessionId: depAgent.sessionId,
                    prompt: [
                      {
                        type: "text",
                        text: `In \`acp-manifest.json\` at the repo root, add "${agent.repoName}" to the \`dependedBy\` array if it is not already present. Keep all other fields unchanged. Do not explain, just make the edit.`,
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
          }
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
    stopAgent(agentId);
    socket.emit("agent:stopped", { agentId });
  });

  // -- Broadcast a prompt to all ready agents in parallel --
  socket.on(
    "agent:prompt_all",
    async ({ text, synthesisInstructions, targetRepoNames }) => {
      if (typeof text !== "string" || text.length === 0) {
        socket.emit("agent:error", {
          agentId: null,
          error: "Non-empty text is required for broadcast",
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
        try {
          console.log(
            `[agent:prompt_all] Starting ${agentId.slice(0, 8)} (${agent.repoName})`,
          );

          const missionPrefix = buildMissionPrefix();
          const crossRepoCtx = buildCrossRepoContext(agentId);
          const enrichedBroadcastText =
            missionPrefix + (crossRepoCtx ? crossRepoCtx + text : text);
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

        socket.emit("agent:broadcast_results", {
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
        socket.emit("broadcast:history", { history: broadcastHistory });

        // Auto-forward coalesced results to the orchestrator agent (if one exists)
        const orchestrator = [...agents.values()].find(
          (a) =>
            a.role === "orchestrator" && a.sessionId && a.status === "ready",
        );

        let postSynthesisWork = Promise.resolve();

        if (orchestrator) {
          const orchestratorId = [...agents.entries()].find(
            ([, a]) => a === orchestrator,
          )?.[0];

          // Build a synthesis prompt containing all worker outputs
          const workerSummaries = results
            .map(
              (r) =>
                `## ${r.repoName}\n${r.status === "error" ? "_Agent errored — no output._" : r.output}`,
            )
            .join("\n\n");

          const synthesisPrompt =
            buildMissionPrefix() +
            `Here are the results from ${results.length} worker agents after a broadcast prompt.\n\n` +
            `**Original prompt:** "${activeBroadcastWave.promptText}"\n\n` +
            `${workerSummaries}\n\n` +
            `Synthesize these results into a coordination document. ` +
            `Identify the overall state across repos, flag any cross-repo dependencies or risks, ` +
            `and recommend a priority order for next steps. ` +
            `If any workers reported issue URLs, collect them into a table with columns: Repo, Issue, Title. ` +
            `If any workers reported PR URLs, collect them into a table with columns: Repo, PR, Status, Dependencies, Notes. ` +
            `Write your synthesis to a file in the operations/ directory of this repo.` +
            // Append user-provided orchestrator focus guidance so the
            // synthesis can be shaped for this broadcast.
            (synthesisInstructions
              ? `\n\n--- User orchestrator focus ---\n${synthesisInstructions}`
              : "");

          console.log(
            `[orchestrator] Auto-forwarding broadcast results to orchestrator ${orchestratorId?.slice(0, 8)} (${orchestrator.repoName})`,
          );

          orchestrator.status = "busy";
          socket.emit("agent:update", {
            agentId: orchestratorId,
            type: "status",
            content: "busy",
          });

          const startTime = Date.now();

          // Fire-and-forget — the orchestrator works asynchronously after the
          // broadcast settles. Use inactivity timeout so long synthesis runs
          // (writing coordination docs, calling tools) are never cut short.
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

          postSynthesisWork = synthPromise
            .then((result) => {
              const duration = ((Date.now() - startTime) / 1000).toFixed(1);
              console.log(
                `[orchestrator] ${orchestratorId?.slice(0, 8)} synthesis completed in ${duration}s (${result.stopReason})`,
              );
              orchestrator.status = "ready";
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
              socket.emit("agent:error", {
                agentId: orchestratorId,
                error: `Synthesis failed: ${err.message}`,
              });
            })
            .finally(() => {
              orchestrator.heartbeat = null;
            });
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

        activeBroadcastWave = null;
      }

      // Notify the frontend the entire broadcast round is done
      socket.emit("agent:prompt_all_complete");

      // Auto-save history
      saveCurrentSession();
    },
  );

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

    // Stop all running agents
    shutdownAll(socket, { persistSnapshot: true });

    // Clear maps
    agents.clear();
    workItems.clear();
    broadcastHistory.length = 0;

    const result = loadSession(name);
    if (!result.success) {
      socket.emit("session:error", { message: result.error });
      return;
    }

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
    // Broadcast to ALL connected clients so every tab stays in sync
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
  });
});

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

function stopAgent(agentId, socket = null, options = {}) {
  const { skipAutoSave = false } = options;
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

  if (!skipAutoSave) {
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
