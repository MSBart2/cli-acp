# SCREENSHOT-WORTHY UI STATES FOR DEPENDENCY-AWARENESS IMPROVEMENTS

## 1. BEST SCREENS/COMPONENTS TO SHOWCASE NEW WORK

### A. **AgentCard Component with Dependency Pills** ⭐⭐⭐ (HIGHEST PRIORITY)
- **Location**: webapp/client/src/components/AgentCard.jsx (lines 113-150)
- **What it shows**: 
  - Teal pills for manifest.dependsOn repos (lines 116-120)
  - Gray pills for manifest.dependedBy repos (lines 122-126)  
  - "No manifest · Create?" button when manifestMissing: true (lines 128-131)
  - "X deps not loaded" collapsible chip with per-dep "Load as Worker" buttons (lines 133-148)
  - **Impact checking** pulsing amber badge (lines 88-92)
- **Visual impact**: Shows the dependency relationship visualization at a glance
- **Screenshot suggestion**: Show an agent with 2-3 dependencies both ways + 1 unloaded dep

### B. **DependencyGraph Component** ⭐⭐⭐ (HIGHEST PRIORITY)
- **Location**: webapp/client/src/components/DependencyGraph.jsx (lines 27-174)
- **What it shows**:
  - Gradient-bordered panel with node/edge counts (lines 53-75)
  - Role-colored badges (library, api, webapp, service) with tech stack tags (lines 99-130)
  - Indented consumer hierarchy showing "api-gateway depends on class-lib-a" (lines 133-153)
  - Inconsistency warnings banner with amber highlight (lines 80-95)
  - "Refresh Manifests" button (lines 160-168)
- **Visual impact**: The primary "dependency DAG explorer"—shows entire cross-repo mesh
- **Screenshot suggestion**: 3-4 repos with mixed roles, 3-4 edges showing dependencies, optional warning banner

### C. **OrchestratorCard Component** ⭐⭐⭐ (HIGHEST PRIORITY)
- **Location**: webapp/client/src/components/OrchestratorCard.jsx (lines 25-310)
- **What it shows**:
  - Distinct teal gradient border & "ORCHESTRATOR coordinator" label (lines 69-87)
  - **Unloaded dependency neighbors banner** (lines 178-204) — blue pill showing detected downstream deps not yet loaded
  - "Load as Worker" buttons for unloaded deps with suggested URLs (lines 190-195)
  - Status changes: "Ready" → "Synthesizing" (busy) during broadcast synthesis (lines 14-21)
  - Output stream showing synthesized results from broadcast wave
- **Visual impact**: Shows how orchestrator integrates unloaded dependency awareness
- **Screenshot suggestion**: Show with unloaded deps banner visible + 1-2 "Load as Worker" buttons

### D. **RoutingPlanPanel Component** ⭐⭐ (MEDIUM PRIORITY)
- **Location**: webapp/client/src/components/RoutingPlanPanel.jsx (lines 4-71)
- **What it shows**:
  - Amber/orange gradient border indicating "requires approval"
  - Source prompt + routes table with editable downstream prompts
  - Route-specific prompts for different repos (showing dependency-aware routing)
  - Approve + Cancel buttons
- **Visual impact**: Shows dependency-aware prompt routing feature
- **Screenshot suggestion**: Show with 2-3 routes, one or two edited from defaults

### E. **App Layout with All Components Together** ⭐⭐ (CONTEXT)
- **Location**: webapp/client/src/App.jsx (lines 409-527)
- **What it shows**: 
  - MissionContext at top (lines 445)
  - OrchestratorCard below mission (lines 451-459)
  - DependencyGraph panel (line 462)
  - RoutingPlanPanel when plan is active (lines 463-467)
  - BroadcastInput bar (lines 474-484)
  - Worker grid with AgentCards (lines 489-500)
  - BroadcastResults panel below (lines 505-510)
- **Visual impact**: Shows full orchestration UI with dependency awareness
- **Screenshot suggestion**: 1 orchestrator + 3 workers, at least one with unloaded deps

---

