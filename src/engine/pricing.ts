/**
 * Model pricing and break-even arithmetic.
 *
 * Why break-even instead of "estimated tokens saved":
 *
 * We cannot observe the target model's reply, so any claimed output saving is
 * fabricated. What we *can* compute exactly is how many output tokens a
 * directive must prevent in order to pay for itself:
 *
 *     savedOutput × outputPrice  ≥  addedInput × inputPrice
 *     savedOutput                ≥  ceil(addedInput × inputPrice / outputPrice)
 *
 * That threshold is a hard number, it is different for every model, and the
 * user can judge it against how chatty their model actually is. It is
 * falsifiable; a predicted saving is not.
 *
 * Prices are data, not code. They are dated, shown in the UI, and editable,
 * because a hardcoded price silently rots into a lie.
 */

export interface ModelPricing {
  readonly id: string;
  readonly label: string;
  readonly vendor: string;
  /** USD per 1M input tokens. */
  readonly inputPerMillion: number;
  /** USD per 1M output tokens. */
  readonly outputPerMillion: number;
  readonly encoder: 'o200k_base' | 'cl100k_base';
  /** Whether the encoder above is genuinely this model's tokenizer. */
  readonly encoderAccuracy: 'exact' | 'proxy';
}

/** Prices as of 2025-11. Edit these when your provider changes them. */
export const PRICING_AS_OF = '2025-11-01';

export const MODELS: readonly ModelPricing[] = [
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    vendor: 'OpenAI',
    inputPerMillion: 2.5,
    outputPerMillion: 10,
    encoder: 'o200k_base',
    encoderAccuracy: 'exact',
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o mini',
    vendor: 'OpenAI',
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    encoder: 'o200k_base',
    encoderAccuracy: 'exact',
  },
  {
    id: 'claude-sonnet',
    label: 'Claude Sonnet',
    vendor: 'Anthropic',
    inputPerMillion: 3,
    outputPerMillion: 15,
    encoder: 'cl100k_base',
    encoderAccuracy: 'proxy',
  },
  {
    id: 'gemini-pro',
    label: 'Gemini Pro',
    vendor: 'Google',
    inputPerMillion: 1.25,
    outputPerMillion: 10,
    encoder: 'cl100k_base',
    encoderAccuracy: 'proxy',
  },
];

export const DEFAULT_MODEL_ID = 'gpt-4o';

export function findModel(id: string): ModelPricing {
  const found = MODELS.find((m) => m.id === id);
  return found ?? (MODELS[0] as ModelPricing);
}

/**
 * Minimum number of output tokens that must be prevented for an added input
 * cost to be worth paying. Rounded up, because a fractional token is not a
 * thing.
 */
export function breakEvenOutputTokens(addedInputTokens: number, model: ModelPricing): number {
  if (addedInputTokens <= 0) return 0;
  return Math.ceil((addedInputTokens * model.inputPerMillion) / model.outputPerMillion);
}

/** Exact USD cost of a token count, to full float precision. */
export function costOf(tokens: number, perMillion: number): number {
  return (tokens / 1_000_000) * perMillion;
}

export function formatUsd(value: number): string {
  if (value === 0) return '$0';
  if (value < 0.000001) return `$${value.toExponential(2)}`;
  if (value < 0.01) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(4)}`;
}
