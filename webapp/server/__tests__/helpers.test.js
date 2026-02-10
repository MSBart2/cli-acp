import { describe, it, expect } from "vitest";
import { isValidGitUrl, repoNameFromUrl, extractWorkItems } from "../helpers.js";

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
