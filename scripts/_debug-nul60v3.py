"""Step-by-step debug of screenshot capture."""
from __future__ import annotations
import json
import urllib.request
from pathlib import Path
import sys
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
print(f"[cookie] len={len(cookie)}", flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--disable-web-security"])
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    ctx.add_cookies([{"name": "ipam_session", "value": cookie, "url": API, "httpOnly": True, "sameSite": "Lax"}])
    page = ctx.new_page()
    page.on("pageerror", lambda e: print(f"[pageerror] {e}", flush=True))
    page.on("console", lambda m: print(f"[console:{m.type}] {m.text[:200]}", flush=True) if m.type in ("error", "warning") else None)
    page.on("requestfailed", lambda r: print(f"[reqfailed] {r.url} -> {r.failure}", flush=True))

    print("[step] goto /ipam", flush=True)
    page.goto(f"{WEB}/ipam", wait_until="networkidle", timeout=30_000)
    print("[step] post-goto", flush=True)
    page.wait_for_timeout(1500)
    print(f"[step] pathname={page.url}", flush=True)

    # Check the help button via different selectors
    btns = page.evaluate("""
() => {
  return Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null).map(b => ({
    ariaLabel: b.getAttribute('aria-label'),
    text: b.innerText.trim().slice(0, 40),
  }));
}
""")
    print(f"[debug] visible buttons: {btns}", flush=True)

    # Try clicking by aria-label
    help = page.locator('button[aria-label="Help and shortcuts"]')
    print(f"[debug] help count: {help.count()}", flush=True)
    if help.count() > 0:
        help.first.click()
        page.wait_for_timeout(500)
        items = page.evaluate("""
() => Array.from(document.querySelectorAll('[role="menuitem"]')).map(m => m.innerText.trim())
""")
        print(f"[debug] menu items: {items}", flush=True)
        if "Start tour" in str(items):
            page.get_by_role("menuitem", name="Start tour").first.click()
            page.wait_for_timeout(800)
            snap = page.evaluate("""
() => {
  const popover = document.querySelector('[data-radix-popper-content-wrapper]');
  const dialog = document.querySelector('[role="dialog"]');
  const anchor = document.querySelector('[data-tour][aria-describedby]');
  return {
    pathname: location.pathname,
    popover: popover ? 'present' : null,
    dialog: dialog ? 'present' : null,
    anchor: anchor ? anchor.getAttribute('data-tour') : null,
    tourStep: localStorage.getItem('ipam:tour-step:v1'),
  };
}
""")
            print(f"[debug] after-start: {snap}", flush=True)
            page.screenshot(path=".paperclip-tmp/screenshots/nul60-debug3.png")

    browser.close()
