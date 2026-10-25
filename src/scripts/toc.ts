// Marks the in-page link of the section currently in view with aria-current="true".
export function initToc(nav: HTMLElement): void {
  const links = [...nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
  const targets = links.map((a) => document.getElementById(a.hash.slice(1))).filter((t): t is HTMLElement => !!t);
  if (!targets.length || !('IntersectionObserver' in window)) return;
  const mark = (id: string) => {
    for (const a of links) {
      if (a.hash === `#${id}`) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
  };
  const io = new IntersectionObserver((entries) => {
    const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (seen) mark(seen.target.id);
  }, { rootMargin: '0px 0px -70% 0px' });
  targets.forEach((t) => io.observe(t));
}
