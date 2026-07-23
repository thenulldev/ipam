import { useState } from 'react'
import type { FormEventHandler } from 'react'
import { useForm, type UseFormRegister, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, resolveBaseUrl } from '@/lib/api/http-client'
import type { CurrentUser } from './use-current-user'
import { cn } from '@/lib/utils'
import type { LoginSearch } from '@/routes/login'
import {
  LoginHttpError,
  LoginNetworkError,
  submitLogin,
} from './login-submit'

/**
 * Login page.
 *
 * The submit logic lives in `./login-submit.ts` (a pure TS module that
 * doesn't import React or JSX) so it can be exercised under `node --test`.
 * The form fields are rendered by an extracted `<LoginFormFields>` component
 * that takes the React-Hook-Form `register` / `errors` / `isSubmitting`
 * as plain props — that lets the test render the form via
 * `react-dom/server.renderToStaticMarkup` without standing up a router,
 * query client, or RHF context.
 *
 * Backend dependency: NUL-18 already ships `/api/auth/login` and
 * `/api/auth/me`.
 */
const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginInput = z.infer<typeof loginSchema>

export interface LoginFormFieldsProps {
  register: UseFormRegister<LoginInput>
  errors: FieldErrors<LoginInput>
  isSubmitting: boolean
  submitError: string | null
  onSubmit?: FormEventHandler<HTMLFormElement>
}

/**
 * Stateless form fields. Exported separately so the test can render the
 * markup with hand-built `register` stubs.
 */
export function LoginFormFields({
  register,
  errors,
  isSubmitting,
  submitError,
  onSubmit,
}: LoginFormFieldsProps) {
  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email ? true : undefined}
          {...register('email')}
        />
        {errors.email ? (
          <p className="text-xs text-destructive" role="alert">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          {...register('password')}
        />
        {errors.password ? (
          <p className="text-xs text-destructive" role="alert">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      {submitError ? (
        <div
          role="alert"
          className={cn(
            'flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive',
          )}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{submitError}</span>
        </div>
      ) : null}

      <Button
        type="submit"
        className="w-full"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const search = useSearch({ strict: false }) as LoginSearch
  const [submitError, setSubmitError] = useState<string | null>(null)

  // `from` is the path the route guard redirected us from. Only honour it
  // if it's a relative in-app path — anything else is untrusted and we fall
  // back to `/`.
  const postLoginTarget =
    typeof search.from === 'string' && search.from.startsWith('/') && !search.from.startsWith('//')
      ? search.from
      : '/'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: LoginInput) {
    setSubmitError(null)
    try {
      await submitLogin(
        {
          resolveBaseUrl,
          invalidateMe: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
          prefetchMe: () =>
            queryClient.fetchQuery<CurrentUser>({
              queryKey: ['me'],
              queryFn: () => api.get<CurrentUser>('/api/auth/me'),
            }),
          navigateToTarget: (to) => navigate({ to }),
        },
        values,
        postLoginTarget,
      )
    } catch (err) {
      if (err instanceof LoginNetworkError) {
        setSubmitError('Could not reach the server. Check your connection and try again.')
        return
      }
      if (err instanceof LoginHttpError) {
        if (err.status === 401) {
          setSubmitError('Invalid email or password.')
          return
        }
        if (err.status === 429) {
          const seconds = err.retryAfterSeconds
          setSubmitError(
            seconds !== null
              ? `Too many attempts. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`
              : 'Too many attempts. Please try again later.',
          )
          return
        }
      }
      setSubmitError('Sign-in failed. Please try again.')
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-sm flex-col justify-center gap-6 p-4">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">Enter your credentials to continue.</p>
      </div>

      <LoginFormFields
        register={register}
        errors={errors}
        isSubmitting={isSubmitting}
        submitError={submitError}
        onSubmit={handleSubmit(onSubmit)}
      />
    </div>
  )
}
