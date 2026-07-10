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

	type User = { id: string; name: string };

	let {
		users,
		selectedId,
		currentUserId,
		allLabel,
		onSelect,
		placeholder = 'Search...'
	}: {
		users: User[];
		selectedId: string | undefined;
		currentUserId?: string;
		allLabel: string;
		onSelect: (id: string) => void;
		placeholder?: string;
	} = $props();

	let open = $state(false);
	let query = $state('');

	// shouldFilter disabled so the pinned Quick filters stay visible while typing;
	// the users list is filtered client-side via filteredUsers.
	const filteredUsers = $derived(
		query.trim()
			? users.filter((u) => u.name.toLowerCase().includes(query.trim().toLowerCase()))
			: users
	);

	const triggerLabel = $derived(
		!selectedId ? allLabel : (users.find((u) => u.id === selectedId)?.name ?? allLabel)
	);

	function choose(id: string) {
		onSelect(id);
		open = false;
	}
</script>

<Popover bind:open>
	<PopoverTrigger
		class="flex h-8 items-center gap-1 rounded-control border border-hairline bg-panel px-2.5 text-[12.5px] text-ink hover:bg-panel-sunken"
	>
		{triggerLabel}
	</PopoverTrigger>
	<PopoverContent class="w-64 p-0" align="start">
		<Command shouldFilter={false}>
			<CommandInput {placeholder} value={query} oninput={(e) => (query = e.currentTarget.value)} />
			<CommandList>
				<CommandGroup heading="Quick filters">
					<CommandItem
						value="__all__"
						data-chosen={!selectedId ? '' : undefined}
						onSelect={() => choose('')}>{allLabel}</CommandItem
					>
					{#if currentUserId}
						<CommandItem
							value="__mine__"
							data-chosen={selectedId === currentUserId ? '' : undefined}
							onSelect={() => choose(currentUserId)}>Mine</CommandItem
						>
					{/if}
				</CommandGroup>
				<CommandGroup heading="Search">
					{#if filteredUsers.length === 0}
						<CommandEmpty>No matches found.</CommandEmpty>
					{:else}
						{#each filteredUsers as u (u.id)}
							<CommandItem
								value={u.id}
								data-chosen={selectedId === u.id ? '' : undefined}
								onSelect={() => choose(u.id)}>{u.name}</CommandItem
							>
						{/each}
					{/if}
				</CommandGroup>
			</CommandList>
		</Command>
	</PopoverContent>
</Popover>
