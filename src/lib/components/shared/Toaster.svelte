<script lang="ts">
	import { Toaster } from 'svelte-sonner';
</script>

<Toaster
	position="bottom-right"
	richColors
	closeButton
	toastOptions={{
		classes: {
			actionButton:
				'!bg-panel !text-ink !border !border-hairline !rounded-control !font-sans !text-[12px] !font-semibold hover:!bg-panel-sunken !shadow-none !px-2.5 !py-1'
		}
	}}
/>
