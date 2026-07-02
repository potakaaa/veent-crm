<script lang="ts">
	import {
		Command,
		CommandInput,
		CommandList,
		CommandGroup,
		CommandItem,
		CommandEmpty
	} from '$lib/components/ui/command';
	import { Popover, PopoverTrigger, PopoverContent } from '$lib/components/ui/popover';
	import { Skeleton } from '$lib/components/ui/skeleton';

	type Lead = { id: string; name: string };

	let {
		mode,
		value = $bindable(undefined),
		selectedLabel = undefined,
		disabled = false,
		onselect = undefined
	}: {
		mode: 'filter' | 'assign';
		// filter mode: one-way from the `lead` URL param. assign mode: two-way via bind:value.
		value?: string;
		selectedLabel?: string;
		// Freezes the trigger while the parent has a filter navigation in flight.
		disabled?: boolean;
		// filter mode wires this to setFilter; assign mode relies on bind:value instead.
		onselect?: (lead: Lead | undefined) => void;
	} = $props();

	let open = $state(false);
	let leadQuery = $state('');
	let results = $state<Lead[]>([]);
	let pageNum = $state(1);
	let loading = $state(false);
	let total = $state(0);
	// Latest-wins race guard: every fetch captures a generation token; stale responses drop.
	let requestGen = 0;
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	let hasFetched = $state(false);
	// Locally-chosen label overrides the server-seeded `selectedLabel` after a pick.
	let chosenLabel = $state<string | undefined>(undefined);

	const triggerLabel = $derived(
		chosenLabel ?? selectedLabel ?? (mode === 'filter' ? 'All leads' : 'Select a lead')
	);

	async function fetchPage(query: string, page: number, append: boolean) {
		const gen = ++requestGen;
		loading = true;
		try {
			const res = await fetch(`/api/leads?q=${encodeURIComponent(query)}&page=${page}`);
			if (!res.ok) return;
			const data = (await res.json()) as { leads: Lead[]; total: number };
			// Drop out-of-order (stale) responses — only the latest request wins.
			if (gen !== requestGen) return;
			if (append) {
				const existing = new Set(results.map((l) => l.id));
				results = [...results, ...data.leads.filter((l) => !existing.has(l.id))];
			} else {
				results = data.leads;
			}
			total = data.total;
			pageNum = page;
			hasFetched = true;
		} catch {
			// silent — user can retry by typing/scrolling
		} finally {
			if (gen === requestGen) loading = false;
		}
	}

	function onQueryInput(v: string) {
		leadQuery = v;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			// Reset list state on every query change (page-1 restart).
			results = [];
			pageNum = 1;
			total = 0;
			void fetchPage(leadQuery, 1, false);
		}, 300);
	}

	function loadMore() {
		if (loading) return;
		if (results.length >= total) return;
		void fetchPage(leadQuery, pageNum + 1, true);
	}

	function sentinel(el: HTMLElement) {
		const obs = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) loadMore();
			},
			{ threshold: 0.1 }
		);
		obs.observe(el);
		return { destroy: () => obs.disconnect() };
	}

	// Seed the first page when the popover first opens.
	$effect(() => {
		if (open && !hasFetched && !loading) {
			void fetchPage('', 1, false);
		}
	});

	function pick(lead: Lead) {
		chosenLabel = lead.name;
		value = lead.id;
		onselect?.(lead);
		open = false;
	}

	function clearSelection() {
		chosenLabel = undefined;
		value = undefined;
		onselect?.(undefined);
		open = false;
	}

	// When `value` is cleared externally (e.g. the create modal re-seeds selectedLeadId to '',
	// or filter mode navigates to "All leads"), drop the stale chosen label.
	$effect(() => {
		if (!value) chosenLabel = undefined;
	});

	const hasMore = $derived(results.length < total);
</script>

<Popover bind:open>
	<PopoverTrigger
		{disabled}
		class="flex h-8 items-center gap-1 rounded-control border border-hairline bg-panel px-2.5 text-[12.5px] text-ink hover:bg-panel-sunken disabled:cursor-wait disabled:opacity-60"
	>
		{triggerLabel}
	</PopoverTrigger>
	<PopoverContent class="w-64 p-0" align="start">
		<Command shouldFilter={false}>
			<CommandInput
				placeholder="Search leads…"
				value={leadQuery}
				oninput={(e) => onQueryInput(e.currentTarget.value)}
			/>
			<CommandList>
				{#if mode === 'filter'}
					<CommandGroup>
						<CommandItem value="__all_leads__" onSelect={clearSelection}>All leads</CommandItem>
					</CommandGroup>
				{/if}
				{#if loading && results.length === 0}
					<div class="space-y-1.5 p-2">
						<Skeleton class="h-4 w-full" />
						<Skeleton class="h-4 w-3/4" />
						<Skeleton class="h-4 w-5/6" />
					</div>
				{:else if results.length === 0 && hasFetched}
					<CommandEmpty>No leads found.</CommandEmpty>
				{:else}
					<CommandGroup heading="Leads">
						{#each results as lead (lead.id)}
							<CommandItem
								value={lead.id}
								data-chosen={value === lead.id ? '' : undefined}
								onSelect={() => pick(lead)}
							>
								{lead.name}
							</CommandItem>
						{/each}
						{#if hasMore}
							<div use:sentinel aria-hidden="true" class="p-2">
								{#if loading}
									<Skeleton class="h-4 w-full" />
								{/if}
							</div>
						{/if}
					</CommandGroup>
				{/if}
			</CommandList>
		</Command>
	</PopoverContent>
</Popover>
