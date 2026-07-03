<script lang="ts">
	import { goto, invalidateAll, afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import Modal from '$lib/components/shared/Modal.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { isManager } from '$lib/utils/permissions';
	import { templateFormSchema, LEAD_CATEGORIES } from '$lib/zod/schemas';
	import type { MessageTemplate } from '$lib/types';
	import { SvelteMap } from 'svelte/reactivity';
	import { categoryColor } from '$lib/design/tokens';

	let { data } = $props();
	const canManage = $derived(isManager(data.currentUser));

	// View toggle persists client-side only.
	let viewMode = $state<'card' | 'list'>('card');

	// Search input has a local mirror for instant typing feedback + debounce.
	// $derived allows re-sync on back/forward navigation; assignment still works for live typing.
	let searchInput = $derived(data.filters.q ?? '');
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	let paging = $state(false);
	afterNavigate(() => {
		paging = false;
	});

	function navigate(patch: Record<string, string | undefined>) {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		for (const [k, v] of Object.entries(patch)) {
			if (v === undefined || v === '') params.delete(k);
			else params.set(k, v);
		}
		goto(`?${params}`, { keepFocus: true });
	}

	function onSearchInput(e: Event & { currentTarget: HTMLInputElement }) {
		const val = e.currentTarget.value;
		searchInput = val;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => navigate({ q: val || undefined, page: undefined }), 300);
	}

	// Group the current page of templates by category (server already sorted).
	const grouped = $derived.by(() => {
		const map = new SvelteMap<string, MessageTemplate[]>();
		for (const t of data.templates) {
			const list = map.get(t.category) ?? [];
			list.push(t);
			map.set(t.category, list);
		}
		return [...map.entries()];
	});

	// When sorted chronologically, render a flat list across all categories so
	// the global time order is visible. Category grouping only makes sense for
	// the default title (alphabetical) sort.
	const isChronologicalSort = $derived(
		data.filters.sort === 'newest' || data.filters.sort === 'oldest'
	);

	// --- Create / edit modal state ---
	let formOpen = $state(false);
	let editingId = $state<string | null>(null);
	let title = $state('');
	let category = $state<string>('Other');
	let body = $state('');
	let formError = $state('');
	let saving = $state(false);
	let deleteTarget = $state<MessageTemplate | null>(null);

	function openCreate() {
		editingId = null;
		title = '';
		category = 'Other';
		body = '';
		formError = '';
		formOpen = true;
	}

	function openEdit(t: MessageTemplate) {
		editingId = t.id;
		title = t.title;
		category = t.category;
		body = t.body;
		formError = '';
		formOpen = true;
	}

	async function save() {
		if (saving) return;
		const parsed = templateFormSchema.safeParse({ title, category, body });
		if (!parsed.success) {
			formError = parsed.error.issues[0]?.message ?? 'Check the form.';
			return;
		}
		saving = true;
		try {
			const res = editingId
				? await fetch('/api/templates', {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ id: editingId, ...parsed.data })
					})
				: await fetch('/api/templates', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(parsed.data)
					});
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				formError = text || 'Unable to save template — try again.';
				return;
			}
			formOpen = false;
			await invalidateAll();
			toasts.success(editingId ? 'Template updated' : 'Template created');
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Unable to save template.';
		} finally {
			saving = false;
		}
	}

	async function copy(t: MessageTemplate) {
		try {
			await navigator.clipboard.writeText(t.body);
			toasts.push('Copied to clipboard');
		} catch (err) {
			toasts.push(err instanceof Error ? err.message : 'Unable to copy to clipboard.', {
				tone: 'warn'
			});
		}
	}

	function remove(t: MessageTemplate) {
		deleteTarget = t;
	}

	async function confirmDelete() {
		const t = deleteTarget;
		if (!t) return;
		try {
			const res = await fetch('/api/templates', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: t.id })
			});
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				toasts.push(text || 'Unable to delete template.', { tone: 'warn' });
				return;
			}
			await invalidateAll();
			toasts.push(`Deleted “${t.title}”`);
		} catch (err) {
			toasts.push(err instanceof Error ? err.message : 'Unable to delete template.', {
				tone: 'warn'
			});
		} finally {
			deleteTarget = null;
		}
	}
</script>

<svelte:head><title>Message templates · Veent CRM</title></svelte:head>

