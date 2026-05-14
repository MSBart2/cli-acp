import { describe, it, expect } from "vitest";

// Test the GitHub owner/org regex used by /api/github/org-repos
const GH_OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

describe("GitHub org name validation (GH_OWNER_RE)", () => {
  // -- Valid org names --
  it("accepts a simple org name", () => {
    expect(GH_OWNER_RE.test("github")).toBe(true);
  });

  it("accepts an org name with hyphens", () => {
    expect(GH_OWNER_RE.test("my-org")).toBe(true);
  });

  it("accepts a single character org", () => {
    expect(GH_OWNER_RE.test("x")).toBe(true);
  });

  it("accepts a two character org", () => {
    expect(GH_OWNER_RE.test("ab")).toBe(true);
  });

  it("accepts org names with numbers", () => {
    expect(GH_OWNER_RE.test("org123")).toBe(true);
  });

  it("accepts max-length org name (39 chars)", () => {
    expect(GH_OWNER_RE.test("a" + "b".repeat(37) + "c")).toBe(true);
  });

  // -- Invalid org names --
  it("rejects empty string", () => {
    expect(GH_OWNER_RE.test("")).toBe(false);
  });

  it("rejects org starting with hyphen", () => {
    expect(GH_OWNER_RE.test("-org")).toBe(false);
  });

  it("rejects org ending with hyphen", () => {
    expect(GH_OWNER_RE.test("org-")).toBe(false);
  });

  it("rejects org with spaces", () => {
    expect(GH_OWNER_RE.test("my org")).toBe(false);
  });

  it("rejects org with shell metacharacters", () => {
    expect(GH_OWNER_RE.test("org; rm -rf /")).toBe(false);
  });

  it("rejects org with pipe", () => {
    expect(GH_OWNER_RE.test("org|cat")).toBe(false);
  });

  it("rejects org with backticks", () => {
    expect(GH_OWNER_RE.test("`whoami`")).toBe(false);
  });

  it("rejects org with dots", () => {
    expect(GH_OWNER_RE.test("my.org")).toBe(false);
  });

  it("rejects org with underscores", () => {
    expect(GH_OWNER_RE.test("my_org")).toBe(false);
  });

  it("rejects org exceeding 39 chars", () => {
    expect(GH_OWNER_RE.test("a".repeat(40))).toBe(false);
  });
});
