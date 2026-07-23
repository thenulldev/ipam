from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(args=["--disable-web-security"])
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    page = ctx.new_page()
    page.on("console", lambda m: print("CON", m.type, m.text[:200]))
    page.on("pageerror", lambda e: print("ERR", str(e)[:200]))
    page.on("response", lambda r: print("RES", r.status, r.url[:120]) if "/api/" in r.url else None)
    page.goto("http://localhost:5173/ipam", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(5000)
    html = page.evaluate("() => document.querySelector('aside')?.outerHTML?.slice(0,800) || 'no aside'")
    print("ASIDE_HTML:", html[:600])
    browser.close()
