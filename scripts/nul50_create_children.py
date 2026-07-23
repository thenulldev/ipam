#!/usr/bin/env python3
"""Create child issues under NUL-50 from the accepted plan (rev 1).

Pass 1: create 5 child issues without blockers. Print IDs.
Pass 2: PATCH each non-head child with blockedByIssueIds = [previousChildId]
        to enforce the plan's sequencing.

The accepted plan (doc 57f7e94b-15ac-40ee-9717-ec6d7ad52666, rev
bace5e89-f960-4799-8f37-4133e6f8ad6a) sequences:

  1. login-page.tsx + use-current-user.ts (the API surface)
  2. route-guard.tsx + logout-button.tsx + __root.tsx wiring
  3. tenant-store.ts refactor (drop hardcoded admin, use useMeSync)
  4. http-client.ts 401 interceptor (session-expired event)
  5. tests + typecheck/build + manual smoke + commit

Out of scope (deferred follow-ups; not created here):
  - bearer-token / mobile keychain path
  - admin UI for creating users (NUL-12 follow-up)
  - SSO/SAML/OIDC
  - password reset / email verification
"""
import json
import os
import sys
import urllib.request
import urllib.error

api = os.environ["PAPERCLIP_API_URL"]
key = os.environ["PAPERCLIP_API_KEY"]
run = os.environ["PAPERCLIP_RUN_ID"]
task = os.environ["PAPERCLIP_TASK_ID"]
base = api if api.endswith("/api") else api + "/api"

