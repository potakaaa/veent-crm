<script lang="ts">
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import LeadGrid from '$lib/components/leads/LeadGrid.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Separator } from '$lib/components/ui/separator';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import { leadsToCsv, downloadCsv } from '$lib/utils/csv';
	import { LEAD_STAGES, LEAD_PLATFORMS } from '$lib/zod/schemas';
	import { stageLabel } from '$lib/utils/stages';
	import type { Lead, LeadSegment, Stage } from '$lib/types';

	let { data } = $props();

	let segment = $state<LeadSegment>('mine');
	let stage = $state('');
	let platform = $state('');
	let staleOnly = $state(false);
	let search = $state('');

	const segDefs: { key: LeadSegment; label: string }[] = [
		{ key: 'mine', label: 'Mine' },
		{ key: 'all', label: 'All' },
		{ key: 'unassigned', label: 'Unassigned' },
		{ key: 'lost', label: 'Lost' }
	];

	function bySegment(l: Lead): boolean {
		if (segment === 'mine') return l.ownerId === data.me.id;
		if (segment === 'unassigned') return l.ownerId === null;
		if (segment === 'lost') return l.stage === 'lost';
		return true;
	}

	const segCount = (key: LeadSegment) =>
		data.leads.filter((l: Lead) => {
			if (key === 'mine') return l.ownerId === data.me.id;
			if (key === 'unassigned') return l.ownerId === null;
			if (key === 'lost') return l.stage === 'lost';
			return l.stage !== 'lost';
		}).length;

	const filtered = $derived(
		data.leads.filter((l: Lead) => {
			// Lost is hidden unless the Lost segment is active (product rule).
			if (segment !== 'lost' && l.stage === 'lost') return false;
			if (!bySegment(l)) return false;
			if (stage && l.stage !== stage) return false;
			if (platform && l.platform !== platform) return false;
			if (staleOnly && l.age.type !== 'stale') return false;
			if (search) {
				const q = search.toLowerCase();
				if (!l.name.toLowerCase().includes(q) && !l.handle.toLowerCase().includes(q)) return false;
			}
			return true;
		})
	);

	const exportCsv = () => downloadCsv('veent-leads.csv', leadsToCsv(filtered));
</script>

<svelte:head><title>My Leads · Veent CRM</title></svelte:head>

<div class="px-7 pb-16 pt-6">
	<PageHeader
		title="My Leads"
		subtitle="Sorted by last activity — freshest first. Search the command bar before adding a page."
	>
		{#snippet actions()}
			<span class="font-mono text-[12px] text-ink-300"
				>{filtered.length} shown · last activity ↓</span
			>
			<Button variant="outline" size="sm" onclick={exportCsv}>Export CSV</Button>
		{/snippet}
	</PageHeader>

	<!-- toolbar -->
	<div class="mb-3.5 flex flex-wrap items-center gap-2.5">
		<div class="flex rounded-control bg-panel-sunken p-[3px]">
			{#each segDefs as s (s.key)}
				<button
					onclick={() => (segment = s.key)}
					class="h-[26px] rounded-[6px] px-3 text-[12.5px] {segment === s.key
						? 'bg-panel font-semibold text-ink shadow-frame'
						: 'font-medium text-[#7d6a68]'}"
				>
					{s.label}<span class="ml-1.5 font-mono text-[10px] opacity-70">{segCount(s.key)}</span>
				</button>
			{/each}
		</div>
		<Separator orientation="vertical" class="h-[22px]" />

		<Select type="single" bind:value={stage}>
			<SelectTrigger size="sm">{stage ? stageLabel(stage as Stage) : 'Stage'}</SelectTrigger>
			<SelectContent>
				<SelectItem value="" label="All stages">All stages</SelectItem>
				{#each LEAD_STAGES as s}<SelectItem value={s} label={stageLabel(s)}
						>{stageLabel(s)}</SelectItem
					>{/each}
			</SelectContent>
		</Select>
		<Select type="single" bind:value={platform}>
			<SelectTrigger size="sm">{platform || 'Platform'}</SelectTrigger>
			<SelectContent>
				<SelectItem value="" label="All platforms">All platforms</SelectItem>
				{#each LEAD_PLATFORMS as p}<SelectItem value={p} label={p}>{p}</SelectItem>{/each}
			</SelectContent>
		</Select>

		<Button
			variant="outline"
			size="sm"
			onclick={() => (staleOnly = !staleOnly)}
			class={staleOnly ? 'border-stale bg-[rgba(194,113,12,0.08)] text-[#92560b]' : ''}
		>
			<span class="h-[7px] w-[7px] rounded-full bg-stale"></span> Stale only (&gt;30d)
		</Button>

		<Input bind:value={search} placeholder="Filter…" class="ml-auto h-8 w-44" />
	</div>

	<LeadGrid leads={filtered} users={data.users} />
</div>
