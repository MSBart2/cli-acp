import { ACPClient } from "../src/acp-client";

/**
 * Simple example demonstrating basic ACP interaction
 * 
 * This script shows how to:
 * 1. Initialize an ACP client
 * 2. Create a session
 * 3. Send a prompt
 * 4. Handle the response
 * 5. Clean up resources
 */

async function main() {
  // Create an ACP client with verbose logging
  const client = new ACPClient({ verbose: true });

  try {
    console.log("=== Simple ACP Prompt Example ===\n");

    // Initialize the client (spawns copilot process)
    await client.initialize();

    // Create a new session
    const sessionId = await client.createSession({
      cwd: process.cwd(),
    });

    console.log("\nSession started!");
    console.log("Sending prompt...\n");

    // Send a simple prompt
    const promptText = "What is the Agent Communication Protocol (ACP)?";
    console.log(`Prompt: "${promptText}"\n`);
    console.log("Response:");
    console.log("-".repeat(60));

    await client.sendPrompt(sessionId, promptText);

    console.log("\n" + "-".repeat(60));
    console.log("\n✓ Example completed successfully!");
  } catch (error) {
    console.error("\n✗ Error:", error);
    process.exitCode = 1;
  } finally {
    // Always clean up resources
    await client.cleanup();
  }
}

// Run the example
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exitCode = 1;
});
