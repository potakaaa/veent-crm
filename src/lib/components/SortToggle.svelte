<script lang="ts">
	import { page } from '$app/state';

	let { sort }: { sort: string | null } = $props();

	const isAppeal = $derived(sort === 'appeal');

	// Build the toggle target while preserving other query params (e.g. ?q=).
	function hrefFor(nextSort: string | null): string {
		const params = new URLSearchParams(page.url.searchParams);
		if (nextSort) params.set('sort', nextSort);
		else params.delete('sort');
		const qs = params.toString();
		return qs ? `?${qs}` : page.url.pathname;
	}
</script>

<div class="inline-flex items-center gap-1 text-xs">
	<span class="text-gray-500">Sort:</span>
	<a
		href={hrefFor(null)}
		aria-current={isAppeal ? undefined : 'true'}
		class="rounded px-2 py-0.5 {isAppeal ? 'text-gray-600 hover:bg-gray-100' : 'bg-gray-900 text-white'}"
	>
		Default
	</a>
	<a
		href={hrefFor('appeal')}
		aria-current={isAppeal ? 'true' : undefined}
		class="rounded px-2 py-0.5 {isAppeal ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}"
	>
		Appeal
	</a>
</div>
