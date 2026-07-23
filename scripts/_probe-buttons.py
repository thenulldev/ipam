"""Debug helper: list all buttons in the aside."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--disable-web-security"])
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    page = ctx.new_page()
    page.goto("http://localhost:5173/ipam", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(6000)

    btns = page.locator("aside button").all()
    print(f"aside button count: {len(btns)}")
    for b in btns[:30]:
        try:
            txt = (b.text_content() or "")[:80].replace("\n", " | ")
            print("  -", repr(txt))
        except Exception:
            pass
    browser.close()
