import { describe, it, expect } from 'vitest';
import { EpubParser, EpubParseError } from '../../src/services/epub/EpubParser';
import { makeEpub } from './fixtures';

const parser = new EpubParser();

describe('EpubParser', () => {
  it('書名・著者・表紙・spine 順の章・アセットを取り出す', async () => {
    const r = await parser.parse(await makeEpub());
    expect(r.title).toBe('Pride and Prejudice');
    expect(r.author).toBe('Jane Austen');
    expect(r.cover?.mime).toBe('image/png');
    expect(r.cover?.bytes[0]).toBe(137);
    expect(r.chapters.map((c) => c.href)).toEqual(['OEBPS/text/ch1.xhtml', 'OEBPS/text/ch2.xhtml']);
    expect(r.chapters.map((c) => c.title)).toEqual(['Chapter I', 'Chapter II']);
    expect(r.chapters[0].html).toContain('universally acknowledged');
    expect(r.chapters[0].html).not.toContain('<body');
    expect(r.assets.map((a) => a.path).sort()).toEqual(['OEBPS/images/cover.png', 'OEBPS/images/pic 1.png', 'OEBPS/style.css']);
  });
  it('nav がなければ NCX から章タイトルを取る', async () => {
    const r = await parser.parse(await makeEpub({ withNav: false, withNcx: true }));
    expect(r.chapters.map((c) => c.title)).toEqual(['One', 'Two']);
  });
  it('壊れた XHTML の章は HTML として緩く読む', async () => {
    const r = await parser.parse(await makeEpub({ brokenChapter: true }));
    expect(r.chapters[1].html).toContain('unclosed');
  });
  it('zip でないデータは EpubParseError', async () => {
    await expect(parser.parse(new TextEncoder().encode('hello').buffer)).rejects.toBeInstanceOf(EpubParseError);
  });
  it('OPF がなければ EpubParseError', async () => {
    await expect(parser.parse(await makeEpub({ noOpf: true }))).rejects.toThrow(/OPF/);
  });
  it('マニフェストに同じ path を指す item が複数あってもアセットは重複しない', async () => {
    const r = await parser.parse(await makeEpub({ duplicateManifest: true }));
    expect(r.assets.filter((a) => a.path === 'OEBPS/images/pic 1.png')).toHaveLength(1);
  });
});
