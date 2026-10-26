// English words for the food crises views' extras (src/lib/hunger.ts). Same rules as pages.en.ts. IPC's phase names
// are its own; Phase 5 counts people in catastrophe, not famine, which IPC classifies by area.
export const HUNGER_TEXT = {
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  phase: { 1: 'Phase 1, minimal', 2: 'Phase 2, stressed', 3: 'Phase 3, crisis', 4: 'Phase 4, emergency', 5: 'Phase 5, catastrophe' } as Record<1 | 2 | 3 | 4 | 5, string>,
  latest: 'Latest analysis',
  latestCaption: (system: string, period: string, analysed: string) => `${system === 'CH' ? 'Cadre Harmonisé' : 'IPC'}, ${period}: people by phase, of ${analysed} analysed.`,
  catastrophe: 'People in catastrophe (Phase 5)',
  catastropheCaption: 'Countries whose latest analysis counts people in IPC Phase 5. Phase 5 counts households facing catastrophe; famine is a classification of an area, made only when several thresholds are met.',
  country: 'Country',
  period: 'Period',
  people5: 'Phase 5',
  people3: 'Phase 3 or above',
};
