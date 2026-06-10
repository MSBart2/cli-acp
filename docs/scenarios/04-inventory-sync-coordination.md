# Scenario 4: Inventory Synchronization Crisis

This scenario addresses a real e-commerce pain point: keeping product inventory synchronized between the source of truth (Products service) and consumers (Orders, Storefront).

It demonstrates orchestrator-led problem diagnosis, cross-service consistency validation, and a coordinated fix that must be deployed carefully to avoid data corruption.

## When to use this scenario

Use this walkthrough when:

- you need to diagnose why two services have different views of the same data
- a bug or outage has caused inconsistency that must be repaired
- you need to coordinate a schema or logic change that touches many services
- sequencing matters for correctness

## Setup

Your shopfleet deployment focuses on four key repos:

| Repo | Role |
| --- | --- |
| `shopfleet-orchestrator` | diagnose issue, propose fix |
| `shopfleet-products` | source of truth for inventory |
| `shopfleet-orders` | decrements inventory when orders complete |
| `shopfleet-storefront` | reads inventory for display |
| `shopfleet-shared` | inventory schema and events |

## Scenario: The Problem

You've discovered a bug:

- **Products service** shows 100 units of "Blue Sneakers" in stock
- **Storefront** displays "5 units left" (cache is stale? or query is wrong?)
- **Orders service** is still accepting orders even though Products is showing 0 available

This is a classic distributed system problem: multiple services reading the same data, each with their own view, no consensus mechanism.

## Goal

Diagnose the root cause, fix the synchronization logic, and deploy a solution that:

1. Establishes Products as the source of truth
2. Ensures Orders decrements inventory atomically
3. Keeps Storefront's cache fresh
4. Prevents overselling

This is realistic because:

- Inventory is one of the hardest things to keep consistent at scale
- It requires coordination between multiple services
- The fix may involve event-driven architecture, polling, or eventual consistency trade-offs
- Deploying the fix requires care to avoid corrupting data

## Workflow

### Phase 1: Set a session brief

In the mission context bar, add:

```text
INCIDENT: Inventory synchronization is broken across shopfleet. Products shows 
one count, Storefront shows another, and Orders continues accepting orders past 
the real inventory limit.

We need to:
1. Diagnose how each service currently tracks inventory
2. Identify where the sync is breaking
3. Redesign the flow to make Products the source of truth
4. Ensure Orders reserves inventory atomically
5. Keep Storefront cache in sync
```

### Phase 2: Spawn repos and start diagnostics

Launch all five repos. Wait for **Ready**.

### Phase 3: Run a diagnostic broadcast

Send this to all workers (do not direct targets yet):

```text
Inventory Sync Diagnostics:

1. Describe how you currently track product inventory (schema, queries, caches)
2. List every place you read or write inventory (API endpoints, background jobs, etc.)
3. How do you stay in sync with other services? (polling? events? webhooks?)
4. Have you seen inconsistencies? If so, describe them.
5. What happens if inventory reaches 0 while you're processing a request?
6. Do you cache inventory? If so, what's the TTL and invalidation mechanism?

Focus on the "Blue Sneakers" product in your diagnostics.
```

Orchestrator Focus:

```text
From the diagnostics, synthesize:
1. A timeline showing how each service sees inventory (now vs. 1 hour ago)
2. Where are reads and writes happening?
3. Which service is the source of truth? (intentional or by accident?)
4. Is there a race condition? (e.g., two Orders process concurrently, both think
   they can decrement)?
5. Recommend a fix strategy: event-driven, saga, distributed lock, or other?
```

### Phase 4: Review orchestrator's diagnosis

Once the orchestrator synthesizes the diagnostics, you should have a clear picture:

- **If Orders is over-accepting**: The issue is likely that Orders doesn't atomically reserve inventory when taking an order.
- **If Storefront is stale**: The issue is cache invalidation.
- **If Products is unreliable**: The issue may be a database inconsistency or missing transaction boundaries.

Based on the diagnosis, you'll decide on a fix strategy. Common approaches:

1. **Event-driven**: Products publishes "InventoryDecremented" events, others subscribe
2. **Saga pattern**: Orders coordinates a distributed transaction with Products
3. **Reservation layer**: Orders reserves inventory before accepting payment
4. **Stronger consistency**: Add a distributed lock or use database transactions

### Phase 5: Send targeted fix prompts

Once you've chosen a strategy, send service-specific prompts.

**Example: Reservation + Event-Driven Strategy**

**For shopfleet-shared:**

```text
Define a new event type: InventoryReserved
  - productId
  - quantity
  - orderId
  - expirationTime (reservation is temporary; if order doesn't complete, it expires)

Add to the inventory schema:
  - reserved: Map<orderId, quantity>  # reservations hold inventory
  - available: quantity - reserved

Make this available across all services.
```

**For shopfleet-orders:**

```text
Add an inventory reservation step before accepting an order:
1. Call Products.reserveInventory(productId, quantity, orderId, ttl=10minutes)
2. If reservation succeeds, proceed with payment
3. If reservation fails (out of stock), reject the order immediately
4. On order completion, call Products.confirmReservation(orderId)
5. On order cancellation or timeout, call Products.releaseReservation(orderId)

This ensures Orders never oversells. Use the new InventoryReserved event from shopfleet-shared.
```

**For shopfleet-products:**

