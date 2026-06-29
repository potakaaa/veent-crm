<script lang="ts">
	import { toasts } from '$lib/stores/toasts.svelte';

	const tone = (t: string) =>
		t === 'success'
			? 'border-fresh/40 text-ink'
			: t === 'warn'
				? 'border-stale/40 text-ink'
				: 'border-hairline text-ink';
</script>

<div
	class="pointer-events-none fixed bottom-5 right-5 z-[200] flex flex-col gap-2"
	aria-live="polite"
	aria-atomic="false"
	role="status"
>
	{#each toasts.items as t (t.id)}
		<div
			class="pointer-events-auto flex items-center gap-3 rounded-control border bg-panel px-4 py-3 text-[13px] shadow-pop {tone(
				t.tone
			)}"
		>
			<span>{t.message}</span>
			{#if t.action}
				<button
					class="font-mono text-[12px] font-semibold text-primary hover:underline"
					onclick={() => {
						t.action?.run();
						toasts.dismiss(t.id);
					}}
				>
					{t.action.label}
				</button>
			{/if}
		</div>
	{/each}
</div>
