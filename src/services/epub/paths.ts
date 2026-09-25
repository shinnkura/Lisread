// EPUB 内の相対パス解決ユーティリティ。
// OPF / nav / NCX に書かれた href は OPF や nav ファイルからの相対パスなので、
// zip 内の絶対パス（zip エントリ名）に変換するために使う。

export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

export function resolvePath(baseDir: string, href: string): string {
  let h = href.split('#')[0].split('?')[0];
  try { h = decodeURIComponent(h); } catch { /* そのまま使う */ }
  const parts = h.startsWith('/') ? [] : baseDir.split('/').filter(Boolean);
  for (const seg of h.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}
