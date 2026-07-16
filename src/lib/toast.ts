// Module-level pub/sub for imperatively firing toasts from anywhere
// (mutations, callbacks, etc.) without prop-drilling context.

export type ToastVariant = 'default' | 'success' | 'destructive'

export interface ToastInput {
  title: string
  description?: string
  variant?: ToastVariant
  /** Override default duration (ms) */
  duration?: number
}

export interface ToastItem extends Required<Omit<ToastInput, 'description'>> {
  id: number
  description?: string
}

let counter = 0
const subscribers = new Set<(t: ToastItem) => void>()

function publish(input: ToastInput) {
  counter += 1
  const item: ToastItem = {
    id: counter,
    title: input.title,
    description: input.description,
    variant: input.variant ?? 'default',
    duration: input.duration ?? 4000,
  }
  for (const sub of subscribers) sub(item)
}

export const toast = {
  show: (input: ToastInput) => publish(input),
  success: (title: string, description?: string) =>
    publish({ title, description, variant: 'success' }),
  error: (title: string, description?: string) =>
    publish({ title, description, variant: 'destructive' }),
  info: (title: string, description?: string) =>
    publish({ title, description, variant: 'default' }),
}

export function subscribeToasts(fn: (t: ToastItem) => void): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}