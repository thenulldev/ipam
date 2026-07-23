"""Debug: navigate to /ipam and dump console + network errors."""
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5173/ipam"

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 375, "height": 812})
    page = ctx.new_page()
    page.on("console", lambda msg: print(f"[{msg.type}] {msg.text}"))
    page.on("pageerror", lambda exc: print(f"[pageerror] {exc}"))
    page.on("requestfailed", lambda req: print(f"[reqfail] {req.url} -> {req.failure}"))
    page.on("response", lambda res: print(f"[resp] {res.status} {res.url}") if "/api/" in res.url else None)
    page.goto(URL, wait_until="networkidle", timeout=30_000)
    page.wait_for_timeout(3000)
    print("=== HTML SNIPPET ===")
    print(page.content()[:2000])
    browser.close()
