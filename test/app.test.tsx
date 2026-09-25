import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../src/app/App';

describe('App', () => {
  it('本棚画面を表示する', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '本棚' })).toBeTruthy();
  });
});
