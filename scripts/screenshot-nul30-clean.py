"""Clean NUL-30 desktop screenshot at 1280px selecting 172.16.1.0/24
(prefix with addresses but no DHCP scope — avoids the unrelated
network-services.tsx dnsServers.join bug for the screenshot only)."""
from __future__ import annotations
import json
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

API = "http://localhost:8787"
WEB = "http://localhost:5173"
OUT = Path(__file__).resolve().parents[1] / ".paperclip-tmp" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

LOGIN_EMAIL = "stephan@internal.example"
LOGIN_PASSWORD = "ipam-dev"


def login():
    body = json.dumps({"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD}).encode()
    req = urllib.request.Request(
        f"{API}/api/auth/login", data=body,
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as r:
        cookie = r.headers.get("Set-Cookie", "").split(";", 1)[0]
    return cookie.split("=", 1)[1]


def main():
    session = login()
    print(f"login ok")

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-web-security"])
        try:
            for name, w, h in [
                ("nul-30-ipam-desktop-1280", 1280, 800),
                ("nul-30-ipam-desktop-1440", 1440, 900),
            ]:
                ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2)
                ctx.add_cookies([{
                    "name": "ipam_session", "value": session, "url": API,
                    "httpOnly": True, "sameSite": "Lax"}])
                page = ctx.new_page()
                page.goto(f"{WEB}/ipam", wait_until="networkidle", timeout=30_000)
                page.wait_for_timeout(2500)

                # Expand 172.16.0.0/16 then click 172.16.1.0/24 (no dhcp scope)
                page.locator("aside button:has-text('172.16.0.0/16')").first.click(timeout=4000)
                page.wait_for_timeout(400)
                page.locator("aside button:has-text('172.16.1.0/24')").first.click(timeout=4000)
                page.wait_for_timeout(1200)

                out = OUT / f"{name}.png"
                page.screenshot(path=str(out), full_page=False)
                print(f"wrote {out}")
                ctx.close()
        finally:
            browser.close()


if __name__ == "__main__":
    main()
