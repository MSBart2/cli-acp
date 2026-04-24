import { useState, useCallback } from "react";
import { randomUUID } from "../utils/uuid.js";

const STORAGE_KEY = "acp-playbooks";

/**
 * @typedef {{ id: string, name: string, text: string, savedAt: string }} Playbook
 */

function loadFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveToStorage(playbooks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(playbooks));
}

/**
 * Manages a list of saved prompt playbooks backed by localStorage.
 *
 * @returns {{
 *   playbooks: Playbook[],
 *   savePlaybook: (name: string, text: string) => void,
 *   deletePlaybook: (id: string) => void,
 * }}
 */
export function usePlaybooks() {
  const [playbooks, setPlaybooks] = useState(loadFromStorage);

  const savePlaybook = useCallback((name, text) => {
    setPlaybooks((prev) => {
      const updated = [
        ...prev,
        { id: randomUUID(), name: name.trim(), text, savedAt: new Date().toISOString() },
      ];
      saveToStorage(updated);
      return updated;
    });
  }, []);

  const deletePlaybook = useCallback((id) => {
    setPlaybooks((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      saveToStorage(updated);
      return updated;
    });
  }, []);

  return { playbooks, savePlaybook, deletePlaybook };
}