## 2. MOCK/STATE DATA NEEDED TO RENDER THOSE STATES

### **For AgentCard with Full Dependency Features:**
\\\javascript
const mockAgent = {
  agentId: "worker-api-gateway",
  repoUrl: "https://github.com/myorg/api-gateway",
  repoName: "api-gateway",
  status: "ready",
  role: "worker",
  output: [
    { type: "text", content: "API gateway initialized." }
  ],
  
  // NEW dependency fields
  manifest: {
    dependsOn: ["class-lib-a", "common-config"],  // Teal pills
    dependedBy: ["web-dashboard"]                  // Gray pills
  },
  unloadedDeps: [
    { 
      repoName: "oauth-service", 
      direction: "dependsOn",
      suggestedUrl: "https://github.com/myorg/oauth-service"
    }
  ],
  manifestMissing: false,
  impactChecking: true  // Shows pulsing "Impact check…" badge
};
\\\

### **For DependencyGraph:**
\\\javascript
const mockDepGraph = {
  nodes: [
    { agentId: "a1", repoName: "class-lib-a", role: "library", techStack: ["node", "typescript"] },
    { agentId: "a2", repoName: "api-gateway", role: "api", techStack: ["express", "typescript"] },
    { agentId: "a3", repoName: "web-dashboard", role: "webapp", techStack: ["react", "vite"] },
    { agentId: "a4", repoName: "billing-service", role: "service", techStack: ["python", "fastapi"] }
  ],
  edges: [
    { from: "a2", to: "a1" },  // api-gateway → class-lib-a
    { from: "a3", to: "a2" },  // web-dashboard → api-gateway
    { from: "a4", to: "a1" }   // billing-service → class-lib-a
  ],
  warnings: [
    "Circular reference detected: billing-service → api-gateway → ? (check incomplete)",
    "Missing manifest: oauth-service is referenced but not in graph"
  ]
};
\\\

### **For OrchestratorCard with Unloaded Deps:**
\\\javascript
const mockOrchestratorUnloadedDeps = [
  {
    repoName: "oauth-service",
    suggestedUrl: "https://github.com/myorg/oauth-service",
    referencedBy: ["api-gateway"],
    directions: ["dependsOn"]
  },
  {
    repoName: "analytics-service", 
    suggestedUrl: "https://github.com/myorg/analytics-service",
    referencedBy: ["web-dashboard", "billing-service"],
    directions: ["dependsOn"]
  }
];

const mockOrchestratorAgent = {
  agentId: "orch-1",
  repoUrl: "https://github.com/myorg/cross-repo-ops",
  repoName: "cross-repo-ops",
  role: "orchestrator",
  status: "ready", // or "busy" for "Synthesizing"
  output: [
    { type: "text", content: "Synthesis complete. 4 workers processed. 2 deps detected as unloaded.\n\nRecommended load order:\n1. oauth-service (required by api-gateway)\n2. analytics-service (required by web-dashboard and billing-service)" }
  ]
};
\\\

### **For RoutingPlanPanel:**
\\\javascript
const mockRoutingPlan = {
  planId: "plan-doc-audit-20260209",
  sourceRepoName: "class-lib-a",
  originalPromptText: "Add field 'deprecated: boolean' to Customer schema and update all downstream usages.",
  routes: [
    {
      repoName: "api-gateway",
      promptText: "Update Customer DTO. Ensure backward compatibility. Update OpenAPI docs."
    },
    {
      repoName: "web-dashboard",
      promptText: "Update Customer form. Handle deprecated flag in UI logic."
    },
    {
      repoName: "billing-service",
      promptText: "Update billing queries. Filter out deprecated customers in reports."
    }
  ]
};
\\\

