import { dirname, resolvePath } from '../epub/paths';

export type AssetResolver = (zipPath: string) => string | null;

const REMOVE_TAGS = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'audio', 'video', 'meta', 'title', 'base'];
const XLINK = 'http://www.w3.org/1999/xlink';

export function sanitizeChapter(html: string, chapterHref: string, resolve: AssetResolver): HTMLElement {
  const doc = new DOMParser().parseFromString(`<div class="chapter">${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement;
  const base = dirname(chapterHref);

  root.querySelectorAll(REMOVE_TAGS.join(',')).forEach((e) => e.remove());
  for (const e of Array.from(root.querySelectorAll('*'))) {
    for (const a of Array.from(e.attributes)) {
      if (/^on/i.test(a.name)) e.removeAttribute(a.name);
    }
  }
  root.querySelectorAll('img[src], link[href], source[src]').forEach((e) => {
    const attr = e.hasAttribute('src') ? 'src' : 'href';
    const url = resolve(resolvePath(base, e.getAttribute(attr)!));
    if (url) e.setAttribute(attr, url); else e.removeAttribute(attr);
    if (e.tagName === 'LINK' && e.getAttribute('rel') !== 'stylesheet') e.remove();
  });
  root.querySelectorAll('image').forEach((e) => {
    const raw = e.getAttribute('href') ?? e.getAttributeNS(XLINK, 'href') ?? e.getAttribute('xlink:href');
    const url = raw ? resolve(resolvePath(base, raw)) : null;
    e.removeAttribute('xlink:href'); e.removeAttributeNS(XLINK, 'href');
    if (url) e.setAttribute('href', url); else e.remove();
  });
  root.querySelectorAll('a[href]').forEach((a) => a.removeAttribute('href'));
  root.querySelectorAll('[style]').forEach((e) => {
    if (/url\(/i.test(e.getAttribute('style') ?? '')) e.removeAttribute('style');
  });
  return document.importNode(root, true) as HTMLElement;
}

export function collectAssetRefs(html: string, chapterHref: string): string[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const base = dirname(chapterHref);
  const out: string[] = [];
  const push = (raw: string | null) => { if (!raw || /^(data|blob|https?):/i.test(raw)) return; const p = resolvePath(base, raw); if (!out.includes(p)) out.push(p); };
  doc.querySelectorAll('img[src], source[src]').forEach((e) => push(e.getAttribute('src')));
  doc.querySelectorAll('link[href]').forEach((e) => push(e.getAttribute('href')));
  doc.querySelectorAll('image').forEach((e) => push(e.getAttribute('href') ?? e.getAttributeNS(XLINK, 'href') ?? e.getAttribute('xlink:href')));
  return out;
}
