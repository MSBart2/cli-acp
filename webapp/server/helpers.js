import { basename } from "node:path";

// ---------------------------------------------------------------------------
// URL & repo-name helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a URL looks like a safe Git HTTPS URL.
 * Only allows GitHub, GitLab, Bitbucket, and Azure DevOps hosts
 * to prevent open-redirect / SSRF-style abuse.
 * Rejects path-traversal sequences (..) in any segment.
 *
 * @param {string} url - The URL to validate.
 * @returns {boolean} True if the URL matches the allowlist pattern.
 */
export function isValidGitUrl(url) {
  // First reject any path that contains ".." to prevent traversal
  if (/\.\./.test(url)) return false;
  return /^https:\/\/(?:github\.com|gitlab\.com|bitbucket\.org|dev\.azure\.com)\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*(?:\.git)?$/.test(
    url,
  );
}

/**
 * Extract a sanitised human-readable repo name from a Git URL.
 * Strips the `.git` suffix and removes characters that could
 * cause path-traversal issues.
 *
 * @param {string} url - A Git repository URL.
 * @returns {string} A filesystem-safe repo name.
 */
export function repoNameFromUrl(url) {
  return basename(url.replace(/\.git$/, "")).replace(/[^a-zA-Z0-9._-]/g, "-");
}

// ---------------------------------------------------------------------------
// Work-item extraction
// ---------------------------------------------------------------------------

/**
 * Regex patterns for extracting GitHub issue and PR URLs from free-text
 * agent output. We match full HTTPS URLs pointing at known hosts so we
 * don't accidentally capture unrelated links.
 *
 * Each match yields: [fullUrl, host, owner, repo, type ("issues"|"pull"), number]
 */
const GITHUB_ITEM_RE =
  /https:\/\/(?:github\.com|gitlab\.com|bitbucket\.org)\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)\/(issues|pull)\/(\d+)/g;

/**
 * Scan a block of text and return an array of work-item descriptors found
 * within it. Duplicate URLs in the same text block are deduplicated.
 *
 * @param {string} text - Free-text output from an agent.
 * @returns {Array<{ url: string, owner: string, repo: string, type: "issue"|"pr", number: number }>}
 */
