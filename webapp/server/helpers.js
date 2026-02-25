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
