#!/usr/bin/env node
// Test runner wrapper (NUL-50.5 / NUL-56 / NUL-217).
//
// Why this exists: tsx's loader honors `tsconfig.app.json`'s `paths`
// (the `@/*` → `./src/*` alias) only when it knows which tsconfig to
// read. By default it picks up `tsconfig.json` from CWD, but our root
// tsconfig is a solution file with project references — the `paths`
// block lives in `tsconfig.app.json`. Without `TSX_TSCONFIG_PATH`,
// `import { Button } from '@/components/ui/button'` throws
// `ERR_MODULE_NOT_FOUND` under `node --test`.
//
// We re-exec node with that env var set, picking up `.test.ts` and
// `.test.tsx` files. New `.test.tsx` files exercise React components
// using `react-dom/server.renderToStaticMarkup` (no jsdom needed).
//
// Custom argv after `--` is forwarded verbatim so CI / IDEs can append
// patterns like `npm test -- --test-only src/features/auth`. Flags
// starting with `-` are forwarded to node verbatim so this works.
//
// Glob handling (NUL-217): node --test does not understand **. We
// expand `src/**/*.test.ts{x,}` globs ourselves via a recursive
// directory walk so `npm test` (no args) actually runs every test file
// rather than bailing out with `Could not find 'src/**/*.test.ts'`.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

/**
 * Walk `root` recursively and return every regular file whose path
 * matches at least one of the given glob patterns. Patterns are
 * minimal — two stars match any number of path segments, one star
 * matches one segment minus the slashes, `?` matches one character.
 * This is deliberately not a general glob library; it only needs to
 * handle the src-*-test shape that npm test produces.
 */
function expandGlobs(root, patterns) {
  const files = new Set()
  for (const pattern of patterns) {
    const segments = pattern.split('/')
    walk(root, segments, files)
  }
  // Return paths relative to `root`. Keeping them short (rather than
  // absolute) avoids hitting E2BIG in environments where argv has a
  // tight limit and matches the shape node --test expects when run
  // from a non-TTY parent process.
  return [...files].map((p) => path.relative(root, p)).sort()
}

function walk(dir, segments, out) {
  if (segments.length === 0) {
    if (fs.existsSync(dir) && fs.statSync(dir).isFile()) {
      out.add(dir)
    }
    return
  }
  const [head, ...rest] = segments
  if (head === '**') {
    // Zero-or-more directory segments: first resolve the rest of the
    // pattern at this level (no directories consumed), then recurse
    // into every subdirectory consuming one level each.
    walk(dir, rest, out)
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      for (const child of fs.readdirSync(dir)) {
        if (child.startsWith('.')) continue
        walk(path.join(dir, child), segments, out)
      }
    }
    return
  }
  if (head.includes('*') || head.includes('?')) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return
    const matcher = globToRegExp(head)
    for (const child of fs.readdirSync(dir)) {
      if (matcher.test(child)) walk(path.join(dir, child), rest, out)
    }
    return
  }
  walk(path.join(dir, head), rest, out)
}

function globToRegExp(segment) {
  let re = '^'
  for (const ch of segment) {
    if (ch === '*') re += '[^/]*'
    else if (ch === '?') re += '[^/]'
    else if ('\\^$.|+()[]{}'.includes(ch)) re += '\\' + ch
    else re += ch
  }
  re += '$'
  return new RegExp(re)
}

const args = process.argv.slice(2)
// Split args into node flags vs. positional file paths. Everything
// starting with `-` is a node flag (forwarded verbatim); everything
// else is treated as a glob/file pattern we expand.
const flags = []
const positional = []
for (const arg of args) {
  if (arg.startsWith('-')) flags.push(arg)
  else positional.push(arg)
}

let testArgs
if (positional.length > 0) {
  const expanded = expandGlobs(repoRoot, positional)
  if (expanded.length === 0) {
    console.error(`Could not find '${positional.join(' ')}'`)
    process.exit(1)
  }
  testArgs = [...flags, ...expanded]
} else {
  // Default: every `.test.ts` and `.test.tsx` under `src/`. We
  // recursively walk rather than rely on shell globbing because the
  // npm-script context doesn't expand `**`.
  const expanded = [
    ...expandGlobs(repoRoot, ['src/**/*.test.ts']),
    ...expandGlobs(repoRoot, ['src/**/*.test.tsx']),
  ]
  testArgs = [...flags, ...expanded]
}

const spawnArgs = ['--import', 'tsx', '--test', ...testArgs]
const child = spawn(
  process.execPath,
  spawnArgs,
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      TSX_TSCONFIG_PATH: path.join(repoRoot, 'tsconfig.app.json'),
    },
  },
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
  } else {
    process.exit(code ?? 1)
  }
})
