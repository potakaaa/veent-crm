import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
// Production target = Vercel (Node serverless runtime via @sveltejs/adapter-vercel).
// @sveltejs/adapter-node stays installed as the documented self-host fallback
// (see sales-crm.md §Deployment). Default Node runtime — NOT edge: postgres-js and
// $env/dynamic/private require Node.
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	server: {
		allowedHosts: ['localhost', '.trycloudflare.com', '.ngrok-free.app']
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ runtime: 'nodejs22.x' }),
			typescript: {
				config: (config) => ({
					...config,
					include: [...config.include, '../drizzle.config.ts']
				})
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
