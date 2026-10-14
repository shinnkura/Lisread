import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { ChapterContent } from '../../src/views/reader/ChapterContent';
import type { LoadedChapter } from '../../src/viewmodels/useReader';

const loaded = { chapter: { id: 'c', bookId: 'b', index: 0, href: 'c.xhtml', html: '<html><body><p>He gave up smoking. Then he slept.</p></body></html>' }, resolve: () => null } as unknown as LoadedChapter;

// jsdom の Range には getBoundingClientRect が無いので、位置計算用に空の矩形を返させる
if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = () => new DOMRect();

function select(container: HTMLElement, from: string, to: string) {
  const ws = Array.from(container.querySelectorAll<HTMLElement>('.w'));
  const a = ws.find((w) => w.textContent === from)!, b = ws.find((w) => w.textContent === to)!;
  const r = document.createRange(); r.setStart(a.firstChild!, 0); r.setEnd(b.firstChild!, b.textContent!.length);
  const s = document.getSelection()!; s.removeAllRanges(); s.addRange(r);
  act(() => { document.dispatchEvent(new Event('selectionchange')); });
}

afterEach(() => { document.getSelection()?.removeAllRanges(); cleanup(); });

describe('ChapterContent の範囲選択', () => {
  it('2 語以上を選ぶと「調べる」が出て、押すとフレーズとして辞書を開き、選択は解除される', () => {
    const onWordTap = vi.fn();
    const { container, queryByText, getByText } = render(<ChapterContent loaded={loaded} onReady={() => {}} onWordTap={onWordTap} />);
    select(container, 'gave', 'smoking');
    fireEvent.pointerDown(getByText('調べる'));
    expect(onWordTap).toHaveBeenCalledWith({ word: 'gave up smoking', words: ['gave', 'up', 'smoking'], sid: 0, wid: 1, sentence: 'He gave up smoking.' });
    expect(document.getSelection()?.isCollapsed).toBe(true);
    expect(queryByText('調べる')).toBeNull();
  });
  it('文をまたぐ選択では、かかった文をすべて例文にする', () => {
    const onWordTap = vi.fn();
    const { container, getByText } = render(<ChapterContent loaded={loaded} onReady={() => {}} onWordTap={onWordTap} />);
    select(container, 'smoking', 'Then');
    fireEvent.pointerDown(getByText('調べる'));
    expect(onWordTap.mock.calls[0][0]).toMatchObject({ word: 'smoking. Then', words: ['smoking', 'Then'], sentence: 'He gave up smoking. Then he slept.' });
  });
  it('1 語だけの選択ではボタンを出さず、選択中のクリックでは単語の辞書を開かない', () => {
    const onWordTap = vi.fn();
    const { container, queryByText } = render(<ChapterContent loaded={loaded} onReady={() => {}} onWordTap={onWordTap} />);
    select(container, 'gave', 'gave');
    expect(queryByText('調べる')).toBeNull();
    fireEvent.click(container.querySelector('.w')!);
    expect(onWordTap).not.toHaveBeenCalled();
  });
});
