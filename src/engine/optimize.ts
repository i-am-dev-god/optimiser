import { extractConstraints } from './constraints';
import { DEFAULT_MODEL_ID, findModel, type ModelPricing } from './pricing';
import { headerBlock, route, type RouterDecision } from './router';
import { scan } from './scanner';
import { countWith, measure } from './tokenizer';
import {
  normalizeTypography,
  stripFiller,
  stripFillerSentences,
  stripGreetings,
  stripPostamble,
  stripPreamble,
  tidyWhitespace,
} from './rewrite';
import type { DepthSetting, OptimizationResult, Transform } from './types';
import { restore, seal } from './vault';
import { verify } from './verify';

export interface OptimizeOptions {
  readonly depth?: DepthSetting;
  readonly modelId?: string;
  readonly model?: ModelPricing;
}

/**
 * The transactional pipeline.
 *
 *   1. normalise — unify typography so patterns only match one apostrophe form
 *   2. seal      — protect fragile spans behind placeholders
 *   3. scan      — diagnose on the sealed text
 *   4. clean     — apply reversible, self-validating edits
 *   5. route     — decide what, if anything, to add
 *   6. verify    — hard gate; on failure, degrade one rung and retry
 *
 * Step 6 discards candidates that fail the implemented checks. These checks are
 * heuristic and cannot guarantee preservation of meaning; users must review edits.
 */
