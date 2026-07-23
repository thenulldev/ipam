# IPAM

Multi-tenant **IPAM, rack, and patch documentation** app. Visual rack views,
floorplans, and an IPAM tree backed by a Hono + Drizzle (SQLite) server, with
a React 18 + Vite 6 client.

> Status: **MVP scaffold**. The PR bar and contributor workflow live in
> [CONTRIBUTING.md](./CONTRIBUTING.md). Read that before opening a PR.

---

## Quick start (≤ 10 minutes)

Requires **Node 22** and **npm 10+**. No other system dependencies — the
database is SQLite, the runtime is Node.

**One terminal** is enough in dev — `npm run dev:up` brings up both the API
and the web together, prefixed and colour-coded.

```bash
# 1. Clone
git clone <repo-url> ipam
cd ipam

# 2. Install (npm ci is faster once a lockfile exists)
npm install

# 3. Run both at once: Hono API on :8787 + Vite web on :5173, with
#    auto-reload on src/server/** and HMR on src/**.
#    Equivalent shortcuts: npm run dev, npm run dev:up.
npm run dev:up
```

Open <http://localhost:5173>. The Hono API is reached at
<http://localhost:8787> — `VITE_API_URL` (default `http://localhost:8787`)
directs the client there. There is **no Vite proxy** in dev: the browser
calls the API on its own origin. If you only want the frontend (e.g. while
editing against a separately-hosted API), use `npm run dev:web`.
If you only want the API, use `npm run dev:server`. `Ctrl-C` tears both
processes down together.

> The dev seed plants two demo tenants — `internal.example` (admin:
> `stephan@internal.example`) and `acme.example` (admin:
> `alice@acme.example`). Every seeded user shares the same dev password
> (`ipam-dev`, exported from `src/server/auth.ts` as `DEV_DEFAULT_PASSWORD`).
> The first time you open `/login` the form is prefilled with the internal
> admin. Override via `IPAM_SESSION_SECRET` and the seed file before
> promoting to staging.

On first boot the server seeds an empty SQLite database at `data/ipam.db`
with two demo tenants, a handful of demo users, and some racks/devices/
prefixes so the UI has something to render.

### Install (Docker, ≤ 5 steps)

The reference deployment is a single container that ships the compiled Hono
server **and** the Vite-built frontend on the same port (`8787`). SQLite lives
in a named volume; the first boot seeds a demo tenant so the UI has data.

```bash
# 1. Clone
git clone <repo-url> ipam
cd ipam

# 2. Build the image
docker build -t ipam:local .

# 3. Bring it up (named volume `ipam-data` persists the SQLite db)
docker compose up -d

# 4. Wait for the healthcheck to go green (≈ 10s)
docker compose ps                        # STATUS should show "(healthy)"

# 5. Smoke-test the running stack
npm run smoke                            # runs scripts/smoke.ts; exits non-zero on failure
```

Open <http://localhost:8787>. The API is rooted at `/api/*` (session-gated
except `/api/auth/*`), the SPA at `/`, and `/healthz` is the endpoint
Docker (and your orchestrator) hit to confirm readiness —

- `200 {"ok":true,"db":"up","seedCounts":{...}}` when the database is
  reachable and seeded.
- `503 {"ok":false,"db":"down","error":"…"}` when the SQLite ping fails.

Supported platforms:

- **Ubuntu 22.04+** (amd64, arm64) — verified
- **macOS 13+** (Apple Silicon and Intel) — verified
- **Windows 11** with Docker Desktop / WSL2 — works; the SQLite volume lives
  inside the WSL2 filesystem

### Upgrade (v0 → v1)

The schema is hand-managed in `src/server/schema.ts` and bootstrapped via
`CREATE TABLE IF NOT EXISTS` (see `src/server/db.ts`). There is **no
migration step** between versions — upgrade is just **pull the new image
and restart the container**. The named volume preserves `ipam.db`,
`uploads/`, and any backups you wrote to `/data/backups/`.

