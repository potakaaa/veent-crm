/**
 * Stage domain logic. Visual vocabulary (label/color) is sourced from
 * `$lib/design/tokens` so there is no duplicate color table.
 */
import { STAGE_TOKENS, type StageKey } from '$lib/design/tokens';
import type { Stage } from '$lib/types';

/** Canonical funnel order. */
export const STAGE_ORDER: Stage[] = [
	'new',
	'contacted',
	'replied',
	'in_discussion',
	'won',
	'live',
	'done',
	'lost'
];

/** Stages shown on the pipeline board (lost is collapsed separately). */
export const BOARD_STAGES: Stage[] = [
	'new',
	'contacted',
	'replied',
	'in_discussion',
	'won',
	'live',
	'done'
];

const meta = (stage: Stage) => STAGE_TOKENS.find((s) => s.key === (stage as StageKey));

export const stageLabel = (stage: Stage): string => meta(stage)?.label ?? stage;
export const stageColor = (stage: Stage): string => meta(stage)?.hex ?? '#64748b';

export const isClosed = (stage: Stage): boolean => stage === 'won' || stage === 'lost';

/** Win capture is required when entering `won`; a reason is required for `lost`. */
export const requiresWonCapture = (stage: Stage): boolean => stage === 'won';
export const requiresLostReason = (stage: Stage): boolean => stage === 'lost';
/**
 * Revenue capture is required when entering `done` (GitHub #273). `done` is NOT
 * terminal (a lead may still move to another pipeline stage afterward), so it is
 * deliberately excluded from `isClosed()` (E6) — it is a board column, not a
 * closed/final state like `won`/`lost`.
 */
export const requiresDoneCapture = (stage: Stage): boolean => stage === 'done';