### **For Full App State (Integration):**
\\\javascript
const mockAppState = {
  missionContext: "Cross-repo documentation audit: bring all READMEs to current standards",
  
  agents: {
    "orch-1": mockOrchestratorAgent,
    "a2": {
      ...mockAgent,
      agentId: "a2",
      repoName: "api-gateway"
    },
    "a3": {
      agentId: "a3",
      repoUrl: "https://github.com/myorg/web-dashboard",
      repoName: "web-dashboard",
      status: "ready",
      role: "worker",
      manifest: { dependsOn: ["api-gateway"], dependedBy: [] },
      unloadedDeps: [],
      output: [{ type: "text", content: "React dashboard ready." }]
    },
    "a4": {
      agentId: "a4",
      repoUrl: "https://github.com/myorg/billing-service",
      repoName: "billing-service",
      status: "busy",
      role: "worker",
      manifest: { dependsOn: ["class-lib-a"], dependedBy: [] },
      unloadedDeps: [{ repoName: "analytics-service", direction: "dependsOn" }],
      output: [{ type: "text", content: "Analyzing billing schema…" }]
    }
  },
  
  depGraph: mockDepGraph,
  
  unloadedDeps: {
    "a2": [{ repoName: "oauth-service", direction: "dependsOn" }],
    "a4": [{ repoName: "analytics-service", direction: "dependsOn" }]
  },
  
  routingPlan: mockRoutingPlan,
  
  broadcastResults: {
    promptText: "Audit documentation…",
    timestamp: "2026-02-09T12:30:00Z",
    results: [
      { agentId: "a2", repoName: "api-gateway", status: "completed", output: "README stale…" },
      { agentId: "a3", repoName: "web-dashboard", status: "completed", output: "Missing architecture…" },
      { agentId: "a4", repoName: "billing-service", status: "error", output: "" }
    ]
  }
};
\\\

---

## 3. WHETHER STATES ARE TESTED OR CAN BE STAGED FROM EXISTING PROPS

| Component | Feature | Test Coverage | Can Be Staged? | Test File |
|-----------|---------|----------------|---|---|
| **AgentCard** | dependsOn pills | ✅ YES | ✅ YES | AgentCard.test.jsx:143-147 |
| **AgentCard** | dependedBy pills | ✅ YES | ✅ YES | AgentCard.test.jsx:149-153 |
| **AgentCard** | "No manifest" button | ✅ YES | ✅ YES | AgentCard.test.jsx:155-159 |
| **AgentCard** | unloadedDeps chip | ✅ YES | ✅ YES | AgentCard.test.jsx:169-173 |
| **AgentCard** | impactChecking badge | ✅ YES | ✅ YES | AgentCard.test.jsx:196-200 |
| **AgentCard** | Load unloaded dep flow | ✅ YES | ✅ YES | AgentCard.test.jsx:175-194 |
| **AgentCard** | Spawning progress | ✅ YES | ✅ YES | AgentCard.test.jsx:35-46 |
| **DependencyGraph** | Node/edge rendering | ✅ YES | ✅ YES | DependencyGraph.test.jsx:32-37 |
| **DependencyGraph** | Role badges | ✅ YES | ✅ YES | DependencyGraph.test.jsx:39-43 |
| **DependencyGraph** | Warnings banner | ✅ YES | ✅ YES | DependencyGraph.test.jsx:45-49 |
| **DependencyGraph** | Collapse/expand | ✅ YES | ✅ YES | DependencyGraph.test.jsx:66-73 |
| **OrchestratorCard** | Unloaded dep neighbors | ✅ YES | ✅ YES | OrchestratorCard.test.jsx:125-147 |
| **OrchestratorCard** | Status Ready/Synthesizing | ✅ YES | ✅ YES | OrchestratorCard.test.jsx:35-43 |
| **OrchestratorCard** | Spawning stepper | ✅ YES | ✅ YES | OrchestratorCard.test.jsx:45-54 |
| **RoutingPlanPanel** | Route rendering | ✅ YES | ✅ YES | RoutingPlanPanel.test.jsx:16-20 |
| **RoutingPlanPanel** | Editable prompts | ✅ YES | ✅ YES | RoutingPlanPanel.test.jsx:22-27 |
| **App** | Full orchestrator layout | ✅ PARTIAL | ✅ YES | App.test.jsx (uses mocks) |

✅ **All key features are covered by existing tests** and can be easily staged using the test helper functions.

---

## 4. EASIEST PATHS TO GENERATE SCREENSHOTS LOCALLY

