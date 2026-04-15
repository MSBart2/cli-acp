import { describe, it, expect } from "vitest";
import { isValidGitUrl, repoNameFromUrl, extractWorkItems, buildDependencyGraph, getGraphRelationships, inferManifestRelationships, parseRoutingPlan, buildMissionPrefix, buildCrossRepoContext, enrichPromptText, buildSynthesisPrompt } from "../helpers.js";

// ---------------------------------------------------------------------------
// isValidGitUrl
// ---------------------------------------------------------------------------

describe("isValidGitUrl", () => {
  // -- Valid URLs ----------------------------------------------------------

  it("accepts a standard GitHub HTTPS URL", () => {
    expect(isValidGitUrl("https://github.com/owner/repo")).toBe(true);
  });

  it("accepts a GitHub URL with .git suffix", () => {
    expect(isValidGitUrl("https://github.com/owner/repo.git")).toBe(true);
  });

  it("accepts a GitLab URL", () => {
    expect(isValidGitUrl("https://gitlab.com/group/project")).toBe(true);
  });

  it("accepts a Bitbucket URL", () => {
    expect(isValidGitUrl("https://bitbucket.org/team/repo")).toBe(true);
  });

  it("accepts an Azure DevOps URL", () => {
    expect(isValidGitUrl("https://dev.azure.com/org/project")).toBe(true);
  });

  it("accepts a URL with dots, underscores, and hyphens in segments", () => {
    expect(isValidGitUrl("https://github.com/my-org/my_repo.v2")).toBe(true);
  });

  it("accepts a URL with nested path segments (e.g. Azure DevOps)", () => {
    expect(isValidGitUrl("https://dev.azure.com/org/project/repo")).toBe(true);
  });

  // -- Invalid URLs --------------------------------------------------------

  it("rejects HTTP (non-HTTPS) URLs", () => {
    expect(isValidGitUrl("http://github.com/owner/repo")).toBe(false);
  });

  it("rejects SSH URLs", () => {
    expect(isValidGitUrl("git@github.com:owner/repo.git")).toBe(false);
  });

  it("rejects URLs from unknown hosts", () => {
    expect(isValidGitUrl("https://example.com/owner/repo")).toBe(false);
  });

  it("rejects URLs with only an org (no repo)", () => {
    expect(isValidGitUrl("https://github.com/owner")).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(isValidGitUrl("")).toBe(false);
  });

  it("rejects URLs with query strings", () => {
    expect(isValidGitUrl("https://github.com/owner/repo?ref=main")).toBe(false);
  });

  it("rejects URLs with fragments", () => {
    expect(isValidGitUrl("https://github.com/owner/repo#readme")).toBe(false);
  });

  it("rejects URLs with trailing slashes", () => {
    expect(isValidGitUrl("https://github.com/owner/repo/")).toBe(false);
  });

  it("rejects path-traversal attempts", () => {
    expect(isValidGitUrl("https://github.com/owner/../etc/passwd")).toBe(false);
  });

  it("rejects URLs with spaces", () => {
    expect(isValidGitUrl("https://github.com/owner/my repo")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// repoNameFromUrl
// ---------------------------------------------------------------------------

describe("repoNameFromUrl", () => {
  it("extracts the repo name from a GitHub URL", () => {
    expect(repoNameFromUrl("https://github.com/owner/my-repo")).toBe("my-repo");
  });

  it("strips .git suffix", () => {
    expect(repoNameFromUrl("https://github.com/owner/my-repo.git")).toBe(
      "my-repo",
    );
  });

  it("preserves dots and underscores", () => {
    expect(repoNameFromUrl("https://github.com/owner/my_repo.v2")).toBe(
      "my_repo.v2",
    );
  });

  it("sanitises special characters to prevent path traversal", () => {
    // If someone bypasses URL validation, the name should still be safe
    expect(repoNameFromUrl("https://github.com/owner/../../etc")).toBe("etc");
  });

  it("handles a bare repo name", () => {
    expect(repoNameFromUrl("simple-repo")).toBe("simple-repo");
  });
});

// ---------------------------------------------------------------------------
// extractWorkItems
// ---------------------------------------------------------------------------

describe("extractWorkItems", () => {
  it("extracts a GitHub issue URL from text", () => {
    const text = "Created issue https://github.com/myorg/api-gateway/issues/12";
    const items = extractWorkItems(text);
    expect(items).toEqual([
      {
        url: "https://github.com/myorg/api-gateway/issues/12",
        owner: "myorg",
        repo: "api-gateway",
        type: "issue",
        number: 12,
      },
    ]);
  });

  it("extracts a GitHub PR URL from text", () => {
    const text = "PR: https://github.com/myorg/billing-service/pull/17";
    const items = extractWorkItems(text);
    expect(items).toEqual([
      {
        url: "https://github.com/myorg/billing-service/pull/17",
        owner: "myorg",
        repo: "billing-service",
        type: "pr",
        number: 17,
      },
    ]);
  });

  it("extracts multiple URLs from the same text", () => {
    const text =
      "Issue: https://github.com/myorg/repo-a/issues/1\n" +
      "PR: https://github.com/myorg/repo-b/pull/42";
    const items = extractWorkItems(text);
    expect(items).toHaveLength(2);
    expect(items[0].type).toBe("issue");
    expect(items[1].type).toBe("pr");
  });

  it("deduplicates the same URL appearing twice", () => {
    const text =
      "See https://github.com/o/r/issues/5 and https://github.com/o/r/issues/5 again";
    const items = extractWorkItems(text);
    expect(items).toHaveLength(1);
  });

  it("returns empty array for text with no URLs", () => {
    expect(extractWorkItems("Hello world, no links here")).toEqual([]);
  });

  it("returns empty array for null/undefined input", () => {
    expect(extractWorkItems(null)).toEqual([]);
    expect(extractWorkItems(undefined)).toEqual([]);
    expect(extractWorkItems("")).toEqual([]);
  });

  it("ignores non-GitHub/GitLab/Bitbucket URLs", () => {
    const text = "Link: https://example.com/owner/repo/issues/1";
    expect(extractWorkItems(text)).toEqual([]);
  });

  it("extracts GitLab issue URLs", () => {
    const text = "See https://gitlab.com/team/project/issues/8";
    const items = extractWorkItems(text);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("issue");
    expect(items[0].number).toBe(8);
  });

  it("extracts mixed PRs and issues across hosts", () => {
    const text =
      "GitHub: https://github.com/org/repo/pull/3\n" +
      "Bitbucket: https://bitbucket.org/team/proj/issues/7";
    const items = extractWorkItems(text);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ type: "pr", number: 3 });
    expect(items[1]).toMatchObject({ type: "issue", number: 7 });
  });
});

// ---------------------------------------------------------------------------
// buildDependencyGraph
// ---------------------------------------------------------------------------

describe("buildDependencyGraph", () => {
  // Helper to build a test agents Map
  function makeAgents(list) {
    const map = new Map();
    for (const a of list) {
      map.set(a.agentId, {
        agentId: a.agentId,
        repoName: a.repoName,
        manifest: a.manifest ?? null,
        manifestMissing: a.manifestMissing ?? false,
        ...a,
      });
    }
    return map;
  }

  it("returns empty graph when no agents have manifests", () => {
    const agents = makeAgents([
      { agentId: "agent-1", repoName: "repo-a", manifest: null },
      { agentId: "agent-2", repoName: "repo-b", manifest: null },
    ]);
    const result = buildDependencyGraph(agents);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.unloadedDeps).toEqual([]);
  });

  it("builds a node for each agent with a manifest", () => {
    const agents = makeAgents([
      {
        agentId: "lib-agent",
        repoName: "class-lib-a",
        manifest: { role: "library", techStack: ["java"] },
      },
      {
        agentId: "api-agent",
        repoName: "api-gateway",
        manifest: { role: "api", techStack: ["node"] },
      },
    ]);
    const { nodes } = buildDependencyGraph(agents);
    expect(nodes).toHaveLength(2);
    const lib = nodes.find((n) => n.agentId === "lib-agent");
    const api = nodes.find((n) => n.agentId === "api-agent");
    expect(lib).toMatchObject({ agentId: "lib-agent", repoName: "class-lib-a", role: "library", techStack: ["java"] });
    expect(api).toMatchObject({ agentId: "api-agent", repoName: "api-gateway", role: "api", techStack: ["node"] });
  });

  it("builds edges from dependsOn", () => {
    const agents = makeAgents([
      {
        agentId: "api-agent",
        repoName: "api-gateway",
        manifest: { dependsOn: ["class-lib-a"] },
      },
      {
        agentId: "lib-agent",
        repoName: "class-lib-a",
        manifest: {},
      },
    ]);
    const { edges } = buildDependencyGraph(agents);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ from: "api-agent", to: "lib-agent" });
  });

  it("builds edges from dependedBy", () => {
    const agents = makeAgents([
      {
        agentId: "lib-agent",
        repoName: "class-lib-a",
        manifest: { dependedBy: ["api-gateway"] },
      },
      {
        agentId: "api-agent",
        repoName: "api-gateway",
        manifest: {},
      },
    ]);
    const { edges } = buildDependencyGraph(agents);
    expect(edges).toHaveLength(1);
    // dependedBy: from=api-agent (target), to=lib-agent (this)
    expect(edges[0]).toEqual({ from: "api-agent", to: "lib-agent" });
  });

  it("deduplicates edges when both dependsOn and dependedBy confirm the same relationship", () => {
    const agents = makeAgents([
      {
        agentId: "api-agent",
        repoName: "api-gateway",
        manifest: { dependsOn: ["class-lib-a"], dependedBy: [] },
      },
      {
        agentId: "lib-agent",
        repoName: "class-lib-a",
        manifest: { dependedBy: ["api-gateway"], dependsOn: [] },
      },
    ]);
    const { edges } = buildDependencyGraph(agents);
    expect(edges).toHaveLength(1);
  });

  it("cross-validates and emits warning when dependsOn declared but dependedBy is missing", () => {
    const agents = makeAgents([
      {
        agentId: "api-agent",
        repoName: "api-gateway",
        manifest: { dependsOn: ["class-lib-a"] },
      },
      {
        agentId: "lib-agent",
        repoName: "class-lib-a",
        manifest: { dependedBy: [] },
      },
    ]);
    const { warnings } = buildDependencyGraph(agents);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0]).toContain("Inconsistency");
  });

  it("cross-validates and emits warning when dependedBy declared but dependsOn is missing", () => {
    const agents = makeAgents([
      {
        agentId: "lib-agent",
        repoName: "class-lib-a",
        manifest: { dependedBy: ["api-gateway"], dependsOn: [] },
      },
      {
        agentId: "api-agent",
        repoName: "api-gateway",
        manifest: { dependsOn: [] },
      },
    ]);
    const { warnings } = buildDependencyGraph(agents);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });

  it("detects unloaded dependencies in dependsOn", () => {
    const agents = makeAgents([
      {
        agentId: "api-agent",
        repoName: "api-gateway",
        manifest: { dependsOn: ["missing-lib"] },
      },
    ]);
    const { unloadedDeps } = buildDependencyGraph(agents);
    expect(unloadedDeps).toHaveLength(1);
    expect(unloadedDeps[0].missing[0].repoName).toBe("missing-lib");
    expect(unloadedDeps[0].missing[0].direction).toBe("dependsOn");
  });

  it("detects unloaded dependencies in dependedBy", () => {
    const agents = makeAgents([
      {
        agentId: "lib-agent",
        repoName: "class-lib-a",
        manifest: { dependedBy: ["unknown-webapp"] },
      },
    ]);
    const { unloadedDeps } = buildDependencyGraph(agents);
    expect(unloadedDeps).toHaveLength(1);
    expect(unloadedDeps[0].missing[0].direction).toBe("dependedBy");
  });

  it("handles circular dependencies without crashing", () => {
    const agents = makeAgents([
      {
        agentId: "agent-a",
        repoName: "repo-a",
        manifest: { dependsOn: ["repo-b"] },
      },
      {
        agentId: "agent-b",
        repoName: "repo-b",
        manifest: { dependsOn: ["repo-a"] },
      },
    ]);
    let result;
    expect(() => { result = buildDependencyGraph(agents); }).not.toThrow();
    expect(result.warnings.some((w) => w.includes("Circular"))).toBe(true);
  });

  it("returns correct techStack from manifest", () => {
    const agents = makeAgents([
      {
        agentId: "ts-agent",
        repoName: "my-service",
        manifest: { techStack: ["node", "typescript"] },
      },
    ]);
    const { nodes } = buildDependencyGraph(agents);
    expect(nodes[0].techStack).toEqual(["node", "typescript"]);
  });
});

