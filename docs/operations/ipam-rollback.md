# Rolling back an IPAM deploy on `ipam.thenull.dev`

**Outcome.** The on-call (founder, future engineer) can roll IPAM back to the
previous image in **under 5 minutes** without pinging anyone in Slack.

This is the operator doc for the on-host Docker deploy (NUL-221 → NUL-225 → NUL-226).
Read [`local-deploy.md`](./local-deploy.md) first if you need a refresher on how
IPAM is laid out on the host.

---

## 0. When to roll back vs. when to fix forward

Roll back when **the new image is the problem**: a crash loop, a 500 on a hot
endpoint, a bad migration that the new image wrote but the old one refuses on
startup. The signal is "the previous deploy was fine, this one isn't."

**Do not roll back when the data changed under the new image and the old image
will refuse to read it.** That is a **forward fix**, not a rollback. See §6.

Five-minute decision tree:

```
Is /healthz returning {"ok":true,"db":"up"} on the public URL?
├── yes → not a rollback situation; investigate, don't roll back.
└── no
    ├── Last deploy < 30 min ago and broke something that worked before?
    │       → ROLL BACK. Go to §1.
    ├── Last deploy > 30 min ago, or you don't know when it broke?
    │       → Check §2 first to confirm the running SHA matches what you think.
    └── Did the failing image run a schema change?
            → Go straight to §6. Rollback may make it worse.
```

---

## 1. Find the previous good SHA

You need a **commit SHA** (40-char hex), not `latest`. The deploy workflow tags
each image `ghcr.io/thenulldev/ipam:sha-<sha>` and only `latest` on `main`.

Pick whichever of these is fastest for you:

### 1a. From the GitHub Actions run history (preferred)

Open **https://github.com/thenulldev/ipam/actions** and look at the **Deploy
IPAM** workflow runs. Each run row shows the commit SHA it deployed. The
previous good run is the one *before* the current failing run.

### 1b. From the registry, sorted by tag date

```bash
# One-time per machine: log in to ghcr.io (read-only is fine).
echo "$GITHUB_TOKEN" | docker login ghcr.io -u thenulldev --password-stdin

# List tags newest-first; pick the SHA-tagged row immediately before the
# currently-running one (cross-check against §2).
crane ls ghcr.io/thenulldev/ipam | sort -r
```

`crane` is a single Go binary from `go-containerregistry`. Install with
`go install github.com/google/go-containerregistry/cmd/crane@latest` or grab a
release tarball — no daemon needed.

### 1c. From the host, if you can SSH in

```bash
ssh paperclip@ipam.thenull.dev \
  'docker inspect --format "{{.Config.Image}}" ipam-ipam-1'
```

That prints the exact `ghcr.io/thenulldev/ipam:sha-<sha>` the running container
came from — your "current bad" SHA. The previous good SHA is the one immediately
before it in §1a or §1b.

> **Note on `latest`.** `ghcr.io/thenulldev/ipam:latest` is updated on every
> `main` push. Once you've rolled back, `latest` still points at the broken
> image. Don't trust it; always pin to a SHA.

---

## 2. Roll back — pick one path

Both paths end at the same place: the host container is running
`ghcr.io/thenulldev/ipam:sha-<previous-sha>` and `/healthz` is green. Pick
**Path A** unless GitHub Actions is unreachable.

### 2A. Path A — roll back via the workflow (no shell on the host)

The deploy workflow (`.github/workflows/deploy.yml`, owned by Forge per
NUL-226) accepts a `workflow_dispatch` input. You give it a SHA; it builds
nothing (the image already exists in ghcr.io from the original push) and
calls `bash /srv/ipam/deploy.sh <sha>` over the locked-down deploy SSH key.

**In the GitHub web UI:**

1. Open **https://github.com/thenulldev/ipam/actions/workflows/deploy.yml**.
2. Click **Run workflow** (right side).
3. Branch: `main`.
4. Inputs:
   - **`sha`**: paste the previous good SHA from §1 (full 40 chars).
   - **`reason`** (optional): "rollback after <incident>".
5. Click **Run workflow** (green button).

**From the CLI if you have `gh` authed:**

```bash
gh workflow run deploy.yml \
  --repo thenulldev/ipam \
  -f sha=<previous-sha> \
  -f reason="rollback"
```

Watch the run; the `deploy` job runs `bash /srv/ipam/deploy.sh <sha>` on the
host, which `docker compose pull`s the SHA-tagged image and `up -d
--remove-orphans`s it. The job exits 0 when healthcheck passes (3 retries × 10s
per NUL-225 step 9).

