// Test stub for @/components/ui/skeleton. Returns a JSX element with
// data-testid="skeleton" so assertions can target it.

import { createElement } from 'react'

export function Skeleton({ className = '' } = {}) {
  return createElement(
    'div',
    { 'data-testid': 'skeleton', className },
  )
}