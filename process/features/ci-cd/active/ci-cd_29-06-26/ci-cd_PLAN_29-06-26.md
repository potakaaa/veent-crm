---
name: plan:ci-cd
description: GitHub Actions CI/CD pipeline (CI on PRs/pushes + GHCR build & SSH deploy on main) for veent-crm
date: 29-06-26
feature: ci-cd
---

# CI/CD Pipeline — Implementation Plan (SIMPLE)

**Date**: 29-06-26  
**Status**: ACTIVE — VALIDATED (CONDITIONAL)  
**Complexity**: SIMPLE

**TL;DR:** Add three files — `.github/workflows/ci.yml` (lint/check/unit/build/e2e on every PR and push), `.github/workflows/deploy.yml` (build Docker image → push to GHCR → SSH to droplet → migrate → restart on push to `main`), and `docker-compose.prod.yml` (registry-image override of the dev compose). One session, no source-code behavior change, all design decisions resolved in RESEARCH.

## Overview

veent-crm currently has no automation. Every PR should run the full quality suite, and every merge to `main` should ship a freshly built image to the single DigitalOcean droplet. The pipeline is GitHub Actions (GitHub-hosted repo), images live in GHCR, deploy is a pull-based SSH step on the droplet using a production compose override that references the published image instead of building locally.

## Goals

1. CI runs on all PRs and pushes: `lint → check → unit → build → e2e` (e2e passes with no specs yet).
2. Deploy runs only on push/merge to `main`: build image, push `:latest` + `:<git-sha>` to GHCR, SSH to droplet, pull, migrate, restart.
3. Production compose override (`docker-compose.prod.yml`) uses `image:` from GHCR (dev `docker-compose.yml` keeps `build: .`).
4. Document the four required GitHub secrets and the known e2e gap.

## Scope

**In scope:** the three files listed below, one optional `package.json` CI script, a repo-wide `prettier --write` formatting pass to make the lint gate green, and a documentation note on secrets.
**Out of scope:** staging environment, real TLS domain in `Caddyfile`, syncing droplet `.env` from CI, writing e2e specs.

## Touchpoints

| Path                             | Action          | Notes                                                                                                        |
| -------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| `.github/workflows/ci.yml`       | create          | CI pipeline                                                                                                  |
| `.github/workflows/deploy.yml`   | create          | Build + push + deploy pipeline                                                                               |
| `docker-compose.prod.yml`        | create          | Production override using GHCR `image:` (`build: !reset null` to drop inherited build)                       |
| `package.json`                   | edit (optional) | Add `test:unit:ci` script = `vitest --run`                                                                   |
| (repo-wide)                      | format          | `bun run format` — current repo FAILS `bun run lint` (384 Prettier issues); CI Lint step is red without this |
| `process/context/all-context.md` | read-only       | Stack reference                                                                                              |

## Public Contracts

- **GHCR image:** `ghcr.io/potakaaa/veent-crm` tagged `:latest` and `:<git-sha>` on every `main` push. Consumed by `docker-compose.prod.yml` on the droplet. (Image name confirmed to match git remote `potakaaa/veent-crm`.)
- **Required GitHub Actions secrets** (repo Settings → Secrets and variables → Actions):
  | Secret | Purpose | Source |
  |---|---|---|
  | `GITHUB_TOKEN` | GHCR push auth | auto-provided; needs `permissions: packages: write` in deploy job |
  | `DROPLET_HOST` | droplet IP/hostname | manual |
  | `DROPLET_USER` | SSH user | manual |
  | `DROPLET_SSH_KEY` | private SSH key | manual |
- **Trigger contract:** PRs → CI only (no deploy). Push to `main` → CI + deploy.

## File Content Requirements

### 1. `.github/workflows/ci.yml`

