/**
 * Presentational "next action" cue derived from a lead's urgency bucket.
 *
 * This is display-only vocabulary for the Command Center views (Today rows,
 * leads grid, pipeline cards, lead detail). It reads the existing `urgency`
 * field — it does not compute or change any urgency/business logic.
 */
import type { Urgency } from '$lib/types';

export interface RiskMeta {
	/** Short imperative label, e.g. "Follow up now". */
	label: string;
	/** Timing hint, e.g. "overdue", "today", ">30d". */
	due: string;
	/** Accent color (hex) matching the design's risk palette. */
	color: string;
	/** True when the lead needs attention (overdue / due today / going cold). */
	atRisk: boolean;
}

// Semantic status → accent color. Reused for the pipeline card left accent, the
// leads-grid risk dot, the Today next-action cue, and the lead-detail header strip.
// overdue / due = red · cold = orange · replied = purple · fresh (recent activity) =
// green · normal (neutral / new / unassigned) = muted gray. Colors reuse the token
// palette (--color-overdue/-stale/-fresh, stage-replied, stage-new).
const RISK: Record<Urgency, RiskMeta> = {
	overdue: { label: 'Follow up now', due: 'overdue', color: '#dc2626', atRisk: true },
	due: { label: 'Follow up today', due: 'today', color: '#e11d2a', atRisk: true },
	replied: { label: 'Reply now', due: 'now', color: '#7c3aed', atRisk: false },
	cold: { label: 'Re-touch — gone quiet', due: '>30d', color: '#d97706', atRisk: true },
	fresh: { label: 'Keep warm', due: 'queued', color: '#059669', atRisk: false },
	normal: { label: 'Keep warm', due: 'queued', color: '#6b7280', atRisk: false }
};

export const riskMeta = (urgency: Urgency): RiskMeta => RISK[urgency] ?? RISK.normal;