### **Option A: Use Existing Test Fixtures (RECOMMENDED FOR QUICK ITERATION) ⭐⭐⭐**

**Advantage**: Test data already exists, minimal setup, super fast iteration.

**Steps**:
1. Create a new **storybook-style** test file: webapp/client/src/__tests__/ScreenshotShowcase.jsx
2. Copy the helper functions from existing tests:
   - makeAgent() from AgentCard.test.jsx
   - makeGraph() from DependencyGraph.test.jsx
   - Routing plan object from RoutingPlanPanel.test.jsx
3. Build "screenshot states" by combining these mocks:

\\\javascript
// webapp/client/src/__tests__/ScreenshotShowcase.jsx
import { render } from "@testing-library/react";
import AgentCard from "../components/AgentCard";
import DependencyGraph from "../components/DependencyGraph";
import OrchestratorCard from "../components/OrchestratorCard";
import RoutingPlanPanel from "../components/RoutingPlanPanel";

// Use existing test helpers
function makeAgent(overrides = {}) { /* ... from AgentCard.test */ }
function makeGraph(overrides = {}) { /* ... from DependencyGraph.test */ }

// Screenshot scenario 1: Worker with dependencies
export function ScreenshotAgentWithDeps() {
  const agent = makeAgent({
    manifest: { dependsOn: ["class-lib-a", "common-config"], dependedBy: ["web-dashboard"] },
    unloadedDeps: [{ repoName: "oauth-service", direction: "dependsOn", suggestedUrl: "..." }],
    impactChecking: true,
    status: "ready"
  });
  return render(
    <AgentCard agent={agent} onSendPrompt={() => {}} onStop={() => {}} onPermissionResponse={() => {}} />
  );
}

// Screenshot scenario 2: Dependency graph with warnings
export function ScreenshotDependencyGraphWithWarnings() {
  const graph = makeGraph({
    nodes: [
      { agentId: "a1", repoName: "class-lib-a", role: "library", techStack: ["node"] },
      { agentId: "a2", repoName: "api-gateway", role: "api", techStack: ["typescript"] },
      { agentId: "a3", repoName: "web-dashboard", role: "webapp", techStack: ["react"] }
    ],
    edges: [
      { from: "a2", to: "a1" },
      { from: "a3", to: "a2" }
    ],
    warnings: ["Missing manifest: oauth-service"]
  });
  return render(<DependencyGraph graph={graph} onRefresh={() => {}} />);
}

// ... etc
\\\

4. **Take screenshots in a browser** using Playwright/Puppeteer or just DevTools:
\\\ash
npm run test -- ScreenshotShowcase.jsx --ui
# Then open browser dev tools and capture
\\\

---

### **Option B: Use Storybook (IF you want polished UI showcase) ⭐⭐**

**Advantage**: Professional presentation, interactive controls, hot reload.

**Steps**:
1. Create .stories.jsx files:
   - AgentCard.stories.jsx
   - DependencyGraph.stories.jsx
   - OrchestratorCard.stories.jsx
   - RoutingPlanPanel.stories.jsx

2. Example structure:
\\\javascript
// webapp/client/src/components/AgentCard.stories.jsx
import AgentCard from "./AgentCard";

export default {
  component: AgentCard,
  title: "Components/AgentCard"
};

export const WithDependencies = {
  args: {
    agent: {
      agentId: "a1",
      repoUrl: "https://github.com/org/api-gateway",
      repoName: "api-gateway",
      status: "ready",
      manifest: { dependsOn: ["class-lib-a"], dependedBy: ["web-dashboard"] },
      unloadedDeps: [{ repoName: "oauth-service", direction: "dependsOn" }],
      impactChecking: true,
      output: [{ type: "text", content: "Ready to go." }]
    },
    onSendPrompt: () => {},
    onStop: () => {}
  }
};

export const WithImpactChecking = { ... };
export const Spawning = { ... };
\\\

3. Install & run Storybook:
\\\ash
npm install --save-dev @storybook/react @storybook/cli
npx storybook init
npm run storybook
\\\