- **name:** `CI`
- **on:** `pull_request` (all branches) and `push` (all branches). Deploy gating lives in `deploy.yml`, so CI runs everywhere.
- **permissions:** `contents: read`
- **One job `quality`** on `ubuntu-latest`:
  1. step `Checkout` → `actions/checkout@v4`
  2. step `Setup Bun` → `oven-sh/setup-bun@v2` with `bun-version: latest`
  3. step `Install deps` → `bun install --frozen-lockfile`
  4. step `Lint` → `bun run lint` (PRECONDITION: repo must be Prettier-clean — see checklist item 0; currently 384 files fail)
  5. step `Type check` → `bun run check` (script already runs `svelte-kit sync` first)
  6. step `Unit tests` → `bun run test:unit -- --run` (MANDATORY `--run` flag — `test:unit` is bare `vitest` and hangs in watch mode otherwise)
  7. step `Build` → `bun run build`
  8. step `Cache Playwright browsers` → `actions/cache@v4`, path `~/.cache/ms-playwright`, key includes Playwright version (e.g. hash of `bun.lock` or the `@playwright/test` version)
  9. step `Install Playwright browsers` → `bunx playwright install --with-deps chromium`
  10. step `E2E tests` → `bunx playwright test --pass-with-no-tests` (known-gap: no `*.e2e.ts` specs exist yet; flag confirmed supported and keeps the job green)

### 2. `.github/workflows/deploy.yml`

- **name:** `Deploy`
- **on:** `push` to branch `main` only
- **permissions:** `contents: read`, `packages: write`
- **One job `build-and-deploy`** on `ubuntu-latest`:
  1. step `Checkout` → `actions/checkout@v4`
  2. step `Log in to GHCR` → `docker/login-action@v3` with `registry: ghcr.io`, `username: ${{ github.actor }}`, `password: ${{ secrets.GITHUB_TOKEN }}`
  3. step `Set up Docker Buildx` → `docker/setup-buildx-action@v3`
  4. step `Build and push` → `docker/build-push-action@v6` with `push: true`, tags `ghcr.io/potakaaa/veent-crm:latest` and `ghcr.io/potakaaa/veent-crm:${{ github.sha }}`
  5. step `Deploy over SSH` → `appleboy/ssh-action@v1` with `host: ${{ secrets.DROPLET_HOST }}`, `username: ${{ secrets.DROPLET_USER }}`, `key: ${{ secrets.DROPLET_SSH_KEY }}`, running this script on the droplet (in the deploy directory holding `docker-compose.yml` + `docker-compose.prod.yml` + `.env`):
     ```
     cd /path/to/veent-crm        # droplet deploy dir (document actual path on server)
     docker compose -f docker-compose.yml -f docker-compose.prod.yml pull app
     docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm app bun run db:migrate
     docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
     docker image prune -f
     ```
     Order is fixed: **pull → migrate → up -d** (migrate against the new image before swapping the running container).

### 3. `docker-compose.prod.yml`

- Override file layered on top of `docker-compose.yml` (`-f docker-compose.yml -f docker-compose.prod.yml`).
- Single `services.app` block that sets `image: ghcr.io/potakaaa/veent-crm:latest` **AND** `build: !reset null`.
  - **Why `!reset`:** Compose multi-file merge ADDS keys; it cannot DELETE an inherited key. Adding only `image:` leaves the base `build: .` in the merged config (VERIFIED: merged config retains `app.build` with context + Dockerfile). The `!reset null` YAML tag (Compose Spec, **requires Docker Compose v2.24+**) explicitly drops the inherited `build:` so the merged config has `image:` only (VERIFIED: `app.build` count 0 after `!reset`).
  - Without `!reset`, the merged service carries both `build` and `image`; if the GHCR pull ever fails or someone runs `up --build`, Compose falls back to building from source — which the droplet deploy dir does NOT contain. `!reset` removes this latent failure mode and is required to satisfy Acceptance Criterion #6.
- The override does not need to repeat env/depends_on (inherited from the base file).
- No changes to `db` or `caddy` services (they already use registry images in the base file).

## Blast Radius

- **New files:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `docker-compose.prod.yml` (3 new, no existing behavior touched).
- **Optional edit:** `package.json` — add `"test:unit:ci": "vitest --run"` (1 line, no dependency change). CI can equally use `bun run test:unit -- --run` without this script; the script is a convenience only.
- **Formatting pass:** `bun run format` rewrites code style across the repo (no behavior change) so `bun run lint` exits 0. Large diff, fully reversible, mechanical.
- **Risk class:** deploy/runtime/CI surface (no auth, schema, billing, or API-contract change in this plan). The migration step runs `drizzle-kit migrate` on the droplet — destructive only if migration files are destructive, which is out of scope here.
- **Reversibility:** fully reversible — deleting the three files removes all automation; no source or schema change.

