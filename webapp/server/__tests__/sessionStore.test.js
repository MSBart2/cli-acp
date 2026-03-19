import { describe, it, expect, beforeEach, vi } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";

// vi.hoisted ensures these are available inside the vi.mock() factory,
// which is hoisted to the top of the module before imports are evaluated.
const { memDirs, memFiles } = vi.hoisted(() => ({
  memDirs: new Set(),
  // filePath -> { content: string, mtime: Date }
  memFiles: new Map(),
}));

vi.mock("node:fs", () => ({
  existsSync: (p) => memDirs.has(p) || memFiles.has(p),
  mkdirSync: (p) => { memDirs.add(p); },
  // Return only the basename of files directly inside `dir`
  readdirSync: (dir) => {
    const prefix1 = dir + "/";
    const prefix2 = dir + "\\";
    const names = [];
    for (const key of memFiles.keys()) {
      let rel = null;
      if (key.startsWith(prefix1)) rel = key.slice(prefix1.length);
      else if (key.startsWith(prefix2)) rel = key.slice(prefix2.length);
      // Only immediate children (no nested separators)
      if (rel !== null && !rel.includes("/") && !rel.includes("\\")) {
        names.push(rel);
      }
    }
    return names;
  },
  readFileSync: (p) => {
    if (!memFiles.has(p)) {
      const err = new Error(`ENOENT: no such file or directory, open '${p}'`);
      err.code = "ENOENT";
      throw err;
    }
    return memFiles.get(p).content;
  },
  writeFileSync: (p, content) => {
    memFiles.set(p, { content, mtime: new Date() });
  },
  unlinkSync: (p) => {
    if (!memFiles.has(p)) {
      const err = new Error(`ENOENT: no such file or directory, unlink '${p}'`);
      err.code = "ENOENT";
      throw err;
    }
    memFiles.delete(p);
  },
  statSync: (p) => {
    if (!memFiles.has(p)) {
      const err = new Error(`ENOENT: no such file or directory, stat '${p}'`);
      err.code = "ENOENT";
      throw err;
    }
    const { content, mtime } = memFiles.get(p);
    return { mtime, size: content.length };
  },
}));

// Import the module under test AFTER mocks are registered
import * as fsMod from "node:fs";
import {
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
  purgeOldSessions,
  getRestorableAgents,
} from "../sessionStore.js";

const SESSIONS_DIR = join(homedir(), ".acp-orchestrator", "sessions");

// Bypass ensureSessionDir by seeding files directly into the in-memory store
function seedFile(filename, content, mtime = new Date()) {
  memDirs.add(SESSIONS_DIR);
  memFiles.set(join(SESSIONS_DIR, filename), { content, mtime });
}

function makeSessionData(agentOverrides = {}) {
  return {
    repoBaseDir: "C:\\repos",
    reuseExisting: true,
    agents: new Map([
      [
        "agent-1",
        {
          repoUrl: "https://github.com/org/repo-a",
          repoName: "repo-a",
          repoPath: "/tmp/acp-repos/repo-a",
          repoReused: false,
          model: "gpt-5.4",
          role: "worker",
          manifest: { role: "api", techStack: ["node"] },
          manifestMissing: false,
          ...agentOverrides,
        },
      ],
    ]),
    workItems: new Map([
      ["wi-1", { url: "https://github.com/org/repo-a/issues/1", type: "issue", number: 1 }],
    ]),
    broadcastHistory: [{ prompt: "Audit docs", responses: [] }],
  };
}

beforeEach(() => {
  memDirs.clear();
  memFiles.clear();
});

// ---------------------------------------------------------------------------
// saveSession
// ---------------------------------------------------------------------------

