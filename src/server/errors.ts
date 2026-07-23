import type { Context } from 'hono'

/**
 * Typed API error envelope. Every non-2xx response in `/api/**` returns this
 * shape — never a thrown 500 without an envelope, never a `c.json({message})`.
 *
 *   { error: { code, message, details? } }
 *
 * Codes map to HTTP status:
 *   - 400 → 'validation'
 *   - 401 → 'unauthenticated'
 *   - 403 → 'forbidden'
 *   - 404 → 'not_found'
 *   - 409 → 'conflict'
 *   - 5xx → 'internal'
 */
export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'internal'

export interface ApiError {
  code: ApiErrorCode
  message: string
  details?: unknown
}

export interface ApiErrorBody {
  error: ApiError
}

export function errorResponse(
  c: Context,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): Response {
  const body: ApiErrorBody = {
    error: details === undefined ? { code, message } : { code, message, details },
  }
  return c.json(body, status as 400 | 401 | 403 | 404 | 409 | 500)
}

export const unauthenticated = (c: Context, message = 'Authentication required') =>
  errorResponse(c, 401, 'unauthenticated', message)

export const forbidden = (c: Context, message = 'Insufficient permissions') =>
  errorResponse(c, 403, 'forbidden', message)

export const notFound = (c: Context, message = 'Not found') =>
  errorResponse(c, 404, 'not_found', message)

export const conflict = (c: Context, message: string, details?: unknown) =>
  errorResponse(c, 409, 'conflict', message, details)

export const validationError = (c: Context, details: unknown, message = 'Validation failed') =>
  errorResponse(c, 400, 'validation', message, details)

export const internalError = (c: Context, message = 'Internal server error', details?: unknown) =>
  errorResponse(c, 500, 'internal', message, details)
