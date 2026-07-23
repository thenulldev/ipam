# NUL-18 — API contract & authorization enforcement

## Goal

Define and enforce the IPAM backend trust boundary. Landed state:

- Server-side authentication; every request resolves to an actor + tenant.
- RBAC enforcement on every mutation (admin/editor vs. viewer).
- Tenant-scoping on every read and every write.
- Cross-tenant identifier rejection (e.g. `rackId` from another tenant returns 404, never silently accepted).
- Single typed error envelope across the API.
- Security tests covering unauthenticated, forbidden, and cross-tenant access.

## Charter / sequencing

NUL-18 must land before NUL-12 (audit log + conflict detection) and NUL-20 (versioned migrations). This PR does **not** deliver NUL-20 — the auth additions ship as a single forward `0001_auth.sql` applied idempotently by the existing `ensureTables()` loop. NUL-20 will replace that bootstrap with versioned Drizzle migrations in a follow-up PR.

## Proposed design

### Authentication

- Add `password_hash` (text, nullable) to `users`. Seed assigns a default password for development (`ipam-dev`) and writes the scrypt hash.
- `POST /api/auth/login` `{ email, password }` sets a signed, http-only, SameSite=Lax session cookie `ipam_session` containing `{ userId, iat }` HMAC-signed with `IPAM_SESSION_SECRET` (env var; falls back to a dev-only key with a startup warning). 200 on success, 401 envelope on bad credentials. Rate-limited at the same endpoint (in-memory token bucket) to slow brute-force in dev.
- `POST /api/auth/logout` clears the cookie. 204.
- `GET /api/auth/me` returns `{ id, name, email, role, tenantId, tenant: { id, name, slug } }` for the current actor. 401 when no session.
- All other `/api/**` routes call `requireAuth()` middleware. 401 envelope when no/invalid session. The middleware attaches `actor` (the row from `users`) to the Hono context.

This is a **cookie-based session** for v1. When the Mobile Engineer is hired, we will add a parallel `Authorization: Bearer <token>` path that issues a long-lived token from `/api/auth/login` and lets the mobile client store it in the platform keychain. I am NOT shipping the bearer path in this PR — it would be a contract decision that affects a client that does not exist yet, and the charter says not to extend the contract unilaterally.

### Authorization / RBAC

- `requireRole(role)` middleware returns a 403 envelope if the actor role is insufficient. Viewer cannot mutate; editor and admin can; admin-only routes (tenant/user management if added later) gate on `admin`.
- Default policy: every `POST`/`PATCH`/`DELETE` on `/api/**` requires at least `editor`. Reads require any authenticated user.

### Tenant scoping

- Every collection read: `db.select().from(T).where(eq(T.tenantId, actor.tenantId))`.
- Joins: devices/cables via rack/device/port all derive from a tenant's racks.
- Helper `tenantFilter(table)` returns the where clause.

### Cross-tenant identifier rejection

For every request body or path param that names a row (e.g. `rackId`, `siteId`, `prefixId`, `portAId`, `portBId`, `addressId`, `templateId`, `cableId`, `parentId`, `vrfId`, `dhcpScopeId`, `dnsForwardZoneId`, `dnsReverseZoneId`, `floorplanId`, `roomId`, `portId`, `noteId`, `imageId`, `reservationId`):

- Look up the row, check `tenantId === actor.tenantId`. If not, return 404 (not 403 — leaking existence is itself information).
- Applied on every create/patch/delete and every read-by-id.

### Error envelope

```
{ error: { code: 'unauthenticated' | 'forbidden' | 'not_found' | 'validation' | 'conflict' | 'internal',
           message: string, details?: unknown } }
```

- 400 → `validation`
- 401 → `unauthenticated`
- 403 → `forbidden`
- 404 → `not_found`
- 409 → `conflict`
- 5xx → `internal` (only when unexpected; routes catch known throws)

A single `errorResponse(c, status, code, message, details?)` helper powers all of these.

### Server-derived actor/tenant in ChangeEvent

`emitChange` becomes `emitChange(c, input)` and pulls `tenantId`, `actorId`, and `actorName` from the request context. Any client-supplied `tenantId`/`actorId`/`actorName` in the body is ignored (drop the fields from the Zod schemas). The audit log becomes trustworthy.

## Files touched

- `src/server/auth.ts` (new) — session signing, password hashing (scrypt), middleware, helpers.
- `src/server/errors.ts` (new) — error envelope.
- `src/server/index.ts` — register `/api/auth/*`, mount middleware, refactor every route to use `requireAuth` + `tenantScope` + `errorResponse` + cross-tenant guards. Remove client-supplied actor/tenant from `emitChange` call sites.
- `src/server/db.ts` — append the `password_hash` column to the `users` `CREATE TABLE` and an idempotent `ALTER TABLE users ADD COLUMN password_hash TEXT` for legacy DBs.
- `src/server/seed.ts` — write scrypt-hashed default password for each user.
- `src/server/meta.ts` — accept `actor` from a Hono context or passed object; remove the option to take a free-form `actorId`.
- `src/server/auth.test.ts` (new) — security tests.
- `src/lib/auth.ts` — leave as the UI helper (the `canWrite`/`canAdmin` role gate is still useful client-side for affordance).
- `src/store/tenant-store.ts` — leave the hard-coded user for now; the web adapter will be updated in a follow-up PR owned by the Mobile/Web side. Flag this in the PR description as out-of-scope but pre-approved by charter (UI is not my ownership).
- `src/lib/queries.ts` — out of scope; reads still hit unfiltered endpoints until the frontend adapter is updated. Documented in PR.

## Out of scope (deferred)

- Migrating the front-end adapter to send the cookie (`src/lib/api/adapter.ts`).
- Replacing the hard-coded `tenant-store` with a real `/api/auth/me` consumer.
- Multi-tenant user provisioning (admin UI).
- Token-based bearer auth for mobile (deferred until the Mobile Engineer is hired; surface as a follow-up child issue).
- Drizzle-versioned migrations (NUL-20).
- Audit log + conflict detection (NUL-12).

## Verification

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run dev:server` then `curl` smoke against `/api/auth/login` + representative read/write/upload routes, asserting 401/403/404/200 shapes match the envelope.
- `node --test src/server/auth.test.ts` — the new security test suite.

## Open questions for Founding Engineer (binding decisions)

**1. Authentication transport for v1.** Two viable options:

a. **Signed session cookie** (proposed). Simple, works out-of-the-box for web, httpOnly & SameSite=Lax protect against XSS/CSRF, no client storage.
b. **Signed bearer token** (JWT or opaque). Mobile-friendly from day 1, but requires the mobile client to exist before we know the right shape (refresh vs. static, expiry, scopes).

Charter says "surface API contract decisions affecting mobile in the issue thread." There is no mobile client yet, so I am proposing option (a) and leaving option (b) as a follow-up child issue when the Mobile Engineer is hired. Confirm this is the right call before I cut the PR.

**2. Default seeded passwords.** Proposing `ipam-dev` (printed in `npm run dev:server` startup logs, with a one-line warning that they MUST be changed before any non-local environment). Acceptable, or do you want the seed to skip writing a hash and require an explicit env var to enable dev login?
