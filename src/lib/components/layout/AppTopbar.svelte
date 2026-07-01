<script lang="ts">
	import Icon from '$lib/components/shared/Icon.svelte';
</script>

<header class="relative z-30 flex h-[60px] shrink-0 items-center gap-3.5 bg-[#1a171c] px-[18px]">
	<div class="ml-auto flex items-center gap-2">
		<a
			href="/leads/new"
			class="flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-[15px] text-[13px] font-semibold text-white shadow-[0_4px_12px_rgba(225,29,42,0.34)] hover:bg-primary-strong"
		>
			<Icon name="plus" size={15} stroke={2.2} />
			New lead
		</a>
	</div>
</header>
