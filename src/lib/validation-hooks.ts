import { useMemo } from 'react'
import { useTenantScope } from './tenant-scope'
import { usePrefixes, useAddresses } from './queries'
import { validateAll } from './validators'

/**
 * Runs all static validators against tenant-scoped data. Returns a memoised
 * list of issues.
 */
export function useValidation() {
  const scope = useTenantScope()
  const allPrefixes = usePrefixes().data ?? []
  const allAddresses = useAddresses().data ?? []

  return useMemo(
    () =>
      validateAll({
        racks: scope.racks,
        devices: scope.devices,
        cables: scope.cables,
        prefixes: allPrefixes,
        addresses: allAddresses,
      }),
    [scope.racks, scope.devices, scope.cables, allPrefixes, allAddresses],
  )
}