export function extractWorkItems(text) {
  if (!text || typeof text !== "string") return [];

  const seen = new Set();
  const items = [];

  for (const match of text.matchAll(GITHUB_ITEM_RE)) {
    const url = match[0];
    if (seen.has(url)) continue;
    seen.add(url);

    items.push({
      url,
      owner: match[1],
      repo: match[2],
      type: match[3] === "pull" ? "pr" : "issue",
      number: parseInt(match[4], 10),
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Dependency graph helpers
// ---------------------------------------------------------------------------

/**
 * A set of lowercase keywords that signal a potentially breaking change in
 * agent output or commit messages.  Used by consumers to flag cross-repo
 * impact when scanning streamed text.
 *
 * @type {Set<string>}
 */
export const CHANGE_SIGNAL_WORDS = new Set([
  "add",
  "update",
  "remove",
  "delete",
  "rename",
  "refactor",
  "replace",
  "migrate",
  "breaking",
  "deprecate",
  "interface",
  "schema",
  "contract",
  "field",
  "type",
  "endpoint",
  "route",
]);

/**
 * Build a dependency graph from the currently-loaded agents.
 *
 * Each agent may carry a `manifest` (parsed JSON) that declares `dependsOn`
 * and `dependedBy` arrays of repo names.  This function constructs nodes,
 * directed edges, cross-validation warnings, and a list of unresolved
 * (not-yet-loaded) dependency references.
 *
 * @param {Map<string, {
 *   agentId: string,
 *   repoName: string,
 *   manifest: object|null,
 *   manifestMissing: boolean
 * }>} agentsMap - Live agents keyed by agentId.
 *
 * @returns {{
 *   nodes: Array<{ agentId: string, repoName: string, role: string, techStack: string[] }>,
 *   edges: Array<{ from: string, to: string }>,
 *   warnings: string[],
 *   unloadedDeps: Array<{ agentId: string, repoName: string, missing: Array<{ repoName: string, direction: string }> }>
 * }}
 */
export function buildDependencyGraph(agentsMap) {
  const nodes = [];
  const edges = [];
  const warnings = [];
  const unloadedDeps = [];

  // Build a repoName → agentId lookup across ALL agents (manifest or not).
  /** @type {Map<string, string>} */
  const repoToAgentId = new Map();
  for (const [agentId, agent] of agentsMap) {
    repoToAgentId.set(agent.repoName, agentId);
  }

  // Collect edges as "from+to" strings for deduplication.
  const edgeKeys = new Set();

  /**
   * Add an edge if it hasn't been seen before.
   * @param {string} from
   * @param {string} to
   */
  function addEdge(from, to) {
    const key = `${from}→${to}`;
    if (!edgeKeys.has(key)) {
      edgeKeys.add(key);
      edges.push({ from, to });
    }
  }

  // First pass: build nodes and raw edges.
  for (const [agentId, agent] of agentsMap) {
    const { manifest } = agent;
    if (!manifest) continue;

    nodes.push({
      agentId,
      repoName: manifest.repoName || agent.repoName,
      role: manifest.role || "other",
      techStack: manifest.techStack || [],
    });

    const missingForAgent = [];

    // dependsOn: this agent → target  (from=agentId, to=target)
    for (const depRepoName of manifest.dependsOn || []) {
      const targetId = repoToAgentId.get(depRepoName);
      if (targetId) {
        addEdge(agentId, targetId);
      } else {
        missingForAgent.push({ repoName: depRepoName, direction: "dependsOn" });
      }
    }

    // dependedBy: target → this agent  (from=target, to=agentId)
    for (const depRepoName of manifest.dependedBy || []) {
      const targetId = repoToAgentId.get(depRepoName);
      if (targetId) {
        addEdge(targetId, agentId);
      } else {
        missingForAgent.push({ repoName: depRepoName, direction: "dependedBy" });
      }
    }

    if (missingForAgent.length > 0) {
      unloadedDeps.push({ agentId, repoName: agent.repoName, missing: missingForAgent });
    }
  }

  // Cross-validation pass: for each edge check the reverse manifest.
  for (const { from, to } of edges) {
    const fromAgent = agentsMap.get(from);
    const toAgent = agentsMap.get(to);
    if (!fromAgent?.manifest || !toAgent?.manifest) continue;

    const fromRepoName = fromAgent.manifest.repoName || fromAgent.repoName;
    const toRepoName = toAgent.manifest.repoName || toAgent.repoName;

    // from.dependsOn should include toRepoName → toAgent.dependedBy should include fromRepoName
    const fromDependsOnTo =
      (fromAgent.manifest.dependsOn || []).includes(toRepoName);
    const toDependedByFrom =
      (toAgent.manifest.dependedBy || []).includes(fromRepoName);

    if (fromDependsOnTo && !toDependedByFrom) {
      warnings.push(
        `Inconsistency: ${fromRepoName} declares dependsOn ${toRepoName}, but ${toRepoName}.dependedBy does not list ${fromRepoName}`,
      );
    }

    // Reverse: toAgent.dependedBy includes fromRepoName → fromAgent.dependsOn should include toRepoName
    if (toDependedByFrom && !fromDependsOnTo) {
      warnings.push(
        `Inconsistency: ${toRepoName} declares dependedBy ${fromRepoName}, but ${fromRepoName}.dependsOn does not list ${toRepoName}`,
      );
    }
  }

  // Cycle detection via DFS over the adjacency list.
  /** @type {Map<string, string[]>} */
  const adj = new Map();
  for (const { from, to } of edges) {
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from).push(to);
  }

  const visited = new Set();
  const inStack = new Set();

  /**
   * DFS that records cycle paths for human-readable warnings.
   * @param {string} nodeId
   * @param {string[]} path
   */
  function dfs(nodeId, path) {
    if (inStack.has(nodeId)) {
      // Found a cycle — slice from where the cycle starts.
      const cycleStart = path.indexOf(nodeId);
      const cycle = path.slice(cycleStart).concat(nodeId);
      warnings.push(`Circular dependency detected: ${cycle.join(" → ")}`);
      return;
    }
    if (visited.has(nodeId)) return;

    visited.add(nodeId);
    inStack.add(nodeId);
    path.push(nodeId);

    for (const neighbour of adj.get(nodeId) || []) {
      dfs(neighbour, path);
    }

    path.pop();
    inStack.delete(nodeId);
  }

  for (const nodeId of adj.keys()) {
    dfs(nodeId, []);
  }

  return { nodes, edges, warnings, unloadedDeps };
}

/**
 * Resolve upstream and downstream repo relationships for a specific agent by
 * walking the built dependency graph rather than ad-hoc manifest fields.
 *
 * @param {Map<string, {
 *   agentId: string,
 *   repoName: string,
 *   manifest: object|null
 * }>} agentsMap
 * @param {string} agentId
 * @returns {{ upstream: string[], downstream: string[] }}
 */
export function getGraphRelationships(agentsMap, agentId) {
  const graph = buildDependencyGraph(agentsMap);
  const repoNameById = new Map();

  for (const [id, agent] of agentsMap) {
    repoNameById.set(id, agent.manifest?.repoName || agent.repoName);
  }

  const upstream = graph.edges
    .filter((edge) => edge.from === agentId)
    .map((edge) => repoNameById.get(edge.to))
    .filter(Boolean);

  const downstream = graph.edges
    .filter((edge) => edge.to === agentId)
    .map((edge) => repoNameById.get(edge.from))
    .filter(Boolean);

  return {
    upstream: [...new Set(upstream)],
    downstream: [...new Set(downstream)],
  };
}

/**
 * Infer initial manifest relationship arrays for an agent from the currently
 * loaded session graph. This is especially useful before the agent has a
 * manifest of its own, because other loaded repos may already reference it.
 *
 * @param {Map<string, {
 *   agentId: string,
 *   repoName: string,
 *   manifest: object|null
 * }>} agentsMap
 * @param {string} agentId
 * @returns {{ dependsOn: string[], dependedBy: string[] }}
 */
export function inferManifestRelationships(agentsMap, agentId) {
  const { upstream, downstream } = getGraphRelationships(agentsMap, agentId);

  return {
    dependsOn: [...upstream].sort((a, b) => a.localeCompare(b)),
    dependedBy: [...downstream].sort((a, b) => a.localeCompare(b)),
  };
}
