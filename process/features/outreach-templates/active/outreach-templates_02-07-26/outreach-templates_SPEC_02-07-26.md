---
name: plan:outreach-templates-spec
description: "Product-discovery SPEC for DB-backed, manager-managed outreach message templates organized by event category, replacing the static snippet system"
date: 02-07-26
feature: outreach-templates
---

# Outreach Message Templates — SPEC

## Summary

Sales reps currently pick from 9 hardcoded text snippets when logging an outreach touch on a lead — the snippets live in code, nobody but a developer can change them, and they only append a fragment onto the note field. This feature replaces that with a real, database-backed library of **full outreach messages** that managers can create, edit, and delete themselves, organized by the same event category every lead already has (Sports, Church, Conference, etc.). When a rep opens the outreach/note composer on a lead, they can browse templates by that lead's category, pick one, and have it drop in as the message — with placeholders like the organizer's name and event name already filled in automatically. The goal: reps compose faster and more consistently, and managers can keep the message library current without asking engineering to ship a code change.

## User Stories / Jobs To Be Done

1. **As a manager**, I want to create a new outreach template with a title, an event category, and a full message body, so that my team has an approved message ready to use for that type of lead.
2. **As a manager**, I want to edit an existing template's text or category, so that I can fix wording or recategorize it without deleting and recreating it.
3. **As a manager**, I want to delete a template that's outdated or no longer used, so that my team doesn't accidentally send stale messaging.
4. **As a manager**, I want to see the full list of templates in one place, so I can review what's available across all event categories.
5. **As a rep**, when I'm about to log an outreach touch on a lead, I want to browse templates filtered to (or highlighting) that lead's event category, so I don't have to hunt through templates meant for a different kind of event.
6. **As a rep**, when I pick a template, I want the organizer name, event name, and my own name to be filled in automatically wherever the template references them, so I don't have to manually find-and-replace placeholder text before sending.
7. **As a rep**, I want to still be able to edit the message after inserting a template, so I can personalize it before logging the touch.

## What The User Wants (Behavioral Outcomes)

- An area of the app lists all outreach templates, grouped or filterable by event category, with clear create / edit / delete actions. All authenticated users can browse the list; creation, editing, and deletion remain manager-only.
- Creating or editing a template requires: a short title/label, an event category (chosen from the same category list used elsewhere in the CRM), and a message body that can contain placeholder tokens (e.g., organizer name, event name).
- Deleting a template removes it from the list reps see immediately; it does not need to be recoverable (soft-delete under the hood is an implementation detail, not a user-facing requirement).
- On a lead's detail page, the outreach composer (where reps currently type a note) offers a way to browse templates. Templates matching the lead's own event category are easy to find first; a rep is not blocked from seeing templates from other categories if they want to.
- Selecting a template fills the message field with the template's full text, with any recognized placeholders already replaced by real values pulled from the lead (organizer/contact name, event name) and the signed-in rep's own name. Placeholders with no available value resolve to blank rather than showing broken placeholder syntax.
- Because templates are full messages (not short snippets), choosing one takes over the message field's content rather than tacking on to whatever's already there. If the rep had already typed something, they get a clear heads-up before it's replaced, so they don't lose work by accident.
- After a template is inserted, the field remains fully editable — nothing about the flow prevents the rep from tweaking the wording before logging the touch.
- Everyone on the team sees the same set of templates — there's no personal/private template concept in this version.

## Flow / State Diagram

**Manager: template management**

```
/templates (read: any authenticated user; write: manager only)
   |
   v
[ list of templates, grouped by event category ] <---------------+
   |             |                |                                |
   | (new)       | (edit)         | (delete)                       |
   v             v                v                                |
[create form] [edit form]   [confirm delete]                       |
   |             |                |                                |
   v             v                v                                |
  save ------> save ----------> remove ---------------------------->
   |             |
   +---- validation error? ----+
              |
              v
      [inline error, form stays open]
```

**Rep: composing outreach with a template**