4. **Take screenshots** using Storybook's built-in snapshot or browser capture.

---

### **Option C: Run App Locally & Stage via Socket Events (MOST REALISTIC)**

**Advantage**: Shows actual app behavior, real layouts, responsive design.

**Steps**:
1. Start the app: 
pm run dev
2. **Manually trigger states via browser DevTools console**:

\\\javascript
// In browser console (inject mock socket events)
// Assuming socket is available in window.app context

// Trigger orchestrator creation
socket.emit("agent:created", {
  agentId: "orch-1",
  repoUrl: "https://github.com/myorg/cross-repo-ops",
  repoName: "cross-repo-ops",
  role: "orchestrator"
});

// Trigger worker with unloaded deps
socket.emit("agent:created", {
  agentId: "a2",
  repoUrl: "https://github.com/myorg/api-gateway",
  repoName: "api-gateway",
  role: "worker"
});

// Trigger dependency graph
socket.emit("graph:updated", {
  nodes: [
    { agentId: "a1", repoName: "class-lib-a", role: "library", techStack: ["node"] },
    { agentId: "a2", repoName: "api-gateway", role: "api", techStack: ["typescript"] }
  ],
  edges: [{ from: "a2", to: "a1" }],
  warnings: []
});

// Trigger unloaded deps
socket.emit("graph:unloaded_deps", {
  agentId: "a2",
  unloaded: [{ repoName: "oauth-service", direction: "dependsOn", suggestedUrl: "..." }]
});
\\\

3. Take screenshots via browser or screenshot tool.

---

### **Option D: Component Harness HTML File (LIGHTEST WEIGHT) ⭐ (FASTEST)**

**Advantage**: Zero dependencies, instant rendering, plain HTML.

**Create**: webapp/client/screenshots-harness.html

