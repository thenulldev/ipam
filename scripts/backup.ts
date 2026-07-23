/**
 * Backup the IPAM SQLite database.
 *
 * Copies `data/ipam.db` to `data/backups/<timestamp>.db`. In WAL mode the
 * `-wal` and `-shm` sidecar files are also copied so the backup is a
 * consistent snapshot. Restore is the sibling `restore.ts`.
 *
 * Usage:
 *   tsx scripts/backup.ts                  # writes data/backups/<ts>.db
 *   IPAM_DATA_DIR=/var/lib/ipam tsx scripts/backup.ts
 *
 * Exit code 0 on success, 1 on failure.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import Database from 'better-sqlite3'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')

/**
 * Normalise an IPAM_DATA_DIR value so it survives being set from a POSIX
 * shell on Windows (git-bash / MSYS hands paths like `/c/Users/...`). On a
 * real POSIX host the value is passed through. Native Windows paths
 * (`C:\...` or `C:/...`) are returned as-is for `fs` to consume.
 */
function normaliseDataDir(raw: string): string {
  if (process.platform !== 'win32') return raw
  const m = raw.match(/^\/([a-zA-Z])\/(.*)$/)
  if (m) return `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, '\\')}`
  return raw
}

const DATA_DIR = normaliseDataDir(process.env.IPAM_DATA_DIR ?? join(REPO_ROOT, 'data'))
const DB_PATH = join(DATA_DIR, 'ipam.db')
const BACKUPS_DIR = join(DATA_DIR, 'backups')

function nowStamp(): string {
  // Filesystem-safe timestamp: 2026-07-16T12-34-56Z (no colons).
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function copyWithSidecars(srcBase: string, dstBase: string): string[] {
  const written: string[] = []
  copyFileSync(srcBase, dstBase)
  written.push(dstBase)
  for (const suffix of ['-wal', '-shm']) {
    const sideSrc = srcBase + suffix
    const sideDst = dstBase + suffix
    if (existsSync(sideSrc)) {
      copyFileSync(sideSrc, sideDst)
      written.push(sideDst)
    }
  }
  return written
}

function main(): number {
  if (!existsSync(DB_PATH)) {
    console.error(`backup: source DB not found at ${DB_PATH}`)
    console.error('       Run `npm run dev:server` at least once to create it.')
    return 1
  }

  // Checkpoint WAL so the on-disk `ipam.db` is a self-consistent snapshot.
  // Without this, a freshly-stopped server can still leave uncommitted
  // pages in `-wal`, and a backup that ignores the sidecar files ends up
  // missing rows. `wal_checkpoint(TRUNCATE)` flushes and resets the WAL.
  // Open with `fileMustExist: true` so we never accidentally create an
  // empty backup for a missing source. Better-sqlite3 closes the WAL
  // handle on `.close()` — important on Windows where a still-open
  // handle blocks the copy.
  try {
    const live = new Database(DB_PATH, { fileMustExist: true })
    try {
      live.pragma('wal_checkpoint(TRUNCATE)')
    } finally {
      live.close()
    }
  } catch (err) {
    console.error('backup: wal_checkpoint failed:', err instanceof Error ? err.message : err)
    return 1
  }

  mkdirSync(BACKUPS_DIR, { recursive: true })
  const stamp = nowStamp()
  const dst = join(BACKUPS_DIR, `ipam-${stamp}.db`)

  let written: string[]
  try {
    written = copyWithSidecars(DB_PATH, dst)
  } catch (err) {
    console.error('backup: copy failed:', err instanceof Error ? err.message : err)
    return 1
  }

  const size = statSync(written[0]).size
  console.log(
    JSON.stringify(
      {
        ok: true,
        source: DB_PATH,
        backups: written,
        sizeBytes: size,
        timestamp: stamp,
      },
      null,
      2,
    ),
  )
  return 0
}

process.exit(main())