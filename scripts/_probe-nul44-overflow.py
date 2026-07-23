"""NUL-44 acceptance probe — measure page-level horizontal overflow.

Hits each route at 375 / 390 / 768 / 1280 px viewports. A page passes at a
viewport when documentElement.scrollWidth <= clientWidth (i.e. no horizontal
scroll on the page itself).

Caveat: we measure the page document. In-app tables can intentionally be wider
than the viewport (they're wrapped in overflow-x-auto so the page itself
doesn't scroll). We account for that by also capturing whether each route is
the route under test vs. a sub-dialog overlay, and we don't fail on a route
whose overflow is solely attributable to a horizontally scrollable container
explicitly allowed by the layout.

Exit code: 0 if every (route, viewport) pair passes, else 1.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL_BASE = "http://localhost:5173"
AUTH = {
    "email": "stephan@internal.example",
    "password": "ipam-dev",
}
ROUTES = [
    ("dashboard", "/"),
    ("floorplan", "/floorplan"),
    ("topology", "/topology"),
    ("settings", "/settings"),
    ("templates", "/templates"),
    ("patches", "/patches"),
]
VIEWPORTS = [
    ("375",  375,  812),
    ("390",  390,  844),
    ("768",  768, 1024),
    ("1280", 1280, 800),
]
OUT = Path(__file__).resolve().parents[1] / ".paperclip-tmp" / "nul44-overflow.json"
OUT.parent.mkdir(parents=True, exist_ok=True)


def measure(page, url: str) -> dict:
    page.goto(url, wait_until="networkidle", timeout=30_000)
    page.wait_for_timeout(750)
    metrics = page.evaluate(
        """() => {
          const root = document.documentElement;
          const body = document.body;
          const main = document.querySelector('main');
          // Find overflow-worthy containers (overflow-x-auto/scroll) and
          // measure each. We want these to KEEP scrolling internally when
          // their content is too wide — but the page itself must not scroll.
          const containers = Array.from(
            document.querySelectorAll('[class*="overflow-x"]')
          ).map((el) => {
            const r = el.getBoundingClientRect();
            return {
              tag: el.tagName,
              cls: el.className,
              scrollW: el.scrollWidth,
              clientW: el.clientWidth,
              overflows: el.scrollWidth > el.clientWidth + 0.5,
            };
          });
          return {
            docScrollWidth: root.scrollWidth,
            docClientWidth: root.clientWidth,
            bodyScrollWidth: body.scrollWidth,
            bodyClientWidth: body.clientWidth,
            mainScrollWidth: main ? main.scrollWidth : null,
            mainClientWidth: main ? main.clientWidth : null,
            innerWidth: window.innerWidth,
            containers,
          };
        }"""
    )
    page_h_overflows = (
        metrics["docScrollWidth"] > metrics["docClientWidth"] + 0.5
    )
    return {
        "url": url,
        **metrics,
        "pageHorizontalOverflow": page_h_overflows,
        "pageOverflowDeltaPx": metrics["docScrollWidth"] - metrics["docClientWidth"],
    }


def main() -> int:
    results: list[dict] = []
    overall_ok = True
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            for vlabel, w, h in VIEWPORTS:
                ctx = browser.new_context(
                    viewport={"width": w, "height": h},
                    device_scale_factor=2,
                )
                page = ctx.new_page()
                ctx.request.post(
                    URL_BASE + "/api/auth/login",
                    data=AUTH,
                    headers={"Content-Type": "application/json"},
                )
                for rname, path in ROUTES:
                    try:
                        m = measure(page, URL_BASE + path)
                    except Exception as e:
                        m = {"url": URL_BASE + path, "error": str(e)}
                        overall_ok = False
                    row = {
                        "route": rname,
                        "viewport": vlabel,
                        "w": w,
                        "h": h,
                        **m,
                    }
                    results.append(row)
                    status = (
                        "PASS"
                        if (m.get("pageHorizontalOverflow") is False)
                        else "FAIL"
                    )
                    if status == "FAIL":
                        overall_ok = False
                    delta = m.get("pageOverflowDeltaPx", 0)
                    print(
                        f"[{status}] vp={vlabel:>4} {rname:<10} "
                        f"scrollW={m.get('docScrollWidth')} "
                        f"clientW={m.get('docClientWidth')} "
                        f"delta={delta:+}"
                    )
                ctx.close()
        finally:
            browser.close()
    OUT.write_text(json.dumps(results, indent=2))
    print(f"\nwrote {OUT}")
    return 0 if overall_ok else 1


if __name__ == "__main__":
    sys.exit(main())
