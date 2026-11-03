// What the correction form (src/components/CorrectionForm.astro) and its Worker endpoint (worker/correction.ts)
// agree on: field limits, the minimum fill time and the error codes the endpoint returns.

export const CORRECTION_LIMITS = {
  /** What is wrong: required, at most this many characters. */
  message: 2000,
  /** The page path, with its query string. */
  page: 300,
  /** The source line it was opened from, if any. */
  source: 200,
  /** RFC 5321's practical limit. */
  email: 254,
  /** The whole request body, in bytes. */
  body: 8192,
  /** Reports per IP per minute (the binding's own setting in wrangler.jsonc must match). */
  perMinute: 5,
};

/** Faster than this from opening the form to sending is a script, not a person. */
export const MIN_FILL_MS = 3000;

export type CorrectionError =
  | 'method' | 'origin' | 'too_large' | 'bad_request' | 'rate_limited' | 'too_fast'
  | 'required' | 'too_long' | 'email' | 'page' | 'unavailable' | 'send_failed';

export const CORRECTION_PATH = '/api/correction';
