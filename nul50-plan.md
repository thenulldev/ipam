# NUL-50 — Authentication (front-end fit-out)

## Status

Backend (NUL-18) is already landed and tested — see `src/server/auth.ts` (scrypt hashing, HMAC-signed session cookies, RBAC `viewer | editor | admin`, in-memory login rate limiter, login/logout/me endpoints) and the `api.use('*', requireAuth)` + `requireRole('editor')` wiring in `src/server/index.ts`. The full server-side surface is contractually exercised by `src/server/__tests__/auth-and-tenant.test.ts`.

What's missing for the auth "system to fit the current project" is the **front-end half**: the user has no way to actually log in, no UI gating, no session-derived identity. `src/store/tenant-store.ts` hard-codes `currentUserId: 'user-internal-admin'`, so the UI is currently pretending to be an admin. This PR finishes the loop.

## Goal

End-to-end authentication in the running app:
- A login page that talks to the existing backend.
- A session-derived "current actor" hook that replaces the hardcoded admin in `tenant-store.ts`.
- A router guard that redirects unauthenticated visitors to login, and bounces logged-in users away from login.
- A 401 interceptor so a stale session forces a re-login from any query mutation.
- Mobile (≤ 767px) friendly — keyboard, autofill, focus visible, button hit-targets ≥ h-9.

## Non-goals

- Bearer-token / mobile keychain path. The NUL-18 plan explicitly defers this until a Mobile Engineer is hired. The cookie design already accommodates that future hook (login route returns the user record; a parallel token route can be added without breaking the cookie path).
- Admin UI for creating users. The schema comment already notes that "production users get theirs set via the future admin UI (NUL-12 follow-up)". Out of scope here.
- SSO / SAML / OIDC. Single-tenant internal IPAM; email+password is the right primitive for v1.
- Multi-step password reset / email verification. Defer until there is an email transport.
- Replacing the dev fallback session secret. `IPAM_SESSION_SECRET` env var is the real prod lever — keep the dev fallback with its startup warning.

## Proposed design

### Data flow

```
+-------------------+   POST /api/auth/login    +-----------+
| /login  <Login/>  | -------------------------> | Hono auth |
+--------+----------+    { email, password }     +-----+-----+
         |                                          | signed cookie
         | redirect /                               v
         v            GET /api/auth/me        browser cookie jar
+-----TanStack Router ---- + ---------- http-client --------+
| beforeLoad: /me?  ----- if no, redirect /login
|                          \-- role from server, populate currentUser
```

### Files to add

- `src/features/auth/login-page.tsx` — TanStack route page. React Hook Form + Zod (already in deps). Submit → `api.post('/api/auth/login', ...)` → on 200, `queryClient.invalidateQueries({ queryKey: ['me'] })` and `router.navigate({ to: '/' })`. On 401, inline error. On 429, surface Retry-After from header.
- `src/features/auth/use-current-user.ts` — `useQuery(['me'], () => api.get('/api/auth/me'))` returning `{ data, isLoading, error }`. The router guard reads this; everything else reads `currentUser.role` from the query cache via `useQueryClient().getQueryData(['me'])`.
- `src/features/auth/route-guard.tsx` — small `<AuthGuard>` component or just a `beforeLoad` on the root: if `/me` is loading, render the existing splash skeleton; if `/me` returned 401, `router.navigate({ to: '/login', replace: true })` and capture `from` for post-login bounce; else allow.
- `src/features/auth/logout-button.tsx` — POST `/api/auth/logout`, drop the `['me']` cache, navigate `/login`. Slot into the existing `topbar.tsx` next to the avatar.
- `src/features/auth/api-error-401.test.ts` — vitest/node:test unit for the http-client wrapper that turns a 401 into `queryClient.setQueryData(['me'], null)` + dispatch a 'session-expired' event the auth guard listens to.

### Files to edit

