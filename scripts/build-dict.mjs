import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// TSV を { 見出し語(小文字) => 意味 } の Map に変換する
export function parseTsv(tsv) {
  const map = new Map();
  for (const line of tsv.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const heads = line.slice(0, tab).split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
    const meaning = line.slice(tab + 1).trim();
    if (!meaning) continue;
    for (const h of heads) if (!map.has(h)) map.set(h, meaning);
  }
  return map;
}

// 見出し語の先頭文字から出力先シャードキーを決める（a〜z / other）
export function shardKey(word) {
  const c = word[0]?.toLowerCase() ?? '';
  return c >= 'a' && c <= 'z' ? c : 'other';
}

// TSV を読み込んでシャードごとの JSON に分割書き出しする
export function build(tsvPath, outDir) {
  const map = parseTsv(readFileSync(tsvPath, 'utf8'));
  const shards = {};
  // プロトタイプなしのオブジェクトにすることで、"__proto__" などの見出し語が
  // setter として解釈されて壊れるのを防ぐ
  for (const [w, m] of map) (shards[shardKey(w)] ??= Object.create(null))[w] = m;
  mkdirSync(outDir, { recursive: true });
  for (const [k, obj] of Object.entries(shards)) writeFileSync(join(outDir, `${k}.json`), JSON.stringify(obj));
  return map.size;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const n = build(join(root, 'data/ejdict.tsv'), join(root, 'public/dict'));
  console.log(`辞書 ${n} 語を public/dict に書き出しました`);
}
