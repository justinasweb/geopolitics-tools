// English words for the extras on the sanctions views. Same rules as views.en.ts.

export const SANCTIONS_TEXT = {
  byList: 'By list',
  byListCaption: 'Listings on each list; a target on two lists counts on both.',
  list: { US: 'US (SDN)', EU: 'EU', UK: 'UK' } as Record<string, string>,
  byType: 'What is listed',
  type: { person: 'People', entity: 'Companies and bodies', vessel: 'Ships', aircraft: 'Aircraft' } as Record<string, string>,
  programmes: 'Main programmes',
  programmesCaption: 'The programme or regime each list files a listing under, as the list names it.',
  morePrograms: (n: number) => `and ${n} more`,
};
