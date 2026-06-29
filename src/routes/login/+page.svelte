<script lang="ts">
	let sent = $state(false);
	let email = $state('');

	function sendMagic() {
		sent = true;
		if (!email) email = 'jonna@veent.io';
	}
</script>

<svelte:head><title>Sign in · Veent CRM</title></svelte:head>

<div class="flex h-screen bg-ink text-white">
	<!-- left: form -->
	<div class="flex flex-1 items-center justify-center p-10">
		<div class="w-[360px] max-w-full">
			<div class="mb-9 flex items-center gap-2.5">
				<div
					class="flex h-[34px] w-[34px] items-center justify-center rounded-control bg-primary text-[17px] font-bold"
				>
					V
				</div>
				<div>
					<div class="text-[15px] font-bold tracking-[-0.2px]">Veent CRM</div>
					<div class="font-mono text-[10px] uppercase tracking-[1px] text-[#8a7270]">
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
						class="mt-4 text-[13px] font-medium text-[#e08a82]"
					>
						Use a different email
					</button>
					<a href="/" class="mt-4 block text-[12px] text-[#8a7270] hover:text-white"
						>→ Continue to the console (demo)</a
					>
				</div>
			{:else}
				<div class="mb-1.5 text-[22px] font-bold tracking-[-0.4px]">Sign in</div>
				<div class="mb-6 text-[13.5px] leading-relaxed text-[#b89e9c]">
					Magic-link sign-in for the Veent sales team. Allowlisted reps only.
				</div>
				<label for="email" class="mb-2 block text-[12px] font-medium text-[#cdbab8]"
					>Work email</label
				>
				<input
					id="email"
					bind:value={email}
					placeholder="jonna@veent.io"
					class="h-11 w-full rounded-[9px] border border-[#43282a] bg-[#2e1a1b] px-3.5 font-mono text-[14px] text-white outline-none"
				/>
				<button
					onclick={sendMagic}
					class="mt-3.5 h-11 w-full rounded-[9px] bg-primary text-[14px] font-semibold text-white hover:bg-primary-strong"
				>
					Send magic link
				</button>
				<div class="mt-[18px] text-[11.5px] leading-relaxed text-[#8a7270]">
					Not on the team yet? Ask a manager to add you in Team management — that list is the
					allowlist.
				</div>
			{/if}
		</div>
	</div>

	<!-- right: the cardinal rule -->
	<div
		class="flex flex-1 items-center justify-center border-l border-[#3a2122] p-10 max-[880px]:hidden"
		style="background:linear-gradient(160deg,#3a1e1f,#261617)"
	>
		<div class="max-w-[380px]">
			<div class="mb-3.5 font-mono text-[11px] uppercase tracking-[1.5px] text-primary">
				The cardinal rule
			</div>
			<div class="text-[26px] font-semibold leading-[1.3] tracking-[-0.5px] text-[#f2e6e4]">
				Search a page before reaching out.
			</div>
			<div class="mt-4 text-[14px] leading-relaxed text-[#a98e8c]">
				2,000 leads, five reps, one shared inbox. Dedup is baked into the chrome so two reps never
				DM the same organizer twice.
			</div>
			<div class="mt-7 flex flex-wrap gap-2">
				{#each ['dedup on', 'Asia/Manila', 'keyboard-first'] as tag}
					<div
						class="rounded-[6px] border border-[#43282a] bg-white/5 px-[9px] py-[5px] font-mono text-[11px] text-[#b89e9c]"
					>
						{tag}
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>
