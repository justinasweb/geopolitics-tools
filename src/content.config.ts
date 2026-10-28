// Content collections: the long-read pages (About, Methodology, Privacy), written in Markdown in the repo
// (spec, "Static pages"). A page stays marked as a draft until the owner approves it (spec, D15).
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

export const collections = { pages };
