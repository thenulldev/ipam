import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { LoginPage } from '@/features/auth/login-page'

/**
 * /login route (NUL-50.2 / NUL-53).
 *
 * Registered with a `validateSearch` schema so the `from` parameter is
 * strictly typed and round-trips through the router cleanly. Anything that
 * doesn't match the schema is stripped — that's intentional, since this
 * route only needs `from`.
 */
const loginSearchSchema = z.object({
  from: z.string().optional(),
})

export type LoginSearch = z.infer<typeof loginSearchSchema>

export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  component: LoginPage,
})
