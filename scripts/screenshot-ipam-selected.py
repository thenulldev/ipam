"""Capture IPAM-page screenshots with a prefix selected so the address
card list is visible.

Runs against http://localhost:5173/ipam (assumes vite is already started).
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = "http://localhost:5173/ipam"
OUT = Path(__file__).resolve().parents[1] / ".paperclip-tmp" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

VIEWPORTS = [
    ("nul-30-ipam-mobile-375-selected", 375, 812),
    ("nul-30-ipam-desktop-1280-selected", 1280, 800),
]


def main() -> None:
    with sync_playwright() as p:
        # --disable-web-security bypasses the dev CORS gap (NUL-11).
        browser = p.chromium.launch(args=["--disable-web-security"])
        try:
            for name, w, h in VIEWPORTS:
                ctx = browser.new_context(
                    viewport={"width": w, "height": h},
                    device_scale_factor=2,
                )
                page = ctx.new_page()
                page.goto(URL, wait_until="networkidle", timeout=30_000)
                # Settle hydration + media-query + data fetch.
                page.wait_for_timeout(2000)

                if w < 768:
                    # Mobile: open the prefix picker via keyboard and select a
                    # CIDR that has allocated addresses. Radix Select responds to
                    # ArrowDown / Enter. The first option (10.0.0.0/8) is the
                    # reserved super-block and shows the empty-state card, so
                    # arrow down past it to reach a /24 with addresses.
                    trigger = page.locator("#ipam-prefix-select")
                    trigger.focus()
                    page.wait_for_timeout(150)
                    page.keyboard.press("ArrowDown")  # open
                    page.wait_for_timeout(250)
                    page.keyboard.press("ArrowDown")  # move past 10.0.0.0/8
                    page.wait_for_timeout(120)
                    page.keyboard.press("ArrowDown")  # 10.0.0.0/16
                    page.wait_for_timeout(120)
                    page.keyboard.press("ArrowDown")  # 10.0.0.0/24 (mgmt, has addresses)
                    page.wait_for_timeout(120)
                    page.keyboard.press("Enter")  # commit
                    page.wait_for_timeout(800)
                else:
                    # Desktop: click the /24 prefix node in the SubnetTree.
                    # Tree rows are buttons; match by the CIDR text.
                    item = page.get_by_role(
                        "button", include_hidden=False
                    ).filter(has_text="10.0.0.0/24").first
                    item.click()
                    page.wait_for_timeout(800)

                out = OUT / f"{name}.png"
                page.screenshot(path=str(out), full_page=False)
                print(f"wrote {out} ({w}x{h})")
                ctx.close()
        finally:
            browser.close()


if __name__ == "__main__":
    main()
