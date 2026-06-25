<script lang="ts">
	import StubNote from '$lib/components/StubNote.svelte';
</script>

<svelte:head><title>Log in · Veent CRM</title></svelte:head>

<div class="mx-auto max-w-sm pt-10">
	<h1 class="mb-1 text-2xl font-semibold">Veent CRM</h1>
	<p class="mb-4 text-sm text-gray-600">Magic-link login (allowlisted to active reps + manager).</p>

	<StubNote>Better Auth magic link via Resend — not wired in v0.</StubNote>

	<form class="space-y-3" method="post">
		<input
			name="email"
			type="email"
			placeholder="you@veent.io"
			class="w-full rounded border border-gray-300 px-3 py-2 text-sm"
		/>
		<button type="button" class="w-full rounded bg-gray-900 px-4 py-2 text-sm text-white" disabled>
			Send magic link (stub)
		</button>
	</form>
	<p class="mt-4 text-center text-xs text-gray-400">
		Dev: the session gate currently injects a manager via <code>hooks.server.ts</code>.
	</p>
</div>
