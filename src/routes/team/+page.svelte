<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { navigating } from '$app/state';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import Avatar from '$lib/components/shared/Avatar.svelte';
	import { TableSkeleton } from '$lib/components/shared/skeletons';
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
	import { crm } from '$lib/services';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { canManageUsers } from '$lib/utils/permissions';
	import { userFormSchema, USER_ROLES } from '$lib/zod/schemas';
	import type { User } from '$lib/types';

	let { data } = $props();
	const canManage = $derived(canManageUsers(data.currentUser));

	const navLoading = $derived(navigating.to?.url.pathname === '/team');

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

	async function toggleActive(u: User) {
		try {
			if (u.active) {
				// Deactivating: move their workable leads to Up for grabs first
				const theirLeads = data.leads.filter(
					(l) => l.ownerId === u.id && l.stage !== 'won' && l.stage !== 'lost'
				);
				if (theirLeads.length) {
					await crm.reassignLeads(
						theirLeads.map((l) => l.id),
						null
					);
				}
				await crm.updateUser(u.id, { active: false });
				await invalidateAll();
				toasts.push(`Deactivated ${u.name} — ${theirLeads.length} lead(s) moved to Up for grabs`);
			} else {
				await crm.updateUser(u.id, { active: true });
				await invalidateAll();
				toasts.push(`Reactivated ${u.name}`);
			}
		} catch (err) {
			toasts.push(err instanceof Error ? err.message : `Unable to update ${u.name}`, {
				tone: 'warn'
			});
		}
	}
</script>

<svelte:head><title>Team · Veent CRM</title></svelte:head>

<div class="mx-auto max-w-[940px] px-7 pb-16 pt-6">
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

	{#if navLoading}
		<TableSkeleton rows={6} cols={6} />
	{:else}
		<Card class="gap-0 overflow-hidden rounded-control py-0">
			<Table>
				<TableHeader>
					<TableRow class="bg-[#fdf7f5] hover:bg-[#fdf7f5]">
						<TableHead>Name</TableHead>
						<TableHead>Email</TableHead>
						<TableHead>Role</TableHead>
						<TableHead>Status</TableHead>
						<TableHead class="text-right">Leads</TableHead>
						<TableHead></TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#each data.users as u (u.id)}
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
									style={u.role === 'manager'
										? 'color:#c0362c;background:rgba(192,54,44,0.1);border-color:transparent'
										: 'color:#5a4a48;background:#f5ecea;border-color:transparent'}
								>
									{u.role}
								</Badge>
							</TableCell>
							<TableCell>
								<Badge
									variant="outline"
									class="font-mono text-[11px]"
									style={u.active
										? 'color:#0e9f6e;background:rgba(14,159,110,0.1);border-color:transparent'
										: 'color:#a89490;background:#f5ecea;border-color:transparent'}
								>
									{u.active ? 'active' : 'inactive'}
								</Badge>
							</TableCell>
							<TableCell class="text-right font-mono text-[13px]">{u.leadCount ?? '—'}</TableCell>
							<TableCell class="text-right">
								{#if canManage && u.role !== 'manager'}
									<Button variant="outline" size="sm" onclick={() => toggleActive(u)}>
										{u.active ? 'Deactivate' : 'Reactivate'}
									</Button>
								{/if}
							</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		</Card>
	{/if}

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
				<SelectTrigger id="rep-role" class="w-full">{role}</SelectTrigger>
				<SelectContent>
					{#each USER_ROLES as r (r)}<SelectItem value={r} label={r}>{r}</SelectItem>{/each}
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