```bash
git pull                          # or: docker pull ipam:vX.Y.Z
docker compose build              # rebuild with the new code
docker compose up -d              # recreate the container, keep the volume
docker compose logs -f ipam       # confirm /healthz returns 200
```

We're not yet shipping `drizzle/` migrations. When we cut v2 we'll
introduce them; until then the README + `CONTRIBUTING.md#schema-changes`
patterns still apply for changes landed by hand.

### Backup & restore

Both scripts take `IPAM_DATA_DIR` (default `./data`). Inside the container the
directory is `/data`, so backups and restores run against the named volume.

```bash
# Backup — copies ipam.db (plus -wal / -shm sidecars) to <data>/backups/<ts>.db
# On the host:
npm run backup                    # writes data/backups/ipam-<iso-stamp>.db

# Inside the running container (tsx is in node_modules so it's already there):
docker compose exec ipam npx tsx scripts/backup.ts
```

```bash
# Restore — atomically replaces ipam.db from a backup file
# 1. Stop the running server so the live DB is not being written to.
docker compose stop ipam
# 2. Restore. Pass either a bare filename (data/backups/<name>.db) or an
#    absolute path. The current DB is preserved as
#    ipam-<stamp>.pre-restore.db for one-step undo.
npm run restore -- ipam-2026-07-16T20-49-38-109Z.db
# 3. Start it back up.
docker compose up -d
```

Add `npm run backup` to a daily cron (or your scheduler of choice) to keep a
rolling window of snapshots. The script is idempotent and exits non-zero on
failure so a CI/scheduler can alert on it.

### Useful one-offs

```bash
npm run dev / dev:up      # API + web, one terminal, prefixed output (recommended)
npm run dev:web           # Vite dev server only (no API)
npm run dev:server        # Hono API only (tsx watch on src/server/**)
npm run typecheck         # tsc -b for client + tsc -p tsconfig.server.json for server
npm run lint              # eslint .
npm run test              # node --test against src/**/*.test.ts (client hooks + server)
npm run test:server       # node --test against src/server/__tests__/*.test.ts
npm run build             # production Vite bundle (dist/) — also runs typecheck
npm run build:server      # compile Hono server to plain JS (server-build/)
npm run build:all         # both of the above
npm run preview           # vite preview the built bundle (no API)
npm start                 # run the compiled server (node server-build/server/index.js)
npm run smoke             # scripts/smoke.ts — hits a running IPAM at $IPAM_BASE_URL
```

### Environment variables

All optional unless noted — sensible defaults work for local dev.

| Variable                 | Default                       | Purpose                                                       |
| ------------------------ | ----------------------------- | ------------------------------------------------------------- |
| `PORT`                   | `8787`                        | Port the Hono server listens on.                              |
| `IPAM_DATA_DIR`          | `data/`                       | Directory holding `ipam.db`, `uploads/`, `backups/`. Docker sets this to `/data`. |
| `IPAM_DB`                | `data/ipam.db`                | SQLite file path. Ignored if `IPAM_DATA_DIR` is set.          |
| `IPAM_UPLOAD_DIR`        | `data/uploads`                | Directory for uploaded images. Created on first boot.         |
| `IPAM_DIST_DIR`          | `dist/`                       | Vite build output to serve as the SPA. Docker sets this to `/app/dist`. |
| `IPAM_SESSION_SECRET`    | *required in production*      | HMAC key for the session cookie. Falls back to a dev-only constant with a warning if unset or shorter than 16 chars. |
| `VITE_API_URL`           | `http://localhost:8787`       | Override the API base the client uses in dev/prod builds. Read by `src/lib/api/http-client.ts`. |

---

## Repository layout

