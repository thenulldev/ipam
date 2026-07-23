#!/usr/bin/env python3
"""Create the request_confirmation interaction for the NUL-50 plan."""
import json, os, sys, urllib.request, urllib.error

api = os.environ["PAPERCLIP_API_URL"]
key = os.environ["PAPERCLIP_API_KEY"]
run = os.environ["PAPERCLIP_RUN_ID"]
task = os.environ["PAPERCLIP_TASK_ID"]
cid = os.environ["PAPERCLIP_COMPANY_ID"]
doc_id = os.environ["DOC_ID"]
rev_id = os.environ["REV_ID"]
base = api if api.endswith("/api") else api + "/api"

prompt = (
    "Approve the NUL-50 plan? The backend auth (scrypt sessions, RBAC) "
    "is already shipped (NUL-18). This PR adds the front-end half: "
    "/login page, session-derived `useCurrentUser()`, a TanStack route "
    "guard that bounces to /login on 401, and a logout button in the top "
    "bar. Mobile-friendly (>= 9 targets, autofill, keyboard OK). "
    "Out of scope: bearer tokens (deferred to Mobile Engineer), SSO, "
    "password reset, admin UI for creating users. Full design lives on "
    "the `plan` document on this issue. Reject with a reason if you'd "
    "prefer to scope down or skip something."
)

body = {
  "kind": "request_confirmation",
  "idempotencyKey": f"confirmation:{task}:plan:{rev_id}",
  "title": "Approve NUL-50 plan?",
  "summary": (
      "Front-end fit-out for the existing auth system: login page, "
      "session-derived actor, route guard, logout button. Backend is "
      "already in place from NUL-18."
  ),
  "continuationPolicy": "wake_assignee_on_accept",
  "payload": {
    "version": 1,
    "prompt": prompt,
    "acceptLabel": "Approve and implement",
    "rejectLabel": "Rescope",
    "rejectRequiresReason": True,
    "rejectReasonLabel": "What should change?",
    "allowDeclineReason": True,
    "detailsMarkdown": (
      "**Files added.** `src/features/auth/login-page.tsx`, "
      "`src/features/auth/use-current-user.ts`, "
      "`src/features/auth/route-guard.tsx`, "
      "`src/features/auth/logout-button.tsx`, plus tests "
      "(`login-page.test.tsx`, `route-guard.test.tsx`).\n\n"
      "**Files edited.** `src/routes/__root.tsx` (auth guard), "
      "`src/store/tenant-store.ts` (replace hardcoded actor), "
      "`src/lib/api/http-client.ts` (401 interceptor + session-expired "
      "event).\n\n"
      "**Risk notes.** Cross-origin cookie ride between Vite (:5173) "
      "and Hono (:8787) is verified to work under Lax / include. "
      "Backend tests in `src/server/__tests__/auth-and-tenant.test.ts` "
      "stay green; new tests cover the UI half.\n\n"
      "See the `plan` document on this issue for the full design, "
      "non-goals, and verification steps."
    ),
    "supersedeOnUserComment": False,
    "target": {
      "type": "issue_document",
      "key": "plan",
      "issueId": task,
      "documentId": doc_id,
      "revisionId": rev_id,
      "revisionNumber": 1,
    },
  },
}

print("=== request body ===")
print(json.dumps(body, indent=2)[:1500])

req = urllib.request.Request(
    f"{base}/issues/{task}/interactions",
    method="POST",
    data=json.dumps(body).encode(),
)
req.add_header("Authorization", "Bearer " + key)
req.add_header("X-Paperclip-Run-Id", run)
req.add_header("Content-Type", "application/json")

try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print("\n=== HTTP", r.status, "===")
        print(r.read().decode()[:1500])
except urllib.error.HTTPError as e:
    print("\n=== HTTPERR", e.code, "===")
    print(e.read().decode()[:1500])
