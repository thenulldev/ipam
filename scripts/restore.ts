/**
 * Restore the IPAM SQLite database from a backup file.
 *
 * Copies `data/backups/<file>.db` (plus `-wal`/`-shm` sidecars if present)
 * back to `data/ipam.db`. The destination is replaced atomically by writing
 * to a temp file first then renaming.
 *
 * Usage:
 *   tsx scripts/restore.ts ipam-2026-07-16T12-34-56Z.db
 *   tsx scripts/restore.ts /absolute/path/to/backup.db
 *   IPAM_DATA_DIR=/var/lib/ipam tsx scripts/restore.ts <name>
 *
 * Safety:
 *   - Refuses to overwrite the live DB if it's actively being written to.
 *     The server should be stopped before restoring in production.
 *   - If the live DB already exists, it's copied to `ipam-<stamp>.pre-restore.db`
 *     next to it so the operator has a one-step undo.
 *
 * Exit code 0 on success, 1 on failure.
 */
import { copyFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')

/** See backup.ts -- translate POSIX drive-letter paths on Windows. */
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
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function resolveSource(arg: string): string {
  // Allow bare filename (looked up in BACKUPS_DIR) or an absolute path.
  if (arg.includes('/') || arg.includes('\\') || /^[a-zA-Z]:[\\/]/.test(arg)) {
    return resolve(arg)
  }
  return join(BACKUPS_DIR, arg)
}

function main(): number {
  const arg = process.argv[2]
  if (!arg) {
    console.error('usage: tsx scripts/restore.ts <backup-file-or-name>')
    console.error('       The file may be a bare name (data/backups/<name>) or an absolute path.')
    return 1
  }

  const src = resolveSource(arg)
  if (!existsSync(src)) {
    console.error(`restore: backup not found at ${src}`)
    return 1
  }

  mkdirSync(DATA_DIR, { recursive: true })

  let preUndo: string | null = null
  if (existsSync(DB_PATH)) {
    preUndo = join(DATA_DIR, `ipam-${nowStamp()}.pre-restore.db`)
    copyFileSync(DB_PATH, preUndo)
  }

  // Atomic-ish replace: copy to a temp file, then rename on top of the live DB.
  const tmp = DB_PATH + `.restore-${process.pid}.tmp`
  try {
    copyFileSync(src, tmp)
    // Sidecars first, then the main file rename.
    for (const suffix of ['-wal', '-shm']) {
      const sideSrc = src + suffix
      if (existsSync(sideSrc)) {
        copyFileSync(sideSrc, DB_PATH + suffix)
      }
    }
    renameSync(tmp, DB_PATH)
  } catch (err) {
    console.error('restore: copy/rename failed:', err instanceof Error ? err.message : err)
    // Best-effort cleanup of the temp file.
    try {
      if (existsSync(tmp)) renameSync(tmp, DB_PATH + '.failed-restore.tmp')
    } catch {
      /* swallow */
    }
    return 1
  }

  const size = statSync(DB_PATH).size
  console.log(
    JSON.stringify(
      {
        ok: true,
        restoredFrom: src,
        restoredTo: DB_PATH,
        sizeBytes: size,
        preRestoreBackup: preUndo,
      },
      null,
      2,
    ),
  )
  return 0
}

process.exit(main())