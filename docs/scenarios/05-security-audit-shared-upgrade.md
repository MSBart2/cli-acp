# Scenario 5: Security Audit and Shared Library Upgrade

This scenario demonstrates how to manage a critical security fix that must propagate from a shared library to all dependent services. It emphasizes sequencing, validation, and the orchestrator's role in coordinating a controlled rollout.

It's different from other scenarios because there is a hard ordering constraint: the shared library upgrade must deploy first, then dependent services must validate and upgrade their usage.

## When to use this scenario

Use this walkthrough when:

- a security vulnerability is found in a shared library (e.g., auth, crypto, data validation)
- all services depend on that library
- you need a coordinated patch that must be deployed in a specific order
- validation of the fix is critical

## Setup

Your shopfleet deployment depends heavily on `shopfleet-shared`:

| Repo | Uses shopfleet-shared |
| --- | --- |
| `shopfleet-payments` | for transaction validation and crypto |
| `shopfleet-orders` | for order schema and validation |
| `shopfleet-users` | for user schema and hashing |
| `shopfleet-products` | for product schema and price calculations |
| `shopfleet-notifications` | for message templating and email validation |
| `shopfleet-storefront` | for API client types and validation |
| `shopfleet-orchestrator` | meta: plans the upgrade strategy |

## Scenario: The Vulnerability

A security audit finds a critical bug in `shopfleet-shared`'s password hashing:

- **The bug**: The hashing function uses an old algorithm (SHA-256 with low iteration count)
- **The risk**: User passwords could be cracked if the database is ever compromised
- **The fix**: Upgrade to bcrypt with a high iteration count (10+)
- **The constraint**: This is a breaking change; services must explicitly update how they hash

## Goal

Coordinate a security upgrade that:

1. Updates `shopfleet-shared` with the new hashing algorithm
2. Audits all services to find places they use the old algorithm
3. Updates each service to use the new algorithm
4. Validates that old hashed passwords can still be verified (backward compatibility during transition)
5. Ensures the new algorithm is used for all new passwords
6. Schedules a future migration to re-hash old passwords

This is realistic because:

- Security fixes are non-negotiable
- Breaking changes in shared libraries affect all downstream services
- You need to validate each service independently before rollout
- Backward compatibility during the transition is important

## Workflow

### Phase 1: Set a session brief

In the mission context bar, add:

```text
SECURITY INCIDENT: A critical password hashing vulnerability has been identified 
in shopfleet-shared. The current implementation uses SHA-256 with low iterations, 
making hashed passwords crackable.

We must:
1. Upgrade shopfleet-shared to use bcrypt with 10+ iterations
2. Audit all services for places they hash or verify passwords
3. Update each service to use the new algorithm
4. Ensure backward compatibility during the transition (old hashes must still verify)
5. Plan a future migration to re-hash all existing passwords with the new algorithm

This is a coordinated, security-critical rollout.
```

### Phase 2: Spawn orchestrator and all workers

Launch the orchestrator and all seven workers. Wait for **Ready**.

(Note: You may want to exclude some repos if not all are in scope. Adjust as needed.)

### Phase 3: Diagnostic broadcast—find password usage

Send this broadcast to all workers:

```text
SECURITY AUDIT: Find all password hashing in your service.

1. Search your codebase for password hashing or verification (e.g., bcrypt, crypto, hashlib)
2. Document every place you hash (registration, password reset, etc.)
3. Document every place you verify (login, authentication middleware, etc.)
4. List the version of shopfleet-shared you're using (check package.json or requirements.txt)
5. Do you have any custom hashing logic outside of shopfleet-shared?
6. Are there any legacy passwords or migration scenarios we should know about?

Return a summary of findings per service.
```

Orchestrator Focus:

```text
From the audit, synthesize:
1. A map of where passwords are hashed across all services
2. Which services import hashing from shopfleet-shared vs. implement their own
3. What is the breaking change surface? (e.g., is the API changing, or just the algorithm?)
4. Risks: Will any service break if the hashing algorithm changes?
5. Transition strategy: How will services verify old hashes while using the new algorithm?
6. Rollout sequence: Which services can upgrade first? Which are blockers?
```

