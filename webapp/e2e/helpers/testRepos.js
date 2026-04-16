/**
 * testRepos.js — helpers for creating and cleaning up minimal local git repos
 * used by the mock-worker e2e specs.
 *
 * Each repo is a bare-minimum git repo (git init + empty commit) that lets
 * `git clone` work from a file:// URL. The mock ACP worker doesn't actually
 * read repo contents — it only needs the directory to exist as a valid CWD.
 */

import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const TEST_REPOS_BASE = join(tmpdir(), "acp-e2e-repos");

/**
 * Create a minimal local git repository. Returns the absolute path.
 * The repo has one empty commit so `git clone --depth 1 file:///path` works.
 *
 * @param {string} name  Human-readable short name (used in directory name)
 * @returns {string}  Absolute path to the created repo
 */
export function createTestRepo(name) {
  const dir = join(TEST_REPOS_BASE, `${name}-${randomUUID().slice(0, 6)}`);
  mkdirSync(dir, { recursive: true });

  const gitEnv = { ...process.env, GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@test.com", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@test.com" };
  execSync("git init", { cwd: dir, env: gitEnv, stdio: "ignore" });
  execSync("git commit --allow-empty -m init", { cwd: dir, env: gitEnv, stdio: "ignore" });

  return dir;
}

/**
 * Remove a test repo directory created by createTestRepo.
 * Safe to call even if the directory has already been removed.
 *
 * @param {string} dir  Absolute path returned by createTestRepo
 */
export function cleanupTestRepo(dir) {
  try {
    if (dir && existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // Best-effort cleanup; don't fail the test on cleanup errors
  }
}

/**
 * Convert a local repo path to a file:// URL that git can clone from.
 * On Windows, paths like C:\foo\bar become file:///C:/foo/bar.
 *
 * @param {string} repoPath  Absolute path on disk
 * @returns {string}  file:// URL
 */
export function toFileUrl(repoPath) {
  // Replace backslashes, ensure leading slash after "file://"
  const normalized = repoPath.replace(/\\/g, "/");
  return normalized.startsWith("/")
    ? `file://${normalized}`
    : `file:///${normalized}`;
}