```
Lead detail page
   |
   v
[ outreach / note composer ]
   |
   | click "Templates"
   v
[ template browser, scoped to lead's event category by default ]
   |         \
   | pick one \  (switch to "all categories")
   v           v
[ template   [ full list ]
  selected ]      |
   |              v
   |          pick one
   |              |
   +<-------------+
   |
   v
message field already has content?
   |                     \
   no                     yes
   |                       |
   v                       v
[ fill field with     [ confirm replace? ]
  substituted text ]        |
   |                    yes / no
   |                    /       \
   |                   v         v
   |            [ replace ]  [ cancel, keep
   |                 |         existing text ]
   +<----------------+
   |
   v
[ rep can still edit text freely ]
   |
   v
[ log touch / submit — existing flow, unchanged ]
```

## Acceptance Criteria (Testable Outcomes)

1. **A manager can create a template with title, event category, and body.**
   Given a manager on the templates management screen, when they submit a new template with a title, a category from the existing event-category list, and a message body, then the template is saved and appears in the template list under that category.
   proven by: template create form Fully-Automated integration test (Superforms + Zod validation) + Vitest schema test for the new template Zod schema.
   strategy: Fully-Automated

2. **A manager can edit a template's title, category, or body.**
   Given an existing template, when a manager changes any of its fields and saves, then the updated values persist and are reflected in the template list and in what reps see afterward.
   proven by: template edit form Fully-Automated integration test.
   strategy: Fully-Automated

3. **A manager can delete a template.**
   Given an existing template, when a manager deletes it, then it no longer appears in the manager's template list or in the rep-facing template browser.
   proven by: template delete Fully-Automated integration test (soft-delete filter verified via DB accessor unit test).
   strategy: Fully-Automated

4. **Only managers can create, edit, or delete templates.**
   Given a signed-in rep (non-manager), when they attempt to reach the template management screen or its create/edit/delete actions (directly via URL or API), then they are denied (403 / redirected), matching the existing `/team` manager-only pattern.
   proven by: Vitest unit test on the server-load/API guard (mirrors existing `team`/`users` manager-only test pattern).
   strategy: Fully-Automated

5. **Templates are organized by event category using the existing category taxonomy.**
   Given the template list (management screen or rep-facing browser), when displayed, then every template shows a category value drawn from the same 20-value event category enum already used for leads — no separate/parallel category system is introduced.
   proven by: Vitest schema test asserting the template category column/Zod enum matches `LEAD_CATEGORIES`.
   strategy: Fully-Automated

6. **A rep can browse and select a template while composing outreach on a lead.**
   Given a rep on a lead's detail page with the outreach composer open, when they open the template browser, then they see templates, with the lead's own event category surfaced first/prominently, and can select one.
   proven by: Agent-Probe browser walkthrough (component/e2e harness gap — see Known Gaps) exercising open-browser → select-template.
   strategy: Agent-Probe

7. **Selecting a template substitutes known placeholders automatically.**
   Given a template body containing recognized placeholder tokens (organizer name, event name, rep name), when a rep selects that template on a specific lead, then the inserted text has those tokens replaced with the lead's organizer name, the lead's event name, and the signed-in rep's name respectively.
   proven by: Vitest unit test extending/reusing `fillTemplate`-equivalent pure function with the new variable set.
   strategy: Fully-Automated

8. **Unresolvable placeholders degrade gracefully.**
   Given a template references a placeholder for which the lead has no value (e.g., missing event name), when the template is inserted, then the placeholder resolves to an empty string rather than leaving literal `{{token}}` text or breaking the substitution of other placeholders.
   proven by: Vitest unit test (mirrors existing `fillTemplate` empty-value test case).
   strategy: Fully-Automated

9. **Inserting a template replaces the message field, with a confirmation if content would be lost.**
   Given the rep has already typed text into the outreach message field, when they select a template, then they are asked to confirm before their existing text is replaced; given the field is empty, when they select a template, then it fills in immediately with no confirmation needed.
   proven by: Agent-Probe browser walkthrough (component/e2e harness gap) exercising both the empty-field and dirty-field paths.
   strategy: Agent-Probe

10. **The message field remains editable after template insertion.**
    Given a template has been inserted into the message field, when the rep types further changes, then those changes are accepted normally and the eventual "log touch" submission uses the edited text, not the original template text.
    proven by: existing `LogTouchForm` submission behavior is unchanged; covered by Agent-Probe walkthrough alongside AC-9 (no new automated gate needed — this is pre-existing textarea behavior).
    strategy: Agent-Probe

