"""NUL-30 acceptance screenshots.

Captures the IPAM page at 375 px (mobile Select + cards), 768 px (tablet
boundary, desktop layout), and 1280 px (desktop w-96 aside + table) WITH a
prefix selected so the address list is visible.

Logs in to the live Hono backend first using a seeded DEV account so the
/api/prefixes and /api/ip-addresses calls return data.

Saves PNGs to .paperclip-tmp/screenshots/.
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

API = "http://localhost:8787"
WEB = "http://localhost:5173"
OUT = Path(__file__).resolve().parents[1] / ".paperclip-tmp" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

# Seeded credentials (src/server/seed.ts -> src/lib/mock/tenants.ts).
LOGIN_EMAIL = "stephan@internal.example"
LOGIN_PASSWORD = "ipam-dev"

VIEWPORTS = [
    ("nul-30-ipam-mobile-375-selected", 375, 812),
    ("nul-30-ipam-tablet-768-selected", 768, 1024),
    ("nul-30-ipam-desktop-1280-selected", 1280, 800),
]


def login_and_get_session_cookie() -> str:
    """Hit /api/auth/login and return the ipam_session cookie value."""
    body = json.dumps({"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD}).encode()
    req = urllib.request.Request(
        f"{API}/api/auth/login",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        set_cookie = r.headers.get("Set-Cookie", "")
        # Extract the cookie value (the first name=value pair before the first
        # semicolon).
        cookie = set_cookie.split(";", 1)[0]
        if not cookie.startswith("ipam_session="):
            raise SystemExit(f"login did not set ipam_session cookie: {set_cookie!r}")
        return cookie


def list_prefix_ids() -> list[str]:
    """Hit /api/prefixes with the cookie and return their IDs in order."""
    req = urllib.request.Request(
        f"{API}/api/prefixes",
        headers={"Cookie": "ipam_session=DUMMY"},
    )
    # We can't easily share the cookie with urllib; instead, return whatever
    # the browser will see. The screenshot script doesn't actually need a
    # server-side IDs list — we drive the UI via Radix keyboard nav, which
    # works on whatever the UI renders.


def main() -> None:
    session_cookie = login_and_get_session_cookie()
    print(f"login ok; cookie={session_cookie[:32]}…")

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-web-security"])
        try:
            for name, w, h in VIEWPORTS:
                ctx = browser.new_context(
                    viewport={"width": w, "height": h},
                    device_scale_factor=2,
                )
                # Inject the session cookie so API calls succeed.
                ctx.add_cookies(
                    [
                        {
                            "name": "ipam_session",
                            "value": session_cookie.split("=", 1)[1],
                            "url": API,
                            "httpOnly": True,
                            "sameSite": "Lax",
                        }
                    ]
                )
                page = ctx.new_page()
                page.goto(f"{WEB}/ipam", wait_until="networkidle", timeout=30_000)
                # Settle hydration + media-query + data fetch + dev-login
                # cookie round-trip.
                page.wait_for_timeout(2500)

                if w < 768:
                    # Mobile: focus the prefix Select and pick a CIDR that has
                    # allocated addresses. The seeded prefix tree starts with
                    # 10.0.0.0/8 (reserved) and walks down to 10.0.0.0/24
                    # (mgmt, has addresses).
                    trigger = page.locator("#ipam-prefix-select")
                    trigger.focus()
                    page.wait_for_timeout(200)
                    page.keyboard.press("ArrowDown")  # open menu
                    page.wait_for_timeout(300)
                    # Press ArrowDown until the trigger's text shows a /24.
                    for _ in range(8):
                        page.keyboard.press("ArrowDown")
                        page.wait_for_timeout(120)
                        value = trigger.text_content() or ""
                        if "/24" in value or "/23" in value or "/25" in value:
                            break
                    page.keyboard.press("Enter")
                    page.wait_for_timeout(800)
                else:
                    # Desktop / tablet: click a leaf /24 row in the SubnetTree
                    # that has allocated addresses (10.0.1.0/24).
                    page.wait_for_timeout(1500)
                    clicked = False
                    for _ in range(30):
                        # SubnetTree rows are buttons in the desktop aside.
                        candidates = [
                            "aside button:has-text('10.0.1.0/24')",
                            "aside button:has-text('172.16.1.0/24')",
                            "aside button:has-text('10.0.2.0/24')",
                        ]
                        for sel in candidates:
                            item = page.locator(sel).first
                            if item.count() > 0:
                                try:
                                    item.scroll_into_view_if_needed(timeout=2000)
                                    item.click(timeout=2000)
                                    clicked = True
                                    break
                                except Exception:
                                    continue
                        if clicked:
                            break
                        # Expand parent if collapsed.
                        for sel in [
                            "aside button:has-text('10.0.0.0/16')",
                            "aside button:has-text('172.16.0.0/16')",
                        ]:
                            try:
                                page.locator(sel).first.click(timeout=1500)
                            except Exception:
                                pass
                        page.wait_for_timeout(300)
                    page.wait_for_timeout(800)
                    if not clicked:
                        print(f"warning: no /24 row found in SubnetTree for {name}")

                out = OUT / f"{name}.png"
                page.screenshot(path=str(out), full_page=False)
                print(f"wrote {out} ({w}x{h})")
                ctx.close()
        finally:
            browser.close()


if __name__ == "__main__":
    main()