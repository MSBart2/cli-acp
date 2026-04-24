# Zoe — History

## Core Context

- **Project:** cli-acp — ACP Agent Orchestrator web UI
- **Operator:** hobobart
- **My domain:** ACP protocol layer inside `webapp/server/index.js`
- **SDK:** `@agentclientprotocol/sdk` — `ClientSideConnection`, `acp.ndJsonStream(output, input)`
- **Process:** `copilot --acp --stdio` — one child process per agent, piped via stdin/stdout
- **Lifecycle:** spawn process → `acp.ndJsonStream` → `new ClientSideConnection(stream, client)` → `connection.initialize()` → `connection.newSession({ cwd })` → ready for prompts
- **Inactivity timeout:** `withActivityTimeout` wraps prompt promises; heartbeat reset on every `sessionUpdate` call
- **Permissions:** `requestPermission` stores resolver on agent entry; `agent:permission_response` Socket.IO event resolves it
- **Broadcast synthesis:** after all workers complete, server finds the orchestrator agent (role=orchestrator, status=ready) and auto-prompts it with coalesced worker output
- **Dependency manifests:** `acp-manifest.json` in each cloned repo; server reads and injects context into prompts; drives dependency graph

---

### Session 2026-04-14 — Extract ACP client callbacks as named factory functions

- Extracted `createRequestPermissionHandler(socket, agentId, { agents })` and `createSessionUpdateHandler(socket, agentId, { agents, getActiveBroadcastWave, setActiveBroadcastWave })` from inside `createAgent` into named module-level factory functions.
- `sessionUpdate` handler accesses `activeBroadcastWave` via accessor pair — not direct closure over the module `let` — so the value is always current even if the wave changes between ticks.
- Removed `let permissionResolver = null;` local from `createAgent`; state lives on `agent.permissionResolver` (already established by the disconnect-cleanup work).
- Both handlers are now importable without spawning a real copilot process. Zero behavior change.
- Decision written: `.squad/decisions/inbox/zoe-session-update-extract.md` (now merged to `decisions.md`).
- **Rule:** ACP client callbacks must be named factory functions at module level — not anonymous closures inside `createAgent`.

---

## GitHub Official ACP Reference (docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server)

> Captured 2026-04-14. ACP support in GitHub Copilot CLI is in public preview and subject to change.

### Overview

