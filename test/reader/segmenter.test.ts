import { describe, it, expect } from 'vitest';
import { segmentElement, getSentenceText, getSentenceElements, applySavedMarkers } from '../../src/services/reader/segmenter';

function el(html: string) { const d = document.createElement('div'); d.innerHTML = html; return d; }

describe('segmentElement', () => {
  it('文と単語を span で包み、sid は章内通番、wid は文内通番', () => {
    const root = el('<p>Hello world. It <i>rained</i> today.</p><p>Second para!</p>');
    expect(segmentElement(root)).toBe(3);
    expect(getSentenceText(root, 0)).toBe('Hello world.');
    expect(getSentenceText(root, 1)).toBe('It rained today.');
    expect(getSentenceText(root, 2)).toBe('Second para!');
    const words1 = getSentenceElements(root, 1).flatMap((s) => Array.from(s.querySelectorAll('.w')).map((w) => [w.textContent, w.getAttribute('data-wid')]));
    expect(words1).toEqual([['It', '0'], ['rained', '1'], ['today', '2']]);
    expect(root.querySelector('i .w')?.textContent).toBe('rained');
    expect(root.textContent).toBe('Hello world. It rained today.Second para!');
  });
  it('引用符付きの語は 1 語として包む', () => {
    const root = el('<p>“Don’t go,” she said.</p>');
    segmentElement(root);
    expect(Array.from(root.querySelectorAll('.w')).map((w) => w.textContent)).toEqual(['Don’t', 'go', 'she', 'said']);
  });
  it('数字だけの語は単語にしない', () => {
    const root = el('<p>Chapter 12 begins.</p>');
    segmentElement(root);
    expect(Array.from(root.querySelectorAll('.w')).map((w) => w.textContent)).toEqual(['Chapter', 'begins']);
  });
  it('applySavedMarkers は判定関数で .saved を付け外しする', () => {
    const root = el('<p>He stumbled and fell.</p>');
    segmentElement(root);
    applySavedMarkers(root, (w) => w === 'stumbled');
    expect(Array.from(root.querySelectorAll('.w.saved')).map((w) => w.textContent)).toEqual(['stumbled']);
    applySavedMarkers(root, () => false);
    expect(root.querySelectorAll('.w.saved')).toHaveLength(0);
  });
  // jsdom の DOM 生成は実ブラウザより一桁遅いため、ここでは回帰検知用に緩めた閾値を使う。
  // 実機での「1 秒以内」確認は受け入れ基準（実ブラウザでのテスト）で行う。
  it('Gutenberg 級の章（3000 文）を jsdom で 4 秒以内に分割する（回帰検知。実ブラウザでは 1 秒以内が目標）', () => {
    const root = el('<p>' + 'The quick brown fox jumps over the lazy dog. '.repeat(3000) + '</p>');
    const t = performance.now();
    expect(segmentElement(root)).toBe(3000);
    expect(performance.now() - t).toBeLessThan(4000);
  });
});
