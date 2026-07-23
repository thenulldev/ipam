"""NUL-43 mobile rack-detail bottom-sheet acceptance.

Captures evidence at 375/390/768/1280 of:
- mobile header wraps without clipping
- mobile Library button opens the device library drawer
- mobile Settings button opens the bottom-sheet settings dialog
- desktop >= 768px is unchanged
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


def login() -> str:
    body = json.dumps({"email": "stephan@internal.example", "password": "ipam-dev"}).encode()
    req = urllib.request.Request(
        f"{API}/api/auth/login", data=body,
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as r:
        cookie = r.headers.get("Set-Cookie", "").split(";", 1)[0]
    return cookie.split("=", 1)[1]


def first_rack_id(cookie: str) -> str | None:
    """Find a rack id to navigate to. Falls back to the racks list page."""
    req = urllib.request.Request(
        f"{API}/api/racks",
        headers={"Cookie": f"ipam_session={cookie}"},
    )
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
    if isinstance(data, list) and data:
        return data[0]["id"]
    if isinstance(data, dict):
        if "racks" in data and data["racks"]:
            return data["racks"][0]["id"]
        if "items" in data and data["items"]:
            return data["items"][0]["id"]
    return None


def first_rack_device_id(cookie: str, rack_id: str) -> str | None:
    """Find a device id inside the rack so the Settings sheet has a target."""
    candidates = [f"/api/racks/{rack_id}/devices", f"/api/racks/{rack_id}", f"/api/devices"]
    for path in candidates:
        try:
            req = urllib.request.Request(
                f"{API}{path}",
                headers={"Cookie": f"ipam_session={cookie}"},
            )
            with urllib.request.urlopen(req) as r:
                data = json.loads(r.read())
        except Exception:
            continue
        items = []
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            for k in ("devices", "items"):
                if k in data and isinstance(data[k], list):
                    items = data[k]
                    break
        for d in items:
            if isinstance(d, dict) and d.get("rackId") == rack_id:
                return d.get("id")
        if items:
            return items[0].get("id") if isinstance(items[0], dict) else None
    return None


# Minimal fixture so the rack-detail page can mount when the live GET-by-id
# endpoint is absent (known pre-existing backend gap, NUL-11 owner).
# `tags` is provided as a JS array — the client types say `string[]`, and the
# mock adapter returns arrays; only the live server returns JSON-encoded
# strings (its own follow-up bug).
MOCK_RACK = {
    "id": "rack-a1", "tenantId": "tenant-internal", "roomId": "room-mdf",
    "name": "MDF-A1", "uHeight": 42, "widthMm": 600, "depthMm": 1000,
    "tags": ["core", "production"], "powerBudgetWatts": 8000,
}
MOCK_DEVICES = [
    {"id": "dev-a1-sw1", "tenantId": "tenant-internal", "rackId": "rack-a1",
     "kind": "switch", "name": "sw-core-01", "vendor": "Cisco", "model": "C9300-48P",
     "uStart": 1, "uHeight": 1, "face": "front", "tags": ["core"],
     "customFields": {"responsible": "NetOps"}, "wattage": 250, "assetTag": "AT-001",
     "serialNumber": "FOC1234X", "warrantyEol": "2027-01-01"},
    {"id": "dev-a1-rtr1", "tenantId": "tenant-internal", "rackId": "rack-a1",
     "kind": "router", "name": "rtr-edge-01", "vendor": "Juniper", "model": "MX204",
     "uStart": 3, "uHeight": 2, "face": "front", "tags": ["edge"],
     "customFields": {"responsible": "NetOps"}, "wattage": 400,
     "assetTag": "AT-002", "serialNumber": "JNPR42", "warrantyEol": "2026-12-01"},
    {"id": "dev-a1-pdu", "tenantId": "tenant-internal", "rackId": "rack-a1",
     "kind": "pdu", "name": "pdu-a", "vendor": "APC", "model": "AP8881",
     "uStart": 41, "uHeight": 2, "face": "rear", "tags": ["power"],
     "customFields": {}, "wattage": 0,
     "assetTag": "AT-PDU", "serialNumber": "", "warrantyEol": ""},
]
MOCK_PORTS = []


def measure(page, sel: str) -> dict:
    box = page.evaluate(
        """(sel) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const doc = document.documentElement;
            return {
              scrollWidth: doc.scrollWidth,
              clientWidth: doc.clientWidth,
              rect: { x: r.x, y: r.y, w: r.width, h: r.height },
              hasHScroll: doc.scrollWidth > doc.clientWidth + 1
            };
        }""",
        sel,
    )
    return box


def shot(page, label: str) -> None:
    out = OUT / f"nul-43-{label}.png"
    page.screenshot(path=str(out), full_page=False)
    print(f"wrote {out}")


def run() -> None:
    cookie = login()
    rack_id = first_rack_id(cookie)
    if not rack_id:
        print("WARN: no racks found; falling back to /racks list")
    print(f"rack: {rack_id}")

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-web-security"])
        try:
            for label, w, h in [
                ("mobile-375", 375, 812),
                ("mobile-390", 390, 844),
                ("tablet-768", 768, 1024),
                ("desktop-1280", 1280, 800),
            ]:
                ctx = browser.new_context(
                    viewport={"width": w, "height": h},
                    device_scale_factor=2,
                )
                ctx.add_cookies([{
                    "name": "ipam_session", "value": cookie, "url": API,
                    "httpOnly": True, "sameSite": "Lax"
                }])
                page = ctx.new_page()

                # Intercept the GET-by-id endpoints that the live server
                # doesn't implement so the rack-detail page can mount with
                # fixture data. Real data path is unaffected.
                def fill_missing(route, request):
                    url = request.url
                    if url.endswith(f"/api/racks/{MOCK_RACK['id']}"):
                        route.fulfill(status=200, content_type="application/json",
                                      body=json.dumps(MOCK_RACK))
                        return
                    if "/api/devices" in url and request.method == "GET":
                        route.fulfill(status=200, content_type="application/json",
                                      body=json.dumps(MOCK_DEVICES))
                        return
                    if "/api/ports" in url and request.method == "GET":
                        route.fulfill(status=200, content_type="application/json",
                                      body=json.dumps(MOCK_PORTS))
                        return
                    route.continue_()

                page.route("**/api/racks/rack-a1", fill_missing)
                page.route("**/api/devices", fill_missing)
                page.route("**/api/ports", fill_missing)

                target = f"{WEB}/racks/{rack_id}" if rack_id else f"{WEB}/racks"
                page.route("**/api/racks/rack-a1", fill_missing)
                page.route("**/api/devices", fill_missing)
                page.route("**/api/ports", fill_missing)
                page.goto(target, wait_until="networkidle", timeout=30_000)
                page.wait_for_timeout(1500)  # hydration + useMediaQuery settle
                m = measure(page, "body")
                print(f"[{label}] scrollWidth={m['scrollWidth']} clientWidth={m['clientWidth']} hasHScroll={m['hasHScroll']}")
                shot(page, f"{label}-initial")

                # On mobile, open the library drawer + capture, then close.
                if w < 768 and rack_id:
                    btn = page.get_by_role("button", name="Open device library")
                    if btn.count() > 0:
                        btn.first.click()
                        page.wait_for_selector('[role="dialog"]', timeout=4000)
                        page.wait_for_timeout(450)
                        shot(page, f"{label}-library-open")
                        # Press Escape to verify close affordance
                        page.keyboard.press("Escape")
                        page.wait_for_timeout(400)
                        shot(page, f"{label}-library-closed")

                    # Open the library drawer again and click a device
                    page.get_by_role("button", name="Open device library").first.click()
                    page.wait_for_selector('[role="dialog"]', timeout=4000)
                    page.wait_for_timeout(400)
                    # Click the Devices tab inside the drawer to see device list
                    page.get_by_role("tab", name="Devices").first.click(timeout=2000)
                    page.wait_for_timeout(300)
                    device_item = page.locator('[role="dialog"] li button').first
                    if device_item.count() > 0:
                        device_item.click(timeout=2000)
                        page.wait_for_timeout(600)
                        shot(page, f"{label}-device-selected")
                        settings_btn = page.get_by_role("button", name="Open device settings")
                        if settings_btn.count() > 0:
                            settings_btn.first.click()
                            page.wait_for_selector('[role="dialog"] >> text=Settings', timeout=4000)
                            page.wait_for_timeout(450)
                            shot(page, f"{label}-settings-sheet")
                            page.keyboard.press("Escape")
                            page.wait_for_timeout(400)
                            shot(page, f"{label}-settings-closed")

                ctx.close()
        finally:
            browser.close()


if __name__ == "__main__":
    run()