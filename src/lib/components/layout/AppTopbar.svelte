<script lang="ts">
	import Icon from '$lib/components/shared/Icon.svelte';
</script>

<header
	class="relative z-30 flex h-[60px] shrink-0 items-center gap-4 border-b border-hairline bg-panel px-5"
>
	<div class="ml-auto flex items-center gap-2">
		<a
			href="/leads/new"
			class="flex h-[38px] items-center gap-1.5 rounded-control bg-primary px-3.5 text-[13px] font-semibold text-white hover:bg-primary-strong"
		>
			<Icon name="plus" size={15} stroke={2.2} />
			New lead
		</a>
	</div>
</header>
