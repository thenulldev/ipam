import asyncio
from playwright.async_api import async_playwright
import sys

URL = "http://127.0.0.1:5173/ipam"
OUT_DIR = ".paperclip-tmp"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()

        # Mobile portrait 375 px
        ctx_m = await browser.new_context(
            viewport={"width": 375, "height": 812},
            device_scale_factor=2,
        )
        page_m = await ctx_m.new_page()
        await page_m.goto(URL, wait_until="networkidle", timeout=30000)
        await page_m.wait_for_timeout(800)
        await page_m.screenshot(path=f"{OUT_DIR}/mobile-375.png", full_page=True)
        print("mobile-375.png saved")

        # iPad portrait 768 px
        ctx_t = await browser.new_context(
            viewport={"width": 768, "height": 1024},
            device_scale_factor=2,
        )
        page_t = await ctx_t.new_page()
        await page_t.goto(URL, wait_until="networkidle", timeout=30000)
        await page_t.wait_for_timeout(800)
        await page_t.screenshot(path=f"{OUT_DIR}/tablet-768.png", full_page=True)
        print("tablet-768.png saved")

        # Desktop 1280 px
        ctx_d = await browser.new_context(
            viewport={"width": 1280, "height": 800},
        )
        page_d = await ctx_d.new_page()
        await page_d.goto(URL, wait_until="networkidle", timeout=30000)
        await page_d.wait_for_timeout(800)
        await page_d.screenshot(path=f"{OUT_DIR}/desktop-1280.png", full_page=True)
        print("desktop-1280.png saved")

        # Also dump the HTML structure for the mobile page (check Select is rendered)
        body_html = await page_m.content()
        print("---MOBILE HTML SNIPPET---")
        # Look for the SelectTrigger label text
        if "ipam-prefix-select" in body_html:
            print("FOUND ipam-prefix-select")
        else:
            print("MISSING ipam-prefix-select")
        if "Choose a prefix" in body_html:
            print("FOUND Choose a prefix")
        else:
            print("MISSING Choose a prefix")

        await browser.close()

asyncio.run(main())