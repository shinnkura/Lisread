import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../src/app/App';

describe('App', () => {
  it('本棚画面を表示する', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '本棚' })).toBeTruthy();
    // useLibrary の初回読み込み（実 Dexie / fake-indexeddb）が未解決のままテストが終わると、
    // テスト環境の破棄後に setState が走って ReferenceError: window is not defined になることがあるため、
    // 読み込み完了を待ってからテストを終える。
    await screen.findByText('右上の「取り込み」から EPUB を追加してください');
  });
});
