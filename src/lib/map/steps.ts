// The colour steps of a sequential map legend. Quantile edges that fall on one value are merged, so a map can have
// fewer than five bands; their colours are spread over the scale's five steps, the top band always the darkest. The
// map layers, the indicator pages' static maps and every legend read this, so it imports nothing.

const STEPS: Record<number, number[]> = { 1: [5], 2: [2, 5], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5] };

/** The seq-1…seq-5 steps for a scale with `bands` bands (one more than its edges). */
export const seqSteps = (bands: number): number[] => STEPS[Math.max(1, Math.min(5, bands))];
