// Kokoro 用のテキスト正規化と音素の後処理。kokoro-js（Apache-2.0）の phonemize.js を TypeScript に移植したもの。
// 音素化そのもの（espeak-ng）は phonemizer パッケージに任せ、ここでは前後の整形だけを行う。

export type Phonemizer = (text: string, language: string) => Promise<string[]>;
export type KokoroLang = 'a' | 'b'; // a = American English, b = British English

function splitNum(match: string): string {
  if (match.includes('.')) return match;
  if (match.includes(':')) {
    const [h, m] = match.split(':').map(Number);
    if (m === 0) return `${h} o'clock`;
    if (m < 10) return `${h} oh ${m}`;
    return `${h} ${m}`;
  }
  const year = parseInt(match.slice(0, 4), 10);
  if (year < 1100 || year % 1000 < 10) return match;
  const left = match.slice(0, 2);
  const right = parseInt(match.slice(2, 4), 10);
  const suffix = match.endsWith('s') ? 's' : '';
  if (year % 1000 >= 100 && year % 1000 <= 999) {
    if (right === 0) return `${left} hundred${suffix}`;
    if (right < 10) return `${left} oh ${right}${suffix}`;
  }
  return `${left} ${right}${suffix}`;
}

function flipMoney(match: string): string {
  const unit = match[0] === '$' ? 'dollar' : 'pound';
  if (isNaN(Number(match.slice(1)))) return `${match.slice(1)} ${unit}s`;
  if (!match.includes('.')) {
    const s = match.slice(1) === '1' ? '' : 's';
    return `${match.slice(1)} ${unit}${s}`;
  }
  const [b, c] = match.slice(1).split('.');
  const s = b === '1' ? '' : 's';
  const cents = parseInt(c.padEnd(2, '0'), 10);
  const coins = match[0] === '$' ? (cents === 1 ? 'cent' : 'cents') : cents === 1 ? 'penny' : 'pence';
  return `${b} ${unit}${s} and ${cents} ${coins}`;
}

function pointNum(match: string): string {
  const [a, b] = match.split('.');
  return `${a} point ${b.split('').join(' ')}`;
}

export function normalizeText(text: string): string {
  return text
    .replace(/[‘’]/g, "'").replace(/«/g, '“').replace(/»/g, '”').replace(/[“”]/g, '"')
    .replace(/\(/g, '«').replace(/\)/g, '»')
    .replace(/、/g, ', ').replace(/。/g, '. ').replace(/！/g, '! ').replace(/，/g, ', ').replace(/：/g, ': ').replace(/；/g, '; ').replace(/？/g, '? ')
    .replace(/[^\S \n]/g, ' ').replace(/  +/, ' ').replace(/(?<=\n) +(?=\n)/g, '')
    .replace(/\bD[Rr]\.(?= [A-Z])/g, 'Doctor')
    .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, 'Mister')
    .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, 'Miss')
    .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, 'Mrs')
    .replace(/\betc\.(?! [A-Z])/gi, 'etc')
    .replace(/\b(y)eah?\b/gi, "$1e'a")
    .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, splitNum)
    .replace(/(?<=\d),(?=\d)/g, '')
    .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, flipMoney)
    .replace(/\d*\.\d+/g, pointNum)
    .replace(/(?<=\d)-(?=\d)/g, ' to ')
    .replace(/(?<=\d)S/g, ' S')
    .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S")
    .replace(/(?<=X')S\b/g, 's')
    .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (m) => m.replace(/\./g, '-'))
    .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, '-')
    .trim();
}

const PUNCT = ';:,.!?¡¿—…"«»“”(){}[]';
const PUNCT_RE = new RegExp(`(\\s*[${PUNCT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]+\\s*)+`, 'g');

/** 句読点で区切り、句読点はそのまま残して各区間だけ音素化する */
export async function textToPhonemes(text: string, lang: KokoroLang, phonemize: Phonemizer, normalize = true): Promise<string> {
  const src = normalize ? normalizeText(text) : text;
  const parts: { punct: boolean; text: string }[] = [];
  let last = 0;
  for (const m of src.matchAll(PUNCT_RE)) {
    if (last < m.index!) parts.push({ punct: false, text: src.slice(last, m.index) });
    if (m[0].length > 0) parts.push({ punct: true, text: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < src.length) parts.push({ punct: false, text: src.slice(last) });
  const language = lang === 'a' ? 'en-us' : 'en';
  const joined = (await Promise.all(parts.map(async (p) => (p.punct ? p.text : (await phonemize(p.text, language)).join(' '))))).join('');
  let ps = joined
    .replace(/kəkˈoːɹoʊ/g, 'kˈoʊkəɹoʊ').replace(/kəkˈɔːɹəʊ/g, 'kˈəʊkəɹəʊ')
    .replace(/ʲ/g, 'j').replace(/r/g, 'ɹ').replace(/x/g, 'k').replace(/ɬ/g, 'l')
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, ' ')
    .replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, 'z');
  if (lang === 'a') ps = ps.replace(/(?<=nˈaɪn)ti(?!ː)/g, 'di');
  return ps.trim();
}
