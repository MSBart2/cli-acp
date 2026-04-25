import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildEventLogEntry } from "../helpers.js";

describe("buildEventLogEntry", () => {
  beforeEach(() => {
    // Mock Date.now() for consistent timestamps in tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds a text entry from agent_message_chunk", () => {
    const update = {
      sessionUpdate: "agent_message_chunk",
      content: { text: "Hello, world!" },
    };
    const entry = buildEventLogEntry(update);

    expect(entry.timestamp).toBe("2026-04-25T10:00:00.000Z");
    expect(entry.type).toBe("text");
    expect(entry.content).toBe("Hello, world!");
  });

  it("uses empty string when agent_message_chunk has no content.text", () => {
    const update = {
      sessionUpdate: "agent_message_chunk",
      content: {},
    };
    const entry = buildEventLogEntry(update);

    expect(entry.type).toBe("text");
    expect(entry.content).toBe("");
  });

  it("uses empty string when agent_message_chunk content is null", () => {
    const update = {
      sessionUpdate: "agent_message_chunk",
      content: null,
    };
    const entry = buildEventLogEntry(update);

    expect(entry.type).toBe("text");
    expect(entry.content).toBe("");
  });

  it("builds a tool_call entry with correct fields", () => {
    const update = {
      sessionUpdate: "tool_call",
      toolCallId: "tc-123",
      title: "Read file",
      status: "running",
    };
    const entry = buildEventLogEntry(update);

    expect(entry.timestamp).toBe("2026-04-25T10:00:00.000Z");
    expect(entry.type).toBe("tool_call");
    expect(entry.content).toEqual({
      toolCallId: "tc-123",
      title: "Read file",
      status: "running",
    });
  });

  it("builds a tool_call_update entry", () => {
    const update = {
      sessionUpdate: "tool_call_update",
      toolCallId: "tc-456",
      status: "completed",
    };
    const entry = buildEventLogEntry(update);

    expect(entry.type).toBe("tool_call_update");
    expect(entry.content).toEqual({
      toolCallId: "tc-456",
      status: "completed",
    });
  });

  it("builds a plan entry", () => {
    const update = {
      sessionUpdate: "plan",
      planText: "Step 1: Read config\nStep 2: Parse data",
    };
    const entry = buildEventLogEntry(update);

    expect(entry.type).toBe("plan");
    expect(entry.content).toEqual(update);
  });

  it("builds an agent_thought_chunk entry", () => {
    const update = {
      sessionUpdate: "agent_thought_chunk",
      thought: "Analyzing the problem...",
    };
    const entry = buildEventLogEntry(update);

    expect(entry.type).toBe("thought");
    expect(entry.content).toEqual(update);
  });

  it("builds an unknown entry type for unrecognized sessionUpdate", () => {
    const update = {
      sessionUpdate: "some_future_event",
      data: { foo: "bar" },
    };
    const entry = buildEventLogEntry(update);

    expect(entry.type).toBe("some_future_event");
    expect(entry.content).toEqual(update);
  });

  it("uses 'unknown' type when sessionUpdate is missing", () => {
    const update = { someField: "value" };
    const entry = buildEventLogEntry(update);

    expect(entry.type).toBe("unknown");
    expect(entry.content).toEqual(update);
  });

  it("captures current timestamp at call time", () => {
    vi.setSystemTime(new Date("2026-04-25T10:05:30.500Z"));

    const update = {
      sessionUpdate: "agent_message_chunk",
      content: { text: "Test" },
    };
    const entry = buildEventLogEntry(update);

    expect(entry.timestamp).toBe("2026-04-25T10:05:30.500Z");
  });

  it("handles missing optional fields in tool_call gracefully", () => {
    const update = {
      sessionUpdate: "tool_call",
      // Missing toolCallId, title, status
    };
    const entry = buildEventLogEntry(update);

    expect(entry.type).toBe("tool_call");
    expect(entry.content).toEqual({
      toolCallId: undefined,
      title: undefined,
      status: undefined,
    });
  });

  it("handles tool_call_update with missing fields", () => {
    const update = {
      sessionUpdate: "tool_call_update",
      // Missing toolCallId, status
    };
    const entry = buildEventLogEntry(update);

    expect(entry.type).toBe("tool_call_update");
    expect(entry.content).toEqual({
      toolCallId: undefined,
      status: undefined,
    });
  });
});
