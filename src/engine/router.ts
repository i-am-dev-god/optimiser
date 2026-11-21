import { elevationCost } from './constraints';
import { breakEvenOutputTokens, type ModelPricing } from './pricing';
import { countWith } from './tokenizer';
import type { Constraint, Diagnostic, Intent, Strategy } from './types';

/**
 * Stage 3: adaptive strategy router.
 *
 * The brief's original design was a lookup table keyed on `intent + depth` with
 * magic token thresholds. That is fragile in a specific way: every prompt that
 * does not resemble the table's examples gets the wrong treatment, and the
 * failure is invisible.
 *
 * This router instead builds candidate outputs and scores them against an
 * explicit budget. Every constant is exported and rendered in the UI, so the
 * decision can be audited rather than trusted.
 */

export const DIRECTIVE_POLICY = {
  /**
   * A directive is only worth adding when it needs fewer than this many
   * prevented output tokens to break even. The number is deliberately low:
   * it means we only add directives that are near-certainly profitable.
   */
  maxBreakEvenOutputTokens: 60,
  /** Below this word count, nothing is added at all. */
  minWordsForDirective: 3,
  /**
   * Duplicating constraints is only allowed when the duplicate text is under
   * this share of the cleaned prompt.
   */
  maxElevationShare: 0.25,
  /** Elevation of a *full block* needs this retry risk... */
  elevationMinRetryRisk: 'HIGH' as const,
  /**
   * ...but a single critical constraint can always be surfaced, because one
   * line is cheap and a missed constraint costs the whole retry.
   */
  alwaysSurfaceSingleConstraint: true,
  /** Headers need this many words before structure outweighs its cost. */
  minWordsForHeaders: 60,
  /**
   * A directive may never be more than this share of the final prompt.
   *
   * This is not an aesthetic rule. If the added instruction outweighs the thing
   * it is constraining, the model starts treating the instruction as the task,
   * and the answer drifts. Below this threshold the user's own words remain the
   * dominant content, which is what keeps the output on target.
   */
  maxDirectiveShare: 0.6,
} as const;

export interface RouterInput {
  readonly diagnostic: Diagnostic;
  readonly constraints: readonly Constraint[];
  readonly model: ModelPricing;
  readonly originalTokens: number;
  /** Tokens of the cleaned prompt (already restored, so this is the real cost). */
  readonly cleanedTokens: number;
}

interface DirectiveTemplate {
  readonly matches: (d: Diagnostic) => boolean;
  readonly priority: number;
  /** Full phrasing, used when the prompt is long enough to carry it. */
  readonly text: string;
  /** Terse phrasing of the same instruction, used on short prompts. */
  readonly shortText: string;
  readonly why: string;
}

/**
 * Directives are declared per *combination* of intents, never per single
 * intent. That is what prevents "answer with code only" from being applied to a
 * prompt that also asked a question.
 *
 * Each one is short on purpose: the break-even threshold is what decides
 * whether it is affordable, so a cheaper directive is more often affordable.
 */
