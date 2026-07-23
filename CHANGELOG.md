# Changelog

All notable changes to this project are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this
project does **not** yet follow Semantic Versioning strictly — see the
[Releasing](../README.md#releasing) section of the README for tag
conventions. The latest released version appears at the top.

## [Unreleased]

### Documentation
- **README + CONTRIBUTING audit (NUL-21).** Corrected React version to
  18.3.x, removed claims that `@hono/zod-validator`, `vitest` as a gate,
  and `npm run dev` running both server + web are present (they aren't).
  Quick start now shows two terminals (`dev:server` + `dev`) and the
  login flow; smoke-test steps call `scripts/smoke.ts` instead of hand-
  rolled `curl | jq`. Added `.env.example` and the [Release
  Readiness Checklist](docs/release-readiness.md) that maps each claim
  to a command.

## [0.1.0] — 2026-07-16

Initial tagged scaffold.

### Added
- Hono backend on `@hono/node-server` with a scrypt + signed-cookie
  session (`src/server/auth.ts`).
- Drizzle schema for tenants, sites, rooms, floorplans, racks, devices,
  ports, cables, vrfs, prefixes, ip addresses, dhcp scopes, dns zones,
  device templates, change events, notes, image attachments.
- Raw `CREATE TABLE IF NOT EXISTS` bootstrap (`src/server/db.ts`) and a
  idempotent seed (`src/server/seed.ts`) that plants a demo tenant +
  `admin@demo.local` / `admin`.
- React 18 + Vite 6 client with TanStack Router (file-based), TanStack
  Query v5, Radix UI primitives, Tailwind v4, `react-konva` floorplans.
- Mobile drawer shell (`src/components/layout/mobile-nav-drawer.tsx`).
- Docker image + `docker-compose.yml` with healthcheck against `/healthz`.
- Backup (`scripts/backup.ts`) + restore (`scripts/restore.ts`) scripts.
- GitHub Actions: lint + typecheck + test + dual build on PR/main
  (`.github/workflows/ci.yml`); tag → release artifact + optional Docker
  (`.github/workflows/release.yml`).
- Node `--test` suites under `src/lib/csv.test.ts`,
  `src/hooks/use-media-query.test.ts`, and
  `src/server/__tests__/{auth-and-tenant,state-consistency}.test.ts`.
- `scripts/smoke.ts` smoke test against `/healthz` + `/api/tenants`.

### Known limitations
- No migrations between minor versions; the schema is hand-managed via
  raw SQL (see `src/server/db.ts`).
- Single-tenant-aware auth; multi-tenant bootstrap + bearer tokens for
  mobile are still open.
- No DNS / DHCP live integrations (NUL-13).
