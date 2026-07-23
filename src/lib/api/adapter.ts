import { BACKEND_READY } from './backend-ready'

/**
 * Choose a live or mock implementation without changing its public contract.
 * Requiring both arguments to share one type makes signature drift a compile
 * error instead of a runtime surprise for callers.
 */
export function pick<T>(liveImpl: T, mockImpl: T): T {
  return BACKEND_READY ? liveImpl : mockImpl
}

export const isLive = (): boolean => BACKEND_READY