\\\html
<!DOCTYPE html>
<html>
<head>
  <title>Dependency Awareness Screenshots</title>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { @apply bg-[#0a0a0f] text-white; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
    // Paste inline component code + mock data here
    // Render to #root
  </script>
</body>
</html>
\\\

---

## 5. RECOMMENDED SCREENSHOT SCENARIOS

### **Screenshot 1: AgentCard with Dependency Relationships** 
- **Show**: API Gateway agent with:
  - 2 teal "dependsOn" pills (class-lib-a, common-config)
  - 1 gray "dependedBy" pill (web-dashboard)
  - 1 unloaded dependency chip showing "1 dep not loaded"
  - Collapsed unloaded deps list (expand to show "oauth-service (dependsOn) · Load as Worker")
- **File**: AgentCard.jsx lines 113-150
- **Test data**: AgentCard.test.jsx lines 143-194
- **Why**: Shows the core dependency visualization feature

### **Screenshot 2: DependencyGraph with Multiple Roles**
- **Show**: DAG with 4 repos:
  - class-lib-a (library role, teal badge)
  - api-gateway (api role, blue badge)
  - web-dashboard (webapp role, purple badge)
  - billing-service (service role, amber badge)
  - 3 dependency edges showing hierarchy
  - 1 warning banner (top) showing inconsistency
- **File**: DependencyGraph.jsx lines 27-174
- **Test data**: DependencyGraph.test.jsx lines 5-15
- **Why**: Shows the complete dependency mesh at a glance

### **Screenshot 3: OrchestratorCard with Unloaded Neighbors**
- **Show**: Orchestrator card (teal gradient border, "ORCHESTRATOR coordinator" label) with:
  - Blue "Unloaded dependency neighbors detected" banner (expanded)
  - 2 unloaded deps listed with suggested URLs
  - "Load as Worker" buttons for each
  - Status badge showing "Ready" or "Synthesizing"
  - Sample output showing synthesis results
- **File**: OrchestratorCard.jsx lines 25-310, especially 178-204
- **Test data**: OrchestratorCard.test.jsx lines 125-147
- **Why**: Shows orchestrator's role in detecting & guiding dep loading

### **Screenshot 4: RoutingPlanPanel**
- **Show**: Amber gradient border panel with:
  - Source prompt (class-lib-a change)
  - 3 editable route prompts for api-gateway, web-dashboard, billing-service
  - One route with edited downstream prompt (different from default)
  - Approve & Cancel buttons
- **File**: RoutingPlanPanel.jsx lines 4-71
- **Test data**: RoutingPlanPanel.test.jsx lines 5-13
- **Why**: Shows dependency-aware prompt routing

### **Screenshot 5: Full App Layout (Integration)**
- **Show**: Entire page with:
  - MissionContext at top
  - OrchestratorCard with unloaded deps banner
  - DependencyGraph panel below
  - BroadcastInput bar
  - Worker grid: 3 agents with mixed statuses & unloaded deps
  - BroadcastResults panel (bottom) showing coalesced findings
- **File**: App.jsx lines 409-527
- **Why**: Shows how all pieces fit together in the real UI

### **Screenshot 6: AgentCard Spawning State**
- **Show**: Worker agent in "Spawning" status with:
  - Spinner icon + "Starting…" message
  - Progress stepper: cloning ✓ → starting (pulsing) → verifying (waiting)
  - Disabled input field ("Agent is spawning…")
  - Status badge with pulsing green dot
- **File**: AgentCard.jsx lines 158-182
- **Test data**: AgentCard.test.jsx lines 35-46
- **Why**: Shows the initialization UX for new agents

### **Screenshot 7: Impact Checking Badge**
- **Show**: Worker agent with:
  - Status badge showing "Ready"
  - Amber "Impact check…" badge (pulsing) next to status
- **File**: AgentCard.jsx lines 88-92
- **Test data**: AgentCard.test.jsx lines 196-200
- **Why**: Shows the visual indicator for downstream impact analysis

---

## QUICKEST PATH TO SCREENSHOTS

\\\ash
# 1. Use existing test data + render components
# 2. Run Vitest with UI: npm run test -- --ui
# 3. Navigate to AgentCard, DependencyGraph, OrchestratorCard tests
# 4. In the test runner UI, each test case displays the rendered component
# 5. Browser DevTools → Screenshot to capture
\\\

**Or:**

\\\ash
# 1. Copy AgentCard.test.jsx makeAgent() helper
# 2. Create a simple React app in a .tsx file
# 3. Import AgentCard and render with mock agent
# 4. npm run dev → view at localhost:5173
# 5. Use Playwright or browser screenshot tool
\\\

**Or (fastest):**

\\\ash
# Open Chrome DevTools → Console
# Navigate to a running Vitest test that renders the component
# Use Inspect Element, toggle classes, or use Playwright screenshot API
\\\

---

## SUMMARY TABLE

| Screenshot | Component | Test File | Mock Data | Easiest Method |
|---|---|---|---|---|
| 1. Agent with Deps | AgentCard | AgentCard.test.jsx:143-194 | ✅ Exists | Vitest UI + DevTools |
| 2. Dependency Graph | DependencyGraph | DependencyGraph.test.jsx:5-15 | ✅ Exists | Vitest UI + DevTools |
| 3. Orchestrator Unloaded | OrchestratorCard | OrchestratorCard.test.jsx:125-147 | ✅ Exists | Vitest UI + DevTools |
| 4. Routing Plan | RoutingPlanPanel | RoutingPlanPanel.test.jsx:5-13 | ✅ Exists | Vitest UI + DevTools |
| 5. Full App Layout | App | App.test.jsx | ✅ Mocked | Local dev + manual staging |
| 6. Spawning State | AgentCard | AgentCard.test.jsx:35-46 | ✅ Exists | Vitest UI + DevTools |
| 7. Impact Checking | AgentCard | AgentCard.test.jsx:196-200 | ✅ Exists | Vitest UI + DevTools |

---

## KEY INSIGHT

**All test data already exists in the test files.** The cleanest approach is:

1. Open test files in IDE
2. Copy the makeAgent() / makeGraph() helpers + test data objects
3. Create a simple React component that renders with that data
4. View in Vitest UI or local dev server
5. Screenshot

This takes ~15 minutes per screenshot since the heavy lifting is done.
