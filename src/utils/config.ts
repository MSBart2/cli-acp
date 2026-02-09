import * as fs from "node:fs";
import * as path from "node:path";
import { Repository } from "../orchestrator";

export interface RepositoryConfig {
  repositories: Repository[];
}

export function loadConfig(configPath: string): RepositoryConfig {
  const absolutePath = path.resolve(configPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Configuration file not found: ${absolutePath}`);
  }

  const content = fs.readFileSync(absolutePath, "utf-8");

  try {
    const config = JSON.parse(content) as RepositoryConfig;

    if (!config.repositories || !Array.isArray(config.repositories)) {
      throw new Error("Invalid configuration: 'repositories' must be an array");
    }

    // Validate each repository
    config.repositories.forEach((repo, index) => {
      if (!repo.name) {
        throw new Error(
          `Repository at index ${index} is missing required field 'name'`
        );
      }
      if (!repo.path) {
        throw new Error(
          `Repository at index ${index} is missing required field 'path'`
        );
      }

      // Resolve relative paths
      if (!path.isAbsolute(repo.path)) {
        repo.path = path.resolve(path.dirname(absolutePath), repo.path);
      }

      // Check if path exists
      if (!fs.existsSync(repo.path)) {
        console.warn(
          `Warning: Repository path does not exist: ${repo.path} (${repo.name})`
        );
      }
    });

    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in configuration file: ${error.message}`);
    }
    throw error;
  }
}

export function validateCopilotInstallation(): boolean {
  // Simple check - in real implementation, could check PATH, etc.
  return true;
}
