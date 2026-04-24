import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlaybooks } from "../hooks/usePlaybooks.js";

describe("usePlaybooks", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts with empty playbooks when no localStorage data exists", () => {
    const { result } = renderHook(() => usePlaybooks());
    expect(result.current.playbooks).toEqual([]);
  });

  it("loads existing playbooks from localStorage on mount", () => {
    const stored = [{ id: "1", name: "Test", text: "hello", savedAt: "2024-01-01" }];
    localStorage.setItem("acp-playbooks", JSON.stringify(stored));
    const { result } = renderHook(() => usePlaybooks());
    expect(result.current.playbooks).toEqual(stored);
  });

  it("returns empty array when localStorage contains invalid JSON", () => {
    localStorage.setItem("acp-playbooks", "not json");
    const { result } = renderHook(() => usePlaybooks());
    expect(result.current.playbooks).toEqual([]);
  });

  it("savePlaybook adds a new playbook with correct fields", () => {
    const { result } = renderHook(() => usePlaybooks());
    act(() => result.current.savePlaybook("  My Playbook  ", "prompt text"));

    const playbooks = result.current.playbooks;
    expect(playbooks).toHaveLength(1);
    expect(playbooks[0].name).toBe("My Playbook"); // trimmed
    expect(playbooks[0].text).toBe("prompt text");
    expect(playbooks[0].id).toBeTruthy();
    expect(playbooks[0].savedAt).toBeTruthy();
  });

  it("savePlaybook persists to localStorage", () => {
    const { result } = renderHook(() => usePlaybooks());
    act(() => result.current.savePlaybook("PB", "text"));

    const stored = JSON.parse(localStorage.getItem("acp-playbooks"));
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("PB");
  });

  it("savePlaybook appends to existing playbooks", () => {
    const { result } = renderHook(() => usePlaybooks());
    act(() => result.current.savePlaybook("First", "one"));
    act(() => result.current.savePlaybook("Second", "two"));

    expect(result.current.playbooks).toHaveLength(2);
    expect(result.current.playbooks[0].name).toBe("First");
    expect(result.current.playbooks[1].name).toBe("Second");
  });

  it("deletePlaybook removes the correct playbook", () => {
    const { result } = renderHook(() => usePlaybooks());
    act(() => result.current.savePlaybook("Keep", "keep text"));
    act(() => result.current.savePlaybook("Delete", "delete text"));

    const idToDelete = result.current.playbooks.find((p) => p.name === "Delete").id;
    act(() => result.current.deletePlaybook(idToDelete));

    expect(result.current.playbooks).toHaveLength(1);
    expect(result.current.playbooks[0].name).toBe("Keep");
  });

  it("deletePlaybook persists removal to localStorage", () => {
    const { result } = renderHook(() => usePlaybooks());
    act(() => result.current.savePlaybook("Gone", "text"));

    const id = result.current.playbooks[0].id;
    act(() => result.current.deletePlaybook(id));

    const stored = JSON.parse(localStorage.getItem("acp-playbooks"));
    expect(stored).toHaveLength(0);
  });

  it("deletePlaybook is a no-op for unknown id", () => {
    const { result } = renderHook(() => usePlaybooks());
    act(() => result.current.savePlaybook("Stay", "text"));
    act(() => result.current.deletePlaybook("nonexistent"));

    expect(result.current.playbooks).toHaveLength(1);
  });
});