11. **Existing static snippets are available in the new system after migration.**
    Given the feature ships, when a manager opens the templates list, then the 9 previously-hardcoded snippets exist as DB-backed templates (best-effort mapped to an event category), and the old static-only snippet path in `LogTouchForm.svelte` no longer reads from `src/lib/data/templates.ts`.
    proven by: one-time migration/seed script run + manual verification (Hybrid — requires live DB) + Vitest test that `LogTouchForm` no longer imports the static `TEMPLATES` constant.
    strategy: Hybrid

## Out Of Scope

- Per-rep or per-owner private templates — all templates are visible to the whole team in v1.
- A full audit/history trail for template changes (who changed what, when) — v1 ships with `createdAt`/`updatedAt` only. See Constraints/Known Gaps.
- Template usage analytics (which templates get used most, conversion tracking, etc.).
- Rich text / HTML formatting in template bodies — plain text with placeholder tokens only, matching the current note field.
- Multi-channel template variants (e.g., separate SMS vs. email wording) — a template is a single body used wherever outreach is composed today.
- Placeholder tokens beyond organizer name, event name, and rep name (e.g., deal value, company name) — can be added later but is not required for v1.
- Bulk import/export of templates via file upload — creation is one-at-a-time through the UI.
- Any change to the "log touch" / activity history data model itself — this feature only changes how the message text gets into that existing flow.
- Approval workflows for template changes (e.g., manager A drafts, manager B approves) — any manager can create/edit/delete unilaterally.

## Constraints

- Event category MUST reuse the existing `crm_lead_category` enum / `LEAD_CATEGORIES` list — no second, competing category taxonomy.
- Template management is manager-only, enforced the same way `/team` and `/api/users` already enforce manager-only access.
- All new DB objects follow existing conventions: `crm_`-prefixed table name, UUID primary key, `createdAt`/`updatedAt` timestamptz columns, soft-delete (nullable `deletedAt`, filtered at read time) — no hard deletes.
- Template create/edit forms use Superforms + Zod, consistent with every other form in the app.
- No audit/history table for templates in v1 (matches the precedent already accepted for `crm_meetings`) — explicitly a known, documented gap, not an oversight.
- Placeholder substitution must not throw or break message insertion when a value is unavailable — it must degrade to an empty string, matching current `fillTemplate` behavior.
- This feature supersedes the static-only scope of the completed `touch-log-templates` work; it does not need to preserve the old client-side-only static list as a fallback once migration is done.

## Open Questions

The following are decisions the orchestrator pre-answered as defaults during RESEARCH. Each is stated here explicitly for the user to confirm or override before PLAN begins. If none are overridden, INNOVATE/PLAN proceeds on these defaults.

1. **Category taxonomy** — Owner: user. Default: reuse the existing 20-value `crm_lead_category` enum, not the old intro/follow-up/pricing taxonomy. *Confirm or override?*
2. **Variable set** — Owner: user. Default: `{{organizerName}}`, `{{eventName}}`, `{{repName}}`, using the current `{{token}}` syntax, extensible later. *Confirm or override?*
3. **Insert behavior** — Owner: user. Default: selecting a template replaces the message field's content; a confirmation step only appears if the field already has unsaved text. *Confirm or override?*
4. **Migration of existing 9 snippets** — Owner: user. Default: seed them into the DB with best-effort category mapping (or an "Other"/uncategorized bucket), then remove the static import from `LogTouchForm.svelte`. *Confirm or override?*
5. **Audit trail** — Owner: user. Default: accepted as a v1 known-gap, `createdAt`/`updatedAt` only, no history table. *Confirm or override?*
6. **Manager UI location** — Owner: user. Default: new top-level route `/templates`, parallel in structure to `/team`, not nested under it. *Confirm or override?*
7. **Visibility** — Owner: user. Default: templates are global/team-wide; no per-rep scoping in v1. *Confirm or override?*

Additional questions the orchestrator surfaces that were not in the original 7:

8. **Category assignment cardinality** — Owner: user. Can a template belong to exactly one event category, or should it optionally apply to multiple categories (or "all categories")? Default assumption: one category per template (simplest, matches the single-`category` column pattern already used on `crm_leads`), with an "Other" category available as a catch-all for general-purpose templates. *Confirm or override?*
9. **What happens to a lead whose category has zero templates?** Default assumption: the rep-facing browser still shows all templates (just not pre-filtered/highlighted for that category) rather than showing an empty state with no path forward. *Confirm or override?*
10. **Does deleting a template affect touches that already used it?** Default assumption: no — once inserted, the message text is just plain text in the note/activity record; deleting the template later has zero effect on past touches, since there's no live reference kept. *Confirm or override?*

