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

	type Organizer = { id: string; name: string };

	let {
		value = $bindable(undefined),
		// Server-seeded label for the currently-linked organizer (e.g. the lead's organizer
		// name on create, or the meeting's saved organizer name on edit).
		selectedLabel = undefined,
		disabled = false,
		id = undefined,
		...restProps
	}: {
		value?: string;
		selectedLabel?: string;
		disabled?: boolean;
		id?: string;
		[key: string]: unknown;
	} = $props();

	let open = $state(false);
	let query = $state('');
	let results = $state<Organizer[]>([]);
	let loading = $state(false);
	let hasFetched = $state(false);
	// Latest-wins race guard: stale responses drop.
	let requestGen = 0;
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	// Locally-chosen label overrides the server-seeded `selectedLabel`, but only while
	// `value` still equals the id it was chosen for — once `value` changes to any other
	// id (a different record, or externally reset), the override no longer applies.
	let chosenLabel = $state<string | undefined>(undefined);
	let chosenFor = $state<string | undefined>(undefined);

	const triggerLabel = $derived(
		chosenFor === value ? (chosenLabel ?? 'None') : (selectedLabel ?? 'None')
	);

	async function fetchOrganizers(q: string) {
		const gen = ++requestGen;
		loading = true;
		try {
			const res = await fetch(`/api/organizers?q=${encodeURIComponent(q)}`);
			if (!res.ok) return;
			const data = (await res.json()) as { organizers: Organizer[] };
			if (gen !== requestGen) return;
			results = data.organizers;
		} catch {
			// silent — user can retry by typing
		} finally {
			// Mark the attempt complete on success AND failure, so a rejected/errored
			// initial fetch doesn't leave hasFetched false — that would re-trigger the
			// seed effect below on every render while the popover stays open.
			if (gen === requestGen) {
				loading = false;
				hasFetched = true;
			}
		}
	}

	function onQueryInput(v: string) {
		query = v;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => void fetchOrganizers(query), 300);
	}

	// Seed the first page when the popover first opens.
	$effect(() => {
		if (open && !hasFetched && !loading) void fetchOrganizers('');
	});

	function pick(org: Organizer) {
		chosenLabel = org.name;
		chosenFor = org.id;
		value = org.id;
		open = false;
	}

	function clearSelection() {
		chosenLabel = undefined;
		chosenFor = undefined;
		value = undefined;
		open = false;
	}
</script>

<div class="flex items-center gap-2">
	<Popover bind:open>
		<PopoverTrigger
			{disabled}
			{id}
			{...restProps}
			class="flex h-8 min-w-40 items-center gap-1 rounded-control border border-hairline bg-panel px-2.5 text-[12.5px] text-ink hover:bg-panel-sunken disabled:cursor-wait disabled:opacity-60"
		>
			{triggerLabel}
		</PopoverTrigger>
		<PopoverContent class="w-64 p-0" align="start">
			<Command shouldFilter={false}>
				<CommandInput
					placeholder="Search organizers…"
					value={query}
					oninput={(e) => onQueryInput(e.currentTarget.value)}
				/>
				<CommandList>
					<CommandGroup>
						<CommandItem value="__none__" onSelect={clearSelection}>None</CommandItem>
					</CommandGroup>
					{#if loading && results.length === 0}
						<div class="space-y-1.5 p-2">
							<Skeleton class="h-4 w-full" />
							<Skeleton class="h-4 w-3/4" />
						</div>
					{:else if results.length === 0 && hasFetched}
						<CommandEmpty>No organizers found.</CommandEmpty>
					{:else}
						<CommandGroup heading="Organizers">
							{#each results as org (org.id)}
								<CommandItem
									value={org.id}
									data-chosen={value === org.id ? '' : undefined}
									onSelect={() => pick(org)}
								>
									{org.name}
								</CommandItem>
							{/each}
						</CommandGroup>
					{/if}
				</CommandList>
			</Command>
		</PopoverContent>
	</Popover>
	{#if value}
		<button
			type="button"
			onclick={clearSelection}
			class="text-[12px] text-ink-400 underline hover:text-ink"
		>
			Clear
		</button>
	{/if}
</div>
