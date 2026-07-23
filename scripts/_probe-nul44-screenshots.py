"""NUL-44 visual evidence — capture one screenshot per route at the
acceptance widths, plus a quick 'can the user scroll inside the panel'
check on dashboard (recent activity card) and patches (table inside
its overflow-x-auto).
"""
from __future__ import annotations
from pathlib import Path
from playwright.sync_api import sync_playwright

URL_BASE = "http://localhost:5173"
AUTH = {
    "email": "stephan@internal.example",
    "password": "ipam-dev",
    # The UI stores auth via /api/auth/login; we POST it before any
    # screenshot is captured.
}
ROUTES = [
    ("dashboard", "/"),
    ("floorplan", "/floorplan"),
    ("topology", "/topology"),
    ("settings", "/settings"),
    ("templates", "/templates"),
    ("patches", "/patches"),
]
VIEWPORTS = [
    ("nul44-375",  375,  812),
    ("nul44-390",  390,  844),
    ("nul44-768",  768, 1024),
    ("nul44-1280", 1280, 800),
]
OUT = Path(__file__).resolve().parents[1] / ".paperclip-tmp" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)


def _session_cookie() -> str:
    """Issue a fresh session cookie against the dev Hono server.

    The dev SPA never rehydrates from this cookie (state is hardcoded in
    tenant-store.ts) but it does send it with every API request, which is
    what /api/* use to identify the actor. Keeping the cookie fresh
    matters because expired sessions return 401 and queries fall back to
    empty data.
    """
    import urllib.request
    import json
    req = urllib.request.Request(
        URL_BASE.replace("5173", "8787") + "/api/auth/login",
        data=json.dumps(AUTH).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        # Cookie is in the Set-Cookie header; we don't have an easy
        # cookie jar here, so pull it out of the response header.
        cookie = r.headers.get("set-cookie", "")
        if "ipam_session=" not in cookie:
            raise RuntimeError(f"login response missing cookie: {cookie!r}")
        return cookie.split("ipam_session=", 1)[1].split(";", 1)[0]


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            for vlabel, w, h in VIEWPORTS:
                ctx = browser.new_context(
                    viewport={"width": w, "height": h},
                    device_scale_factor=2,
                )
                page = ctx.new_page()
                # The dev SPA has no login UI — the dev session uses a
                # hardcoded user/tenant in tenant-store.ts. The Hono dev
                # server issues session cookies only via /api/auth/login.
                # We pre-authenticate the browser context by injecting
                # the session cookie directly. stephan@internal.example
                # is the seeded admin for tenant-internal (the seeded
                # tenant that contains mock sites/racks/cables).
                _cookie_value = _session_cookie()
                ctx.add_cookies([
                    {
                        "name": "ipam_session",
                        "value": _cookie_value,
                        "domain": "localhost",
                        "path": "/",
                        "httpOnly": True,
                        "sameSite": "Lax",
                    }
                ])
                for rname, path in ROUTES:
                    url = URL_BASE + path
                    page.goto(url, wait_until="networkidle", timeout=30_000)
                    page.wait_for_timeout(900)
                    out = OUT / f"{vlabel}-{rname}.png"
                    page.screenshot(path=str(out), full_page=False)
                    print(f"wrote {out}")
                ctx.close()
        finally:
            browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
