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
