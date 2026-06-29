<script lang="ts">
	import { untrack } from 'svelte';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import { crm } from '$lib/services';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { LEAD_CATEGORIES, LEAD_PLATFORMS } from '$lib/zod/schemas';
	import type { Category, Platform, ReviewItem } from '$lib/types';

	let { data } = $props();

	// Editable local copy of the import rows, seeded once from the server load.
	let rows = $state<ReviewItem[]>(untrack(() => structuredClone(data.items)));

	async function resolve(item: ReviewItem) {
		if (!item.name.trim()) {
			toasts.push('Give the row a name before resolving', { tone: 'warn' });
			return;
		}
		await crm.resolveReviewItem(item.id);
		rows = rows.filter((r) => r.id !== item.id);
		toasts.success('Resolved — rejoined the pool');
	}

	async function discard(item: ReviewItem) {
		await crm.resolveReviewItem(item.id);
		rows = rows.filter((r) => r.id !== item.id);
		toasts.push('Row discarded');
	}
</script>

<svelte:head><title>Review queue · Veent CRM</title></svelte:head>

<div class="mx-auto max-w-[940px] px-7 pb-16 pt-6">
	<PageHeader
		title="Review queue"
		subtitle={`${rows.length} leads from the sheet import need a human. Fix the field, then mark resolved — they rejoin the pool.`}
	/>

	{#each rows as r (r.id)}
		<Card class="mb-3 gap-0 rounded-control py-4">
			<CardContent>
				<div class="mb-3 flex items-center gap-2.5">
					<Badge
						variant="outline"
						class="border-overdue/25 bg-[rgba(225,29,72,0.1)] font-mono text-[10.5px] text-overdue"
					>
						{r.issue}
					</Badge>
					<span class="truncate font-mono text-[11.5px] text-ink-200">{r.raw}</span>
					<span class="ml-auto font-mono text-[11px] text-ink-100">row {r.rowNo}</span>
				</div>
				<div class="grid grid-cols-1 items-end gap-2.5 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
					<div class="grid gap-1">
						<Label for="rev-name-{r.id}" class="text-[11px] text-ink-300"
							>Page / organizer name</Label
						>
						<Input
							id="rev-name-{r.id}"
							bind:value={r.name}
							placeholder="Type a name"
							class="font-mono {r.name.trim() ? '' : 'border-overdue'}"
						/>
					</div>
					<div class="grid gap-1">
						<Label class="text-[11px] text-ink-300">Category</Label>
						<Select
							type="single"
							value={r.category}
							onValueChange={(v) => (r.category = v as Category)}
						>
							<SelectTrigger class="w-full">{r.category}</SelectTrigger>
							<SelectContent>
								<SelectItem value="Uncategorized" label="Uncategorized">Uncategorized</SelectItem>
								{#each LEAD_CATEGORIES as c}<SelectItem value={c} label={c}>{c}</SelectItem>{/each}
							</SelectContent>
						</Select>
					</div>
					<div class="grid gap-1">
						<Label class="text-[11px] text-ink-300">Platform</Label>
						<Select
							type="single"
							value={r.platform}
							onValueChange={(v) => (r.platform = v as Platform)}
						>
							<SelectTrigger class="w-full">{r.platform}</SelectTrigger>
							<SelectContent>
								{#each LEAD_PLATFORMS as p}<SelectItem value={p} label={p}>{p}</SelectItem>{/each}
							</SelectContent>
						</Select>
					</div>
					<div class="flex gap-1.5">
						<Button variant="success" size="sm" class="h-9" onclick={() => resolve(r)}>
							{r.name.trim() ? 'Resolve' : 'Fix & resolve'}
						</Button>
						<Button variant="outline" size="sm" class="h-9" onclick={() => discard(r)}
							>Discard</Button
						>
					</div>
				</div>
			</CardContent>
		</Card>
	{:else}
		<EmptyState
			title="Queue clear"
			hint="Every imported row has a name and a home. Nothing to review."
			tone="success"
		/>
	{/each}
</div>
