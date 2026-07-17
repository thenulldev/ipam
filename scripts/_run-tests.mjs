#!/usr/bin/env node
// Test runner wrapper (NUL-50.5 / NUL-56).
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
// patterns like `npm test -- --test-only src/features/auth`.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

const args = process.argv.slice(2)
// Default glob covers the whole tree; trailing user args after `--`
// are forwarded (e.g. `--test-only path/to/file`).
const testArgs = args.length > 0 ? args : [
  '--test',
  'src/**/*.test.ts',
  'src/**/*.test.tsx',
]

const child = spawn(
  process.execPath,
  ['--import', 'tsx', ...testArgs],
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