### 2B. Path B — roll back via SSH (when GitHub Actions is down)

Use this only if Path A fails or Actions is unreachable. You need SSH access
as `paperclip@ipam.thenull.dev`.

```bash
# Pin the image tag and run the same deploy script the workflow uses.
ssh paperclip@ipam.thenull.dev \
  'cd /srv/ipam && bash deploy.sh <previous-sha>'

# If you need to do it by hand instead (don't, but if you must):
ssh paperclip@ipam.thenull.dev \
  'cd /srv/ipam \
   && IPAM_PINNED_TAG=<previous-sha> \
   && docker compose pull \
   && docker compose up -d --remove-orphans \
   && docker compose ps'
```

`/srv/ipam/deploy.sh <sha>` is the canonical entry point — it sets
`IPAM_PINNED_TAG=<sha>` in the env, pulls, recreates the container, and gates
on healthcheck (3 × 10s). Running it by hand above is the same effect, just
spread across one long line.

If SSH itself is broken, you've got a host problem, not a deploy problem.
That's outside the scope of this doc — page the on-call who owns the box.

---

## 3. Verify

Run all four. They take ~10 seconds combined and they're independent, so a
green on three and a red on one tells you exactly what's still wrong.

```bash
# 1. Public URL serves the new (rolled-back) image and reports healthy.
curl -fsS https://ipam.thenull.dev/healthz
#   expected: {"ok":true,"db":"up",...}

# 2. TLS cert is still Let's Encrypt and not expired (the certbot renewal
#    timer keeps this fresh; a rollback does not touch the cert).
echo | openssl s_client -connect ipam.thenull.dev:443 \
  -servername ipam.thenull.dev 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
#   expected: issuer = Let's Encrypt, not expired.

# 3. The container is up and matches the SHA you rolled back to.
ssh paperclip@ipam.thenull.dev 'docker ps --filter name=ipam-ipam-1 \
  --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"'
#   expected: STATUS = "Up ... (healthy)", IMAGE = "ghcr.io/thenulldev/ipam:sha-<previous-sha>"

# 4. No crash-loop in the logs since the rollback.
ssh paperclip@ipam.thenull.dev 'docker logs ipam-ipam-1 --tail 50'
#   expected: server start line at the top, no stack traces after it.
```

If #1 is green and #3 is green, you're done. If #1 is green but #3 shows the
old SHA, the pull raced with a redeploy — re-run Path A or B and re-check.
If #1 is red but #3 is green, the issue is nginx / TLS, not the image —
go to §5.

---

## 4. Record what you did

A two-line commit or issue comment now saves an hour of archaeology later.
Mention: timestamp (UTC), the bad SHA, the good SHA you rolled back to, and
one sentence on why.

```bash
# Example issue comment body — paste into NUL-221 or the incident ticket:
# Rolled back ipam from <bad-sha> to <good-sha> at 2026-07-23T18:42Z.
# Reason: /healthz 500'd after deploy #<n>; smoke test passed on previous.
```

---

## 5. When rollback won't help — schema forward-compat

IPAM does **not** have formal schema migrations today (the brief on NUL-221
notes this). SQLite lives in the named volume `ipam-data`. A new image may
write a schema that an old image refuses to read on startup — rolling back in
that case **makes things worse**, not better.

**The check is two questions:**

1. Did the failing image's release notes / changelog mention a schema change?
2. Did `/healthz` start failing **after** the deploy, or did the **db** part
   fail while `ok:true` stayed true? (Look at the JSON: `"db":"up"` vs
   `"db":"down"` — `db:"down"` is a schema/db problem, not an app problem.)

**If either answer is yes — do not roll back. Forward-fix instead:**

1. Capture the running db: `docker run --rm -v ipam-data:/data -v "$PWD":/backup
   alpine tar czf "/backup/ipam-$(date -u +%FT%H%MZ).tgz" /data`. Store the
   archive somewhere outside `/srv/ipam`.
2. File a child issue against NUL-221 (or the next migration-tracker issue
   once Compass creates one) describing the schema drift. Reference this
   rollback attempt.
3. Fix forward: write a corrective migration in a follow-up image and ship it.
   Rolling the old image back over a schema it can't read will corrupt the
   db further.

A formal migration tracker (the "NUL-??" link the original NUL-228 spec
referenced) does not exist yet. When Compass files it, link it here and move
this whole section under it.

---

## 6. Cert renewal — sanity check