CHILDREN = [
    {
        "title": "NUL-50.1 — Login page + useCurrentUser hook (API surface)",
        "description": (
            "Add the front-end API surface for auth so the rest of the chain can build on it.\n\n"
            "**New files**\n"
            "- `src/features/auth/login-page.tsx` — TanStack route page. React Hook Form + Zod (already in deps). "
            "Submit → `api.post('/api/auth/login', { email, password })` → on 200, "
            "`queryClient.invalidateQueries({ queryKey: ['me'] })` and `router.navigate({ to: '/' })`. "
            "On 401, inline error. On 429, surface Retry-After from header.\n"
            "- `src/features/auth/use-current-user.ts` — `useQuery(['me'], () => api.get('/api/auth/me'))` "
            "returning `{ data, isLoading, error }`. The route guard reads this; everything else reads "
            "`currentUser.role` from the query cache via `useQueryClient().getQueryData(['me'])`.\n\n"
            "**Touched files** — none beyond what's added.\n\n"
            "**Backend dependency** — `/api/auth/login` and `/api/auth/me` already shipped under NUL-18. "
            "No backend work in this child.\n\n"
            "**Acceptance**\n"
            "- Files exist with the documented exports.\n"
            "- `npm run typecheck` clean.\n"
            "- `npm test` green (existing tests still pass; this child does not add tests).\n\n"
            "**Out of scope for this child** — wiring the guard into __root.tsx, the 401 interceptor, "
            "and the tenant-store refactor. Those are NUL-50.2 / 50.4 / 50.3 respectively."
        ),
        "priority": "medium",
        "status": "todo",
        "workMode": "standard",
        "acceptanceCriteria": [
            "src/features/auth/login-page.tsx exists with a TanStack route export",
            "src/features/auth/use-current-user.ts exports useCurrentUser backed by useQuery(['me'])",
            "Login submit calls /api/auth/login and invalidates ['me'] on 200",
            "npm run typecheck passes",
            "npm test stays green",
        ],
    },
    {
        "title": "NUL-50.2 — Route guard + logout button wired into __root.tsx",
        "description": (
            "Use the useCurrentUser hook from NUL-50.1 to gate navigation and add the logout control.\n\n"
            "**New files**\n"
            "- `src/features/auth/route-guard.tsx` — small `<AuthGuard>` component or `beforeLoad` on the root: "
            "if `/me` is loading, render the existing splash skeleton; if `/me` returned 401, "
            "`router.navigate({ to: '/login', replace: true })` and capture `from` for post-login bounce; "
            "else allow.\n"
            "- `src/features/auth/logout-button.tsx` — POST `/api/auth/logout`, drop the `['me']` cache, "
            "navigate `/login`. Slot into the existing `topbar.tsx` next to the avatar.\n\n"
            "**Edited files**\n"
            "- `src/routes/__root.tsx` — add the auth check on every navigation via `beforeLoad` "
            "(verify the project uses `beforeLoad` and not deprecated `onLoad`).\n\n"
            "**Acceptance**\n"
            "- Hitting `/` while logged out navigates to `/login?from=/`.\n"
            "- Hitting `/login` while logged in navigates to `/`.\n"
            "- Logout button in topbar ends the session and lands on `/login`.\n"
            "- `npm run typecheck` and `npm test` stay green."
        ),
        "priority": "medium",
        "status": "todo",
        "workMode": "standard",
        "acceptanceCriteria": [
            "src/features/auth/route-guard.tsx exists and redirects on 401",
            "src/features/auth/logout-button.tsx posts /api/auth/logout and clears ['me']",
            "src/routes/__root.tsx invokes the guard on every navigation",
            "Logout button is reachable from the existing topbar next to the avatar",
            "npm run typecheck and npm test pass",
        ],
    },
    {
        "title": "NUL-50.3 — Replace hardcoded admin in tenant-store with session-derived actor",
        "description": (
            "`src/store/tenant-store.ts` currently hard-codes `currentUserId: 'user-internal-admin'`. "
            "Replace that with a derived value from the `['me']` query populated in NUL-50.1.\n\n"
            "**Edited files**\n"
            "- `src/store/tenant-store.ts` — keep the Zustand store as a mirror (callers using "
            "`useTenantStore` keep working). Introduce a `useMeSync()` hook called once in `__root.tsx` "
            "that pipes `queryClient.getQueryData(['me'])` into the store on every change.\n"
            "- `src/routes/__root.tsx` — call `useMeSync()` once near the top.\n\n"
            "**Touched files** — `src/routes/index.tsx` and friends do NOT change. They continue to read "
            "from `tenant-store.ts`; only the source of `currentUserId`/role moves.\n\n"
            "**Acceptance**\n"
            "- `grep -R \"user-internal-admin\" src/` returns no hits.\n"
            "- The dashboard reflects the logged-in user's role.\n"
            "- `npm run typecheck` and `npm test` pass."
        ),
        "priority": "medium",
        "status": "todo",
        "workMode": "standard",
        "acceptanceCriteria": [
            "tenant-store.ts no longer references the hardcoded 'user-internal-admin' id",
            "useMeSync hook pipes ['me'] query data into tenant-store",
            "__root.tsx calls useMeSync exactly once",
            "No call-site churn in src/routes/** or feature code that reads tenant-store",
            "npm run typecheck and npm test pass",
        ],
    },
    {
        "title": "NUL-50.4 — 401 interceptor in http-client.ts (session-expired event)",
        "description": (
            "Make any 401 from a non-login `/api/**` route force a re-login from any mutation by "
            "broadcasting a `session-expired` event the guard from NUL-50.2 already listens to.\n\n"
            "**Edited files**\n"
            "- `src/lib/api/http-client.ts` — already does `credentials: 'include'`. Add a response "
            "interceptor: on any 401 from a `/api/**` route other than `/api/auth/login`, dispatch "
            "`window.dispatchEvent(new CustomEvent('ipam:session-expired'))`. The route guard from "
            "NUL-50.2 listens for this event and navigates to `/login?from=…`.\n\n"
            "**New file**\n"
            "- `src/features/auth/api-error-401.test.ts` — unit test for the http-client wrapper that "
            "turns a 401 into the dispatch.\n\n"
            "**Acceptance**\n"
            "- Stale cookie → mutation → page bounces to `/login?from=…`.\n"
            "- The existing `src/lib/api/physical.test.ts` stays green (the interceptor is additive).\n"
            "- `npm run typecheck` and `npm test` pass."
        ),
        "priority": "medium",
        "status": "todo",
        "workMode": "standard",
        "acceptanceCriteria": [
            "http-client.ts dispatches 'ipam:session-expired' on 401 from non-login /api/** routes",
            "Existing login-page flow does NOT dispatch the event on its own 401",
            "src/features/auth/api-error-401.test.ts added and passes",
            "src/lib/api/physical.test.ts still passes",
            "npm run typecheck and npm test pass",
        ],
    },
    {
        "title": "NUL-50.5 — Login/guard tests + verification + commit",
        "description": (
            "Final verification + commit for the front-end auth fit-out.\n\n"
            "**New tests**\n"
            "- `src/features/auth/login-page.test.tsx` — renders form, submits, asserts successful login "
            "navigates to `/` and populates `/me` cache. Mocks the `api` fetch wrapper.\n"
            "- `src/features/auth/route-guard.test.tsx` — when `/me` errors with 401, navigating to "
            "`/racks` ends up at `/login`.\n\n"
            "**Verification gates (all must pass before commit)**\n"
            "- `npm run typecheck` — clean.\n"
            "- `npm test` — all green, including the new auth-UI tests, "
            "`src/server/__tests__/auth-and-tenant.test.ts` (backend contract), and "
            "`src/lib/api/physical.test.ts`.\n"
            "- `npm run build` — Vite production bundle includes the auth route + components.\n\n"
            "**Manual smoke (desktop + iPhone-emulation Chrome per the user's preference)**\n"
            "1. Open `/` — bounced to `/login`.\n"
            "2. Log in as `stephan@internal.example / ipam-dev` — lands on dashboard.\n"
            "3. Refresh — still logged in for 7 days.\n"
            "4. Hit `/racks` and try a mutation as a viewer — 403 toast path surfaces.\n"
            "5. Logout — back to `/login`.\n\n"
            "**Cross-origin cookie check (dev mode)** — confirm `http-client.ts` reaches "
            "`http://localhost:8787` from Vite at `:5173` with `SameSite=Lax` cookies. If cookies don't "
            "ride, fall back to a Vite proxy config or document a loopback-alias requirement."
        ),
        "priority": "medium",
        "status": "todo",
        "workMode": "standard",
        "acceptanceCriteria": [
            "src/features/auth/login-page.test.tsx added and passes",
            "src/features/auth/route-guard.test.tsx added and passes",
            "npm run typecheck clean",
            "npm test all green",
            "npm run build produces a production bundle with auth route + components",
            "Manual smoke verified in desktop and iPhone-emulation Chrome",
            "Cross-origin cookie ride (Vite 5173 ↔ Hono 8787) confirmed",
            "Commit and hand back to the board",
        ],
    },
]


