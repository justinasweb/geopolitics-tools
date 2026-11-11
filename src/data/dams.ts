// Global Dam Watch's dams that the site writes in its own spellings or that no longer stand, by GRanD id. `name` and
// `river` are the spellings the pages use (GDW's own stay in a source note beside the list); `destroyed` is the month
// the dam was destroyed (YYYY-MM), which GDW does not record. Checked against the eight river pages' dams, 10 Nov 2026.

export interface DamFix { name?: string; river?: string; destroyed?: string }

export const DAM_FIXES: Record<string, DamFix> = {
  // Dnipro: Ukrainian spellings, as on the river page.
  '4376': { name: 'Kakhovka', river: 'Dnipro', destroyed: '2023-06' },
  '4371': { name: 'Kremenchuk', river: 'Dnipro' },
  '4368': { name: 'Kyiv', river: 'Dnipro' },
  '4374': { name: 'Dnipro', river: 'Dnipro' },
  '4369': { name: 'Kaniv', river: 'Dnipro' },
  '4373': { name: 'Kamianske', river: 'Dnipro' },
};
