<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { makeSortTable } from '$lib/utils/tableSort';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import Avatar from '$lib/components/shared/Avatar.svelte';
	import Modal from '$lib/components/shared/Modal.svelte';
	import Icon from '$lib/components/shared/Icon.svelte';
	import { Card } from '$lib/components/ui/card';
	import {
		Table,
		TableHeader,
		TableBody,
		TableRow,
		TableHead,
		TableCell
	} from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import { FieldError, fieldErrorAttrs } from '$lib/components/ui/field-error';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { canManageUsers, isSuperManager, canPromoteToSuperManager } from '$lib/utils/permissions';
	import { roleLabel, statusLabel } from '$lib/utils/roles';
	import { userFormSchema, userNameEditSchema, USER_ROLES } from '$lib/zod/schemas';
	import type { Role, User } from '$lib/types';

	let { data } = $props();
	const canManage = $derived(canManageUsers(data.currentUser));
	const isSuper = $derived(isSuperManager(data.currentUser));
	const canPromote = $derived(canPromoteToSuperManager(data.currentUser));

	const navLoading = $derived(navigating.to?.url.pathname === '/team');
	let paging = $state(false);
	$effect(() => {
		if (!navigating.to) paging = false;
	});

	function navigate(patch: Record<string, string | number | boolean | undefined>) {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		for (const [k, v] of Object.entries(patch)) {
			if (v === undefined || v === '' || v === false || v === 0) {
				params.delete(k);
			} else {
				params.set(k, String(v));
			}
		}
		goto(`?${params}`, { keepFocus: true });
	}

	const table = $derived(
		makeSortTable({
			data: data.users,
			columns: [
				{ id: 'name', header: 'Name' },
				{ id: 'email', header: 'Email' },
				{ id: 'role', header: 'Role' },
				{ id: 'active', header: 'Status' },
				{ id: '_leads', header: 'Leads', enableSorting: false },
				{ id: '_actions', header: '', enableSorting: false }
			],
			sort: data.sort ?? '',
			dir: data.dir,
			onToggle(id, descDir) {
				navigate({ sort: id, dir: descDir ? 'desc' : 'asc', page: undefined });
			}
		})
	);

	let addOpen = $state(false);
	let name = $state('');
	let email = $state('');
	let role = $state<string>('rep');
	// #227 — the add-user modal copy must reflect the selected role.
	const addLabel = $derived(role === 'manager' ? 'Add a manager' : 'Add a rep');
	let formError = $state('');
	// Per-field validation errors for the add-a-rep form, keyed by userFormSchema
	// field name (Phase 4 — shared field-error component).
	let fieldErrors = $state<Record<string, string[] | undefined>>({});

	async function addRep() {
		const parsed = userFormSchema.safeParse({ name, email, role, active: true });
		if (!parsed.success) {
			fieldErrors = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
			formError = '';
			return;
		}
		fieldErrors = {};
		try {
			const res = await fetch('/api/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, email, role })
			});
			if (res.status === 409) {
				formError = 'This email is already registered.';
				return;
			}
			if (!res.ok) {
				formError = 'Unable to add user — try again.';
				return;
			}
			addOpen = false;
			name = email = formError = '';
			fieldErrors = {};
			role = 'rep';
			await invalidateAll();
			toasts.success("Invite sent — they'll receive a sign-in link by email");
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Unable to add rep.';
		}
	}

	// Deactivate/reactivate via the real endpoint. Lead reassignment on deactivate
	// now happens server-side inside deactivateUser — no client-side lead move.
	async function toggleActive(u: User) {
		deactivating[u.id] = true;
		try {
			const res = await fetch(`/api/users/${u.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ active: !u.active })
			});
			if (!res.ok) {
				toasts.push(
					res.status === 403
						? 'You do not have permission to do that.'
						: `Unable to update ${u.name} — try again.`,
					{ tone: 'warn' }
				);
				return;
			}
			await invalidateAll();
			toasts.push(
				u.active
					? `Deactivated ${u.name} — their workable leads moved to Up for grabs`
					: `Reactivated ${u.name}`
			);
		} catch (err) {
			toasts.push(err instanceof Error ? err.message : `Unable to update ${u.name}`, {
				tone: 'warn'
			});
		} finally {
			deactivating[u.id] = false;
		}
	}

	// --- Promote/demote rep ↔ manager (with confirmation) --------------------
	let confirmRoleChange = $state<{ user: User; newRole: 'rep' | 'manager' } | null>(null);
	let roleChanging = $state(false);
	let deactivating = $state<Record<string, boolean>>({});

	// --- Edit a team member's name -------------------------------------------
	let editTarget = $state<User | null>(null);
	let editName = $state('');
	let editSaving = $state(false);
	let editFieldErrors = $state<Record<string, string[] | undefined>>({});

	function openEdit(u: User) {
		editTarget = u;
		editName = u.name;
		editFieldErrors = {};
	}

	async function saveEditName() {
		const target = editTarget;
		if (!target) return;
		const parsed = userNameEditSchema.safeParse({ name: editName });
		if (!parsed.success) {
			editFieldErrors = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
			return;
		}
		editFieldErrors = {};
		editSaving = true;
		try {
			const res = await fetch(`/api/users/${target.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: editName })
			});
			if (!res.ok) {
				toasts.push(
					res.status === 403
						? 'You do not have permission to do that.'
						: `Unable to update ${target.name} — try again.`,
					{ tone: 'warn' }
				);
				return;
			}
			editTarget = null;
			await invalidateAll();
			toasts.success('Name updated');
		} catch (err) {
			toasts.push(err instanceof Error ? err.message : `Unable to update ${target.name}`, {
				tone: 'warn'
			});
		} finally {
			editSaving = false;
		}
	}

	async function applyRoleChange() {
		const pending = confirmRoleChange;
		if (!pending) return;
		roleChanging = true;
		try {
			const res = await fetch(`/api/users/${pending.user.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: pending.newRole })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toasts.push(body.message ?? `Unable to change ${pending.user.name}'s role`, {
					tone: 'warn'
				});
				return;
			}
			confirmRoleChange = null;
			await invalidateAll();
			const label = pending.newRole === 'manager' ? 'promoted to Manager' : 'demoted to Rep';
			toasts.success(`${pending.user.name} ${label}`);
		} catch (err) {
			toasts.push(
				err instanceof Error ? err.message : `Unable to change ${pending.user.name}'s role`,
				{ tone: 'warn' }
			);
		} finally {
			roleChanging = false;
		}
	}

	// --- Promote to Super Manager (singleton transfer) ------------------------
	let promoteTarget = $state<User | null>(null);
	let promoting = $state(false);

	async function confirmPromote() {
		const target = promoteTarget;
		if (!target) return;
		promoting = true;
		try {
			const res = await fetch(`/api/users/${target.id}/promote-super`, { method: 'PATCH' });
			if (!res.ok) {
				toasts.push(
					res.status === 409
						? 'Another transfer just happened — refresh and try again.'
						: 'Unable to transfer the Super Manager role.',
					{ tone: 'warn' }
				);
				return;
			}
			promoteTarget = null;
			await invalidateAll();
			toasts.success(`${target.name} is now the Super Manager`);
		} catch (err) {
			toasts.push(err instanceof Error ? err.message : 'Unable to transfer the role.', {
				tone: 'warn'
			});
		} finally {
			promoting = false;
		}
	}
