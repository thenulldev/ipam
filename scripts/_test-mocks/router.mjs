// Test stub for @tanstack/react-router. Records navigate() calls and
// serves a configurable useLocation() from globalThis.

const locationState = { pathname: '/', searchStr: '', search: {} }

export function useNavigate() {
  return (opts) => {
    ;(globalThis.__routeGuardNavCalls ??= []).push(opts)
    return Promise.resolve()
  }
}

export function useLocation() {
  return locationState
}

export function Link() {
  return null
}

export function Outlet() {
  return null
}

export function __setLocation({ pathname, searchStr = '', search = {} } = {}) {
  locationState.pathname = pathname
  locationState.searchStr = searchStr
  locationState.search = search
}