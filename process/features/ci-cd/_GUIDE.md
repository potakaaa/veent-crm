# CI/CD — Feature Guide

Status: implemented (pipeline files added 29-06-26). First live deploy is manual-verify.

## What exists

| File | Purpose |
|---|---|
| `.github/workflows/ci.yml` | Runs on every PR and push: `lint → check → unit → build → e2e`. |
| `.github/workflows/deploy.yml` | Runs only on push to `main`: build image → push to GHCR → SSH to droplet → pull → migrate → restart. |
| `docker-compose.prod.yml` | Production override of `docker-compose.yml`; uses the published GHCR image instead of building locally. |

## Required GitHub Actions secrets

Set under repo **Settings → Secrets and variables → Actions**:

| Secret | Purpose | Source |
|---|---|---|
| `GITHUB_TOKEN` | GHCR push auth | Auto-provided by GitHub — do NOT create manually. Requires `permissions: packages: write` in the deploy job (already set). |
| `DROPLET_HOST` | Droplet IP / hostname for SSH | Manual |
| `DROPLET_USER` | SSH username on the droplet | Manual |
| `DROPLET_SSH_KEY` | Private SSH key (PEM) for the droplet user | Manual |

## Droplet requirements

- **Docker Compose v2.24+** — required for the `build: !reset null` YAML tag in `docker-compose.prod.yml`. Older Compose silently mishandles `!reset`, leaving an inherited `build:` in the merged config; a failed GHCR pull could then trigger a source build the droplet cannot perform (no source checked out on the droplet). Verify with `docker compose version`.
- **docker compose v2 CLI** (the `docker compose` subcommand, not the legacy `docker-compose` binary).

## Deploy directory on the droplet

`/srv/veent-crm` — must contain all three of:

- `docker-compose.yml` (base)
- `docker-compose.prod.yml` (override)
- `.env` (secrets: `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `SENTRY_DSN`, `REMINDERS_ENDPOINT_SECRET`, `INGEST_SECRET`)

The `deploy.yml` SSH step `cd`s into this path. If you deploy elsewhere, update the `cd` line in `.github/workflows/deploy.yml`.

## Using the prod override on the droplet

```bash
cd /srv/veent-crm
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull app
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm app bun run db:migrate
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker image prune -f
```

Order is fixed: **pull → migrate → up -d** (migrate against the new image before swapping the running container; if migrate fails, the old container keeps running). The `deploy.yml` SSH step runs exactly this.

To roll back: re-run `up -d` after re-tagging or pulling a prior `ghcr.io/potakaaa/veent-crm:<git-sha>` tag.

## Known gaps

- **E2E known-gap:** no `*.e2e.ts` specs exist yet. The CI E2E step uses `bunx playwright test --pass-with-no-tests` so the pipeline stays green until specs are written. Playwright's `webServer` (`build && preview`) still starts in CI; add specs under `**/*.e2e.{ts,js}` to exercise real flows.
- **Lint gate (CI `Lint` step):** `bun run lint` = `prettier --check . && eslint .`. After `bun run format`, Prettier is clean, but **ESLint currently reports errors** — 222 `no-require-imports` in committed agent-harness `.cjs` files (`.claude/`, `.codex/`) plus ~25 in mock `src/routes/*` pages (`svelte/require-each-key`, `svelte/no-navigation-without-resolve`). Until these are resolved (eslint ignore for tooling dirs + key/resolve fixes, or rule downgrade), the CI `Lint` step is RED. See the EXECUTE deviation note in the plan/report. This was not anticipated by the plan (which measured only Prettier).
- **Caddy TLS:** `Caddyfile` has a placeholder domain; deploy succeeds but TLS won't complete until a real domain is set.
- First live deploy (GHCR push auth, SSH reachability, migration against real Postgres) is unverified without secrets + a live droplet — verify manually on first run.
</content>
</invoke>
