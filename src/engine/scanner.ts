import { stripFiller, stripFillerSentences, stripGreetings, stripPostamble, stripPreamble, tidyWhitespace } from './rewrite';
import {
  BLOAT_SIGNALS,
  DEPTH_DEEP_SIGNALS,
  DEPTH_DIRECT_ONLY_SIGNALS,
  INTENT_SIGNALS,
  LEGALISH_SIGNALS,
} from './phrases';
import { stripPlaceholders } from './vault';
import type { BloatRisk, Depth, Diagnostic, Intent, RetryRisk, Signal } from './types';

/**
 * Stage 2: Multi-dimensional diagnostic scanner.
 *
 * Intents are multi-label. Confidence is a *counted* statistic (weighted signal
 * hits, normalised by the strongest intent) so the X-Ray view can show exactly
 * which patterns fired. Nothing here is a black box.
 */

const INTENT_ORDER: readonly Intent[] = [
  'CODE_GEN',
  'DEBUG_FIX',
  'EXPLAIN_LEARN',
  'DATA_TRANSFORM',
  'WRITING_STRATEGY',
  'QUICK_FACT',
];

function matchedSignals(text: string, patterns: readonly RegExp[]): string[] {
  const hits: string[] = [];
  for (const re of patterns) {
    const m = text.match(new RegExp(re.source, re.flags.includes('i') ? re.flags : re.flags + 'i'));
    if (m) hits.push(`/${re.source.slice(0, 48)}/ → "${m[0].slice(0, 40)}"`);
  }
  return hits;
}

function detectIntents(raw: string, prose: string): {
  intents: Intent[];
  scores: Array<{ intent: Intent; signal: Signal }>;
} {
  const scored = INTENT_ORDER.map((intent) => {
    const patterns = INTENT_SIGNALS[intent] ?? [];
    const hits = matchedSignals(raw, patterns);
    // Intent keywords are usually in the prose, but code fences corroborate.
    const proseHits = matchedSignals(prose, patterns);
    const weight = hits.length + proseHits.length * 0.5;
    return {
      intent,
      signal: { value: weight, evidence: [...new Set([...hits, ...proseHits])] },
    };
  });

  const max = Math.max(...scored.map((s) => s.signal.value), 0);
  const scored2 = scored.map((s) => ({
    intent: s.intent,
    signal: {
      value: max === 0 ? 0 : Number((s.signal.value / max).toFixed(3)),
      evidence: s.signal.evidence,
    },
  }));

  // Multi-label: keep every intent with real evidence, always at least one.
  const kept = scored2.filter((s) => s.signal.value >= 0.34).map((s) => s.intent);
  if (kept.length === 0) {
    const fallback: Intent = /^\s*(?:what|who|when|where|which|how\s+many|how\s+much|is|are)\b/i.test(prose)
      ? 'QUICK_FACT'
      : 'EXPLAIN_LEARN';
    return { intents: [fallback], scores: scored2 };
  }
  // A closed lookup is decided by evidence, not by score arithmetic: if the
  // whole prompt is a single closed question, that is the intent, full stop.
  // Previously the generic "what is…" EXPLAIN signal matched the same prompt and
  // then excluded QUICK_FACT, so every lookup was classified as analysis.
  const closedLookup =
    /^\s*(?:what|who|when|where|which)\s+(?:is|are|was|were)\s+(?:the\s+)?[^,?]{1,60}\?\s*$/i.test(
      prose,
    ) ||
    /^\s*(?:how\s+many|how\s+much)\b[^.!?]{0,60}\?\s*$/i.test(prose) ||
    /\b(?:capital\s+of|population\s+of|who\s+wrote|who\s+founded)\b/i.test(prose);
  if (closedLookup && !(INTENT_SIGNALS.CODE_GEN ?? []).some((re) => re.test(prose))) {
    return { intents: ['QUICK_FACT'], scores: scored2 };
  }

  const withoutFact = kept.filter((i) => i !== 'QUICK_FACT');
  return { intents: withoutFact.length > 0 ? withoutFact : kept, scores: scored2 };
}

