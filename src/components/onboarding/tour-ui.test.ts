import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import { TOUR_STEPS } from './tour-data'

const root = new URL('../../../', import.meta.url)

async function readSource(relativePath: string) {
  return readFile(new URL(relativePath, root), 'utf8')
}

test('every tour selector has a matching desktop and mobile navigation anchor', async () => {
  const [sidebar, mobileDrawer] = await Promise.all([
    readSource('src/components/layout/sidebar.tsx'),
    readSource('src/components/layout/mobile-nav-drawer.tsx'),
  ])

  assert.match(sidebar, /data-tour=/)
  assert.match(mobileDrawer, /data-tour=/)

  for (const selector of new Set(TOUR_STEPS.map((step) => step.selector))) {
    assert.match(
      sidebar,
      new RegExp(`'[^']+': '${selector}'`),
      `desktop sidebar is missing data-tour="${selector}"`,
    )
  }

  assert.deepEqual(
    new Set(TOUR_STEPS.map((step) => step.selector)),
    new Set([
      'dashboard',
      'ipam',
      'racks',
      'patches',
      'floorplan',
      'topology',
      'help',
    ]),
  )
})

test('tour popover keeps Skip first and exposes the required anchor accessibility hooks', async () => {
  const source = await readSource('src/components/onboarding/tour-popover.tsx')
  const firstSkip = source.indexOf('Skip tour')
  const firstNext = source.indexOf('{step.cta}')

  assert.ok(firstSkip >= 0, 'Skip tour control is present')
  assert.ok(firstNext > firstSkip, 'Skip tour precedes Next in focus order')
  assert.match(source, /aria-label=\{step\.title\}/)
  assert.match(source, /anchor\.setAttribute\('aria-describedby', bodyId\)/)
  assert.match(source, /'ring-2', 'ring-brand-500', 'ring-offset-2'/)
  assert.match(source, /onEscapeKeyDown=/)
})

test('mobile tour is a bottom sheet and focuses Skip before other controls', async () => {
  const source = await readSource('src/components/onboarding/tour-popover.tsx')
  const mobileSource = source.slice(source.indexOf('function TourMobileSheet'))

  assert.match(mobileSource, /inset-x-0 bottom-0 top-auto max-h-\[92dvh\]/)
  assert.match(mobileSource, /onOpenAutoFocus=/)
  assert.match(mobileSource, /skipRef\.current\?\.focus\(\)/)
  assert.match(mobileSource, /useAnchorDescription\(anchor, bodyId\)/)
  assert.doesNotMatch(mobileSource, /DialogClose/)
  assert.doesNotMatch(mobileSource, /autoFocus/)
})

test('the onboarding provider waits for navigation and opens the mobile drawer before anchoring', async () => {
  const source = await readSource('src/components/onboarding/onboarding-provider.tsx')
  const navigateAt = source.indexOf('await router.navigate')
  const routeWaitAt = source.indexOf('await waitForRoute')
  const drawerAt = source.indexOf('drawer?.open()')
  const queryAt = source.indexOf('document.querySelector')

  assert.ok(navigateAt >= 0, 'provider navigates to the next route')
  assert.ok(routeWaitAt > navigateAt, 'provider awaits the route match after navigation')
  assert.ok(drawerAt > routeWaitAt, 'mobile drawer opens after route navigation settles')
  assert.ok(queryAt > drawerAt, 'anchor resolution waits until the drawer is open')
})

test('topbar Help menu contains replay, shortcuts, and About actions', async () => {
  const source = await readSource('src/components/layout/topbar.tsx')

  assert.match(source, />Start tour</)
  assert.match(source, />Keyboard shortcuts</)
  assert.match(source, />About</)
  assert.match(source, /useTour\(\)/)
  assert.match(source, /restart\(\)/)
})
