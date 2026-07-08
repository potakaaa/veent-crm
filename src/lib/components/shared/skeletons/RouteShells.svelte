<script lang="ts">
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import LeadRowSkeleton from './LeadRowSkeleton.svelte';
	import TableSkeleton from './TableSkeleton.svelte';
	import CardSkeleton from './CardSkeleton.svelte';
	import DetailSkeleton from './DetailSkeleton.svelte';
	import DashboardSectionSkeleton from './DashboardSectionSkeleton.svelte';
	import DashboardCardGridSkeleton from './DashboardCardGridSkeleton.svelte';

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
	const isTemplates = $derived(pathname === '/templates');
	const isMeetingDetail = $derived(pathname.startsWith('/meetings/') && pathname !== '/meetings');
	const isMeetings = $derived(pathname === '/meetings');
	const isCalendar = $derived(pathname === '/calendar');
	const isDashboard = $derived(pathname === '/dashboard');

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

		<TableSkeleton rows={8} cols={5} variant="stack" />
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
		<PageHeader title="Unassigned Leads" subtitle="Unassigned leads — claim what you can work." />
		<TableSkeleton rows={8} cols={6} variant="stack" />
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
		<PageHeader title="Reports" subtitle="Pipeline health and rep activity." />
		<!-- Outreach metrics skeleton -->
		<div class="mb-[18px] rounded-control border border-hairline bg-panel p-5">
			<Skeleton class="mb-4 h-4 w-36" />
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
				{#each Array(3) as _, i (i)}
					<div class="rounded-control border border-hairline bg-panel-sunken p-4">
						<Skeleton class="mb-2 h-3 w-28" />
						<Skeleton class="mb-1.5 h-8 w-16" />
						<Skeleton class="h-3 w-36" />
					</div>
				{/each}
			</div>
		</div>
		<!-- Funnel + leaderboard skeleton -->
		<div class="mb-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-[1.1fr_1fr]">
			<CardSkeleton />
			<CardSkeleton />
		</div>
		<!-- Won deals skeleton -->
		<CardSkeleton />
	</div>
{:else if isTeam}
	<div class="px-7 pb-16 pt-6">
		<PageHeader
			title="Team management"
			subtitle="This list is the magic-link allowlist. Add a rep here and they can sign in."
		/>
		<TableSkeleton rows={6} cols={5} variant="scroll" />
	</div>
{:else if isTemplates}
	<div class="px-7 pb-16 pt-6">
		<PageHeader
			title="Message templates"
			subtitle="Reusable outreach messages reps can insert from a lead. Managed by managers, organized by event category."
		/>

		<!-- view-toggle shell: real static labels (no interactivity) -->
		<div class="mb-4 inline-flex gap-1 rounded-control border border-border bg-panel-subtle p-1">
			<span
				class="rounded-[6px] bg-white px-3 py-1 text-[12.5px] font-medium text-ink-600 shadow-sm"
				>Cards</span
			>
			<span class="rounded-[6px] px-3 py-1 text-[12.5px] font-medium text-ink-400">List</span>
		</div>

		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each Array(6) as _, i (i)}
				<CardSkeleton />
			{/each}
		</div>
	</div>
{:else if isMeetingDetail}
	<div class="mx-auto max-w-[760px] px-7 pb-16 pt-5">
		<!-- back link: real static text (no Icon import) -->
		<div class="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-400">
			All meetings
		</div>

		<div class="mb-5">
			<Skeleton class="h-7 w-72" />
			<Skeleton class="mt-1 h-3.5 w-40" />
		</div>

		<div class="grid gap-3 rounded-control border border-hairline bg-panel p-4">
			<div class="grid grid-cols-[120px_1fr] gap-2 text-[13px]">
				<span class="font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">Organizer</span>
				<Skeleton class="h-3.5 w-40" />
			</div>
			<div class="grid grid-cols-[120px_1fr] gap-2 text-[13px]">
				<span class="font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">Attendees</span>
				<Skeleton class="h-3.5 w-40" />
			</div>
		</div>
	</div>
{:else if isMeetings}
	<div class="px-7 pb-16 pt-6">
		<div class="mb-4">
			<h1 class="font-serif text-[24px] font-semibold tracking-[-0.5px] text-ink">Meetings</h1>
			<div class="mt-1 text-[12.5px] text-ink-400">Every meeting across all leads.</div>
		</div>
		<!-- mirrors MeetingsPanel real markup: panel container + header + row cards -->
		<div class="rounded-control border border-hairline bg-panel p-4">
			<div class="mb-3 font-mono text-[11px] uppercase tracking-[0.5px] text-ink-300">Meetings</div>
			<div class="flex flex-col gap-2.5">
				{#each Array(5) as _, i (i)}
					<div class="rounded-control border border-hairline bg-panel-subtle p-3">
						<Skeleton class="h-3.5 w-32" />
						<Skeleton class="mt-1 h-3 w-24" />
					</div>
				{/each}
			</div>
		</div>
	</div>
{:else if isCalendar}
	<div class="px-7 pb-16 pt-6">
		<PageHeader title="Calendar" subtitle="Team meetings and your follow-ups on one grid.">
			{#snippet actions()}
				<!-- Month/Week toggle: real static labels (no interactivity) -->
				<div class="flex rounded-control bg-panel-sunken p-[3px]">
					<span
						class="flex h-[26px] items-center gap-1.5 rounded-[6px] bg-panel px-3 text-[12.5px] font-semibold text-ink shadow-frame"
						>Month</span
					>
					<span
						class="flex h-[26px] items-center gap-1.5 rounded-[6px] px-3 text-[12.5px] font-medium text-[#7d6a68]"
						>Week</span
					>
				</div>
			{/snippet}
		</PageHeader>

		<div class="mb-3.5 flex items-center gap-2.5">
			<!-- prev/next: skeleton squares (chevron glyphs carry no text) -->
			<Skeleton class="h-8 w-8 rounded-control border border-hairline bg-panel" />
			<Skeleton class="h-8 w-8 rounded-control border border-hairline bg-panel" />
			<!-- Today: real static text in a non-interactive real-shaped container -->
			<div
				class="flex h-8 items-center gap-1.5 rounded-control border border-hairline bg-panel px-3 text-[12.5px] font-medium text-ink-500"
			>
				Today
			</div>
			<!-- range label is dynamic (date/view query params) -->
			<Skeleton class="ml-1 h-4 w-40" />
		</div>

		<!-- below sm the 7-column grid would crush each day cell, so the wrapper scrolls
		     horizontally and the bordered container keeps a usable min-width (mirrors
		     CalendarGrid); min-w-0 at sm+ collapses back to today's exact layout. -->
		<div class="overflow-x-auto">
			<div
				class="min-w-[640px] overflow-hidden rounded-control border border-hairline bg-panel sm:min-w-0"
			>
				<!-- weekday header: real static labels (mirrors CalendarGrid) -->
				<div class="grid grid-cols-7 border-b border-hairline bg-panel-sunken">
					{#each ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as label (label)}
						<div
							class="px-2 py-1.5 text-center font-mono text-[10px] uppercase tracking-[1px] text-ink-400"
						>
							{label}
						</div>
					{/each}
				</div>
				<!-- day cells: day-number circle is dynamic (skeleton) -->
				<div class="grid grid-cols-7">
					{#each Array(42) as _, i (i)}
						<div
							class="flex min-h-[104px] flex-col gap-1 border-b border-r border-hairline bg-panel p-1.5"
						>
							<Skeleton class="h-5 w-5 rounded-full" />
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
{:else if isDashboard}
	<div class="px-7 pb-16 pt-6">
		<PageHeader title="Team dashboard" subtitle="Per-AE performance across the selected range." />
		<DashboardCardGridSkeleton />
	</div>
{:else}
	<div class="px-7 pb-16 pt-6">
		<Skeleton class="mb-6 h-8 w-48" />
		<TableSkeleton rows={5} cols={4} />
	</div>
{/if}
