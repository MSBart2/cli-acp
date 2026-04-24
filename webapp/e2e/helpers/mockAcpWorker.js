#!/usr/bin/env node
/**
 * Mock ACP worker — a configurable stub that speaks the ACP protocol over stdio.
 *
 * Used by e2e tests as a drop-in replacement for `copilot --acp --stdio`.
 * Set COPILOT_CLI_PATH=node and COPILOT_CLI_ARGS to point to this file in tests.
 *
 * CLI args:
 *   --behavior=success      (default) — sends text chunks, returns end_turn
 *   --behavior=error        — throws during prompt so the server marks agent as error
 *   --behavior=slow         — 300 ms delay between each text chunk
 *   --behavior=permission   — requests permission before completing
 *   --chunks=N              — number of text chunks to send (default: 3)
 *   --text=<string>         — text to send in each chunk (default: "Mock output chunk N")
 */

import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [key, ...rest] = a.slice(2).split("=");
      return [key, rest.join("=") || "true"];
    }),
);

const BEHAVIOR = args.behavior ?? "success";
const CHUNK_COUNT = Number(args.chunks ?? 3);
const CHUNK_TEXT = args.text ?? null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Agent implementation
// ---------------------------------------------------------------------------
class MockAgent {
  #connection;
  #sessions = new Map();

  constructor(connection) {
    this.#connection = connection;
  }

  async initialize(_params) {
    return {
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities: { loadSession: false },
    };
  }

  async newSession(_params) {
    const sessionId = randomUUID();
    this.#sessions.set(sessionId, {});
    return { sessionId };
  }

  async authenticate(_params) {
    return {};
  }

  async setSessionMode(_params) {
    return {};
  }

  async prompt(params) {
    const { sessionId } = params;

    if (BEHAVIOR === "error") {
      throw new Error("Mock agent: simulated prompt error");
    }

    const promptText = params.prompt?.map((p) => p.text ?? "").join(" ") ?? "";

    if (BEHAVIOR === "slow") {
      for (let i = 0; i < CHUNK_COUNT; i++) {
        await sleep(300);
        await this.#connection.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: CHUNK_TEXT ?? `Mock output chunk ${i + 1} (slow) for: ${promptText.slice(0, 40)}`,
            },
          },
        });
      }
      return { stopReason: "end_turn" };
    }

    if (BEHAVIOR === "permission") {
      // Send a text chunk, request permission, then complete
      await this.#connection.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "I need permission to modify a file." },
        },
      });

      const response = await this.#connection.requestPermission({
        sessionId,
        toolCall: {
          toolCallId: "mock-call-1",
          title: "Write to output.txt",
          kind: "edit",
          status: "pending",
          locations: [{ path: "/tmp/output.txt" }],
          rawInput: { path: "/tmp/output.txt", content: "hello" },
        },
        options: [
          { kind: "allow_once", name: "Allow", optionId: "allow" },
          { kind: "reject_once", name: "Deny", optionId: "deny" },
        ],
      });

      const allowed = response?.outcome?.optionId === "allow";
      await this.#connection.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: allowed ? "Permission granted — file written." : "Permission denied — skipping.",
          },
        },
      });
      return { stopReason: "end_turn" };
    }

    // Default: success — stream N text chunks
    for (let i = 0; i < CHUNK_COUNT; i++) {
      await this.#connection.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: CHUNK_TEXT ?? `Mock output chunk ${i + 1} for: ${promptText.slice(0, 40)}`,
          },
        },
      });
    }
    return { stopReason: "end_turn" };
  }
}

// ---------------------------------------------------------------------------
// Wire stdio to the ACP stream
// ---------------------------------------------------------------------------
const output = Writable.toWeb(process.stdout);
const input = Readable.toWeb(process.stdin);
const stream = ndJsonStream(output, input);

// AgentSideConnection takes a factory: (connection) => agent
new AgentSideConnection((connection) => new MockAgent(connection), stream);

// Keep the process alive until stdin closes
process.stdin.resume();
