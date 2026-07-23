"""Post NUL-29 verification comment and dispose the issue."""
import json
import os
import sys
import urllib.request

API = os.environ['PAPERCLIP_API_URL'].rstrip('/')
if not API.endswith('/api'):
    API += '/api'

KEY = os.environ['PAPERCLIP_API_KEY']
RUN = os.environ['PAPERCLIP_RUN_ID']
ISSUE_ID = '0c17e176-65ec-424a-b58d-e245fdcffc56'

with open('.paperclip-tmp/nul-29-comment.md', 'r', encoding='utf-8') as f:
    body = f.read()

# 1. Post the verification comment
url = f'{API}/issues/{ISSUE_ID}/comments'
data = json.dumps({
    'body': body,
    'presentation': {
        'kind': 'progress_report',
        'tone': 'positive',
        'title': 'NUL-29 Layer 1 verified',
    },
}).encode('utf-8')
req = urllib.request.Request(url, data=data, method='POST')
req.add_header('Authorization', f'Bearer {KEY}')
req.add_header('X-Paperclip-Run-Id', RUN)
req.add_header('Content-Type', 'application/json')
with urllib.request.urlopen(req) as resp:
    print('POST comment HTTP', resp.status)
    print(resp.read().decode()[:500])

# 2. PATCH status to done
url = f'{API}/issues/{ISSUE_ID}'
data = json.dumps({
    'status': 'done',
    'comment': 'Layer 1 verified: app-shell + topbar branch on useMediaQuery(>=768px); new MobileNavDrawer reuses navItems; index.html viewport-fit=cover; safe-area paddings applied; typecheck/lint/build green; screenshots at .paperclip-tmp/screenshots/nul-29-*.png. Workspace-only evidence per .paperclip-tmp/ convention.',
}).encode('utf-8')
req = urllib.request.Request(url, data=data, method='PATCH')
req.add_header('Authorization', f'Bearer {KEY}')
req.add_header('X-Paperclip-Run-Id', RUN)
req.add_header('Content-Type', 'application/json')
with urllib.request.urlopen(req) as resp:
    print('PATCH done HTTP', resp.status)
    body = resp.read().decode()
    print(json.dumps(json.loads(body), indent=2)[:600])