function detectDepth(prose: string, setting: 'AUTO' | Depth): { depth: Depth; signal: Signal } {
  if (setting !== 'AUTO') {
    return {
      depth: setting,
      signal: { value: 1, evidence: ['Depth set explicitly by the user.'] },
    };
  }
  const direct = matchedSignals(prose, DEPTH_DIRECT_ONLY_SIGNALS);
  if (direct.length > 0) {
    return {
      depth: 'DIRECT_ONLY',
      signal: { value: 1, evidence: direct },
    };
  }
  const deep = matchedSignals(prose, DEPTH_DEEP_SIGNALS);
  if (deep.length > 0) {
    return {
      depth: 'DEEP',
      signal: { value: Math.min(1, 0.5 + deep.length * 0.15), evidence: deep },
    };
  }
  return {
    depth: 'BALANCED',
    signal: { value: 0.5, evidence: ['No depth marker found; defaulted to BALANCED.'] },
  };
}

/**
 * "How much of this prompt is scaffolding?"
 *
 * This is measured, not estimated: the cleanup transforms are run and the word
 * delta is counted. An earlier version re-implemented the detection with its
 * own regex list, which meant the number in the X-Ray could disagree with what
 * the pipeline actually removed — a reported 3% fluff on a prompt that lost 60%
 * of its text. Running the real transforms makes the figure correct by
 * construction, and it adapts automatically whenever the transforms change.
 */
function detectFluff(raw: string): { ratio: number; evidence: string[] } {
  const steps = [
    stripGreetings,
    stripFillerSentences,
    stripPreamble,
    stripPostamble,
    stripFiller,
    tidyWhitespace,
  ];

  let working = raw;
  const evidence: string[] = [];
  for (const step of steps) {
    const result = step(working);
    if (!result.applied) continue;
    working = result.after;
    evidence.push(result.reason);
  }

  const count = (text: string) => stripPlaceholders(text).split(/\s+/).filter(Boolean).length;
  const before = count(raw);
  const after = count(working);
  const ratio = before === 0 ? 0 : Math.min(1, Math.max(0, (before - after) / before));

  return {
    ratio: Number(ratio.toFixed(3)),
    evidence: evidence.length > 0 ? evidence : ['No conversational scaffolding detected.'],
  };
}

/**
 * "Will the target model pad its reply?" This is the question the directive
 * budget depends on, so it must be right.
 *
 * The previous version returned LOW for any prompt without an explicit
 * explain/list keyword, which rated "build me a dashboard" as low-bloat. A build
 * or writing request is the *most* likely to attract preamble, not the least.
 */
function detectBloat(intents: readonly Intent[], depth: Depth, prose: string): BloatRisk {
  if (depth === 'DIRECT_ONLY') return 'LOW';
  if (intents.length === 1 && intents[0] === 'QUICK_FACT') return 'LOW';
  if (intents.includes('DATA_TRANSFORM') && depth !== 'DEEP') return 'LOW';
  if (depth === 'DEEP') return 'HIGH';

  const generative =
    intents.includes('CODE_GEN') ||
    intents.includes('WRITING_STRATEGY') ||
    intents.includes('EXPLAIN_LEARN') ||
    intents.includes('DEBUG_FIX');
  if (!generative) return 'MEDIUM';

  const signals = matchedSignals(prose, BLOAT_SIGNALS).length;
  // A prompt that already dictates its output shape is less at risk, no matter
  // how generative it is.
  const shapeIsConstrained =
    /\b(?:exactly|only|at\s+most|no\s+more\s+than|bullets?|list|table|json|one\s+(?:line|sentence|paragraph))\b/i.test(
      prose,
    );
  if (shapeIsConstrained) return 'MEDIUM';
  return signals >= 1 || intents.length >= 2 ? 'HIGH' : 'MEDIUM';
}

/**
 * Clause boundaries that occur in real prompts: sentence enders, commas before
 * a new requirement, and the coordinating conjunctions people chain
 * requirements with when they do not punctuate.
 */
