<script lang="ts">
	// Assign an existing category to a lead, or create-and-assign a new one inline
	// (CAT-1, GitHub #248). Uses raw fetch() + client-side safeParse (the repo idiom —
	// Superforms is not used) and invalidateAll() to refresh the page after a mutation.
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { categoryCreateSchema, assignCategoriesSchema } from '$lib/zod/schemas';
	import { toasts } from '$lib/stores/toasts.svelte';
	import type { CrmCategory } from '$lib/server/db/schema';

	let {
		leadId,
		allCategories,
		assignedCategories,
		onUpdate
	}: {
		leadId: string;
		allCategories: CrmCategory[];
		assignedCategories: CrmCategory[];
		onUpdate: () => void;
	} = $props();

	let selectedId = $state('');
	let newName = $state('');
	let busy = $state(false);

	// Active categories not yet assigned to this lead — the assignable options.
	const available = $derived.by(() => {
		const assigned = new Set(assignedCategories.map((c) => c.id));
		return allCategories.filter((c) => !assigned.has(c.id));
	});

	async function assignCategory(categoryId: string) {
		const parsed = assignCategoriesSchema.safeParse({ categoryId });
		if (!parsed.success) {
			toasts.push('Invalid category selection');
			return false;
		}
		const res = await fetch(`/api/leads/${leadId}/categories`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(parsed.data)
		});
		if (!res.ok) {
			const msg = await res.text().catch(() => 'Server error');
			toasts.push(`Assign failed: ${msg}`);
			return false;
		}
		return true;
	}

	async function handleAssign() {
		if (busy || !selectedId) return;
		busy = true;
		try {
			if (await assignCategory(selectedId)) {
				selectedId = '';
				await invalidateAll();
				onUpdate();
				toasts.success('Category assigned');
			}
		} catch {
			toasts.push('Assign failed — server error');
		} finally {
			busy = false;
		}
	}

	async function handleCreateAndAssign() {
		if (busy) return;
		const name = newName.trim();
		const parsed = categoryCreateSchema.safeParse({ name });
		if (!parsed.success) {
			toasts.push('Enter a category name (1–50 characters)');
			return;
		}
		busy = true;
		try {
			const res = await fetch('/api/categories', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(parsed.data)
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				toasts.push(res.status === 409 ? 'That category already exists' : `Create failed: ${msg}`);
				return;
			}
			const { category } = (await res.json()) as { category: { id: string } };
			if (await assignCategory(category.id)) {
				newName = '';
				await invalidateAll();
				onUpdate();
				toasts.success('Category created and assigned');
			}
		} catch {
			toasts.push('Create failed — server error');
		} finally {
			busy = false;
		}
	}
</script>

<div class="flex flex-col gap-2.5">
	<!-- Assign an existing category -->
	<div class="flex items-center gap-2">
		<select
			bind:value={selectedId}
			disabled={busy || available.length === 0}
			class="h-[32px] flex-1 rounded-control border border-hairline bg-panel py-0 pl-2 pr-7 font-mono text-[12.5px] text-ink focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
		>
			<option value="">
				{available.length === 0 ? 'All categories assigned' : 'Add category…'}
			</option>
			{#each available as c (c.id)}
				<option value={c.id}>{c.name}</option>
			{/each}
		</select>
		<Button
			variant="outline"
			size="sm"
			disabled={busy || !selectedId}
			onclick={handleAssign}
			class="h-[32px] text-[12.5px]"
		>
			Assign
		</Button>
	</div>

	<!-- Create a new category and assign it -->
	<div class="flex items-center gap-2">
		<input
			type="text"
			bind:value={newName}
			maxlength="50"
			placeholder="New category name…"
			disabled={busy}
			onkeydown={(e) => e.key === 'Enter' && handleCreateAndAssign()}
			class="h-[32px] flex-1 rounded-control border border-hairline bg-panel px-2.5 font-mono text-[12.5px] text-ink placeholder:text-ink-200 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
		/>
		<Button
			variant="outline"
			size="sm"
			disabled={busy || newName.trim().length === 0}
			onclick={handleCreateAndAssign}
			class="h-[32px] whitespace-nowrap text-[12.5px]"
		>
			Create &amp; assign
		</Button>
	</div>
</div>