describe("getGraphRelationships", () => {
  function makeAgents(list) {
    const map = new Map();
    for (const a of list) {
      map.set(a.agentId, {
        agentId: a.agentId,
        repoName: a.repoName,
        manifest: a.manifest ?? null,
        manifestMissing: a.manifestMissing ?? false,
        ...a,
      });
    }
    return map;
  }

  it("derives upstream and downstream from explicit graph edges", () => {
    const agents = makeAgents([
      {
        agentId: "lib-agent",
        repoName: "class-lib-a",
        manifest: { dependedBy: ["api-gateway"] },
      },
      {
        agentId: "api-agent",
        repoName: "api-gateway",
        manifest: { dependsOn: ["class-lib-a"], dependedBy: ["webapp"] },
      },
      {
        agentId: "web-agent",
        repoName: "webapp",
        manifest: { dependsOn: ["api-gateway"] },
      },
    ]);

    const relationships = getGraphRelationships(agents, "api-agent");
    expect(relationships.upstream).toEqual(["class-lib-a"]);
    expect(relationships.downstream).toEqual(["webapp"]);
  });

  it("respects reverse-only declarations when deriving downstream", () => {
    const agents = makeAgents([
      {
        agentId: "lib-agent",
        repoName: "class-lib-a",
        manifest: { dependedBy: ["api-gateway"] },
      },
      {
        agentId: "api-agent",
        repoName: "api-gateway",
        manifest: {},
      },
    ]);

    const relationships = getGraphRelationships(agents, "lib-agent");
    expect(relationships.downstream).toEqual(["api-gateway"]);
  });
});

