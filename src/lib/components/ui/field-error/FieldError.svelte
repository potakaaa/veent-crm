<script lang="ts">
	/**
	 * Shared field-error display — Phase 4 (sitewide-ux-refresh).
	 *
	 * Renders the per-field validation message with the id the control's
	 * `aria-describedby` points at (via `fieldErrorAttrs(id, errors)`). Composed
	 * alongside the existing Label/Input/Textarea/Select primitives — it does not
	 * extend them. Renders nothing when the field is valid.
	 */
	import { fieldErrorId, firstFieldError, type FieldErrorValue } from './field-error';

	let {
		id,
		errors,
		class: className = ''
	}: { id: string; errors?: FieldErrorValue; class?: string } = $props();

	const message = $derived(firstFieldError(errors));
</script>

{#if message}
	<p
		id={fieldErrorId(id)}
		class="text-[12px] font-medium text-overdue {className}"
		aria-live="polite"
	>
		{message}
	</p>
{/if}
