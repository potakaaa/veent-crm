<script lang="ts">
	// Dedicated Message-body editor for the template Add/Edit modal. Live-highlights the
	// five slash placeholder tokens (/orgname, /event, /rep, /repfirst, /replast) as the
	// rep types, while behaving as a normal <textarea> in every other respect.
	//
	// This is a PURPOSE-BUILT component — it deliberately does NOT reuse the shared
	// `ui/textarea` primitive (which is used across many unrelated forms). It mirrors that
	// primitive's exact class string so it looks identical when no tokens are present.
	//
	// Overlay technique (classic "highlighted textarea"):
	//   1. A `relative` container.
	//   2. A backdrop <div> (pointer-events:none) that OWNS the visible text rendering.
	//   3. A real <textarea> on top with transparent text (caret + selection stay visible),
	//      so the browser's native editing behaviour is 100% preserved.
	// The backdrop renders the text as an array of {text, token} segments via Svelte's
	// auto-escaping {#each} — NO {@html}, so there is zero HTML-injection surface by
	// construction (user text is never treated as markup).
	//
	// Slash-token autocomplete (additive — see block below the overlay markup):
	//   A NORMAL BLOCK-FLOW suggestion panel is rendered directly beneath the overlay pair.
	//   It deliberately does NOT track the caret's pixel position (no mirror-div coordinate
	//   measuring) — that technique is the exact class of bug this component has hit twice.
	//   The overlay pair is isolated inside its own `relative` wrapper so the panel growing
	//   below can never stretch the backdrop's `absolute inset-0` box. None of the highlight
	//   overlay logic (TOKEN_RE / segments / <mark> styling / scroll sync) is touched.
	import { tick } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		value = $bindable(''),
		rows = 6,
		id,
		placeholder,
		class: className
	}: {
		value?: string;
		rows?: number;
		id?: string;
		placeholder?: string;
		class?: string;
	} = $props();

	// Backdrop element — scroll position is mirrored from the textarea so highlights stay
	// aligned when the content overflows and the user scrolls.
	let backdrop = $state<HTMLDivElement | null>(null);

	// Token matcher. ORDER MATTERS: /repfirst & /replast MUST come before the bare /rep
	// alternative (/rep is a literal prefix of both). The (?![a-zA-Z]) lookahead prevents
	// /rep from matching inside longer words (e.g. /reports) — a collision fillTemplate
	// does NOT guard against (it uses bare .replaceAll with no word boundary). This
	// means the editor's highlighting is intentionally more conservative than
	// fillTemplate's actual substitution behavior (accepted residual, see plan).
	const TOKEN_RE = /\/(repfirst|replast|orgname|event|rep)(?![a-zA-Z])/g;

	type Segment = { text: string; token: boolean };

	// Split the current text into plain + token segments. Auto-escaped by Svelte on render.
	const segments = $derived.by<Segment[]>(() => {
		const out: Segment[] = [];
		let last = 0;
		for (const m of value.matchAll(TOKEN_RE)) {
			const start = m.index ?? 0;
			if (start > last) out.push({ text: value.slice(last, start), token: false });
			out.push({ text: m[0], token: true });
			last = start + m[0].length;
		}
		if (last < value.length) out.push({ text: value.slice(last), token: false });
		return out;
	});

	function syncScroll(e: Event) {
		const ta = e.currentTarget as HTMLTextAreaElement;
		if (backdrop) {
			backdrop.scrollTop = ta.scrollTop;
			backdrop.scrollLeft = ta.scrollLeft;
		}
	}

	// ── Slash-token autocomplete ──────────────────────────────────────────────────────────
	// Known token names WITHOUT the leading slash, in the modal subtitle's reading order
	// ("Use /orgname, /event, /rep, /repfirst, and /replast").
	const TOKEN_NAMES = ['orgname', 'event', 'rep', 'repfirst', 'replast'] as const;

	let textareaEl = $state<HTMLTextAreaElement | null>(null);
	let suggestions = $state<string[]>([]);
	let activeIndex = $state(0);
	// When the user presses Escape, remember the exact "current word" that was dismissed so
	// the panel does not instantly reopen from the same partial. Re-typing (which changes the
	// current word) clears this naturally.
	let dismissedWord = $state<string | null>(null);

	// Stable ids for ARIA wiring (avoids collisions when multiple instances mount).
	const uid = Math.random().toString(36).slice(2, 8);
	const listboxId = `tbe-list-${uid}`;
	const optionId = (i: number) => `tbe-opt-${uid}-${i}`;
	const panelOpen = $derived(suggestions.length > 0);
	const activeOptionId = $derived(
		panelOpen && activeIndex >= 0 && activeIndex < suggestions.length
			? optionId(activeIndex)
			: undefined
	);

	// Scan backward from `caret` through `text` to the start of the current word (first
	// whitespace before the caret, or index 0). Shared by detection + insertion so both use
	// identical word-boundary logic.
	function wordStartOf(text: string, caret: number): number {
		let ws = caret;
		while (ws > 0 && !/\s/.test(text[ws - 1])) ws--;
		return ws;
	}

	// Recompute the suggestion set from the textarea's live DOM value + caret. Cheap enough to
	// run on every input/keyup/click for the tiny fixed candidate set — no debouncing needed.
	function computeSuggestions() {
		const el = textareaEl;
		if (!el) return;
		const text = el.value;
		const caret = el.selectionStart ?? text.length;
		const currentWord = text.slice(wordStartOf(text, caret), caret);

		if (dismissedWord !== null) {
			if (currentWord === dismissedWord) {
				suggestions = [];
				return;
			}
			dismissedWord = null; // word changed → the Escape dismissal no longer applies
		}

		if (/^\/[a-zA-Z]*$/.test(currentWord)) {
			const partial = currentWord.slice(1).toLowerCase();
			const next = TOKEN_NAMES.filter((n) => n.startsWith(partial));
			suggestions = next;
			activeIndex = next.length === 0 ? 0 : Math.min(activeIndex, next.length - 1);
		} else {
			suggestions = [];
		}
	}

	// New typing resets the highlighted item to the top; caret-only moves preserve it.
	function onTextInput() {
		activeIndex = 0;
		computeSuggestions();
	}

	async function insertSuggestion(name: string) {
		const el = textareaEl;
		if (!el) return;
		// Re-derive word boundaries fresh at insertion time (never trust stale captured values).
		const caret = el.selectionStart ?? value.length;
		const ws = wordStartOf(value, caret);
		const newPos = ws + 1 + name.length;
		value = value.slice(0, ws) + '/' + name + value.slice(caret);
		suggestions = [];
		dismissedWord = null;
		await tick();
		el.focus();
		el.setSelectionRange(newPos, newPos);
	}

	function onKeydown(e: KeyboardEvent) {
		// Panel closed ⇒ behave as a completely normal textarea (Enter = newline, Tab = focus).
		if (!panelOpen) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			activeIndex = (activeIndex + 1) % suggestions.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeIndex = (activeIndex - 1 + suggestions.length) % suggestions.length;
		} else if (e.key === 'Enter' || e.key === 'Tab') {
			e.preventDefault();
			void insertSuggestion(suggestions[activeIndex]);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			const el = textareaEl;
			const caret = el?.selectionStart ?? 0;
			dismissedWord = value.slice(wordStartOf(value, caret), caret);
			suggestions = [];
		}
	}

	// Shared layout classes applied IDENTICALLY to both layers so they never drift apart
	// as text wraps. Mirrors ui/textarea's box model (border/padding/radius/font) and adds
	// explicit whitespace/wrap rules so the div matches the textarea's soft-wrap behaviour.
	const sharedBox =
		'w-full rounded-md border px-3 py-2 text-sm leading-normal whitespace-pre-wrap break-words';