```
.
├── .github/
│   └── workflows/
│       ├── ci.yml        # lint + typecheck + test + client+server build on PR and main
│       └── release.yml   # tag → build → GitHub Release (+ optional Docker)
├── data/                  # SQLite db + uploaded blobs (gitignored)
├── dist/                  # vite build output (gitignored)
├── server-build/          # tsc output of src/server (gitignored)
├── src/
│   ├── components/        # UI primitives (Radix wrappers) + layout
│   │   ├── ui/            # button, dialog, dropdown, tabs, ...
│   │   └── layout/        # app-shell, sidebar, topbar, mobile-nav-drawer
│   ├── features/          # feature-scoped UI (ipam, racks, patches, ...)
│   ├── hooks/             # small reusable hooks (use-media-query, ...)
│   ├── lib/
│   │   ├── api/           # client-side wrappers around /api/* (live + mock)
│   │   │   ├── _mock/     # live→mock adapter (see api/backend-ready.ts)
│   │   │   └── http-client.ts
│   │   ├── auth.ts        # client-side canWrite / canAdmin checks
│   │   ├── queries.ts     # TanStack Query hooks
│   │   └── types.ts       # domain types + branded ids
│   ├── routes/            # TanStack Router file-based routes (auto-joined into routeTree.gen.ts)
│   ├── server/            # Hono backend
│   │   ├── index.ts       # app, routes, middleware
│   │   ├── db.ts          # better-sqlite3 + raw CREATE TABLE bootstrap
│   │   ├── schema.ts      # drizzle schema (the contract)
│   │   ├── seed.ts        # demo data
│   │   ├── auth.ts        # scrypt password hashing + signed cookie sessions
│   │   ├── scope.ts       # tenant-ownership guards
│   │   ├── errors.ts      # unified API error responses
│   │   ├── meta.ts        # emitChange / audit helpers
│   │   └── __tests__/     # node --test suites
│   ├── store/             # Zustand stores (editor / tenant / ui)
│   ├── styles/            # Tailwind v4 + theme tokens
│   ├── main.tsx           # QueryClientProvider + RouterProvider
│   └── routeTree.gen.ts   # generated by tsr — DO NOT EDIT
├── eslint.config.js
├── tsconfig.json          # composite: app + node
├── tsconfig.app.json      # frontend
├── tsconfig.node.json     # vite.config.ts
├── tsconfig.server.json   # backend (compiles to server-build/)
├── vite.config.ts
├── docker-compose.yml
├── Dockerfile
└── package.json
```

---

## Tech stack

| Concern              | Library                                                          |
| -------------------- | ---------------------------------------------------------------- |
| UI framework         | React 18 + Vite 6 + TypeScript (strict, `verbatimModuleSyntax`)  |
| Routing              | TanStack Router (file-based, `tsr generate`)                     |
| Data fetching        | TanStack Query v5                                               |
| Forms / validation   | React Hook Form + Zod (client)                                  |
| Client state         | Zustand                                                         |
| UI primitives        | Radix UI (`@radix-ui/react-*`) — wrapped in `components/ui/`     |
| Canvas / floorplans  | `konva` + `react-konva`                                         |
| Command palette      | `cmdk` (⌘K / Ctrl+K)                                            |
| Icons                | `lucide-react`                                                  |
| Styling              | Tailwind v4 via `@tailwindcss/vite`                              |
| **Backend**          | Hono on `@hono/node-server`                                     |
| **Persistence**      | Drizzle ORM + `better-sqlite3` (schema is the contract; tables are bootstrapped via raw `CREATE TABLE`) |
| **Validation (API)** | Plain Zod schemas validated inside handlers (no `@hono/zod-validator`) |
| **Test runner**      | Node's built-in `node --test` driven from package scripts. `vitest` is installed for coverage tooling but the gate is `node --test`. |
| **Migrations**       | Hand-managed `CREATE TABLE` until v2 ships `drizzle/` |

---

## Domain model (in `src/server/schema.ts`)

All ids are TEXT (we use the same string ids as the frontend).

