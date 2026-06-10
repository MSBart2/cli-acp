# Scenarios

Use this page as the entry point for the ACP Agent Orchestrator's user-facing
scenario docs.

All scenarios are designed around the `shopfleet-*` microservices configured in `.env`.
Each scenario teaches a different operational workflow, from foundational to advanced.

## Start here

If you are new to the tool or new to shopfleet, read these in order:

1. [`01-service-audit-and-api-alignment`](docs/scenarios/01-service-audit-and-api-alignment.md)
2. [`02-payment-expansion`](docs/scenarios/02-payment-expansion.md)
3. [`03-loyalty-feature-rollout`](docs/scenarios/03-loyalty-feature-rollout.md)
4. [`04-inventory-sync-coordination`](docs/scenarios/04-inventory-sync-coordination.md)
5. [`05-security-audit-shared-upgrade`](docs/scenarios/05-security-audit-shared-upgrade.md)

## Scenario chooser

| If you want to... | Read this |
| --- | --- |
| Learn the basic operator workflow with microservices | [`01-service-audit-and-api-alignment`](docs/scenarios/01-service-audit-and-api-alignment.md) |
| Add a new payment method across e-commerce services | [`02-payment-expansion`](docs/scenarios/02-payment-expansion.md) |
| Roll out a multi-service feature (loyalty points) | [`03-loyalty-feature-rollout`](docs/scenarios/03-loyalty-feature-rollout.md) |
| Fix and coordinate inventory synchronization bugs | [`04-inventory-sync-coordination`](docs/scenarios/04-inventory-sync-coordination.md) |
| Manage a critical security fix in a shared library | [`05-security-audit-shared-upgrade`](docs/scenarios/05-security-audit-shared-upgrade.md) |

## Scenario summaries

### 1. Service audit and API alignment

The foundational scenario. Launch the orchestrator and all shopfleet services,
send a broadcast audit prompt to understand each service's role and API, then
watch the orchestrator synthesize the findings into a unified architectural view.
Perfect for onboarding to the system.

### 2. Payment expansion

Add a new payment method (e.g., digital wallet) to an e-commerce system. This
scenario demonstrates dependency-aware routing from a shared library through
dependent services with service-specific prompts based on the dependency graph.

### 3. Loyalty feature rollout

Roll out a multi-service loyalty points system across users, orders, products,
payments, and storefront. This teaches orchestrator synthesis across a wide
broadcast and consistency validation across many services.

### 4. Inventory sync coordination

Diagnose and fix product inventory synchronization bugs between Products,
Orders, and Storefront. This scenario covers incident diagnosis, data
consistency, and coordinated deployment with strict sequencing constraints.

### 5. Security audit and shared library upgrade

Manage a critical security fix in `shopfleet-shared` that must propagate to all
dependent services. This teaches orchestrator-coordinated validation and safe
sequencing for breaking changes in shared libraries.

## Suggested combinations

- **Quick intro**: 1
- **Feature launch**: 1 → 2 (or 1 → 3)
- **Security-critical path**: 1 → 5
- **Full operational mastery**: 1 → 2 → 3 → 4 → 5

## How these docs are written

Each scenario focuses on operator decisions rather than raw feature inventory:

- when to broadcast vs. target a single worker
- when to add Orchestrator Focus for the orchestrator
- when to load more repos before proceeding
- when to restore UI state vs. re-spawn live agents

If you are updating or extending the scenario docs, keep that bias: teach users
how to run the tool effectively, not just what controls exist in the UI.
