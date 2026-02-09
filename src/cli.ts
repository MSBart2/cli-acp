#!/usr/bin/env node

import { Command } from "commander";
import { ACPClient } from "./acp-client";
import { MultiRepoOrchestrator, Repository } from "./orchestrator";
import { loadConfig } from "./utils/config";
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
        try {
          const config = loadConfig(options.config);
          repositories = config.repositories;
        } catch (error) {
          console.error(`Error loading config: ${error}`);
          process.exitCode = 1;
          return;
        }
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