The Agent Client Protocol (ACP) standardizes communication between clients (editors/IDEs) and agents (Copilot CLI). See also: [agentclientprotocol.com](https://agentclientprotocol.com/protocol/overview).

### Starting the ACP server

Two modes:

```
# stdio (recommended for IDE/programmatic integration)
copilot --acp --stdio
# or just:
copilot --acp

# TCP (for network access)
copilot --acp --port 3000
```

### Full integration example (TypeScript/Node.js)

This is the canonical reference pattern from GitHub's docs — this project's server/index.js follows this exact shape:

```ts
import * as acp from "@agentclientprotocol/sdk";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";

async function main() {
  const executable = process.env.COPILOT_CLI_PATH ?? "copilot";

  // Spawn copilot with piped stdio for NDJSON transport
  const copilotProcess = spawn(executable, ["--acp", "--stdio"], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  // Create ACP streams (NDJSON over stdio)
  const output = Writable.toWeb(copilotProcess.stdin);
  const input = Readable.toWeb(copilotProcess.stdout);
  const stream = acp.ndJsonStream(output, input);

  const client = {
    async requestPermission(params) {
      // Return a resolved outcome — or broker to the user
      return { outcome: { outcome: "cancelled" } };
    },

    async sessionUpdate(params) {
      const update = params.update;
      if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") {
        process.stdout.write(update.content.text);
      }
    },
  };

  // Build the connection
  const connection = new acp.ClientSideConnection((_agent) => client, stream);

  // Handshake
  await connection.initialize({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientCapabilities: {},
  });

  // Create a session scoped to a working directory
  const sessionResult = await connection.newSession({
    cwd: process.cwd(),
    mcpServers: [],
  });

  // Send a prompt
  const promptResult = await connection.prompt({
    sessionId: sessionResult.sessionId,
    prompt: [{ type: "text", text: "Hello ACP Server!" }],
  });

  if (promptResult.stopReason !== "end_turn") {
    process.stderr.write(`Prompt finished with stopReason=${promptResult.stopReason}\n`);
  }

  // Cleanup
  copilotProcess.stdin.end();
  copilotProcess.kill("SIGTERM");
  await new Promise((resolve) => {
    copilotProcess.once("exit", () => resolve());
    setTimeout(() => resolve(), 2000);
  });
}
```

### Key protocol facts

- **Transport:** NDJSON over stdio (recommended) or TCP
- **Connection type:** `ClientSideConnection` from `@agentclientprotocol/sdk`
- **Stream construction:** `acp.ndJsonStream(writableStdio, readableStdio)`
- **Handshake sequence (required, in order):**
  1. `connection.initialize({ protocolVersion: acp.PROTOCOL_VERSION, clientCapabilities: {} })`
  2. `connection.newSession({ cwd, mcpServers: [] })` → returns `{ sessionId }`
  3. `connection.prompt({ sessionId, prompt: [{ type: "text", text }] })` → returns `{ stopReason }`
- **`stopReason` values:** `"end_turn"` is normal completion; any other value signals an abnormal stop
- **Client callbacks:**
  - `requestPermission(params)` — called when the agent wants to execute a tool; must return `{ outcome }`. In this project, brokers to the UI via Socket.IO promise resolver.
  - `sessionUpdate(params)` — called for every streaming update; `params.update.sessionUpdate` can be `"agent_message_chunk"` (with `content.type: "text"`) among other update types
- **Cleanup:** end stdin (`copilotProcess.stdin.end()`) and SIGTERM the process; no SIGKILL needed if the process exits cleanly
- **Environment:** `COPILOT_CLI_PATH` env var overrides the `copilot` binary path

---

## Learnings

### 2026-04-14 — Deep read of server/index.js ACP integration

#### How the server implements the official ACP pattern

The implementation is a faithful extension of the canonical reference pattern. The spawn → ndJsonStream → ClientSideConnection → initialize → newSession → prompt shape is identical. The key additions layered on top are: multi-agent registry (`agents` Map), inactivity-based timeout wrapper (`withActivityTimeout`), permission promise broker, broadcast wave coalescing, manifest loading via a startup verification prompt, and cascade/dependency analysis.

#### Exact spawn call

```js
const copilotArgs = ["--acp", "--stdio"];
if (typeof model === "string" && model.trim()) {
  copilotArgs.push("--model", model.trim());
}
copilotProcess = spawn(COPILOT_CLI_PATH, copilotArgs, {
  stdio: ["pipe", "pipe", "inherit"],
  shell: true,   // <-- Windows .cmd/.ps1 wrapper support
});
```
- `COPILOT_CLI_PATH` defaults to `"copilot"`.
- `shell: true` is a divergence from the reference (which omits it) — necessary on Windows to resolve `copilot.cmd`.
- stderr is inherited (visible in server terminal); stdin/stdout are piped for NDJSON transport.

#### withActivityTimeout / heartbeat mechanism

Two timeout helpers exist:
- `withTimeout(promise, ms, msg)` — fixed wall-clock `Promise.race`, used only for `initialize()` and `newSession()`.
- `withActivityTimeout(promise, inactivityMs, msg)` — returns `{ promise, heartbeat }`. Internally, `heartbeat()` calls `clearTimeout` + re-arms a new `setTimeout`. Called on every `sessionUpdate` callback via `agents.get(agentId)?.heartbeat?.()`. This means an actively-streaming agent never times out; only complete silence for 5 minutes trips the rejection. The `PROMPT_INACTIVITY_TIMEOUT_MS` constant is `5 * 60 * 1000`. The `heartbeat` fn is stored on the agent entry (`agent.heartbeat`) for the duration of the prompt, then cleared in `finally`.

#### Permission flow end-to-end

1. Agent calls `requestPermission(params)` on the client callbacks object.
2. Server maps `params.options` to `{ optionId, name, kind }`, emits `agent:permission_request` over Socket.IO with `agentId`, `title`, and `options`.
3. A `new Promise(resolve => { agent.permissionResolver = resolve; })` suspends the ACP call — the `requestPermission` callback is `async` so the JSON-RPC stream waits.
4. Browser user clicks an option button → Socket.IO `agent:permission_response` event fires with `{ agentId, optionId }`.
5. Server looks up `agent.permissionResolver`, calls it with `{ outcome: { outcome: "selected", optionId } }`, clears the resolver.
6. The suspended `requestPermission` promise resolves; the ACP SDK returns the outcome to the Copilot CLI process which proceeds.
- **Critical invariant:** `permissionResolver` must always be resolved (not left dangling) or the prompt hangs permanently. Currently there is no timeout or cleanup path for orphaned permission requests if the socket disconnects mid-permission.

#### sessionUpdate handler — update types and Socket.IO mapping

`sessionUpdate` fires on every streaming update from the ACP process:

| `update.sessionUpdate` | Socket.IO `agent:update` type | Notes |
|---|---|---|
| `agent_message_chunk` (content.type === "text") | `"text"` | Also: `detectWorkItems`, manifest capture accumulation, broadcast wave text accumulation |
| `tool_call` | `"tool_call"` | Includes `toolCallId`, `title`, `status` |
| `tool_call_update` | `"tool_call_update"` | Includes `toolCallId`, `status` |
| `plan` | `"plan"` | Entire update object forwarded |
| `agent_thought_chunk` | `"thought"` | Entire update object forwarded |
| (anything else) | _(silently ignored)_ | `default: break` |

Every handler case also calls `agents.get(agentId)?.heartbeat?.()` at the top of `sessionUpdate` to reset the inactivity clock.

#### Broadcast-to-orchestrator forwarding logic

After `Promise.allSettled(promises)` for all worker prompts:
1. Coalesced results are built from `activeBroadcastWave.participants` (each participant's `textChunks.join("")`).
2. `agent:broadcast_results` is emitted with `promptText`, `timestamp`, `results[]`.
3. The server scans `agents` for the first entry where `role === "orchestrator" && status === "ready" && sessionId`.
4. If found, a synthesis prompt is assembled:
   - Optional `buildMissionPrefix()` prepended
   - Original broadcast prompt quoted
   - Per-worker markdown sections (`## repoName\n{output}` or `_Agent errored — no output._`)
   - Fixed synthesis instructions (coordination doc, cross-repo risk table, issue/PR tables, write to `operations/`)
   - Optional `synthesisInstructions` appended verbatim after `--- User orchestrator focus ---`
5. The orchestrator is set to `"busy"`, `withActivityTimeout` wraps `connection.prompt(...)` with `PROMPT_INACTIVITY_TIMEOUT_MS`.
6. After synthesis settles, cascade analysis runs sequentially for each `broadcastCascadeCandidates` entry (fire-and-forget via `void postSynthesisWork.finally(...)`).

#### Manifest loading and dependency graph construction

- Manifest loading happens at the end of `createAgent()` via a **verification prompt** sent immediately after `newSession`. The prompt asks the agent to read `acp-manifest.json` and return raw JSON, or `NO_MANIFEST: <description>`.
- Text chunks from this verification prompt are captured via `agent.capturingManifest = true` + `manifestText[]` accumulator on the agent entry.
- After `connection.prompt()` resolves, `manifestText.join("").trim()` is parsed as JSON. Success → `agent.manifest = parsed`. Failure (JSON.parse error) or `NO_MANIFEST:` prefix → `agent.manifestMissing = true`.
- After in-memory parse, `refreshAgentManifestFromDisk(agentId)` re-reads `acp-manifest.json` from the cloned repo path as the canonical source.
- **Cross-population:** when a new agent's manifest has `dependsOn: ["repo-x"]`, the server immediately prompts the already-loaded `repo-x` agent to add the new agent's name to its own `dependedBy` array. This is a live mutation of the other repo's `acp-manifest.json`.
- `buildDependencyGraph(agents)` (in `helpers.js`) derives the full graph from all loaded agents' `manifest` fields. Results include `unloadedDeps` (deps referenced but not loaded as agents) and `warnings` (inconsistencies).
- The schema: `{ repoName, description, role, techStack, dependsOn[], dependedBy[] }`.

#### stopAgent function — what it cleans up

```
stopAgent(agentId, socket = null, options = {})
```
1. Sets `agent.status = "stopped"`.
2. Calls `agent.process.kill()` (default SIGKILL via Node `ChildProcess.kill()`).
3. If `!agent.repoReused`: deletes the cloned repo folder with `rmSync(repoPath, { recursive: true, force: true })`. Reused folders are skipped (not owned by us).
4. Removes the entry from the `agents` Map.
5. Optionally emits `agent:stopped` on the provided socket.
6. Auto-saves the session (unless `skipAutoSave: true`).
- **Note:** There is no `copilotProcess.stdin.end()` call before `kill()`. The reference pattern recommends ending stdin gracefully first, then SIGTERM. The implementation goes straight to `kill()` (platform default signal). This is a minor divergence — functionally fine in practice.

#### Divergences from the official reference pattern worth noting

| # | Official reference | This implementation |
|---|---|---|
| 1 | `spawn(executable, [...], { stdio: ['pipe','pipe','inherit'] })` — no `shell` | Adds `shell: true` — required for Windows `.cmd` wrappers |
| 2 | One agent per script (single-use) | Multi-agent `Map`-based registry with persistent lifecycle |
| 3 | No timeout | `withActivityTimeout` (inactivity-based, 5 min) for prompts; `withTimeout` (wall-clock) for init/newSession |
| 4 | `requestPermission` returns `{ outcome: "cancelled" }` as stub | Full async promise broker storing resolver on agent entry |
| 5 | `newSession({ cwd: process.cwd() })` | `newSession({ cwd: repoPath })` — repo-specific working directory |
| 6 | Cleanup: `stdin.end()` + SIGTERM + wait for exit | `process.kill()` directly — no graceful stdin drain |
| 7 | No model selection | Optional `--model <name>` arg appended to spawn args |
| 8 | No post-prompt work | After prompt: cascade analysis, broadcast synthesis, session auto-save |
| 9 | `ClientSideConnection(_agent => client, stream)` — reference uses positional args in same order | ✅ Matches exactly |

### 2026-04-14 — Orphaned permission resolver deadlock fix

**Problem:** When a browser tab disconnects (refresh/close/navigate) while an agent has a pending `permissionResolver`, the resolver was never called. The ACP child process blocked permanently on the `requestPermission` return — the JSON-RPC call never resolved. No recovery path existed short of a server restart.

**Root cause:** The `socket.on("disconnect")` handler was a one-liner (log only). It had no knowledge of which agents belonged to the disconnected socket.

**Fix (three targeted changes in `server/index.js`):**

1. **JSDoc updated** — `agents` Map type annotation now includes `socketId` and `pendingPermissionOptions` in the shape.
2. **Agent record** — `agents.set(agentId, { ..., socketId: socket.id, pendingPermissionOptions: null })` — tracks ownership at creation time.
3. **`requestPermission` callback** — now also stores `options` alongside the resolver: `agent.pendingPermissionOptions = options`.
4. **`socket.on("disconnect")` handler** — iterates all agents; for any agent whose `socketId` matches the disconnected socket and has a live `permissionResolver`:
   - Prefers a `kind === "block"` or `kind === "deny"` option so the agent fails gracefully.
   - Falls back to the first available option.
   - If no options exist, calls `stopAgent(agentId)` as last resort.
   - Clears `permissionResolver` and `pendingPermissionOptions` afterward.

**Key insight:** `stopAgent` is a `function` declaration (hoisted), so it is safely callable from inside the `socket.on("connection")` closure even though it is defined later in the file.

**Pattern to remember:** Whenever a promise resolver is stored on a registry entry and the event source (socket, tab) can disappear, the `disconnect` / cleanup event MUST iterate the registry and resolve or abort all dangling promises. Leaving resolvers dangling causes silent process hangs with no observable error.

### 2026-04-14 — Extract requestPermission and sessionUpdate as named factory functions

**Task:** Mechanically extract the two anonymous ACP client callbacks from the `createAgent` closure into named module-level factory functions.

**What was extracted:**

1. **`createRequestPermissionHandler(socket, agentId, { agents })`** — wraps the `requestPermission` logic: logs the permission request, maps options to `{ optionId, name, kind }`, emits `agent:permission_request` over Socket.IO, then suspends via a `new Promise` that stores the resolver on `agent.permissionResolver` and stores the options on `agent.pendingPermissionOptions`.

2. **`createSessionUpdateHandler(socket, agentId, { agents, getActiveBroadcastWave, setActiveBroadcastWave })`** — wraps the `sessionUpdate` logic: resets the inactivity heartbeat, then dispatches on `update.sessionUpdate` across five cases (`agent_message_chunk`, `tool_call`, `tool_call_update`, `plan`, `agent_thought_chunk`). The `activeBroadcastWave` module-level variable is accessed via `getActiveBroadcastWave()` getter rather than closed over directly, keeping the factory side-effect-free with respect to module state.

**Changes inside `createAgent`:**
- Removed the now-unused `let permissionResolver = null;` local variable (the actual state lives on `agent.permissionResolver`).
- Replaced the inline `client` object with two factory calls and a minimal `client = { requestPermission: ..., sessionUpdate: ... }` wrapper.

**Key design note for `activeBroadcastWave`:** The sessionUpdate handler only *reads* `activeBroadcastWave` (never sets it). The getter/setter interface was kept symmetric per task spec so future changes that need to mutate it don't require revisiting the factory signature.

**Test result:** 81/81 server tests passing after extraction. Zero behavior change.
