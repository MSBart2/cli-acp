/**
 * Derive a best-effort repo URL suggestion for a missing sibling repo by
 * replacing the last path segment of a loaded repo URL.
 *
 * @param {string} baseRepoUrl
 * @param {string} targetRepoName
 * @returns {string}
 */
export function suggestRepoUrl(baseRepoUrl, targetRepoName) {
  if (!baseRepoUrl || !targetRepoName) return "";

  try {
    const url = new URL(baseRepoUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length === 0) return "";

    const hadGitSuffix = segments[segments.length - 1].endsWith(".git");
    segments[segments.length - 1] = hadGitSuffix
      ? `${targetRepoName}.git`
      : targetRepoName;
    url.pathname = `/${segments.join("/")}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

/**
 * Build a deduplicated unloaded-dependency summary for the orchestrator card.
 *
 * @param {Array<{ repoName: string, repoUrl?: string, unloadedDeps?: Array<{ repoName: string, direction: string, suggestedUrl?: string }> }>} workers
 * @returns {Array<{ repoName: string, suggestedUrl: string, referencedBy: string[], directions: string[] }>}
 */
export function buildOrchestratorUnloadedDeps(workers) {
  const byRepoName = new Map();

  for (const worker of workers) {
    for (const dep of worker.unloadedDeps || []) {
      const key = dep.repoName.toLowerCase();
      const existing = byRepoName.get(key) || {
        repoName: dep.repoName,
        suggestedUrl: dep.suggestedUrl || suggestRepoUrl(worker.repoUrl, dep.repoName),
        referencedBy: new Set(),
        directions: new Set(),
      };

      existing.referencedBy.add(worker.repoName);
      existing.directions.add(dep.direction);
      if (!existing.suggestedUrl) {
        existing.suggestedUrl = dep.suggestedUrl || suggestRepoUrl(worker.repoUrl, dep.repoName);
      }

      byRepoName.set(key, existing);
    }
  }

  return [...byRepoName.values()]
    .map((entry) => ({
      repoName: entry.repoName,
      suggestedUrl: entry.suggestedUrl,
      referencedBy: [...entry.referencedBy].sort((a, b) => a.localeCompare(b)),
      directions: [...entry.directions].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.repoName.localeCompare(b.repoName));
}
