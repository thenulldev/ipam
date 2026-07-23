export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export interface ApiErrorBody {
  message?: string
  details?: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly details: unknown
  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

export interface ApiFetchOptions {
  baseUrl?: string
  signal?: AbortSignal
  headers?: Record<string, string>
}

function resolveBaseUrl(override?: string): string {
  if (override) return override.replace(/\/+$/, '')
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  const fromEnv = env?.VITE_API_URL
  return (fromEnv ?? 'http://localhost:8787').replace(/\/+$/, '')
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== 'undefined' && value instanceof FormData
}

/**
 * Broadcast a session-expiry signal on `window` so the auth route guard
 * (NUL-50.2 / NUL-53) can react and bounce the user to /login?from=<current>.
 *
 * Wrapped in a `typeof window` guard so importing this module from a Node
 * test harness (no DOM) doesn't crash. Tests that want to assert the
 * dispatch can monkey-patch this export (see api-error-401.test.ts).
 */
export const SESSION_EXPIRED_EVENT = 'ipam:session-expired'

export function dispatchSessionExpired(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
}

function buildQuery(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return path
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    search.append(k, String(v))
  }
  const qs = search.toString()
  if (!qs) return path
  return path.includes('?') ? `${path}&${qs}` : `${path}?${qs}`
}

export async function apiFetch<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  options: ApiFetchOptions = {},
): Promise<T> {
  const baseUrl = resolveBaseUrl(options.baseUrl)
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`

  const headers: Record<string, string> = { ...(options.headers ?? {}) }
  let payload: BodyInit | undefined
  if (body !== undefined && body !== null) {
    if (isFormData(body)) {
      payload = body
    } else {
      headers['Content-Type'] = 'application/json'
      payload = JSON.stringify(body)
    }
  }

  const res = await fetch(url, {
    method,
    headers,
    body: payload,
    signal: options.signal,
    credentials: 'include',
  })

  const text = await res.text()
  let parsed: unknown = undefined
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text) as unknown
    } catch {
      parsed = text
    }
  }

  if (!res.ok) {
    // NUL-50.4 — surface a stale session to the auth guard as soon as any
    // mutation returns 401. The guard (NUL-50.2 / NUL-53) listens for this
    // event and bounces the user to /login?from=<current>.
    //
    // We deliberately only dispatch for `/api/**` routes that are NOT the
    // login endpoint itself — the login page calls `fetch` directly (not
    // `apiFetch`) so the `/api/auth/login` 401 never reaches here, but we
    // also gate it explicitly so a future refactor can't accidentally
    // dispatch `session-expired` for "wrong password" attempts on the login
    // page and trigger a redirect loop.
    if (
      res.status === 401 &&
      path.startsWith('/api/') &&
      !path.startsWith('/api/auth/login')
    ) {
      dispatchSessionExpired()
    }

    const errBody = (parsed ?? {}) as ApiErrorBody
    const message =
      errBody.message ??
      (typeof parsed === 'string' && parsed.length > 0 ? parsed : res.statusText) ??
      `Request failed with status ${res.status}`
    throw new ApiError(res.status, message, errBody.details ?? parsed)
  }

  return parsed as T
}

export const api = {
  get: <T>(path: string, opts?: ApiFetchOptions) => apiFetch<T>('GET', path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: ApiFetchOptions) =>
    apiFetch<T>('POST', path, body, opts),
  patch: <T>(path: string, body?: unknown, opts?: ApiFetchOptions) =>
    apiFetch<T>('PATCH', path, body, opts),
  put: <T>(path: string, body?: unknown, opts?: ApiFetchOptions) =>
    apiFetch<T>('PUT', path, body, opts),
  delete: <T>(path: string, body?: unknown, opts?: ApiFetchOptions) =>
    apiFetch<T>('DELETE', path, body, opts),
}

export { buildQuery, resolveBaseUrl, isFormData }
