<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { FieldError, fieldErrorAttrs } from '$lib/components/ui/field-error';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { roleLabel, statusLabel } from '$lib/utils/roles';
	import { userNameEditSchema } from '$lib/zod/schemas';

	let { data } = $props();

	let firstName = $state(data.currentUser.firstName);
	let lastName = $state(data.currentUser.lastName ?? '');
	let saving = $state(false);
	let fieldErrors = $state<Record<string, string[] | undefined>>({});

	async function save() {
		const parsed = userNameEditSchema.safeParse({ firstName, lastName });
		if (!parsed.success) {
			fieldErrors = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
			return;
		}
		fieldErrors = {};
		saving = true;
		try {
			const res = await fetch(`/api/users/${data.currentUser.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ firstName, lastName })
			});
			if (!res.ok) {
				toasts.push(
					res.status === 403
						? 'You do not have permission to do that.'
						: 'Unable to update your profile — try again.',
					{ tone: 'warn' }
				);
				return;
			}
			await invalidateAll();
			toasts.success('Profile updated');
		} catch (err) {
			toasts.push(err instanceof Error ? err.message : 'Unable to update your profile', {
				tone: 'warn'
			});
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Profile · Veent CRM</title></svelte:head>

<div class="px-7 pb-16 pt-6">
	<PageHeader
		title="Your profile"
		subtitle="Edit your display name. Your email and role are managed by your team."
	/>

	<Card class="max-w-lg">
		<CardContent class="flex flex-col gap-4">
			<div class="grid gap-1.5">
				<Label for="profile-first-name">First name</Label>
				<Input
					id="profile-first-name"
					bind:value={firstName}
					placeholder="Your first name"
					{...fieldErrorAttrs('profile-first-name', fieldErrors.firstName)}
				/>
				<FieldError id="profile-first-name" errors={fieldErrors.firstName} />
			</div>

			<div class="grid gap-1.5">
				<Label for="profile-last-name">Last name (optional)</Label>
				<Input
					id="profile-last-name"
					bind:value={lastName}
					placeholder="Your last name"
					{...fieldErrorAttrs('profile-last-name', fieldErrors.lastName)}
				/>
				<FieldError id="profile-last-name" errors={fieldErrors.lastName} />
			</div>

			<div class="grid gap-1.5">
				<Label for="profile-email">Work email</Label>
				<Input
					id="profile-email"
					value={data.currentUser.email}
					class="font-mono"
					readonly
					disabled
				/>
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div class="grid gap-1.5">
					<Label>Role</Label>
					<p class="text-[13px] text-ink-600">{roleLabel(data.currentUser.role)}</p>
				</div>
				<div class="grid gap-1.5">
					<Label>Status</Label>
					<p class="text-[13px] text-ink-600">{statusLabel(data.currentUser.active)}</p>
				</div>
			</div>

			<div class="flex justify-end">
				<Button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
			</div>
		</CardContent>
	</Card>
</div>
