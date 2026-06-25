<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children = undefined }: { children?: Snippet } = $props();
</script>

<div class="mb-4 rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
	⚠️ Stub surface — renders mock data, no DB / integrations wired yet. {@render children?.()}
</div>
