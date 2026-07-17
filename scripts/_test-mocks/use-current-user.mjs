// Test stub for ./use-current-user. Reads its return shape from
// globalThis.__routeGuardMeState on every call so tests can drive
// different login states.

const DEFAULT = {
  data: null,
  isLoading: false,
  isSuccess: false,
  isError: false,
  error: null,
  status: 'idle',
}

export function useCurrentUser() {
  const state = globalThis.__routeGuardMeState ?? DEFAULT
  return {
    data: state.data ?? null,
    isLoading: state.isLoading ?? false,
    isSuccess: state.isSuccess ?? false,
    isError: state.isError ?? false,
    error: state.error ?? null,
    status: state.status ?? 'idle',
  }
}