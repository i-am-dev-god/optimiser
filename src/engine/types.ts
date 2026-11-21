/**
 * Shared types for the optimization pipeline.
 *
 * Design invariant: every value that a user sees is either
 *  - EXACT (derivable from the input with no modelling assumption), or
 *  - LABELLED with the assumption that produced it.
 *
 * There is no third category. The single source of truth for accuracy classes
 * is `tokenizer.ts` (`'exact' | 'proxy'`); nothing else may invent one.
 */

export type Intent =
  | 'CODE_GEN'
  | 'DEBUG_FIX'
  | 'EXPLAIN_LEARN'
  | 'DATA_TRANSFORM'
  | 'WRITING_STRATEGY'
  | 'QUICK_FACT';

export type Depth = 'DEEP' | 'BALANCED' | 'DIRECT_ONLY';

/** User-facing depth control. `AUTO` defers to the scanner. */
export type DepthSetting = 'AUTO' | Depth;

export type BloatRisk = 'HIGH' | 'MEDIUM' | 'LOW';
export type RetryRisk = 'HIGH' | 'MEDIUM' | 'LOW';

/** How confident we are in a detection, with the evidence that produced it. */
export interface Signal {
  readonly value: number;
  /** Human-readable reasons, shown in the Diagnostic X-Ray. */
  readonly evidence: readonly string[];
}

export interface VaultEntry {
  readonly id: number;
  readonly placeholder: string;
  readonly original: string;
  readonly kind:
    | 'fenced-code'
    | 'inline-code'
    | 'url'
    | 'path'
    | 'json'
    | 'quoted'
    | 'number'
    | 'identifier'
    | 'xml-like';
}

export interface Constraint {
  /** Clause text, exactly as it appeared, minus surrounding whitespace. */
  readonly text: string;
  readonly kind: 'negative' | 'requirement';
}

export interface Diagnostic {
  readonly intents: readonly Intent[];
  readonly intentConfidence: ReadonlyArray<{ intent: Intent; signal: Signal }>;
  readonly depth: Depth;
  readonly depthSignal: Signal;
  readonly fluffRatio: number;
  readonly fluffEvidence: readonly string[];
  readonly bloatRisk: BloatRisk;
  readonly retryRisk: RetryRisk;
  readonly retryEvidence: readonly string[];
  /** Words in the user's prompt, excluding vaulted spans. */
  readonly wordCount: number;
}

export interface Strategy {
  readonly id: string;
  readonly name: string;
  /** Why this strategy was chosen. Surfaced in the UI. */
  readonly rationale: readonly string[];
  readonly structuralHeaders: boolean;
  readonly directive: string | null;
  /**
   * Constraints copied (never moved) into a visible block. The originals stay
   * in place so the restored prompt remains grammatical.
   */
  readonly surfacedConstraints: readonly Constraint[];
  /** How much constraint surfacing the router allowed, and why. */
  readonly constraintMode: 'none' | 'single' | 'block';
}

/**
 * A single reversible text edit. The pipeline applies these
 * transactionally and rolls back any edit that breaks an invariant.
 */
export interface Transform {
  readonly kind:
    | 'strip-preamble'
    | 'strip-postamble'
    | 'strip-filler'
    | 'normalize-opener'
    | 'dedupe-whitespace'
    | 'append-directive'
    | 'elevate-constraints'
    | 'add-headers'
    | 'none';
  readonly applied: boolean;
  /** Why it was applied or skipped. Surfaced in the X-Ray view. */
  readonly reason: string;
  readonly before: string;
  readonly after: string;
}

export type VerificationStatus = 'pass' | 'warn' | 'fail';

export interface VerificationCheck {
  readonly id: string;
  readonly label: string;
  readonly status: VerificationStatus;
  readonly detail: string;
}

export interface VerificationReport {
  readonly checks: readonly VerificationCheck[];
  readonly ok: boolean;
}

export interface OptimizationResult {
  readonly original: string;
  readonly optimized: string;
  readonly diagnostic: Diagnostic;
  readonly strategy: Strategy;
  readonly transforms: readonly Transform[];
  readonly vault: readonly VaultEntry[];
  readonly verification: VerificationReport;
  readonly tokens: {
    readonly original: number;
    readonly optimized: number;
    /** Cost of the prompt with cleanup only, before any directive is added. */
    readonly cleanupOnly: number;
  };
  /**
   * The economics behind the decision, rendered in the UI. Everything here is
   * either measured exactly or derived by stated arithmetic.
   */
  readonly economy: {
    readonly directive: {
      readonly text: string | null;
      readonly tokens: number;
      /**
       * Output tokens this directive must prevent in order to pay for itself.
       * This is the honest figure: we cannot observe the reply, so we publish
       * the threshold instead of inventing a saving.
       */
      readonly breakEvenOutputTokens: number;
      readonly applied: boolean;
      readonly modelId: string;
    };
    readonly candidates: ReadonlyArray<{
      readonly id: string;
      readonly label: string;
      readonly tokens: number;
      readonly delta: number;
      readonly accepted: boolean;
      readonly reason: string;
    }>;
    readonly gates: ReadonlyArray<{
      readonly text: string;
      readonly pass: boolean;
      readonly detail: string;
    }>;
  };
  /** True when no edit was worth making. */
  readonly alreadyOptimal: boolean;
  /** Aggregate timing for the X-Ray card. */
  readonly elapsedMs: number;
}