```text
Implement inventory reservation:
1. Add a reservations table tracking (orderId, productId, quantity, expiresAt)
2. When Orders calls reserveInventory(), check if (available - reserved) >= quantity
3. If yes, create a reservation and return success. If no, return failure.
4. Add a background job that releases expired reservations (e.g., every 5 minutes)
5. Publish an InventoryReserved event when a reservation is made
6. Track confirmed and released events separately for audit trail

Source of truth: available = total - reserved - sold
```

**For shopfleet-storefront:**

```text
Update inventory display:
1. Subscribe to InventoryReserved and InventoryConfirmed events
2. On InventoryReserved: decrement the displayed inventory by the reserved quantity
3. On InventoryConfirmed: ensure the display stays decremented (already accounted for)
4. On InventoryReleased: increment the display (reservation expired, inventory freed)
5. For a safety net, add a periodic sync job that queries Products.getInventory()
   and resets the display cache if it differs by more than 5 units

This keeps Storefront in sync without strong coupling.
```

**For shopfleet-notifications (optional follow-up):**

```text
Update order confirmation emails:
1. When an order transitions from "reserved" to "confirmed", send a confirmation email
2. If a reservation expires (timeout), send a "Your order couldn't be fulfilled" email
3. Include inventory status in the email (helps users understand why orders fail)
```

### Phase 6: Review and approve implementation plans

The orchestrator will synthesize the fix proposals. Review for:

1. **Atomicity**: Is inventory decremented atomically?
2. **Consistency**: Will Storefront, Orders, and Products all agree?
3. **Failure modes**: What happens if Products crashes after a reservation but before an event is published?
4. **Rollback**: How do you test this without corrupting production inventory?

If there are concerns, send a follow-up prompt to address them.

### Phase 7: Deploy safety checks

Before deploying, add validation:

**For shopfleet-products:**

```text
Add internal consistency checks:
1. Verify: total_inventory = sold + reserved + available (always)
2. Log any mismatches to a debug table
3. Provide an endpoint GET /inventory/{productId}/audit returning this breakdown
```

**For shopfleet-orders:**

```text
Add idempotency tracking:
1. Every reservation request has a unique idempotency key
2. Retries with the same key return the same reservation
3. This prevents double-reservations if a request is retried
```

### Phase 8: Create coordination and runbook

In the orchestrator repo, create:

**INVENTORY_FIX.md:**

```markdown
## Inventory Sync Fix Deployment

### Problem
[Summarize the bug and its impact]

### Solution
[High-level: reservation + event-driven architecture]

### Services Changed
- shopfleet-shared: Added InventoryReserved event and reservation schema
- shopfleet-products: Added reservation logic and background cleanup
- shopfleet-orders: Added reservation step before accepting orders
- shopfleet-storefront: Updated display to subscribe to inventory events

### Testing Checklist
- [ ] Reserve inventory for an order (succeeds)
- [ ] Attempt to oversell (reservation fails correctly)
- [ ] Complete an order (inventory confirmed and decremented)
- [ ] Cancel an order (inventory released)
- [ ] Wait for reservation to timeout (auto-released)
- [ ] Verify Storefront display matches Products source of truth

### Deployment Order
1. Deploy shopfleet-shared (events defined first)
2. Deploy shopfleet-products (handles reservations)
3. Deploy shopfleet-orders (makes reservation calls)
4. Deploy shopfleet-storefront (subscribes to events)
5. Verify no orphaned reservations (run cleanup job manually if needed)

### Rollback Plan
If inconsistencies appear post-deploy:
1. Set a flag to disable reservations (Orders accepts all orders, Products logs warnings)
2. Run diagnostics again to find the gap
3. Roll back to previous version and re-diagnose
```

**INVENTORY_OPERATIONS.md:**

```markdown
## Ongoing Inventory Operations

### Monitoring
- Alert if (reserved + sold) ever exceeds total inventory
- Alert if Storefront display differs from Products by >10 units
- Track reservation timeouts (unusual patterns suggest bugs)

### Maintenance
- Run weekly audit: SELECT * FROM inventory WHERE available < 0
- Review failed reservations (rejection patterns)
- Monitor for orphaned reservations (old expirations not cleaned up)

### Incident Response
If inventory is overbooked again:
1. Query the audit breakdown from Products
2. Identify which orders shouldn't have been accepted
3. Manually void those orders or adjust inventory
4. Investigate what triggered the inconsistency
```

## Key learnings

- **Distributed inventory is hard**: Every fix is a trade-off between consistency, availability, and complexity
- **Reservations defer commitment**: By reserving before accepting payment, Orders can fail safely without state corruption
- **Events enable cache sync**: Storefront can stay fresh without polling if it subscribes to inventory events
- **Audit trails matter**: Log every inventory change for post-incident diagnosis
- **Orchestrator's value in diagnosis**: The orchestrator's job here is to synthesize each service's view and spot gaps

## Troubleshooting

**Storefront still shows stale inventory after the fix:**

Check that the event subscription is working. Storefront may not be receiving InventoryReserved events. Verify:
- Is Products publishing events?
- Is Storefront subscribed to the event stream?
- Is there an event queue (RabbitMQ, Kafka, SQS)? Is it healthy?

**Reservations timeout too quickly, users see "out of stock" during checkout:**

Increase the TTL. Orders is canceling reservations before payment completes. Adjust the reservation timeout to match your average checkout duration + buffer.

**After deployment, inventory is still inconsistent:**

The issue may be a race condition in the database. Add transactional isolation or a distributed lock. Send a follow-up prompt to Products service asking it to review for concurrency issues.

