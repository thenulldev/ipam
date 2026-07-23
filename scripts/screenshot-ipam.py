"""Capture IPAM-page screenshots at the three acceptance widths.

Runs against http://localhost:5173/ipam (assumes vite is already started).
Uses 'localhost' as the host so CORS allows requests to the hono server
which is also served from 'localhost'.

Saves PNGs to .paperclip-tmp/screenshots/.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = "http://localhost:5173/ipam"
OUT = Path(__file__).resolve().parents[1] / ".paperclip-tmp" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

VIEWPORTS = [
    ("nul-30-ipam-mobile-375", 375, 812),
    ("nul-30-ipam-tablet-768", 768, 1024),
    ("nul-30-ipam-desktop-1280", 1280, 800),
]


def main() -> None:
    with sync_playwright() as p:
        # --disable-web-security lets the screenshot tool bypass the
        # pre-existing dev-server CORS gap (NUL-11). The real app deploys
        # behind a same-origin reverse proxy so CORS is not an issue.
        browser = p.chromium.launch(args=["--disable-web-security"])
        try:
            for name, w, h in VIEWPORTS:
                ctx = browser.new_context(
                    viewport={"width": w, "height": h},
                    device_scale_factor=2,
                )
                page = ctx.new_page()
                page.goto(URL, wait_until="networkidle", timeout=30_000)
                # Settle hydration + media-query effect + data fetch
                page.wait_for_timeout(2000)
                out = OUT / f"{name}.png"
                page.screenshot(path=str(out), full_page=False)
                print(f"wrote {out} ({w}x{h})")
                ctx.close()
        finally:
            browser.close()


if __name__ == "__main__":
    main()
