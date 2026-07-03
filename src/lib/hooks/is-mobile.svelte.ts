import { MediaQuery } from "svelte/reactivity";

// Aligned to this repo's existing mobile nav boundary (880px) so the shadcn Sidebar's
// mobile/desktop switch matches the hand-tuned bits-ui Dialog drawer breakpoint
// (`max-[880px]:hidden` / `max-[880px]:inline-flex`). collapsible-sidebar (issue #158).
const DEFAULT_MOBILE_BREAKPOINT = 880;

export class IsMobile extends MediaQuery {
	constructor(breakpoint: number = DEFAULT_MOBILE_BREAKPOINT) {
		super(`max-width: ${breakpoint - 1}px`);
	}
}
