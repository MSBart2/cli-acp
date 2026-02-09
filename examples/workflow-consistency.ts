import { MultiRepoOrchestrator, Repository } from "../src/orchestrator";

/**
 * Workflow Example: Cross-Repository Consistency Checker
 * 
 * This example demonstrates a practical workflow where you check
 * consistency across multiple repositories. This could be used to:
 * - Verify coding standards are followed
 * - Check documentation consistency
 * - Analyze technology stack alignment
 * - Review security practices
 */

async function main() {
  console.log("=== Cross-Repository Consistency Checker ===\n");
  console.log("This workflow demonstrates checking consistency across repos.\n");

  // Define the repositories to check
  // Replace these with your actual repositories
  const repositories: Repository[] = [
    {
      name: "cli-acp",
      path: process.cwd(),
      description: "CLI-ACP demonstration project",
    },
    // Add more repositories as needed:
    // {
    //   name: "my-api",
    //   path: "/path/to/api",
    //   description: "Backend API service",
    // },
    // {
    //   name: "my-frontend",
    //   path: "/path/to/frontend",
    //   description: "Frontend web application",
    // },
  ];

  const orchestrator = new MultiRepoOrchestrator(repositories, false);

  try {
    console.log("Initializing sessions for all repositories...\n");
    await orchestrator.initialize();

    // Workflow Step 1: Check project structure
    console.log("\n" + "=".repeat(60));
    console.log("STEP 1: Analyzing Project Structure");
    console.log("=".repeat(60));
    
    await orchestrator.executePromptAcrossRepos(
      "List the main directories in this project and briefly describe their purpose."
    );

    // Workflow Step 2: Technology stack
    console.log("\n" + "=".repeat(60));
    console.log("STEP 2: Technology Stack Analysis");
    console.log("=".repeat(60));
    
    await orchestrator.executePromptAcrossRepos(
      "What are the main technologies and frameworks used in this project? List them concisely."
    );

    // Workflow Step 3: Configuration check
    console.log("\n" + "=".repeat(60));
    console.log("STEP 3: Configuration Files");
    console.log("=".repeat(60));
    
    await orchestrator.executePromptAcrossRepos(
      "What configuration files exist in this project (e.g., package.json, tsconfig.json, .env)?"
    );

    // Workflow Step 4: Documentation check
    console.log("\n" + "=".repeat(60));
    console.log("STEP 4: Documentation Review");
    console.log("=".repeat(60));
    
    await orchestrator.executePromptAcrossRepos(
      "Does this project have a README.md? If yes, what are the main sections?"
    );

    console.log("\n" + "=".repeat(60));
    console.log("Workflow completed successfully!");
    console.log("=".repeat(60));
    
    console.log("\n📊 Summary:");
    console.log(`   - Analyzed ${repositories.length} repository(ies)`);
    console.log(`   - Completed 4 consistency checks`);
    console.log(`   - Use the output above to identify inconsistencies`);

  } catch (error) {
    console.error("\n✗ Error:", error);
    process.exitCode = 1;
  } finally {
    await orchestrator.cleanup();
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exitCode = 1;
});
