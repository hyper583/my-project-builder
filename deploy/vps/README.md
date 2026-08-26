# Deploying to a VPS

Written for a Hostinger VPS, but nothing here is Hostinger-specific — any
Ubuntu 22.04 or 24.04 server works.

## Why a VPS and not shared hosting

Two reasons, and the second is the one that decides it.

**The build.** Next.js 16 compiles with a native binary that needs glibc 2.29,
which arrived with Ubuntu 19.04. Shared hosting is typically CentOS-derived and
years behind, so the build fails with:

```
/lib64/libm.so.6: version `GLIBC_2.29' not found
```

Next then falls back to a WebAssembly compiler, which cannot load
`next.config.ts`, and the build dies on a module it cannot find. None of that
is fixable in this repository.

**The worker.** This application runs *two* processes: the Next server, and a
generation worker that claims jobs from the database. Shared hosting will not
keep a second long-lived process alive. Without it, jobs queue and are never
claimed — every project sits at "Generating" forever, and **nothing reports an
error, because nothing failed.** It simply is not running.

Even a working build leaves you there, which is why the build error is not the
real problem.

## Before you start

You need:

- A VPS running Ubuntu 22.04 or 24.04, with root or sudo
- A domain pointed at its IP (an A record), if you want HTTPS — and you do
- Your Supabase database URLs, an Anthropic API key, and a Paystack secret key

## 1. Node and nginx

```bash
sudo apt update && sudo apt install -y curl git nginx
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node --version    # expect v24.x
```

Node 24 matches `.node-version` and what the project is developed against.

## 2. A user that is not root

```bash
sudo adduser --system --group --home /srv/my-project-builder mpb
sudo mkdir -p /srv/my-project-builder
sudo chown -R mpb:mpb /srv/my-project-builder
```

The services run as `mpb`. Nothing in this application needs root, and a
process that handles payments and student work should not have it.

## 3. The code

```bash
sudo -u mpb git clone https://github.com/hyper583/my-project-builder.git /srv/my-project-builder
```

## 4. The environment

```bash
sudo cp .env.example /etc/my-project-builder.env
sudo chown root:mpb /etc/my-project-builder.env
sudo chmod 640 /etc/my-project-builder.env
sudo nano /etc/my-project-builder.env
```

Outside the repository, because it holds the Paystack secret key — the one value
that both authorises API calls and signs webhooks, so a leak is not "someone can
read your transactions", it is "someone can forge a payment".

`root:mpb` and `640`, not `600`. systemd reads it as root before dropping to
`User=mpb`, so the services would work either way — but the build in the next
step runs *as* `mpb` and needs to read it too. At `600` that step fails with
permission denied. No other user on the machine can read it at `640`.

Values that must be right:

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `BETTER_AUTH_URL` | Your public **https** URL. Reset links, verification links and Paystack callbacks are all built from it. |
| `DATABASE_URL` / `DIRECT_URL` | From Supabase. `DIRECT_URL` is the non-pooled one; migrations fail through pgBouncer. |
| `EMAIL_DRIVER` | `resend`. Production **refuses to start** on `console`, because it prints mail and reports success. |
| `STORAGE_DRIVER` | `supabase`, unless you have deliberately set `STORAGE_LOCAL_PERSISTENT=true`. |
| `AI_PROVIDER` | `anthropic`, with `ANTHROPIC_API_KEY`. |

## 5. Build it once by hand

```bash
cd /srv/my-project-builder
sudo -u mpb bash -c '
  set -a; . /etc/my-project-builder.env; set +a
  npm ci --include=dev && npx prisma generate && npx prisma migrate deploy && npm run build
'
```

`set -a` then sourcing the file, rather than piping it through `xargs`. Values
here contain spaces and punctuation — `EMAIL_FROM` is documented as
`My Project Builder <hello@example.com>`, and a database password can hold
anything — and `xargs` splits on whitespace while the shell reads `<` as a
redirect. Sourcing respects the quoting the file already has.

`--include=dev` is not optional. `NODE_ENV=production` makes npm omit
devDependencies, and six of them are needed: `tailwindcss` and
`@tailwindcss/postcss` to compile the stylesheet, and **`tsx`, which is what
starts the worker**. Omit it and the build succeeds while the worker fails on
every boot.

## 6. The services

```bash
sudo cp deploy/vps/mpb-web.service deploy/vps/mpb-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mpb-web mpb-worker
systemctl status mpb-web mpb-worker
```

## 7. nginx and TLS

```bash
sudo cp deploy/vps/nginx.conf /etc/nginx/sites-available/my-project-builder
sudo sed -i 's/your-domain/YOUR ACTUAL DOMAIN/' /etc/nginx/sites-available/my-project-builder
sudo ln -s /etc/nginx/sites-available/my-project-builder /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR-DOMAIN
```

Do TLS **before** setting `BETTER_AUTH_URL` to `https://`, or every reset link
and payment callback points at a URL that redirects mid-flow.

## 8. Prove it works

Three things, none of which prove themselves.

```bash
# The worker is alive and polling.
journalctl -u mpb-worker -f

# Mail actually leaves the building. Every screen says "check your inbox"
# whether or not anything was sent.
npm run email:test -- you@example.com
```

Then in the browser: register, generate a project, and watch the progress panel
move. If it never moves, the worker is not claiming — check its journal first.

## 9. The webhook

In the Paystack dashboard, set the webhook URL to:

```
https://YOUR-DOMAIN/api/webhooks/paystack
```

This will be the first time it has ever fired. Paystack cannot reach a
development machine, so until now every payment has been completed by the
return page instead. Make one test payment and confirm a pass appears.

## Deploying again

```bash
cd /srv/my-project-builder && ./deploy/vps/deploy.sh
```

It fetches, installs, migrates, builds, restarts both services, and **checks
that both came back** — the worker is the half that fails quietly.

## When something is wrong

| Symptom | Look here |
|---|---|
| Site down | `journalctl -u mpb-web -n 50` |
| Projects stuck at "Generating" | `systemctl status mpb-worker` — almost always this |
| Worker restart-looping | Usually `tsx` missing: rebuild with `npm ci --include=dev` |
| Refuses to start at all | Read the error. Production refuses development drivers deliberately, and the message names what to set. |
| Progress panel frozen | `proxy_buffering off` missing from the nginx config |
| Email never arrives | `npm run email:test`, then the Resend dashboard's Emails tab |
