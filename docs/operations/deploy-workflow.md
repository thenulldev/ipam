# IPAM deploy workflow (`deploy.yml`)

> Author: Forge · Founding Engineer (NUL-226).
> Parent: [NUL-221 — Local Docker Deploy](../README.md).
> Spec: see Compass's `documentKey=spec` on NUL-222.

This file is the operator-facing write-up for `.github/workflows/deploy.yml`.
It is the runbook the founder and Sentinel (review) reach for when they ask
"what does this workflow actually do, and what secrets does it need?".

## What it does

A push to `main` on `thenulldev/ipam`:

1. Builds the Docker image (the same multi-stage `Dockerfile` that `release.yml`
   already pushes on tag pushes).
2. Tags it two ways and pushes to `ghcr.io/thenulldev/ipam`:
   - `ghcr.io/thenulldev/ipam:<full-commit-sha>` — the pin we deploy.
   - `ghcr.io/thenulldev/ipam:latest` — rolling, only on default branch.
3. SSHes to this host (`paperclip@<IPAM_DEPLOY_HOST>`) as `paperclip` using a
   dedicated deploy key, and runs `bash /srv/ipam/deploy.sh <sha>`.

`/srv/ipam/deploy.sh` (authored by Relay under NUL-225) does the
`docker compose pull && docker compose up -d --remove-orphans && docker
compose ps` work and waits for the container's `/healthz` to go green before
exiting zero.

## Workflow triggers

| Trigger                   | Behaviour                                                    |
| ------------------------- | ------------------------------------------------------------ |
| `push` to `main`          | Build → push → SSH deploy, always.                           |
| `workflow_dispatch`       | Manual run from the Actions UI. By default also builds.      |
| `workflow_dispatch` w/ `pinned_tag=<sha>` | Rollback: deploy `<sha>` instead of the freshly built one. |
| `workflow_dispatch` w/ `deploy_only=true` | Skip build; only run the SSH deploy step. |

The `concurrency` group is `ipam-deploy-${{ github.ref }}` with
`cancel-in-progress: false`, so two pushes in quick succession serialise.
The second push waits for the first deploy to finish before starting its own.
We never kill a half-finished deploy.

## Repo secrets

These live in the repo's **Settings → Secrets and variables → Actions**.
The workflow refuses to do anything useful without them.

| Secret                 | Required by | What it is                                                                    |
| ---------------------- | ----------- | ----------------------------------------------------------------------------- |
| `IPAM_DEPLOY_HOST`     | deploy job  | Hostname or IP of this box (`paperclip.thenull.dev` / `2.25.87.37`).          |
| `IPAM_DEPLOY_USER`     | deploy job  | SSH user (`paperclip`). Relay creates the user + restricts the key.           |
| `IPAM_DEPLOY_SSH_KEY`  | deploy job  | Private half of an `ed25519` keypair whose public half is in `paperclip@this-host:~/.ssh/authorized_keys`, locked to `command="bash /srv/ipam/deploy.sh"`. Generated with `ssh-keygen -t ed25519 -C 'ipam-deploy'`. |
| `IPAM_DOCKER_USERNAME` | build job (optional) | ghcr.io username. Used only if the founder prefers parity with `release.yml`. Default path uses `GITHUB_TOKEN` instead. |
| `IPAM_DOCKER_PASSWORD` | build job (optional) | ghcr.io PAT or `GITHUB_TOKEN`. Same conditional as above.      |

And the matching **variable** (optional):

| Variable                | Purpose                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `IPAM_DOCKER_REGISTRY`  | Override the registry hostname (default `ghcr.io`). Useful for staging mirrors. |

## How to add the secrets

```bash
# On the founder's machine:
gh secret set IPAM_DEPLOY_HOST    --repo thenulldev/ipam --body "paperclip.thenull.dev"
gh secret set IPAM_DEPLOY_USER    --repo thenulldev/ipam --body "paperclip"

# Generate a fresh ed25519 deploy key (do NOT reuse personal keys):
ssh-keygen -t ed25519 -C 'ipam-deploy-github-actions' -f /tmp/ipam-deploy
gh secret set IPAM_DEPLOY_SSH_KEY --repo thenulldev/ipam < /tmp/ipam-deploy
ssh-copy-id -i /tmp/ipam-deploy.pub paperclip@paperclip.thenull.dev
# Then on the host, lock the key down:
#   echo 'command="bash /srv/ipam/deploy.sh",from="*.actions.githubusercontent.com",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... ipam-deploy-github-actions' \
#     >> /home/paperclip/.ssh/authorized_keys
# Relay (NUL-225) wires this in; do not edit it from CI.
```

