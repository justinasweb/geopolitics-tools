// The drafting pipeline's settings, in one place (spec, D15). Methodology names the model, so change both together.

/** The model every text is drafted with. */
export const AI_MODEL = 'claude-sonnet-5-5';
/** Ceiling on one reply; texts are short, so this is never reached in practice. */
export const AI_MAX_TOKENS = 16000;
/** Drafts per text: the first, and one redraft with the checker's findings. Then the draft is dropped. */
export const AI_ATTEMPTS = 2;
/** The secret the API key is read from (GitHub secret of the same name in the drafting workflow). */
export const AI_KEY_ENV = 'ANTHROPIC_API_KEY';
/** The model recorded for a draft the owner pasted from a Claude chat. */
export const MANUAL_MODEL = 'manual (Claude chat)';
/** Length a drafted text must have, in words, for the kinds that set one (This week's summary: 100 to 150 words).
 *  A draft outside it is sent back once like any other failed check. An owner's correction (Edit) is not held to it. */
export const WORD_LIMITS: Partial<Record<string, [number, number]>> = { week: [100, 150] };
