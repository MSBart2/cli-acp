import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = dirname(__dirname);
const reportDir = join(repoRoot, ".agentrc", "reports");

mkdirSync(reportDir, { recursive: true });

const command = process.argv[2] ?? "readiness";

function runAgentrc(args, options = {}) {
  const result = spawnSync(
    "npx",
    ["--yes", "github:microsoft/agentrc", ...args],
    {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: options.capture ? "pipe" : "inherit",
      shell: process.platform === "win32",
    },
  );

  if (options.capture) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result;
}

function writeCapturedJson(path, args) {
  const result = runAgentrc([...args, "--json", "--quiet"], { capture: true });
  writeFileSync(path, result.stdout);
  console.log(`Saved ${path}`);
}

switch (command) {
  case "readiness": {
    writeCapturedJson(join(reportDir, "readiness.latest.json"), ["readiness"]);
    runAgentrc([
      "readiness",
      "--visual",
      "--output",
      join(reportDir, "readiness.latest.html"),
      "--force",
      "--quiet",
    ]);
    break;
  }
  case "instructions": {
    runAgentrc(["instructions", "--output", "AGENTS.md", "--force", "--quiet"]);
    break;
  }
  case "mcp": {
    runAgentrc(["generate", "mcp", "--force", "--quiet"]);
    break;
  }
  case "vscode": {
    runAgentrc(["generate", "vscode", "--force", "--quiet"]);
    break;
  }
  case "eval:init": {
    runAgentrc([
      "eval",
      "--init",
      "--count",
      "5",
      "--output",
      "agentrc.eval.json",
      "--quiet",
    ]);
    break;
  }
  case "eval": {
    if (!existsSync(join(repoRoot, "agentrc.eval.json"))) {
      console.error("agentrc.eval.json is missing. Run `npm run agentrc:eval:init` first.");
      process.exit(1);
    }
    writeCapturedJson(join(reportDir, "eval.latest.json"), ["eval", "agentrc.eval.json"]);
    break;
  }
  case "refresh": {
    runAgentrc(["instructions", "--output", "AGENTS.md", "--force", "--quiet"]);
    runAgentrc(["generate", "mcp", "--force", "--quiet"]);
    runAgentrc(["generate", "vscode", "--force", "--quiet"]);
    writeCapturedJson(join(reportDir, "readiness.latest.json"), ["readiness"]);
    runAgentrc([
      "readiness",
      "--visual",
      "--output",
      join(reportDir, "readiness.latest.html"),
      "--force",
      "--quiet",
    ]);
    break;
  }
  default:
    console.error(`Unknown AgentRC harness command: ${command}`);
    process.exit(1);
}
