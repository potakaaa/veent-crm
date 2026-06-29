<script lang="ts">
	import { authClient } from '$lib/auth-client';

	let email = $state('');
	let sent = $state(false);
	let error = $state('');
	let submitting = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		submitting = true;
		const { error: err } = await authClient.signIn.magicLink({ email, callbackURL: '/' });
		submitting = false;
		if (err) {
			error = err.message ?? 'Could not send the link. Try again.';
			return;
		}
		sent = true;
	}
</script>

<svelte:head><title>Log in · Veent CRM</title></svelte:head>

<div class="mx-auto max-w-sm pt-10">
	<h1 class="mb-1 text-2xl font-semibold">Veent CRM</h1>
	<p class="mb-4 text-sm text-gray-600">Magic-link login (allowlisted to active reps + manager).</p>

	{#if sent}
		<div class="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
			Check your email — we sent a sign-in link to <strong>{email}</strong>. It expires in 5 minutes.
		</div>
	{:else}
		<form class="space-y-3" onsubmit={submit}>
			<input
				name="email"
				type="email"
				bind:value={email}
				required
				placeholder="you@veent.io"
				class="w-full rounded border border-gray-300 px-3 py-2 text-sm"
			/>
			<button
				type="submit"
				disabled={submitting || !email}
				class="w-full rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
			>
				{submitting ? 'Sending…' : 'Send magic link'}
			</button>
			{#if error}
				<p class="text-sm text-red-600">{error}</p>
			{/if}
		</form>
	{/if}
</div>
