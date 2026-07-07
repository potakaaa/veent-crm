<script lang="ts" generics="Id extends string">
	import { Popover, PopoverTrigger, PopoverContent } from '$lib/components/ui/popover';
	import Icon from '$lib/components/shared/Icon.svelte';

	// Mobile-only icon-triggered sort control — a stand-in for clickable table headers on
	// pages where the table becomes a card list on narrow viewports (Organizers list + detail).
	let {
		options,
		sort,
		dir,
		onSelect
	}: {
		options: { id: Id; dir: 'asc' | 'desc'; label: string }[];
		sort: string;
		dir: string;
		onSelect: (id: Id, dir: 'asc' | 'desc') => void;
	} = $props();

	let open = $state(false);
</script>

<Popover bind:open>
	<PopoverTrigger
		aria-label="Sort"
		title="Sort"
		class="ml-auto flex h-8 w-8 items-center justify-center rounded-control border border-hairline bg-panel text-ink hover:bg-panel-sunken sm:hidden"
	>
		<Icon name="sort" size={15} stroke={2} />
	</PopoverTrigger>
	<PopoverContent class="w-52 p-1" align="end">
		<div class="flex flex-col gap-0.5">
			{#each options as opt (opt.id + opt.dir)}
				{@const active = sort === opt.id && dir === opt.dir}
				<button
					type="button"
					onclick={() => {
						onSelect(opt.id, opt.dir);
						open = false;
					}}
					class="flex items-center justify-between rounded-[5px] px-2.5 py-1.5 text-left text-[12.5px] {active
						? 'bg-selected font-semibold text-primary-strong'
						: 'text-ink-600 hover:bg-panel-sunken'}"
				>
					{opt.label}
					{#if active}<Icon name="check" size={13} stroke={2.2} />{/if}
				</button>
			{/each}
		</div>
	</PopoverContent>
</Popover>