All ten items above are surfaced as explicit assumptions, not silently baked in. None block SPEC completion — they are framed as confirm-or-override defaults reasonable enough to proceed to INNOVATE, per the user's evident intent to move quickly ("I have existing templates... this time... full message with CRUD too"). If the user pushes back on any at the Phase-End Recommendation Gate, SPEC will be revised before INNOVATE proceeds.

## Background / Research Findings

- **Current static system** (`src/lib/data/templates.ts`): 9 hardcoded snippets, `TemplateCategory = 'intro'|'follow-up'|'pricing'` (a message-type taxonomy, not an event-type one), pure `fillTemplate(body, {page, event})` using `.replaceAll('{{page}}',...)`/`.replaceAll('{{event}}',...)`. Client-side only, no persistence, no CRUD.
- **Current composer** (`src/lib/components/leads/LogTouchForm.svelte`): a Popover-based "Templates" picker above the notes `Textarea` on the lead detail page. Today it *appends* filled text to the existing note rather than replacing it — this SPEC changes that behavior because templates are now full messages, not short snippets.
- **Event category already exists and is reusable**: `crm_lead_category` pgEnum (schema.ts:25-46) has all 20 values every lead already carries (Sports, Workshop, Church, Theater, Bar/DJ, Conference, Music Fest, Fan Fair, School, Concert, Live Band, Expo, Screening, Camp, Competition, Convention, Film, Modelling, Resort, Other), mirrored in `LEAD_CATEGORIES` (`src/lib/zod/schemas.ts`). This is the "event category" the user's original ACs refer to — no new taxonomy is needed.
- **No generic audit table exists** for non-lead entities; `crm_lead_history` is lead-FK-scoped only, and `crm_meetings` already ships without a history table — this is accepted repo precedent for treating "no audit trail" as a documented v1 known-gap rather than a blocker.
- **Manager/rep permission pattern is mature and reusable**: `crm_user_role` enum (`rep`/`manager`), `crmUsers.role`, pure helpers in `src/lib/utils/permissions.ts`, server-load guard pattern (see `src/routes/team/+page.server.ts:21`), and a manager-only API pattern (`src/routes/api/users/+server.ts:12`) all exist today and are the template for this feature's manager-only enforcement.
- **DB accessor convention**: per-domain files under `src/lib/server/db/{users,leads,meetings}.ts` — a new `templates.ts` accessor fits directly into this existing pattern.
- **Forms convention**: Superforms 2 + Zod 4 everywhere; validators live in `src/lib/zod/schemas.ts`.
- **Predecessor work**: `process/features/leads/completed/touch-log-templates_01-07-26/` shipped the current static, append-only snippet system explicitly scoped as a stopgap; its own report notes the popover a11y and component/e2e test gaps that remain relevant here (no component-test harness for `LogTouchForm` exists yet).
- **Test infra gap carried forward**: per `process/context/tests/all-tests.md`, no Playwright authenticated-session harness exists yet — all e2e specs self-skip on protected routes. Any rep-facing browser flow in this feature (template browsing, insertion, replace-confirmation) is therefore an Agent-Probe-tier acceptance criterion for now, not a Fully-Automated e2e gate, until the shared auth fixture backlog item resolves (`process/features/auth/backlog/e2e-auth-bootstrap_NOTE_01-07-26.md`).
- **User's verbatim brainstorm**: "A reusable collection of outreach message templates, organized by event category, accessible when composing outreach from a lead... Templates are stored in the CRM and manageable by managers (create, edit, delete)... organized by event category... reps can browse and insert a template... Template variables (e.g. organizer name, event name) are substituted automatically where possible. I have existing templates it should be related to that too but this time the templates are like full message with CRUD too." This confirms: (a) DB-backed persistence is required (not client-side), (b) event category is the intended grouping axis (not message-type), (c) full-message replace semantics (not append), (d) this explicitly relates to/supersedes the existing static template work.
