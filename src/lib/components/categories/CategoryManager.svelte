<script lang="ts">
	// Manager-only rename / soft-delete modal for lead categories (CAT-1, GitHub #248).
	// Wraps the shared Modal.svelte. Rename PATCHes /api/categories/[id]; Delete DELETEs
	// it (with a confirm). Uses raw fetch() + client-side safeParse + invalidateAll().
	import { invalidateAll } from '$app/navigation';
	import Modal from '$lib/components/shared/Modal.svelte';
	import { Button } from '$lib/components/ui/button';
	import { categoryRenameSchema } from '$lib/zod/schemas';
	import { toasts } from '$lib/stores/toasts.svelte';
	import type { CrmCategory } from '$lib/server/db/schema';

	let {
		open,
		categories,
		onClose,
		onUpdate
	}: {
		open: boolean;
		categories: CrmCategory[];
		onClose: () => void;
		onUpdate: () => void;
	} = $props();

	// Local editable name buffer keyed by category id, resynced whenever the modal
	// opens or the server list changes.
	let names = $state<Record<string, string>>({});
	let busyId = $state<string | null>(null);
	let wasOpen = false;

	$effect(() => {
		if (open && !wasOpen) {
			const next: Record<string, string> = {};
			for (const c of categories) next[c.id] = c.name;
			names = next;
		}
		wasOpen = open;
	});

	async function handleRename(id: string) {
		if (busyId) return;
		const name = (names[id] ?? '').trim();
		const parsed = categoryRenameSchema.safeParse({ name });
		if (!parsed.success) {
			toasts.push('Enter a category name (1–50 characters)');
			return;
		}
		busyId = id;
		try {
			const res = await fetch(`/api/categories/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(parsed.data)
			});
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				toasts.push(res.status === 409 ? 'That name is already taken' : `Rename failed: ${msg}`);
				return;
			}
			await invalidateAll();
			onUpdate();
			toasts.success('Category renamed');
		} catch {
			toasts.push('Rename failed — server error');
		} finally {
			busyId = null;
		}
	}

	async function handleDelete(id: string, name: string) {
		if (busyId) return;
		if (!confirm(`Delete '${name}'? This removes it from all leads.`)) return;
		busyId = id;
		try {
			const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
			if (!res.ok) {
				const msg = await res.text().catch(() => 'Server error');
				toasts.push(`Delete failed: ${msg}`);
				return;
			}
			await invalidateAll();
			onUpdate();
			toasts.success('Category deleted');
		} catch {
			toasts.push('Delete failed — server error');
		} finally {
			busyId = null;
		}
	}
</script>

<Modal
	{open}
	onclose={onClose}
	title="Manage categories"
	subtitle="Rename or delete categories. Deleting removes a category from every lead."
	width={480}
>
	{#if categories.length === 0}
		<div class="py-6 text-center text-[12.5px] text-ink-400">No categories yet.</div>
	{:else}
		<div class="flex flex-col gap-2">
			{#each categories as c (c.id)}
				<div class="flex items-center gap-2">
					<input
						type="text"
						bind:value={names[c.id]}
						maxlength="50"
						disabled={busyId === c.id}
						class="h-[32px] flex-1 rounded-control border border-hairline bg-panel px-2.5 font-mono text-[12.5px] text-ink focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
					/>
					<Button
						variant="outline"
						size="sm"
						disabled={busyId === c.id || (names[c.id] ?? '').trim() === c.name}
						onclick={() => handleRename(c.id)}
						class="h-[32px] text-[12.5px]"
					>
						Rename
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={busyId === c.id}
						onclick={() => handleDelete(c.id, c.name)}
						class="h-[32px] text-[12.5px] text-red-500 hover:border-red-300 hover:bg-red-50"
					>
						Delete
					</Button>
				</div>
			{/each}
		</div>
	{/if}

	{#snippet footer()}
		<Button variant="outline" class="flex-1" onclick={onClose}>Close</Button>
	{/snippet}
</Modal>