### Phase 4: Review audit results

The orchestrator should highlight:

- **Which services are safest to upgrade first** (e.g., those that only use the shared library's API, not custom logic)
- **Which services might break** (e.g., custom hashing implementations that won't understand bcrypt output)
- **Whether a phased migration is possible** (e.g., new passwords use bcrypt, old passwords are verified with SHA-256 until migrated)

### Phase 5: Update shopfleet-shared

Send a targeted prompt to `shopfleet-shared`:

```text
Update the password hashing implementation:

REQUIREMENTS:
1. Replace SHA-256 with bcrypt (use a library like bcrypt or argon2)
2. Use a cost factor of 10 or higher (10+ rounds)
3. Make the algorithm configurable (support both old and new during transition)
4. Provide these functions:
   - hashPassword(password, algorithm='new') -> hash
   - verifyPassword(password, hash) -> bool (must work for both old and new)
   - passwordNeedsRehash(hash) -> bool (returns true if hash is old algorithm)

BACKWARD COMPATIBILITY:
- verifyPassword() must work for SHA-256 hashes (read-only, don't use new algorithm on them)
- verifyPassword() must work for bcrypt hashes
- Add a comment: "This transitional code will be removed after re-hashing migration"

DOCUMENTATION:
- Add a MIGRATION.md explaining the transition:
  - Phase 1: Upgrade library, services use new algorithm for new passwords
  - Phase 2: Services check passwordNeedsRehash() on login, offer re-hashing
  - Phase 3: Background job migrates all old passwords
  - Phase 4: Remove the old algorithm verification code

TESTING:
- Unit test that old SHA-256 hashes still verify
- Unit test that new bcrypt hashes work
- Unit test that passwordNeedsRehash() detects old hashes
```

### Phase 6: Wait for shared library validation

Once `shopfleet-shared` is updated, the next step is validation, not immediate rollout. Let the team:

1. Review the new hashing code
2. Test backward compatibility locally
3. Ensure the `verifyPassword()` function works for both algorithms

This is a **hold point** — don't proceed to other services until `shopfleet-shared` is validated.

### Phase 7: Broadcast the upgrade to dependent services

Once `shopfleet-shared` is validated, send this to all workers (except shared):

```text
SECURITY UPGRADE: Update to use the new password hashing in shopfleet-shared.

YOUR TASK:
1. Update shopfleet-shared to the latest version (or the specific version we provide)
2. Check your password hashing code:
   - If you use shopfleet-shared's hashPassword(), you're already safe (it uses new algorithm)
   - If you have custom hashing, replace it with shopfleet-shared's functions
3. On user login, call shopfleet-shared.passwordNeedsRehash() to check if the password should be migrated
4. If true, offer the user a "re-authenticate" flow where they enter their password again, you verify it,
   and then re-hash with the new algorithm and save it
5. Test: Verify that both old SHA-256 and new bcrypt hashes work in login flows

OPTIONAL (lower priority):
- Implement a background job to bulk-migrate old passwords without user interaction
  (use a separate cron or scheduled task)

AVOID:
- Don't force all users to reset passwords (disruptive and unnecessary)
- Don't verify old passwords and immediately hash with new (that's inefficient; only do it on login)
```

### Phase 8: Validation broadcast

After all services have reported their updates, send a validation prompt to confirm everything is working:

```text
SECURITY VALIDATION: Verify the password hashing upgrade is working.

TEST PLAN:
1. Create a test user and verify it hashes with the new bcrypt algorithm
2. Log in with the new user (verify the new hash works)
3. Simulate an old SHA-256 hash in your user database
4. Log in with the old hash (verify backward compatibility)
5. Confirm the login triggers a re-hashing event (passwordNeedsRehash returned true)
6. Verify metrics: Are any users logging in with old hashes? (Use for planning the migration window)

RETURN:
- Verification results for each test
- Any issues or edge cases found
```

Orchestrator Focus:

```text
Verify across all services:
1. Are all services using the new algorithm for new passwords?
2. Can all services verify old hashes?
3. Are any services still using custom hashing? (Should be none—flag these)
4. Is the re-hashing flow working? (Users can optionally migrate on login)
5. Next steps for the background migration job (which service owns it? When should it run?)
```

### Phase 9: Plan the deployment and migration

Based on the orchestrator's validation, create a deployment plan:

**SECURITY_UPGRADE_DEPLOYMENT.md:**

```markdown
## Password Hashing Security Upgrade

### Vulnerability
[CVE or security issue: SHA-256 is crackable; bcrypt is required]

### Solution
Upgrade to bcrypt with 10+ iterations, maintain backward compatibility during transition.

### Deployment Timeline

#### Phase 1: Library Upgrade (Day 1)
- Deploy shopfleet-shared with bcrypt support
- Verify both old and new hashes can be verified

#### Phase 2: Service Upgrade (Day 2-3)
- Deploy all dependent services (payments, orders, users, products, etc.)
- Services now use new bcrypt algorithm for new passwords
- Backward compatibility active: old passwords still work

#### Phase 3: User Migration (Week 1-2)
- Users logging in trigger optional re-hashing
- Monitor: Track percentage of users with migrated hashes
- Goal: Migrate 80%+ of active users

#### Phase 4: Background Migration (Week 3)
- Run batch job to re-hash remaining old passwords
- Deactivate backward compatibility for SHA-256 hashes
- Celebrate: All passwords now use bcrypt

### Rollback Plan
If issues are found after deployment:
1. Immediately disable the new algorithm (set to use old SHA-256 again)
2. Revert shopfleet-shared to previous version
3. Diagnose the issue (was the bcrypt library incompatible? Was verification broken?)
4. Fix and re-test before re-deploying

### Success Metrics
- All new passwords use bcrypt
- Old passwords verify correctly during transition
- User re-hashing rate >80% within 2 weeks
- Zero login failures attributed to hashing changes
- Zero security incidents after deployment
```

### Phase 10: Document and communicate

Create a summary for the team:

**SECURITY_UPGRADE_SUMMARY.md:**

```markdown
## Security Upgrade Complete

### What Changed
- Password hashing algorithm upgraded from SHA-256 to bcrypt
- All services now use shopfleet-shared's unified hashing implementation
- Backward compatibility maintained during user migration

### What You Need to Know
- **If you maintain a service**: Ensure it uses the new shopfleet-shared (see deployment checklist)
- **If you operate the platform**: Monitor re-hashing rates; run background job as scheduled
- **If you're a user**: Your password is already secure; optional re-hashing happens on your next login

### Next Steps
1. Monitor login metrics for any failures
2. Track password re-hashing rate (goal: 80% within 2 weeks)
3. Run background migration job (scheduled for Week 3)
4. Verify all old passwords have been re-hashed (run audit query)
5. Remove backward compatibility code (safe after all passwords migrated)
```

## Key learnings

- **Security requires ordering**: Shared library upgrades before dependent services, not in parallel
- **Backward compatibility eases transition**: Services can handle both old and new algorithms during migration
- **Validation is not optional**: Before rolling to users, the team must verify the fix works for both old and new scenarios
- **Orchestrator's role in security**: Synthesizing audit results and identifying the safe rollout sequence
- **Communication matters**: Teams need clear runbooks for security changes to avoid mistakes

## Troubleshooting

**Some users are getting "password verification failed" after the upgrade:**

This usually means a service is using the old algorithm verification but the password is new (bcrypt). Check:
- Did all services upgrade shopfleet-shared to the latest version?
- Is any service still using custom hashing? (Should be removed)
- Is the verifyPassword() function from shopfleet-shared being called, not custom logic?

**Passwords are being re-hashed too frequently (on every login, not just once):**

The `passwordNeedsRehash()` function may have a bug. Check that:
- It correctly distinguishes bcrypt hashes (don't re-hash) from SHA-256 hashes (do re-hash)
- The service is only re-hashing once, then saving the new hash

**A service is broken after upgrading shopfleet-shared:**

The new bcrypt library may have a dependency conflict. Check:
- Are there version conflicts (e.g., Node.js bcrypt vs. Python bcrypt)?
- Does the bcrypt library require a compilation step? (Sometimes fails in certain environments)
- Rollback and investigate before re-deploying