<div class="px-7 pb-16 pt-6">
	<PageHeader
		title="Message templates"
		subtitle="Reusable outreach messages reps can insert from a lead. Managed by managers, organized by event category."
	>
		{#snippet actions()}
			{#if canManage}
				<Button onclick={openCreate}>
					<Icon name="plus" size={15} stroke={2.2} /> Add template
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if !canManage}
		<div
			class="mb-4 rounded-control border border-border bg-panel-subtle px-4 py-2.5 text-[12.5px] text-ink-500"
		>
			Template management is manager-only.
		</div>
	{/if}

	<!-- toolbar: view toggle + search + category filter + sort -->
	<div class="mb-4 flex flex-wrap items-center gap-2.5">
		<div class="inline-flex gap-1 rounded-control border border-border bg-panel-subtle p-1">
			<button
				type="button"
				class="rounded-[6px] px-3 py-1 text-[12.5px] font-medium transition-colors {viewMode ===
				'card'
					? 'bg-white text-ink-600 shadow-sm'
					: 'text-ink-400 hover:text-ink-600'}"
				onclick={() => (viewMode = 'card')}
			>
				Cards
			</button>
			<button
				type="button"
				class="rounded-[6px] px-3 py-1 text-[12.5px] font-medium transition-colors {viewMode ===
				'list'
					? 'bg-white text-ink-600 shadow-sm'
					: 'text-ink-400 hover:text-ink-600'}"
				onclick={() => (viewMode = 'list')}
			>
				List
			</button>
		</div>

		<Select
			type="single"
			value={data.filters.category ?? ''}
			onValueChange={(v) => navigate({ category: v || undefined, page: undefined })}
		>
			<SelectTrigger size="sm" class="w-36" aria-label="Filter by category"
				>{data.filters.category || 'All categories'}</SelectTrigger
			>
			<SelectContent>
				<SelectItem value="" label="All categories">All categories</SelectItem>
				{#each LEAD_CATEGORIES as c (c)}<SelectItem value={c} label={c}>{c}</SelectItem>{/each}
			</SelectContent>
		</Select>

		<Select
			type="single"
			value={data.filters.sort}
			onValueChange={(v) => navigate({ sort: v === 'title' ? undefined : v, page: undefined })}
		>
			<SelectTrigger size="sm" class="w-32" aria-label="Sort templates">
				{data.filters.sort === 'newest'
					? 'Newest'
					: data.filters.sort === 'oldest'
						? 'Oldest'
						: 'Title A–Z'}
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="title" label="Title A–Z">Title A–Z</SelectItem>
				<SelectItem value="newest" label="Newest">Newest</SelectItem>
				<SelectItem value="oldest" label="Oldest">Oldest</SelectItem>
			</SelectContent>
		</Select>

		<Input
			value={searchInput}
			oninput={onSearchInput}
			placeholder="Search templates…"
			aria-label="Search templates"
			class="ml-auto h-8 w-52"
		/>
	</div>

	{#snippet categoryHeader(cat: string, accent: string, count: number)}
		<div class="mb-2 flex items-center gap-2">
			<div class="flex items-center gap-1.5 font-mono text-[11px] text-ink-500">
				<span
					class="inline-block size-[7px] shrink-0 rounded-full"
					style="background-color:{accent}"
				></span>
				{cat}
			</div>
			<span class="text-[12px] text-ink-300">{count}</span>
		</div>
	{/snippet}

	{#if data.pagination.total === 0}
		<Card class="rounded-control px-6 py-10 text-center text-[13px] text-ink-300">
			{data.filters.q || data.filters.category
				? 'No templates match your filters.'
				: canManage
					? 'No templates yet. Add your first one above.'
					: 'No templates yet.'}
		</Card>
	{:else if viewMode === 'card'}
		{#if isChronologicalSort}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.templates as t (t.id)}
					<Card class="relative flex flex-col gap-3 rounded-control p-4">
						<Button
							variant="ghost"
							size="icon"
							class="absolute right-2 top-2 size-8 text-ink-400 hover:text-ink-600"
							aria-label="Copy template"
							title="Copy"
							onclick={() => copy(t)}
						>
							<Icon name="copy" size={15} />
						</Button>
						<div class="text-[13px] font-semibold text-ink-600">{t.title}</div>
						<p class="line-clamp-3 text-[12.5px] text-ink-500">{t.body}</p>
						{#if canManage}
							<div class="mt-auto flex gap-1.5 pt-1">
								<Button variant="outline" size="sm" onclick={() => openEdit(t)}>Edit</Button>
								<Button variant="outline" size="sm" onclick={() => remove(t)}>Delete</Button>
							</div>
						{/if}
					</Card>
				{/each}
			</div>
		{:else}
			<div class="flex flex-col gap-6">
				{#each grouped as [cat, items] (cat)}
					{@const accent = categoryColor(cat)}
					<section>
						{@render categoryHeader(cat, accent, items.length)}
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{#each items as t (t.id)}
								<Card class="relative flex flex-col gap-3 rounded-control p-4">
									<Button
										variant="ghost"
										size="icon"
										class="absolute right-2 top-2 size-8 text-ink-400 hover:text-ink-600"
										aria-label="Copy template"
										title="Copy"
										onclick={() => copy(t)}
									>
										<Icon name="copy" size={15} />
									</Button>
									<div class="text-[13px] font-semibold text-ink-600">{t.title}</div>
									<p class="line-clamp-3 text-[12.5px] text-ink-500">{t.body}</p>
									{#if canManage}
										<div class="mt-auto flex gap-1.5 pt-1">
											<Button variant="outline" size="sm" onclick={() => openEdit(t)}>Edit</Button>
											<Button variant="outline" size="sm" onclick={() => remove(t)}>Delete</Button>
										</div>
									{/if}
								</Card>
							{/each}
						</div>
					</section>
				{/each}
			</div>
		{/if}
	{:else if isChronologicalSort}
		<Card class="gap-0 overflow-hidden rounded-control py-0">
			{#each data.templates as t (t.id)}
				<div
					class="flex items-start justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0"
				>
					<div class="min-w-0">
						<div class="text-[13px] font-semibold text-ink-600">{t.title}</div>
						<p class="mt-1 whitespace-pre-wrap text-[12.5px] text-ink-500">{t.body}</p>
					</div>
					{#if canManage}
						<div class="flex shrink-0 gap-1.5">
							<Button variant="outline" size="sm" onclick={() => openEdit(t)}>Edit</Button>
							<Button variant="outline" size="sm" onclick={() => copy(t)}>Copy</Button>
							<Button variant="outline" size="sm" onclick={() => remove(t)}>Delete</Button>
						</div>
					{/if}
				</div>
			{/each}
		</Card>
	{:else}
		<div class="flex flex-col gap-6">
			{#each grouped as [cat, items] (cat)}
				{@const accent = categoryColor(cat)}
				<section>
					{@render categoryHeader(cat, accent, items.length)}
					<Card class="gap-0 overflow-hidden rounded-control py-0">
						{#each items as t (t.id)}
							<div
								class="flex items-start justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0"
							>
								<div class="min-w-0">
									<div class="text-[13px] font-semibold text-ink-600">{t.title}</div>
									<p class="mt-1 whitespace-pre-wrap text-[12.5px] text-ink-500">{t.body}</p>
								</div>
								{#if canManage}
									<div class="flex shrink-0 gap-1.5">
										<Button variant="outline" size="sm" onclick={() => openEdit(t)}>Edit</Button>
										<Button variant="outline" size="sm" onclick={() => copy(t)}>Copy</Button>
										<Button variant="outline" size="sm" onclick={() => remove(t)}>Delete</Button>
									</div>
								{/if}
							</div>
						{/each}
					</Card>
				</section>
			{/each}
		</div>
	{/if}

	<!-- pagination -->
	{#if data.pagination.totalPages > 1}
		{@const { page: pg, pageSize, total, totalPages } = data.pagination}
		{@const start = (pg - 1) * pageSize + 1}
		{@const end = Math.min(pg * pageSize, total)}
		<div class="mt-5 flex items-center justify-between text-[13px] text-ink-300">
			<span class="font-mono">{start}–{end} of {total}</span>
			<div class="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={pg <= 1 || paging}
					onclick={() => {
						paging = true;
						navigate({ page: String(pg - 1) });
					}}>← Prev</Button
				>
				<span class="font-mono">Page {pg} of {totalPages}</span>
				<Button
					variant="outline"
					size="sm"
					disabled={pg >= totalPages || paging}
					onclick={() => {
						paging = true;
						navigate({ page: String(pg + 1) });
					}}>Next →</Button
				>
			</div>
		</div>
	{/if}
</div>

<Modal
	open={formOpen}
	title={editingId ? 'Edit template' : 'Add template'}
	subtitle="Use {'{{organizerName}}'}, {'{{eventName}}'}, and {'{{repName}}'} as placeholders."
	width={520}
	onclose={() => (formOpen = false)}
>
	<div class="flex flex-col gap-3">
		<div class="grid gap-1.5">
			<Label for="tpl-title">Title</Label>
			<Input id="tpl-title" bind:value={title} placeholder="Intro — event organizer" />
		</div>
		<div class="grid gap-1.5">
			<Label for="tpl-category">Category</Label>
			<Select type="single" bind:value={category}>
				<SelectTrigger id="tpl-category" class="w-full">{category}</SelectTrigger>
				<SelectContent>
					{#each LEAD_CATEGORIES as c (c)}<SelectItem value={c} label={c}>{c}</SelectItem>{/each}
				</SelectContent>
			</Select>
		</div>
		<div class="grid gap-1.5">
			<Label for="tpl-body">Message</Label>
			<Textarea
				id="tpl-body"
				bind:value={body}
				rows={6}
				placeholder="Hi {'{{organizerName}}'}, …"
			/>
		</div>
		{#if formError}<p class="text-[12px] text-overdue">{formError}</p>{/if}
	</div>
	{#snippet footer()}
		<Button variant="outline" class="flex-1" onclick={() => (formOpen = false)}>Cancel</Button>
		<Button class="flex-[2]" onclick={save} disabled={saving}
			>{editingId ? 'Save changes' : 'Add template'}</Button
		>
	{/snippet}
</Modal>

<Modal
	open={deleteTarget !== null}
	title="Delete template?"
	subtitle={deleteTarget
		? `"${deleteTarget.title}" will be removed. Reps will no longer see it.`
		: ''}
	onclose={() => (deleteTarget = null)}
>
	<div></div>
	{#snippet footer()}
		<Button variant="outline" class="flex-1" onclick={() => (deleteTarget = null)}>Cancel</Button>
		<Button class="flex-[2] bg-red-600 hover:bg-red-700" onclick={confirmDelete}>Delete</Button>
	{/snippet}
</Modal>
