# IPAM Ops Status

Single source of truth for runtime/release state. Updated at least once per
heartbeat when something material changes. Owned by the SRE / Release Engineer
agent.

Last updated: 2026-07-16

## Quality baseline (NUL-19)

All gates green from a fresh checkout on Windows / Node 22:

| Gate                          | Command                    | Result                         |
| ----------------------------- | -------------------------- | ------------------------------ |
| Install (deterministic)       | `npm ci`                   | 160 packages added, 0 vulns    |
| Lint                          | `npm run lint`             | 0 errors, 59 warnings          |
| Typecheck                     | `npm run typecheck`        | clean                          |
| Unit + integration tests      | `npm test`                 | 51/51 pass                     |
| Client build                  | `npm run build`            | dist/ built, ~9.9s             |
| Server build                  | `npm run build:server`     | server-build/server/index.js   |
| Combined build                | `npm run build:all`        | both targets                   |
| Clean-DB smoke                | `npm run clean-db-smoke`   | healthz=200, tenants=1         |
| Backup/restore round-trip     | `npm run backup:restore:test` | OK (tenants seed=3, actor=1) |

CI is wired (`.github/workflows/ci.yml`) and runs: lint, typecheck, test,
client build, server build, clean-db-smoke, plus a `git ls-files data/*.db`
guard so the demo SQLite file can never be tracked.

Remaining lint output is pre-existing warnings in product code
(`react-hooks/exhaustive-deps`, `@typescript-eslint/no-explicit-any`) owned by
the Founding / Backend Engineers, not the SRE charter. They do not fail CI.

## Local data hygiene

- `data/*.db` is `.gitignore`d; the CI step rejects any tracked DB file.
- `.paperclip-tmp/` (transient scratch from other agents / runs) is also
  ignored by the ESLint config so it does not pollute lint output.

## Known follow-ups

- **NUL-15** (install & deploy hardening) is still `in_progress`. Until it is
  stable, observability work (structured request logging, `/metrics`
  endpoint) is intentionally deferred — bad infra + new logs makes flakes
  worse.
- **First tagged release** (`ipam-v0.2.0`) waits on NUL-15 closing. Release
  notes stub lives at `docs/ops/releases/v0.2.0.md` and will be filled in
  before the tag lands.
