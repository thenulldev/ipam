// Test loader for route-guard.test.tsx.
//
// Routes three imports to in-memory stubs so the test can mount <AuthGuard>
// under `node --test` without a TanStack Router or a QueryClient:
//
//   @tanstack/react-router  → ./scripts/_test-mocks/router.mjs
//   ./use-current-user      → ./scripts/_test-mocks/use-current-user.mjs
//   @/components/ui/skeleton→ ./scripts/_test-mocks/skeleton.mjs
//
// The router stub records navigate() calls in a globalThis-scoped array
// the test can read. The useCurrentUser stub reads its return shape from
// globalThis.__routeGuardMeState so each test can mutate it.
//
// Activated via:
//   node --import tsx --import ./scripts/_route-guard-shim.mjs --test ...

const MOCKS = {
  router: new URL('./_test-mocks/router.mjs', import.meta.url).href,
  useCurrentUser: new URL('./_test-mocks/use-current-user.mjs', import.meta.url).href,
  skeleton: new URL('./_test-mocks/skeleton.mjs', import.meta.url).href,
}

function matchesAny(specifier, candidates) {
  return candidates.some((c) => specifier === c || specifier.endsWith(c))
}

export async function resolve(specifier, context, nextResolve) {
  if (matchesAny(specifier, ['/@tanstack/react-router', '@tanstack/react-router'])) {
    return { url: MOCKS.router, shortCircuit: true, format: 'module' }
  }
  if (
    matchesAny(specifier, [
      './use-current-user',
      '@/features/auth/use-current-user',
      '../features/auth/use-current-user',
      '/features/auth/use-current-user',
    ])
  ) {
    return { url: MOCKS.useCurrentUser, shortCircuit: true, format: 'module' }
  }
  if (
    matchesAny(specifier, [
      '@/components/ui/skeleton',
      '../components/ui/skeleton',
      './components/ui/skeleton',
      '/components/ui/skeleton',
    ])
  ) {
    return { url: MOCKS.skeleton, shortCircuit: true, format: 'module' }
  }
  return nextResolve(specifier, context)
}