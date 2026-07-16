# IPAM & Rack Documentation

PatchDocs-style frontend for IPAM, rack/patch, and floorplan documentation.
Multi-tenant, frontend-only, in-memory store.

## Quick start

```bash
npm install
npm run dev
```

App lives at <http://localhost:5173>. Press **⌘K / Ctrl+K** anywhere for the
global search palette.

## Scripts

| Script              | Purpose                                                       |
| ------------------- | ------------------------------------------------------------- |
| `npm run dev`       | Vite dev server with HMR                                      |
| `npm run build`     | Typecheck + production build                                  |
| `npm run preview`   | Preview built bundle                                          |
| `npm run typecheck` | TypeScript project build                                      |

`tsr generate` runs automatically before `build` and `typecheck`. Output:
`src/routeTree.gen.ts` (git-ignored).

## PatchDocs feature parity

Each row below maps to a PatchDocs marketing point and the corresponding
implementation in this scaffold.

| PatchDocs feature | Status | Where it lives |
| ----------------- | ------ | -------------- |
| Tenant management | ✅ | Top-left tenant switcher; pages filter via `useTenantScope()`; `src/lib/tenant-scope.ts`, `src/lib/mock/tenants.ts` |
| User roles & rights | ✅ UI | Top-right user menu with role badge; `canWrite()` / `canAdmin()` in `src/lib/auth.ts` gate mutations |
| History & change tracking | ✅ | All mutations call `emitChange()` (in `src/lib/api/meta.ts`); rack + dashboard + settings show timelines |
| Meta information (photos / notes) | ✅ | Per-entity `Note` and `ImageAttachment` records; RHF + Zod dialogs; `src/features/racks/rack-notes-panel.tsx` |
| Mapped down to every port | ✅ | `Port.cableId`, `Port.ipAddressId`; click port → trace full chain (`CableTraceDialog` in `src/features/patches/`) |
| Advanced search & filtering | ✅ | ⌘K command palette powered by `cmdk`; `src/features/command-palette/command-palette.tsx` |
| Visual rack views | ✅ | `src/features/racks/rack-view.tsx`; front / rear toggle, hover-highlights |
| Floor plans (image + drag) | ✅ | Konva canvas with inline SVG bg; racks are draggable; `src/features/floorplan/floorplan-canvas.tsx` |
| Custom device templates | ✅ | Library of 11 vendor templates; "New device from template" dialog with RHF + Zod; `/templates` page |
| Export & reporting | ✅ | CSV + JSON downloads on Patches; helpers in `src/lib/export.ts` |
| Browser-based & device-independent | ✅ | Standard Vite SPA |
| 2FA & advanced security | ❌ | Backend-only (out of scope for this scaffold) |
| Pay-as-you-go | ❌ | Backend-only |

## Tech stack

| Concern             | Library                                                 |
| ------------------- | ------------------------------------------------------- |
| Build               | Vite 6 + `@tailwindcss/vite` plugin (Tailwind v4)      |
| UI primitives       | Radix UI (`@radix-ui/react-*`) wrapped in `components/ui/` |
| Routing             | TanStack Router file-based, auto-generated route tree   |
| Data fetching       | TanStack Query v5                                       |
| Forms / validation  | React Hook Form + Zod                                   |
| Client state        | Zustand                                                 |
| Canvas / diagrams   | react-konva                                             |
| Command palette     | cmdk                                                    |
| Icons               | lucide-react                                            |
| Types               | TypeScript strict + `verbatimModuleSyntax`              |

## Project layout

```
src/
  lib/
    types.ts            // All domain types + branded ids
    utils.ts            // cn(), small helpers
    auth.ts             // role checks (canWrite / canAdmin), avatar initials
    export.ts           // JSON/CSV download helpers
    tenant-scope.ts     // Hook returning tenant-filtered entity lists
    mock/
      ids.ts            // brand-cast helpers
      tenants.ts        // tenants + users
      templates.ts      // device template library
      locations.ts      // sites, rooms, floorplans
      physical.ts       // racks, devices, ports, cables
      ipam.ts           // VRFs, prefixes, addresses
      meta.ts           // notes, images, change events
      index.ts          // Re-exports the in-memory DB
    api/
      client.ts         // delay()
      physical.ts       // racks/devices/ports + mutations
      ipam.ts           // VRFs/prefixes/addresses
      tenants.ts        // tenants / users / templates
      meta.ts           // notes/images/change events + emitChange()
      index.ts          // Re-exports
    queries.ts          // TanStack Query hooks + mutations
  store/
    editor-store.ts     // UI selection state
    tenant-store.ts     // current tenant + current user
    ui-store.ts         // theme + sidebar
  components/
    ui/                 // Radix primitives + wrappers
      button, input, label, dialog, dropdown, select, tabs,
      tooltip, scroll-area, separator, badge, switch,
      avatar, card, command (cmdk)
    layout/
      app-shell.tsx, sidebar.tsx, topbar.tsx
  features/
    dashboard/          // /          cards + activity
    ipam/               // /ipam      subnet tree + addresses
    racks/              // /racks     list + detail + view + panels + dialog
    patches/            // /patches   cable inventory + trace dialog
    floorplan/          // /floorplan Konva canvas with images + drag
    templates/          // /templates device library
    settings/           // /settings  tenant/users/activity
    command-palette/    // global ⌘K search
  routes/               // file-based routes (auto-generated tree)
  styles/globals.css    // Tailwind v4 + theme tokens
  main.tsx              // entry: QueryClientProvider + RouterProvider
```

