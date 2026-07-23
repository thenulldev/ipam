"""Check what's actually in the topbar."""
from __future__ import annotations
import json
import urllib.request
from playwright.sync_api import sync_playwright

API = "http://localhost:8787"
WEB = "http://localhost:5173"


def login() -> str:
    body = json.dumps({"email": "stephan@internal.example", "password": "ipam-dev"}).encode()
    req = urllib.request.Request(
        f"{API}/api/auth/login", data=body,
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as r:
        cookie = r.headers.get("Set-Cookie", "").split(";", 1)[0]
    return cookie.split("=", 1)[1]


cookie = login()
with sync_playwright() as p:
    browser = p.chromium.launch(args=["--disable-web-security"])
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    ctx.add_cookies([{
        "name": "ipam_session", "value": cookie, "url": API,
        "httpOnly": True, "sameSite": "Lax",
    }])
    page = ctx.new_page()
    page.on("pageerror", lambda e: print(f"[pageerror] {e}"))
    page.goto(f"{WEB}/ipam", wait_until="networkidle", timeout=30_000)
    page.wait_for_timeout(2000)
    snap = page.evaluate("""
() => {
  const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
    name: b.getAttribute('aria-label'),
    text: b.innerText.slice(0, 60),
    visible: b.offsetParent !== null,
    rect: b.getBoundingClientRect().toJSON(),
  }));
  return { pathname: location.pathname, buttons };
}
""")
    print(json.dumps(snap, indent=2)[:3000])
    page.screenshot(path=".paperclip-tmp/screenshots/nul60-debug2.png")
    browser.close()
