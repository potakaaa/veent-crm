<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Access restricted · Veent CRM</title></svelte:head>

<div class="flex h-screen items-center justify-center bg-ink p-10 text-white">
	<div class="w-[420px] max-w-full">
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

		<div class="mb-3.5 font-mono text-[11px] uppercase tracking-[1.5px] text-primary">
			Access restricted
		</div>
		<h1 class="mb-3 font-serif text-[34px] font-semibold leading-[1.2] tracking-[-0.5px]">
			You need to sign in.
		</h1>
		<p class="mb-2 text-[14px] leading-relaxed text-nav-muted">
			This page is for allowlisted Veent reps. Sign in with your work email to continue.
		</p>
		{#if data.from}
			<p class="mb-6 text-[12.5px] leading-relaxed text-nav-faint">
				You were trying to reach <span class="font-mono text-[#cdbab8]">{data.from}</span>.
			</p>
		{:else}
			<div class="mb-6"></div>
		{/if}

		<a
			href="/login"
			class="focus-ring inline-flex h-11 items-center justify-center rounded-control bg-primary px-6 text-[14px] font-semibold text-white hover:bg-primary-strong"
		>
			Sign in
		</a>

		<p class="mt-[18px] text-[11.5px] leading-relaxed text-nav-faint">
			Not on the team yet? Ask a manager to add you in Team management — that list is the allowlist.
		</p>
	</div>
</div>
