// Test stub for @/lib/api/http-client.
//
// Re-exports the SESSION_EXPIRED_EVENT constant and provides a spy
// `dispatchSessionExpired` that records calls onto
// `globalThis.__sessionExpiredCalls` so the listener test can either:
//
//   - call dispatchSessionExpired() directly and assert side effects, OR
//   - dispatch the `ipam:session-expired` CustomEvent on the global
//     `window` stub to exercise the listener exactly the way
//     `http-client.ts` would in production.
//
// The real `apiFetch` / `api` / `ApiError` are not exported from this stub;
// the route-guard component under test only imports SESSION_EXPIRED_EVENT.

export const SESSION_EXPIRED_EVENT = 'ipam:session-expired'

export function dispatchSessionExpired() {
  ;(globalThis.__sessionExpiredCalls ??= []).push(true)
  if (typeof window !== 'undefined' && window) {
    window.dispatchEvent(new (globalThis.CustomEvent ?? Event)(SESSION_EXPIRED_EVENT))
  }
}
