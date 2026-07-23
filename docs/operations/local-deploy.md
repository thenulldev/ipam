# Running IPAM locally — LXC, Linux VM, or Docker

There are three supported ways to run the IPAM server outside of `npm run
dev`. Pick the one that matches your host:

| Path                                      | Best when…                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **systemd unit on a Linux VM or host**    | You control the host OS and want a real service with logs in journald, persistent state under `/var/lib/ipam`, and standard `systemctl` semantics. |
| **LXC container**                         | You want isolated networking/filesystem without a hypervisor. The container runs the *same* systemd unit as a bare VM. |
| **Docker (named volume or bind mount)**   | You already have a Docker host (Docker Desktop, Linux server, Synology NAS, etc.) and want the smallest setup. |

All three paths run the same compiled artifact: `node server-build/server/index.js`.
They differ only in how the binary gets onto disk, how the process is supervised,
and where the SQLite db lives.

## Pick one

```bash
# 1. Bare Linux / Linux VM (Ubuntu 22.04+ or similar with systemd)
sudo ./scripts/install-systemd.sh

# 2. LXC container (run on the host first to create the container)
lxc launch ubuntu:22.04 ipam
lxc exec ipam -- bash
# inside the container:
apt-get update && apt-get install -y git nodejs npm
git clone <repo-url> /opt/ipam-src && cd /opt/ipam-src
./scripts/install-systemd.sh

# 3. Docker
docker compose up -d
docker compose ps                     # wait for "(healthy)"
npm run smoke                         # optional: scripts/smoke.ts
```

Each path lands the UI on `http://<host>:8787` and an unauthenticated
`/healthz` on the same port.

## What the systemd installer actually does

`scripts/install-systemd.sh` is a single-shot bootstrap. It is intentionally
opinionated — every step it skips is one the operator can run by hand.

1. Creates the `ipam` system user (no login, no home).
2. Provisions `/opt/ipam` (release tree) and `/var/lib/ipam` (data).
3. Generates a 64-char hex `IPAM_SESSION_SECRET` and writes it to
   `/etc/ipam/ipam.env` (root:`ipam` 0640).
4. Drops the unit at `/etc/systemd/system/ipam.service` (see
   [`../deploy/systemd/ipam.service`](../../deploy/systemd/ipam.service)).
5. Runs `npm ci --omit=dev && npm run build:all` inside `/opt/ipam`.
6. `systemctl enable --now ipam`.
7. Polls `/healthz` for 30s; fails loud if it never goes green.

Updates: re-run the script with `--update` (git pull + rebuild + restart
in one command). Use `--remove` to uninstall (data preserved) or `--purge`
to also wipe `/var/lib/ipam`.

## Smoke-testing

Each path is verifiable the same way:

```bash
curl -fsS http://127.0.0.1:8787/healthz | jq .
#   { "ok": true, "db": "up", "seedCounts": { ... } }

# End-to-end (login + walk): from the repo root
npm run smoke                # uses scripts/smoke.ts; hits $IPAM_BASE_URL (default http://localhost:8787)
```

## What's persisted where

| Path                        | Contents                                                                                   | Survives container / VM reboot? |
| --------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------- |
| `/var/lib/ipam/ipam.db`     | SQLite database                                                                            | Yes                             |
| `/var/lib/ipam/uploads/`    | Uploaded floorplan / rack images                                                           | Yes                             |
| `/var/lib/ipam/backups/`    | Output of `npm run backup`                                                                | Yes                             |
| `/etc/ipam/ipam.env`        | `IPAM_SESSION_SECRET` and the rest of the env file                                         | Yes                             |
| `/opt/ipam/`                | Release tree — code, `dist/`, `server-build/`, `node_modules/`                             | Reinstall to refresh            |

In the Docker image the same tree is at `/data`, and the `ipam-data`
named volume (or `./data` bind mount) preserves it across `docker compose
up -d` cycles.

## Hardening notes

- The systemd unit runs `ProtectSystem=strict`, `ProtectHome=true`,
  `NoNewPrivileges=true`, and `ReadWritePaths=/var/lib/ipam /opt/ipam/data`.
  Don't loosen those without a reason — they're why a compromised Node
  process can't reach `/etc/shadow`.
- The Hono server binds to `::1` by default. For LAN access, set
  `HOST=0.0.0.0` in `/etc/ipam/ipam.env` *and* put it behind a reverse
  proxy that terminates TLS.
- Session secrets shorter than 16 chars trigger a dev-fallback warning
  in the server logs — the install script refuses to start with the
  placeholder value, so this only ever happens if you hand-edit the env
  file to something weak. Don't.

## Troubleshooting

| Symptom                                                                | First thing to check                                                                                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `curl http://127.0.0.1:8787/healthz` returns connection refused        | Is the service actually running? `systemctl status ipam` (Linux) / `docker compose ps` (Docker) / `lxc exec ipam -- systemctl status ipam` (LXC). |
| `/healthz` returns 503 with `error: "..."`                            | SQLite can't open the db — usually a permission problem on `/var/lib/ipam` or the bind mount. `ls -la /var/lib/ipam`.        |
| Container restarts every ~30s                                         | `journalctl -u ipam -n 100` — the seeded default password warning doesn't cause a crash; check for stack traces instead.   |
| UI loads but every API call returns 401                               | The session secret rotated. Re-login; or check that `IPAM_SESSION_SECRET` matches between the build that produced the cookie and the running server. |
| Upgrades break — old cookies invalid                                   | Expected after a secret rotation. Don't roll secrets mid-session.                                                              |

See also:

- [`../deploy/systemd/ipam.service`](../../deploy/systemd/ipam.service) — the unit file
- [`../deploy/systemd/ipam.env.example`](../../deploy/systemd/ipam.env.example) — env template
- [`../deploy/lxc/README.md`](../../deploy/lxc/README.md) — LXC-specific gotchas
- [`../../docker-compose.yml`](../../docker-compose.yml) and [`../../Dockerfile`](../../Dockerfile) — Docker
- [`../../scripts/install-systemd.sh`](../../scripts/install-systemd.sh) — the bootstrap script