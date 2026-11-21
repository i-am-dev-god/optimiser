import {
  FILLER_OPENERS,
  FILLER_PHRASES,
  GERUND_TO_IMPERATIVE,
  GREETINGS,
  IMPERATIVE_VERBS,
  POSTAMBLE_TAIL,
  PREAMBLE_FRAMES,
  PURE_FILLER_SENTENCES,
} from './phrases';
import type { Transform } from './types';
import { stripPlaceholders, VAULT_PLACEHOLDER_RE } from './vault';

/**
 * Stage 4: safe transformation.
 *
 * Contract for every function below:
 *  - it operates on *sealed* text, so vaulted spans are untouchable;
 *  - it returns a `Transform` describing what it did and why;
 *  - `applied: false` means the edit was rejected, and `before` is returned
 *    unchanged. Callers do not have to undo anything.
 *
 * The guiding rule is that a rejected edit is always preferable to a broken
 * one: we would rather leave a prompt slightly wordy than turn it into a
 * sentence fragment.
 */

const IMPERATIVE_RE = new RegExp(
  `^(?:${IMPERATIVE_VERBS.join('|')})\\b`,
  'i',
);

/**
 * Users type curly apostrophes and quotes from mobile keyboards and pasted
 * documents. Normalising once here means every phrase pattern is written
 * against a single form, instead of every pattern needing two variants.
 */
export function normalizeTypography(text: string): string {
  return text
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, '-');
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:])(?=[^\s\d])/g, '$1 ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/^[\s,;:.-]+/, '')
    .replace(/\s+$/, '')
    .replace(/\.{2,}/g, '.');
}

function capitalizeFirst(text: string): string {
  const match = text.match(/\u0001\d+\u0001|[\p{L}]/u);
  if (!match) return text;
  const index = match.index ?? 0;
  // Never capitalise inside a placeholder or a leading code span.
  if (match[0].startsWith('\u0001')) return text;
  const ch = text[index];
  if (!ch) return text;
  return text.slice(0, index) + ch.toUpperCase() + text.slice(index + 1);
}

function placeholderCount(text: string): number {
  return (text.match(VAULT_PLACEHOLDER_RE) ?? []).length;
}

/** Shared acceptance predicate: no structural damage may have occurred. */
function structurallySound(before: string, after: string): { ok: boolean; why: string } {
  if (!after.trim()) return { ok: false, why: 'the edit would have emptied the prompt' };
  if (placeholderCount(before) !== placeholderCount(after)) {
    return { ok: false, why: 'the edit would have dropped a protected span' };
  }
  if (/^[\s,;:.!?-]/.test(after)) {
    return { ok: false, why: 'the edit would have left leading punctuation' };
  }
  if (stripPlaceholders(after).split(/\s+/).filter(Boolean).length === 0) {
    return { ok: false, why: 'no words would remain' };
  }
  return { ok: true, why: '' };
}

/**
 * Detects a clause that cannot begin a sentence: it opens with "and"/"but" or
 * has no finite verb, which is the signature of a half-stripped request.
 */
function looksLikeFragment(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/^(?:and|but|or|so|also|then|plus)\b/i.test(trimmed)) return true;
  return false;
}

function noop(kind: Transform['kind'], reason: string, before: string): Transform {
  return { kind, applied: false, reason, before, after: before };
}

export function stripGreetings(text: string): Transform {
  let working = text;
  const removed: string[] = [];
  for (let pass = 0; pass < 3; pass += 1) {
    let hit = false;
    for (const re of [...GREETINGS, ...FILLER_OPENERS]) {
      const m = working.match(re);
      if (m && m.index === 0) {
        removed.push(m[0].trim());
        working = working.slice(m[0].length);
        hit = true;
        break;
      }
    }
    if (!hit) break;
  }
  if (removed.length === 0) return noop('strip-preamble', 'No greeting at the start of the prompt.', text);
  const check = structurallySound(text, working);
  if (!check.ok) return noop('strip-preamble', `Kept the greeting because ${check.why}.`, text);
  return {
    kind: 'strip-preamble',
    applied: true,
    reason: `Removed greeting(s): ${removed.map((r) => `"${r}"`).join(', ')}.`,
    before: text,
    after: working,
  };
}

/**
 * Removes a conversational opener, but only when the remainder is a valid
 * imperative. This single rule is what stops "Could you help me with
 * debugging X" from becoming the fragment "debugging X".
 */
