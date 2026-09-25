import { describe, it, expect } from 'vitest';
import { dirname, resolvePath } from '../../src/services/epub/paths';

describe('paths', () => {
  it('dirname', () => {
    expect(dirname('OEBPS/text/ch1.xhtml')).toBe('OEBPS/text');
    expect(dirname('ch1.xhtml')).toBe('');
  });
  it('resolvePath は ../ と %20 と #fragment を扱う', () => {
    expect(resolvePath('OEBPS/text', '../images/a%20b.jpg')).toBe('OEBPS/images/a b.jpg');
    expect(resolvePath('OEBPS', './ch1.xhtml#p3')).toBe('OEBPS/ch1.xhtml');
    expect(resolvePath('', 'ch1.xhtml')).toBe('ch1.xhtml');
    expect(resolvePath('OEBPS', '/abs/x.css')).toBe('abs/x.css');
  });
});
