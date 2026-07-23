#!/usr/bin/env python3
"""Post durable progress on NUL-50 and update disposition to in_progress.

The accepted plan (rev 1, doc 57f7e94b-15ac-40ee-9717-ec6d7ad52666) has been
decomposed into 5 child issues under NUL-50 with a strict sequencing chain.

Live continuation path: NUL-52 is unblocked and ready for execution. As each
child completes, the next one unblocks automatically.
"""
import json
import os
import urllib.request
import urllib.error

api = os.environ["PAPERCLIP_API_URL"]
key = os.environ["PAPERCLIP_API_KEY"]
run = os.environ["PAPERCLIP_RUN_ID"]
task = os.environ["PAPERCLIP_TASK_ID"]
base = api if api.endswith("/api") else api + "/api"

body = (
    "Accepted plan (rev 1) decomposed into 5 child issues under NUL-50 with "
    "sequencing enforced via blockedByIssueIds. The head child (NUL-52) is "
    "unblocked and ready for execution; each subsequent child unlocks when "
    "its predecessor lands.\n\n"
    "Children (all `todo`):\n"
    "- NUL-52 — Login page + useCurrentUser hook (API surface). unblocked.\n"
    "- NUL-53 — Route guard + logout button wired into __root.tsx. blocked by NUL-52.\n"
    "- NUL-54 — Replace hardcoded admin in tenant-store with session-derived actor. blocked by NUL-53.\n"
    "- NUL-55 — 401 interceptor in http-client.ts (session-expired event). blocked by NUL-54.\n"
    "- NUL-56 — Login/guard tests + verification + commit. blocked by NUL-55.\n\n"
    "Per the plan's design, each child stays tight enough to land as a single "
    "PR. Backend auth (NUL-18) is untouched — all five children are front-end "
    "fit-out only. Out-of-scope items (bearer-token / mobile, admin user UI, "
    "SSO, password reset) are NOT created here; they're explicit non-goals "
    "until the relevant hires happen or a follow-up board item requests them.\n\n"
    "Status on NUL-50 flips to `in_progress`. Live continuation path is "
    "NUL-52 (no blockers, ready for the executor). I will resume on the next "
    "wake when NUL-52 reports back or the board steers."
)

# 1. Comment on the issue
comment = {"body": body}
req = urllib.request.Request(
    f"{base}/issues/{task}/comments", method="POST", data=json.dumps(comment).encode()
)
req.add_header("Authorization", "Bearer " + key)
req.add_header("X-Paperclip-Run-Id", run)
req.add_header("Content-Type", "application/json")
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print("comment HTTP", r.status)
        print(r.read().decode()[:400])
except urllib.error.HTTPError as e:
    print("comment HTTPERR", e.code, e.read().decode()[:600])
    raise

# 2. PATCH status -> in_progress with the summary comment.
patch = {"status": "in_progress", "comment": body}
req = urllib.request.Request(
    f"{base}/issues/{task}", method="PATCH", data=json.dumps(patch).encode()
)
req.add_header("Authorization", "Bearer " + key)
req.add_header("X-Paperclip-Run-Id", run)
req.add_header("Content-Type", "application/json")
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print("patch HTTP", r.status)
        print(r.read().decode()[:400])
except urllib.error.HTTPError as e:
    print("patch HTTPERR", e.code, e.read().decode()[:600])
    raise
