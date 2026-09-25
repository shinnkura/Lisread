import { describe, it, expect } from 'vitest';
import { collectAssetRefs } from '../../src/services/reader/sanitize';

describe('collectAssetRefs', () => {
  it('img / image / link の参照を zip パスに解決して重複なしで返す', () => {
    const refs = collectAssetRefs('<img src="../images/a%20b.png"/><img src="../images/a%20b.png"/><link rel="stylesheet" href="../s.css"/><svg><image xlink:href="../images/c.jpg"/></svg>', 'OEBPS/text/ch1.xhtml');
    expect(refs).toEqual(['OEBPS/images/a b.png', 'OEBPS/s.css', 'OEBPS/images/c.jpg']);
  });
});
