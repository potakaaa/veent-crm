<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { navigating } from '$app/state';
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
	import { toasts } from '$lib/stores/toasts.svelte';
	import { canManageUsers, isSuperManager, canPromoteToSuperManager } from '$lib/utils/permissions';
	import { roleLabel, statusLabel } from '$lib/utils/roles';
	import { userFormSchema, USER_ROLES } from '$lib/zod/schemas';
	import type { Role, User } from '$lib/types';

	let { data } = $props();
	const canManage = $derived(canManageUsers(data.currentUser));
	const isSuper = $derived(isSuperManager(data.currentUser));
	const canPromote = $derived(canPromoteToSuperManager(data.currentUser));

	const navLoading = $derived(navigating.to?.url.pathname === '/team');

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
			onToggle(id, desc) {
				goto(`?sort=${id}&dir=${desc ? 'desc' : 'asc'}`, { keepFocus: true });
			}
		})
	);

	let addOpen = $state(false);
	let name = $state('');
	let email = $state('');
	let role = $state<string>('rep');
	let formError = $state('');

	async function addRep() {
		const parsed = userFormSchema.safeParse({ name, email, role, active: true });
		if (!parsed.success) {
			formError = parsed.error.issues[0]?.message ?? 'Check the form.';
			return;
		}
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
					<Icon name="plus" size={15} stroke={2.2} /> Add a rep
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
										? 'color:#a16207;background:#fef9c3;border-color:transparent'
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
									<div class="flex justify-end gap-1.5">
										{#if canPromote && u.role === 'manager' && u.active}
											<Button variant="outline" size="sm" onclick={() => (promoteTarget = u)}>
												Promote to Super Manager
											</Button>
										{/if}
										<!-- Deactivate/reactivate: reps always (for a manager); managers &
										     super_managers only by a super_manager, never on themselves. -->
										{#if u.role === 'rep' || (isSuper && !isSelf)}
											<Button variant="outline" size="sm" onclick={() => toggleActive(u)}>
												{u.active ? 'Deactivate' : 'Reactivate'}
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

	<div class="mt-3.5 flex items-center gap-2 text-[12.5px] text-ink-200">
		<Icon name="info" size={14} stroke={2} />
		Deactivating a rep keeps their history but moves their workable leads to
		<a href="/unassigned" class="font-semibold text-primary">Up for grabs</a>.
	</div>
</div>

<Modal
	open={addOpen}
	title="Add a rep"
	subtitle="They'll receive a welcome email with a sign-in link."
	width={420}
	onclose={() => (addOpen = false)}
>
	<div class="flex flex-col gap-3">
		<div class="grid gap-1.5">
			<Label for="rep-name">Name</Label>
			<Input id="rep-name" bind:value={name} placeholder="Marites" />
		</div>
		<div class="grid gap-1.5">
			<Label for="rep-email">Work email</Label>
			<Input id="rep-email" bind:value={email} placeholder="marites@test.com" class="font-mono" />
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
		<Button class="flex-[2]" onclick={addRep}>Add rep</Button>
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
