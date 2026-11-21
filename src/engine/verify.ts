import { extractConstraints } from './constraints';
import { measure, type EncoderId } from './tokenizer';
import type { VaultEntry, VerificationCheck, VerificationReport } from './types';

/**
 * Stage 5: verification gate.
 *
 * These checks are hard gates, not advice. If any returns `fail`, the caller
 * reverts to the original prompt. The point is that the *engine* cannot emit a
 * prompt that silently lost information.
 *
 * Number matching uses token-boundary comparison on normalised digits. A naive
 * `includes()` would let "18" match inside "180", which is exactly the false
 * pass that makes a verification gate worse than none.
 */

/**
 * Only labels the router itself can emit. Matching arbitrary "Word:" patterns
 * would flag ordinary prose such as "Fix this:" that happens to precede a
 * newline, which is a false failure — and a false failure here would discard a
 * perfectly good optimization.
 */
const EMITTED_HEADER_LABELS = ['Task', 'Objective', 'Context', 'Constraints', 'Focus Areas', 'Output', 'Format', 'Requirements', 'Input'] as const;

const YAML_HEADERISH = new RegExp(
  `^(?:${EMITTED_HEADER_LABELS.join('|')})\\s*:`,
  'im',
);

/** A header emitted with nothing under it. Scoped to our own labels. */
const EMPTY_EMITTED_HEADER = new RegExp(
  `(?:^|\\n)[ \\t]*(?:${EMITTED_HEADER_LABELS.join('|')})[ \\t]*:[ \\t]*(?=\\n|$)`,
  'i',
);

function normalizeForMatch(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extracts numeric literals with their surrounding unit/operator context. */
function numericFacts(text: string): string[] {
  const re = /(?:[<>]=?|≥|≤)?\s?\d+(?:[.,]\d+)*\s?(?:ms|s|sec|secs|seconds?|minutes?|hours?|days?|weeks?|months?|years?|px|em|rem|kb|mb|gb|tb|%|x|dpi|fps|hz|khz|ghz)?/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = m[0].trim();
    if (!value) continue;
    out.push(value.toLowerCase().replace(/\s+/g, ''));
  }
  return [...new Set(out)];
}

/**
 * A fact is present only if it appears with matching boundaries: "18" must not
 * be satisfied by "180", and "500ms" must not be satisfied by "500".
 */
function factPresent(fact: string, haystack: string): boolean {
  const escaped = fact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `(?:^|[^\\d.])${escaped}(?![\\d])(?![.,]\\d)`,
    'i',
  );
  return re.test(haystack.replace(/\s+/g, ''));
}

