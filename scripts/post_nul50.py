#!/usr/bin/env python3
"""Post NUL-50 plan and create request_confirmation interaction."""
import json, os, sys, urllib.request, urllib.error

api = os.environ["PAPERCLIP_API_URL"]
key = os.environ["PAPERCLIP_API_KEY"]
run = os.environ.get("PAPERCLIP_RUN_ID", "")
cid = os.environ["PAPERCLIP_COMPANY_ID"]
task_id = os.environ["PAPERCLIP_TASK_ID"]
base = api if api.endswith("/api") else api + "/api"

def req(method, path, body=None):
    r = urllib.request.Request(base + path, method=method)
    r.add_header("Authorization", "Bearer " + key)
    if run:
        r.add_header("X-Paperclip-Run-Id", run)
    data = None
    if body is not None:
        r.add_header("Content-Type", "application/json")
        data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(r, data=data, timeout=30) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

plan_path = os.environ.get("NUL50_PLAN_FILE", "nul50-plan.md")
with open(plan_path, "r", encoding="utf-8") as f:
    plan_body = f.read()

# 1. PUT the plan document. Issues docs live under /api/issues/{id}/documents/{key}.
# Use PUT so we own the revision.
doc_payload = {
    "key": "plan",
    "title": "NUL-50 — Authentication (front-end fit-out)",
    "format": "markdown",
    "body": plan_body,
}
status, resp = req("PUT", f"/issues/{task_id}/documents/plan", doc_payload)
print(f"PUT plan doc -> {status}")
try:
    doc = json.loads(resp)
    rev = doc.get("revisionId") or doc.get("revision_id") or doc.get("id")
    print(json.dumps({k: doc[k] for k in ("id","key","revisionId","version","currentRevisionId","revisionNumber") if k in doc}, indent=2))
    print(f"REVISION={rev}")
    if "revisions" in doc:
        print("revisions:", json.dumps(doc["revisions"], indent=2)[:400])
except Exception:
    print(resp[:600])

# Save useful bits
with open("/tmp/nul50_doc.json","w") as f:
    f.write(resp)
