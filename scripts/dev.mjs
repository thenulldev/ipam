#!/usr/bin/env node
/**
 * One-command local dev orchestration.
 *
 * Starts the Hono API (tsx watch on src/server/**) and the Vite web dev
 * server (HMR on src/**) together so a single `npm run dev` brings the
 * whole stack up.
 *
 * - The Vite dev server is the public entry point (http://localhost:5173).
 *   Per VITE_API_URL (default http://localhost:8787) the browser talks
 *   straight to the Hono API on a different origin — there is no Vite
 *   proxy in this project, by design (see src/lib/api/http-client.ts).
 * - Either side crashing restarts automatically (with short backoff)
 *   rather than silently looping or taking the whole stack down. The
 *   orchestrator's own PID is recorded in scripts/.dev.pid so a future
 *   heartbeat (or `npm run dev:stop`) can clean up old processes before
 *   starting a fresh one.
 * - Ctrl-C cleanly forwards SIGINT and SIGTERM to both children,
 *   unlinks the PID file, and exits 0.
 *
 * Two non-obvious details:
 *   * We invoke node directly (no `npm run …`) so each child is a plain
 *     Node process — npm's "stdin is not a tty" warning on PTY-less
 *     shells was observed to destabilise this orchestrator.
 *   * We use inherited stdio (not `'pipe'`); Node's PIPE pipes under
 *     detached backgrounding on Windows were observed to buffer child
 *     output silently. Inheritance writes straight through to the
 *     parent's TTY/file. Each child's first-line `[api]`/`[web]` banner
 *     makes the streams easy to tell apart in the scrollback.
 *
 * Usage:
 *   node scripts/dev.mjs            # default: web on 5173 + api on 8787
 *   npm run dev                    # same thing, via npm script
 *   npm run dev:up                 # alias of `npm run dev`
 *   npm run dev:status             # print PID + up/down from PID file
 *   npm run dev:stop               # kill orchestrator via PID file
 */
import { spawn } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = dirname(here) // repo root
const tsx = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js')

const PORT = process.env.PORT ?? '8787'
const PID_FILE = join(here, '.dev.pid')

// `--status` and `--stop` are read-only / signal-only subcommands.
// They MUST short-circuit before any orchestrator setup, or they would
// overwrite scripts/.dev.pid with the helper process's own PID (a real
// bug observed on Windows). Keep these checks at the very top.
if (process.argv.includes('--status')) {
  const pid = readPidSafe()
  process.stdout.write(
    pid ? `dev-orchestrator: pid=${pid} (running)\n` : `dev-orchestrator: not running\n`,
  )
  process.exit(pid ? 0 : 1)
}
if (process.argv.includes('--stop')) {
  const pid = readPidSafe()
  if (!pid) {
    process.stdout.write(`dev-orchestrator: not running\n`)
    process.exit(0)
  }
  try {
    process.kill(pid, 'SIGTERM')
    process.stdout.write(`dev-orchestrator: sent SIGTERM to pid=${pid}\n`)
  } catch (err) {
    process.stdout.write(
      `dev-orchestrator: pid=${pid} not killable (${err.message}); clearing stale PID file\n`,
    )
    clearPidFile()
  }
  // Give the orchestrator a moment to clean up, then verify.
  setTimeout(() => {
    const stillThere = readPidSafe()
    if (stillThere === pid) clearPidFile()
    process.exit(0)
  }, 1500).unref()
}

function readPidSafe() {
  try {
    if (!existsSync(PID_FILE)) return null
    const raw = readFileSync(PID_FILE, 'utf8').trim()
    const pid = Number.parseInt(raw, 10)
    return Number.isFinite(pid) ? pid : null
  } catch {
    return null
  }
}

// Crash-restart policy. We want any single child crash to come back up
// well within 60s of going down (per NUL-47 acceptance criteria), but
// we don't want a tight crash-loop to pin the CPU. Total wall-clock
// budget before we give up: ~3s + 6s + 12s = 21s across 3 retries.
// Successful uptime resets the counter.
const RESTART_BACKOFF_MS = [3000, 6000, 12000]
const RESTART_MAX_ATTEMPTS = RESTART_BACKOFF_MS.length

function writePidFile() {
  writeFileSync(PID_FILE, String(process.pid), 'utf8')
}

function clearPidFile() {
  try {
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE)
  } catch {
    // Best-effort — the file may already be gone if multiple processes
    // raced on it; not a fatal condition.
  }
}

function status(msg) {
  process.stdout.write(`[orchestrator] ${msg}\n`)
}

const children = []
let exiting = false
let suppressRestartFor = new Set() // child names whose shutdown was requested

