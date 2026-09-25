const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'DD', 'DT', 'TD', 'TH', 'FIGCAPTION', 'DIV', 'SECTION', 'ARTICLE', 'ASIDE', 'HEADER', 'FOOTER', 'PRE', 'TABLE', 'TR', 'UL', 'OL', 'DL', 'NAV', 'MAIN', 'CENTER', 'BODY']);
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'MATH', 'svg', 'math']);

interface Word { start: number; end: number; wid: number }
interface Sentence { start: number; end: number; sid: number; words: Word[] }

const sentenceSeg = new Intl.Segmenter('en', { granularity: 'sentence' });
const wordSeg = new Intl.Segmenter('en', { granularity: 'word' });

/** root 配下のテキストを文・単語 span で包み直す。戻り値は文の数 */
export function segmentElement(root: HTMLElement): number {
  let sid = 0;
  for (const nodes of collectGroups(root)) {
    const starts: number[] = [];
    let text = '';
    for (const n of nodes) { starts.push(text.length); text += n.data; }
    if (!text.trim()) continue;
    const sentences = analyze(text, sid);
    sid += sentences.length;
    nodes.forEach((n, i) => rebuild(n, starts[i], starts[i] + n.data.length, sentences));
  }
  return sid;
}

export function getSentenceElements(root: HTMLElement, sid: number): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(`.s[data-sid="${sid}"]`));
}

export function getSentenceText(root: HTMLElement, sid: number): string | null {
  const els = getSentenceElements(root, sid);
  return els.length ? els.map((e) => e.textContent ?? '').join('') : null;
}

export function applySavedMarkers(root: HTMLElement, isSaved: (word: string) => boolean): void {
  root.querySelectorAll<HTMLElement>('.w').forEach((w) => w.classList.toggle('saved', isSaved(w.textContent ?? '')));
}

/** 直近のブロック要素が同じ連続テキストノードをひとまとめにする */
function collectGroups(root: HTMLElement): Text[][] {
  const groups: Text[][] = [];
  let current: Text[] = []; let currentBlock: Node | null = null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      for (let p = n.parentElement; p && p !== root; p = p.parentElement) if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    let block: Node = root;
    for (let p = n.parentElement; p && p !== root; p = p.parentElement) if (BLOCK_TAGS.has(p.tagName)) { block = p; break; }
    if (block !== currentBlock) { if (current.length) groups.push(current); current = []; currentBlock = block; }
    current.push(n);
  }
  if (current.length) groups.push(current);
  return groups;
}

function analyze(text: string, firstSid: number): Sentence[] {
  const out: Sentence[] = [];
  let sid = firstSid;
  for (const s of sentenceSeg.segment(text)) {
    const lead = s.segment.length - s.segment.trimStart().length;
    const start = s.index + lead;
    const end = s.index + s.segment.trimEnd().length;
    if (end <= start) continue;
    const words: Word[] = [];
    for (const w of wordSeg.segment(text.slice(start, end))) {
      if (!w.isWordLike || !/[A-Za-z]/.test(w.segment)) continue;
      words.push({ start: start + w.index, end: start + w.index + w.segment.length, wid: words.length });
    }
    out.push({ start, end, sid: sid++, words });
  }
  return out;
}

/** 元テキスト中 [a,b) を占めるテキストノードを、文・単語 span を含む断片で置き換える */
function rebuild(node: Text, a: number, b: number, sentences: Sentence[]): void {
  const doc = node.ownerDocument;
  const data = node.data;
  const frag = doc.createDocumentFragment();
  const emit = (parent: Node, from: number, to: number) => { if (to > from) parent.appendChild(doc.createTextNode(data.slice(from - a, to - a))); };
  let pos = a;
  // このテキストノードに重なる最初の文まで二分探索で飛ばす（1 グループに複数テキストノードがある場合の再走査を避ける）
  for (let i = findFirstOverlapping(sentences, a); i < sentences.length; i++) {
    const s = sentences[i];
    if (s.start >= b) break;
    const sStart = Math.max(s.start, a), sEnd = Math.min(s.end, b);
    emit(frag, pos, sStart);
    const span = doc.createElement('span');
    span.setAttribute('class', 's'); span.setAttribute('data-sid', String(s.sid));
    let p = sStart;
    for (const w of s.words) {
      if (w.end <= sStart) continue;
      if (w.start >= sEnd) break;
      const wStart = Math.max(w.start, sStart), wEnd = Math.min(w.end, sEnd);
      emit(span, p, wStart);
      const ws = doc.createElement('span');
      ws.setAttribute('class', 'w'); ws.setAttribute('data-wid', String(w.wid));
      ws.appendChild(doc.createTextNode(data.slice(wStart - a, wEnd - a)));
      span.appendChild(ws);
      p = wEnd;
    }
    emit(span, p, sEnd);
    frag.appendChild(span);
    pos = sEnd;
  }
  emit(frag, pos, b);
  node.replaceWith(frag);
}

/** sentences（start 昇順）の中から、offset a 以降にかかる最初の文のインデックスを二分探索で求める */
function findFirstOverlapping(sentences: Sentence[], a: number): number {
  let lo = 0, hi = sentences.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sentences[mid].end <= a) lo = mid + 1; else hi = mid;
  }
  return lo;
}
