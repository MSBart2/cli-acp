/**
 * Scans `value` backwards from `cursorPos` to detect a `@fragment` being typed.
 * Returns `{ fragment, start }` or `null` if the cursor isn't inside an @mention.
 *
 * @param {string} value
 * @param {number} cursorPos
 * @returns {{ fragment: string, start: number } | null}
 */
export function getMentionAt(value, cursorPos) {
  const before = value.slice(0, cursorPos);
  // Match @ preceded by start-of-string or whitespace, followed by word chars.
  // Group 1 captures the optional preceding whitespace; group 2 is the fragment.
  const match = before.match(/(^|\s)@([\w-]*)$/);
  if (!match) return null;
  // match[2] is the fragment after @; use lastIndexOf to find the @ position
  return { fragment: match[2], start: before.lastIndexOf("@") };
}

/**
 * Parses all complete `@repoName` tokens from `text` and cross-references them
 * against the known worker repo names.
 *
 * @param {string} text
 * @param {string[]} workerRepoNames
 * @returns {{ matched: string[], unmatched: string[] }}
 */
export function parseAtMentions(text, workerRepoNames) {
  const tokens = [...text.matchAll(/@([\w-]+)/g)].map((m) => m[1].toLowerCase());
  const nameSet = new Set(workerRepoNames.map((n) => n.toLowerCase()));
  const matched = [];
  const unmatched = [];
  for (const tok of tokens) {
    if (nameSet.has(tok)) {
      const canonical = workerRepoNames.find((n) => n.toLowerCase() === tok);
      if (!matched.includes(canonical)) matched.push(canonical);
    } else if (!unmatched.includes(tok)) {
      unmatched.push(tok);
    }
  }
  return { matched, unmatched };
}
