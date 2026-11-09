// /compare in the browser (D21): reads the pair from the address (?a=germany&b=france), goes to the static page if
// it is one of the three, else loads the two countries' files and draws the same sections as the static pairs with
// the shared markup (src/lib/compare/render.ts). The country boxes show the pair; picking another opens it.
import { COMPARE_TEXT as T, inSentence } from '../i18n/pages.en';
import { parsePair, staticPair, type CountryData, type Meta } from '../lib/compare/model';
import { compareHtml, esc, keyChipsHtml } from '../lib/compare/render';

/** A slug with no country file: said as it is, not as a failed load. */
class Unknown extends Error {}

export async function initCompare(): Promise<void> {
  const out = document.querySelector<HTMLElement>('[data-cmp-out]');
  const metaEl = document.getElementById('cmp-meta');
  if (!out || !metaEl || out.dataset.ready) return;
  out.dataset.ready = '1';
  const meta = JSON.parse(metaEl.textContent ?? '{}') as Meta;
  const { a, b } = parsePair(new URLSearchParams(location.search));
  const notice = (text: string) => { out.innerHTML = `<p class="gt-notice">${esc(text)}</p>`; };
  if (!a && !b) return;
  const fixed = staticPair(meta.pairs, a, b);
  if (fixed) return location.replace(fixed.path);

  // The boxes show what the address asked for, so changing one country keeps the other.
  const form = document.querySelector<HTMLFormElement>('form[data-cmp-pick]');
  const show = (side: 'a' | 'b', d: CountryData) => {
    const hidden = form?.querySelector<HTMLInputElement>(`input[name="${side}"]`);
    const box = form?.querySelector<HTMLInputElement>(`[data-cmp-for="${side}"] input`);
    if (hidden) hidden.value = d.slug;
    if (box) box.value = d.name;
  };

  if (!a || !b) return notice(T.pickTwo);
  if (a === b) return notice(T.same);
  out.setAttribute('aria-busy', 'true');
  notice(T.loading);
  let c: [CountryData, CountryData];
  try {
    const got = await Promise.all([a, b].map(async (slug) => {
      const res = await fetch(`${meta.base}${slug}.json`);
      if (res.status === 404) throw new Unknown(T.unknown(slug));
      if (!res.ok) throw new Error(T.failed);
      return (await res.json()) as CountryData;
    }));
    c = got as [CountryData, CountryData];
  } catch (e) {
    out.setAttribute('aria-busy', 'false');
    return notice(e instanceof Unknown ? e.message : T.failed);
  }
  show('a', c[0]);
  show('b', c[1]);
  const [na, nb] = c.map((x) => x.name);
  document.title = document.title.replace(T.anyTitle, T.title(na, nb));
  document.querySelector('[data-cmp-title]')!.textContent = `${inSentence(na, true)} and ${inSentence(nb)}`;
  document.querySelector('[data-cmp-lede]')!.textContent = T.lede(inSentence(na, true), inSentence(nb));
  const chips = document.querySelector<HTMLElement>('[data-cmp-chips]')!;
  chips.innerHTML = keyChipsHtml(c);
  chips.hidden = false;
  out.innerHTML = compareHtml(meta, c, location.pathname);
  out.setAttribute('aria-busy', 'false');
  const live = document.getElementById('gt-live');
  if (live) live.textContent = T.shown(na, nb);
}