const DIRECTIVES: readonly DirectiveTemplate[] = [
  {
    priority: 100,
    matches: (d) => d.intents.includes('DEBUG_FIX') && d.intents.includes('CODE_GEN'),
    text: 'Return the corrected code, then the root cause in bullets. No preamble.',
    shortText: 'Fix it, then the cause. No preamble.',
    why: 'Both a fix and its cause were requested, so a code-only rule would drop half the answer.',
  },
  {
    priority: 95,
    matches: (d) => d.intents.includes('DEBUG_FIX') && !d.intents.includes('CODE_GEN'),
    text: 'Return the fix, then the root cause in bullets. No preamble.',
    shortText: 'Fix it, then the cause. No preamble.',
    why: 'A fix with its cause is what prevents a follow-up "why did that happen?" round trip.',
  },
  {
    priority: 90,
    matches: (d) => d.intents.includes('CODE_GEN') && d.intents.includes('EXPLAIN_LEARN'),
    text: 'Return complete working code, then a brief explanation. No preamble.',
    shortText: 'Code, then a short explanation.',
    why: 'The prompt asks for both code and reasoning; a single-label directive would suppress one of them.',
  },
  {
    priority: 85,
    matches: (d) => d.intents.includes('CODE_GEN') && d.depth === 'DIRECT_ONLY',
    text: 'Return only the code. No explanation.',
    shortText: 'Code only.',
    why: 'The user explicitly asked for code without explanation.',
  },
  {
    priority: 80,
    matches: (d) => d.intents.includes('CODE_GEN'),
    text: 'Return complete, runnable code plus any critical edge cases. No preamble.',
    shortText: 'Code plus key edge cases. No preamble.',
    why: 'Complete code with edge cases removes the most common cause of a second turn.',
  },
  {
    priority: 75,
    matches: (d) => d.intents.includes('DATA_TRANSFORM'),
    text: 'Return only the transformed output. No wrapper text.',
    shortText: 'Output only.',
    why: 'For data conversion, any prose in the reply is pure waste.',
  },
  {
    priority: 70,
    matches: (d) => d.intents.includes('EXPLAIN_LEARN') && d.depth === 'DEEP',
    text: 'Explain densely with concrete examples. No preamble, no recap.',
    shortText: 'Dense explanation with examples.',
    why: 'Deep explanations are where models spend the most output on throat-clearing.',
  },
  {
    priority: 65,
    matches: (d) => d.intents.includes('EXPLAIN_LEARN'),
    text: 'Answer directly. No preamble.',
    shortText: 'Direct answer only.',
    why: 'A direct answer avoids the standard "Great question!" opener.',
  },
  {
    priority: 60,
    matches: (d) => d.intents.includes('WRITING_STRATEGY') && d.depth === 'DEEP',
    text: 'Start with the finished draft. No meta-commentary or filler.',
    shortText: 'Finished draft only.',
    why: 'Draft-then-explain wastes output and buries the deliverable.',
  },
  {
    priority: 55,
    matches: (d) => d.intents.includes('WRITING_STRATEGY'),
    text: 'Return the finished text only. No preamble.',
    shortText: 'Final text only.',
    why: 'The deliverable is the text itself.',
  },
];

function selectDirective(d: Diagnostic): DirectiveTemplate | null {
  let best: DirectiveTemplate | null = null;
  for (const template of DIRECTIVES) {
    if (!template.matches(d)) continue;
    if (!best || template.priority > best.priority) best = template;
  }
  return best;
}

/** A candidate the router considered, and whether it was accepted. */
export interface RouterCandidate {
  readonly id: string;
  readonly label: string;
  readonly tokens: number;
  readonly delta: number;
  readonly accepted: boolean;
  readonly reason: string;
}

export interface RouterDecision {
  readonly strategy: Strategy;
  readonly candidates: readonly RouterCandidate[];
  readonly directiveTokens: number;
  readonly breakEvenOutputTokens: number;
  readonly checks: {
    readonly text: string;
    readonly pass: boolean;
    readonly detail: string;
  }[];
}

function purposeLine(intents: readonly Intent[]): string {
  if (intents.includes('DEBUG_FIX')) return 'Diagnose and fix.';
  if (intents.includes('CODE_GEN')) return 'Provide working code.';
  if (intents.includes('DATA_TRANSFORM')) return 'Transform the data.';
  if (intents.includes('WRITING_STRATEGY')) return 'Produce the requested text.';
  return 'Answer the question.';
}

export function headerBlock(intents: readonly Intent[], constraints: readonly Constraint[]): string {
  const lines = [`Task: ${purposeLine(intents)}`];
  if (constraints.length > 0) {
    lines.push('Constraints:');
    for (const c of constraints) lines.push(`- ${c.text}`);
  }
  return lines.join('\n');
}

