// Content collections: the long-read pages (About, Methodology, Privacy), written in Markdown in the repo
// (spec, "Static pages"), and the topic hubs' intros. A text stays marked as a draft until the owner approves it
// (spec, D15).
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const pages = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    kicker: z.string().default('About the site'),
    lede: z.string(),
    description: z.string(),
    /** When the text last changed (YYYY-MM-DD). */
    updated: z.string(),
    /** False until the owner has read and approved the text; the page then shows the draft banner. */
    approved: z.boolean().default(false),
    /** The drafting record (src/lib/ai/store.ts, docs/ai-drafting.md): who wrote it, the model, the hash of the facts
     *  file it was drafted from, and when it was drafted and approved. */
    author: z.enum(['ai', 'owner']).default('ai'),
    model: z.string().optional(),
    factsHash: z.string().optional(),
    drafted: z.string().optional(),
    approvedOn: z.string().optional(),
    approvedVia: z.enum(['cli', 'telegram', 'pr']).optional(),
  }),
});

/** A topic hub's two-sentence intro (src/content/hubs/<hub>.md), drafted with AI from the hub's views and their
 *  sources; the hub shows the draft banner until the owner approves it. */
const hubs = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/hubs' }),
  schema: z.object({
    intro: z.string(),
    /** What the first draft was written from; the facts file src/data/ai/facts/hubs/<hub>.json replaces it. */
    facts: z.array(z.string()).optional(),
    updated: z.string(),
    approved: z.boolean().default(false),
    /** The drafting record (src/lib/ai/store.ts, docs/ai-drafting.md): who wrote it, the model, the hash of the facts
     *  file it was drafted from, and when it was drafted and approved. */
    author: z.enum(['ai', 'owner']).default('ai'),
    model: z.string().optional(),
    factsHash: z.string().optional(),
    drafted: z.string().optional(),
    approvedOn: z.string().optional(),
    approvedVia: z.enum(['cli', 'telegram', 'pr']).optional(),
  }),
});

export const collections = { pages, hubs };
