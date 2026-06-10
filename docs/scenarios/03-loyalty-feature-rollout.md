# Scenario 3: Loyalty Feature Rollout

This scenario demonstrates a large, multi-service feature launch where no single service is upstream. Instead, all services need coordinated changes to support a new loyalty points system.

It emphasizes orchestrator synthesis across a wide broadcast (many workers), careful result review, and consistency validation.

## When to use this scenario

Use this walkthrough when:

- you are adding a feature that touches many services (frontend, backend, integrations)
- there is no clear "upstream" starting point—all services need changes
- you need the orchestrator to identify integration gaps and inconsistencies

## Setup

Your shopfleet deployment includes all seven repos:

| Repo | Loyalty Changes |
| --- | --- |
| `shopfleet-orchestrator` | tracks loyalty feature design and decisions |
| `shopfleet-users` | new loyalty account fields (points balance, tier) |
| `shopfleet-orders` | awards points on order completion |
| `shopfleet-products` | products define points per purchase |
| `shopfleet-payments` | records point deductions for redemptions |
| `shopfleet-notifications` | sends "points earned" and "points redeemed" emails |
| `shopfleet-storefront` | displays points balance and redemption UI |
| `shopfleet-shared` | defines LoyaltyAccount, PointsTransaction types |

All repos will need changes for the feature to work end-to-end.

## Goal

Roll out a loyalty points system where:

1. Users earn points for purchases (1 point per $1 spent)
2. Points are visible on the user profile and storefront
3. Users can redeem points for discounts or free products
4. The system tracks loyalty tier (bronze, silver, gold)
5. Loyalty data is queryable and synchronized across services

This is realistic because:

- It requires both backend and frontend changes
- Multiple services need to coordinate on the PointsTransaction schema
- The storefront, user, and order services must stay in sync
- Messaging/notifications is critical to user experience

## Workflow

### Phase 1: Set a session brief

In the mission context bar, add:

```text
We are launching a loyalty points system for shopfleet. Users earn 1 point per 
$1 spent. Points unlock discounts and free products. The system must track 
loyalty tiers (bronze/silver/gold) and ensure point balances stay synchronized 
across the platform.

Key requirements:
- Points earned immediately on order completion
- Redemptions are instant (discounts or free items)
- Tier benefits include higher earning rates and exclusive products
- Notifications inform users of point changes in real time
```

### Phase 2: Spawn all repos

Launch the orchestrator, then all seven worker repos. Wait for all cards to show **Ready**.

### Phase 3: Send a discovery broadcast

Before making changes, gather context. Send this to all workers:

```text
We are adding a loyalty points system. Your role in this system:
1. Describe your current user/product/order/payment models
2. Identify where you track state that relates to purchases or users
3. List your current API endpoints that might need changes
4. Flag any constraints (DB schema locks, external dependencies, backward compat issues)

Return a brief summary for each point.
```

Orchestrator Focus:

```text
From all the worker responses, synthesize:
1. A unified data model for LoyaltyAccount and PointsTransaction
2. A sequence diagram showing where points are earned vs. redeemed
3. Integration points between services (e.g., where does Orders call Users?)
4. Potential race conditions or consistency issues to watch for
```

This gives everyone a shared model before coding starts.

### Phase 4: Second broadcast—implementation

Once discovery is complete and you've reviewed the orchestrator's synthesis, send the real implementation prompt to all workers:

```text
Implement loyalty points support:

1. Add loyalty point fields to your service (details below)
2. Write the code for your role (see service-specific details below)
3. Document the integration points (how your service calls other services)

SHARED SERVICE (shopfleet-shared):
- Add LoyaltyAccount type: { userId, pointsBalance, tier (bronze|silver|gold), createdAt }
- Add PointsTransaction type: { id, userId, type (earn|redeem), amount, reason, timestamp }

USERS SERVICE (shopfleet-users):
- Add loyalty account initialization when a user signs up
- Track points balance and tier in user profile
- Provide a /loyalty endpoint returning balance, tier, and recent transactions
- Enforce tier constraints (e.g., silver requires 500+ points)

ORDERS SERVICE (shopfleet-orders):
- On order completion, calculate points earned (order_total * 1)
- Call the Users service to increment points
- Log a PointsTransaction record (earn type)
- Ensure idempotency (retries don't double-award points)

PRODUCTS SERVICE (shopfleet-products):
- Add a pointsPerUnit field to products (default 1)
- Allow override for tier-based earning (e.g., gold members earn 1.5x)
- Provide an endpoint listing redeemable products

PAYMENTS SERVICE (shopfleet-payments):
- Support point deductions in the payment flow
- When redeeming points for a discount, record a PointsTransaction (redeem type)
- Validate user has sufficient points before applying redemption

NOTIFICATIONS SERVICE (shopfleet-notifications):
- Send email when points are earned (order completion)
- Send email when points are redeemed
- Include current balance and tier in the email

STOREFRONT SERVICE (shopfleet-storefront):
- Display loyalty balance and tier on user dashboard
- Show redeemable products and their point costs
- Allow users to view transaction history
- Add "redeem points" UI to checkout flow
```

