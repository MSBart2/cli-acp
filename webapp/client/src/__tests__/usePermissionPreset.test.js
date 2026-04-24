import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  PERMISSION_PRESETS,
  usePermissionPreset,
  resolveAutoApproval,
} from "../hooks/usePermissionPreset.js";

// ---------------------------------------------------------------------------
// resolveAutoApproval — pure function tests
// ---------------------------------------------------------------------------

describe("resolveAutoApproval", () => {
  const safeOpts = [
    { optionId: "opt-allow", name: "Allow", kind: "allow_once" },
    { optionId: "opt-deny", name: "Deny", kind: "reject" },
  ];

  it('returns null when preset is "ask"', () => {
    expect(resolveAutoApproval("ask", "Read file", safeOpts)).toBeNull();
  });

  it("returns null when options is empty", () => {
    expect(resolveAutoApproval("allow-all", "Read file", [])).toBeNull();
  });

  it("returns null when options is null/undefined", () => {
    expect(resolveAutoApproval("allow-all", "Read file", null)).toBeNull();
    expect(resolveAutoApproval("allow-all", "Read file", undefined)).toBeNull();
  });

  it("returns null when all options are reject/deny/block", () => {
    const denyOnly = [
      { optionId: "d1", name: "Deny", kind: "reject" },
      { optionId: "d2", name: "Block", kind: "block" },
    ];
    expect(resolveAutoApproval("allow-all", "Do it", denyOnly)).toBeNull();
  });

  describe('preset: "allow-all"', () => {
    it("returns the first safe option", () => {
      expect(resolveAutoApproval("allow-all", "Write file", safeOpts)).toBe("opt-allow");
    });

    it("skips reject options and picks the first safe one", () => {
      const opts = [
        { optionId: "r1", name: "Deny", kind: "deny" },
        { optionId: "s1", name: "OK", kind: "allow" },
      ];
      expect(resolveAutoApproval("allow-all", "Anything", opts)).toBe("s1");
    });
  });

  describe('preset: "allow-reads"', () => {
    const readOpts = [{ optionId: "r1", name: "Allow", kind: "allow_once" }];

    it.each(["read", "list", "view", "inspect", "search"])(
      'auto-approves when title contains "%s"',
      (keyword) => {
        expect(resolveAutoApproval("allow-reads", `${keyword} file contents`, readOpts)).toBe("r1");
      },
    );

    it("auto-approves case-insensitively", () => {
      expect(resolveAutoApproval("allow-reads", "READ big file", readOpts)).toBe("r1");
    });

    it("returns null for write-like titles with non-read options", () => {
      const writeOpts = [{ optionId: "w1", name: "Allow", kind: "allow" }];
      expect(resolveAutoApproval("allow-reads", "Write to disk", writeOpts)).toBeNull();
    });

    it("auto-approves when all safe options have read or allow_once kind", () => {
      const opts = [
        { optionId: "a1", name: "OK", kind: "read" },
        { optionId: "a2", name: "Sure", kind: "allow_once" },
      ];
      expect(resolveAutoApproval("allow-reads", "Create directory", opts)).toBe("a1");
    });

    it("returns null when some safe options lack read/allow_once kind", () => {
      const opts = [
        { optionId: "a1", name: "OK", kind: "write" },
        { optionId: "a2", name: "Sure", kind: "allow_once" },
      ];
      expect(resolveAutoApproval("allow-reads", "Create directory", opts)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// usePermissionPreset — React hook tests
// ---------------------------------------------------------------------------

describe("usePermissionPreset", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to "ask" when no localStorage value exists', () => {
    const { result } = renderHook(() => usePermissionPreset());
    expect(result.current[0]).toBe("ask");
  });

  it("reads initial value from localStorage", () => {
    localStorage.setItem("acp-permission-preset", "allow-all");
    const { result } = renderHook(() => usePermissionPreset());
    expect(result.current[0]).toBe("allow-all");
  });

  it("persists new value to localStorage when setter is called", () => {
    const { result } = renderHook(() => usePermissionPreset());
    act(() => result.current[1]("allow-reads"));
    expect(result.current[0]).toBe("allow-reads");
    expect(localStorage.getItem("acp-permission-preset")).toBe("allow-reads");
  });
});

// ---------------------------------------------------------------------------
// PERMISSION_PRESETS constant
// ---------------------------------------------------------------------------

describe("PERMISSION_PRESETS", () => {
  it("has three entries", () => {
    expect(PERMISSION_PRESETS).toHaveLength(3);
  });

  it("includes ask, allow-reads, allow-all", () => {
    const ids = PERMISSION_PRESETS.map((p) => p.id);
    expect(ids).toEqual(["ask", "allow-reads", "allow-all"]);
  });
});
