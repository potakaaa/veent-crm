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
	'lost'
];

/** Stages shown on the pipeline board (lost is collapsed separately). */
export const BOARD_STAGES: Stage[] = [
	'new',
	'contacted',
	'replied',
	'in_discussion',
	'won',
	'live'
];

const meta = (stage: Stage) => STAGE_TOKENS.find((s) => s.key === (stage as StageKey));

export const stageLabel = (stage: Stage): string => meta(stage)?.label ?? stage;
export const stageColor = (stage: Stage): string => meta(stage)?.hex ?? '#64748b';

export const isClosed = (stage: Stage): boolean => stage === 'won' || stage === 'lost';

/** Win capture is required when entering `won`; a reason is required for `lost`. */
export const requiresWonCapture = (stage: Stage): boolean => stage === 'won';
export const requiresLostReason = (stage: Stage): boolean => stage === 'lost';
