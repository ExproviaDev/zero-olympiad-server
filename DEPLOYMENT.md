# CI/CD — Deployment Guide

Every push to `main` triggers the pipeline in `.github/workflows/deploy.yml`:

1. **Vercel** — production deploy (`zero-frontend` project).
2. **VPS** — only runs **after** Vercel succeeds (`needs: vercel`). SSHes into the
   Hostinger VPS, `git pull`, install, build, and restart with PM2.

Backend repo (`zero-backend`) has the same two-stage flow.

---

## 1. GitHub secrets (set in each repo → Settings → Secrets and variables → Actions)

| Secret          | Value                                                            |
| --------------- | --------------------------------------------------------------- |
| `VERCEL_TOKEN`  | Vercel token — https://vercel.com/account/tokens                |
| `VPS_HOST`      | `93.127.185.95`                                                 |
| `VPS_USER`      | `root`                                                          |
| `VPS_PASSWORD`  | The VPS root password                                           |

> Add the same set to **both** the `zero-frontend` and `zero-backend` repos.
> Auth uses **username + password** (no SSH key needed).

---

## 2. One-time VPS bootstrap (run once over SSH)

The pipeline assumes the repos are already cloned in the home directory and PM2 is installed.

```bash
ssh root@93.127.185.95

# tools (skip any already installed)
npm install -g pm2

# --- Frontend ---  (lives at ~/zero-frontend)
cd ~
git clone <ZERO_FRONTEND_REPO_URL> zero-frontend
cd zero-frontend
npm ci || npm install
npm run build
PORT=3001 pm2 start npm --name zero-frontend -- start   # Next.js on port 3001
pm2 save

# --- Backend ---  (lives at ~/zero-backend)
cd ~
git clone <ZERO_BACKEND_REPO_URL> zero-backend
cd zero-backend
# Create the production .env here ONCE (it is .gitignored, so deploys never overwrite it)
nano .env
npm ci --omit=dev || npm install --omit=dev
PORT=5000 pm2 start server.js --name zero-backend       # Express on port 5000
pm2 save

# make PM2 survive reboots
pm2 startup
```

> If the GitHub repos are **private**, give the VPS read access too — add a
> deploy key to each repo or clone over HTTPS with a token, so `git pull` works.

---

## 3. nginx (recommended — put both apps behind a domain/port 80/443)

Example reverse proxy:

```nginx
# frontend  -> http://127.0.0.1:3001
# backend   -> http://127.0.0.1:5000
location /        { proxy_pass http://127.0.0.1:3001; }
location /api/    { proxy_pass http://127.0.0.1:5000; }
```

---

## Troubleshooting

### Auth fails / `ssh: handshake failed`
- Confirm `VPS_PASSWORD` is the correct root password (no trailing spaces/newline).
- The VPS sshd must allow password login. Check `/etc/ssh/sshd_config`:
  `PasswordAuthentication yes`, then `systemctl restart ssh`.

### `dial tcp ***:22: i/o timeout`
The runner can't reach the VPS on port 22. Check, on the VPS:

```bash
systemctl status ssh          # is sshd running?
ufw status                    # if active, allow SSH:
ufw allow 22/tcp
```

Also in the **Hostinger panel → VPS → Firewall**, make sure inbound TCP **22**
is allowed (GitHub runner IPs are dynamic, so allow from any source `0.0.0.0/0`).
Confirm `VPS_HOST` is exactly `93.127.185.95`. Test locally:

```bash
ssh root@93.127.185.95
```

## Notes

- Vercel env vars (API URLs, keys) are configured in the **Vercel dashboard**, not here.
- The VPS backend `.env` lives on the server and is never touched by `git pull`.
- Want VPS-only (skip Vercel)? Delete the `vercel` job and the `needs: vercel` line.
