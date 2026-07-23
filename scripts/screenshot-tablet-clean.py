"""Clean tablet screenshot at 768px to verify md breakpoint renders desktop layout."""
from __future__ import annotations
import json
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

API = "http://localhost:8787"
WEB = "http://localhost:5173"
OUT = Path(__file__).resolve().parents[1] / ".paperclip-tmp" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)


def login():
    body = json.dumps({"email": "stephan@internal.example", "password": "ipam-dev"}).encode()
    req = urllib.request.Request(
        f"{API}/api/auth/login", data=body,
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as r:
        cookie = r.headers.get("Set-Cookie", "").split(";", 1)[0]
    return cookie.split("=", 1)[1]


def main():
    session = login()
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-web-security"])
        try:
            ctx = browser.new_context(viewport={"width": 768, "height": 1024}, device_scale_factor=2)
            ctx.add_cookies([{
                "name": "ipam_session", "value": session, "url": API,
                "httpOnly": True, "sameSite": "Lax"}])
            page = ctx.new_page()
            page.goto(f"{WEB}/ipam", wait_until="networkidle", timeout=30_000)
            page.wait_for_timeout(2500)
            page.locator("aside button:has-text('172.16.0.0/16')").first.click(timeout=4000)
            page.wait_for_timeout(400)
            page.locator("aside button:has-text('172.16.1.0/24')").first.click(timeout=4000)
            page.wait_for_timeout(1200)
            out = OUT / "nul-30-ipam-tablet-768-clean.png"
            page.screenshot(path=str(out), full_page=False)
            print(f"wrote {out}")
        finally:
            browser.close()


if __name__ == "__main__":
    main()
