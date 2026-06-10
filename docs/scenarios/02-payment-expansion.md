# Scenario 2: Payment Method Expansion

This scenario demonstrates dependency-aware routing in a real e-commerce microservices context: adding a new payment method (e.g., digital wallet) that requires coordinated changes across multiple services.

It builds on Scenario 1's foundational concepts but adds realistic constraints: shared schema management, backward compatibility concerns, and multi-service coordination.

## When to use this scenario

Use this walkthrough when:

- a schema change in a shared library affects multiple services
- you need to coordinate a rollout where order matters (schema first, then consumers)
- you want the orchestrator to propose service-specific prompts based on dependency graph

## Setup

Your shopfleet deployment includes:

| Repo | Purpose | Dependencies |
| --- | --- | --- |
| `shopfleet-orchestrator` | coordination and synthesis | none |
| `shopfleet-shared` | payment schema, enums, base types | used by orders, payments, notifications |
| `shopfleet-payments` | payment processing and gateway integration | consumes shared payment schema |
| `shopfleet-orders` | order management and fulfillment | consumes shared, calls payments service |
| `shopfleet-notifications` | email/SMS receipts and confirmations | consumes shared payment types |
| `shopfleet-users` | user account management | may need wallet account setup |

All repos launch automatically via `.env` defaults.

## Goal

Add a new "digital wallet" payment method to the system. This requires:

1. Add `WALLET` as a new enum value in `shopfleet-shared`'s `PaymentMethod` type
2. Update `shopfleet-payments` to handle wallet validation, balance checks, and charging
3. Update `shopfleet-orders` to accept wallet as a valid payment method in the checkout flow
4. Update `shopfleet-notifications` to send wallet-specific receipts
5. Have `shopfleet-users` prepare user wallet accounts (balance, transaction history)

This is realistic because:

- Shared library changes cascade to dependent services
- Each service needs different context (payments handles gateway, orders handles validation, etc.)
- The orchestrator should propose service-specific follow-ups based on the dependency graph

## Workflow

### Phase 1: Set a session brief

In the purple mission context bar at the top, add:

```text
We are adding a new Digital Wallet payment method to the shopfleet platform.
This requires schema changes in the shared library and then coordinated updates
across payment processing, order management, notifications, and user accounts.
Focus on backward compatibility and ensure validation happens at service boundaries.
```

This context will be prepended to all agent prompts automatically.

### Phase 2: Spawn the orchestrator and workers

Launch all six repos:

1. **Orchestrator**: `shopfleet-orchestrator`
2. **Workers**: `shopfleet-shared`, `shopfleet-payments`, `shopfleet-orders`, `shopfleet-notifications`, `shopfleet-users`

Wait for all cards to show **Ready**.

### Phase 3: Start with the shared library

Send a targeted prompt to `shopfleet-shared` first (do not broadcast yet):

```text
Add a WALLET payment method to the PaymentMethod enum. Update:
1. The enum definition itself
2. Any type guards, validators, or discriminator logic
3. Documentation showing how services will use this new method
4. Add a comment about backward compatibility concerns
```

This primes the change at the source. Other services will consume this.

### Phase 4: Observe orchestrator's routing suggestion

After `shopfleet-shared` completes, check if the **Orchestrator Card** has switched to **Analyzing** mode. The orchestrator is examining the change and checking the dependency graph to see what downstream services reference the PaymentMethod type.

You should see activity in the **Routing Plan Approval** panel if the orchestrator detects downstream impact.

### Phase 5: Review and approve the routing plan

The routing plan will propose prompts for each dependent service. **Do not approve immediately.** Instead:

1. **For `shopfleet-payments`**: Ensure the prompt focuses on:
   - Wallet balance validation
   - Charging mechanism (debit vs. preauth)
   - Reconciliation and refund logic

2. **For `shopfleet-orders`**: Ensure the prompt focuses on:
   - Adding wallet as a valid payment method in the checkout flow
   - Validation order: is wallet available for this order type?
   - Integration with the payments service for wallet transactions

3. **For `shopfleet-notifications`**: Ensure the prompt focuses on:
   - Wallet-specific receipt templates (showing wallet balance after transaction)
   - Confirmation logic for wallet transactions

4. **For `shopfleet-users`**: Ensure the prompt focuses on:
   - User wallet account initialization
   - Balance ledger schema
   - Transaction history tracking

Feel free to edit each service-specific prompt to tighten the focus. For example, change generic language to specifics like:

```text
shopfleet-payments:
  ❯ Update the payments gateway handler to support wallet charging. Include balance 
    checks, transaction logging, and handle failure cases (insufficient balance, 
    service down). Ensure idempotency for retries.
```

### Phase 6: Approve and watch the cascade

Once you approve the routing plan, all dependent services will receive their tailored prompts in parallel.

Watch the **Broadcast Results** panel as each service completes:

- `shopfleet-payments` returns wallet integration code
- `shopfleet-orders` returns checkout flow updates
- `shopfleet-notifications` returns email templates
- `shopfleet-users` returns wallet account schema

### Phase 7: Synthesis

Once all workers finish, the orchestrator synthesizes the combined output. It should return something like:

- A summary of all changes across the system
- Consistency checks: "Do all services agree on wallet balance semantics?"
- Integration points: "Orders calls Payments at X, Payments logs to shared schema at Y"
- Remaining work: "Consider adding rate limits to wallet transactions"

### Phase 8: Create coordination docs

In the orchestrator repo, create `WALLET_EXPANSION.md` with:

1. Summary of changes by service
2. Links to any PRs or branches created
3. Testing checklist (can wallet transactions be processed end-to-end?)
4. Deployment order (shared first, then payments, then others in parallel)

## Key learnings

- **Shared-first approach**: Schema changes must land in the shared library before services that consume them
- **Service-specific context**: Each service needs different routing instructions based on its role
- **Orchestrator synthesis**: The orchestrator's job is not just to route; it's to verify consistency across the cascade
- **Backward compatibility**: Always consider what happens to old payment types during this transition

## Troubleshooting

**The routing plan doesn't include all expected services:**

This usually means the dependency graph is incomplete. Use **Load as Worker** to add any missing repos (e.g., if `shopfleet-products` also references PaymentMethod, load it too).

**The orchestrator doesn't detect downstream impact:**

Check that each repo's `manifest.json` or `package.json` includes `dependsOn` declarations pointing to `shopfleet-shared`. If not, manually target the downstream services with a follow-up broadcast instead of relying on routing.

**Some services complete but look incomplete:**

Review the **Broadcast Results** and **Orchestrator Card** output carefully. The orchestrator may have flagged inconsistencies or gaps. Send a follow-up prompt to close them.

