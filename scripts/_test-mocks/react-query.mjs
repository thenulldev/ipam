// Test stub for @tanstack/react-query.
//
// Records calls to `useQueryClient().removeQueries` / `invalidateQueries`
// onto `globalThis.__routeGuardQueryClientCalls` so the session-expired
// listener tests in `route-guard.test.tsx` can assert the cache is wiped
// before navigation fires.
//
// The default `useQueryClient()` returns a fresh object on every call
// (mirroring the real client). For tests that need to inspect a single
// instance across renders, set `globalThis.__routeGuardQueryClient` to
// a hand-built object — `useQueryClient` will return that instead.

function makeClient() {
  return {
    removeQueries(opts) {
      ;(globalThis.__routeGuardQueryClientCalls ??= []).push({
        method: 'remove',
        key: [...(opts?.queryKey ?? [])],
      })
    },
    invalidateQueries(opts) {
      ;(globalThis.__routeGuardQueryClientCalls ??= []).push({
        method: 'invalidate',
        key: [...(opts?.queryKey ?? [])],
      })
    },
  }
}

export function useQueryClient() {
  if (globalThis.__routeGuardQueryClient) {
    return globalThis.__routeGuardQueryClient
  }
  return makeClient()
}
