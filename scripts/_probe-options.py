"""Debug helper: dump what Radix Select options actually look like."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--disable-web-security"])
    ctx = browser.new_context(viewport={"width": 375, "height": 812})
    page = ctx.new_page()
    page.goto("http://localhost:5173/ipam", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2500)
    trigger = page.locator("#ipam-prefix-select")
    trigger.click()
    page.wait_for_timeout(800)

    options = page.locator("[role='option']").all()
    print(f"role=option count: {len(options)}")
    for o in options[:8]:
        try:
            print("  text:", repr(o.text_content()[:60]))
        except Exception:
            pass

    for sel in [
        "[data-radix-collection-item]",
        "div[role='listbox'] > *",
        "span:has-text('10.0.0.0/24')",
        "[data-state]:has-text('10.0.0.0/24')",
    ]:
        loc = page.locator(sel)
        print(f"  sel {sel!r}: count={loc.count()}")

    page.screenshot(path=".paperclip-tmp/screenshots/_probe-open.png", full_page=False)
    browser.close()