export function route(input: RouterInput): RouterDecision {
  const { diagnostic, constraints, model, originalTokens, cleanedTokens } = input;
  const rationale: string[] = [];
  const checks: Array<{ text: string; pass: boolean; detail: string }> = [];
  const candidates: RouterCandidate[] = [];

  const template = selectDirective(diagnostic);

  /**
   * Choose the phrasing that fits the prompt.
   *
   * A 15-token directive on a 6-token prompt makes the instruction the dominant
   * content, which is how prompt additions start changing the answer. The short
   * form says the same thing in half the space, and we fall back to the full
   * form only when the prompt is long enough to carry it.
   */
  const shortTokens = template ? countWith(template.shortText, model.encoder) : 0;
  const shortShare =
    cleanedTokens + shortTokens > 0 ? shortTokens / (cleanedTokens + shortTokens) : 1;
  // The terse form is the *only* candidate: a longer form can never fit a
  // ceiling the shorter one already exceeded, so falling back to it would be a
  // bug that picks the worse option. If the terse form does not fit, the
  // directive is simply not added.
  const fitsBudget = Boolean(template) && shortShare <= DIRECTIVE_POLICY.maxDirectiveShare;
  const directiveText = fitsBudget ? template!.shortText : null;
  const directiveTokens = fitsBudget ? shortTokens : 0;
  const breakEven = fitsBudget ? breakEvenOutputTokens(directiveTokens, model) : 0;

  // ---- Gate 1: is a directive justified? -------------------------------
  let directiveAllowed = false;
  if (!template) {
    checks.push({ text: 'Directive selected', pass: false, detail: 'No directive matches this intent combination.' });
  } else {
    checks.push({
      text: 'Directive selected',
      pass: true,
      detail: `"${directiveText}" — ${template.why}`,
    });
    checks.push({
      text: 'Directive does not dominate the prompt',
      pass: fitsBudget,
      detail: fitsBudget
        ? `"${directiveText}" is ${shortTokens} tokens: ${Math.round(shortShare * 100)}% of the final prompt, within the ${Math.round(DIRECTIVE_POLICY.maxDirectiveShare * 100)}% ceiling that keeps your request the dominant content.`
        : `Even the terse phrasing would be ${Math.round(shortShare * 100)}% of this prompt, which would make the instruction the dominant content. Not added.`,
    });

    if (diagnostic.wordCount < DIRECTIVE_POLICY.minWordsForDirective) {
      checks.push({
        text: 'Prompt long enough to carry a directive',
        pass: false,
        detail: `${diagnostic.wordCount} words is below the ${DIRECTIVE_POLICY.minWordsForDirective}-word floor where a directive is pure overhead.`,
      });
    } else if (diagnostic.bloatRisk === 'LOW') {
      checks.push({
        text: 'Output bloat risk justifies a directive',
        pass: false,
        detail: 'Bloat risk is LOW: this prompt already constrains the shape of the reply.',
      });
    } else if (breakEven > DIRECTIVE_POLICY.maxBreakEvenOutputTokens) {
      checks.push({
        text: 'Directive can pay for itself',
        pass: false,
        detail: `Needs ${breakEven} prevented output tokens to break even, above the ${DIRECTIVE_POLICY.maxBreakEvenOutputTokens}-token policy ceiling.`,
      });
    } else if (!fitsBudget) {
      checks.push({
        text: 'Directive can pay for itself',
        pass: false,
        detail: 'Economically justified but structurally too large for this prompt; see the dominance check below.',
      });
    } else {
      directiveAllowed = true;
      checks.push({
        text: 'Directive can pay for itself',
        pass: true,
        detail: `Costs ${directiveTokens} input tokens; needs only ${breakEven} prevented output tokens to break even (ceiling ${DIRECTIVE_POLICY.maxBreakEvenOutputTokens}).`,
      });
    }
  }

  // ---- Gate 2: should constraints be surfaced? -------------------------
  const surfacable = constraints.filter((c) => c.text.length <= 200);
  const fullBlockChars = elevationCost(surfacable);
  const fullBlockTokens = Math.ceil(fullBlockChars / 4);

  let elevateMode: 'none' | 'single' | 'block' = 'none';
  if (surfacable.length === 0) {
    checks.push({ text: 'Constraints surfaced', pass: false, detail: 'No constraint clauses found.' });
  } else {
    const blockShare = cleanedTokens > 0 ? fullBlockTokens / cleanedTokens : 1;
    if (diagnostic.retryRisk === 'HIGH' && blockShare <= DIRECTIVE_POLICY.maxElevationShare) {
      elevateMode = 'block';
      checks.push({
        text: 'Constraints surfaced',
        pass: true,
        detail: `Retry risk is HIGH and a constraints block adds ${Math.round(blockShare * 100)}% of prompt length, within the ${Math.round(DIRECTIVE_POLICY.maxElevationShare * 100)}% ceiling. One avoided retry costs the whole prompt.`,
      });
    } else if (DIRECTIVE_POLICY.alwaysSurfaceSingleConstraint && surfacable.length === 1) {
      elevateMode = 'single';
      checks.push({
        text: 'Constraints surfaced',
        pass: true,
        detail: 'One constraint clause found; surfacing a single line is cheap enough to always be worth it.',
      });
    } else {
      checks.push({
        text: 'Constraints surfaced',
        pass: false,
        detail:
          diagnostic.retryRisk === 'HIGH'
            ? `A full constraints block would add ${Math.round(blockShare * 100)}%, above the ${Math.round(DIRECTIVE_POLICY.maxElevationShare * 100)}% ceiling, so the clauses are left in place where they already read correctly.`
            : `Retry risk is ${diagnostic.retryRisk}; the constraints are already where a model will read them.`,
      });
    }
  }

  const surfaced = elevateMode === 'block' ? surfacable : elevateMode === 'single' ? surfacable.slice(0, 1) : [];
  const surfacedTokens = Math.ceil(elevationCost(surfaced) / 4);

  // ---- Gate 3: headers -------------------------------------------------
  const headersAllowed =
    elevateMode === 'block' &&
    diagnostic.wordCount >= DIRECTIVE_POLICY.minWordsForHeaders;
  checks.push({
    text: 'Structural headers',
    pass: headersAllowed,
    detail: headersAllowed
      ? `${diagnostic.wordCount} words with HIGH retry risk: structure is worth its cost.`
      : `${diagnostic.wordCount} words is below the ${DIRECTIVE_POLICY.minWordsForHeaders}-word point where headers buy more than they cost.`,
  });

  // ---- Assemble the decision -------------------------------------------
  const additions = (directiveAllowed ? directiveTokens : 0) + surfacedTokens;
  const projectedTokens = cleanedTokens + additions;
  // Reported for the X-Ray view; not used for a decision here.
  void (projectedTokens - originalTokens);

  if (additions > 0) {
    rationale.push(
      `Adds ${directiveAllowed ? directiveTokens : 0} directive token(s) and ${surfacedTokens} constraint token(s) to a prompt cleaned down to ${cleanedTokens} tokens (${originalTokens} originally).`,
    );
  }
  if (directiveAllowed && template) {
    rationale.push(`Break-even: the directive must prevent ${breakEven} output tokens to pay for itself.`);
  }

  const variantSpecs: Array<{ id: string; label: string; directive: boolean; surfaced: boolean; headers: boolean }> = [
    { id: 'minimal', label: 'Minimal cleanup', directive: false, surfaced: false, headers: false },
  ];
  if (directiveAllowed) variantSpecs.push({ id: 'directive', label: 'Cleanup + directive', directive: true, surfaced: false, headers: false });
  if (surfacedTokens > 0) variantSpecs.push({ id: 'surfaced', label: 'Cleanup + constraint block', directive: false, surfaced: true, headers: false });
  if (directiveAllowed && surfacedTokens > 0) variantSpecs.push({ id: 'full', label: 'Cleanup + directive + constraints', directive: true, surfaced: true, headers: false });
  if (headersAllowed) variantSpecs.push({ id: 'headers', label: 'Full structured rewrite', directive: directiveAllowed, surfaced: true, headers: true });

  for (const spec of variantSpecs) {
    const tokens =
      cleanedTokens +
      (spec.directive ? directiveTokens : 0) +
      (spec.surfaced ? surfacedTokens : 0) +
      (spec.headers ? Math.ceil(headerBlock(diagnostic.intents, surfaced).length / 4) : 0);
    const delta = tokens - originalTokens;
    candidates.push({
      id: spec.id,
      label: spec.label,
      tokens,
      delta,
      accepted: true,
      reason: spec.headers
        ? 'Structured for a high-retry-risk prompt.'
        : delta <= 0
          ? `Shrinks the prompt by ${-delta} tokens.`
          : `Grows the prompt by ${delta} tokens, offset by ${directiveAllowed ? `a directive that needs only ${breakEven} prevented output tokens` : 'nothing'}.`,
    });
  }

  const chosenId = headersAllowed
    ? 'headers'
    : directiveAllowed && surfacedTokens > 0
      ? 'full'
      : directiveAllowed
        ? 'directive'
        : surfacedTokens > 0
          ? 'surfaced'
          : 'minimal';

  const strategy: Strategy = {
    id: chosenId,
    name: candidates.find((c) => c.id === chosenId)?.label ?? 'Minimal cleanup',
    rationale,
    structuralHeaders: headersAllowed,
    directive: directiveAllowed ? directiveText : null,
    surfacedConstraints: surfaced,
    constraintMode: elevateMode,
  };

  return { strategy, candidates, directiveTokens, breakEvenOutputTokens: breakEven, checks };
}

export { selectDirective };