## Verification Evidence

| Gate / Scenario                                                                                                         | Strategy        | Proves SPEC criterion                                                                                             | Current repo state (measured 29-06-26)                                                |
| ----------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `bun run lint` exits 0                                                                                                  | Fully-Automated | Repo passes the same lint gate CI runs                                                                            | **FAILS now** (384 Prettier issues) — must run `bun run format` first                 |
| `bun run check` exits 0                                                                                                 | Fully-Automated | Type/Svelte check (matches CI `Type check` step)                                                                  | PASS (0 errors, 812 files)                                                            |
| `bun run test:unit -- --run` exits 0 (does NOT hang)                                                                    | Fully-Automated | Unit step is correct and watch-mode hang is avoided                                                               | PASS (4 tests, exited immediately, no hang)                                           |
| `bun run build` exits 0                                                                                                 | Fully-Automated | Build step succeeds in CI                                                                                         | PASS (built in ~1.3s)                                                                 |
| Both workflow YAMLs parse with no errors                                                                                | Fully-Automated | Goal 1 & 2 — valid Actions syntax                                                                                 | N/A until created                                                                     |
| `docker compose -f docker-compose.yml -f docker-compose.prod.yml config` resolves with app `image:` set and no `build:` | Fully-Automated | Goal 3 — prod override is valid and registry-based                                                                | Requires `build: !reset null` (image-only override leaves `build` present — VERIFIED) |
| `appleboy/ssh-action` deploy script order pull→migrate→up -d                                                            | Agent-Probe     | Migration safety ordering (gotcha #8) — judged by reading the workflow                                            | Order correct in plan                                                                 |
| E2E job stays green with zero specs                                                                                     | Hybrid          | Goal 4 known-gap — `--pass-with-no-tests` keeps pipeline green; precondition: Playwright browsers installed in CI | Flag confirmed supported; no `*.e2e.*` specs present                                  |

## Test Infra Improvement Notes

- Repo is not Prettier-clean; the CI Lint gate cannot pass until a `bun run format` baseline is committed. Consider a Prettier pre-commit hook to keep it green going forward (out of scope for this plan).

## Implementation Checklist

0. **(PRECONDITION) Make the repo lint-clean:** run `bun run format`, then confirm `bun run lint` exits 0. Commit the formatting separately from the CI files. Without this, the CI `Lint` step is red on the first push.
1. Create `.github/workflows/ci.yml` per File Content Requirements §1 (name `CI`, triggers `pull_request` + `push`, single `quality` job with the 10 steps; unit step MUST use `-- --run`; e2e step uses `--pass-with-no-tests`; Playwright browser cache keyed on Playwright version).
2. Create `.github/workflows/deploy.yml` per §2 (name `Deploy`, `on: push: branches: [main]`, `permissions: packages: write`, `build-and-deploy` job: checkout → GHCR login → buildx → build-push tags `:latest` + `:${{ github.sha }}` → SSH deploy script pull→migrate→up -d).
3. Create `docker-compose.prod.yml` per §3 (`services.app.image: ghcr.io/potakaaa/veent-crm:latest` AND `build: !reset null`, NOT a bare `image:` add).
4. (Optional) Add `"test:unit:ci": "vitest --run"` to `package.json` scripts.
5. Validate workflow YAML parses: run a YAML lint or `bun run` no-op, plus `actionlint` if available (or visual review against §1/§2).
6. Validate prod override: `docker compose -f docker-compose.yml -f docker-compose.prod.yml config` and confirm `app.image` is set and `app.build` is **absent** (count 0). If `app.build` is still present, the `!reset null` tag is missing or the local Compose is < v2.24.
7. Run the four local test gates (lint AFTER format, check, unit `-- --run`, build) to confirm CI steps pass locally before push.
8. Document the four required GitHub secrets, the droplet deploy-dir path, and the **Docker Compose v2.24+** droplet requirement (for `!reset`) in the feature `_GUIDE.md` or repo README (note the e2e known-gap).

## Acceptance Criteria

- [ ] Repo is Prettier-clean: `bun run lint` exits 0 (formatting pass committed).
- [ ] `ci.yml`, `deploy.yml`, `docker-compose.prod.yml` exist with the exact job/step names above.
- [ ] CI triggers on PRs and pushes; deploy triggers only on push to `main`.
- [ ] Unit step uses `-- --run` (verified: does not hang).
- [ ] E2E step uses `--pass-with-no-tests` and the job is green with no specs.
- [ ] Deploy job has `permissions: packages: write` and pushes `:latest` + `:<git-sha>`.
- [ ] `docker compose ... config` shows `app.image` set, `app.build` absent (via `build: !reset null`).
- [ ] Deploy script order is pull → migrate → up -d.
- [ ] Four secrets + droplet Compose v2.24+ requirement documented.

## Dependencies, Risks, Integration Notes

- **Dependencies:** GitHub repo (`potakaaa/veent-crm`); droplet reachable over SSH with **Docker Compose v2.24+** installed (required for `build: !reset null`) and the deploy dir holding both compose files + `.env`.
- **Risk — repo not lint-clean:** the CI Lint step fails immediately unless `bun run format` is committed first (checklist item 0). MEASURED: 384 files currently fail `prettier --check`.
- **Risk — secrets not set:** deploy job fails fast at GHCR login / SSH if secrets are missing. Mitigation: checklist item 8 documents them; deploy only runs on `main`.
- **Risk — migration failure mid-deploy:** if `db:migrate` fails, the old container keeps running (because `up -d` hasn't run yet) — fail-safe ordering. No rollback automation; manual `docker compose ... up -d` with the prior `:<git-sha>` tag is the recovery path.
- **Risk — Compose < v2.24 on droplet:** `!reset` is silently mishandled by old Compose; the merged config would keep `build:` and a failed pull could trigger a source build that fails (no source on droplet). Mitigation: checklist item 8 documents the version requirement.
- **Gotcha — Caddy TLS:** `Caddyfile` has a placeholder domain; deploy succeeds but TLS won't complete until a real domain is set (out of scope, documented).
- **Backwards compatibility:** dev `docker-compose.yml` is unchanged — local `docker compose up` still builds from source.

## Validate Contract

Status: CONDITIONAL
Date: 29-06-26
date: 2026-06-29
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Signal score 1/7 (only S6 deploy/runtime risk class present). Single SIMPLE plan, 3 net-new files, no inter-agent coordination needed — sequential inline validation.

Test gates (C3 5-column table):

| criterion id    | behavior                                                         | strategy        | proving test                                                                                                    | gap-resolution                                    |
| --------------- | ---------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| AC-lint         | Repo passes Prettier/ESLint so CI Lint step is green             | Fully-Automated | `bun run lint` exits 0 (after `bun run format` committed)                                                       | B — fixed in this plan (checklist item 0)         |
| AC-check        | Type/Svelte check passes (CI Type check step)                    | Fully-Automated | `bun run check` exits 0                                                                                         | A — proven now (PASS, 0 errors)                   |
| AC-unit         | Unit step runs and does NOT hang in watch mode                   | Fully-Automated | `bun run test:unit -- --run` exits 0 immediately                                                                | A — proven now (4 tests, no hang)                 |
| AC-build        | Build step succeeds (CI Build step)                              | Fully-Automated | `bun run build` exits 0                                                                                         | A — proven now (built ~1.3s)                      |
| AC-compose      | Prod override resolves with app.image set and app.build absent   | Fully-Automated | `docker compose -f docker-compose.yml -f docker-compose.prod.yml config` → `app.image` set, `app.build` count 0 | B — fixed in this plan (`build: !reset null`, §3) |
| AC-yaml         | Both workflow YAMLs parse as valid GitHub Actions                | Fully-Automated | actionlint / YAML parse on `ci.yml` + `deploy.yml`                                                              | C — deferred to EXECUTE (files not yet created)   |
| AC-deploy-order | Deploy script order is pull → migrate → up -d (migration safety) | Agent-Probe     | Read `deploy.yml` SSH step; confirm fixed order                                                                 | C — deferred to EXECUTE (judged on written file)  |
| AC-e2e          | E2E job green with zero specs                                    | Hybrid          | `bunx playwright test --pass-with-no-tests` (precondition: Playwright browsers installed in CI)                 | A — flag confirmed supported; no specs present    |

Legacy line form:

- lint: Fully-automated: `bun run lint` (precondition: `bun run format` committed — currently FAILS, 384 files)
- check: Fully-automated: `bun run check`
- unit: Fully-automated: `bun run test:unit -- --run`
- build: Fully-automated: `bun run build`
- compose: Fully-automated: `docker compose -f docker-compose.yml -f docker-compose.prod.yml config` (requires `build: !reset null` + Compose v2.24+)
- workflow-yaml: Fully-automated: actionlint / YAML parse (post-create)
- deploy-order: Agent-probe: read deploy.yml, confirm pull→migrate→up -d
- e2e: Hybrid: `bunx playwright test --pass-with-no-tests` (precondition: browsers installed)

Dimension findings:

- Infra fit: CONCERN — `image:`-only override leaves inherited `app.build` in the merged config (VERIFIED); Acceptance #6 ("build absent") is unsatisfiable as originally written. Fix folded into §3: `build: !reset null` (VERIFIED drops build; requires Compose v2.24+ on droplet).
- Test coverage: CONCERN — `bun run lint` currently FAILS (384 Prettier issues); CI Lint step is red on first push until `bun run format` is committed (checklist item 0). check/unit/build pass; unit `--run` confirmed non-hanging; e2e `--pass-with-no-tests` flag confirmed supported.
- Breaking changes: PASS — 3 net-new files, no source/schema/API/auth change. GHCR image name matches git remote.
- Security surface: PASS — deploy/runtime risk class. `GITHUB_TOKEN` + `permissions: packages: write` correctly scoped; SSH key/host via GitHub Secrets (standard, no plaintext); migration step fail-safe ordered. No code-level auth/billing change → no evidence pack required; first real deploy should be manual-verified (standard for deploy/runtime class).
- Section 1 (ci.yml) feasibility: CONCERN — mechanically sound; highest-risk edit is the `Lint` step, which fails against current repo state until checklist item 0 runs.
- Section 2 (deploy.yml) feasibility: PASS — GHCR login/buildx/build-push/SSH ordering all correct and fail-safe; coupled to §3 (a leftover `build:` plus a failed pull could trigger a source build the droplet cannot perform — resolved by §3 `!reset`).
- Section 3 (docker-compose.prod.yml) feasibility: CONCERN (highest-risk edit overall) — additive override cannot remove inherited `build:`; resolved in-plan via `build: !reset null` (VERIFIED).

Open gaps: none blocking. Two concerns, both with verified in-plan fixes folded into the plan body (§3 `!reset`, checklist item 0 format). No out-of-scope backlog gaps.

What this coverage does NOT prove:

- AC-lint: proves `prettier --check` + `eslint` pass locally; does NOT prove the GitHub-hosted runner reproduces the same result (different Bun/Node minor versions could surface new lint findings).
- AC-check / AC-build: prove local success on macOS/Bun; do NOT prove the `ubuntu-latest` + `oven-sh/setup-bun@v2` environment is byte-identical (toolchain drift possible).
- AC-unit: proves the 4 existing schema tests pass and `--run` exits; does NOT prove future tests are covered (only `src/tests/schemas.spec.ts` exists).
- AC-compose: proves merge semantics on local Compose v5.x; does NOT prove the droplet's Compose version honors `!reset` (must be v2.24+; verify on server).
- AC-yaml / AC-deploy-order: not yet exercised — files are created in EXECUTE; proven only by post-create actionlint + read.
- AC-e2e: proves the flag keeps the job green with zero specs; does NOT prove any real end-to-end behavior (no specs exist) and does NOT prove Playwright `webServer` (`build && preview`) starts correctly in CI when there are no tests.
- NONE of these gates prove the live deploy works: GHCR push auth, droplet SSH reachability, `appleboy/ssh-action` execution, and the migration against a real Postgres are all unverifiable without secrets + a live droplet (first deploy is manual-verify).

Gate: CONDITIONAL (concerns noted, verified fixes folded into plan; lint precondition must be satisfied during EXECUTE)
Accepted by: session — accepted concerns: (1) compose `!reset` fix required for Acceptance #6 [resolved in §3]; (2) `bun run format` precondition for CI Lint gate [resolved in checklist item 0].

Execute-agent instructions:

- E1: BEFORE relying on the CI Lint gate, run `bun run format`, then confirm `bun run lint` exits 0. Commit the formatting as a separate commit from the CI files. (Repo currently fails lint — 384 files.)
- E2: In `docker-compose.prod.yml`, set BOTH `image: ghcr.io/potakaaa/veent-crm:latest` and `build: !reset null` on `services.app`. Do NOT use a bare `image:` add. After writing, run `docker compose -f docker-compose.yml -f docker-compose.prod.yml config` and confirm `app.image` is set and `app.build` is absent (count 0). If `app.build` remains, the `!reset` tag is missing or local Compose is < v2.24.
- E3: Document in the feature `_GUIDE.md`/README that the droplet requires Docker Compose v2.24+ (for `!reset`), plus the four secrets and the deploy-dir path.
- E4: Mark VERIFIED only after the EVL confirmation run (gates re-run by a spawned vc-tester): `bun run lint`, `bun run check`, `bun run test:unit -- --run`, `bun run build`, and the compose `config` check.

## Autonomous Goal Block

```
SESSION GOAL: Add CI/CD to veent-crm — ci.yml (PR/push quality gates), deploy.yml (GHCR build + SSH deploy on main), docker-compose.prod.yml (registry-image prod override).
Charter + umbrella plan: N/A — single plan
Autonomy: standing EXECUTE consent for this plan; reversible file creation + a formatting pass only. No live deploy, no secret creation, no irreversible action without explicit user confirmation (feedback_autonomous_phase_execution.md).
Hard stop conditions / safety constraints:
- Do NOT trigger or run a real deploy against the droplet from this session (secrets + live host out of scope).
- Do NOT create or commit GitHub secrets; only document their names.
- The repo-wide `bun run format` pass must be a SEPARATE commit from the CI files.
- `docker-compose.prod.yml` MUST use `build: !reset null` (not a bare image add) and verify `app.build` absent in merged config.
Next phase: EXECUTE: process/features/ci-cd/active/ci-cd_29-06-26/ci-cd_PLAN_29-06-26.md
Validate contract: inline in plan (Status: CONDITIONAL)
Execute start: bun run format (commit) → create 3 files → bun run lint | bun run check | bun run test:unit -- --run | bun run build | docker compose -f docker-compose.yml -f docker-compose.prod.yml config (app.image set, app.build absent) | e2e: bunx playwright test --pass-with-no-tests | high-risk pack: no (deploy/runtime — first live deploy is manual-verify)
```

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/ci-cd/active/ci-cd_29-06-26/ci-cd_PLAN_29-06-26.md`
2. **Last completed step:** VALIDATE complete — Gate CONDITIONAL; validate-contract written.
3. **Validate-contract status:** written 29-06-26 (CONDITIONAL; generated-by outer-pvl).
4. **Context files loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`, `package.json`, `docker-compose.yml`, `playwright.config.ts`, `vite.config.ts`.
5. **Next step for a fresh agent:** EXECUTE checklist items 0-8 in order (item 0 = `bun run format` precondition). All three CI files are net-new; no source behavior changes beyond formatting. Test gates listed in the validate-contract.

## Phase Completion Rules

SIMPLE single-phase plan. This plan is complete only when ALL of the following hold (code-complete alone is `CODE DONE`, not `VERIFIED`):

- Checklist item 0 (format) + items 1-8 applied (item 4 optional).
- All Acceptance Criteria checkboxes ticked with evidence.
- All four local test gates green: `bun run lint` (after format), `bun run check`, `bun run test:unit -- --run`, `bun run build`.
- `docker compose -f docker-compose.yml -f docker-compose.prod.yml config` resolves with `app.image` set and `app.build` absent.
- Four required GitHub secrets + droplet Compose v2.24+ requirement documented.

Marking VERIFIED requires the EVL confirmation run (gates re-run by a spawned vc-tester), not execute-agent self-report.
