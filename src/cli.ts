#!/usr/bin/env node

import { Command } from "commander";
import { ACPClient } from "./acp-client";
import { MultiRepoOrchestrator, Repository } from "./orchestrator";
import * as fs from "node:fs";
import * as path from "node:path";

const program = new Command();

program
  .name("cli-acp")
  .description("CLI tool for multi-repository orchestration using ACP")
  .version("0.1.0");

program
  .command("prompt")
  .description("Send a prompt to Copilot via ACP")
  .argument("<text>", "The prompt text to send")
  .option("-v, --verbose", "Enable verbose logging", false)
  .action(async (text: string, options: { verbose: boolean }) => {
    const client = new ACPClient({ verbose: options.verbose });

    try {
      await client.initialize();
      const sessionId = await client.createSession();
      console.log("Session started!\n");
      console.log(`Prompt: ${text}\n`);
      await client.sendPrompt(sessionId, text);
      console.log("\n");
    } catch (error) {
      console.error("Error:", error);
      process.exitCode = 1;
    } finally {
      await client.cleanup();
    }
  });

program
  .command("multi-repo")
  .description("Execute a prompt across multiple repositories")
  .argument("<prompt>", "The prompt to execute")
  .option("-c, --config <path>", "Path to repository config file")
  .option("-v, --verbose", "Enable verbose logging", false)
  .action(
    async (
      promptText: string,
      options: { config?: string; verbose: boolean }
    ) => {
      let repositories: Repository[];

      if (options.config) {
        // Load repositories from config file
        const configPath = path.resolve(options.config);
        if (!fs.existsSync(configPath)) {
          console.error(`Config file not found: ${configPath}`);
          process.exitCode = 1;
          return;
        }

        const configContent = fs.readFileSync(configPath, "utf-8");
        const config = JSON.parse(configContent);
        repositories = config.repositories;
      } else {
        // Default: use current directory only
        repositories = [
          {
            name: "current",
            path: process.cwd(),
            description: "Current directory",
          },
        ];
      }

      const orchestrator = new MultiRepoOrchestrator(
        repositories,
        options.verbose
      );

      try {
        await orchestrator.initialize();
        await orchestrator.executePromptAcrossRepos(promptText);
      } catch (error) {
        console.error("Error:", error);
        process.exitCode = 1;
      } finally {
        await orchestrator.cleanup();
      }
    }
  );

program
  .command("interactive")
  .description("Start an interactive multi-repo session")
  .option("-c, --config <path>", "Path to repository config file")
  .option("-v, --verbose", "Enable verbose logging", false)
  .action(async (options: { config?: string; verbose: boolean }) => {
    console.log("Interactive mode is not yet implemented.");
    console.log("Please use 'prompt' or 'multi-repo' commands for now.");
    process.exitCode = 0;
  });

program.parse();
