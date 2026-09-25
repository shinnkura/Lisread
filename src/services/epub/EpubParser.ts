import JSZip from 'jszip';
import type { ParsedEpub, BinaryAsset } from '../../models/types';
import { dirname, resolvePath } from './paths';

const NS_DC = 'http://purl.org/dc/elements/1.1/';
const MAX_ASSET_BYTES = 5 * 1024 * 1024;

export class EpubParseError extends Error {}

export interface EpubParserPort {
  parse(data: ArrayBuffer): Promise<ParsedEpub>;
}

interface ManifestItem { id: string; href: string; path: string; mediaType: string; properties: string }

export class EpubParser implements EpubParserPort {
  async parse(data: ArrayBuffer): Promise<ParsedEpub> {
    let zip: JSZip;
    try { zip = await JSZip.loadAsync(data); } catch { throw new EpubParseError('EPUB（zip）として開けません'); }

    const containerXml = await readText(zip, 'META-INF/container.xml');
    if (!containerXml) throw new EpubParseError('container.xml がありません');
    const opfPath = parseXml(containerXml).getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
    if (!opfPath) throw new EpubParseError('OPF の場所が分かりません');
    const opfXml = await readText(zip, opfPath);
    if (!opfXml) throw new EpubParseError('OPF ファイルがありません');
    const opf = parseXml(opfXml);
    const opfDir = dirname(opfPath);

    const title = opf.getElementsByTagNameNS(NS_DC, 'title')[0]?.textContent?.trim() || 'Untitled';
    const author = opf.getElementsByTagNameNS(NS_DC, 'creator')[0]?.textContent?.trim() || undefined;

    const manifest = new Map<string, ManifestItem>();
    for (const el of Array.from(opf.getElementsByTagName('item'))) {
      const id = el.getAttribute('id') ?? ''; const href = el.getAttribute('href') ?? '';
      manifest.set(id, { id, href, path: resolvePath(opfDir, href), mediaType: el.getAttribute('media-type') ?? '', properties: el.getAttribute('properties') ?? '' });
    }
    const spineItems = Array.from(opf.getElementsByTagName('itemref'))
      .map((el) => manifest.get(el.getAttribute('idref') ?? ''))
      .filter((it): it is ManifestItem => !!it && /xhtml|html/.test(it.mediaType));
    if (spineItems.length === 0) throw new EpubParseError('本文の章が見つかりません');

    const titles = await this.readTitles(zip, manifest, opf);

    const chapters = [];
    for (const [index, item] of spineItems.entries()) {
      const src = (await readText(zip, item.path)) ?? '';
      chapters.push({ index, title: titles.get(item.path), href: item.path, html: bodyInnerHtml(src) });
    }

    const cover = await this.readCover(zip, manifest, opf);
    // 複数の manifest item が同じ href（= 同じ path）を指すことがあるため、
    // path で重複排除する。リポジトリ側は path からアセット id を作るので、
    // 重複したまま bulkAdd すると import 全体が失敗する。
    const assets = [];
    const seenPaths = new Set<string>();
    for (const it of manifest.values()) {
      if (!(it.mediaType.startsWith('image/') || it.mediaType === 'text/css')) continue;
      if (seenPaths.has(it.path)) continue;
      const file = zip.file(it.path); if (!file) continue;
      const bytes = await file.async('uint8array');
      if (bytes.byteLength > MAX_ASSET_BYTES) continue;
      seenPaths.add(it.path);
      assets.push({ path: it.path, mime: it.mediaType, bytes });
    }
    return { title, author, cover, chapters, assets };
  }

  private async readTitles(zip: JSZip, manifest: Map<string, ManifestItem>, opf: Document) {
    const titles = new Map<string, string>();
    const nav = [...manifest.values()].find((m) => m.properties.split(/\s+/).includes('nav'));
    if (nav) {
      const doc = parseMarkup((await readText(zip, nav.path)) ?? '');
      const navEl = Array.from(doc.getElementsByTagName('nav')).find((n) => (n.getAttribute('epub:type') ?? n.getAttributeNS('http://www.idpf.org/2007/ops', 'type')) === 'toc') ?? doc.getElementsByTagName('nav')[0];
      for (const a of Array.from(navEl?.getElementsByTagName('a') ?? [])) {
        const href = a.getAttribute('href'); const text = a.textContent?.trim();
        if (href && text) { const p = resolvePath(dirname(nav.path), href); if (!titles.has(p)) titles.set(p, text); }
      }
      if (titles.size) return titles;
    }
    const ncx = [...manifest.values()].find((m) => m.mediaType === 'application/x-dtbncx+xml');
    if (ncx) {
      const doc = parseXml((await readText(zip, ncx.path)) ?? '');
      for (const np of Array.from(doc.getElementsByTagName('navPoint'))) {
        const src = np.getElementsByTagName('content')[0]?.getAttribute('src');
        const text = np.getElementsByTagName('text')[0]?.textContent?.trim();
        if (src && text) { const p = resolvePath(dirname(ncx.path), src); if (!titles.has(p)) titles.set(p, text); }
      }
    }
    return titles;
  }

  private async readCover(zip: JSZip, manifest: Map<string, ManifestItem>, opf: Document): Promise<BinaryAsset | undefined> {
    const metaId = Array.from(opf.getElementsByTagName('meta')).find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content');
    const item = (metaId && manifest.get(metaId)) || [...manifest.values()].find((m) => m.properties.split(/\s+/).includes('cover-image'));
    if (!item || !item.mediaType.startsWith('image/')) return undefined;
    const file = zip.file(item.path); if (!file) return undefined;
    return { mime: item.mediaType, bytes: await file.async('uint8array') };
  }
}

async function readText(zip: JSZip, path: string): Promise<string | null> {
  const f = zip.file(path);
  return f ? f.async('string') : null;
}

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

/** XHTML として読み、失敗したら HTML として緩く読む */
function parseMarkup(src: string): Document {
  try {
    const doc = new DOMParser().parseFromString(src, 'application/xhtml+xml');
    if (doc.getElementsByTagName('parsererror').length === 0 && doc.getElementsByTagName('body').length) return doc;
  } catch { /* HTML にフォールバック */ }
  return new DOMParser().parseFromString(src, 'text/html');
}

function bodyInnerHtml(src: string): string {
  const doc = parseMarkup(src);
  return doc.getElementsByTagName('body')[0]?.innerHTML ?? '';
}
