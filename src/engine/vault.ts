import type { VaultEntry } from './types';

/**
 * The Context & Constraint Vault.
 *
 * Fragile spans (code, URLs, literals, versions) are replaced with opaque
 * placeholders so that no later text transform can corrupt them. The vault is
 * fully reversible: `restore()` is a straight substitution and is asserted to
 * be the exact inverse of `seal()` in tests.
 *
 * Placeholders are deliberately *not* sent to any model, so their token cost is
 * irrelevant; only restored text is ever counted.
 */

interface Span {
  start: number;
  end: number;
  kind: VaultEntry['kind'];
  /** Higher wins when spans overlap. */
  priority: number;
}

const PATTERNS: ReadonlyArray<{
  kind: VaultEntry['kind'];
  priority: number;
  re: RegExp;
}> = [
  // Fenced code first: it may contain anything, including fake placeholders.
  { kind: 'fenced-code', priority: 100, re: /(?:^|\n)([ \t]*)(```|~~~)[^\n]*\n[\s\S]*?\n[ \t]*\2/g },
  { kind: 'xml-like', priority: 90, re: /<\/?[a-zA-Z][\w:.-]*(?:\s[^<>]{0,400})?\/?>/g },
  { kind: 'inline-code', priority: 80, re: /`[^`\n]+`/g },
  { kind: 'url', priority: 70, re: /\b(?:https?|ftp|wss?):\/\/[^\s<>"'`)\]]+/gi },
  { kind: 'url', priority: 70, re: /\bwww\.[^\s<>"'`)\]]+/gi },
  { kind: 'path', priority: 60, re: /(?:[A-Za-z]:\\|\.{1,2}\/|\/)(?:[\w.@-]+\/)+[\w.@-]*/g },
  { kind: 'path', priority: 60, re: /\b[\w.-]+\.(?:ts|tsx|js|jsx|json|py|rb|go|rs|java|kt|c|cpp|h|cs|php|swift|sql|html|css|scss|yml|yaml|toml|ini|env|sh|md|txt|xml|csv|lock)\b/g },
  {
    // Quotes are matched as *paired delimiters*, never as a lone apostrophe.
    //
    // A single `'` is overwhelmingly an apostrophe in running prose ("I've",
    // "don't", "it's"), so a naive /'.*?'/ pair-vaults half the prompt and makes
    // every word inside it invisible to the cleanup transforms. The lookbehind
    // requires the opener to follow a boundary, and the lookahead requires the
    // closer to be followed by one — which an apostrophe inside a word never is.
    kind: 'quoted',
    priority: 50,
    re: /"[^"\n]{1,400}"|(?<=^|[\s([{:=,])'[^'\n]{1,200}'(?=$|[\s)\]},.;:!?])|“[^”\n]{1,400}”/g,
  },
  {
    kind: 'number',
    priority: 40,
    // Only numbers carrying meaning: versions, units, or comparison operators.
    re: /\b(?:v?\d+\.\d+(?:\.\d+)?|\d+\s?(?:ms|s|sec|secs|seconds?|minutes?|hours?|days?|weeks?|months?|years?|px|em|rem|kb|mb|gb|tb|k|m|%|x|dpi|fps|hz|khz|ghz|req\/s|rps|qps|tok(?:en)?s?))\b/gi,
  },
  { kind: 'number', priority: 40, re: /(?:[<>]=?|≥|≤)\s?\d[\d,._]*/g },
  { kind: 'json', priority: 45, re: /\{[^{}]{2,600}\}|\[[^\[\]]{2,600}\]/g },
];

/** Reject spans that are too short or that would swallow regular prose. */
function plausible(text: string, span: Span): boolean {
  const raw = text.slice(span.start, span.end);
  if (!raw.trim()) return false;
  if (span.kind === 'json') {
    // Require a JSON-ish shape so ordinary bracketed prose is untouched.
    return /[:"]/.test(raw) && !/^\[[a-z\s]+\]$/i.test(raw);
  }
  if (span.kind === 'path') {
    // A single dotted token like "Node.js" or "v1.2" is not a path.
    return /[/\\]/.test(raw) || /\b(?:src|dist|lib|test|app|public|config|package)\b/.test(raw);
  }
  if (span.kind === 'quoted') {
    // A two-character span is punctuation, not a quotation. Also reject any span
    // whose interior is just an apostrophe continuation such as `'ve`.
    if (raw.length < 3) return false;
    if (/^'[a-z]{1,2}$/i.test(raw)) return false;
    return true;
  }
  return true;
}

function collectSpans(text: string): Span[] {
  const spans: Span[] = [];
  for (const { kind, priority, re } of PATTERNS) {
    const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
      if (m[0].length === 0) {
        rx.lastIndex += 1;
        continue;
      }
      const span: Span = { start: m.index, end: m.index + m[0].length, kind, priority };
      if (plausible(text, span)) spans.push(span);
    }
  }
  return spans;
}

/** Priority-first, then longer-first, then earlier-first. Deterministic. */
function resolveOverlaps(spans: Span[]): Span[] {
  const sorted = [...spans].sort(
    (a, b) =>
      b.priority - a.priority ||
      b.end - b.start - (a.end - a.start) ||
      a.start - b.start,
  );
  const kept: Span[] = [];
  for (const span of sorted) {
    const clash = kept.some((k) => span.start < k.end && k.start < span.end);
    if (!clash) kept.push(span);
  }
  return kept.sort((a, b) => a.start - b.start);
}

export interface SealedText {
  readonly text: string;
  readonly entries: readonly VaultEntry[];
}

export function seal(input: string): SealedText {
  const spans = resolveOverlaps(collectSpans(input));
  const entries: VaultEntry[] = [];
  let out = '';
  let cursor = 0;

  for (const span of spans) {
    const placeholder = `\u0001${entries.length}\u0001`;
    out += input.slice(cursor, span.start) + placeholder;
    entries.push({
      id: entries.length,
      placeholder,
      original: input.slice(span.start, span.end),
      kind: span.kind,
    });
    cursor = span.end;
  }
  out += input.slice(cursor);

  return { text: out, entries };
}

/**
 * Exact inverse of {@link seal}. Substitution only — no parsing — so it cannot
 * mis-nest or partially restore.
 */
export function restore(text: string, entries: readonly VaultEntry[]): string {
  let out = text;
  for (const entry of entries) {
    out = out.split(entry.placeholder).join(entry.original);
  }
  return out;
}

/** True when every placeholder from `entries` is still present in `text`. */
export function placeholdersIntact(text: string, entries: readonly VaultEntry[]): boolean {
  return entries.every((e) => text.includes(e.placeholder));
}

/** Strips placeholders entirely — used for word counting and diagnostics. */
export function stripPlaceholders(text: string): string {
  return text.replace(/\u0001\d+\u0001/g, ' ');
}

export const VAULT_PLACEHOLDER_RE = /\u0001\d+\u0001/g;
