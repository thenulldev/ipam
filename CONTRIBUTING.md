# Contributing

Thanks for shipping on IPAM. This document is short on purpose — it covers
the bar every PR must clear and the few rules that keep the repo sane.

If you have not set the project up yet, start with the [README](./README.md)
quick start.

---

## TL;DR — the PR bar

A PR is approvable when **all five** of these are true:

1. `npm run lint` is clean.
2. `npm run typecheck` is clean.
3. `npm run build` is clean.
4. If `src/server/schema.ts` changed, the matching Drizzle migration is in
   the same PR (`drizzle/<NNNN>_*.sql` plus a `drizzle-kit migrate` call
   in the seed or migration runner).
5. No new dependency was added without a comment in the PR explaining the
   size/weight tradeoff (production deps especially).

CI runs the first three on every PR. The last two are reviewed manually.

---

## Workflow

1. Branch from `main`. Use a short, descriptive name: `feat/rack-power-tab`,
   `fix/seed-tenant-slug`, `docs/quickstart`.
2. Keep the PR small and focused. One concern per PR. If you find yourself
   refactoring unrelated code, split it out.
3. Push the branch and open the PR against `main`. Fill in the template:
   what changed, how you verified, any screenshots/curl traces.
4. Wait for CI. Address review comments before requesting re-review.
5. Squash-merge once approved. The commit message should be
   `<scope>: <imperative summary>` (e.g. `racks: add per-port power tab`).

---

## Local checks before pushing

You can (and should) run the same three commands CI runs:

```bash
npm run lint
npm run typecheck
npm run build
```

If you touched `src/server/**`, also run `npm run build:server` so the
server actually compiles — the CI workflow does this implicitly via the
release workflow, but lint/typecheck alone will not catch a server-only
type error.

---

## Style

- Match what's already there. The codebase uses:
  - **Tabs** in `.ts`/`.tsx`, **2 spaces** in `.yml`/`.json`/`.md`.
  - Single quotes, no semicolons are NOT the convention here — match the
    surrounding file.
  - Tailwind v4 classes inline; no separate CSS modules.
- One named export per concern. Prefer narrow types (`type X = ...`) over
  broad interfaces.
- Comments only when they explain *why*, not *what*. The code should be
  readable on its own.

---

## Schema changes

`src/server/schema.ts` is the contract between the Hono API and the SQLite
file. When you change it:

```bash
# 1. Edit schema.ts.
# 2. Generate the SQL migration:
npx drizzle-kit generate
# 3. Apply it to your local DB so you can dev against it:
npx drizzle-kit migrate
# 4. Commit BOTH schema.ts AND the generated file under drizzle/.
```

Never edit a generated migration by hand after it has landed on `main` —
add a new one. The release workflow runs `migrate` against a fresh DB and
expects migrations to be append-only.

---

## Adding a new dependency

Production dependencies ship to every consumer of this repo. Before adding
one, write a comment on the PR that answers:

- What is it, and what does it replace?
- How big is it (packed size on `npm pack` or `packagephobia`)?
- Could the same thing be done with a few lines of code we own?
- For devDependencies: is it strictly required for the lint/typecheck/
  build/test gates, or is it a nice-to-have?

The reviewer will check this comment. Anything hand-wavy gets a "justify
the weight" review.

---

## Release secrets

Releases are driven by tags on `main`. The release workflow
(`.github/workflows/release.yml`) handles two paths:

| Path         | Trigger                                              | Output                              |
| ------------ | ---------------------------------------------------- | ----------------------------------- |
| GitHub Release | Always (when a tag lands)                          | A tarball of `dist/` + `server-build/` is attached. |
| Docker image | When `vars.IPAM_PUSH_DOCKER=true` OR secrets are set | Image pushed to the configured registry. |

Secrets to configure if you want Docker images:

| Secret / var             | Purpose                                         |
| ------------------------ | ----------------------------------------------- |
| `IPAM_DOCKER_USERNAME`   | Registry username (ghcr.io uses the bot login). |
| `IPAM_DOCKER_PASSWORD`   | Registry token / password.                      |
| `IPAM_DOCKER_REGISTRY`   | Optional. Defaults to `ghcr.io`.                |
| `IPAM_PUSH_DOCKER`       | Optional. Set to `true` to force-on the job.    |

If none of those are set, the Docker job is skipped automatically and the
release still ships via the GitHub Release artifact. No configuration is
required for a basic cut.

---

## Reporting issues

Open an issue with: a one-line summary, the smallest reproduction (ideally
a `curl` against the API or a route), the actual vs expected behavior, and
your environment (Node version, OS, browser if it's a UI bug).

Thanks again. 🚀