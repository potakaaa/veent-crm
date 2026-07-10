<script lang="ts">
	let { platform }: { platform?: string | null } = $props();
</script>

{#if platform}
	<span
		class="rounded-[5px] bg-amber-100 px-[6px] py-[2px] font-mono text-[10.5px] font-medium text-amber-700"
		>{platform}</span
	>
{/if}
