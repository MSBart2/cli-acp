import { describe, it, expect } from "vitest";
import { mergeAgentSnapshot } from "../agentState";

describe("mergeAgentSnapshot", () => {
  it("hydrates manifest-related fields from the server snapshot", () => {
    const merged = mergeAgentSnapshot(
      {
        output: [{ type: "text", content: "Existing output" }],
        pendingPermission: { title: "Allow?" },
      },
      {
        agentId: "a1",
        repoUrl: "https://github.com/org/repo",
        repoName: "repo",
        status: "ready",
        manifest: { dependsOn: ["lib-a"], dependedBy: [] },
        manifestMissing: false,
        unloadedDeps: [{ repoName: "webapp", direction: "dependedBy" }],
      },
    );

    expect(merged.manifest).toEqual({ dependsOn: ["lib-a"], dependedBy: [] });
    expect(merged.manifestMissing).toBe(false);
    expect(merged.unloadedDeps).toEqual([
      { repoName: "webapp", direction: "dependedBy" },
    ]);
    expect(merged.output).toEqual([{ type: "text", content: "Existing output" }]);
    expect(merged.pendingPermission).toEqual({ title: "Allow?" });
  });

  it("preserves existing manifest state when the snapshot omits those fields", () => {
    const merged = mergeAgentSnapshot(
      {
        manifest: { dependsOn: ["lib-a"], dependedBy: [] },
        manifestMissing: true,
        unloadedDeps: [{ repoName: "webapp", direction: "dependedBy" }],
      },
      {
        agentId: "a1",
        status: "spawning",
        spawnStep: "verifying",
      },
    );

    expect(merged.manifest).toEqual({ dependsOn: ["lib-a"], dependedBy: [] });
    expect(merged.manifestMissing).toBe(true);
    expect(merged.unloadedDeps).toEqual([
      { repoName: "webapp", direction: "dependedBy" },
    ]);
    expect(merged.spawnStep).toBe("verifying");
  });

  it("allows explicit false and empty values to replace stale client state", () => {
    const merged = mergeAgentSnapshot(
      {
        manifestMissing: true,
        unloadedDeps: [{ repoName: "old", direction: "dependsOn" }],
      },
      {
        agentId: "a1",
        manifest: null,
        manifestMissing: false,
        unloadedDeps: [],
      },
    );

    expect(merged.manifestMissing).toBe(false);
    expect(merged.unloadedDeps).toEqual([]);
  });
});