## How to roll back

> The detailed rollback runbook lives at
> [`ipam-rollback.md`](./ipam-rollback.md) (NUL-228). This section is a
> quick reference; the runbook has the full decision tree.

Easiest path — find a previously good SHA and use the workflow UI:

1. Open the **Actions** tab on `thenulldev/ipam`.
2. Pick the **Deploy IPAM** workflow on the left.
3. **Run workflow →** `main` branch, set `pinned_tag=<previous-sha>`,
   set `deploy_only=true`, click **Run**.
4. The SSH step pulls that tag and runs `docker compose up -d` against it.
   `/srv/ipam/deploy.sh` exits non-zero if `/healthz` does not return
   `{"ok":true,"db":"up"}` within the retry window, so a bad rollback fails
   loud instead of silently corrupting state.

For a manual rollback outside GitHub Actions (debug only):

```bash
ssh paperclip@paperclip.thenull.dev \
  'cd /srv/ipam && IPAM_PINNED_TAG=<previous-sha> bash deploy.sh'
```

## Operational gotchas

- **First run after a fresh clone is slow.** Buildx + GitHub cache need a
  cold-cache baseline; expect 6–10 min. Subsequent runs cache-hit and finish
  in 2–3 min.
- **`latest` is a moving target.** Never pin `:latest` in an external
  consumer — use the SHA tag. The `latest` tag only exists to give
  operators a human-readable "what's running now" handle.
- **`/srv/ipam/deploy.sh` must exit non-zero on a failed healthcheck.**
  The workflow treats non-zero exit as a deploy failure. NUL-225 (Relay)
  authors that script with a 3×10s healthcheck gate.
- **SSH source-IP pinning.** Relay locks the authorized_keys entry to
  `from="*.actions.githubusercontent.com"`. GitHub's IP ranges are public
  but the wildcard host restriction is the strongest `from=` filter SSH
  supports for GitHub-hosted runners; pinning by IP requires refreshing
  the list as GitHub rotates ranges.
- **ghcr.io authentication choice.** Default path uses `GITHUB_TOKEN` with
  `packages:write` (no extra secrets). To match `release.yml` exactly,
  set `IPAM_DOCKER_USERNAME` / `IPAM_DOCKER_PASSWORD` and the workflow
  picks them up automatically. The founder picks; the workflow works either
  way.

## Acceptance checks (from NUL-226)

The acceptance criteria for NUL-226 are end-to-end and require the host-side
work from NUL-225 (Docker installed, nginx vhost + certbot, `/srv/ipam/deploy.sh`,
SSH deploy key) to be live. Until that lands, the workflow file is reviewable
but cannot be exercised:

| Check                                                                          | Owner     | Verifiable now?                  |
| ------------------------------------------------------------------------------ | --------- | -------------------------------- |
| `crane ls ghcr.io/thenulldev/ipam` shows the new SHA tag                      | build job | After first push (post-NUL-225). |
| Container on this host running that SHA                                        | deploy job | After NUL-225 lands + first push. |
| `https://ipam.thenull.dev/healthz` returns `{"ok":true,"db":"up"}` within 5 min | end-to-end | After NUL-225 lands + first push. |
| `workflow_dispatch` can rerun deploy step alone with override SHA              | workflow file | Verifiable by reading this file — the `deploy_only` + `pinned_tag` inputs are wired. |

## Related issues

- NUL-221 — parent ("Local Docker Deploy").
- NUL-222 — PM spec; full child tree and risk class.
- NUL-224 — `IPAM_HOST_PORT` env override (merged; required for host-port
  avoidance on this box).
- NUL-225 — Relay's on-host work (Docker install, nginx vhost, certbot,
  `/srv/ipam/deploy.sh`, SSH deploy key). **Must be merged before this
  workflow can be exercised end-to-end.**
- NUL-227 — Sentinel's review checklist (`deploy-workflow` Block class).
- NUL-228 — Operator README for rollback (Quill).
