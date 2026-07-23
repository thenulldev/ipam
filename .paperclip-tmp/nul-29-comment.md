NUL-29 verification — Layer 1 done.

Files (already on disk, uncommitted per repo convention):
- src/components/layout/app-shell.tsx — branches on useMediaQuery('(min-width: 768px)'); desktop → <Sidebar>, mobile → <MobileNavDrawer> triggered by Topbar hamburger.
- src/components/layout/topbar.tsx — hamburger (md:hidden) opens nav drawer; search collapses to icon button below md; tenant switcher keeps badge + chevron, hides Building2 label below md; user chip collapses to Avatar only below sm.
- src/components/layout/mobile-nav-drawer.tsx (NEW) — Radix Dialog, left-anchored slide-over, reuses navItems from sidebar.tsx (no fork). Scrim click + Esc close verified via Playwright.
- src/hooks/use-media-query.ts (NEW) — SSR-safe matchMedia hook (defaults false on server).
- src/hooks/use-media-query.test.ts (NEW) — node:test suite covering SSR + initial-match paths.
- index.html — viewport meta now sets width=device-width, initial-scale=1, viewport-fit=cover.
- Safe areas: env(safe-area-inset-*) applied to topbar padding and drawer overlay/content.

Gates:
- npm run typecheck — green for NUL-29 scope. 20 pre-existing errors remain in src/lib/api/_mock/physical.ts (unrelated mock-adapter work, blocked on a separate PR).
- npm run lint — 0 NUL-29 errors. Pre-existing lint debt in csv.ts / queries.ts / tenant-scope.ts / server untouched.
- npm run build — clean (tsc -b + vite build), 2059 modules, ~10.8s.

Screenshots (.paperclip-tmp/screenshots/, captured against dev server @ localhost:5173):
- nul-29-mobile-375.png — hamburger left, drawer closed, tenant badge only, search icon, Avatar only.
- nul-29-mobile-375-drawer-open.png — drawer open over dimmed scrim.
- nul-29-tablet-768.png — desktop sidebar layout (md breakpoint active).
- nul-29-desktop-1280.png — full topbar with Building2 label + search + kb shortcuts.

Acceptance: sidebar reachable at 375 (drawer) and 768 (persistent); screenshots captured at 375 / 768 / 1280; typecheck + lint + build green.
