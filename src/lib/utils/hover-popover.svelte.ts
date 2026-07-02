/**
 * Shared hover/focus-controlled popover timer hook.
 *
 * Consolidates the 200ms grace-period close-timer state + handlers that were
 * independently duplicated between `leads/new/+page.svelte` (`openDupeId` /
 * `closeTimer` / `openDupe` / `scheduleCloseDupe` / `closeDupeNow`) and
 * `unassigned/+page.svelte` (`openHoverId` / `hoverCloseTimer` / `openHover` /
 * `scheduleCloseHover` / `closeHoverNow`). Phase 2 — sitewide-ux-refresh, Step C2.
 *
 * The grace period keeps the popover from flicker-closing when the pointer
 * travels from the trigger row into the (portalled) popover content.
 *
 * Usage:
 *   const hover = createHoverPopover();
 *   // in markup: open={hover.openId === row.id}
 *   //            onmouseenter={() => hover.open(row.id)}
 *   //            onmouseleave={hover.scheduleClose}
 *   //            onkeydown={hover.handleEscape}
 */
export function createHoverPopover(closeDelayMs = 200) {
	let openId = $state<string | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function open(id: string) {
		clearTimeout(timer);
		openId = id;
	}

	function scheduleClose() {
		clearTimeout(timer);
		timer = setTimeout(() => {
			openId = null;
		}, closeDelayMs);
	}

	function closeNow() {
		clearTimeout(timer);
		openId = null;
	}

	function handleEscape(event: KeyboardEvent) {
		if (event.key === 'Escape') closeNow();
	}

	return {
		get openId() {
			return openId;
		},
		open,
		scheduleClose,
		closeNow,
		handleEscape
	};
}
