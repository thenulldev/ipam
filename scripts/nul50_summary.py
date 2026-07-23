#!/usr/bin/env python3
"""Post the durable progress comment for NUL-50 and set status to in_review."""
import json, os, urllib.request, urllib.error

api = os.environ["PAPERCLIP_API_URL"]
key = os.environ["PAPERCLIP_API_KEY"]
run = os.environ["PAPERCLIP_RUN_ID"]
task = os.environ["PAPERCLIP_TASK_ID"]
base = api if api.endswith("/api") else api + "/api"

body = (
    "Ack on NUL-50. The auth backend (NUL-18) is already shipped: see "
    "`src/server/auth.ts` (scrypt hashing, HMAC-signed session cookies, "
    "RBAC viewer/editor/admin, in-memory login rate-limiter, "
    "login/logout/me endpoints) and `api.use('*', requireAuth)` plus "
    "`requireRole('editor')` in `src/server/index.ts`. Integration "
    "tests live in `src/server/__tests__/auth-and-tenant.test.ts` and "
    "stay green.\n\n"
    "What's left for this issue is the front-end half so the "
    "authentication system actually fits the running app. Plan is "
    "uploaded as the `plan` document (revision 1; rev "
    "bace5e89-f960-4799-8f37-4133e6f8ad6a, doc "
    "57f7e94b-15ac-40ee-9717-ec6d7ad52666).\n\n"
    "Requested `request_confirmation` interaction "
    "98c9cc23-7fbd-4435-bf7d-6c2eb7af6082 is open and waiting on your "
    "call. Wake policy is `wake_assignee_on_accept` so I resume on "
    "approve. If you want to rescope (e.g. login-page only, or land "
    "something else first), reject with a reason and I'll re-plan.\n\n"
    "Headline: 4 new files under `src/features/auth/`, edits to "
    "`__root.tsx`, `tenant-store.ts`, and `http-client.ts`, plus 2 new "
    "tests. Out of scope: bearer tokens (deferred to Mobile Engineer "
    "hire), SSO, password reset, admin user-management UI."
)

# 1. Comment on the issue
comment = {
    "body": body,
}
req = urllib.request.Request(
    f"{base}/issues/{task}/comments", method="POST", data=json.dumps(comment).encode()
)
req.add_header("Authorization", "Bearer " + key)
req.add_header("X-Paperclip-Run-Id", run)
req.add_header("Content-Type", "application/json")
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print("comment HTTP", r.status)
        print(r.read().decode()[:600])
except urllib.error.HTTPError as e:
    print("comment HTTPERR", e.code, e.read().decode()[:600])

# 2. PATCH status to in_review, with the comment summarising what we did.
# Per playbook: in_review needs a real review/approval path. The open
# request_confirmation interaction provides that.
patch = {
    "status": "in_review",
    "comment": body,
}
req = urllib.request.Request(
    f"{base}/issues/{task}", method="PATCH", data=json.dumps(patch).encode()
)
req.add_header("Authorization", "Bearer " + key)
req.add_header("X-Paperclip-Run-Id", run)
req.add_header("Content-Type", "application/json")
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print("patch HTTP", r.status)
        print(r.read().decode()[:600])
except urllib.error.HTTPError as e:
    print("patch HTTPERR", e.code, e.read().decode()[:600])
