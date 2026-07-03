# veent-crm — Bun + SvelteKit (svelte-adapter-bun). See sales-crm.md §Deployment.
# Multi-stage: install + build, then a slim runtime image.

FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1 AS runtime
WORKDIR /app
ENV NODE_ENV=production
# NOTE (03-07-26): non-functional while adapter-vercel is active — SvelteKit allows one adapter
# only, so `bun run build` no longer emits the svelte-adapter-bun ./build server this stage expects.
# Re-add svelte-adapter-bun in vite.config.ts to restore this path.
# svelte-adapter-bun emits a Bun server in ./build with its own deps bundled.
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
# Healthcheck hits the /health endpoint (see src/routes/health/+server.ts).
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
	CMD bun -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "./build/index.js"]