This broadcast is large and complex, which is why the orchestrator's synthesis matters.

### Phase 5: Review broadcast results

As workers complete, the **Broadcast Results** panel will fill with implementation code. 

Review each service's output for:

1. **Consistency**: Do all services agree on PointsTransaction schema?
2. **Integration**: Is the call chain (Orders → Users → track points) clear?
3. **Idempotency**: Can retries happen safely? (especially important in Orders)
4. **Messaging**: Will notifications fire at the right time?

Note any issues in a shared doc or the orchestrator's coordination repo.

### Phase 6: Orchestrator synthesis and gap detection

The orchestrator should synthesize something like:

```text
LOYALTY ROLLOUT SUMMARY:

✓ All services agree on LoyaltyAccount and PointsTransaction schemas
✓ Points earning path: Order → Users (increment) → Notifications (email)
✓ Points redemption path: Checkout → Payments → Users (decrement) → Notifications (email)
✓ Storefront displays balance and tier correctly

⚠ CONSISTENCY GAPS:
- Orders assumes 1 point = $1, but Products can override earning rates.
  Recommendation: Move earning rate calculation to Products service or
  have Orders query the rate dynamically.

⚠ MISSING INTEGRATION:
- Products service doesn't check if a product is redeemable-only (e.g., "250-point reward").
  Recommendation: Add a productType field or redeemablePointsOnly flag.

⚠ OPERATIONAL CONCERN:
- No rate limiting on point redemptions. A user could theoretically trigger
  many small redemptions in sequence. Recommendation: Add cooldown or batch
  redemptions on a background job.
```

### Phase 7: Iterate and close gaps

Based on the orchestrator's synthesis, send targeted follow-up prompts to services that need refinement:

**For Orders service:**

```text
Currently you assume 1 point per $1. But the Products service allows override.
Change your points calculation to:
1. Query the product record to get pointsPerUnit
2. Query the user record to get tier and any multipliers
3. Calculate total points = sum(item_price * pointsPerUnit * tierMultiplier)
4. Call Users.incrementPoints() with the total
```

**For Payments service:**

```text
Add validation before redempting points:
1. Check that the redemption target (product, discount, etc.) is actually redeemable
2. Verify user has enough points
3. Query Products service if the redemption is a product (is it redeemable-only?)
4. Block redemptions if there's a cooldown in place
```

### Phase 8: Create coordination docs

In the orchestrator repo, create a `LOYALTY_ROLLOUT.md` file documenting:

1. **Feature spec**: What is the loyalty system? How do users earn/redeem?
2. **Data model**: LoyaltyAccount and PointsTransaction schemas with examples
3. **Integration flow**: Diagram (Orders → Users → Notifications, etc.)
4. **Service changes**: Bullet list of what each service implemented
5. **Testing checklist**:
   - User earns points on an order
   - User sees updated balance on profile
   - User can redeem points for a discount
   - Points balance stays in sync across services
   - Tier upgrades work correctly
   - Notifications fire at the right times
6. **Deployment plan**: Shared library first (if changed), then user service, then others in parallel
7. **Monitoring**: What metrics should you watch? (points redeemed per day, tier distribution, etc.)

## Key learnings

- **Wide broadcasts require synthesis**: When many services change, the orchestrator's job is to verify consistency
- **Schema-first approach**: Agreeing on LoyaltyAccount and PointsTransaction shapes prevents downstream integration pain
- **Operational constraints matter**: Rate limits, retry safety, and notification timing are as important as the core feature
- **Testing is cross-service**: A single e2e test (order → points earned → user sees balance) touches all services

## Troubleshooting

**Services disagree on the schema:**

Send a follow-up to `shopfleet-shared` asking it to revisit the schema, then send a broadcast asking all workers to align with the new definitions.

**The storefront shows old balance after a transaction:**

This is likely an eventual consistency issue. Discuss with the team whether:
- Orders should wait for Users to confirm before returning to the user
- There should be a refresh endpoint
- Storefront should poll for balance updates

**Points are double-awarded on retries:**

The Orders service is missing idempotency checks. Ensure it uses an idempotency key or checks for existing PointsTransaction records before calling Users.increment().

