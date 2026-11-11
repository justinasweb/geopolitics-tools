// English words for the Telegram bot (docs/telegram.md): the review messages the owner gets for AI drafts, the
// answers to the buttons, and the weekly digest posted to the channel. The bot's messages to the owner are working
// notes, so they are plain; the digest is public, so it follows the site's wording rules (counts with their period,
// no judging words). Imported by the Worker (worker/telegram.ts) and the scripts (scripts/review.ts, scripts/week.ts),
// so it imports nothing.

const n = (x: number) => new Intl.NumberFormat('en').format(x);
const s = (x: number, one: string, many: string) => `${n(x)} ${x === 1 ? one : many}`;
const EDIT_HEAD = '✏️ Corrected text wanted';

export const TELEGRAM_TEXT = {
  /** What each kind of text is, in the review message's title. */
  kind: { dossier: 'Dossier summary', history: 'Alliance history note', river: 'River summary', week: 'This week’s summary' } as Record<string, string>,
  reviewTitle: (kind: string, subject: string) => `For review: ${kind}, ${subject}`,
  reviewMeta: (o: { id: string; drafted?: string; model?: string; edited?: string; hash: string }) =>
    [o.id, o.edited ? `your correction of ${o.edited}` : o.drafted ? `drafted ${o.drafted}${o.model ? ` with ${o.model}` : ''}` : '', 'passed the number and fact check', `draft ${o.hash}`].filter(Boolean).join(' · '),
  reviewHelp: 'Approve publishes this exact text. Edit lets you reply with a corrected text, checked the same way. Skip publishes nothing.',
  buttons: { approve: '✅ Approve', edit: '✏️ Edit', skip: '⏭ Skip', post: '📣 Post to the channel', dontPost: 'Don’t post' },

  // What the Worker answers when a button is tapped (Telegram shows it briefly on the owner's screen).
  recorded: { a: 'Approval recorded. A GitHub run commits it and the site redeploys; you get a message when it is done.', s: 'Skip recorded. Nothing is published for this text.' } as Record<string, string>,
  dispatchFailed: (status: number | string) => `Could not start the GitHub run (${status}). Nothing was recorded; try the button again.`,
  /** The Edit prompt's fixed first line: a reply counts as a correction only when it answers a message opening with it. */
  editHead: EDIT_HEAD,
  editPrompt: (label: string, ref: string) => `${EDIT_HEAD}\nReply to this message with the corrected text for ${label}. It goes through the same number and fact check; if it passes, it comes back to you to approve.\n\n${ref}`,
  editNoText: 'Send the corrected text as a plain text reply to the Edit message.',
  editTooLong: (max: number) => `That reply is longer than ${n(max)} characters; send a shorter text.`,
  editReceived: 'Correction received. It is being checked; you get the result here.',
  help: 'This bot sends the site’s AI drafts for review (Approve, Edit, Skip) and the weekly digest (Post). It takes no other commands.',
  posted: 'Posted to the channel.',
  alreadyPosted: 'This week’s digest is already posted to the channel.',
  postNoRecord: 'The Worker cannot record the post (SNAPSHOTS bucket), so nothing was posted, to avoid posting it twice.',
  notPosted: 'Not posted.',
  postHolding: 'The site is still on the holding page, so nothing is posted to the channel.',
  postNoChannel: 'TELEGRAM_CHANNEL_ID is not set on the Worker, so nothing was posted.',
  postFailed: (status: number | string) => `Telegram did not accept the post (${status}). Nothing was posted.`,
  stale: 'This button is from an older message and does nothing now.',

  // What the GitHub run sends back.
  approved: (label: string) => `✅ Approved: ${label}. The site redeploys in a few minutes.`,
  skipped: (label: string) => `⏭ Skipped: ${label}. Nothing is published for it.`,
  weekSkipped: (week: number) => `⏭ Skipped: week ${week} has no summary; its page shows the cards only.`,
  failed: (what: string, label: string, reason: string) => `⚠️ ${what} did not go through for ${label}:\n${reason}`,
  editFailed: (label: string, reason: string) => `✏️ Your correction for ${label} was not accepted. Nothing changed; tap Edit again to send another.\n${reason}`,
  what: { approve: 'Approve', skip: 'Skip', edit: 'Edit' } as Record<string, string>,
  summaryDropped: (week: number, problems: string) => `This week’s summary for week ${week} failed the number and fact check twice and was dropped; the page shows the cards only.\n${problems}`,
  summaryNoKey: (week: number) => `No ANTHROPIC_API_KEY is set, so week ${week} has no summary; its page shows the cards only.`,

  // The weekly digest.
  digestIntro: (week: number) => `📣 Weekly digest for week ${week}. The next message is the post exactly as the channel would get it; tap Post to send it.`,
  digestTitle: (week: number, range: string) => `Week ${week} on geopolitics.tools: ${range}`,
  digestCounts: {
    disaster: (x: number) => s(x, 'new orange or red disaster alert (GDACS)', 'new orange or red disaster alerts (GDACS)'),
    outage: (x: number) => s(x, 'national-scale internet outage (IODA)', 'national-scale internet outages (IODA)'),
    /** `lists`: only the lists entries were added to, as a list ("US and UK"). */
    sanctions: (x: number, lists = 'US, EU and UK') => s(x, `entry added to the ${lists} sanctions lists`, `entries added to the ${lists} sanctions lists`),
  } as Record<string, (x: number, lists?: string) => string>,
  digestCountsLead: 'This week:',
  digestAi: 'Summary drafted with AI from the week’s data and reviewed by the editor.',
  digestLink: (url: string) => `The week’s maps, figures and sources: ${url}`,
  digestNotArchived: (week: number) => `No digest for week ${week}: the data run has not archived it, so it has no page.`,
  digestNotLive: (url: string, status: number | string) => `No digest yet: ${url} does not answer (${status}). Run week → digest again once the site has deployed.`,
  digestHolding: 'No digest: the site is still on the holding page (SITE_HOLDING).',
};
