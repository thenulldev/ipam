"""Capture dev-server screenshots at the three acceptance widths.

Runs against http://127.0.0.1:5173 (assumes vite is already started).
Saves PNGs to .paperclip-tmp/screenshots/.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5173/"
OUT = Path(__file__).resolve().parents[1] / ".paperclip-tmp" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

VIEWPORTS = [
    ("mobile-375",  375,  812),
    ("tablet-768",  768, 1024),
    ("desktop-1280", 1280, 800),
]


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            for name, w, h in VIEWPORTS:
                ctx = browser.new_context(
                    viewport={"width": w, "height": h},
                    device_scale_factor=2,
                )
                page = ctx.new_page()
                page.goto(URL, wait_until="networkidle", timeout=30_000)
                # Extra settle for hydration + useMediaQuery effect
                page.wait_for_timeout(750)
                out = OUT / f"nul-29-{name}.png"
                page.screenshot(path=str(out), full_page=False)
                print(f"wrote {out} ({w}x{h})")
                ctx.close()
        finally:
            browser.close()


if __name__ == "__main__":
    main()
