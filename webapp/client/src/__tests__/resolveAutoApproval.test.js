import { describe, it, expect } from "vitest";
import { resolveAutoApproval } from "../hooks/usePermissionPreset.js";

describe("resolveAutoApproval", () => {
  const makeOption = (optionId, name, kind) => ({ optionId, name, kind });

  describe("preset: ask", () => {
    it("returns null (always prompt)", () => {
      const options = [
        makeOption("1", "Allow", "allow_once"),
        makeOption("2", "Deny", "deny"),
      ];
      expect(resolveAutoApproval("ask", "Read file", options)).toBeNull();
    });

    it("returns null even with only safe options", () => {
      const options = [makeOption("1", "Allow", "allow_once")];
      expect(resolveAutoApproval("ask", "Create file", options)).toBeNull();
    });
  });

  describe("preset: allow-all", () => {
    it("auto-selects the first safe option", () => {
      const options = [
        makeOption("1", "Allow once", "allow_once"),
        makeOption("2", "Allow always", "allow_always"),
      ];
      expect(resolveAutoApproval("allow-all", "Run test", options)).toBe("1");
    });

    it("skips deny/reject/block options and picks the first safe one", () => {
      const options = [
        makeOption("deny-1", "Deny", "deny"),
        makeOption("safe-1", "Allow", "allow_once"),
        makeOption("block-1", "Block", "block"),
      ];
      expect(resolveAutoApproval("allow-all", "Edit file", options)).toBe(
        "safe-1",
      );
    });

    it("returns null when all options are reject/deny/block", () => {
      const options = [
        makeOption("1", "Reject", "reject"),
        makeOption("2", "Deny", "deny"),
        makeOption("3", "Block", "block"),
      ];
      expect(resolveAutoApproval("allow-all", "Dangerous", options)).toBeNull();
    });

    it("handles options with kind containing deny anywhere in the string", () => {
      const options = [
        makeOption("1", "Deny this", "deny_this_time"),
        makeOption("2", "Allow", "allow"),
      ];
      expect(resolveAutoApproval("allow-all", "Write", options)).toBe("2");
    });
  });

  describe("preset: allow-reads", () => {
    it("auto-approves when tool title contains 'read'", () => {
      const options = [makeOption("1", "Allow", "allow_once")];
      expect(resolveAutoApproval("allow-reads", "Read file", options)).toBe(
        "1",
      );
    });

    it("auto-approves when tool title contains 'list'", () => {
      const options = [makeOption("1", "Allow", "allow_once")];
      expect(resolveAutoApproval("allow-reads", "List files", options)).toBe(
        "1",
      );
    });

    it("auto-approves when tool title contains 'view'", () => {
      const options = [makeOption("1", "Allow", "allow_once")];
      expect(resolveAutoApproval("allow-reads", "View logs", options)).toBe(
        "1",
      );
    });

    it("auto-approves when tool title contains 'inspect'", () => {
      const options = [makeOption("1", "Allow", "allow_once")];
      expect(resolveAutoApproval("allow-reads", "Inspect data", options)).toBe(
        "1",
      );
    });

    it("auto-approves when tool title contains 'search'", () => {
      const options = [makeOption("1", "Allow", "allow_once")];
      expect(resolveAutoApproval("allow-reads", "Search code", options)).toBe(
        "1",
      );
    });

    it("auto-approves when all options have kind=read", () => {
      const options = [
        makeOption("1", "Allow", "read"),
        makeOption("2", "Allow once", "read"),
      ];
      expect(resolveAutoApproval("allow-reads", "Get data", options)).toBe("1");
    });

    it("auto-approves when all options have kind=allow_once (read-like)", () => {
      const options = [makeOption("1", "Allow", "allow_once")];
      expect(resolveAutoApproval("allow-reads", "Some action", options)).toBe(
        "1",
      );
    });

    it("returns null for write-like operations", () => {
      const options = [makeOption("1", "Allow", "write")];
      expect(resolveAutoApproval("allow-reads", "Write file", options)).toBeNull();
    });

    it("returns null when one option is not read-like", () => {
      const options = [
        makeOption("1", "Allow read", "read"),
        makeOption("2", "Allow write", "write"),
      ];
      expect(
        resolveAutoApproval("allow-reads", "Mixed action", options),
      ).toBeNull();
    });

    it("skips deny options even for read operations", () => {
      const options = [
        makeOption("deny-1", "Deny", "deny"),
        makeOption("read-1", "Read", "read"),
      ];
      expect(resolveAutoApproval("allow-reads", "Read file", options)).toBe(
        "read-1",
      );
    });

    it("is case-insensitive for title matching", () => {
      const options = [makeOption("1", "Allow", "allow_once")];
      expect(resolveAutoApproval("allow-reads", "READ FILE", options)).toBe(
        "1",
      );
      expect(resolveAutoApproval("allow-reads", "LiSt FiLeS", options)).toBe(
        "1",
      );
    });
  });

  describe("edge cases", () => {
    it("returns null when options array is empty", () => {
      expect(resolveAutoApproval("allow-all", "Read", [])).toBeNull();
    });

    it("returns null when options is null", () => {
      expect(resolveAutoApproval("allow-all", "Read", null)).toBeNull();
    });

    it("returns null when options is undefined", () => {
      expect(resolveAutoApproval("allow-all", "Read", undefined)).toBeNull();
    });

    it("handles missing toolTitle with allow_once (auto-approves)", () => {
      // allow_once is treated as read-like, so it auto-approves even without title
      const options = [makeOption("1", "Allow", "allow_once")];
      expect(resolveAutoApproval("allow-reads", null, options)).toBe("1");
      expect(resolveAutoApproval("allow-reads", undefined, options)).toBe("1");
    });

    it("handles missing toolTitle with non-read kind (returns null)", () => {
      const options = [makeOption("1", "Allow", "write")];
      expect(resolveAutoApproval("allow-reads", null, options)).toBeNull();
      expect(resolveAutoApproval("allow-reads", undefined, options)).toBeNull();
    });

    it("handles options without kind property", () => {
      const options = [{ optionId: "1", name: "Allow" }];
      expect(resolveAutoApproval("allow-all", "Read", options)).toBe("1");
    });

    it("returns null when all options are filtered out", () => {
      const options = [
        makeOption("1", "Reject", "reject"),
        makeOption("2", "Block", "block"),
      ];
      expect(resolveAutoApproval("allow-all", "Action", options)).toBeNull();
    });
  });
});