export function stripPreamble(text: string): Transform {
  const original = text;
  let working = text;
  const removed: string[] = [];

  for (let pass = 0; pass < 3; pass += 1) {
    let matched = false;
    for (const re of PREAMBLE_FRAMES) {
      const m = working.match(re);
      if (!m || m.index !== 0 || m[0].length === 0) continue;
      const rest = working.slice(m[0].length);
      const firstWord = (stripPlaceholders(rest).match(/^[\p{L}'-]+/u)?.[0] ?? '').toLowerCase();

      // Case 1: the remainder already opens with an imperative verb.
      if (IMPERATIVE_RE.test(rest)) {
        removed.push(m[0].trim());
        working = rest;
        matched = true;
        break;
      }
      // Case 2: the remainder opens with a gerund we can convert safely.
      const imperative = GERUND_TO_IMPERATIVE[firstWord];
      if (imperative) {
        // "help me with refactoring X?" becomes "Refactor X." — the clause is a
        // command now, so its question mark must become a full stop. Leaving the
        // "?" behind is the difference between a rewrite and a corruption.
        const converted = rest.replace(/^[\p{L}'-]+/u, imperative).replace(/^([^.!?]*)\?/, '$1.');
        removed.push(`${m[0].trim()} [${firstWord} → ${imperative.toLowerCase()}]`);
        working = converted;
        matched = true;
        break;
      }
      // Otherwise: refuse. A noun-phrase remainder would become a fragment.
      return noop(
        'strip-preamble',
        `Kept "${m[0].trim()}" because removing it would leave "${rest.slice(0, 40)}…" — not a command.`,
        original,
      );
    }
    if (!matched) break;
  }

  if (removed.length === 0) return noop('strip-preamble', 'No conversational opener detected.', original);

  const check = structurallySound(original, working);
  if (!check.ok) return noop('strip-preamble', `Kept the opener because ${check.why}.`, original);
  if (looksLikeFragment(working)) {
    return noop('strip-preamble', 'Kept the opener because removing it would leave a trailing conjunction.', original);
  }

  return {
    kind: 'strip-preamble',
    applied: true,
    reason: `Converted opener to a direct command: ${removed.map((r) => `"${r}"`).join(', ')}.`,
    before: original,
    after: working,
  };
}

/**
 * Removes sign-offs, but only at the very end of the text. A "thanks" followed
 * by more content is part of the request and is left alone.
 */
export function stripPostamble(text: string): Transform {
  let working = text;
  const removed: string[] = [];
  for (let pass = 0; pass < 3; pass += 1) {
    let hit = false;
    for (const re of POSTAMBLE_TAIL) {
      const m = working.match(re);
      if (m && m[0].length > 0 && (m.index ?? 0) + m[0].length >= working.trimEnd().length) {
        removed.push(m[0].trim());
        working = working.slice(0, m.index ?? 0) + (/^[\s,;]*\./.test(m[0]) ? '.' : '');
        hit = true;
        break;
      }
    }
    if (!hit) break;
  }
  if (removed.length === 0) return noop('strip-postamble', 'No trailing sign-off.', text);

  const check = structurallySound(text, working);
  if (!check.ok) return noop('strip-postamble', `Kept the sign-off because ${check.why}.`, text);
  return {
    kind: 'strip-postamble',
    applied: true,
    reason: `Removed trailing sign-off at the end of the prompt.`,
    before: text,
    after: working,
  };
}

export function stripFiller(text: string): Transform {
  let working = text;
  const hits: string[] = [];
  for (const re of FILLER_PHRASES) {
    const rx = new RegExp(re.source, re.flags);
    const before = working;
    working = working.replace(rx, (match) => {
      hits.push(match.trim());
      return ' ';
    });
    if (before === working) hits.pop();
  }
  if (working === text) return noop('strip-filler', 'No mid-sentence filler phrases found.', text);
  const normalized = normalizeWhitespace(working);
  const check = structurallySound(text, normalized);
  if (!check.ok) return noop('strip-filler', `Kept the filler because ${check.why}.`, text);
  return {
    kind: 'strip-filler',
    applied: true,
    reason: `Removed filler with no request content: ${[...new Set(hits)].map((h) => `"${h}"`).join(', ')}.`,
    before: text,
    after: normalized,
  };
}

/**
 * Removes sentences that are wholly filler.
 *
 * These cannot be handled by clause-level rules: "I was hoping you could help
 * me with something." has no sub-clause that is safe to delete on its own, so a
 * partial edit leaves nonsense behind. Whole-sentence removal is the only edit
 * that is both safe and useful.
 */
export function stripFillerSentences(text: string): Transform {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept: string[] = [];
  const removed: string[] = [];

  for (const sentence of sentences) {
    const bare = sentence.trim().replace(/[.!?]+$/, '').trim();
    const isPureFiller =
      bare.length > 0 &&
      (PURE_FILLER_SENTENCES.some((re) => re.test(bare)));
    if (isPureFiller) {
      removed.push(sentence.trim());
    } else {
      kept.push(sentence);
    }
  }

  // Never let this pass remove the entire prompt: if every sentence looked like
  // filler, one of them is almost certainly the actual request.
  if (removed.length === 0 || kept.length === 0) {
    return noop('strip-filler', 'No whole sentences of pure filler.', text);
  }

  const joined = kept.join(' ').trim();
  const check = structurallySound(text, joined);
  if (!check.ok) return noop('strip-filler', `Kept the filler because ${check.why}.`, text);

  return {
    kind: 'strip-filler',
    applied: true,
    reason: `Removed ${removed.length} sentence(s) of pure filler: ${removed.map((r) => `"${r.slice(0, 40)}"`).join(', ')}.`,
    before: text,
    after: joined,
  };
}

export function tidyWhitespace(text: string): Transform {
  const cleaned = capitalizeFirst(normalizeWhitespace(text));
  if (cleaned === text) return noop('dedupe-whitespace', 'Already tidy.', text);
  const check = structurallySound(text, cleaned);
  if (!check.ok) return noop('dedupe-whitespace', `Left as-is because ${check.why}.`, text);
  return {
    kind: 'dedupe-whitespace',
    applied: true,
    reason: 'Normalised spacing, punctuation and capitalisation.',
    before: text,
    after: cleaned,
  };
}

/** True when the sealed text reads as a direct instruction. */
export function isImperative(text: string): boolean {
  return IMPERATIVE_RE.test(text.trim());
}