describe("inferManifestRelationships", () => {
  function makeAgents(list) {
    const map = new Map();
    for (const a of list) {
      map.set(a.agentId, {
        agentId: a.agentId,
        repoName: a.repoName,
        manifest: a.manifest ?? null,
        manifestMissing: a.manifestMissing ?? false,
        ...a,
      });
    }
    return map;
  }

  it("infers dependedBy from other repos that depend on the target repo", () => {
    const agents = makeAgents([
      {
        agentId: "target-agent",
        repoName: "shared-lib",
        manifest: null,
      },
      {
        agentId: "api-agent",
        repoName: "api-gateway",
        manifest: { dependsOn: ["shared-lib"] },
      },
      {
        agentId: "web-agent",
        repoName: "webapp",
        manifest: { dependsOn: ["shared-lib"] },
      },
    ]);

    expect(inferManifestRelationships(agents, "target-agent")).toEqual({
      dependsOn: [],
      dependedBy: ["api-gateway", "webapp"],
    });
  });

  it("infers dependsOn from reverse-only dependedBy declarations on other repos", () => {
    const agents = makeAgents([
      {
        agentId: "target-agent",
        repoName: "api-gateway",
        manifest: null,
      },
      {
        agentId: "lib-agent",
        repoName: "shared-lib",
        manifest: { dependedBy: ["api-gateway"] },
      },
      {
        agentId: "auth-agent",
        repoName: "auth-service",
        manifest: { dependedBy: ["api-gateway"] },
      },
    ]);

    expect(inferManifestRelationships(agents, "target-agent")).toEqual({
      dependsOn: ["auth-service", "shared-lib"],
      dependedBy: [],
    });
  });

  it("deduplicates and sorts inferred relationship names", () => {
    const agents = makeAgents([
      { agentId: "target-agent", repoName: "api-gateway", manifest: null },
      { agentId: "lib-a", repoName: "z-lib", manifest: { dependedBy: ["api-gateway"] } },
      { agentId: "lib-b", repoName: "a-lib", manifest: { dependedBy: ["api-gateway"] } },
      { agentId: "web-a", repoName: "webapp", manifest: { dependsOn: ["api-gateway"] } },
      { agentId: "web-b", repoName: "mobile", manifest: { dependsOn: ["api-gateway"] } },
    ]);

    expect(inferManifestRelationships(agents, "target-agent")).toEqual({
      dependsOn: ["a-lib", "z-lib"],
      dependedBy: ["mobile", "webapp"],
    });
  });
});

