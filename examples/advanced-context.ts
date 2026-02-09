import { ACPClient } from "../src/acp-client";

/**
 * Advanced Example: Interactive Session with Multiple Prompts
 * 
 * This example demonstrates:
 * - Maintaining context across multiple prompts in a single session
 * - Building on previous responses
 * - More complex conversational flows
 */

async function main() {
  console.log("=== Advanced: Contextual Conversation Example ===\n");
  
  const client = new ACPClient({ verbose: false });

  try {
    console.log("Initializing ACP client and creating session...\n");
    await client.initialize();
    
    const sessionId = await client.createSession({
      cwd: process.cwd(),
    });

    // First prompt: Get information about the project
    console.log("=".repeat(60));
    console.log("PROMPT 1: Initial Analysis");
    console.log("=".repeat(60));
    console.log("Q: What files are in this project?\n");
    
    await client.sendPrompt(
      sessionId,
      "List the main files in this project directory."
    );

    // Wait a moment between prompts
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Second prompt: Follow-up question (context is maintained)
    console.log("\n" + "=".repeat(60));
    console.log("PROMPT 2: Follow-up Question");
    console.log("=".repeat(60));
    console.log("Q: Tell me more about the TypeScript files\n");
    
    await client.sendPrompt(
      sessionId,
      "Can you explain what the TypeScript files you just mentioned are for?"
    );

    // Third prompt: Deeper analysis
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    console.log("\n" + "=".repeat(60));
    console.log("PROMPT 3: Code Analysis");
    console.log("=".repeat(60));
    console.log("Q: Analyze the architecture\n");
    
    await client.sendPrompt(
      sessionId,
      "Based on the files we discussed, what is the overall architecture pattern used?"
    );

    console.log("\n" + "=".repeat(60));
    console.log("✓ Contextual conversation completed!");
    console.log("=".repeat(60));
    
    console.log("\n💡 Key Takeaway:");
    console.log("   The session maintains context across multiple prompts,");
    console.log("   allowing for natural follow-up questions and deeper analysis.");

  } catch (error) {
    console.error("\n✗ Error:", error);
    process.exitCode = 1;
  } finally {
    await client.cleanup();
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exitCode = 1;
});
