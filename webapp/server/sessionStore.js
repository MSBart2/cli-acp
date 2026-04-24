import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { consoleLogger } from "./logger.js";

// Store sessions in ~/.acp-orchestrator/sessions
const SESSIONS_DIR = join(homedir(), ".acp-orchestrator", "sessions");
const console = consoleLogger;

export function ensureSessionDir() {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function inferOrchestratorRepoName(sessionName) {
  const match = /^(.+)-\d{4}-\d{2}-\d{2}$/.exec(sessionName || "");
  return match?.[1] ?? null;
}

function readOriginUrl(repoPath) {
  const gitConfigPath = join(repoPath, ".git", "config");
  if (!existsSync(gitConfigPath)) return null;

  const configText = readFileSync(gitConfigPath, "utf-8");
  const remoteOriginBlock =
    /\[remote\s+"origin"\]([\s\S]*?)(?:\n\[|$)/i.exec(configText)?.[1] ?? "";
  const urlMatch = /^\s*url\s*=\s*(.+)\s*$/im.exec(remoteOriginBlock);
  return urlMatch?.[1]?.trim() ?? null;
}

function recoverOrchestratorAgent(data) {
  const repoBaseDir = data?.settings?.repoBaseDir;
  const repoName = inferOrchestratorRepoName(data?.name);
  if (!repoBaseDir || !repoName) return null;

  const repoPath = join(repoBaseDir, repoName);
  if (!existsSync(repoPath)) return null;

  const repoUrl = readOriginUrl(repoPath);
  if (!repoUrl) return null;

  return {
    id: `recovered-orchestrator-${repoName.toLowerCase()}`,
    repoUrl,
    repoName,
    repoPath,
    repoReused: true,
    model: null,
    role: "orchestrator",
    manifest: null,
    manifestMissing: false,
    recoveredFromHistory: true,
  };
}

/**
 * Returns the best available set of restorable agents for a saved session.
 * Falls back to unique agent identities found in broadcast history when the
 * saved `agents` array has already been wiped by an older buggy autosave path.
 *
 * @param {object} data
 * @returns {Array<object>}
 */
export function getRestorableAgents(data) {
  if (Array.isArray(data?.agents) && data.agents.length > 0) {
    return data.agents;
  }

  const recovered = [];
  const seen = new Set();

  const recoveredOrchestrator = recoverOrchestratorAgent(data);
  if (recoveredOrchestrator) {
    recovered.push(recoveredOrchestrator);
    seen.add(recoveredOrchestrator.id);
  }

  for (const entry of data?.broadcastHistory || []) {
    for (const result of entry?.results || []) {
      if (!result?.agentId || !result?.repoUrl || !result?.repoName) continue;
      if (seen.has(result.agentId)) continue;
      seen.add(result.agentId);
      recovered.push({
        id: result.agentId,
        repoUrl: result.repoUrl,
        repoName: result.repoName,
        repoPath: null,
        repoReused: true,
        model: null,
        role: "worker",
        manifest: null,
        manifestMissing: false,
        recoveredFromHistory: true,
      });
    }
  }

  return recovered;
}

export function listSessions() {
  ensureSessionDir();
  try {
    const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith(".json"));
    return files.map(f => {
      const filePath = join(SESSIONS_DIR, f);
      const stats = statSync(filePath);

      // Read file to extract summary counts
      let summary = { agentCount: 0, workItemCount: 0, broadcastCount: 0 };
      try {
        const raw = readFileSync(filePath, "utf-8");
        const data = JSON.parse(raw);
        const restorableAgents = getRestorableAgents(data);
        summary = {
          agentCount: restorableAgents.length,
          workItemCount: Array.isArray(data.workItems) ? data.workItems.length : 0,
          broadcastCount: Array.isArray(data.broadcastHistory) ? data.broadcastHistory.length : 0,
        };
      } catch {
        // Unreadable or corrupt file — leave summary at defaults
      }

      return {
        id: f.replace(".json", ""),
        name: f.replace(".json", ""),
        updatedAt: stats.mtime.toISOString(),
        size: stats.size,
        summary,
      };
    }).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  } catch (err) {
    console.error("[sessionStore] Failed to list sessions:", err);
    return [];
  }
}

export function saveSession(name, data) {
  ensureSessionDir();
  const filename = `${name}.json`;
  const filePath = join(SESSIONS_DIR, filename);

  // Preserve original createdAt if the file already exists
  let createdAt = new Date().toISOString();
  if (existsSync(filePath)) {
    try {
      const existing = JSON.parse(readFileSync(filePath, "utf-8"));
      if (existing.createdAt) createdAt = existing.createdAt;
    } catch {
      // Corrupt existing file — use current time as createdAt
    }
  }

  const serialized = {
    version: 1,
    name,
    createdAt,
    savedAt: new Date().toISOString(),
    settings: {
      repoBaseDir: data.repoBaseDir ?? null,
      reuseExisting:
        typeof data.reuseExisting === "boolean" ? data.reuseExisting : null,
    },
    agents: Array.from(data.agents.entries()).map(([id, a]) => ({
      id,
      repoUrl: a.repoUrl,
      repoName: a.repoName,
      repoPath: a.repoPath,
      repoReused: a.repoReused,
      model: a.model ?? null,
      role: a.role,
      manifest: a.manifest,
      manifestMissing: a.manifestMissing,
      // Structured event log — all sessionUpdate events received during this session
      eventLog: a.eventLog ?? [],
    })),
    workItems: Array.from(data.workItems.values()),
    broadcastHistory: data.broadcastHistory
  };

  try {
    writeFileSync(filePath, JSON.stringify(serialized, null, 2));
    console.log(`[sessionStore] Saved session '${name}' to ${filePath}`);
    return { success: true, path: filePath };
  } catch (err) {
    console.error(`[sessionStore] Failed to save session '${name}':`, err);
    return { success: false, error: err.message };
  }
}

export function loadSession(name) {
  ensureSessionDir();
  const filename = name.endsWith(".json") ? name : `${name}.json`;
  const filePath = join(SESSIONS_DIR, filename);

  try {
    if (!existsSync(filePath)) {
      throw new Error(`Session file not found: ${filePath}`);
    }
    const raw = readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    return { success: true, data };
  } catch (err) {
    console.error(`[sessionStore] Failed to load session '${name}':`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Deletes a saved session file by name.
 * @param {string} name - Session name (without .json extension)
 * @returns {{ success: boolean, error?: string }}
 */
export function deleteSession(name) {
  ensureSessionDir();
  const filename = name.endsWith(".json") ? name : `${name}.json`;
  const filePath = join(SESSIONS_DIR, filename);

  try {
    if (!existsSync(filePath)) {
      throw new Error(`Session file not found: ${filePath}`);
    }
    unlinkSync(filePath);
    console.log(`[sessionStore] Deleted session '${name}'`);
    return { success: true };
  } catch (err) {
    console.error(`[sessionStore] Failed to delete session '${name}':`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Keeps only the N most recently modified session files, deleting the rest.
 * @param {number} [maxSessions=25] - Maximum number of sessions to retain
 */
export function purgeOldSessions(maxSessions = 25) {
  ensureSessionDir();
  try {
    const files = readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith(".json"))
      .map(f => {
        const filePath = join(SESSIONS_DIR, f);
        return { name: f, filePath, mtime: statSync(filePath).mtime };
      })
      .sort((a, b) => b.mtime - a.mtime); // newest first

    const toDelete = files.slice(maxSessions);
    for (const { name, filePath } of toDelete) {
      try {
        unlinkSync(filePath);
        console.log(`[sessionStore] Purged old session: ${name}`);
      } catch (err) {
        console.error(`[sessionStore] Failed to purge session '${name}':`, err);
      }
    }
  } catch (err) {
    console.error("[sessionStore] Failed to purge old sessions:", err);
  }
}
