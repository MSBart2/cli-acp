# Scenario 1: Service Audit and API Alignment

This is the fastest way to understand the ACP Agent Orchestrator in a microservices context.

You will launch the orchestrator and all workers, send a broadcast audit prompt to understand each service's current state, and watch the orchestrator synthesize findings into a unified architectural view.

## When to use this scenario

Use this walkthrough when:

- you are new to the tool and want a quick foundation
- you need a baseline audit of your microservices architecture
- you want to ensure all services are aligned on API contracts, error handling, and shared patterns
- you're onboarding to a multi-service system and need to understand each service's role

## Setup

Your shopfleet deployment spans eight microservices:

| Repo | Role |
| --- | --- |
| `shopfleet-orchestrator` | coordination and synthesis |
| `shopfleet-shared` | shared types, schemas, utilities |
| `shopfleet-users` | user account and profile management |
| `shopfleet-products` | product catalog and pricing |
| `shopfleet-orders` | order management and fulfillment |
| `shopfleet-payments` | payment processing and reconciliation |
| `shopfleet-notifications` | email, SMS, and push notifications |
| `shopfleet-storefront` | web UI and customer experience |

All repos launch automatically via `.env` defaults. No manual setup needed.

## Goal

Audit each microservice and synthesize findings into a unified architectural view. This teaches:

1. **Broadcast**: How to ask the same question across many repos
2. **Worker output**: How each service responds to a common prompt
3. **Synthesis**: How the orchestrator turns many outputs into one coherent view
4. **Integration points**: Where services call each other and what contracts they depend on

## Workflow

### Phase 1: Launch all repos

Refresh the browser (or navigate to `http://localhost:5173`). The app will automatically spawn:

- 1 orchestrator (`shopfleet-orchestrator`)
- 7 workers (all shopfleet-* services)

Wait for all cards to show **Ready** (green status). This usually takes 30–60 seconds as each repo is cloned and a Copilot agent is initialized.

**What you're seeing:**

- Each card represents one running agent
- The **Orchestrator Card** (top) is the orchestrator agent
- The **Worker Cards** (below) are service agents
- **Ready** means the agent has analyzed its repo and is waiting for a prompt

### Phase 2: Send a service audit broadcast

In the **Broadcast Input** section, send this prompt to all workers:

```text
Audit this microservice. Return:

1. Service Purpose
   - One sentence: what does this service do?
   - Owner domain (e.g., payments, user identity, product catalog)

2. Main API Endpoints
   - List the 3-5 most important REST endpoints (or gRPC methods)
   - For each, show: method, path, brief purpose

3. Data Model
   - What are the core domain objects? (e.g., User, Product, Order)
   - What does this service own vs. reference from other services?

4. Dependencies
   - Does this service call other shopfleet services? List them.
   - What external services does it depend on? (e.g., Stripe, SendGrid)

5. Error Handling
   - How does this service handle errors? (Exceptions, error codes, retry logic)
   - Any known edge cases or failure modes?

6. Configuration
   - How is this service configured? (Env vars, config files, secrets)
   - Are there any missing configs that should be documented?
```

**Why this prompt?**

It's broad enough that every service can answer it (no one is excluded by domain), but specific enough that you get actionable intelligence about architecture alignment.

### Phase 3: Watch worker responses

As workers complete, their cards will show:

- **Streaming output**: The agent's response appearing in real-time
- **Broadcast Results panel**: Coalesced output from all workers

You should see eight service summaries appearing, one after another. Each service describes itself independently.

Take a few minutes to read the summaries as they come in. Notice:

- Do all services describe their role clearly?
- Are there any obvious gaps (missing error handling, no dependency tracking)?
- Do the API endpoints align with what you expected?

### Phase 4: Add Orchestrator Focus for synthesis

Now the orchestrator's role kicks in. Add this to the **Orchestrator Focus** section (below the main broadcast prompt):

```text
From the service audit, synthesize:

1. ARCHITECTURE MAP
   - Create a text-based dependency graph showing which services call which
   - Example: Orders → Payments, Orders → Users, Orders → Notifications

2. ALIGNMENT CHECK
   - Do all services follow consistent patterns for:
     - Error codes and error handling?
     - Request/response envelope structures?
     - Async vs. synchronous operations?
   - Flag any inconsistencies

3. INTEGRATION POINTS
   - Identify the "chatty" services (many dependencies) vs. "leaf" services
   - Any unexpected dependencies? (e.g., should Payments call Notifications?)

4. MISSING PIECES
   - Are there gaps in API documentation or configuration?
   - Are there services that should exist but don't? (e.g., a dedicated cache service?)

5. NEXT STEPS FOR THE TEAM
   - Based on the audit, what 1-3 things should the team focus on next?
   - (This will inform follow-up scenarios.)
```

### Phase 5: Watch the orchestrator synthesize

Once you submit the orchestrator focus, the orchestrator card will switch to **Busy** and start synthesizing the worker outputs.

The **Broadcast Results** panel will update with the orchestrator's synthesis:

- A dependency graph showing which services call which
- An alignment report highlighting inconsistencies
- Recommendations for the next phase of work

**What you're learning:**

This is the core value of the orchestrator: it takes many independent worker outputs and turns them into a single, actionable summary. An operator can now see the system holistically instead of juggling seven separate reports.

### Phase 6: Review and document findings

Once the orchestrator completes, take note of:

1. **Architecture clarity**: Do you now have a clear picture of how shopfleet is structured?
2. **Integration chains**: Can you trace a user flow (e.g., user logs in → orders product → payment processes)?
3. **Gaps and risks**: What inconsistencies or missing pieces did the orchestrator flag?

In the orchestrator repo (`shopfleet-orchestrator`), create a file called `ARCHITECTURE_AUDIT.md` and paste:

- The service summaries from all workers
- The orchestrator's synthesis and recommendations
- Any follow-up questions or actions for the team

This becomes your "living documentation" for the architecture.

### Phase 7: Plan next steps

Based on the audit, you're now ready for any of the other scenarios:

- **Scenario 2**: Use a shared library change (e.g., payment method) to test routing
- **Scenario 3**: Add a new feature (e.g., loyalty points) across all services
- **Scenario 4**: Diagnose and fix an integration bug (e.g., inventory sync)
- **Scenario 5**: Manage a security fix in the shared library

But first, you've achieved the goal of this scenario: **understand your microservices architecture through orchestrator-led audit and synthesis.**

## Key learnings

- **Broadcast is powerful**: You can ask the same question across many services at once
- **Orchestrator adds context**: One service's answer is informative; all services' answers synthesized by the orchestrator is strategic
- **Architecture is social**: Services don't exist in isolation; the dependency graph and integration points matter as much as individual service code
- **Baseline matters**: This audit is your starting point. You can refer back to it when making changes

## Troubleshooting

**Some services take longer than others to complete:**

This is normal. Workers complete in order of response time. The orchestrator waits for all workers before synthesizing. If a service is very slow (>5 minutes), check if the agent is stuck by clicking its card to see detailed logs.

**The orchestrator synthesis doesn't mention some services:**

The orchestrator may have missed a service in its synthesis. If so, send a follow-up targeting the orchestrator:

```text
You mentioned Orders, Users, and Payments, but didn't cover Notifications, 
Storefront, or Shared. Describe their role in the architecture and how they 
connect to the services you did mention.
```

**Worker responses look incomplete or vague:**

Send a follow-up broadcast with clarifications:

```text
For your API Endpoints, please list them in this exact format:
- GET /resource/{id}: Description
- POST /resource: Description
- PUT /resource/{id}: Description

This makes it easier to synthesize a unified API spec.
```

