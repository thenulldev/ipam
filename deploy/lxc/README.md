# Running IPAM inside an LXC container

LXC containers share the host kernel, which means a few systemd primitives
behave differently than on a full VM — and SQLite-on-host-storage is the
common trap. This file is the short list.

## TL;DR

```bash
# 1. On the LXC host: create an Ubuntu 22.04 (or 24.04) privileged container.
lxc launch ubuntu:22.04 ipam
lxc config set ipam security.privileged=true   # optional; default works too

# 2. Attach and run the standard systemd installer.
lxc exec ipam -- bash -c "$(curl -fsSL https://raw.githubusercontent.com/your-org/ipam/main/scripts/install-systemd.sh)"
lxc exec ipam -- sudo /opt/ipam/scripts/install-systemd.sh

# 3. Map a host port so the IPAM UI is reachable.
lxc config device add ipam ipam8787 proxy listen=tcp:0.0.0.0:8787 connect=tcp:127.0.0.1:8787
```

The container runs the same `ipam.service` unit as a plain Linux VM (see
[`../systemd/ipam.service`](../systemd/ipam.service)). Nothing IPAM-specific
about the LXC layer — it just needs the right mount and a few config keys.

## Mount the data dir from the host (recommended)

The SQLite db lives in the container's `/var/lib/ipam`. For a container
you actually trust to survive upgrades, **mount that path from the host**
so backups are ordinary file copies:

```bash
# On the host:
mkdir -p /srv/lxc/ipam
lxc config device add ipam data disk source=/srv/lxc/ipam path=/var/lib/ipam
lxc restart ipam
```

Then `install-systemd.sh` (or its `--update` form) keeps working without
modification.

## Things that *can* break under LXC — and the fix

| Symptom                                                                                  | Cause                                                                                                   | Fix                                                                                                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `systemctl` returns `Failed to connect to bus`                                           | Container was launched without a systemd init (`--dist ubuntu` works; `dist: alpine` won't).            | Use an Ubuntu 22.04+ image and `lxc exec ipam -- sudo systemctl ...`.                                          |
| `/healthz` returns 503 with `error: "SQLite: unable to open database file"`             | AppArmor profile on the host is blocking `mknod`/file creation inside the container's data dir.        | `lxc config set ipam security.nesting=true security.protection.nesting=true` (only if you trust the workload). |
| SQLite reports `database is locked` under load                                          | Two competing writers — usually the host-side backup (`rsync`) running while the server is writing.     | Use `sqlite3 .backup` instead of `rsync`; the project ships `npm run backup` which does exactly that.          |
| `ReadWritePaths=/var/lib/ipam` in the unit gets ignored                                 | `ProtectSystem=strict` is on, but `/var/lib/ipam` isn't an absolute path inside the container.        | It is — confirm the path inside the container with `lxc exec ipam -- stat /var/lib/ipam`.                     |
| Service restarts whenever the container is rebooted from the host                        | Expected — systemd inside the container is restarted along with the container.                          | Disable with `lxc config set ipam boot.autostart=false` if you want manual control.                            |

## Networking

The Hono server binds to `::1` by default. Inside the container that's
fine — `lxc exec ipam -- curl http://127.0.0.1:8787/healthz` works out of
the box. To make the UI reachable from outside:

```bash
# Either a host-side proxy device (recommended):
lxc config device add ipam ipam8787 proxy \
  listen=tcp:0.0.0.0:8787 connect=tcp:127.0.0.1:8787

# Or flip the bind inside the unit:
sudo sed -i 's|^# HOST=|HOST=0.0.0.0|' /etc/ipam/ipam.env
sudo systemctl restart ipam
```

If you go with `HOST=0.0.0.0`, put IPAM behind a reverse proxy (nginx,
Caddy) that terminates TLS — exposing the Hono server directly on the
LAN is fine for a home lab but not for anything else.

## Backup

Inside the container:

```bash
lxc exec ipam -- sudo -u ipam npm run backup
lxc exec ipam -- sudo -u ipam ls /var/lib/ipam/backups
```

Or from the host if you mounted `/var/lib/ipam` from the host (see top
of this file):

```bash
ls /srv/lxc/ipam/backups
```