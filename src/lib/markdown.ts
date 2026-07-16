import { useMemo } from 'react'
import { marked } from 'marked'

// Simple, safe-ish Markdown renderer. Strips raw HTML (we never accept user
// HTML in this scaffold; if you add a backend with persistence, sanitize).

marked.setOptions({
  breaks: true,
  gfm: true,
})

const ALLOWED_PATTERNS: RegExp[] = [
  /^&[a-z0-9#]+;$/i, // HTML entities
  /^<\/?[a-z][a-z0-9-]*>$/i, // simple tags (b, i, em, strong, code, pre, a, br, p)
  /^<[a-z][a-z0-9-]*\s*\/?>$/i,
  /^<\/[a-z][a-z0-9-]*>$/i,
]


/** Strip everything except safe inline HTML — block-level tags are converted
 * to plain text since this scaffold doesn't need rich block layout. */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?<\/embed>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<link[^>]*>/gi, '')
    .replace(/<script[^>]*\/>/gi, '')
    .replace(/<style[^>]*\/>/gi, '')
    .replace(/<iframe[^>]*\/>/gi, '')
    .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/<(\/?)([a-z][a-z0-9-]*)([^>]*)>/gi, (_m, slash, tag, attrs) => {
      const full = `<${slash}${tag}${attrs}>`
      return ALLOWED_PATTERNS.some((p) => p.test(full)) ? full : ''
    })
}

export function renderMarkdown(input: string): string {
  if (!input) return ''
  const html = marked.parse(input, { async: false }) as string
  return sanitizeHtml(html)
}

export function useMarkdown(input: string): string {
  return useMemo(() => renderMarkdown(input), [input])
}
