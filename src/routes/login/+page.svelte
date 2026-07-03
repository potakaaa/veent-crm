<script lang="ts">
	import { authClient } from '$lib/auth-client';

	let { data } = $props();

	let sent = $state(false);
	let email = $state('');
	let error = $state('');
	let submitting = $state(false);

	async function sendMagic() {
		const normalizedEmail = email.trim();
		if (!normalizedEmail) {
			error = 'Enter your work email.';
			return;
		}
		error = '';
		submitting = true;
		const { error: err } = await authClient.signIn.magicLink({
			email: normalizedEmail,
			callbackURL: data.from ?? '/'
		});
		submitting = false;
		if (err) {
			error = err.message ?? 'Could not send the link. Try again.';
			return;
		}
		sent = true;
	}
</script>

<svelte:head><title>Sign in · Veent CRM</title></svelte:head>

<div class="flex h-screen bg-ink text-white">
	<!-- left: form -->
	<div class="flex flex-1 items-center justify-center p-6 sm:p-10">
		<div class="w-full max-w-[360px]">
			<div class="mb-9 flex items-center gap-2.5">
				<div
					class="flex h-[34px] w-[34px] items-center justify-center rounded-control bg-primary text-[17px] font-bold"
				>
					V
				</div>
				<div>
					<div class="text-[15px] font-bold tracking-[-0.2px]">Veent CRM</div>
					<div class="font-mono text-[10px] uppercase tracking-[1px] text-nav-faint">
						Outreach Console
					</div>
				</div>
			</div>

			{#if sent}
				<div class="rounded-control border border-fresh/35 bg-fresh/10 p-[22px]">
					<div class="mb-2 text-[18px] font-semibold">Check your email</div>
					<div class="text-[13.5px] leading-relaxed text-[#cdbab8]">
						We sent a sign-in link to <span class="font-mono text-white">{email}</span>. It expires
						in 15 minutes — no password needed.
					</div>
					<button
						onclick={() => (sent = false)}
						class="focus-ring mt-4 rounded-[4px] text-[13px] font-medium text-[#e08a82]"
					>
						Use a different email
					</button>
				</div>
			{:else}
				<div class="mb-1.5 text-[22px] font-bold tracking-[-0.4px]">Sign in</div>
				<div class="mb-6 text-[13.5px] leading-relaxed text-nav-muted">
					Magic-link sign-in for the Veent sales team. Allowlisted reps only.
				</div>
				{#if data.from}
					<div class="mb-6 text-[12.5px] leading-relaxed text-[#8a7270]">
						You were trying to reach <span class="font-mono text-[#cdbab8]">{data.from}</span>.
					</div>
				{/if}
				<label for="email" class="mb-2 block text-[12px] font-medium text-[#cdbab8]"
					>Work email</label
				>
				<input
					id="email"
					bind:value={email}
					placeholder="jonna@test.com"
					aria-invalid={error ? 'true' : undefined}
					aria-describedby={error ? 'email-error' : undefined}
					class="focus-ring h-11 w-full rounded-[9px] border border-[#312c37] bg-[#221e27] px-3.5 font-mono text-[14px] text-white outline-none"
				/>
				<button
					onclick={sendMagic}
					disabled={submitting}
					class="focus-ring mt-3.5 h-11 w-full rounded-[9px] bg-primary text-[14px] font-semibold text-white hover:bg-primary-strong disabled:opacity-60"
				>
					{submitting ? 'Sending…' : 'Send magic link'}
				</button>
				{#if error}
					<div id="email-error" role="alert" class="mt-3 text-[12px] text-[#e08a82]">{error}</div>
				{/if}
				<div class="mt-[18px] text-[11.5px] leading-relaxed text-nav-faint">
					Not on the team yet? Ask a manager to add you in Team management — that list is the
					allowlist.
				</div>
			{/if}
		</div>
	</div>

	<!-- right: the cardinal rule -->
	<div
		class="flex flex-1 items-center justify-center border-l border-nav-border p-10 max-[880px]:hidden"
		style="background:radial-gradient(circle at 78% 18%, rgba(225,29,42,0.28), transparent 42%), var(--color-nav-bg)"
	>
		<div class="max-w-[380px]">
			<div class="mb-3.5 font-mono text-[11px] uppercase tracking-[1.5px] text-primary">
				The cardinal rule
			</div>
			<div class="text-[26px] font-semibold leading-[1.3] tracking-[-0.5px] text-[#f2e6e4]">
				Search a page before reaching out.
			</div>
			<div class="mt-4 text-[14px] leading-relaxed text-[#a98e8c]">
				One shared inbox, zero crossed wires. The system tracks who's already working a lead so two
				reps never reach out to the same organizer twice.
			</div>
		</div>
	</div>
</div>
