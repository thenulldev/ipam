"""NUL-60 visual acceptance — capture the tour popover + bottom sheet.

Strategy: Start tour via Topbar Help menu, then advance through steps.
Steps 1+2 navigate to `/` (Dashboard) which is broken on the live API
(NUL-11 backend gap: GET /api/racks/:id missing). The tour handles this
gracefully — the popover simply won't render because the anchor page
errors. Steps 3+ hit working routes (/ipam, /racks, ...) so the
popover/sheet becomes visible. We capture:

  - Desktop light + dark: popover anchored to sidebar link
  - Mobile (390px): bottom sheet

This script is a verification harness, not a tour runtime test. The
runtime behavior is covered by tour-ui.test.ts (regex assertions on the
popover code) and use-tour.test.ts (state-machine unit tests).
"""
from __future__ import annotations
import json
import os
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

API = "http://localhost:8787"
# Use the built dist served by `vite preview` when possible — the dev
# server has been observed to throw ERR_INSUFFICIENT_RESOURCES when the
# test script opens multiple contexts back-to-back. Override with
# IPAM_WEB=http://localhost:5173 to force the dev server.
WEB = os.environ.get("IPAM_WEB", "http://localhost:4173")
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


def goto_ipam_clean(page) -> None:
    """Land on /ipam with the tour complete flag set so auto-launch is off."""
    # Navigate once; set the flag in localStorage; reload to apply.
    page.goto(f"{WEB}/ipam", wait_until="networkidle", timeout=30_000)
    page.wait_for_timeout(800)
    page.evaluate("localStorage.setItem('ipam:tour-complete:v1', '1')")
    page.reload(wait_until="networkidle", timeout=30_000)
    page.wait_for_timeout(1200)


def click_help_start_tour(page) -> None:
    """Open Help dropdown and click Start tour."""
    help = page.get_by_role("button", name="Help and shortcuts").first
    help.wait_for(state="visible", timeout=5000)
    help.click()
    page.wait_for_timeout(250)
    page.get_by_role("menuitem", name="Start tour").first.click()
    page.wait_for_timeout(800)


def advance(page) -> bool:
    """Click Next/Got it; return False if no popover to advance."""
    try:
        nxt = page.get_by_role("button", name="Next").or_(
            page.get_by_role("button", name="Got it")
        ).first
        nxt.click(timeout=2000)
        page.wait_for_timeout(800)
        return True
    except Exception:
        return False


def snap_popover(page) -> dict:
    """Inspect the popover/sheet and its anchor."""
    return page.evaluate("""
() => {
  const popover = document.querySelector('[data-radix-popper-content-wrapper]');
  const dialog = document.querySelector('[role="dialog"]');
  const wrapper = popover || dialog;
  if (!wrapper) return { found: false };
  const heading = wrapper.querySelector('h2');
  const buttons = Array.from(wrapper.querySelectorAll('button')).map(b => b.innerText.trim());
  const anchor = document.querySelector('[data-tour][aria-describedby]');
  return {
    found: true,
    title: heading ? heading.innerText.trim() : null,
    buttons,
    ariaLabel: wrapper.getAttribute('aria-label'),
    ariaDescribedBy: wrapper.getAttribute('aria-describedby') || (anchor ? anchor.getAttribute('aria-describedby') : null),
    hasAnchorRing: !!document.querySelector('[data-tour].ring-2'),
    pathname: location.pathname,
    selector: anchor ? anchor.getAttribute('data-tour') : null,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
}
""")


def capture_walk(page, label: str) -> list[dict]:
    """Walk through the 8 steps, capturing whatever renders."""
    out: list[dict] = []
    for i in range(8):
        page.wait_for_timeout(500)
        info = snap_popover(page)
        shot = OUT / f"nul60-{label}-step-{i + 1}.png"
        page.screenshot(path=str(shot), full_page=False)
        info["shot"] = str(shot)
        out.append(info)
        print(f"[{label}] step {i + 1}: found={info.get('found')} title={info.get('title')} path={info.get('pathname')}", flush=True)
        if not advance(page):
            break
    return out


def run() -> None:
    cookie = login()
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-web-security"])

        # Desktop light
        ctx = browser.new_context(viewport={"width": 1280, "height": 800}, color_scheme="light")
        ctx.add_cookies([{"name": "ipam_session", "value": cookie, "url": API, "httpOnly": True, "sameSite": "Lax"}])
        page = ctx.new_page()
        goto_ipam_clean(page)
        click_help_start_tour(page)
        capture_walk(page, "desktop-light")
        ctx.close()

        # Pause between contexts so the vite dev server can settle.
        import time as _time
        _time.sleep(2)

        # Desktop dark
        ctx = browser.new_context(viewport={"width": 1280, "height": 800}, color_scheme="dark")
        ctx.add_cookies([{"name": "ipam_session", "value": cookie, "url": API, "httpOnly": True, "sameSite": "Lax"}])
        page = ctx.new_page()
        goto_ipam_clean(page)
        click_help_start_tour(page)
        capture_walk(page, "desktop-dark")
        ctx.close()

        _time.sleep(2)

        # Mobile (bottom sheet) — the Help button is hidden <sm, so we
        # open the burger drawer and use its data-tour anchors instead.
        # The tour provider's drawer.open() handles this when it auto-runs;
        # for the manual replay we simulate by clicking the burger.
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, color_scheme="light")
        ctx.add_cookies([{"name": "ipam_session", "value": cookie, "url": API, "httpOnly": True, "sameSite": "Lax"}])
        page = ctx.new_page()
        goto_ipam_clean(page)
        # Capture the mobile nav drawer with tour anchors visible.
        burger = page.get_by_role("button", name="Open navigation").first
        burger.wait_for(state="visible", timeout=5000)
        burger.click()
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / "nul60-mobile-drawer-with-anchors.png"), full_page=False)
        # Now actually launch the tour; the provider opens the drawer itself.
        # Need to open Help via a different path — burger → ... no, the
        # easiest is to clear the tour flag and reload to trigger auto-launch.
        page.evaluate("localStorage.removeItem('ipam:tour-complete:v1')")
        page.reload(wait_until="networkidle", timeout=30_000)
        page.wait_for_timeout(2500)
        capture_walk(page, "mobile-light")
        ctx.close()

        browser.close()


if __name__ == "__main__":
    run()