</script>

<div class={className}>
	<!-- Overlay pair isolated in its OWN relative box so the suggestion panel below cannot
	     stretch the backdrop's `absolute inset-0` and reintroduce a highlight-alignment bug. -->
	<div class="relative">
		<!-- Backdrop: owns the visible glyphs; sits behind the transparent-text textarea. -->
		<div
			bind:this={backdrop}
			aria-hidden="true"
			class={cn(
				sharedBox,
				'border-input bg-background pointer-events-none absolute inset-0 overflow-auto text-ink select-none'
			)}
		>
			{#each segments as seg, i (i)}
				{#if seg.token}<mark class="rounded-[4px] bg-selected text-primary-strong">{seg.text}</mark
					>{:else}{seg.text}{/if}
			{/each}
			<!-- Trailing newline guard: pre-wrap collapses a final "\n" visually; a zero-width
			     space keeps the last empty line's height in sync with the textarea. -->
			&#8203;
		</div>

		<!-- Real textarea on top: transparent text so the backdrop shows through, but caret,
		     selection, placeholder, and all native editing behaviour remain fully intact. -->
		<textarea
			bind:this={textareaEl}
			{id}
			{rows}
			{placeholder}
			bind:value
			role="combobox"
			aria-expanded={panelOpen}
			aria-controls={listboxId}
			aria-autocomplete="list"
			aria-activedescendant={activeOptionId}
			oninput={onTextInput}
			onkeydown={onKeydown}
			onkeyup={computeSuggestions}
			onclick={computeSuggestions}
			onscroll={syncScroll}
			onblur={() => {
				suggestions = [];
				dismissedWord = null;
			}}
			style="caret-color: var(--color-ink);"
			class={cn(
				sharedBox,
				'border-transparent bg-transparent ring-offset-background placeholder:text-muted-foreground relative resize-none text-transparent shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50',
				'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'
			)}></textarea>
	</div>

	<!-- Slash-token suggestion panel: NORMAL block flow directly below the editor (not
	     absolutely positioned, not caret-tracked). The modal may grow/shrink slightly as it
	     appears/disappears — an accepted, deliberately simpler tradeoff over caret-tracking. -->
	{#if panelOpen}
		<ul
			role="listbox"
			id={listboxId}
			class="border-hairline bg-panel shadow-nav-popover rounded-control mt-1 max-h-56 w-full overflow-y-auto border py-1"
		>
			{#each suggestions as name, i (name)}
				<li
					role="option"
					id={optionId(i)}
					aria-selected={i === activeIndex}
					onmousedown={(e) => {
						// mousedown (not click) fires before the textarea's blur — keeps focus.
						e.preventDefault();
						activeIndex = i;
						void insertSuggestion(name);
					}}
					onmouseenter={() => (activeIndex = i)}
					class={cn('cursor-pointer px-3 py-1.5 text-sm', i === activeIndex && 'bg-panel-sunken')}
				>
					<span class="bg-selected text-primary-strong rounded-[4px] px-1">/{name}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>