## Domain model

### Core entities (tenant-aware)

- `Tenant` → many `Site` → many `Room` → many `Floorplan` (with rack positions)
- `Rack` → many `Device` (mount at U position; face front|rear) → many `Port`
- `Cable` connects two `Port`s
- `Vrf` scopes `Prefix`; `Prefix` is hierarchical (parent → child CIDR); `IpAddress` belongs to a prefix

### Meta + audit

- `Note` and `ImageAttachment` are polymorphic (`entityType` + `entityId`).
  They can attach to any entity.
- `ChangeEvent` records every mutation with actor, action, summary, ISO date.
  Surfaced on each entity and on `/settings`.

### People

- `Tenant` → many `User` with role `admin` | `editor` | `viewer`.
- `viewer` is read-only; `editor` can mutate; `admin` reserved for tenant-level ops.

## How the app is wired

1. **Routing**: `src/routes/*.tsx` exports TanStack Router `Route` via
   `createFileRoute(...)`. The vite plugin generates `routeTree.gen.ts`.
2. **App shell** (`src/components/layout/app-shell.tsx`): sidebar nav + topbar
   + main outlet. Topbar has tenant switcher, user identity, search trigger.
3. **Tenant scoping**: `useTenantScope()` (`src/lib/tenant-scope.ts`) returns
   entity lists pre-filtered by the current tenant. Pages consume this hook
   instead of raw `useX()` queries.
4. **Data**:
   - `src/lib/api/*` returns `Promise<T>` (with 80ms simulated latency) and
     mutates in-memory arrays. Replace functions here to swap in a real
     backend; nothing else needs to change.
   - `src/lib/queries.ts` exposes query + mutation hooks.
5. **State**:
   - `tenant-store` holds current tenant + user (Zustand, in-memory).
   - `editor-store` holds UI selection (which port is highlighted, etc.).
   - Mutations call `emitChange()` so the audit log is always consistent.
6. **Floorplan** uses react-konva. The `Floorplan.imageUrl` is rendered as a
   Konva image; racks are draggable (snapping to a 20px grid) — only for
   users with editor/admin role.

## Replacing mock data with a real backend

The only files that know about the data source are:

- `src/lib/mock/*` — fixture DB
- `src/lib/api/*` — async read/write functions

To plug in a real backend:

1. Replace each export in `src/lib/api/{physical,ipam,tenants,meta}.ts` with
   a `fetch` call (or Hono/tRPC/whatever).
2. Keep the function signatures (input/output types) identical.
3. For writes, emit a `ChangeEvent` on the server-side or call
   `emitChange()` client-side to keep the audit log consistent.

Nothing in `components/`, `features/`, or `routes/` needs to change.

For a NetBox or Nautobot integration, model mappings live in the README
under "Model mappings" of the previous scaffold revision.

## Adding a new entity type

1. Add the type + branded id in `src/lib/types.ts`.
2. Add mock data in `src/lib/mock/<entity>.ts` and re-export from
   `src/lib/mock/index.ts`.
3. Add API functions in `src/lib/api/<entity>.ts` and re-export from
   `src/lib/api/index.ts`.
4. Add query keys + hooks + (optional) mutations in `src/lib/queries.ts`.
5. If the entity is a top-level tenant resource, also add a `tenantId`
   field and include it in `useTenantScope()`.

## Keyboard shortcuts

| Shortcut          | Action                |
| ----------------- | --------------------- |
| ⌘K / Ctrl+K      | Open command palette  |
| Esc (in palette)  | Close palette         |

## Adding a new Radix primitive

1. `npm install @radix-ui/react-<thing>`
2. Create `src/components/ui/<thing>.tsx` that re-exports the parts and
   styles them with Tailwind. Existing files show the pattern.

## Outstanding for a production app

- Backend + auth (this scaffold has no real persistence)
- Multi-user real-time collaboration (live cursors, etc.)
- Image upload (currently URL- or data: URL-based)
- Floorplan background image upload
- Bulk import (CSV/Excel)
- Diffing/audit log viewer with structural diffs
- PDU power aggregation
- SLA / circuit IDs / cross-connects
