import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomUUID } from "../utils/uuid.js";

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("randomUUID", () => {
  it("returns a valid UUID v4 string", () => {
    expect(randomUUID()).toMatch(UUID_V4_RE);
  });

  it("returns unique values on successive calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => randomUUID()));
    expect(ids.size).toBe(50);
  });

  describe("fallback path (no crypto.randomUUID)", () => {
    let original;

    beforeEach(() => {
      original = globalThis.crypto.randomUUID;
      globalThis.crypto.randomUUID = undefined;
    });

    afterEach(() => {
      globalThis.crypto.randomUUID = original;
    });

    it("returns a valid UUID v4 string via Math.random fallback", () => {
      expect(randomUUID()).toMatch(UUID_V4_RE);
    });

    it("returns unique values from the fallback path", () => {
      const ids = new Set(Array.from({ length: 50 }, () => randomUUID()));
      expect(ids.size).toBe(50);
    });
  });
});
