**Crafting ACP orchestration**I’m thinking through the use of the ACP SDK and office365_search for orchestrating changes across multiple repositories, including meetings, transcripts, files, and emails.
Absolutely—**ACP is the missing “control plane”** that lets you treat **GitHub Copilot CLI as a multi-session agent server** and then drive **10 parallel, repo-scoped agents** from one orchestrator.

Below is a concrete way to do your “**add `middleName` to Customer across 10 poly-repo microservices**” scenario with ACP, while keeping each agent safely scoped to its own repo and tech stack.

---

## 1) What ACP gives you (the primitives you orchestrate with)

When you start Copilot CLI in ACP mode, it becomes an **ACP server** you can connect to either via stdio or TCP: `copilot --acp` (stdio) or `copilot --acp --port …` (TCP). [1](https://azure.microsoft.com/en-us/blog/agentic-devops-evolving-software-development-with-github-copilot-and-microsoft-azure/)[2](https://azure.microsoft.com/en-us/products/github/copilot)

From there, ACP clients can:  
- **Create isolated sessions** (think: one “agent instance” per repo) **with custom working directories** [1](https://azure.microsoft.com/en-us/blog/agentic-devops-evolving-software-development-with-github-copilot-and-microsoft-azure/)[2](https://azure.microsoft.com/en-us/products/github/copilot)  
- **Send prompts** (and context resources) and receive **streaming updates** [1](https://azure.microsoft.com/en-us/blog/agentic-devops-evolving-software-development-with-github-copilot-and-microsoft-azure/)[2](https://azure.microsoft.com/en-us/products/github/copilot)  
- **Handle permission requests** for tool execution, and **cancel / manage session lifecycle** [1](https://azure.microsoft.com/en-us/blog/agentic-devops-evolving-software-development-with-github-copilot-and-microsoft-azure/)[2](https://azure.microsoft.com/en-us/products/github/copilot)  

That “custom working directory per session” is the key for poly-repo microservices: you can run **10 sessions**, each pinned to a different repo path, each obeying that repo’s build/test instructions.

---

## 2) Why this works well for poly-repo microservices

Copilot CLI is fundamentally **directory-scoped**—it prompts you to trust a folder because it may read/modify/execute files beneath it. [3](https://microsofteur.sharepoint.com/teams/InnovationMicrosoftSpain/_layouts/15/Doc.aspx?sourcedoc=%7BCBA690CA-BF70-42E6-AEFC-8CC77B98B732%7D&file=GitHub%20Copilot%20Customer%20Presentation.PPTX&action=edit&mobileredirect=true&DefaultItemOpen=1)  
In poly-repo land, that’s a feature: each microservice agent can be **sandboxed to exactly one repo**, with repo-specific conventions enforced via instructions.

GitHub’s own “best practices” guidance notes Copilot CLI reads **custom instruction files from multiple locations** (global + repo), with **repo instructions taking precedence**. [4](https://outlook.office365.com/owa/?ItemID=AAMkADBkZmQ1NDkwLTUwNDYtNGMyZS05NjNkLTVlY2I2NzcxZjYzZQBGAAAAAADdNtyMI3i8RbTIq5s%2bgXLcBwBoYKHXpjDqSaChc1M7sNAIAAAI%2b9aNAAALzw%2fG2zTIT7788udt3LOoAAmvJjxuAAA%3d&exvsurl=1&viewmodel=ReadMessageItem)  
So each repo can declare “how to build/test/migrate schema” and your orchestrator doesn’t have to re-teach it every time.

---

## 3) High-level orchestration strategy for “Add `middleName` everywhere”

Think of this change as a **multi-repo program** with four phases:

### Phase A — Discovery (map the “Customer surface area” per service)
For each repo-session, have the agent produce a **structured inventory**:
- Where `Customer` is defined (domain model / DTO / schema)
- Where it is serialized (API contracts, protobuf/OpenAPI/JSON, events)
- Where it is persisted (SQL schema, NoSQL doc, state store)
- Key test commands and migration commands (from repo instructions)

This is exactly the kind of work you want done **in parallel** across 10 services.

### Phase B — Plan (per-repo plan + cross-repo compatibility plan)
Each repo-agent produces an implementation plan, but your orchestrator also produces a **cross-repo plan**:
- canonical definition: `middleName?: string | null` vs required
- versioning strategy (backwards compatible contracts)
- migration rollout order (producers before consumers if message-based)

### Phase C — Execute (implement + tests + diff)
Each repo-agent edits code, runs tests/build, and generates a reviewable diff. Copilot CLI includes `/diff` to review changes. [5](https://microsoft.sharepoint.com/teams/ASDIPRelease/_layouts/15/Doc.aspx?sourcedoc=%7BA34EEAB5-10EC-4021-8B0E-389560376FA1%7D&file=10_25%20-%20GitHub%20Copilot%20Technical%20Update%20Briefing.pptx&action=edit&mobileredirect=true&DefaultItemOpen=1)  

### Phase D — Package (PRs + summary + rollout notes)
Have each repo-agent prep a PR (or at least a branch + changes + summary). (How you do PR creation can be via whatever tooling your environment uses; Copilot CLI has `/share` and can export session transcripts too.) [5](https://microsoft.sharepoint.com/teams/ASDIPRelease/_layouts/15/Doc.aspx?sourcedoc=%7BA34EEAB5-10EC-4021-8B0E-389560376FA1%7D&file=10_25%20-%20GitHub%20Copilot%20Technical%20Update%20Briefing.pptx&action=edit&mobileredirect=true&DefaultItemOpen=1)  

---

## 4) Concrete ACP orchestrator design (what you actually build)

### Option 1 (most common): **One Copilot ACP server, many sessions**
Start one process: `copilot --acp --stdio` and create **10 sessions**, each with `cwd` pointing at a different repo path. The GitHub changelog explicitly calls out: **“Create isolated sessions with custom working directories.”** [1](https://azure.microsoft.com/en-us/blog/agentic-devops-evolving-software-development-with-github-copilot-and-microsoft-azure/)[2](https://azure.microsoft.com/en-us/products/github/copilot)

Pros: simplest process model, one auth context.  
Cons: you’ll want to manage concurrency so you’re not flooded with permission prompts.

### Option 2: **One ACP server per repo**
Start 10 `copilot --acp` processes (one per repo).  
Pros: maximal isolation; easy parallelism.  
Cons: more processes to manage.

Both are valid; the primitives are the same.

---

## 5) A practical “controller loop” (how the orchestrator talks to 10 repo agents)

GitHub’s ACP server doc includes a TypeScript example using `@agentclientprotocol/sdk`, spawning Copilot CLI with `--acp --stdio`, and wiring an NDJSON stream. [2](https://azure.microsoft.com/en-us/products/github/copilot)

Below is a **controller pattern** (illustrative) that matches those documented building blocks (spawn Copilot, NDJSON stream, client, then sessions) [2](https://azure.microsoft.com/en-us/products/github/copilot):

```ts
// PSEUDOCODE STYLE (patterned after GitHub's ACP stdio example)
import * as acp from "@agentclientprotocol/sdk";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";

const copilot = spawn("copilot", ["--acp", "--stdio"], { stdio: ["pipe","pipe","inherit"] });

const output = Writable.toWeb(copilot.stdin!) as WritableStream<Uint8Array>;
const input  = Readable.toWeb(copilot.stdout!) as ReadableStream<Uint8Array>;
const stream = acp.ndJsonStream(output, input);

const client = acp.createClient(stream, {
  async requestPermission(req) {
    // Your policy: auto-approve read-only tools, require human approval for writes/tests
    // ACP supports permission requests handling. [1](https://azure.microsoft.com/en-us/blog/agentic-devops-evolving-software-development-with-github-copilot-and-microsoft-azure/)[2](https://azure.microsoft.com/en-us/products/github/copilot)
    return { approved: false, message: "Require manual approval" };
  }
});

// Create 10 isolated sessions (one per repo working directory). [1](https://azure.microsoft.com/en-us/blog/agentic-devops-evolving-software-development-with-github-copilot-and-microsoft-azure/)[2](https://azure.microsoft.com/en-us/products/github/copilot)
const repos = [
  { name: "svc-a", cwd: "/repos/svc-a" },
  { name: "svc-b", cwd: "/repos/svc-b" },
  // ...
];

const sessions = await Promise.all(repos.map(r => client.createSession({ cwd: r.cwd })));

// Phase A prompt: discovery inventory
const discoveryPrompt = `
Find all Customer definitions and usages that affect persistence and public contracts.
Return JSON:
{
  "customerTypes": [...],
  "storage": {...},
  "contracts": [...],
  "buildTestCommands": [...],
  "migrationNotes": [...]
}
`;

// Run discovery in parallel across sessions
const inventories = await Promise.all(sessions.map(s => s.prompt({ text: discoveryPrompt })));
```

**What matters**: the *shape* of the loop:
1) start ACP server (`copilot --acp`) [1](https://azure.microsoft.com/en-us/blog/agentic-devops-evolving-software-development-with-github-copilot-and-microsoft-azure/)[2](https://azure.microsoft.com/en-us/products/github/copilot)  
2) create sessions with per-repo `cwd` [1](https://azure.microsoft.com/en-us/blog/agentic-devops-evolving-software-development-with-github-copilot-and-microsoft-azure/)[2](https://azure.microsoft.com/en-us/products/github/copilot)  
3) prompt them in parallel; stream updates; handle permissions [1](https://azure.microsoft.com/en-us/blog/agentic-devops-evolving-software-development-with-github-copilot-and-microsoft-azure/)[2](https://azure.microsoft.com/en-us/products/github/copilot)  

---

## 6) How you keep 10 agents from stepping on rakes (governance + repeatability)

### A) Put “how to build/test/migrate” into repo instructions
Per GitHub guidance, keep service-specific commands in repo instruction files so Copilot doesn’t guess. Repo instructions override global ones. [4](https://outlook.office365.com/owa/?ItemID=AAMkADBkZmQ1NDkwLTUwNDYtNGMyZS05NjNkLTVlY2I2NzcxZjYzZQBGAAAAAADdNtyMI3i8RbTIq5s%2bgXLcBwBoYKHXpjDqSaChc1M7sNAIAAAI%2b9aNAAALzw%2fG2zTIT7788udt3LOoAAmvJjxuAAA%3d&exvsurl=1&viewmodel=ReadMessageItem)

### B) Use slash commands as the “standard operations”
Copilot CLI has stable commands for changing scope and reviewing work:
- `/cwd` and `/cd` (ensure session is in correct directory) [5](https://microsoft.sharepoint.com/teams/ASDIPRelease/_layouts/15/Doc.aspx?sourcedoc=%7BA34EEAB5-10EC-4021-8B0E-389560376FA1%7D&file=10_25%20-%20GitHub%20Copilot%20Technical%20Update%20Briefing.pptx&action=edit&mobileredirect=true&DefaultItemOpen=1)  
- `/diff` (review changes) [5](https://microsoft.sharepoint.com/teams/ASDIPRelease/_layouts/15/Doc.aspx?sourcedoc=%7BA34EEAB5-10EC-4021-8B0E-389560376FA1%7D&file=10_25%20-%20GitHub%20Copilot%20Technical%20Update%20Briefing.pptx&action=edit&mobileredirect=true&DefaultItemOpen=1)  
- `/add-dir` (if you need to grant limited cross-dir access—use sparingly) [5](https://microsoft.sharepoint.com/teams/ASDIPRelease/_layouts/15/Doc.aspx?sourcedoc=%7BA34EEAB5-10EC-4021-8B0E-389560376FA1%7D&file=10_25%20-%20GitHub%20Copilot%20Technical%20Update%20Briefing.pptx&action=edit&mobileredirect=true&DefaultItemOpen=1)  

(Your ACP prompts can instruct agents to use these commands in their workflow; even if you don’t rely on slash commands directly, they’re the canonical operations Copilot CLI supports.) [5](https://microsoft.sharepoint.com/teams/ASDIPRelease/_layouts/15/Doc.aspx?sourcedoc=%7BA34EEAB5-10EC-4021-8B0E-389560376FA1%7D&file=10_25%20-%20GitHub%20Copilot%20Technical%20Update%20Briefing.pptx&action=edit&mobileredirect=true&DefaultItemOpen=1)

### C) Decide your permission policy up front
ACP explicitly supports **permission requests** and client responses. [1](https://azure.microsoft.com/en-us/blog/agentic-devops-evolving-software-development-with-github-copilot-and-microsoft-azure/)[2](https://azure.microsoft.com/en-us/products/github/copilot)  
**Suggestion**: auto-approve read-only operations (search/grep/list) and require human approval for anything that writes, runs migrations, or hits networks.

### D) Use structured outputs between phases
If each agent returns JSON for discovery + plan + execution summary, your orchestrator can:
- detect “this service doesn’t have Customer”
- detect contract risk (“middleName required” vs optional)
- generate a unified rollout plan

---

## 7) What about “multi-agent task tracking / waves” like a scheduler?

In <MeetingTranscript>Copilot CLI Office Hours</MeetingTranscript>, Steve Sanderson shows an **underlying task tracking system in a SQLite database** with “waves of tasks” and dependency dispatch—within Copilot CLI’s parallel task execution modes. [6](https://microsoft-my.sharepoint.com/personal/jogallow_microsoft_com/Documents/Recordings/Copilot%20CLI%20Office%20Hours-20260206_164944UTC-Meeting%20Recording.mp4?web=1)  
And another <MeetingTranscript>Copilot CLI Office Hours</MeetingTranscript> discussion notes **multiple sessions connected to the same server** and that “you can wire these together using something like message queue,” with exploration around SQLite-based task management for orchestration. [7](https://microsoft-my.sharepoint.com/personal/jogallow_microsoft_com/Documents/Recordings/Copilot%20CLI%20Office%20Hours-20260130_165042UTC-Meeting%20Recording.mp4?web=1)  

**How to apply that here (suggestion)**: your orchestrator becomes the “message queue”:
- Phase A discovery across all repos
- Phase B plans validated
- Phase C execution in controlled waves (e.g., start with services that *define* canonical Customer; then consumers; then event schemas)

I’m calling this out as a *pattern* because the sources confirm the building blocks (sessions, orchestration interest, task tracking), but they don’t prescribe a single official scheduler architecture. [6](https://microsoft-my.sharepoint.com/personal/jogallow_microsoft_com/Documents/Recordings/Copilot%20CLI%20Office%20Hours-20260206_164944UTC-Meeting%20Recording.mp4?web=1)[7](https://microsoft-my.sharepoint.com/personal/jogallow_microsoft_com/Documents/Recordings/Copilot%20CLI%20Office%20Hours-20260130_165042UTC-Meeting%20Recording.mp4?web=1)

---

## 8) Putting it together: a recommended playbook for your “middleName” change

Here’s a crisp, repeatable orchestration you can implement today:

1) **Start ACP server** (`copilot --acp`) [1](https://azure.microsoft.com/en-us/blog/agentic-devops-evolving-software-development-with-github-copilot-and-microsoft-azure/)[2](https://azure.microsoft.com/en-us/products/github/copilot)  
2) **Create 10 sessions** with `cwd` = each service repo [1](https://azure.microsoft.com/en-us/blog/agentic-devops-evolving-software-development-with-github-copilot-and-microsoft-azure/)[2](https://azure.microsoft.com/en-us/products/github/copilot)  
3) **Discovery prompt** → get structured JSON inventory per repo  
4) Orchestrator compiles a **canonical contract decision**: optional vs required; null semantics  
5) **Plan prompt** per repo: “Update models, storage schema, serializers, tests. Keep backward compatibility.”  
6) **Execution prompt** per repo: implement + run build/test commands defined in repo instructions [4](https://outlook.office365.com/owa/?ItemID=AAMkADBkZmQ1NDkwLTUwNDYtNGMyZS05NjNkLTVlY2I2NzcxZjYzZQBGAAAAAADdNtyMI3i8RbTIq5s%2bgXLcBwBoYKHXpjDqSaChc1M7sNAIAAAI%2b9aNAAALzw%2fG2zTIT7788udt3LOoAAmvJjxuAAA%3d&exvsurl=1&viewmodel=ReadMessageItem)  
7) **Review step**: require each repo agent to provide `/diff` output summary and risks [5](https://microsoft.sharepoint.com/teams/ASDIPRelease/_layouts/15/Doc.aspx?sourcedoc=%7BA34EEAB5-10EC-4021-8B0E-389560376FA1%7D&file=10_25%20-%20GitHub%20Copilot%20Technical%20Update%20Briefing.pptx&action=edit&mobileredirect=true&DefaultItemOpen=1)  
8) **Package**: export session summaries or PR-ready descriptions; orchestrator generates cross-repo rollout doc

---

## One quick (optional) follow-up so I can make this *immediately codeable* for you
Do you want your orchestrator written in **TypeScript** (closest to the GitHub ACP example) or **Python/Go/.NET**? The session-and-cwd approach stays the same; only the ACP client library wiring changes. [2](https://azure.microsoft.com/en-us/products/github/copilot)
