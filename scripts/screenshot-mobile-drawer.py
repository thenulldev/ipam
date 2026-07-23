"""Confirm that the hamburger on mobile opens the drawer."""
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5173/"
OUT = Path(__file__).resolve().parents[1] / ".paperclip-tmp" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            ctx = browser.new_context(
                viewport={"width": 375, "height": 812},
                device_scale_factor=2,
            )
            page = ctx.new_page()
            page.goto(URL, wait_until="networkidle", timeout=30_000)
            page.wait_for_timeout(500)
            page.get_by_role("button", name="Open navigation").click()
            page.wait_for_selector('[role="dialog"]', timeout=5000)
            page.wait_for_timeout(400)  # allow Radix slide-in animation
            out = OUT / "nul-29-mobile-375-drawer-open.png"
            page.screenshot(path=str(out), full_page=False)
            print(f"wrote {out}")
            ctx.close()
        finally:
            browser.close()


if __name__ == "__main__":
    main()
