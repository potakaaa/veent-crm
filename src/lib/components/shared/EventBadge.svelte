<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';

	let { date }: { date: string | undefined } = $props();

	type Variant = 'urgent' | 'soon' | 'later' | 'past';

	const info = $derived.by(() => {
		if (!date) return null;
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const eventDay = new Date(date + 'T00:00:00');
		const diffMs = eventDay.getTime() - today.getTime();
		const diffDays = Math.round(diffMs / 86_400_000);

		if (diffDays < 0) return { label: 'Past', variant: 'past' as Variant };
		if (diffDays === 0) return { label: 'Today', variant: 'urgent' as Variant };
		if (diffDays === 1) return { label: 'Tomorrow', variant: 'urgent' as Variant };
		if (diffDays <= 56) {
			const weeks = Math.ceil(diffDays / 7);
			const variant: Variant = weeks <= 2 ? 'urgent' : weeks <= 8 ? 'soon' : 'later';
			return { label: `${weeks} wk${weeks === 1 ? '' : 's'}`, variant };
		}
		const months = Math.round(diffDays / 30.44);
		return { label: `${months} mo`, variant: 'later' as Variant };
	});

	const COLORS: Record<Variant, { text: string; bg: string; border: string }> = {
		urgent: { text: '#c0362c', bg: '#c0362c14', border: '#c0362c30' },
		soon: { text: '#c2710c', bg: '#c2710c14', border: '#c2710c30' },
		later: { text: '#0e7490', bg: '#0e749014', border: '#0e749030' },
		past: { text: '#71717a', bg: '#71717a0d', border: '#71717a25' }
	};

	const style = $derived(
		info
			? `color:${COLORS[info.variant].text};background:${COLORS[info.variant].bg};border-color:${COLORS[info.variant].border}`
			: ''
	);
</script>

{#if info}
	<Badge
		variant="outline"
		class="rounded-chip border px-[7px] py-0.5 font-mono text-[11px] font-medium"
		{style}
	>
		{info.label}
	</Badge>
{/if}
