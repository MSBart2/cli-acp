# Squad Decisions

## Active Decisions

### [2026-04-14] Fix orphaned permission resolver deadlock on socket disconnect

**Author:** Zoe | **Requested by:** hobobart

On browser disconnect while an agent has a pending `permissionResolver`, the server now scans all agents owned by the disconnecting socket and resolves any live resolver with a deny/block option (or falls back to first option, or calls `stopAgent` if no options exist). Three targeted changes to `server/index.js`: track `socketId` on each agent at creation, store `pendingPermissionOptions` alongside the resolver, and clean up in the disconnect handler.

**Rule:** Any future async broker stored on agent registry entries must follow the same `socketId` + disconnect cleanup pattern.

---

### [2026-04-14] Invert stopAgent to opt-in session saving

**Author:** Wash | **Requested by:** hobobart

`stopAgent` now defaults to **not** saving (opt-in via `{ saveSession: true }`), replacing the previous opt-out `{ skipAutoSave: true }` guard. Silence means no save; session integrity is never at risk from forgotten options.

**Rule:** Any new call to `stopAgent` that should persist session state must explicitly pass `{ saveSession: true }`.

Call site inventory:
- `socket.on("agent:stop", ...)` → `{ saveSession: true }` (user-initiated, persist)
- `/api/test/reset` → _(none)_ (test teardown, never persist)
- `shutdownAgents` loop → `{}` (bulk snapshot handled separately via `persistSnapshot`)

---

### [2026-04-14] Extract socket handlers from App.jsx into useAgentSocket hook

**Author:** Kaylee | **Requested by:** hobobart

All Socket.IO event subscriptions and state updates were extracted from `App.jsx`'s 305-line `useEffect` into `webapp/client/src/hooks/useAgentSocket.js`. Hook signature: `useAgentSocket(socket, setters)`. App.jsx reduced from 627 → 333 lines (within 250-line charter limit). No behaviour change — pure extraction.

---

### [2026-04-14] Test coverage for useAgentSocket and permissionResolver disconnect cleanup

**Author:** Simon | **Requested by:** hobobart

- `webapp/client/src/__tests__/useAgentSocket.test.js` — 10 tests using `renderHook` + mock socket.
- `webapp/server/__tests__/permissionResolver.test.js` — 8 tests using algorithm extracted as pure function `cleanupOrphanedResolvers` (server/index.js cannot be imported in isolation due to side effects).

Total after: 264 tests (81 server + 183 client).

---

### [2026-04-14] Top-3 planning priorities (Mal)

**Author:** Mal (Lead) | **Requested by:** hobobart

Three highest-priority items selected for immediate execution:
1. Fix orphaned permission resolver deadlock (Zoe + Simon)
2. Invert stopAgent opt-out to opt-in (Wash + Zoe review)
3. Extract App.jsx socket handlers into hook (Kaylee)

All three completed in the same session. See orchestration logs for per-agent detail.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
