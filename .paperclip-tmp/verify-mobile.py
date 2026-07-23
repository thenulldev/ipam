from __future__ import annotations

import json
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

API = "http://127.0.0.1:8787"
WEB = "http://127.0.0.1:5173"
OUT = Path(".paperclip-tmp/screenshots")
OUT.mkdir(parents=True, exist_ok=True)

body = json.dumps({"email": "stephan@internal.example", "password": "ipam-dev"}).encode()
req = urllib.request.Request(
    f"{API}/api/auth/login",
    data=body,
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req) as response:
    session = response.headers["Set-Cookie"].split(";", 1)[0].split("=", 1)[1]

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--disable-web-security"])
    for label, width, height in [
        ("mobile-375", 375, 812),
        ("mobile-390", 390, 844),
        ("tablet-768", 768, 1024),
        ("desktop-1280", 1280, 800),
    ]:
        context = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=2)
        context.add_cookies([{
            "name": "ipam_session",
            "value": session,
            "domain": "localhost",
            "path": "/",
            "httpOnly": True,
            "sameSite": "Lax",
        }])
        print("cookies", context.cookies())
        page = context.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("response", lambda response: print(
            f"  response {response.status} {response.url}"
        ) if "/api/" in response.url else None)
        page.on("requestfailed", lambda request: print(
            f"  failed {request.url}: {request.failure}"
        ))
        def authenticate(route, request):
            response = route.fetch(headers={
                **request.headers,
                "Cookie": f"ipam_session={session}",
            })
            route.fulfill(response=response)

        page.route("http://localhost:8787/api/**", authenticate)
        page.goto(f"{WEB}/racks/rack-a1", wait_until="networkidle", timeout=30_000)
        page.wait_for_timeout(1000)
        measurements = page.evaluate("""() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          loading: document.body.innerText.includes('Loading rack'),
        })""")
        print(f"[{label}] {measurements} pageErrors={errors}")
        page.screenshot(path=str(OUT / f"nul-27-{label}-initial.png"), full_page=False)

        if width < 768:
            library = page.get_by_role("button", name="Open device library")
            assert library.count() == 1, "mobile Library button missing"
            library.click()
            page.get_by_role("dialog").wait_for(timeout=5_000)
            page.screenshot(path=str(OUT / f"nul-27-{label}-library.png"), full_page=False)
            page.keyboard.press("Escape")
            page.get_by_role("dialog").wait_for(state="detached", timeout=5_000)

            library.click()
            page.get_by_role("tab", name="Devices").click()
            device = page.locator('[role="dialog"] li button').first
            assert device.count() == 1, "rack device entry missing"
            device.click()
            settings = page.get_by_role("button", name="Open device settings")
            assert settings.is_enabled(), "Settings button did not enable after device selection"
            settings.click()
            page.get_by_role("dialog").wait_for(timeout=5_000)
            page.screenshot(path=str(OUT / f"nul-27-{label}-settings.png"), full_page=False)
        context.close()
    browser.close()
