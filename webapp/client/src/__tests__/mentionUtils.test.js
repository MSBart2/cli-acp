import { describe, it, expect } from "vitest";
import { getMentionAt, parseAtMentions } from "../hooks/mentionUtils.js";

describe("getMentionAt", () => {
  it("detects @mention at cursor position", () => {
    const result = getMentionAt("hello @wor", 10);
    expect(result).toEqual({ fragment: "wor", start: 6 });
  });

  it("detects @mention at the very start of input", () => {
    const result = getMentionAt("@repo", 5);
    expect(result).toEqual({ fragment: "repo", start: 0 });
  });

  it("returns null when cursor is not inside an @mention", () => {
    expect(getMentionAt("hello world", 5)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getMentionAt("", 0)).toBeNull();
  });

  it("detects @ with empty fragment (just typed @)", () => {
    const result = getMentionAt("hello @", 7);
    expect(result).toEqual({ fragment: "", start: 6 });
  });

  it("only looks at text before cursor position", () => {
    expect(getMentionAt("@repo some text @other", 12)).toBeNull();
  });

  it("handles hyphenated repo names", () => {
    const result = getMentionAt("fix @my-cool-repo", 17);
    expect(result).toEqual({ fragment: "my-cool-repo", start: 4 });
  });

  it("returns null when @ is in the middle of a word", () => {
    expect(getMentionAt("email@test", 10)).toBeNull();
  });
});

describe("parseAtMentions", () => {
  const repos = ["MyApp", "backend-api", "Docs"];

  it("matches known repo names (case-insensitive)", () => {
    const result = parseAtMentions("update @myapp and @docs", repos);
    expect(result.matched).toEqual(["MyApp", "Docs"]);
    expect(result.unmatched).toEqual([]);
  });

  it("classifies unknown repos as unmatched", () => {
    const result = parseAtMentions("fix @unknown-repo", repos);
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual(["unknown-repo"]);
  });

  it("handles mixed matched and unmatched", () => {
    const result = parseAtMentions("@myapp @nope @backend-api", repos);
    expect(result.matched).toEqual(["MyApp", "backend-api"]);
    expect(result.unmatched).toEqual(["nope"]);
  });

  it("deduplicates matched repos", () => {
    const result = parseAtMentions("@myapp @MYAPP @MyApp", repos);
    expect(result.matched).toEqual(["MyApp"]);
  });

  it("deduplicates unmatched repos", () => {
    const result = parseAtMentions("@foo @foo @foo", repos);
    expect(result.unmatched).toEqual(["foo"]);
  });

  it("preserves canonical casing from workerRepoNames", () => {
    const result = parseAtMentions("@BACKEND-API", repos);
    expect(result.matched).toEqual(["backend-api"]);
  });

  it("returns empty arrays when no mentions exist", () => {
    const result = parseAtMentions("no mentions here", repos);
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual([]);
  });

  it("handles empty workerRepoNames", () => {
    const result = parseAtMentions("@myapp", []);
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual(["myapp"]);
  });
});
