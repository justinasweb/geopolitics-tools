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
  }),
});

/** A topic hub's two-sentence intro (src/content/hubs/<hub>.md), drafted with AI from the hub's views and their
 *  sources; the hub shows the draft banner until the owner approves it. */
const hubs = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/hubs' }),
  schema: z.object({
    intro: z.string(),
    /** What the draft was written from: the views and sources it describes, so it can be checked. */
    facts: z.array(z.string()),
    updated: z.string(),
    approved: z.boolean().default(false),
  }),
});

export const collections = { pages, hubs };
