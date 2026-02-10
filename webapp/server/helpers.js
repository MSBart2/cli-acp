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