describe("saveSession", () => {
  it("creates a file with the correct JSON structure", () => {
    const result = saveSession("my-session", makeSessionData());

    expect(result.success).toBe(true);

    const filePath = join(SESSIONS_DIR, "my-session.json");
    expect(memFiles.has(filePath)).toBe(true);

    const saved = JSON.parse(memFiles.get(filePath).content);
    expect(saved.version).toBe(1);
    expect(saved.name).toBe("my-session");
    expect(saved).toHaveProperty("createdAt");
    expect(saved).toHaveProperty("savedAt");
    expect(saved.settings).toEqual({
      repoBaseDir: "C:\\repos",
      reuseExisting: true,
    });
    // agents: serialised from Map entries
    expect(Array.isArray(saved.agents)).toBe(true);
    expect(saved.agents).toHaveLength(1);
    expect(saved.agents[0].id).toBe("agent-1");
    expect(saved.agents[0].repoUrl).toBe("https://github.com/org/repo-a");
    expect(saved.agents[0].repoName).toBe("repo-a");
    expect(saved.agents[0].model).toBe("gpt-5.4");
    expect(saved.agents[0].role).toBe("worker");
    // workItems / broadcastHistory
    expect(Array.isArray(saved.workItems)).toBe(true);
    expect(saved.workItems).toHaveLength(1);
    expect(Array.isArray(saved.broadcastHistory)).toBe(true);
    expect(saved.broadcastHistory).toHaveLength(1);
  });

  it("does not persist non-serializable agent fields", () => {
    const data = makeSessionData({
      process: { pid: 123 },
      connection: { socket: {} },
      permissionResolver: () => {},
      heartbeat: 42,
    });

    saveSession("clean-session", data);

    const filePath = join(SESSIONS_DIR, "clean-session.json");
    const saved = JSON.parse(memFiles.get(filePath).content);
    const agent = saved.agents[0];

    expect(agent).not.toHaveProperty("process");
    expect(agent).not.toHaveProperty("connection");
    expect(agent).not.toHaveProperty("permissionResolver");
    expect(agent).not.toHaveProperty("heartbeat");
  });

  it("preserves original createdAt on overwrite", () => {
    const data = makeSessionData();
    saveSession("persist-session", data);

    const filePath = join(SESSIONS_DIR, "persist-session.json");
    const { createdAt: originalCreatedAt } = JSON.parse(memFiles.get(filePath).content);

    // Overwrite the same session — createdAt must not change
    saveSession("persist-session", data);

    const { createdAt: secondCreatedAt } = JSON.parse(memFiles.get(filePath).content);
    expect(secondCreatedAt).toBe(originalCreatedAt);
  });

  it("returns { success: true, path } on success and { success: false, error } on write failure", () => {
    const ok = saveSession("ok-session", makeSessionData());
    expect(ok.success).toBe(true);
    expect(ok.path).toContain("ok-session.json");

    // Temporarily make writeFileSync throw to exercise the catch branch
    const spy = vi.spyOn(fsMod, "writeFileSync").mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    const fail = saveSession("fail-session", makeSessionData());
    expect(fail.success).toBe(false);
    expect(fail.error).toBe("disk full");
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// loadSession
// ---------------------------------------------------------------------------

describe("loadSession", () => {
  it("returns { success: true, data } for an existing session", () => {
    const payload = {
      version: 1,
      name: "loaded",
      settings: { repoBaseDir: "C:\\restored", reuseExisting: false },
      agents: [],
      workItems: [],
      broadcastHistory: [],
    };
    seedFile("loaded.json", JSON.stringify(payload));

    const result = loadSession("loaded");
    expect(result.success).toBe(true);
    expect(result.data.name).toBe("loaded");
    expect(result.data.version).toBe(1);
    expect(result.data.settings).toEqual({
      repoBaseDir: "C:\\restored",
      reuseExisting: false,
    });
  });

  it("accepts a name with .json suffix without doubling the extension", () => {
    const payload = { version: 1, name: "suffixed", agents: [] };
    seedFile("suffixed.json", JSON.stringify(payload));

    const result = loadSession("suffixed.json");
    expect(result.success).toBe(true);
    expect(result.data.name).toBe("suffixed");
  });

  it("returns { success: false, error } for a missing session", () => {
    const result = loadSession("does-not-exist");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it("returns { success: false, error } for a file containing invalid JSON", () => {
    seedFile("bad.json", "{ this is: not valid JSON }}}");

    const result = loadSession("bad");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("getRestorableAgents", () => {
  it("prefers the saved agents array when present", () => {
    const savedAgents = [{ id: "agent-1", repoUrl: "https://github.com/org/repo-a", repoName: "repo-a" }];

    expect(getRestorableAgents({ agents: savedAgents, broadcastHistory: [] })).toEqual(savedAgents);
  });

  it("recovers the orchestrator from local repo metadata when the saved agents array was wiped", () => {
    const repoPath = join("C:\\repos", "Animalia");
    memDirs.add(repoPath);
    memDirs.add(join(repoPath, ".git"));
    memFiles.set(join(repoPath, ".git", "config"), {
      content: [
        "[core]",
        "repositoryformatversion = 0",
        "[remote \"origin\"]",
        "url = https://github.com/org/Animalia.git",
      ].join("\n"),
      mtime: new Date(),
    });

    const recovered = getRestorableAgents({
      name: "Animalia-2026-03-18",
      settings: { repoBaseDir: "C:\\repos" },
      agents: [],
      broadcastHistory: [],
    });

    expect(recovered).toEqual([
      {
        id: "recovered-orchestrator-animalia",
        repoUrl: "https://github.com/org/Animalia.git",
        repoName: "Animalia",
        repoPath,
        repoReused: true,
        model: null,
        role: "orchestrator",
        manifest: null,
        manifestMissing: false,
        recoveredFromHistory: true,
      },
    ]);
  });

  it("recovers unique worker agents from broadcast history when saved agents are missing", () => {
    const recovered = getRestorableAgents({
      agents: [],
      broadcastHistory: [
        {
          results: [
            {
              agentId: "worker-1",
              repoUrl: "https://github.com/org/repo-a",
              repoName: "repo-a",
            },
            {
              agentId: "worker-1",
              repoUrl: "https://github.com/org/repo-a",
              repoName: "repo-a",
            },
            {
              agentId: "worker-2",
              repoUrl: "https://github.com/org/repo-b",
              repoName: "repo-b",
            },
          ],
        },
      ],
    });

    expect(recovered).toEqual([
      {
        id: "worker-1",
        repoUrl: "https://github.com/org/repo-a",
        repoName: "repo-a",
        repoPath: null,
        repoReused: true,
        model: null,
        role: "worker",
        manifest: null,
        manifestMissing: false,
        recoveredFromHistory: true,
      },
      {
        id: "worker-2",
        repoUrl: "https://github.com/org/repo-b",
        repoName: "repo-b",
        repoPath: null,
        repoReused: true,
        model: null,
        role: "worker",
        manifest: null,
        manifestMissing: false,
        recoveredFromHistory: true,
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// listSessions
// ---------------------------------------------------------------------------

describe("listSessions", () => {
  it("returns sessions sorted by updatedAt descending (newest first)", () => {
    const older = new Date("2024-01-01T10:00:00Z");
    const newer = new Date("2024-06-01T10:00:00Z");
    const payload = JSON.stringify({ agents: [], workItems: [], broadcastHistory: [] });
    seedFile("alpha.json", payload, older);
    seedFile("beta.json", payload, newer);

    const sessions = listSessions();
    expect(sessions[0].id).toBe("beta");
    expect(sessions[1].id).toBe("alpha");
  });

  it("counts recovered history agents in the session summary", () => {
    seedFile("history-only.json", JSON.stringify({
      agents: [],
      workItems: [],
      broadcastHistory: [
        {
          results: [
            {
              agentId: "worker-1",
              repoUrl: "https://github.com/org/repo-a",
              repoName: "repo-a",
            },
          ],
        },
      ],
    }));

    const sessions = listSessions();
    expect(sessions[0].summary.agentCount).toBe(1);
  });

  it("counts a recovered orchestrator in the session summary", () => {
    const repoPath = join("C:\\repos", "Animalia");
    memDirs.add(repoPath);
    memDirs.add(join(repoPath, ".git"));
    memFiles.set(join(repoPath, ".git", "config"), {
      content: [
        "[remote \"origin\"]",
        "url = https://github.com/org/Animalia.git",
      ].join("\n"),
      mtime: new Date(),
    });

    seedFile("Animalia-2026-03-18.json", JSON.stringify({
      name: "Animalia-2026-03-18",
      settings: { repoBaseDir: "C:\\repos" },
      agents: [],
      workItems: [],
      broadcastHistory: [],
    }));

    const sessions = listSessions();
    const restored = sessions.find((session) => session.id === "Animalia-2026-03-18");
    expect(restored.summary.agentCount).toBe(1);
  });

  it("includes correct summary counts for agentCount, workItemCount, broadcastCount", () => {
    const payload = {
      agents: [{ id: "a1" }, { id: "a2" }],
      workItems: [{ url: "x" }],
      broadcastHistory: [{ prompt: "p1" }, { prompt: "p2" }, { prompt: "p3" }],
    };
    seedFile("counts.json", JSON.stringify(payload));

    const sessions = listSessions();
    const s = sessions.find((s) => s.id === "counts");
    expect(s).toBeDefined();
    expect(s.summary.agentCount).toBe(2);
    expect(s.summary.workItemCount).toBe(1);
    expect(s.summary.broadcastCount).toBe(3);
  });

  it("returns empty array when no session files exist", () => {
    // memFiles is empty; SESSIONS_DIR has not been seeded
    const sessions = listSessions();
    expect(sessions).toEqual([]);
  });

  it("includes id, name, updatedAt, and size on each entry", () => {
    seedFile("meta.json", JSON.stringify({ agents: [], workItems: [], broadcastHistory: [] }));

    const sessions = listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toHaveProperty("id", "meta");
    expect(sessions[0]).toHaveProperty("name", "meta");
    expect(sessions[0]).toHaveProperty("updatedAt");
    expect(sessions[0]).toHaveProperty("size");
    expect(typeof sessions[0].size).toBe("number");
  });

  it("uses zero counts when session file has missing or malformed summary fields", () => {
    // Seed a file that is missing agents/workItems/broadcastHistory
    seedFile("sparse.json", JSON.stringify({ version: 1 }));

    const sessions = listSessions();
    const s = sessions.find((s) => s.id === "sparse");
    expect(s.summary).toEqual({ agentCount: 0, workItemCount: 0, broadcastCount: 0 });
  });
});

// ---------------------------------------------------------------------------
// deleteSession
// ---------------------------------------------------------------------------

describe("deleteSession", () => {
  it("removes the file from the store and returns { success: true }", () => {
    seedFile("to-delete.json", "{}");
    const filePath = join(SESSIONS_DIR, "to-delete.json");
    expect(memFiles.has(filePath)).toBe(true);

    const result = deleteSession("to-delete");
    expect(result.success).toBe(true);
    expect(memFiles.has(filePath)).toBe(false);
  });

  it("accepts a .json-suffixed name without error", () => {
    seedFile("to-delete2.json", "{}");

    const result = deleteSession("to-delete2.json");
    expect(result.success).toBe(true);
    expect(memFiles.has(join(SESSIONS_DIR, "to-delete2.json"))).toBe(false);
  });

  it("returns { success: false, error } when the file does not exist", () => {
    const result = deleteSession("ghost-session");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// purgeOldSessions
// ---------------------------------------------------------------------------

describe("purgeOldSessions", () => {
  it("keeps only the N newest sessions and deletes the rest", () => {
    // Seed 5 sessions with clearly staggered timestamps (Jan 1 = oldest, Jan 5 = newest)
    for (let i = 0; i < 5; i++) {
      const mtime = new Date(2024, 0, i + 1);
      seedFile(`session-${i}.json`, JSON.stringify({ name: `session-${i}` }), mtime);
    }

    purgeOldSessions(3);

    const remaining = [...memFiles.keys()].map((k) => k.split(/[/\\]/).pop());
    expect(remaining).toHaveLength(3);
    // The 3 newest (indices 4, 3, 2) should survive
    expect(remaining).toContain("session-4.json");
    expect(remaining).toContain("session-3.json");
    expect(remaining).toContain("session-2.json");
    // The 2 oldest should be gone
    expect(remaining).not.toContain("session-0.json");
    expect(remaining).not.toContain("session-1.json");
  });

  it("does nothing when the number of sessions is within the limit", () => {
    seedFile("a.json", "{}");
    seedFile("b.json", "{}");

    purgeOldSessions(10);

    expect(memFiles.size).toBe(2);
  });

  it("deletes all sessions when maxSessions is 0", () => {
    seedFile("x.json", "{}");
    seedFile("y.json", "{}");

    purgeOldSessions(0);

    expect(memFiles.size).toBe(0);
  });
});