// ---------------------------------------------------------------------------
// parseRoutingPlan
// ---------------------------------------------------------------------------

describe("parseRoutingPlan", () => {
  it("returns null for an empty string", () => {
    expect(parseRoutingPlan("")).toBeNull();
  });

  it("returns null when text contains NO_CASCADE (uppercase)", () => {
    expect(parseRoutingPlan("The answer is complete. NO_CASCADE")).toBeNull();
  });

  it("returns null when text contains no_cascade (lowercase — case-insensitive check)", () => {
    expect(parseRoutingPlan("no_cascade")).toBeNull();
  });

  it("returns null when text contains No_Cascade (mixed case)", () => {
    expect(parseRoutingPlan("No_Cascade — nothing to route")).toBeNull();
  });

  it("returns null when no @repo: directives are found", () => {
    // Valid non-empty text but no routing patterns → directives array empty → null
    expect(parseRoutingPlan("Here is some plain text with no directives.")).toBeNull();
  });

  it("parses a single @repo: directive", () => {
    const result = parseRoutingPlan("@api-gateway: Update the README for the new endpoint");
    expect(result).toEqual([
      { repoName: "api-gateway", promptText: "Update the README for the new endpoint" },
    ]);
  });

  it("parses multiple @repo: directives from one string", () => {
    const text =
      "@api-gateway: Add OpenAPI spec\n" +
      "@shared-lib: Bump semver for the new interface";
    const result = parseRoutingPlan(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ repoName: "api-gateway", promptText: "Add OpenAPI spec" });
    expect(result[1]).toEqual({ repoName: "shared-lib", promptText: "Bump semver for the new interface" });
  });

  it("trims whitespace from promptText", () => {
    // The implementation trims promptText after capture; repoName is also trimmed
    const result = parseRoutingPlan("@my-repo:  Fix the bug  ");
    expect(result).not.toBeNull();
    expect(result[0].promptText).toBe("Fix the bug");
  });
});