</script>

<svelte:head><title>Team · Veent CRM</title></svelte:head>

<div class="px-7 pb-16 pt-6">
	<PageHeader
		title="Team management"
		subtitle="This list is the magic-link allowlist. Add a rep here and they can sign in."
	>
		{#snippet actions()}
			{#if canManage}
				<Button onclick={() => (addOpen = true)}>
					<Icon name="plus" size={15} stroke={2.2} />
					{addLabel}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if !canManage}
		<div
			class="mb-4 rounded-control border border-border bg-panel-subtle px-4 py-2.5 text-[12.5px] text-ink-500"
		>
			Team management is manager-only. You can view the roster, but adding or deactivating reps
			needs a manager.
		</div>
	{/if}

	<Card class="gap-0 overflow-hidden rounded-control py-0">
		<Table>
			<TableHeader>
				{#each table.getHeaderGroups() as headerGroup, i (i)}
					<TableRow class="bg-[#faf9fb] hover:bg-[#faf9fb]">
						{#each headerGroup.headers as header (header.id)}
							{#if header.id === '_leads'}
								<TableHead class="text-right">{header.column.columnDef.header}</TableHead>
							{:else if header.id === '_actions'}
								<TableHead></TableHead>
							{:else if header.column.getCanSort()}
								<TableHead
									aria-sort={header.column.getIsSorted() === 'asc'
										? 'ascending'
										: header.column.getIsSorted() === 'desc'
											? 'descending'
											: 'none'}
								>
									<button
										onclick={header.column.getToggleSortingHandler()}
										class={header.column.getIsSorted()
											? 'cursor-pointer font-semibold text-ink-600 underline underline-offset-2'
											: 'cursor-pointer text-ink-300 hover:text-ink-600 hover:underline hover:underline-offset-2'}
									>
										{header.column.columnDef.header}{header.column.getIsSorted() === 'asc'
											? ' ↑'
											: header.column.getIsSorted() === 'desc'
												? ' ↓'
												: ''}
									</button>
								</TableHead>
							{:else}
								<TableHead>{header.column.columnDef.header}</TableHead>
							{/if}
						{/each}
					</TableRow>
				{/each}
			</TableHeader>
			<TableBody>
				{#if navLoading}
					{#each Array(6) as _, i (i)}
						<TableRow>
							{#each Array(6) as _, c (c)}
								<TableCell><Skeleton class="h-3.5 w-full" /></TableCell>
							{/each}
						</TableRow>
					{/each}
				{:else}
					{#each table.getRowModel().rows as row (row.original.id)}
						{@const u = row.original}
						<TableRow style="opacity:{u.active ? 1 : 0.55}">
							<TableCell>
								<div class="flex items-center gap-2.5">
									<Avatar name={u.name} size="md" />
									<span class="text-[13px] font-semibold">{u.name}</span>
								</div>
							</TableCell>
							<TableCell class="font-mono text-[12px] text-ink-600">{u.email}</TableCell>
							<TableCell>
								<Badge
									variant="outline"
									class="font-mono text-[11px]"
									style={u.role === 'super_manager'
										? 'color:#7c3aed;background:#f3effe;border-color:transparent'
										: u.role === 'manager'
											? 'color:#e11d2a;background:#fdeceb;border-color:transparent'
											: 'color:#6b6470;background:#f1eff3;border-color:transparent'}
								>
									{roleLabel(u.role)}
								</Badge>
							</TableCell>
							<TableCell>
								<Badge
									variant="outline"
									class="font-mono text-[11px]"
									style={u.active
										? 'color:#059669;background:#f0fbf5;border-color:transparent'
										: 'color:#b7b1bc;background:#f1eff3;border-color:transparent'}
								>
									{statusLabel(u.active)}
								</Badge>
							</TableCell>
							<TableCell class="text-right font-mono text-[13px]">{u.leadCount ?? '—'}</TableCell>
							<TableCell class="text-right">
								{#if canManage}
									{@const isSelf = u.id === data.currentUser.id}
									<div class="flex items-center justify-end gap-2">
										<Button
											variant="outline"
											size="icon"
											title="Edit name"
											onclick={() => openEdit(u)}
										>
											<Icon name="edit" size={14} stroke={2.2} />
										</Button>
										{#if isSuper && u.role === 'rep'}
											<Button
												variant="outline"
												size="icon"
												title="Promote to Manager"
												onclick={() => (confirmRoleChange = { user: u, newRole: 'manager' })}
											>
												<Icon name="arrowUp" size={14} stroke={2.2} />
											</Button>
										{/if}
										{#if isSuper && u.role === 'manager'}
											<Button
												variant="outline"
												size="icon"
												title="Demote to Rep"
												onclick={() => (confirmRoleChange = { user: u, newRole: 'rep' })}
											>
												<Icon name="arrowDown" size={14} stroke={2.2} />
											</Button>
										{/if}
										{#if canPromote && u.role === 'manager' && u.active}
											<Button
												variant="outline"
												size="icon"
												title="Promote to Super Manager"
												onclick={() => (promoteTarget = u)}
											>
												<Icon name="crown" size={14} stroke={2} />
											</Button>
										{/if}
										<!-- Deactivate/reactivate: reps always (for a manager); managers &
										     super_managers only by a super_manager, never on themselves. -->
										{#if u.role === 'rep' || (isSuper && !isSelf)}
											<Button
												variant="outline"
												size="sm"
												disabled={deactivating[u.id]}
												onclick={() => toggleActive(u)}
											>
												{#if deactivating[u.id]}
													{u.active ? 'Deactivating…' : 'Reactivating…'}
												{:else}
													{u.active ? 'Deactivate' : 'Reactivate'}
												{/if}
											</Button>
										{/if}
									</div>
								{/if}
							</TableCell>
						</TableRow>
					{/each}
				{/if}
			</TableBody>
		</Table>
	</Card>

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
						navigate({ page: pg - 1 });
					}}>← Prev</Button
				>
				<span class="font-mono">Page {pg} of {totalPages}</span>
				<Button
					variant="outline"
					size="sm"
					disabled={pg >= totalPages || paging}
					onclick={() => {
						paging = true;
						navigate({ page: pg + 1 });
					}}>Next →</Button
				>
			</div>
		</div>
	{/if}

	<div class="mt-3.5 flex items-center gap-2 text-[12.5px] text-ink-200">
		<Icon name="info" size={14} stroke={2} />
		Deactivating a rep keeps their history but moves their workable leads to
		<a href="/unassigned" class="font-semibold text-primary">Up for grabs</a>.
	</div>
</div>

<Modal
	open={addOpen}
	title={addLabel}
	subtitle="They'll receive a welcome email with a sign-in link."
	width={420}
	onclose={() => (addOpen = false)}
>
	<div class="flex flex-col gap-3">
		<div class="grid gap-1.5">
			<Label for="rep-name">Name</Label>
			<Input
				id="rep-name"
				bind:value={name}
				placeholder="Marites"
				{...fieldErrorAttrs('rep-name', fieldErrors.name)}
			/>
			<FieldError id="rep-name" errors={fieldErrors.name} />
		</div>
		<div class="grid gap-1.5">
			<Label for="rep-email">Work email</Label>
			<Input
				id="rep-email"
				bind:value={email}
				placeholder="marites@test.com"
				class="font-mono"
				{...fieldErrorAttrs('rep-email', fieldErrors.email)}
			/>
			<FieldError id="rep-email" errors={fieldErrors.email} />
		</div>
		<div class="grid gap-1.5">
			<Label for="rep-role">Role</Label>
			<Select type="single" bind:value={role}>
				<SelectTrigger id="rep-role" class="w-full">{roleLabel(role as Role)}</SelectTrigger>
				<SelectContent>
					{#each USER_ROLES.filter((r) => r !== 'super_manager') as r (r)}<SelectItem
							value={r}
							label={roleLabel(r)}>{roleLabel(r)}</SelectItem
						>{/each}
				</SelectContent>
			</Select>
		</div>
		{#if formError}<p class="text-[12px] text-overdue">{formError}</p>{/if}
	</div>
	{#snippet footer()}
		<Button variant="outline" class="flex-1" onclick={() => (addOpen = false)}>Cancel</Button>
		<Button class="flex-[2]" onclick={addRep}>{addLabel}</Button>
	{/snippet}
</Modal>

<Modal
	open={confirmRoleChange !== null}
	title={confirmRoleChange?.newRole === 'manager' ? 'Promote to Manager' : 'Demote to Rep'}
	width={400}
	onclose={() => (confirmRoleChange = null)}
>
	<p class="text-[13px] leading-relaxed text-ink-600">
		{#if confirmRoleChange?.newRole === 'manager'}
			Promote <span class="font-semibold">{confirmRoleChange.user.name}</span> from Rep to Manager? They'll
			gain access to manager features.
		{:else}
			Demote <span class="font-semibold">{confirmRoleChange?.user.name}</span> from Manager to Rep? They'll
			lose access to manager features.
		{/if}
	</p>
	{#snippet footer()}
		<Button variant="outline" class="flex-1" onclick={() => (confirmRoleChange = null)}>
			Cancel
		</Button>
		<Button class="flex-[2]" onclick={applyRoleChange} disabled={roleChanging}>
			{roleChanging ? 'Saving…' : confirmRoleChange?.newRole === 'manager' ? 'Promote' : 'Demote'}
		</Button>
	{/snippet}
</Modal>

<Modal
	open={promoteTarget !== null}
	title="Transfer Super Manager role"
	width={420}
	onclose={() => (promoteTarget = null)}
>
	<p class="text-[13px] leading-relaxed text-ink-600">
		This will make <span class="font-semibold">{promoteTarget?.name}</span> the Super Manager. You will
		become a regular Manager. Only one Super Manager can be active at a time.
	</p>
	{#snippet footer()}
		<Button variant="outline" class="flex-1" onclick={() => (promoteTarget = null)}>Cancel</Button>
		<Button class="flex-[2]" onclick={confirmPromote} disabled={promoting}>
			{promoting ? 'Transferring…' : 'Transfer role'}
		</Button>
	{/snippet}
</Modal>

<Modal open={editTarget !== null} title="Edit name" width={420} onclose={() => (editTarget = null)}>
	<div class="grid gap-1.5">
		<Label for="edit-name">Name</Label>
		<Input
			id="edit-name"
			bind:value={editName}
			placeholder="Marites"
			{...fieldErrorAttrs('edit-name', editFieldErrors.name)}
		/>
		<FieldError id="edit-name" errors={editFieldErrors.name} />
	</div>
	{#snippet footer()}
		<Button variant="outline" class="flex-1" onclick={() => (editTarget = null)}>Cancel</Button>
		<Button class="flex-[2]" onclick={saveEditName} disabled={editSaving}>
			{editSaving ? 'Saving…' : 'Save'}
		</Button>
	{/snippet}
</Modal>
