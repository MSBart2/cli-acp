import { useState, useCallback } from "react";

const STORAGE_KEY = "acp-permission-preset";

/**
 * Valid permission preset values.
 * - "ask"         — Always prompt the user (default, safest)
 * - "allow-reads" — Auto-approve options whose kind contains "allow" when the
 *                   tool is read-only (kind contains "read" or title suggests read)
 * - "allow-all"   — Auto-approve every non-deny option without asking
 */
export const PERMISSION_PRESETS = [
  {
    id: "ask",
    label: "Always ask",
    description: "Prompt for every permission request",
    color: "gray",
  },
  {
    id: "allow-reads",
    label: "Auto-approve reads",
    description: "Automatically approve read-only tool calls",
    color: "blue",
  },
  {
    id: "allow-all",
    label: "Auto-approve all",
    description: "Approve every request without asking (use with caution)",
    color: "amber",
  },
];

/**
 * Persistent permission preset stored in localStorage.
 * Returns [preset, setPreset] where preset is one of the PERMISSION_PRESETS ids.
 */
export function usePermissionPreset() {
  const [preset, setPresetState] = useState(
    () => localStorage.getItem(STORAGE_KEY) ?? "ask",
  );

  const setPreset = useCallback((value) => {
    localStorage.setItem(STORAGE_KEY, value);
    setPresetState(value);
  }, []);

  return [preset, setPreset];
}

/**
 * Given a permission preset and a list of options, returns the optionId to
 * auto-select, or null if the user should be prompted.
 *
 * @param {"ask"|"allow-reads"|"allow-all"} preset
 * @param {string} toolTitle  — title from the permission request
 * @param {Array<{optionId: string, name: string, kind: string}>} options
 * @returns {string|null}  optionId to auto-select, or null = show prompt
 */
export function resolveAutoApproval(preset, toolTitle, options) {
  if (preset === "ask" || !options?.length) return null;

  // Reject options are never auto-approved regardless of preset
  const safeOptions = options.filter(
    (o) => !o.kind?.includes("reject") && !o.kind?.includes("deny") && !o.kind?.includes("block"),
  );
  if (safeOptions.length === 0) return null;

  if (preset === "allow-all") {
    return safeOptions[0].optionId;
  }

  if (preset === "allow-reads") {
    // Auto-approve if the tool kind or title suggests a read-only operation
    const titleLower = (toolTitle ?? "").toLowerCase();
    const isReadLike = titleLower.includes("read") ||
      titleLower.includes("list") ||
      titleLower.includes("view") ||
      titleLower.includes("inspect") ||
      titleLower.includes("search") ||
      safeOptions.every((o) => o.kind?.includes("read") || o.kind?.includes("allow_once"));
    if (isReadLike) {
      return safeOptions[0].optionId;
    }
  }

  return null;
}
