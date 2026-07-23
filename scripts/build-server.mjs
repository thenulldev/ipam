import { execFile } from 'node:child_process'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'

const execFileAsync = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'server-build')

// Resolve the local tsc binary directly so we don't depend on `npx.cmd`
// resolving correctly through `execFile` (Node 22 + Windows + cmd shim
// has been observed to swallow tsc's stdout/stderr silently, which made
// prior `npm run build:server` invocations appear successful while
// emitting no files).
const require = createRequire(import.meta.url)
const tscBin = require.resolve('typescript/bin/tsc')
console.log('[build-server] tsc:', tscBin)

await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })

// Drop the server tsbuildinfo so a stale incremental cache from a previous
// (failing or partial) compile cannot short-circuit this run and silently
// emit zero files. tsconfig.server.json points tsBuildInfoFile at
// node_modules/.tmp/tsconfig.server.tsbuildinfo; wipe it before invoking tsc.
const tsbuildinfo = resolve(root, 'node_modules/.tmp/tsconfig.server.tsbuildinfo')
await rm(tsbuildinfo, { force: true })
const { stdout, stderr } = await execFileAsync(process.execPath, [tscBin, '-p', 'tsconfig.server.json'], {
  cwd: root,
  // `inherit` would dump tsc's diagnostic stream straight to the terminal;
  // capture so we can fail loudly if tsc reports anything.
})
process.stdout.write(stdout)
process.stderr.write(stderr)

/**
 * Rewrite relative ESM imports so they resolve at runtime.
 *
 * tsc preserves import specifiers verbatim under `verbatimModuleSyntax`.
 * We need every specifier to:
 *   - carry an explicit `.js` extension (ESM resolution rule under Node)
 *   - point at a real file: a bare directory import like './mock' becomes
 *     './mock/index.js' so the import map in `src/lib/mock/index.ts` keeps
 *     working after `tsc` flattens its output to `server-build/lib/mock/*.js`.
 */
async function resolveImport(spec, fromFile) {
  // Strip a trailing `.js` if tsc already added one.
  const raw = spec.endsWith('.js') ? spec.slice(0, -3) : spec
  const base = resolve(dirname(fromFile), raw)
  // Exact file hit: `<base>.js`.
  try {
    const s = await stat(base + '.js')
    if (s.isFile()) return base + '.js'
  } catch { /* fallthrough */ }
  // Directory hit: `<base>/index.js`.
  try {
    const s = await stat(base)
    if (s.isDirectory()) {
      const idx = base + '/index.js'
      await stat(idx) // throws if missing
      return idx
    }
  } catch { /* fallthrough */ }
  // Nothing matched; return the spec untouched so the runtime error is clear.
  return spec
}

const RELATIVE_FROM_RE = /from '(\.\.?\/[^']+)'/g

function toRelative(fromFile, absTarget) {
  // Use POSIX-style separators so ESM resolution stays portable.
  const rel = relative(dirname(fromFile), absTarget).replace(/\\/g, '/')
  return rel.startsWith('.') ? rel : './' + rel
}

async function rewriteImports(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      await rewriteImports(path)
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue
    const contents = await readFile(path, 'utf8')
    if (!RELATIVE_FROM_RE.test(contents)) continue
    RELATIVE_FROM_RE.lastIndex = 0
    let result = ''
    let lastIdx = 0
    const matches = [...contents.matchAll(RELATIVE_FROM_RE)]
    for (const m of matches) {
      result += contents.slice(lastIdx, m.index)
      const absResolved = await resolveImport(m[1], path)
      const rel = toRelative(path, absResolved)
      result += `from '${rel}'`
      lastIdx = m.index + m[0].length
    }
    result += contents.slice(lastIdx)
    await writeFile(path, result, 'utf8')
  }
}

await rewriteImports(outDir)
