<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import Modal from '$lib/components/shared/Modal.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { isManager } from '$lib/utils/permissions';
	import { templateFormSchema, LEAD_CATEGORIES } from '$lib/zod/schemas';
	import type { MessageTemplate } from '$lib/types';
	import { SvelteMap } from 'svelte/reactivity';
	import { categoryColor } from '$lib/design/tokens';

	let { data } = $props();
	const canManage = $derived(isManager(data.currentUser));

	// View toggle: card grid (default) vs the existing category-grouped list.
	let viewMode = $state<'card' | 'list'>('card');

	// Group non-deleted templates by category (server already sorts category→title).
	const grouped = $derived.by(() => {
		const map = new SvelteMap<string, MessageTemplate[]>();
		for (const t of data.templates) {
			const list = map.get(t.category) ?? [];
			list.push(t);
			map.set(t.category, list);
		}
		return [...map.entries()];
	});

	// --- Create / edit modal state ---
	let formOpen = $state(false);
	let editingId = $state<string | null>(null);
	let title = $state('');
	let category = $state<string>('Other');
	let body = $state('');
	let formError = $state('');

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
		const parsed = templateFormSchema.safeParse({ title, category, body });
		if (!parsed.success) {
			formError = parsed.error.issues[0]?.message ?? 'Check the form.';
			return;
		}
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
				formError = 'Unable to save template — try again.';
				return;
			}
			formOpen = false;
			await invalidateAll();
			toasts.success(editingId ? 'Template updated' : 'Template created');
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Unable to save template.';
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

	async function remove(t: MessageTemplate) {
		if (!confirm(`Delete the template “${t.title}”? Reps will no longer see it.`)) return;
		try {
			const res = await fetch('/api/templates', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: t.id })
			});
			if (!res.ok) {
				toasts.push('Unable to delete template.', { tone: 'warn' });
				return;
			}
			await invalidateAll();
			toasts.push(`Deleted “${t.title}”`);
		} catch (err) {
			toasts.push(err instanceof Error ? err.message : 'Unable to delete template.', {
				tone: 'warn'
			});
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

	<div class="mb-4 inline-flex gap-1 rounded-control border border-border bg-panel-subtle p-1">
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

	{#if data.templates.length === 0}
		<Card class="rounded-control px-6 py-10 text-center text-[13px] text-ink-300">
			No templates yet. {#if canManage}Add your first one above.{/if}
		</Card>
	{:else if viewMode === 'card'}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.templates as t (t.id)}
				{@const accent = categoryColor(t.category)}
				<Card
					class="flex flex-col gap-3 rounded-control p-4"
					style="box-shadow: inset 3px 0 0 {accent}, 0 1px 2px rgba(26, 23, 28, 0.05)"
				>
					<Badge
						variant="outline"
						class="w-fit font-mono text-[11px]"
						style="color:{accent};background:color-mix(in srgb, {accent} 12%, white);border-color:transparent"
					>
						{t.category}
					</Badge>
					<div class="text-[13px] font-semibold text-ink-600">{t.title}</div>
					<p class="line-clamp-3 text-[12.5px] text-ink-500">{t.body}</p>
					{#if canManage}
						<div class="mt-auto flex gap-1.5 pt-1">
							<Button variant="outline" size="sm" onclick={() => openEdit(t)}>Edit</Button>
							<Button variant="outline" size="sm" onclick={() => copy(t)}>Copy</Button>
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
					<div class="mb-2 flex items-center gap-2">
						<Badge
							variant="outline"
							class="font-mono text-[11px]"
							style="color:{accent};background:color-mix(in srgb, {accent} 12%, white);border-color:transparent"
						>
							{cat}
						</Badge>
						<span class="text-[12px] text-ink-300">{items.length}</span>
					</div>
					<Card
						class="gap-0 overflow-hidden rounded-control py-0"
						style="box-shadow: inset 3px 0 0 {accent}, 0 1px 2px rgba(26, 23, 28, 0.05)"
					>
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
		<Button class="flex-[2]" onclick={save}>{editingId ? 'Save changes' : 'Add template'}</Button>
	{/snippet}
</Modal>