function startChild(name, command, args) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, FORCE_COLOR: '1' },
  })
  process.stdout.write(`[${name}] starting: ${command} ${args.join(' ')}\n`)
  const entry = {
    name,
    command,
    args,
    child,
    restartAttempts: 0,
    restarting: false,
  }
  children.push(entry)

  child.on('exit', (code, signal) => {
    process.stdout.write(
      `[${name}] exited (code=${code ?? 'null'} signal=${signal ?? 'none'})\n`,
    )
    if (exiting || suppressRestartFor.has(name)) {
      return
    }
    scheduleRestart(entry)
  })

  return entry
}

function scheduleRestart(entry) {
  if (entry.restarting || exiting) return
  if (entry.restartAttempts >= RESTART_MAX_ATTEMPTS) {
    status(
      `${entry.name} crashed ${entry.restartAttempts} times — giving up. ` +
        `Manual restart required.`,
    )
    shutdown('SIGTERM', 1)
    return
  }
  entry.restarting = true
  const delay = RESTART_BACKOFF_MS[entry.restartAttempts] ?? 12000
  entry.restartAttempts += 1
  status(
    `${entry.name} down — restarting in ${delay / 1000}s ` +
      `(attempt ${entry.restartAttempts}/${RESTART_MAX_ATTEMPTS})`,
  )
  setTimeout(() => {
    if (exiting) return
    status(`${entry.name} restarting now`)
    entry.restarting = false
    // Replace the dead child in place. Re-bind events so subsequent
    // crashes use the new process handle.
    const old = entry.child
    entry.child = spawn(entry.command, entry.args, {
      cwd: root,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, FORCE_COLOR: '1' },
    })
    entry.child.on('exit', (code, signal) => {
      process.stdout.write(
        `[${entry.name}] exited (code=${code ?? 'null'} signal=${signal ?? 'none'})\n`,
      )
      if (exiting || suppressRestartFor.has(entry.name)) return
      scheduleRestart(entry)
    })
    // Successful uptime resets the attempt counter.
    const resetTimer = setTimeout(() => {
      entry.restartAttempts = 0
    }, 30_000)
    resetTimer.unref?.()
    void old
  }, delay).unref?.()
}

function killStaleOrchestrator() {
  const existing = readPidSafe()
  if (!existing) return
  if (existing === process.pid) return
  try {
    process.kill(existing, 0) // signal 0 = test only
  } catch {
    // Stale PID file — process is gone. Clean up so we don't get
    // confused next time.
    clearPidFile()
    return
  }
  status(`killing stale orchestrator (pid=${existing}) before starting fresh`)
  try {
    process.kill(existing, 'SIGTERM')
  } catch {
    // ignore
  }
  // Wait briefly for the old orchestrator to release the ports.
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    try {
      process.kill(existing, 0)
    } catch {
      break
    }
    // Sync wait — only 3s max.
    const until = Date.now() + 250
    while (Date.now() < until) { /* spin briefly */ }
  }
  clearPidFile()
}

// Kill any stale orchestrator BEFORE spawning children — otherwise the
// old api/web still own :8787/:5173 and the new ones would collide.
killStaleOrchestrator()

startChild('api', 'node', [tsx, 'watch', 'src/server/index.ts', '--port', String(PORT)])
startChild('web', 'node', [vite])

writePidFile()
status(
  `up (pid=${process.pid}) — api on :${PORT}, web on :5173, ` +
    `pid file at scripts/.dev.pid`,
)

function shutdown(signal, code = 0) {
  if (exiting) return
  exiting = true
  status(`received ${signal}, killing children`)
  for (const entry of children) {
    suppressRestartFor.add(entry.name)
    try {
      entry.child.kill(signal)
    } catch {
      // Already-exited or unkillable child — nothing more we can do.
    }
  }
  // Force exit if children don't shut down within 5s.
  setTimeout(() => {
    clearPidFile()
    process.exit(code)
  }, 5000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT', 0))
process.on('SIGTERM', () => shutdown('SIGTERM', 0))
process.on('uncaughtException', (err) => {
  status(`uncaughtException: ${err?.stack ?? err}`)
  shutdown('SIGTERM', 1)
})
process.on('unhandledRejection', (reason) => {
  status(`unhandledRejection: ${reason?.stack ?? reason}`)
  shutdown('SIGTERM', 1)
})

// Children should drive our lifetime. Re-emit their combined exit code
// ONLY if we are not in crash-restart mode — otherwise an orderly
// restart of a child must not bring the orchestrator down with it.
// We track liveness via a heartbeat: when no child is alive and we are
// not exiting/restarting, give up.
const heartbeat = setInterval(() => {
  if (exiting) return
  const alive = children.filter(
    (c) => c.child.exitCode === null && !c.restarting,
  )
  if (alive.length === 0 && children.every((c) => c.restartAttempts > 0)) {
    status('all children permanently down — exiting')
    shutdown('SIGTERM', 1)
  }
}, 15_000)
heartbeat.unref?.()

// Export the helpers so `npm run dev:status` / `dev:stop` (small wrapper
// scripts) can read state without duplicating the PID-file logic.
// (The --status / --stop short-circuits at the top of the file handle
// those — anything reaching here is the real orchestrator.)