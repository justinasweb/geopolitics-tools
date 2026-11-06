// Builds the request for one text from src/data/ai/prompt.md (kept in the repo, since Methodology describes it) and
// the text's facts file. The model sees the facts only: notes for the owner and generator details are left out.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FactsFile, FactsKind } from './facts.ts';

export interface Prompt { system: string; user: string }

export const PROMPT_PATH = 'src/data/ai/prompt.md';

/** The prompt file's sections by heading ("System", "Task: river", "Redraft"). */
export function promptSections(md = readFileSync(join(process.cwd(), PROMPT_PATH), 'utf8')): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of md.split(/^## /m).slice(1)) {
    const nl = part.indexOf('\n');
    out[part.slice(0, nl).trim()] = part.slice(nl + 1).trim();
  }
  return out;
}

/** What the model is given: the subject, the places it may name, and each fact without the owner's notes. */
export function factsForModel(f: FactsFile) {
  return {
    subject: f.subject,
    countries: f.countries ?? [],
    names: f.names ?? [],
    facts: f.facts.map((x) => ({ id: x.id, statement: x.statement, value: x.value ?? undefined, unit: x.unit || undefined, period: x.period, places: x.places, source: x.source, date: x.date, owner: x.owner || undefined })),
  };
}

export function buildPrompt(f: FactsFile, sections = promptSections()): Prompt {
  const task = sections[`Task: ${f.kind satisfies FactsKind}`];
  if (!sections.System || !task) throw new Error(`${PROMPT_PATH}: no "System" or "Task: ${f.kind}" section`);
  const fill = (s: string) => s.replaceAll('{subject}', f.subject);
  return {
    system: sections.System,
    user: `${fill(task)}\n\nFacts file:\n\n\`\`\`json\n${JSON.stringify(factsForModel(f), null, 2)}\n\`\`\``,
  };
}

export function redraftMessage(problems: string[], sections = promptSections()): string {
  return (sections.Redraft ?? '{problems}').replace('{problems}', problems.join('\n'));
}
