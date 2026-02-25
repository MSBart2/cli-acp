import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import * as acp from "@agentclientprotocol/sdk";
import { isValidGitUrl, repoNameFromUrl, extractWorkItems } from "./helpers.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3001;
const COPILOT_CLI_PATH = process.env.COPILOT_CLI_PATH || "copilot";
const REPO_BASE_DIR = process.env.REPO_BASE_DIR || join(tmpdir(), "acp-repos");
const PROMPT_TIMEOUT_MS = 60 * 1000; // 1 minute
const __filename = fileURLToPath(import.meta.url);
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wraps a promise with a timeout. Rejects if the promise doesn't settle within the timeout.
 * @param {Promise} promise - The promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} errorMessage - Error message to use if timeout occurs
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
) {
  // Enforce single-orchestrator rule
  if (role === "orchestrator") {
    const existing = [...agents.values()].find(
      (a) => a.role === "orchestrator",
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

  const agentId = randomUUID();
  const repoName = repoNameFromUrl(repoUrl);

  // Immediately tell the frontend a spawn is in progress so it can show a wait state
  socket.emit("agent:spawning", {
    agentId,
    repoUrl,
    repoName,
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
    role,
    step: "starting",
    message: "Starting Copilot CLI…",
  });

  // Spawn the copilot CLI process
  let copilotProcess;
  try {
    // shell: true lets Windows resolve .cmd/.ps1 wrappers (e.g. copilot.cmd)
    copilotProcess = spawn(COPILOT_CLI_PATH, ["--acp", "--stdio"], {
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
    role,
    status: "initializing",
    permissionResolver: null,
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
      role,
      step: "verifying",
      message: "Verifying agent is responsive…",
    });

    // Send a lightweight startup prompt so we know the agent can respond
    try {
      const verifyResult = await connection.prompt({
        sessionId: sessionResult.sessionId,
        prompt: [
          {
            type: "text",
            text: "Briefly describe this repository in one or two sentences. Do not read any files — just use whatever context you already have from the repo name and structure.",
          },
        ],
      });

      agent.status = "ready";
      console.log(
        `[agent:${agentId.slice(0, 8)}] Verification complete (${verifyResult.stopReason})`,
      );
    } catch (verifyErr) {
      // Verification failed but the session is still usable — mark ready anyway
      console.warn(
        `[agent:${agentId.slice(0, 8)}] Verification prompt failed: ${verifyErr.message}`,
      );
      agent.status = "ready";
    }

    socket.emit("agent:created", {
      agentId,
      repoUrl,
      repoName,
      repoPath,
      role,
      status: "ready",
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
// Socket.IO connection handler
// ---------------------------------------------------------------------------

io.on("connection", (socket) => {
  console.log(`[socket] Client connected: ${socket.id}`);

  // -- Create a new agent for a repo --
  socket.on(
    "agent:create",
    async ({ repoUrl, role, repoBaseDir, reuseExisting }) => {
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
      await createAgent(
        socket,
        repoUrl,
        role || "worker",
        repoBaseDir,
        reuseExisting,
      );
    },
  );

  // -- Send a prompt to an existing agent --
  socket.on("agent:prompt", async ({ agentId, text }) => {
    if (!agentId || typeof text !== "string" || text.length === 0) {
      socket.emit("agent:error", {
        agentId,
        error: "agentId and non-empty text are required",
      });
      return;
    }
    const agent = agents.get(agentId);
    if (!agent) {
      socket.emit("agent:error", { agentId, error: "Agent not found" });
      return;
    }

    console.log(
      `[socket] agent:prompt → ${agentId.slice(0, 8)} (${agent.repoName}): ${text.slice(0, 80)}`,
    );
    agent.status = "busy";
    socket.emit("agent:update", { agentId, type: "status", content: "busy" });

    const startTime = Date.now();
    try {
      const result = await withTimeout(
        agent.connection.prompt({
          sessionId: agent.sessionId,
          prompt: [{ type: "text", text }],
        }),
        PROMPT_TIMEOUT_MS,
        `Prompt timed out after ${PROMPT_TIMEOUT_MS / 1000}s`,
      );

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[agent:prompt] ${agentId.slice(0, 8)} completed in ${duration}s (${result.stopReason})`,
      );

      agent.status = "ready";
      socket.emit("agent:prompt_complete", {
        agentId,
        stopReason: result.stopReason,
      });
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
    }
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

  // -- Stop an agent --
  socket.on("agent:stop", ({ agentId }) => {
    console.log(`[socket] agent:stop → ${agentId.slice(0, 8)}`);
    stopAgent(agentId);
    socket.emit("agent:stopped", { agentId });
  });

  // -- Broadcast a prompt to all ready agents in parallel --
  socket.on("agent:prompt_all", async ({ text, synthesisInstructions }) => {
    if (typeof text !== "string" || text.length === 0) {
      socket.emit("agent:error", {
        agentId: null,
        error: "Non-empty text is required for broadcast",
      });
      return;
    }

    // Collect worker agents that are in a promptable state
    // (the orchestrator is excluded — it receives synthesized results separately)
    const readyAgents = [...agents.entries()].filter(
      ([, a]) => a.role === "worker" && a.status === "ready" && a.sessionId,
    );

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
      socket.emit("agent:update", { agentId, type: "status", content: "busy" });
    }

    // Fan out prompts — each runs independently so one failure doesn't block others
    let completedCount = 0;
    const totalCount = readyAgents.length;
    const promises = readyAgents.map(async ([agentId, agent]) => {
      const startTime = Date.now();
      try {
        console.log(
          `[agent:prompt_all] Starting ${agentId.slice(0, 8)} (${agent.repoName})`,
        );

        const result = await withTimeout(
          agent.connection.prompt({
            sessionId: agent.sessionId,
            prompt: [{ type: "text", text }],
          }),
          PROMPT_TIMEOUT_MS,
          `Broadcast prompt timed out after ${PROMPT_TIMEOUT_MS / 1000}s`,
        );

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
        (a) => a.role === "orchestrator" && a.sessionId && a.status === "ready",
      );

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
          `Here are the results from ${results.length} worker agents after a broadcast prompt.\n\n` +
          `**Original prompt:** "${activeBroadcastWave.promptText}"\n\n` +
          `${workerSummaries}\n\n` +
          `Synthesize these results into a coordination document. ` +
          `Identify the overall state across repos, flag any cross-repo dependencies or risks, ` +
          `and recommend a priority order for next steps. ` +
          `If any workers reported issue URLs, collect them into a table with columns: Repo, Issue, Title. ` +
          `If any workers reported PR URLs, collect them into a table with columns: Repo, PR, Status, Dependencies, Notes. ` +
          `Write your synthesis to a file in the operations/ directory of this repo.` +
          // Append user-provided synthesis instructions so the orchestrator
          // gets domain-specific guidance (e.g. "create a parent issue")
          (synthesisInstructions
            ? `\n\n--- User synthesis instructions ---\n${synthesisInstructions}`
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

        // Fire-and-forget with timeout — the orchestrator works asynchronously
        withTimeout(
          orchestrator.connection.prompt({
            sessionId: orchestrator.sessionId,
            prompt: [{ type: "text", text: synthesisPrompt }],
          }),
          PROMPT_TIMEOUT_MS,
          `Orchestrator synthesis timed out after ${PROMPT_TIMEOUT_MS / 1000}s`,
        )
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
          });
      }

      activeBroadcastWave = null;
    }

    // Notify the frontend the entire broadcast round is done
    socket.emit("agent:prompt_all_complete");
  });

  // -- Request current list of detected work items (issues / PRs) --
  socket.on("workitems:list", () => {
    socket.emit("workitems:updated", { items: [...workItems.values()] });
  });

  // -- Request broadcast history --
  socket.on("broadcast:list_history", () => {
    socket.emit("broadcast:history", { history: broadcastHistory });
  });

  socket.on("disconnect", () => {
    console.log(`[socket] Client disconnected: ${socket.id}`);
  });
});

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

function stopAgent(agentId) {
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
}

function shutdownAll() {
  console.log("[shutdown] Cleaning up all agents…");
  for (const agentId of agents.keys()) {
    stopAgent(agentId);
  }
}

process.on("SIGINT", () => {
  shutdownAll();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdownAll();
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