// ---------------------------------------------------------------------------
// buildMissionPrefix
// ---------------------------------------------------------------------------

describe("buildMissionPrefix", () => {
  it("returns empty string when missionContext is null", () => {
    expect(buildMissionPrefix(null)).toBe("");
  });

  it("returns empty string when missionContext is undefined", () => {
    expect(buildMissionPrefix(undefined)).toBe("");
  });

  it("returns empty string when missionContext is an empty string", () => {
    expect(buildMissionPrefix("")).toBe("");
  });

  it("returns empty string when missionContext is only whitespace", () => {
    expect(buildMissionPrefix("   ")).toBe("");
  });

  it("returns the formatted section brief when missionContext is non-empty", () => {
    const result = buildMissionPrefix("Audit all repos for stale docs");
    expect(result).toBe(
      "## Session Brief\nAudit all repos for stale docs\n\n---\n\n"
    );
  });

  it("trims leading and trailing whitespace from missionContext", () => {
    const result = buildMissionPrefix("  Trim me  ");
    expect(result).toBe("## Session Brief\nTrim me\n\n---\n\n");
  });
});

// ---------------------------------------------------------------------------
// buildCrossRepoContext
// ---------------------------------------------------------------------------

describe("buildCrossRepoContext", () => {
  // Shared helper — same shape as other describe blocks in this file
  function makeAgents(list) {
    const map = new Map();
    for (const a of list) {
      map.set(a.agentId, {
        agentId: a.agentId,
        repoName: a.repoName,
        manifest: a.manifest ?? null,
        manifestMissing: a.manifestMissing ?? false,
        ...a,
      });
    }
    return map;
  }

  it("returns empty string when the agent has no manifest", () => {
    const agents = makeAgents([
      { agentId: "agent-1", repoName: "repo-a", manifest: null },
    ]);
    expect(buildCrossRepoContext(agents, "agent-1")).toBe("");
  });

  it("returns empty string when agent has a manifest but no upstream or downstream deps", () => {
    const agents = makeAgents([
      { agentId: "agent-1", repoName: "repo-a", manifest: { dependsOn: [], dependedBy: [] } },
    ]);
    expect(buildCrossRepoContext(agents, "agent-1")).toBe("");
  });

  it("returns context string listing upstream repos when agent has upstream deps", () => {
    const agents = makeAgents([
      {
        agentId: "api-agent",
        repoName: "api-gateway",
        manifest: { dependsOn: ["shared-lib"] },
      },
      {
        agentId: "lib-agent",
        repoName: "shared-lib",
        manifest: {},
      },
    ]);
    const result = buildCrossRepoContext(agents, "api-agent");
    expect(result).toContain("shared-lib");
    expect(result).toContain("Cross-Repo Context");
    expect(result).toContain("depends on");
  });

  it("returns context string listing downstream repos when agent has downstream deps", () => {
    const agents = makeAgents([
      {
        agentId: "lib-agent",
        repoName: "shared-lib",
        manifest: { dependedBy: ["api-gateway"] },
      },
      {
        agentId: "api-agent",
        repoName: "api-gateway",
        manifest: {},
      },
    ]);
    const result = buildCrossRepoContext(agents, "lib-agent");
    expect(result).toContain("api-gateway");
    expect(result).toContain("depend on this repo");
  });

  it("returns context string with both upstream and downstream when agent has both", () => {
    const agents = makeAgents([
      {
        agentId: "mid-agent",
        repoName: "middleware",
        manifest: { dependsOn: ["shared-lib"], dependedBy: ["webapp"] },
      },
      {
        agentId: "lib-agent",
        repoName: "shared-lib",
        manifest: {},
      },
      {
        agentId: "web-agent",
        repoName: "webapp",
        manifest: {},
      },
    ]);
    const result = buildCrossRepoContext(agents, "mid-agent");
    expect(result).toContain("shared-lib");
    expect(result).toContain("webapp");
    expect(result).toContain("depends on");
    expect(result).toContain("depend on this repo");
  });
});

