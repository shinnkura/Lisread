import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { Book, Chapter } from '../../src/models/types';

const { updateProgress, getBookMock, getChapterMock, getAssetMock } = vi.hoisted(() => ({
  updateProgress: vi.fn(async (_bookId: string, _chapterIndex: number, _progress: number) => {}),
  getBookMock: vi.fn(),
  getChapterMock: vi.fn(),
  getAssetMock: vi.fn(),
}));

// ReaderView は services を直接 import するため、モジュールごとモックして BookRepositoryPort を差し替える
vi.mock('../../src/app/services', () => ({
  services: {
    books: {
      listBooks: vi.fn(),
      addBook: vi.fn(),
      deleteBook: vi.fn(),
      getBook: getBookMock,
      getChapter: getChapterMock,
      getAsset: getAssetMock,
      updateProgress,
    },
    vocabulary: {},
    epub: {},
    jaDict: {},
    speech: { isSupported: () => false, getVoices: async () => [], speak: async () => 'ended', cancel: () => {} },
  },
}));

const { ReaderView } = await import('../../src/views/reader/ReaderView');

const book: Book = { id: 'b', title: 'T', chapterCount: 1, lastChapterIndex: 0, lastScrollProgress: 0, addedAt: 1 };
const chapters: Chapter[] = [
  { id: 'b:0', bookId: 'b', index: 0, href: 'OEBPS/c0.xhtml', html: '<p>hello world</p>' },
];

let originalCreate: typeof URL.createObjectURL;
let originalRevoke: typeof URL.revokeObjectURL;

describe('ReaderView', () => {
  beforeEach(() => {
    originalCreate = URL.createObjectURL;
    originalRevoke = URL.revokeObjectURL;
    // jsdom は createObjectURL/revokeObjectURL を持たないため vi.fn でスタブする
    URL.createObjectURL = vi.fn(() => 'blob:mock') as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;

    getBookMock.mockReset().mockResolvedValue(book);
    getChapterMock.mockReset().mockImplementation(async (_: string, i: number) => chapters[i]);
    getAssetMock.mockReset().mockResolvedValue(undefined);
    updateProgress.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  it('本棚へ戻ってからアンマウントしても、直前のスクロール位置が 0 で上書きされない', async () => {
    const { container, getByRole, unmount } = render(
      <StrictMode>
        <ReaderView bookId="b" />
      </StrictMode>,
    );

    // .chapter-host は ChapterContent のマウント直後から存在するが、中身（onReady 呼び出し）は
    // 章 HTML の非同期読み込み完了後に入る。本文が実際に描画されるまで待つことで、
    // onReady のスクロール復元（scrollTop リセット）と操作のタイミング競合を避ける。
    await waitFor(() => expect(container.querySelector('.chapter-host')?.textContent).toContain('hello world'));

    const scroller = container.querySelector('.reader-scroll') as HTMLDivElement;
    Object.defineProperty(scroller, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 500, configurable: true });
    scroller.scrollTop = 250; // (1000 - 500) の 50%
    fireEvent.scroll(scroller);

    fireEvent.click(getByRole('button', { name: '本棚へ戻る' }));
    await waitFor(() => expect(updateProgress).toHaveBeenLastCalledWith('b', 0, 0.5));
    const callsAfterClick = updateProgress.mock.calls.length;

    unmount();

    // アンマウント後の cleanup による保存呼び出しがあっても、0 で上書きしてはいけない
    const callsAfterUnmount = updateProgress.mock.calls.slice(callsAfterClick);
    for (const call of callsAfterUnmount) expect(call[2]).not.toBe(0);
    expect(updateProgress).toHaveBeenLastCalledWith('b', 0, 0.5);
  });
});
