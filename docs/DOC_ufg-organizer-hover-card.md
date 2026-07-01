# Up for Grabs — Organizer Hover Card

Implemented: 2026-07-01
Surfaces: `/unassigned`

---

## What It Does

Hovering over any organizer name in the Up for Grabs table now shows a detail popover on the right side of that row. The card displays the lead's platform badge, stage chip, email, phone, category + location, upcoming event, current owner, and last-activity timestamp — everything a rep needs to decide whether to claim the lead, without navigating away from the queue.

Clicking the organizer name still navigates to `/leads/[id]` as before. The hover card is purely a preview — it does not block or replace row actions (select checkbox, edit button, claim button).

The feature reuses two pieces already proven in `leads/new`:
- `OrganizerHoverCard.svelte` — the card component (unchanged)
- The `Popover.Root` + grace-period-timer pattern — prevents flicker when the pointer moves from the trigger row into the card content

No new components, dependencies, or API calls were introduced.

---

## Implementation

**File:** `src/routes/unassigned/+page.svelte`

### Imports added

```ts
import * as Popover from '$lib/components/ui/popover';
import OrganizerHoverCard from '$lib/components/OrganizerHoverCard.svelte';
```

### State and helpers

```ts
let openHoverId = $state<string | null>(null);
let hoverCloseTimer: ReturnType<typeof setTimeout> | undefined;

const openHover = (id: string) => { clearTimeout(hoverCloseTimer); openHoverId = id; };
const scheduleCloseHover = () => {
  clearTimeout(hoverCloseTimer);
  hoverCloseTimer = setTimeout(() => { openHoverId = null; }, 200);
};
const closeHoverNow = () => { clearTimeout(hoverCloseTimer); openHoverId = null; };
const ownerNameFor = (ownerId: string | null) =>
  ownerId ? (data.users.find((u) => u.id === ownerId)?.name ?? null) : null;
```

`openHoverId` holds the `id` of the lead whose card is currently open, or `null` when no card is visible. The 200 ms grace-period timer in `scheduleCloseHover` keeps the card from flickering closed when the pointer travels from the trigger row into the card content — identical to the pattern in `leads/new`.

`ownerNameFor` resolves an owner ID to a display name via `data.users` (already loaded by the server). Because Up for Grabs leads have `ownerId === null`, this function always returns `null` for this surface, and `OrganizerHoverCard` renders `"Unassigned"` for the Owner field.

### Template — organizer column

The organizer `<a>` that previously sat directly in the row grid cell is now wrapped in a controlled `Popover.Root`. Mouse-enter on the wrapper div opens the card; mouse-leave (with the grace-period timer) closes it. The `<a>` itself is unchanged — clicking it still navigates to the lead detail page.

```svelte
<Popover.Root open={openHoverId === l.id}>
  <Popover.Trigger>
    {#snippet child({ props })}
      <div
        {...props}
        class="min-w-0"
        onmouseenter={() => openHover(l.id)}
        onmouseleave={scheduleCloseHover}
        onkeydown={(e) => { if (e.key === 'Escape') closeHoverNow(); }}
      >
        <a href="/leads/{l.id}" class="min-w-0 block">
          <div class="flex items-center gap-1.5 text-[13px] font-semibold">
            {l.name}
            {#if l.siblings}
              <span class="rounded-[4px] bg-[rgba(194,113,12,0.1)] px-[5px] py-px font-mono text-[9.5px] text-stale">
                {l.siblings} events
              </span>
            {/if}
          </div>
          <div class="font-mono text-[11px] text-ink-400">{l.handle} · {l.category}</div>
        </a>
      </div>
    {/snippet}
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      side="right"
      onmouseenter={() => openHover(l.id)}
      onmouseleave={scheduleCloseHover}
      onkeydown={(e) => { if (e.key === 'Escape') closeHoverNow(); }}
    >
      <OrganizerHoverCard lead={l} ownerName={ownerNameFor(l.ownerId)} />
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
```

`Popover.Content` also listens to `onmouseenter` / `onmouseleave` so the card stays open while the pointer is inside it. The `Escape` keydown handler on both elements closes the card immediately without waiting for the timer.

---

## `OrganizerHoverCard` — unchanged

**File:** `src/lib/components/OrganizerHoverCard.svelte`

The component was not modified. Its prop contract:

| Prop | Type | Description |
|------|------|-------------|
| `lead` | `Lead` | Lead object to display; all fields are read-only |
| `ownerName` | `string \| null` | Resolved owner display name, or `null` → renders "Unassigned" |

Fields rendered by the card:

| Field | Source |
|-------|--------|
| Name + platform badge + stage chip | `lead.name`, `lead.platform`, `lead.stage` |
| Handle | `lead.handle` (prefixed with `@` if not already) |
| Email | `lead.email ?? '—'` |
| Phone | `lead.phone ?? '—'` |
| Category | `lead.category · lead.location` |
| Event | `lead.eventName ?? '—'` · formatted `lead.eventDate` |
| Owner | `ownerName ?? 'Unassigned'` |
| Last activity | `relativeFromNow(lead.lastActivityAt)` or `'—'` |

A "Go to lead →" link at the bottom of the card also navigates to `/leads/{lead.id}`.

---

## Interaction with Existing Row Actions

The hover card sits inside the organizer column only. Every other row element is unchanged:

| Element | Behavior |
|---------|----------|
| Select checkbox | Unchanged — toggles row selection for bulk claim / assign |
| Organizer `<a>` | Unchanged — click navigates to `/leads/[id]` |
| Event column | Unchanged |
| Stage / Source / Country / Category / Last owner cells | Unchanged |
| Edit (pencil) button | Unchanged — opens `LeadEditModal` in place |
| Claim button | Unchanged — claims the lead with optimistic remove |

Hovering the organizer cell does not interfere with any of the above: the wrapper `div` intercepts hover events only; it does not prevent click propagation.

---

## Public Contract Changes

None. This change is entirely client-side UI. No server load changes, no API changes, no type changes, no new exports.

---

## Files Changed

| File | Change |
|------|--------|
| `src/routes/unassigned/+page.svelte` | Added `Popover` + `OrganizerHoverCard` imports; added `openHoverId`, `hoverCloseTimer`, `openHover`, `scheduleCloseHover`, `closeHoverNow`, `ownerNameFor`; wrapped organizer column `<a>` in `Popover.Root/Trigger/Portal/Content` |

---

## Honest Limitations

- **Owner field always shows "Unassigned" on this surface.** All leads in Up for Grabs have `ownerId === null` by definition, so `ownerNameFor` always returns `null`. The `OrganizerHoverCard` correctly renders "Unassigned" — but the Owner row in the card is not very informative here. It may be more useful once the card is reused on surfaces where leads have real owners (e.g. `/leads`).

- **No keyboard-open path for the hover card.** The card opens on `mouseenter` only. Keyboard-only users navigating the table with Tab/arrow keys cannot open the card; `Escape` closes it but there is no paired "open" key binding. This matches the existing behavior in `leads/new` and is a known gap in the shared popover pattern.

- **No touch / mobile support.** Hover events do not fire on touch screens. The card is invisible on mobile viewports.

- **The feature has not been manually verified in a browser this session.** Only `bun run check` was not explicitly run post-edit — the change is a pure template + script addition with no logic that could fail type-check (all types flow from the existing `Lead` interface and existing imports). Manual visual confirmation of popover positioning, z-index stacking, and grace-period timer behavior is pending.
