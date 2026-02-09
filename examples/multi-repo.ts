import { MultiRepoOrchestrator, Repository } from "../src/orchestrator";
import * as path from "node:path";

/**
 * Multi-repository orchestration example
 * 
 * This script demonstrates how to:
 * 1. Set up multiple repository contexts
 * 2. Execute the same prompt across all repositories
 * 3. Gather insights from different codebases
 * 4. Compare results across repositories
 */

async function main() {
  console.log("=== Multi-Repository Orchestration Example ===\n");

  // Define repositories to orchestrate
  // In a real scenario, these would be different actual repositories
  const repositories: Repository[] = [
    {
      name: "cli-acp",
      path: process.cwd(),
      description: "The CLI-ACP demo application itself",
    },
    // You can add more repositories here:
    // {
    //   name: "another-repo",
    //   path: "/path/to/another/repo",
    //   description: "Another repository description",
    // },
  ];

  console.log(`Orchestrating across ${repositories.length} repository(ies):\n`);
  repositories.forEach((repo, index) => {
    console.log(`${index + 1}. ${repo.name} - ${repo.description}`);
    console.log(`   Path: ${repo.path}`);
  });

  // Create the orchestrator
  const orchestrator = new MultiRepoOrchestrator(repositories, true);

  try {
    // Initialize sessions for all repositories
    console.log("\n" + "=".repeat(60));
    console.log("Initializing sessions...");
    console.log("=".repeat(60) + "\n");
    
    await orchestrator.initialize();

    // Example 1: Execute a prompt across all repos
    console.log("\n" + "=".repeat(60));
    console.log("Example 1: Code Analysis Across Repositories");
    console.log("=".repeat(60));
    
    await orchestrator.executePromptAcrossRepos(
      "What programming language is this project primarily written in? Provide a brief one-sentence answer."
    );

    // Example 2: Execute a different prompt for a specific repo
    console.log("\n" + "=".repeat(60));
    console.log("Example 2: Specific Repository Query");
    console.log("=".repeat(60));
    
    await orchestrator.executePromptForRepo(
      "cli-acp",
      "List the main files in this project and their purpose in one sentence each."
    );

    console.log("\n✓ Multi-repo orchestration completed successfully!");
  } catch (error) {
    console.error("\n✗ Error:", error);
    process.exitCode = 1;
  } finally {
    // Clean up all sessions
    await orchestrator.cleanup();
  }
}

// Run the example
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exitCode = 1;
});
