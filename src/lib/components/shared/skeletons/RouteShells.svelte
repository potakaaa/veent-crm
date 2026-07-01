<script lang="ts">
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import LeadRowSkeleton from './LeadRowSkeleton.svelte';
	import TableSkeleton from './TableSkeleton.svelte';
	import CardSkeleton from './CardSkeleton.svelte';
	import DetailSkeleton from './DetailSkeleton.svelte';
	import DashboardSectionSkeleton from './DashboardSectionSkeleton.svelte';

	let { pathname }: { pathname: string } = $props();

	// Which route shell to render. Each branch mirrors the real page's loading
	// branch (same outer wrapper + PageHeader title) so there is no layout jump
	// when the real page mounts. Skeletons appear ONLY where server data lands.
	const isToday = $derived(pathname === '/');
	const isLeads = $derived(pathname === '/leads');
	const isLeadNew = $derived(pathname.startsWith('/leads/new'));
	const isLeadDetail = $derived(
		pathname.startsWith('/leads/') && pathname !== '/leads' && !pathname.startsWith('/leads/new')
	);
	const isPipeline = $derived(pathname === '/pipeline');
	const isUnassigned = $derived(pathname === '/unassigned');
	const isReminders = $derived(pathname === '/reminders');
	const isReports = $derived(pathname === '/reports');
	const isTeam = $derived(pathname === '/team');

	// Today section groups — real titles/colors from src/routes/+page.svelte.
	const todayGroups = [
		{ title: 'Overdue follow-ups', color: '#dc2626' },
		{ title: 'Due today', color: '#e11d2a' },
		{ title: 'Replied', color: '#7c3aed' },
		{ title: 'Going cold (>30d no reply)', color: '#d97706' }
	];
</script>

{#if isToday}
	<div class="px-7 pb-16 pt-6">
		<PageHeader title="Today" subtitle="Your queue is sorted by urgency — clear the top first." />

		<div class="my-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
			{#each Array(4) as _, i (i)}
				<div class="rounded-control border border-hairline bg-panel p-4">
					<Skeleton class="mb-1.5 h-7 w-10" />
					<Skeleton class="h-3 w-20" />
				</div>
			{/each}
		</div>

		{#each todayGroups as g (g.title)}
			<div class="mb-5">
				<div class="mb-2.5 flex items-center gap-2.5">
					<span class="h-2 w-2 rounded-full" style="background:{g.color}"></span>
					<h2 class="font-serif text-[15px] font-semibold text-ink">{g.title}</h2>
					<Skeleton class="h-4 w-6 rounded" />
				</div>
				<div class="overflow-hidden rounded-control border border-hairline bg-panel">
					<LeadRowSkeleton count={2} />
				</div>
			</div>
		{/each}
	</div>
{:else if isLeadNew}
	<div class="px-7 pb-16 pt-6">
		<PageHeader title="New lead" subtitle="Fill in what you know — you can update later." />
		<CardSkeleton />
	</div>
{:else if isLeadDetail}
	<!-- DetailSkeleton carries its own wrapper + header skeleton. -->
	<DetailSkeleton />
{:else if isLeads}
	<div class="px-7 pb-16 pt-6">
		<PageHeader
			title="My Leads"
			subtitle="Sorted by last activity — freshest first. Search the command bar before adding a page."
		/>

		<!-- toolbar shell: real segment tabs (static labels) + filter chrome -->
		<div class="mb-3.5 flex flex-wrap items-center gap-2.5">
			<div class="flex gap-1 rounded-control bg-panel-sunken p-[3px]">
				{#each ['Mine', 'All', 'Unassigned', 'Lost'] as tab (tab)}
					<span
						class="flex h-[26px] items-center rounded-[6px] px-3 text-[12.5px] font-medium text-ink-300"
						>{tab}</span
					>
				{/each}
			</div>
			{#each Array(3) as _, i (i)}
				<Skeleton class="h-8 w-24 rounded-control" />
			{/each}
			<Skeleton class="ml-auto h-8 w-44 rounded-control" />
		</div>

		<TableSkeleton rows={8} cols={5} />
	</div>
{:else if isPipeline}
	<div class="flex h-full flex-col px-7 pb-7 pt-6">
		<PageHeader title="Pipeline" />
		<p class="-mt-2 mb-4 text-[13.5px] text-ink-500">
			Drag a card to move stages. Dropping into <span class="font-semibold text-fresh">won</span> opens
			win capture.
		</p>
		<div class="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
			{#each Array(5) as _, i (i)}
				<CardSkeleton />
			{/each}
		</div>
	</div>
{:else if isUnassigned}
	<div class="px-7 pb-16 pt-6">
		<PageHeader title="Up for grabs" subtitle="Unassigned leads — claim what you can work." />
		<TableSkeleton rows={8} cols={6} />
	</div>
{:else if isReminders}
	<div class="px-7 pb-16 pt-6">
		<PageHeader
			title="Reminders"
			subtitle="Follow-ups booked from your logged touches. Activities drive these dates — log a touch to rebook."
		/>
		<DashboardSectionSkeleton sections={2} />
	</div>
{:else if isReports}
	<div class="px-7 pb-16 pt-6">
		<PageHeader
			title="Reports"
			subtitle="Pipeline health and rep activity. Deal value is shown per currency — never summed across PHP and SGD."
		/>
		<div class="grid grid-cols-1 gap-[18px] lg:grid-cols-[1.1fr_1fr]">
			<CardSkeleton />
			<CardSkeleton />
		</div>
	</div>
{:else if isTeam}
	<div class="px-7 pb-16 pt-6">
		<PageHeader
			title="Team management"
			subtitle="This list is the magic-link allowlist. Add a rep here and they can sign in."
		/>
		<TableSkeleton rows={6} cols={5} />
	</div>
{:else}
	<div class="px-7 pb-16 pt-6">
		<Skeleton class="mb-6 h-8 w-48" />
		<TableSkeleton rows={5} cols={4} />
	</div>
{/if}
