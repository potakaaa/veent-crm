<script lang="ts">
	import MeetingsPanel from '$lib/components/meetings/MeetingsPanel.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Meetings · Veent CRM</title></svelte:head>

<div class="mx-auto max-w-[1080px] px-7 pb-16 pt-5">
	<div class="mb-4">
		<h1 class="font-serif text-[24px] font-semibold tracking-[-0.5px] text-ink">Meetings</h1>
		<div class="mt-1 text-[12.5px] text-ink-400">Every meeting across all leads.</div>
	</div>

	<MeetingsPanel meetings={data.meetings} users={data.users} me={data.me} leads={data.leads} />
</div>
