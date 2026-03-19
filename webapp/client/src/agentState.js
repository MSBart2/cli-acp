function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Merge a server-sent agent snapshot into existing client agent state while
 * preserving local-only fields like streamed output and pending permission.
 *
 * @param {object|undefined} existing
 * @param {object} snapshot
 * @returns {object}
 */
export function mergeAgentSnapshot(existing = {}, snapshot) {
  return {
    ...existing,
    agentId: snapshot.agentId ?? existing.agentId,
    repoUrl: snapshot.repoUrl ?? existing.repoUrl,
    repoName: snapshot.repoName ?? existing.repoName,
    repoPath: snapshot.repoPath ?? existing.repoPath ?? null,
    model: hasOwn(snapshot, "model") ? snapshot.model : (existing.model ?? null),
    role: snapshot.role ?? existing.role ?? "worker",
    status: snapshot.status ?? existing.status ?? "ready",
    spawnStep: hasOwn(snapshot, "spawnStep") ? snapshot.spawnStep : (existing.spawnStep ?? null),
    spawnMessage: hasOwn(snapshot, "spawnMessage") ? snapshot.spawnMessage : (existing.spawnMessage ?? null),
    manifest: hasOwn(snapshot, "manifest") ? snapshot.manifest : (existing.manifest ?? null),
    manifestMissing: hasOwn(snapshot, "manifestMissing") ? snapshot.manifestMissing : (existing.manifestMissing ?? false),
    unloadedDeps: hasOwn(snapshot, "unloadedDeps") ? snapshot.unloadedDeps : (existing.unloadedDeps ?? []),
    output: existing.output ?? [],
    pendingPermission: existing.pendingPermission ?? null,
  };
}