def post_child(child: dict) -> dict:
    body = dict(child)
    body["status"] = child.get("status", "todo")
    req = urllib.request.Request(
        f"{base}/issues/{task}/children",
        method="POST",
        data=json.dumps(body).encode(),
    )
    req.add_header("Authorization", "Bearer " + key)
    req.add_header("X-Paperclip-Run-Id", run)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode())
            print("POST child ->", r.status, data.get("identifier"), data.get("id"), data.get("title")[:60])
            return data
    except urllib.error.HTTPError as e:
        print("POST child HTTPERR", e.code, e.read().decode()[:600])
        raise


def patch_blockers(issue_id: str, blocked_by: list) -> None:
    body = {"blockedByIssueIds": blocked_by}
    req = urllib.request.Request(
        f"{base}/issues/{issue_id}",
        method="PATCH",
        data=json.dumps(body).encode(),
    )
    req.add_header("Authorization", "Bearer " + key)
    req.add_header("X-Paperclip-Run-Id", run)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print("PATCH blockers ->", issue_id, r.status, "blockedBy", blocked_by)
    except urllib.error.HTTPError as e:
        print("PATCH blockers HTTPERR", e.code, e.read().decode()[:600])
        raise


if __name__ == "__main__":
    created = []
    for c in CHILDREN:
        d = post_child(c)
        created.append(d)

    # Sequencing: each child blocked by the prior one, except the head.
    for i, child in enumerate(created):
        if i == 0:
            continue
        prev_id = created[i - 1]["id"]
        patch_blockers(child["id"], [prev_id])

    print("\n=== Created ===")
    for c in created:
        print(c["identifier"], "->", c["id"], c["status"], "|", c["title"])
