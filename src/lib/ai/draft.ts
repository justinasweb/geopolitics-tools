// Drafting (spec, D15, "Draft" and "Check"): one text from its facts file, checked, redrafted once with the
// checker's findings, and dropped if it fails again. The model client is passed in, so tests use a stub and nothing
// here calls the API by itself.
import Anthropic from '@anthropic-ai/sdk';
import { AI_ATTEMPTS, AI_KEY_ENV, AI_MAX_TOKENS, AI_MODEL } from './config.ts';
import { checkDraft, problemLines, type CheckResult } from './check.ts';
import { refusals, type FactsFile } from './facts.ts';
import { buildPrompt, promptSections, redraftMessage } from './prompt.ts';

export interface Turn { role: 'user' | 'assistant'; content: string }
/** A model that answers a conversation: the real one (anthropicClient) or a stub. */
export interface DraftClient {
  complete(req: { model: string; system: string; messages: Turn[] }): Promise<{ text: string; model: string }>;
}

export type DraftOutcome =
  | { ok: true; text: string; model: string; attempts: number }
  | { ok: false; reason: 'refused' | 'failed-check'; problems: string[]; attempts: number; last?: CheckResult };

/** Clean up what a model sends back: trims, drops a code fence it may wrap the text in. */
export const cleanReply = (s: string) => s.trim().replace(/^```(?:markdown|md|text)?\n([\s\S]*?)\n```$/, '$1').trim();

export async function draftText(facts: FactsFile, client: DraftClient, opts: { model?: string; attempts?: number } = {}): Promise<DraftOutcome> {
  const refused = refusals(facts);
  if (refused.length) return { ok: false, reason: 'refused', problems: refused, attempts: 0 };
  const sections = promptSections();
  const { system, user } = buildPrompt(facts, sections);
  const model = opts.model ?? AI_MODEL;
  const max = opts.attempts ?? AI_ATTEMPTS;
  const messages: Turn[] = [{ role: 'user', content: user }];
  let last: CheckResult | undefined;
  for (let attempt = 1; attempt <= max; attempt++) {
    const reply = await client.complete({ model, system, messages });
    const text = cleanReply(reply.text);
    last = checkDraft(text, facts);
    if (last.ok) return { ok: true, text, model: reply.model, attempts: attempt };
    messages.push({ role: 'assistant', content: text }, { role: 'user', content: redraftMessage(problemLines(last), sections) });
  }
  return { ok: false, reason: 'failed-check', problems: last ? problemLines(last) : [], attempts: max, last };
}

/** Thrown when there is no API key: the scripts catch it and stop with this message. */
export class NoKeyError extends Error {
  constructor() {
    super(`No ${AI_KEY_ENV} is set, so nothing was drafted. Set it (it is a GitHub secret for the drafting workflow), or ` +
      'draft by hand: paste the facts file into a Claude chat with src/data/ai/prompt.md, save the reply to a file and run ' +
      '"npm run ai:paste -- <text id> <file>". The same checker runs on it. See docs/ai-drafting.md.');
  }
}

/** The real client, on the Anthropic API. Refusals fall back to another model server-side; the model that answered
 *  is recorded with the text. */
export function anthropicClient(apiKey = process.env[AI_KEY_ENV]): DraftClient {
  if (!apiKey) throw new NoKeyError();
  const api = new Anthropic({ apiKey });
  return {
    async complete({ model, system, messages }) {
      const res = await api.beta.messages.create({
        model, max_tokens: AI_MAX_TOKENS, system, messages,
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      });
      if (res.stop_reason === 'refusal') throw new Error(`The model declined to draft (${res.stop_details?.category ?? 'no category'}).`);
      if (res.stop_reason === 'max_tokens') throw new Error('The reply was cut off at the token limit.');
      const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      return { text, model: res.model };
    },
  };
}
