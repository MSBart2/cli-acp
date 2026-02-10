/**
 * teardown.js — Kill any processes holding ports used by the ACP Orchestrator.
 *
 * Frees up port 3001 (Express server) and 5173 (Vite dev server) so a fresh
 * `npm run dev` can bind without EADDRINUSE errors.
 *
 * Usage:  npm run teardown        (from webapp/)
 *         node scripts/teardown.js
 */

import { execSync } from "node:child_process";

const PORTS = [3001, 5173];

/**
 * Find and kill processes listening on the given port.
 * Uses platform-specific commands (Windows vs Unix).
 * @param {number} port
 */
function freePort(port) {
  const isWindows = process.platform === "win32";

  try {
    if (isWindows) {
      // netstat returns lines like:   TCP  0.0.0.0:3001  0.0.0.0:0  LISTENING  12345
      const output = execSync(
        `netstat -ano | findstr :${port} | findstr LISTENING`,
        {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      // Extract unique PIDs from the last column of each matching line
      const pids = [
        ...new Set(
          output
            .split("\n")
            .map((line) => line.trim().split(/\s+/).pop())
            .filter((pid) => pid && /^\d+$/.test(pid)),
        ),
      ];

      for (const pid of pids) {
        console.log(`  Killing PID ${pid} on port ${port}`);
        try {
          execSync(`taskkill /PID ${pid} /F /T`, { stdio: "ignore" });
        } catch {
          // Process may have already exited — that's fine
        }
      }

      if (pids.length === 0) {
        console.log(`  Port ${port} is already free`);
      }
    } else {
      // Unix: lsof returns lines like:  node  12345  user  22u  IPv4  ...
      const output = execSync(`lsof -ti :${port}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      const pids = output.trim().split("\n").filter(Boolean);

      for (const pid of pids) {
        console.log(`  Killing PID ${pid} on port ${port}`);
        try {
          execSync(`kill -9 ${pid}`, { stdio: "ignore" });
        } catch {
          // Process may have already exited
        }
      }
    }
  } catch {
    // Command returned non-zero — no process on that port
    console.log(`  Port ${port} is already free`);
  }
}

console.log("Tearing down ACP Orchestrator...\n");

for (const port of PORTS) {
  console.log(`Port ${port}:`);
  freePort(port);
}

console.log("\nDone — ports are free.");