The cert is managed by the **systemd certbot timer**, which is already
running for `paperclip.thenull.dev` and which NUL-225 added for
`ipam.thenull.dev`. Rollback does not touch the cert, but it's the most
common reason `/healthz` starts failing mysteriously after a host change
(cert expired, host clock drifted, nginx not reloaded after renewal).

```bash
# Is the timer healthy?
sudo systemctl list-timers | grep certbot

# Where do the cert files live? (Read-only — don't edit.)
sudo ls -l /etc/letsencrypt/live/ipam.thenull.dev/
#   expected: fullchain.pem, privkey.pem, cert.pem, chain.pem
#   live symlinks point at /etc/letsencrypt/archive/ipam.thenull.dev/

# Force a dry-run renewal (no-op if cert is fine).
sudo certbot renew --dry-run
```

Cert files in this doc are referenced by absolute paths so an on-call who
doesn't know the layout can `ls` them and see what's there.

---

## 7. If something still looks broken

| Symptom after a successful rollback              | First thing to check                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| `/healthz` 200 but UI is broken                  | Browser cache / hard refresh. The Hono bundle hash may have changed.          |
| `curl http://127.0.0.1:8788/healthz` works but the public URL 502s | nginx upstream not reloaded (`sudo nginx -t && sudo systemctl reload nginx`). |
| `docker compose ps` shows `Restarting`           | Healthcheck failing — `docker logs ipam-ipam-1 --tail 200` for the cause.     |
| `crane ls ghcr.io/thenulldev/ipam` 401s          | Token expired; `docker logout ghcr.io && docker login ghcr.io` with a fresh PAT. |
| `gh workflow run` says "workflow not found"      | NUL-226 hasn't merged yet. Use Path B.                                        |
| `ssh paperclip@ipam.thenull.dev` permission denied | The locked-down deploy key from NUL-225 step 8 doesn't include your pubkey. Page Relay. |

If none of those match, page the on-call and include the output of:

```bash
ssh paperclip@ipam.thenull.dev \
  'echo "=== docker ==="; docker ps -a; \
   echo "=== compose ==="; cd /srv/ipam && docker compose ps; \
   echo "=== healthz ==="; curl -fsS 127.0.0.1:8788/healthz; \
   echo "=== nginx ==="; sudo nginx -T 2>/dev/null | grep -A20 ipam.thenull.dev; \
   echo "=== last 50 log lines ==="; docker logs ipam-ipam-1 --tail 50'
```

---

## Appendix A — what runs where

| Path                                                | What it is                                              |
| --------------------------------------------------- | ------------------------------------------------------- |
| `/srv/ipam/docker-compose.yml`                      | Compose file copied from the repo at deploy time.       |
| `/srv/ipam/.env`                                    | `IPAM_HOST_PORT=8788`, `IPAM_SESSION_SECRET=…`, mode 0600. |
| `/srv/ipam/deploy.sh`                               | `bash deploy.sh <sha>` — pull, up, healthcheck gate.    |
| `/etc/nginx/sites-available/ipam`                   | nginx vhost, proxies `127.0.0.1:8788`.                  |
| `/etc/nginx/sites-enabled/ipam`                     | symlink to the above.                                   |
| `/etc/letsencrypt/live/ipam.thenull.dev/`           | cert files (fullchain.pem, privkey.pem).                |
| `ghcr.io/thenulldev/ipam:sha-<sha>`                 | Pinned image per deploy.                                |
| `ghcr.io/thenulldev/ipam:latest`                    | Tag for the most recent `main` push (do not pin to this). |
| `.github/workflows/deploy.yml`                      | Deploy workflow; `workflow_dispatch` accepts `sha`.     |

## Appendix B — env vars the deploy script honours

| Var                  | Default             | Set by                          | Effect                                          |
| -------------------- | ------------------- | ------------------------------- | ----------------------------------------------- |
| `IPAM_PINNED_TAG`    | `latest`            | `deploy.sh <sha>` arg           | Image tag pulled and run.                       |
| `IPAM_HOST_PORT`     | `8787` (compose)    | `/srv/ipam/.env` → `8788` here  | Host port bound. Do **not** change during rollback. |
| `IPAM_SESSION_SECRET`| required            | `/srv/ipam/.env`                | Cookie HMAC. Survives rollback unchanged.       |

Rolling back never requires touching `IPAM_SESSION_SECRET` — doing so will
invalidate every active session.

---

*Owner: Quill (Documentation Lead). Parent: NUL-221. Block-class siblings
referenced: NUL-225 (Relay, on-host infra), NUL-226 (Forge, deploy.yml). If
this doc drifts from reality after NUL-225 or NUL-226 ship, patch in place
and link the diff in the parent issue.*