export function optimize(prompt: string, options: OptimizeOptions = {}): OptimizationResult {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const model = options.model ?? findModel(options.modelId ?? DEFAULT_MODEL_ID);
  const depthSetting: DepthSetting = options.depth ?? 'AUTO';

  // The original is kept verbatim: it is what the diff view shows and what all
  // verification comparisons run against.
  const originalSealed = seal(prompt);
  const originalTokens = measure(prompt, model.encoder, model.encoderAccuracy).tokens;

  // Typography is normalised for the *processing* path only.
  const normalized = seal(normalizeTypography(prompt));

  // --- Stage 2 ---------------------------------------------------------
  const initialDiagnostic = scan(normalized.text, depthSetting);

  // --- Stage 3 ---------------------------------------------------------
  const transforms: Transform[] = [];
  let working = normalized.text;

  // Token-monotonicity guard.
  //
  // A cleanup step may never increase the token count. This is not pedantry:
  // purely cosmetic edits genuinely can cost tokens (capitalising a lone "i" to
  // "I" breaks the BPE merge on " i have", adding a token), and a "cleanup" that
  // grows the prompt is indefensible whatever it looks like.
  //
  // The check is exact — it uses the same encoder as the final count — so there
  // is no threshold to tune and no outlier it can miss.
  let workingTokens = measure(restore(working, normalized.entries), model.encoder, 'exact').tokens;

  const steps = [
    stripGreetings,
    stripFillerSentences,
    stripPreamble,
    stripPostamble,
    stripFiller,
    tidyWhitespace,
  ];
  for (const step of steps) {
    const result = step(working);
    if (!result.applied) {
      transforms.push(result);
      continue;
    }
    const candidateTokens = measure(restore(result.after, normalized.entries), model.encoder, 'exact').tokens;
    if (candidateTokens > workingTokens) {
      transforms.push({
        ...result,
        applied: false,
        reason: `Reverted: saved nothing and cost ${candidateTokens - workingTokens} extra token(s) under ${model.encoder}.`,
        after: result.before,
      });
      continue;
    }
    workingTokens = candidateTokens;
    transforms.push(result);
    working = result.after;
  }
  const cleanedSealed = working;
  // Report the actual accepted cleanup, not a separate prediction of it.
  const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
  const beforeWords = wordCount(restore(normalized.text, normalized.entries));
  const afterWords = wordCount(restore(cleanedSealed, normalized.entries));
  const diagnostic = { ...initialDiagnostic,
    fluffRatio: beforeWords ? Math.max(0, (beforeWords - afterWords) / beforeWords) : 0,
    fluffEvidence: transforms.filter(t => t.applied).map(t => t.reason),
  };

  // Restore against the *normalised* vault so token counts are real.
  const cleanedRestored = restore(cleanedSealed, normalized.entries);
  const cleanedTokens = measure(cleanedRestored, model.encoder, 'exact').tokens;

  // --- Stage 4 ---------------------------------------------------------
  const constraints = extractConstraints(cleanedRestored);
  const decision: RouterDecision = route({
    diagnostic,
    constraints,
    model,
    originalTokens,
    cleanedTokens,
  });

  // --- Stage 5: assemble + gate ----------------------------------------
  const assemble = (opts: { headers: boolean; directive: boolean; surfaced: boolean }): string => {
    const body = cleanedRestored.trim();
    const parts: string[] = [];
    if (opts.headers) {
      // A header block replaces the leading task sentence with a labelled one;
      // the body is kept so no content is ever removed by structuring.
      parts.push(headerBlock(diagnostic.intents, decision.strategy.surfacedConstraints));
    } else if (opts.surfaced && decision.strategy.surfacedConstraints.length > 0) {
      parts.push(
        ['Constraints:', ...decision.strategy.surfacedConstraints.map((c) => `- ${c.text}`)].join('\n'),
      );
    }
    parts.push(body);
    if (opts.directive && decision.strategy.directive) parts.push(decision.strategy.directive);
    return parts.filter(Boolean).join('\n\n');
  };

  const attempts = [
    {
      label: 'full strategy',
      headers: decision.strategy.structuralHeaders,
      directive: Boolean(decision.strategy.directive),
      surfaced: decision.strategy.constraintMode !== 'none',
    },
    { label: 'without headers', headers: false, directive: Boolean(decision.strategy.directive), surfaced: decision.strategy.constraintMode !== 'none' },
    { label: 'directive only', headers: false, directive: Boolean(decision.strategy.directive), surfaced: false },
    { label: 'cleaned only', headers: false, directive: false, surfaced: false },
    { label: 'unchanged', headers: false, directive: false, surfaced: false },
  ].map((a) => ({ ...a, text: a.label === 'unchanged' ? prompt : assemble(a) }));

  const directiveTokens = decision.strategy.directive
    ? countWith(decision.strategy.directive, model.encoder)
    : 0;

  let chosen = attempts[attempts.length - 1]!;
  let report = verify({
    original: prompt,
    optimizedRestored: chosen.text,
    vault: originalSealed.entries,
    encoder: model.encoder,
    addedDirectiveTokens: 0,
    originalTokens,
  });

  for (const attempt of attempts) {
    const attemptReport = verify({
      original: prompt,
      optimizedRestored: attempt.text,
      vault: originalSealed.entries,
      encoder: model.encoder,
      addedDirectiveTokens: attempt.directive ? directiveTokens : 0,
      originalTokens,
    });
    if (attemptReport.ok) {
      chosen = attempt;
      report = attemptReport;
      break;
    }
    report = attemptReport;
  }

  const optimized = chosen.text;
  const optimizedTokens = measure(optimized, model.encoder, 'exact').tokens;
  const alreadyOptimal = optimized.trim() === prompt.trim();

  return {
    original: prompt,
    optimized,
    diagnostic,
    strategy: {
      ...decision.strategy,
      structuralHeaders: chosen.headers,
      directive: chosen.directive ? decision.strategy.directive : null,
      surfacedConstraints: chosen.surfaced ? decision.strategy.surfacedConstraints : [],
      constraintMode: chosen.surfaced ? decision.strategy.constraintMode : 'none',
    },
    transforms,
    vault: originalSealed.entries,
    verification: report,
    tokens: {
      original: originalTokens,
      optimized: optimizedTokens,
      cleanupOnly: cleanedTokens,
    },
    economy: {
      directive: {
        text: decision.strategy.directive,
        tokens: directiveTokens,
        breakEvenOutputTokens: decision.breakEvenOutputTokens,
        applied: chosen.directive,
        modelId: model.id,
      },
      candidates: decision.candidates,
      gates: decision.checks,
    },
    alreadyOptimal,
    elapsedMs: Math.round((now() - startedAt) * 100) / 100,
  };
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export { route, headerBlock };
export type { RouterDecision };
