<script lang="ts">
	import MeetingsPanel from '$lib/components/meetings/MeetingsPanel.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Meetings · Veent CRM</title></svelte:head>

<div class="px-7 pb-16 pt-6">
	<div class="mb-4">
		<h1 class="font-serif text-[24px] font-semibold tracking-[-0.5px] text-ink">Meetings</h1>
		<div class="mt-1 text-[12.5px] text-ink-400">Every meeting across all leads.</div>
	</div>

	<MeetingsPanel
		meetings={data.meetings}
		total={data.total}
		users={data.users}
		me={data.me}
		selectedLead={data.selectedLead}
		filters={data.filters}
	/>
</div>
