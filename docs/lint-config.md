# ESLint configuration and warning fixes

Documents the ESLint setup, the 37 warnings that existed in the codebase, and the decisions
made to resolve them.

---

## Config file

**`eslint.config.js`** — flat config format (ESLint 9+)

```js
import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import ts from 'typescript-eslint';
import globals from 'globals';
```

Stack order:
1. `js.configs.recommended` — JS baseline
2. `ts.configs.recommended` — TypeScript rules (replaces `no-undef`)
3. `svelte.configs.recommended` — Svelte-specific rules
4. `prettier` + `svelte.configs.prettier` — disable format rules (Prettier owns formatting)

**Custom overrides:**

```js
rules: {
  'no-undef': 'off',                                    // TypeScript handles this
  '@typescript-eslint/no-unused-vars': ['error', {
    argsIgnorePattern: '^_'                             // _-prefixed stubs allowed
  }],
  'svelte/require-each-key': 'warn',
  'svelte/no-navigation-without-resolve': 'off'         // view-transition API not used
}
```

---

## Rule: `svelte/require-each-key` (kept as `warn`)

Each `{#each}` block should provide a key expression so Svelte can reconcile list updates
efficiently without destroying and re-creating DOM nodes.

**Why warn, not error:** all existing uses were cosmetically harmless (static lists, rarely
re-ordered), but the rule is correct — keys prevent subtle animation and focus bugs on re-renders.

**Fix applied (2026-06-30):** added key expressions to 13 `{#each}` blocks across 9 files.

### Pattern

```svelte
<!-- Before -->
{#each LEAD_STAGES as s}

<!-- After -->
{#each LEAD_STAGES as s (s)}
```

For objects, use a stable unique field:

```svelte
{#each channelOpts as c (c.key)}
{#each fields as f (f.label)}
```

For static primitive arrays where the value is the identity, use the item itself `(item)`.

### Files fixed

| File | Blocks fixed | Key used |
|---|---|---|
| `src/lib/components/leads/LogTouchForm.svelte` | 3 | `(c.key)`, `(o.key)`, `(f)` |
| `src/lib/components/leads/LostReasonModal.svelte` | 1 | `(r)` |
| `src/lib/components/leads/WonCaptureModal.svelte` | 1 | `(c)` |
| `src/routes/+page.svelte` | 1 | `(key)` (keyboard shortcut list) |
| `src/routes/leads/+page.svelte` | 3 | `(s)`, `(p)`, `(c)` |
| `src/routes/leads/[id]/+page.svelte` | 1 | `(f.label)` |
| `src/routes/leads/new/+page.svelte` | 2 | `(c)`, `(p)` |
| `src/routes/login/+page.svelte` | 1 | `(tag)` |
| `src/routes/team/+page.svelte` | 1 | `(r)` |

---

## Rule: `svelte/no-navigation-without-resolve` (turned `off`)

This rule warns when `goto()` or `<a href>` are used without wrapping them in the Svelte 5
view-transition `resolve()` callback from `onNavigate`.

**Why turned off:** Veent CRM does not use the [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API).
The rule exists to remind developers to hook into `onNavigate` for animated page transitions —
a feature not planned for this app. Requiring `resolve()` wrappers on every link and `goto()`
call would be cargo-culted boilerplate with no benefit.

**Decision recorded in config:**

```js
// view-transition API not used in this app
'svelte/no-navigation-without-resolve': 'off'
```

**Affected patterns (all suppressed by turning off the rule):**

- `goto(url)` calls in filter/pagination handlers
- `<a href="...">` navigation links in layout components and route pages
- All 17 instances were in core navigation — not a correctness issue

**If view transitions are added later:** re-enable this rule, add `onNavigate` in
`+layout.svelte`, and wrap each `resolve()` call around the transition animation.
The eslint-plugin-svelte docs have a complete example.

---

## Gates

Run both before every commit:

```bash
bun run lint          # prettier --check + eslint
bunx prettier --write .   # auto-fix formatting (run if check fails)
bun run check         # svelte-check + tsc
```

Expected output (clean state):

```
All matched files use Prettier code style!
✖ 0 problems (0 errors, 0 warnings)
```

---

## Adding new `{#each}` blocks

Always include a key. Rule of thumb:

| Item type | Key expression |
|---|---|
| Objects with `id` | `(item.id)` |
| Objects with other unique field | `(item.slug)`, `(item.key)`, etc. |
| Primitive strings/numbers (unique values) | `(item)` |
| Primitive strings/numbers (may duplicate) | Use index only as last resort `(i)` — prefer restructuring |
| Nested destructure `as [key, val]` | `(key)` if key is unique |
