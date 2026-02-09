import * as acp from "@agentclientprotocol/sdk";
import { spawn, ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";

export interface ACPClientOptions {
  copilotPath?: string;
  mode?: "stdio" | "tcp";
  port?: number;
  verbose?: boolean;
}

export interface PromptMessage {
  type: "text";
  text: string;
}

export interface SessionOptions {
  cwd?: string;
  mcpServers?: string[];
}

export class ACPClient {
  private connection: acp.ClientSideConnection | null = null;
  private copilotProcess: ChildProcess | null = null;
  private options: ACPClientOptions;
  private verbose: boolean;

  constructor(options: ACPClientOptions = {}) {
    this.options = {
      copilotPath: process.env.COPILOT_CLI_PATH ?? "copilot",
      mode: "stdio",
      verbose: false,
      ...options,
    };
    this.verbose = this.options.verbose ?? false;
  }

  private log(message: string): void {
    if (this.verbose) {
      console.error(`[ACP Client] ${message}`);
    }
  }

  async initialize(): Promise<void> {
    this.log("Initializing ACP client...");

    const args = ["--acp"];
    if (this.options.mode === "stdio") {
      args.push("--stdio");
    } else if (this.options.mode === "tcp" && this.options.port) {
      args.push("--port", this.options.port.toString());
    }

    this.log(`Spawning: ${this.options.copilotPath} ${args.join(" ")}`);

    this.copilotProcess = spawn(this.options.copilotPath!, args, {
      stdio: ["pipe", "pipe", "inherit"],
    });

    if (!this.copilotProcess.stdin || !this.copilotProcess.stdout) {
      throw new Error("Failed to start Copilot ACP process with piped stdio.");
    }

    // Create ACP streams (NDJSON over stdio)
    const output = Writable.toWeb(
      this.copilotProcess.stdin
    ) as WritableStream<Uint8Array>;
    const input = Readable.toWeb(
      this.copilotProcess.stdout
    ) as ReadableStream<Uint8Array>;
    const stream = acp.ndJsonStream(output, input);

    const client: acp.Client = {
      async requestPermission(params) {
        // For this demo, we'll allow all operations
        // In production, you might want to prompt the user or check permissions
        console.log(
          `[Permission Request] Tool: ${params.tool}, Action: ${params.action}`
        );
        return { outcome: { outcome: "granted" } };
      },

      async sessionUpdate(params) {
        const update = params.update;

        if (
          update.sessionUpdate === "agent_message_chunk" &&
          update.content.type === "text"
        ) {
          process.stdout.write(update.content.text);
        }
      },
    };

    this.connection = new acp.ClientSideConnection((_agent) => client, stream);

    await this.connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {},
    });

    this.log("ACP client initialized successfully");
  }

  async createSession(options: SessionOptions = {}): Promise<string> {
    if (!this.connection) {
      throw new Error("Client not initialized. Call initialize() first.");
    }

    this.log("Creating new session...");

    const sessionResult = await this.connection.newSession({
      cwd: options.cwd || process.cwd(),
      mcpServers: options.mcpServers || [],
    });

    this.log(`Session created: ${sessionResult.sessionId}`);
    return sessionResult.sessionId;
  }

  async sendPrompt(
    sessionId: string,
    prompt: string | PromptMessage[]
  ): Promise<void> {
    if (!this.connection) {
      throw new Error("Client not initialized. Call initialize() first.");
    }

    const promptMessages: PromptMessage[] =
      typeof prompt === "string" ? [{ type: "text", text: prompt }] : prompt;

    this.log(`Sending prompt to session ${sessionId}...`);

    const promptResult = await this.connection.prompt({
      sessionId,
      prompt: promptMessages,
    });

    if (promptResult.stopReason !== "end_turn") {
      console.error(
        `\n[Warning] Prompt finished with stopReason=${promptResult.stopReason}`
      );
    }
  }

  async cleanup(): Promise<void> {
    this.log("Cleaning up ACP client...");

    if (this.copilotProcess) {
      // Best-effort cleanup
      this.copilotProcess.stdin?.end();
      this.copilotProcess.kill("SIGTERM");

      await new Promise<void>((resolve) => {
        this.copilotProcess!.once("exit", () => resolve());
        setTimeout(() => resolve(), 2000);
      });
    }

    this.connection = null;
    this.copilotProcess = null;
    this.log("Cleanup complete");
  }
}
