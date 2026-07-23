"""Capture the NUL-30 acceptance screenshots.

Acceptance: dev server screenshot at 375 px shows the Select + card list
rendering correctly; desktop screenshot is unchanged.

Runs against http://127.0.0.1:5173 (vite) and http://127.0.0.1:8787 (hono).
Logs in via /api/auth/login, attaches the session cookie, navigates to /ipam,
clicks the same 172.16.1.0/24 prefix the desktop screenshot uses, and writes
two PNGs into .paperclip-tmp/screenshots/.

This script intentionally does NOT take the side-by-side desktop screenshot
again — scripts/screenshot-nul30-clean.py already produced nul-30-ipam-desktop-1280.png
from the previous run; we leave that artifact as the desktop baseline.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

API = "http://localhost:8787"
WEB = "http://localhost:5173"
OUT = Path(__file__).resolve().parents[1] / ".paperclip-tmp" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

LOGIN_EMAIL = "stephan@internal.example"
LOGIN_PASSWORD = "ipam-dev"


def login() -> str:
    body = json.dumps({"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD}).encode()
    req = urllib.request.Request(
        f"{API}/api/auth/login",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            cookie = r.headers.get("Set-Cookie", "").split(";", 1)[0]
    except urllib.error.HTTPError as e:
        raise SystemExit(f"login failed: {e.code} {e.read().decode('utf-8', 'replace')}")
    return cookie


def shoot(browser, name: str, w: int, h: int, session: str) -> Path:
    ctx = browser.new_context(
        viewport={"width": w, "height": h},
        device_scale_factor=2,
        is_mobile=w < 768,
        has_touch=w < 768,
    )
    ctx.add_cookies([
        {
            "name": "ipam_session",
            "value": session,
            "url": API,
            "httpOnly": True,
            "sameSite": "Lax",
        }
    ])
    page = ctx.new_page()
    page.goto(f"{WEB}/ipam", wait_until="networkidle", timeout=30_000)
    # settle for hydration + useMediaQuery effect
    page.wait_for_timeout(1500)

    # On mobile, open the prefix picker and choose the same prefix used by
    # the desktop baseline so we can verify the card-list render path.
    if w < 768:
        page.locator("#ipam-prefix-select").click(timeout=4000)
        page.wait_for_timeout(400)
        page.locator("[role='option']:has-text('172.16.1.0/24')").first.click(timeout=4000)
        page.wait_for_timeout(1200)
    else:
        page.locator("aside button:has-text('172.16.0.0/16')").first.click(timeout=4000)
        page.wait_for_timeout(400)
        page.locator("aside button:has-text('172.16.1.0/24')").first.click(timeout=4000)
        page.wait_for_timeout(1200)

    out = OUT / f"{name}.png"
    page.screenshot(path=str(out), full_page=False)
    print(f"wrote {out} ({w}x{h})")
    ctx.close()
    return out


def main() -> None:
    cookie = login()
    session = cookie.split("=", 1)[1]
    print(f"login ok")

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-web-security"])
        try:
            shoot(browser, "nul-30-ipam-mobile-375", 375, 812, session)
            shoot(browser, "nul-30-ipam-tablet-768", 768, 1024, session)
            shoot(browser, "nul-30-ipam-desktop-1280", 1280, 800, session)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