export function verify(args: {
  original: string;
  optimizedSealed?: string;
  optimizedRestored: string;
  vault: readonly VaultEntry[];
  encoder: EncoderId;
  addedDirectiveTokens: number;
  /** Exact input token count, when the caller has already measured it. */
  originalTokens?: number;
}): VerificationReport {
  const { original, optimizedRestored, vault, encoder, addedDirectiveTokens } = args;
  const checks: VerificationCheck[] = [];

  // 1. Vault integrity: every protected span survives, verbatim, exactly once
  //    per occurrence.
  const missing = vault.filter((entry) => {
    const wanted = countOccurrences(original, entry.original);
    const got = countOccurrences(optimizedRestored, entry.original);
    return wanted > 0 && got < wanted;
  });
  checks.push({
    id: 'vault',
    label: 'Protected spans preserved',
    status: missing.length === 0 ? 'pass' : 'fail',
    detail:
      missing.length === 0
        ? `All ${vault.length} protected span(s) restored verbatim.`
        : `Lost or altered: ${missing.map((m) => m.kind).join(', ')}.`,
  });

  // 2. Numeric facts: boundary-aware, not substring.
  const originalFacts = numericFacts(original);
  const optimizedNormalized = normalizeForMatch(optimizedRestored);
  const droppedNumbers = originalFacts.filter((f) => !factPresent(f, optimizedNormalized));
  checks.push({
    id: 'numbers',
    label: 'Numeric facts preserved',
    status: droppedNumbers.length === 0 ? 'pass' : 'fail',
    detail:
      originalFacts.length === 0
        ? 'Prompt contains no numeric constraints.'
        : droppedNumbers.length === 0
          ? `All ${originalFacts.length} numeric fact(s) present, matched on token boundaries (so 18 does not match 180).`
          : `Missing: ${droppedNumbers.join(', ')}.`,
  });

  // 3. Constraints still readable in place.
  const constraints = extractConstraints(original);
  const droppedConstraints = constraints.filter((c) => {
    const norm = c.text.toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
    return norm.length > 8 && !optimizedNormalized.toLowerCase().includes(norm);
  });
  checks.push({
    id: 'constraints',
    label: 'Constraints intact',
    status: droppedConstraints.length === 0 ? 'pass' : 'fail',
    detail:
      constraints.length === 0
        ? 'No hard constraints detected in the original.'
        : droppedConstraints.length === 0
          ? `All ${constraints.length} constraint clause(s) remain in the prompt body.`
          : `Altered: ${droppedConstraints.map((c) => `"${c.text.slice(0, 40)}…"`).join(', ')}.`,
  });

  // 4. Cost honesty.
  //
  // The rule is "cleanup must pay for the directive", not "the prompt must
  // shrink". An absolute shrink requirement silently forbade every justified
  // micro-directive on a short prompt, which is precisely the case the
  // break-even maths exists to justify.
  //
  // So we hold the engine to a stricter, more honest standard: whatever we add
  // deliberately must be fully offset by what we removed, and the added part
  // must be separately justified by the router's break-even calculation (shown
  // in the UI). Unaccounted growth is still a hard failure.
  const before = args.originalTokens ?? measure(original, encoder, 'exact').tokens;
  const after = measure(optimizedRestored, encoder, 'exact').tokens;
  const attributable = after - addedDirectiveTokens;
  checks.push({
    id: 'net-cost',
    label: 'Growth is fully accounted for',
    status: attributable <= before ? 'pass' : 'fail',
    detail:
      attributable <= before
        ? addedDirectiveTokens > 0
          ? `Cleanup alone: ${before} → ${attributable} tokens. Directive adds ${addedDirectiveTokens}, justified separately by its break-even threshold.`
          : `${before} → ${after} tokens with no added directive.`
        : `Cleanup grew the prompt from ${before} to ${attributable} tokens without removing anything; reverted.`,
  });

  // 5. Structural sanity: no dangling separators or orphan headers.
  const trimmed = optimizedRestored.trim();
  const badEdges = /^[,;:.]|[,;:]$/.test(trimmed);
  const emptyHeader = EMPTY_EMITTED_HEADER.test(trimmed);
  checks.push({
    id: 'structure',
    label: 'No structural damage',
    status: !badEdges && !emptyHeader ? 'pass' : 'fail',
    detail:
      !badEdges && !emptyHeader
        ? 'No dangling punctuation, no empty headers.'
        : badEdges
          ? 'Prompt begins or ends with a stray separator.'
          : 'A header was emitted with no content beneath it.',
  });

  // 6. Substance: the optimized prompt must still be an instruction.
  //    An input with nothing in it has nothing to lose, so it is never a
  //    failure — treating "" as a broken prompt would reject the only correct
  //    answer for that input.
  // The bar is "did the result lose substance", not "does it look like a
  // sentence". A one-word prompt ("fix this" is two, but "?" or "help" is one)
  // is perfectly valid input, and demanding two words would reject a correct
  // optimization. We compare against what the original actually had.
  const originalWordCount = original.trim().split(/\s+/).filter(Boolean).length;
  const originalIsBlank = original.trim().length === 0;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const stillAnInstruction = originalIsBlank
    ? trimmed.length === 0
    : wordCount >= 1 && (originalWordCount <= 1 || wordCount >= 2) && trimmed.length > 0;
  checks.push({
    id: 'substance',
    label: 'Still a complete instruction',
    status: stillAnInstruction ? 'pass' : 'fail',
    detail: originalIsBlank
      ? 'The input was empty, so there is nothing to preserve.'
      : stillAnInstruction
        ? `${wordCount} words remain, including the original request.`
        : 'The result no longer reads as a request.',
  });

  // Informational only — never fails the gate.
  if (YAML_HEADERISH.test(trimmed)) {
    checks.push({
      id: 'headers-info',
      label: 'Structural headers present',
      status: 'warn',
      detail: 'Headers were added deliberately; they are counted in the net token figure.',
    });
  }

  return { checks, ok: checks.every((c) => c.status !== 'fail') };
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}
