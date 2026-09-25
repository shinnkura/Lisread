import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BookCard } from '../../src/views/library/BookCard';
import type { Book } from '../../src/models/types';

const withCover: Book = {
  id: 'a', title: 'Alpha', chapterCount: 4, lastChapterIndex: 0, lastScrollProgress: 0, addedAt: 1,
  cover: { mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) },
};
const withoutCover: Book = {
  id: 'b', title: 'Beta', chapterCount: 4, lastChapterIndex: 0, lastScrollProgress: 0, addedAt: 1,
};

describe('BookCard', () => {
  let created: string[];
  let revoked: string[];
  let originalCreate: typeof URL.createObjectURL;
  let originalRevoke: typeof URL.revokeObjectURL;

  beforeEach(() => {
    created = [];
    revoked = [];
    originalCreate = URL.createObjectURL;
    originalRevoke = URL.revokeObjectURL;
    let n = 0;
    // jsdom は createObjectURL/revokeObjectURL を持たないため vi.fn でスタブする
    URL.createObjectURL = vi.fn(() => {
      const u = `blob:mock-${++n}`;
      created.push(u);
      return u;
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn((u: string) => {
      revoked.push(u);
    }) as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    cleanup();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  it('StrictMode 下でも表紙 URL が破棄されずに表示され、アンマウントで確実に破棄される', () => {
    const { container, unmount } = render(
      <StrictMode>
        <BookCard book={withCover} onOpen={() => {}} onLongPress={() => {}} />
      </StrictMode>,
    );

    expect(URL.createObjectURL).toHaveBeenCalled();
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    // StrictMode の二重実行後も、表示中の URL はまだ破棄されていない最新の URL であること
    expect(img!.getAttribute('src')).toBe(created[created.length - 1]);
    expect(revoked).not.toContain(img!.getAttribute('src'));

    unmount();
    // アンマウント後は、生成されたすべての URL が破棄されていること
    for (const u of created) {
      expect(revoked).toContain(u);
    }
  });

  it('表紙がない場合はプレースホルダーを表示する', () => {
    const { container } = render(
      <BookCard book={withoutCover} onOpen={() => {}} onLongPress={() => {}} />,
    );
    expect(container.querySelector('img')).toBeNull();
    const placeholder = container.querySelector('.book-cover-placeholder');
    expect(placeholder).not.toBeNull();
    expect(placeholder!.textContent).toBe('Beta');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