- `tenants` → `users`, `sites` → `rooms` → `floorplans` → `rackPositions`
- `racks` → `devices` (mounted at a U position, front/rear) → `ports`
- `cables` connect two `ports`
- `vrfs` → `prefixes` (hierarchical CIDR) → `ipAddresses`
- `dhcpScopes`, `dnsZones`, `deviceTemplates` (per tenant)
- `notes`, `imageAttachments` are polymorphic (`entityType` + `entityId`)
- `changeEvents` records every mutation with actor, action, summary, ISO date

When you change `schema.ts`, the schema table is rebuilt from raw SQL on the
next boot for the demo DB; production-style migrations (the `drizzle/`
directory) are scheduled for v2 — see [CONTRIBUTING.md](./CONTRIBUTING.md#schema-changes).

---

## How the app is wired

1. **Routing** — `src/routes/*.tsx` exports TanStack Router `Route` via
   `createFileRoute(...)`. The Vite plugin generates `src/routeTree.gen.ts`.
2. **App shell** (`src/components/layout/app-shell.tsx`) — sidebar nav +
   topbar + main outlet. Topbar has the tenant switcher, user identity,
   search trigger.
3. **API client** — `src/lib/api/*` exports typed wrappers around `/api/*`.
   `src/lib/api/http-client.ts` resolves the base URL from `VITE_API_URL`
   (default `http://localhost:8787`) and emits `fetch` calls directly to
   that origin. There is **no Vite proxy** in dev — both `:5173` and
   `:8787` must be reachable. The TanStack Query hooks in
   `src/lib/queries.ts` wrap those fetchers.
4. **Server** (`src/server/index.ts`) — Hono app. All `/api/*` routes
   return JSON and are session-gated by the cookie middleware in
   `src/server/auth.ts`, except `/api/auth/*`. Writes are validated with
   plain Zod schemas inside the handler and emit a `ChangeEvent` via
   `emitChange()` in `src/server/meta.ts`.
5. **Static SPA** — `app.get('*')` falls through to `serveStatic` over
   `IPAM_DIST_DIR` so the same port serves the SPA + API in production.
   The Docker image composes them on `:8787`; in dev the Vite dev server
   handles the SPA on `:5173` and the API is on `:8787`.
6. **Floorplan** uses `react-konva`. `Floorplan.imageUrl` is rendered as a
   Konva image; racks are draggable on a 20px grid (editor/admin only).
7. **Audit log** — every mutation calls `emitChange()`. Surfaced on each
   entity's timeline and on `/settings`.

---

## Keyboard shortcuts

| Shortcut          | Action                |
| ----------------- | --------------------- |
| ⌘K / Ctrl+K      | Open command palette  |
| Esc (in palette)  | Close palette         |

---

## Releasing

We cut a release by pushing a tag of the form `vX.Y.Z`:

```bash
git tag v0.1.0
git push origin v0.1.0
```

`.github/workflows/release.yml` then builds the Vite bundle + Hono server
and attaches the artifact to a GitHub Release. If the repo is configured
with registry secrets (`IPAM_DOCKER_USERNAME` + `IPAM_DOCKER_PASSWORD`) or
`IPAM_PUSH_DOCKER=true`, a Docker image is also pushed. See
[CONTRIBUTING.md](./CONTRIBUTING.md#release-secrets) for the full list.

Before tagging, run through the [Release Readiness Checklist](./docs/release-readiness.md)
to confirm every documented command still succeeds on a clean checkout.

---

## Outstanding work

- **Migrations** — `src/server/db.ts` still bootstraps tables with raw
  `CREATE TABLE IF NOT EXISTS`. The plan is to introduce `drizzle-kit
  generate` + a `drizzle/` directory when schema drift becomes a real risk
  (target: v2).
- **Real authentication** — the current password/session implementation
  (scrypt + signed cookie) is real but single-tenant-aware. Multi-tenant
  bootstrap, password rotation, and bearer-token auth for mobile are still
  open.
- **DNS / DHCP live integrations** (issue NUL-13).
- **Bulk import** (CSV/Excel) and structural diffs in the audit log viewer.