const CLAUSE_BOUNDARY =
  /(?<=[.!?;])\s+|[,;]\s*|\s+(?:and\s+also|and\s+then|but\s+also|plus|as\s+well\s+as|while\s+also|and\s+(?=it\s+must|do\s+not|don'?t|never|make\s+sure|keep|ensure|only|avoid|no\b))\s*/i;

const CONSTRAINT_CLAUSE_RE =
  /\b(?:don'?t|do\s+not|never|without|avoid|no\s+\w+|must|only|ensure|maintain|keep|at\s+least|at\s+most|exactly|within|make\s+sure|has\s+to|under\s+\d|limit(?:ed)?\s+to)\b/i;

function detectRetryRisk(
  prose: string,
  constraintsInPrompt: number,
  totalWords: number,
): { risk: RetryRisk; evidence: string[] } {
  const evidence: string[] = [];
  const sentences = prose.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  const longest = Math.max(0, ...sentences.map((s) => s.split(/\s+/).length));

  // Clause splitting must handle run-on sentences with no punctuation at all,
  // which is exactly how people write multi-requirement prompts. Splitting only
  // on commas and periods counts that whole prompt as one clause and badly
  // under-rates its retry risk.
  const clauses = prose
    .split(CLAUSE_BOUNDARY)
    .map((c) => c.trim())
    .filter(Boolean);
  const constraintClauseList = clauses.filter((c) => CONSTRAINT_CLAUSE_RE.test(c));
  const constraintWords = constraintClauseList
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  const constraintDensity = totalWords > 0 ? constraintWords / totalWords : 0;
  const longestClause = Math.max(0, ...clauses.map((c) => c.split(/\s+/).length));

  const regulated = LEGALISH_SIGNALS.some((re) => re.test(prose));
  if (
    constraintsInPrompt === 0 &&
    constraintClauseList.length === 0 &&
    longest < 30 &&
    !regulated
  ) {
    return { risk: 'LOW', evidence: ['No hard constraints and no long compound sentences.'] };
  }
  if (longest >= 40) {
    evidence.push(`a single sentence runs ${longest} words, so buried conditions are likely`);
  }
  if (longestClause >= 55) {
    evidence.push(`one unbroken clause runs ${longestClause} words`);
  }
  if (constraintClauseList.length >= 2) {
    evidence.push(`${constraintClauseList.length} constraint clauses sit inline where a model can miss them`);
  }
  if (/\b(?:and\s+also|plus|as\s+well\s+as|while\s+also)\b/i.test(prose)) {
    evidence.push('multiple requirements are chained with conjunctions');
  }
  if (regulated) {
    evidence.push('regulated/legal domain: a wrong answer has a high cost of retry');
  }
  if (constraintDensity >= 0.08) {
    evidence.push(`${Math.round(constraintDensity * 100)}% of the prompt is constraint text, which models tend to under-weight when it is inline`);
  }

  // Severity is a weighted sum, not a count of reasons: one 60-word sentence is
  // a bigger retry driver than two mild signals combined, so counting alone
  // would mis-rank them.
  let severity = 0;
  severity += constraintClauseList.length >= 3 ? 3 : constraintClauseList.length >= 1 ? 2 : 0;
  severity += longest >= 60 ? 3 : longest >= 40 ? 2 : 0;
  severity += longestClause >= 70 ? 2 : longestClause >= 55 ? 1 : 0;
  severity += constraintDensity >= 0.12 ? 2 : constraintDensity >= 0.08 ? 1 : 0;
  severity += /\b(?:and\s+also|plus|as\s+well\s+as|while\s+also)\b/i.test(prose) ? 1 : 0;
  // A regulated domain is never LOW on its own: a wrong answer there has a
  // cost that a normal conversation does not.
  severity += regulated ? 3 : 0;

  if (evidence.length === 0) {
    evidence.push('structure is simple enough to be answered in one pass.');
    return { risk: 'LOW', evidence };
  }
  const risk: RetryRisk = severity >= 5 ? 'HIGH' : severity >= 3 ? 'MEDIUM' : 'LOW';
  return { risk, evidence };
}

export function scan(raw: string, depthSetting: 'AUTO' | Depth = 'AUTO'): Diagnostic {
  const prose = stripPlaceholders(raw).replace(/\s+/g, ' ').trim();
  const { intents, scores } = detectIntents(raw, prose);
  const { depth, signal } = detectDepth(prose, depthSetting);
  const { ratio, evidence: fluffEvidence } = detectFluff(raw);
  const bloatRisk = detectBloat(intents, depth, prose);

  // Count constraint-bearing clauses for retry risk. This is a cheaper,
  // independent pass from `constraints.ts` because it only needs a count.
  const constraintClauses = prose
    .split(/(?<=[.!?;])\s+|,\s*(?:and\s+|but\s+)?/)
    .filter((c) =>
      /\b(?:don'?t|do\s+not|never|without|avoid|no\s+\w+|must|only|ensure|at\s+least|at\s+most|exactly|within)\b/i.test(c),
    ).length;

  const words = prose.split(/\s+/).filter(Boolean).length;
  const { risk, evidence: retryEvidence } = detectRetryRisk(prose, constraintClauses, words);

  return {
    intents,
    intentConfidence: scores,
    depth,
    depthSignal: signal,
    fluffRatio: ratio,
    fluffEvidence,
    bloatRisk,
    retryRisk: risk,
    retryEvidence,
    wordCount: words,
  };
}
