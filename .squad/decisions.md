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

---

### [2026-04-14] Extract ACP client callbacks as named factory functions

**Author:** Zoe | **Requested by:** hobobart

Extracted `createRequestPermissionHandler` and `createSessionUpdateHandler` from inside `createAgent` into named module-level factory functions in `server/index.js`. Both return the async callback used by `ClientSideConnection`. `activeBroadcastWave` is accessed via `getActiveBroadcastWave()` / `setActiveBroadcastWave()` accessor pairs rather than direct closure over the module `let`.

**Rule:** ACP client callbacks must live as named factory functions at module level — not as anonymous closures inside `createAgent`. This keeps them importable and unit-testable without a real copilot process.

---

### [2026-04-14] mission:set uses io.emit — intentional

**Author:** Wash | **Requested by:** hobobart

`io.emit("mission:updated", ...)` inside `mission:set` is intentional and correct. `agents` is a server-global Map (not socket-scoped); `buildMissionPrefix()` injects `globalMissionContext` into every prompt. If a tab doesn't receive the broadcast it shows agents operating under a brief it can't read — incoherent for a single-user local tool. Comment on the emit line was expanded to explain this. No behavioral change.

**Rule:** `io.emit` for `mission:updated` must remain as-is until agents become socket-scoped (a much larger architectural change). `mission:get` correctly uses `socket.emit` (tab-scoped refresh only).

---

### [2026-04-14] E2E acceptance criteria directive

**Author:** hobobart (via Copilot)

E2E tests are required as part of acceptance criteria for any significant or dangerous work. Squad coordinator decides when work qualifies — use judgment. Unit tests alone are not sufficient for shipping risky changes.

---

### [2026-04-14] Extract StatusBadge and OutputLog shared components

**Author:** Kaylee | **Requested by:** hobobart

Introduced `components/StatusBadge.jsx` and `components/OutputLog.jsx` to eliminate duplication between `AgentCard.jsx` and `OrchestratorCard.jsx`. Both use a `variant="worker"|"orchestrator"` prop to encode per-card styling differences. `AgentCard`'s `window.prompt()` for unloaded-dep URL entry replaced with inline controlled input (`loadingDepUrl` state).

**Rule:** New shared UI primitives belong in `components/` as default-exported functional components. Use a `variant` prop (string union) for per-card appearance differences. Never use `window.prompt()` for user input — use controlled React state + inline inputs.

---

### [2026-04-14] Wait for toast notifications before hover in e2e tests

**Author:** Simon | **Requested by:** hobobart

Before calling `row.hover()` in the re-spawn restore e2e test, wait for all `[data-rht-toaster] [role="status"]` elements to reach `hidden` state (up to 15 s). `.catch(() => {})` makes the guard non-blocking when no toasts are present.

**Rule:** Any e2e hover that could race with a react-hot-toast notification must use `waitFor({ state: "hidden" })` on `[data-rht-toaster] [role="status"]` before hovering. Never use `waitForTimeout` as a substitute.

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
