// Sources whose terms ask for links in the credit: the words that link, and where, within that source's part of a
// source line (parts are separated by "; "). WRI Aqueduct: "accessed on [date], aqueduct.wri.org (CC BY 4.0)", its
// site and its licence linked. Pure and small, so the map panels use it in the browser too.
export const SOURCE_LINKS: Record<string, [words: string, href: string][]> = {
  'WRI Aqueduct': [['aqueduct.wri.org', 'https://aqueduct.wri.org/'], ['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/']],
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A source line's credits as pieces of text, each with the link it carries, if any. */
export function sourcePieces(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = [];
  text.split('; ').forEach((part, i) => {
    if (i) out.push({ text: '; ' });
    let rest = part;
    for (const [words, href] of Object.entries(SOURCE_LINKS).find(([n]) => part.includes(n))?.[1] ?? []) {
      const at = rest.indexOf(words);
      if (at < 0) continue;
      if (at) out.push({ text: rest.slice(0, at) });
      out.push({ text: words, href });
      rest = rest.slice(at + words.length);
    }
    if (rest) out.push({ text: rest });
  });
  return out;
}

/** The credits as escaped HTML, with their links. */
export const sourceLinksHtml = (text: string): string =>
  sourcePieces(text).map((p) => (p.href ? `<a href="${p.href}" rel="noopener">${esc(p.text)}</a>` : esc(p.text))).join('');
