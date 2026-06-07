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
| `VPS_SSH_KEY`   | The **private** key (full text, incl. BEGIN/END lines)          |

> Add the same set to **both** the `zero-frontend` and `zero-backend` repos.

---

## 2. Create the SSH key for GitHub → VPS

On your local machine:

```bash
ssh-keygen -t ed25519 -C "github-actions" -f deploy_key -N ""
```

- Put the contents of **`deploy_key`** (private) into the `VPS_SSH_KEY` secret.
- Add **`deploy_key.pub`** (public) to the VPS:

```bash
ssh root@93.127.185.95 "mkdir -p ~/.ssh && echo 'PASTE_deploy_key.pub_HERE' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

---

## 3. One-time VPS bootstrap (run once over SSH)

The pipeline assumes the repos are already cloned and PM2 is installed.

```bash
ssh root@93.127.185.95

# tools (skip any already installed)
npm install -g pm2

# --- Frontend ---
mkdir -p /var/www && cd /var/www
git clone <ZERO_FRONTEND_REPO_URL> zero-frontend
cd zero-frontend
npm ci || npm install
npm run build
PORT=3001 pm2 start npm --name zero-frontend -- start   # Next.js on port 3001
pm2 save

# --- Backend ---
cd /var/www
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

## 4. nginx (recommended — put both apps behind a domain/port 80/443)

Example reverse proxy:

```nginx
# frontend  -> http://127.0.0.1:3001
# backend   -> http://127.0.0.1:5000
location /        { proxy_pass http://127.0.0.1:3001; }
location /api/    { proxy_pass http://127.0.0.1:5000; }
```

---

## Troubleshooting

### `ssh: this private key is passphrase protected`
The key in `VPS_SSH_KEY` has a passphrase — `drone-ssh` cannot unlock it.
Regenerate **without** a passphrase (note `-N ""`) and replace the secret:

```bash
ssh-keygen -t ed25519 -C "github-actions" -f deploy_key -N ""
```

- `VPS_SSH_KEY` = full contents of `deploy_key` (private, incl. BEGIN/END).
- Append `deploy_key.pub` to the VPS `~/.ssh/authorized_keys`.

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
ssh -i deploy_key root@93.127.185.95
```

## Notes

- Vercel env vars (API URLs, keys) are configured in the **Vercel dashboard**, not here.
- The VPS backend `.env` lives on the server and is never touched by `git pull`.
- Want VPS-only (skip Vercel)? Delete the `vercel` job and the `needs: vercel` line.