// ---------------------------------------------------------------------------
// enrichPromptText
// ---------------------------------------------------------------------------

describe("enrichPromptText", () => {
  it("returns original text when both missionPrefix and crossRepoContext are empty strings", () => {
    expect(enrichPromptText("Do the thing", "", "")).toBe("Do the thing");
  });

  it("prepends missionPrefix to text when only missionPrefix is set", () => {
    const prefix = "## Session Brief\nAudit docs\n\n---\n\n";
    const result = enrichPromptText("Do the thing", prefix, "");
    expect(result).toBe(prefix + "Do the thing");
  });

  it("prepends both missionPrefix and crossRepoContext when both are set", () => {
    const prefix = "## Session Brief\nAudit docs\n\n---\n\n";
    const context = "## Cross-Repo Context\nDepends on shared-lib\n\n";
    const result = enrichPromptText("Do the thing", prefix, context);
    expect(result).toBe(prefix + context + "Do the thing");
  });
});

// ---------------------------------------------------------------------------
// buildSynthesisPrompt
// ---------------------------------------------------------------------------

describe("buildSynthesisPrompt", () => {
  const baseResults = [
    { repoName: "api-gateway", status: "done", output: "Updated OpenAPI spec." },
    { repoName: "shared-lib", status: "done", output: "Bumped version to 2.1.0." },
  ];

  it("contains the original promptText in the output", () => {
    const result = buildSynthesisPrompt(baseResults, "Audit all docs", null, "");
    expect(result).toContain("Audit all docs");
  });

  it("contains each result's repoName in the output", () => {
    const result = buildSynthesisPrompt(baseResults, "Audit all docs", null, "");
    expect(result).toContain("api-gateway");
    expect(result).toContain("shared-lib");
  });

  it("shows error placeholder when a result has status 'error'", () => {
    const results = [
      { repoName: "failing-repo", status: "error", output: "some real output that should be hidden" },
    ];
    const result = buildSynthesisPrompt(results, "Check status", null, "");
    expect(result).toContain("_Agent errored — no output._");
    // The actual output text must not appear when status is 'error'
    expect(result).not.toContain("some real output that should be hidden");
  });

  it("appends synthesisInstructions when provided", () => {
    const result = buildSynthesisPrompt(
      baseResults,
      "Audit docs",
      "Focus on breaking changes only",
      ""
    );
    expect(result).toContain("Focus on breaking changes only");
    expect(result).toContain("User orchestrator focus");
  });

  it("does not append synthesisInstructions section when null", () => {
    const result = buildSynthesisPrompt(baseResults, "Audit docs", null, "");
    expect(result).not.toContain("User orchestrator focus");
  });

  it("prepends the mission prefix when missionContext is non-empty", () => {
    const result = buildSynthesisPrompt(
      baseResults,
      "Audit docs",
      null,
      "Documentation sprint — Q2 2026"
    );
    expect(result).toContain("## Session Brief");
    expect(result).toContain("Documentation sprint — Q2 2026");
  });

  it("does not prepend mission prefix when missionContext is empty", () => {
    const result = buildSynthesisPrompt(baseResults, "Audit docs", null, "");
    expect(result).not.toContain("## Session Brief");
  });
});