- `src/routes/__root.tsx` — add `beforeLoad` (or equivalent TanStack Router `pendingComponent`) that runs the auth check on every navigation. Loader pattern already used by siblings.
- `src/routes/index.tsx` and the rest — no edits. They keep reading from `tenant-store.ts`; only the source of `currentUserId`/role moves.
- `src/store/tenant-store.ts` — replace the hardcoded `'user-internal-admin'` with a derived value from the `['me']` query. Concretely: keep `tenant-store` as the Zustand-side mirror (so feature code that already calls `useTenantStore` continues to work), but introduce a `useMeSync()` hook called once in `__root.tsx` that pipes `queryClient.getQueryData(['me'])` into the store on every change. No call-site churn.
- `src/lib/api/http-client.ts` — already does `credentials: 'include'`. Add a small response interceptor: on any 401 from a `/api/**` route other than `/api/auth/login`, dispatch a `window.dispatchEvent(new CustomEvent('ipam:session-expired'))`. The auth guard listens and navigates to `/login?from=…`.
- `src/lib/api/services.ts` and `src/lib/api/ipam.ts` and the rest — no edits. They already use the `api` wrapper which carries cookies.

### Cookie / CORS check (dev mode)

`http-client.ts` defaults to `http://localhost:8787`. The Vite dev server is on `:5173`. This is cross-origin, but both are localhost so the cookie name `ipam_session` with `SameSite=Lax` and `credentials: 'include'` should ride the redirect. Verify in dev: a quick `curl` from a logged-in session against `/api/sites` should work when given the cookie. Document the rule in `README.md` auth section: cookies persist per-origin, so `app.localhost:5173` and `localhost:8787` are different cookie jars — use one of the loopback aliases.

### RBAC UX

`canWrite(role)` and `canAdmin(role)` already exist in `src/lib/auth.ts`. The components already call them. No change to component code; only the `role` source becomes server-derived instead of whatever the hardcoded store said.

### Tests

- `src/features/auth/login-page.test.tsx` — renders form, submits, asserts that a successful login navigates to `/` and that `/me` cache is populated. Mocks the `api` fetch wrapper.
- `src/features/auth/route-guard.test.tsx` — when `/me` errors with 401, navigating to `/racks` ends up at `/login`.
- Reuse `src/server/__tests__/auth-and-tenant.test.ts` — already covers backend contracts; ensure it still passes.
- Existing `src/lib/api/physical.test.ts` — keep green; the http-client interceptor is additive.

### Verification

- `npm run typecheck` — clean.
- `npm test` — all green, new auth-UI tests included.
- `npm run build` — Vite production bundle includes the auth route + components.
- Manual smoke (desktop + iPhone-emulation Chrome, per the user's preference recorded in notes): open `/`, get bounced to `/login`, log in as `stephan@internal.example / ipam-dev`, see the dashboard, refresh, stay logged in for 7 days, hit `/racks` and try a mutation as a viewer to see the 403 toast path.

## Sequencing

1. Add the four new files under `src/features/auth/` (login-page, use-current-user, route-guard, logout-button).
2. Wire `__root.tsx` to use the guard.
3. Pipe the `['me']` query into `tenant-store`.
4. Add the 401 interceptor in `http-client.ts`.
5. Add tests; run `npm test`, `npm run typecheck`, `npm run build`.
6. Run the dev stack and exercise login → dashboard → logout → re-login.
7. Commit, hand back to the board.

## Risks

- The cross-origin cookie case is the only thing that needs a hands-on verify in dev. If Lax cookies don't ride across `:5173` ↔ `:8787`, fall back to (a) Vite proxy config so both share the origin, or (b) keep two origins and document that users must use one of the loopback aliases. Mitigation is a one-line dev fix.
- `__root.tsx` already uses TanStack Router; verify the `beforeLoad` pattern is the current idiom and not the deprecated `onLoad`. If the project uses a different convention (e.g. `<Suspense>` boundary on a loader), match it.

## Approval ask

Approve to:
- Land the four new `src/features/auth/*` files.
- Edit `__root.tsx`, `tenant-store.ts`, `http-client.ts` to wire the session through.
- Add the two new tests.
- Defer bearer-token / mobile / SSO / password-reset / admin UI to follow-ups.

If you'd rather scope this PR lighter (login page + route guard only; keep `tenant-store.ts` hardcoded until a separate issue), say so before approval lands.
