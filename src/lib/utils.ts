import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCidr(cidr: string): { network: string; prefix: number } {
  const [network, prefix] = cidr.split('/')
  return { network: network!, prefix: Number(prefix) }
}

export function shortId(prefix: string, n: number): string {
  return `${prefix}-${n.toString().padStart(4, '0')}`
}
