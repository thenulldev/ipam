# Release readiness checklist

Run this list on a clean checkout before pushing a `vX.Y.Z` tag. Every step
must succeed without code edits — if any step fails, the release is not
ready and the documentation or scripts are out of sync.

> **Why this exists.** NUL-21 audits the executable against the docs.
> Each item points at a command the user can copy-paste, so a "yes"
> answer means the docs already cover it.

## 1. Install + first-run

```bash
git clone <repo-url> ipam && cd ipam
npm install            # exits 0, no peer-dep errors we ignore
node -p "require('./node_modules/react/package.json').version"   # 18.3.1
node -p "require('./node_modules/vite/package.json').version"    # 6.x
```

- [ ] `npm install` exits 0 on Node 22 with a clean `node_modules`.
- [ ] `package.json` versions match the values documented in
      [README.md](../README.md#tech-stack). React 18.3.x, Vite 6.x.
- [ ] `package-lock.json` is committed and `npm ci` (not `npm install`)
      is what CI uses (see `.github/workflows/ci.yml`).

## 2. Build the executable

```bash
npm run build:all      # tsc -b, vite build, tsc on src/server
npm test               # node --test on src/**/*.test.ts
npm run typecheck      # tsc -b on the composite project
npm run lint           # eslint .
```

- [ ] `npm run build:all` writes both `dist/` and `server-build/`.
- [ ] `npm test` exits 0. Suites live in
      `src/lib/csv.test.ts`, `src/hooks/use-media-query.test.ts`,
      and `src/server/__tests__/*.test.ts`.
- [ ] `npm run typecheck` exits 0 even with the in-repo `_mock/` shim
      present.
- [ ] `npm run lint` exits 0.

## 3. Dev workflow

Open two terminals:

```bash
# Terminal 1
npm run dev:server
# → serves http://localhost:8787 ; logs "Server is running" or equivalent

# Terminal 2
npm run dev
# → serves http://localhost:5173
```

Open <http://localhost:5173>. The login form is prefilled with the demo
admin (`admin@demo.local` / `admin`) and the SPA loads the IPAM tree.

- [ ] `npm run dev:server` boots Hono on `:8787` without TS errors.
- [ ] `npm run dev` boots Vite on `:5173` and the SPA can hit
      `/api/auth/me` against `:8787` (CORS-free, same user-agent).
- [ ] The browser console shows no unresolved red errors at idle.
- [ ] No Vite proxy is configured; `vite.config.ts` must be unchanged.

## 4. Smoke the production shape

```bash
# Build once
npm run build:all

# Run the compiled server (mirrors what Docker will run)
PORT=8787 IPAM_DATA_DIR=./data npm start &

# Hit the contract endpoints
curl -sS http://127.0.0.1:8787/healthz           # { ok: true, db: "up", seedCounts }
curl -sS http://127.0.0.1:8787/api/tenants      # session-gated → 401 without cookie
npm run smoke                                     # scripts/smoke.ts; exits 0
```

- [ ] `/healthz` returns 200 with `ok: true`, `db: "up"`, and a
      `seedCounts` object.
- [ ] `/api/*` returns 401 without a valid session (proves auth is wired).
- [ ] `/api/auth/login` accepts the demo admin credentials.
- [ ] After login, `/api/tenants` returns the seed tenant.

## 5. Docker

```bash
docker build -t ipam:local .
docker compose up -d
docker compose ps                                   # → STATUS (healthy)
npm run smoke                                       # exits 0
docker compose down
```

- [ ] `docker compose ps` reaches `(healthy)` within the `start-period`.
- [ ] `npm run smoke` against the containerized `:8787` exits 0.
- [ ] Removing the volume (`docker compose down -v`) and restarting
      reseeds the demo data.

## 6. Backups & restore

```bash
npm run backup                                       # writes data/backups/<ts>.db
npm run restore -- <basename of the file above>      # rotates the live DB
```

- [ ] `npm run backup` exits 0 and writes a file under `data/backups/`.
- [ ] `npm run restore -- <file>` exits 0 and produces a
      `.pre-restore.db` for undo.
- [ ] After `restore`, `/healthz` is still 200 and the seed tenant is
      visible.

## 7. Docs in sync

- [ ] [README.md](../README.md) Quick start matches `npm run dev`/`dev:server`.
- [ ] [README.md Tech stack](../README.md#tech-stack) React row says 18.
- [ ] [CONTRIBUTING.md](../CONTRIBUTING.md) "Local checks" section names
      `npm test`, not `npm run test:vitest` (the runner is `node --test`).
- [ ] [CHANGELOG.md](../CHANGELOG.md) has an `[Unreleased]` section that
      captures every change since the last tag.
- [ ] This file is unchanged from the previous tag (or, if changed, the
      diff is documented in CHANGELOG).

If any box is unchecked, fix it in docs **before** tagging. If a code
change is required, file an issue against the right owner and revisit
before release.
