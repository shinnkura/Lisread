import { describe, it, expect } from 'vitest';
import { sanitizeChapter } from '../../src/services/reader/sanitize';

describe('sanitizeChapter', () => {
  const resolve = (p: string) => (p === 'OEBPS/images/pic 1.png' ? 'blob:pic' : null);
  it('script と on* 属性を除き、img を blob URL に差し替える', () => {
    const el = sanitizeChapter('<p onclick="x()">Hi<script>alert(1)</script></p><img src="../images/pic%201.png"/><img src="../images/none.png"/><a href="http://x">l</a>',
      'OEBPS/text/ch1.xhtml', resolve);
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('p')?.getAttribute('onclick')).toBeNull();
    const imgs = el.querySelectorAll('img');
    expect(imgs[0].getAttribute('src')).toBe('blob:pic');
    expect(imgs[1].getAttribute('src')).toBeNull();
    expect(el.querySelector('a')?.getAttribute('href')).toBeNull();
  });
  it('svg image の xlink:href と link[rel=stylesheet] も差し替える', () => {
    const el = sanitizeChapter('<link rel="stylesheet" href="../style.css"/><svg><image xlink:href="../images/pic%201.png"/></svg>',
      'OEBPS/text/ch1.xhtml', (p) => (p.endsWith('.css') ? 'blob:css' : 'blob:pic'));
    expect(el.querySelector('link')?.getAttribute('href')).toBe('blob:css');
    expect(el.querySelector('image')?.getAttribute('href') ?? el.querySelector('image')?.getAttribute('xlink:href')).toBe('blob:pic');
  });
});
