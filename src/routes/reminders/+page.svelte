<script lang="ts">
	import StubNote from '$lib/components/StubNote.svelte';

	const REMINDER_TZ = 'Asia/Manila';
</script>

<svelte:head><title>Reminders · Veent CRM</title></svelte:head>

<StubNote>follow_up_at due/overdue computed in {REMINDER_TZ}; n8n pushes the daily nudge.</StubNote>

<h1 class="mb-1 text-2xl font-semibold">Reminders</h1>
<p class="mb-4 text-gray-600">Due / overdue follow-ups (Asia/Manila day boundary).</p>

<div class="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
	No reminders — wire <code>crm_activities.follow_up_at</code> + <code>getDueReminders()</code>.
</div>
