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

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3001;
const COPILOT_CLI_PATH = process.env.COPILOT_CLI_PATH || "copilot";
const REPO_BASE_DIR = join(tmpdir(), "acp-repos");
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

/** @type {Map<string, {process, connection, sessionId, repoUrl, repoName, repoPath, status, permissionResolver}>} */
const agents = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Validate that a URL looks like a safe Git HTTPS URL. */
function isValidGitUrl(url) {
  return /^https:\/\/[\w.@:\-~]+\/[\w.\-/]+(?:\.git)?$/.test(url);
}

/** Extract a sanitised human-readable repo name from a GitHub URL. */
function repoNameFromUrl(url) {
  // basename + strip non-alphanumeric chars to prevent path traversal
  return basename(url.replace(/\.git$/, "")).replace(/[^a-zA-Z0-9._-]/g, "-");
}

/**
 * Clone a repository to a temp directory.
 * Returns the absolute path of the cloned directory.
 */
function cloneRepo(repoUrl) {
  return new Promise((resolve, reject) => {
    mkdirSync(REPO_BASE_DIR, { recursive: true });

    const repoName = repoNameFromUrl(repoUrl);
    const repoPath = join(REPO_BASE_DIR, `${repoName}-${randomUUID().slice(0, 8)}`);

    console.log(`[clone] Cloning ${repoUrl} → ${repoPath}`);

    const git = spawn("git", ["clone", "--depth", "1", repoUrl, repoPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    git.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    git.on("close", (code) => {
      if (code === 0) {
        console.log(`[clone] Done: ${repoPath}`);
        resolve(repoPath);
      } else {
        reject(new Error(`git clone failed (exit ${code}): ${stderr.trim()}`));
      }
    });

    git.on("error", (err) => reject(err));
  });
}

// ---------------------------------------------------------------------------
// Core: spawn copilot, create ACP session, wire events to socket
// ---------------------------------------------------------------------------

async function createAgent(socket, repoUrl) {
  const agentId = randomUUID();
  const repoName = repoNameFromUrl(repoUrl);

  let repoPath;
  try {
    repoPath = await cloneRepo(repoUrl);
  } catch (err) {
    console.error(`[agent:create] Clone failed: ${err.message}`);
    socket.emit("agent:error", { agentId, error: `Failed to clone repository: ${err.message}` });
    return;
  }

  // Spawn the copilot CLI process
  let copilotProcess;
  try {
    copilotProcess = spawn(COPILOT_CLI_PATH, ["--acp", "--stdio"], {
      stdio: ["pipe", "pipe", "inherit"],
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
      if (code !== 0 && agents.has(agentId) && agents.get(agentId).status !== "stopped") {
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
      console.log(`[agent:${agentId.slice(0, 8)}] Permission requested: ${params.toolCall?.title}`);

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
            socket.emit("agent:update", { agentId, type: "text", content: update.content.text });
          }
          break;

        case "tool_call":
          socket.emit("agent:update", {
            agentId,
            type: "tool_call",
            content: { toolCallId: update.toolCallId, title: update.title, status: update.status },
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
          socket.emit("agent:update", { agentId, type: "plan", content: update });
          break;

        case "agent_thought_chunk":
          socket.emit("agent:update", { agentId, type: "thought", content: update });
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

    console.log(`[agent:${agentId.slice(0, 8)}] Connected (protocol v${initResult.protocolVersion})`);

    const sessionResult = await connection.newSession({
      cwd: repoPath,
      mcpServers: [],
    });

    const agent = agents.get(agentId);
    agent.sessionId = sessionResult.sessionId;
    agent.status = "ready";

    console.log(`[agent:${agentId.slice(0, 8)}] Session ${sessionResult.sessionId} ready`);

    socket.emit("agent:created", { agentId, repoUrl, repoName, status: "ready" });
  } catch (err) {
    console.error(`[agent:create] ACP init failed: ${err.message}`);
    copilotProcess.kill();
    agents.delete(agentId);
    socket.emit("agent:error", { agentId, error: `ACP initialization failed: ${err.message}` });
  }
}

// ---------------------------------------------------------------------------
// Socket.IO connection handler
// ---------------------------------------------------------------------------

io.on("connection", (socket) => {
  console.log(`[socket] Client connected: ${socket.id}`);

  // -- Create a new agent for a repo --
  socket.on("agent:create", async ({ repoUrl }) => {
    if (!repoUrl || typeof repoUrl !== "string") {
      socket.emit("agent:error", { agentId: null, error: "repoUrl is required" });
      return;
    }
    if (!isValidGitUrl(repoUrl)) {
      socket.emit("agent:error", { agentId: null, error: "Invalid repository URL. Only HTTPS Git URLs are supported." });
      return;
    }
    console.log(`[socket] agent:create → ${repoUrl}`);
    await createAgent(socket, repoUrl);
  });

  // -- Send a prompt to an existing agent --
  socket.on("agent:prompt", async ({ agentId, text }) => {
    if (!agentId || typeof text !== "string" || text.length === 0) {
      socket.emit("agent:error", { agentId, error: "agentId and non-empty text are required" });
      return;
    }
    const agent = agents.get(agentId);
    if (!agent) {
      socket.emit("agent:error", { agentId, error: "Agent not found" });
      return;
    }

    console.log(`[socket] agent:prompt → ${agentId.slice(0, 8)}: ${text.slice(0, 80)}`);
    agent.status = "busy";
    socket.emit("agent:update", { agentId, type: "status", content: "busy" });

    try {
      const result = await agent.connection.prompt({
        sessionId: agent.sessionId,
        prompt: [{ type: "text", text }],
      });

      agent.status = "ready";
      socket.emit("agent:prompt_complete", { agentId, stopReason: result.stopReason });
    } catch (err) {
      console.error(`[agent:prompt] Error: ${err.message}`);
      agent.status = "error";
      socket.emit("agent:error", { agentId, error: `Prompt failed: ${err.message}` });
    }
  });

  // -- Resolve a pending permission request --
  socket.on("agent:permission_response", ({ agentId, optionId }) => {
    const agent = agents.get(agentId);
    if (!agent?.permissionResolver) {
      socket.emit("agent:error", { agentId, error: "No pending permission request" });
      return;
    }

    console.log(`[socket] agent:permission_response → ${agentId.slice(0, 8)}: ${optionId}`);

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
  } catch { /* already dead */ }

  // Best-effort removal of the cloned repo
  try {
    if (agent.repoPath && existsSync(agent.repoPath)) {
      rmSync(agent.repoPath, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(`[cleanup] Could not remove ${agent.repoPath}: ${err.message}`);
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

process.on("SIGINT", () => { shutdownAll(); process.exit(0); });
process.on("SIGTERM", () => { shutdownAll(); process.exit(0); });

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

httpServer.listen(PORT, () => {
  console.log(`[server] ACP Orchestrator listening on http://localhost:${PORT}`);
});
