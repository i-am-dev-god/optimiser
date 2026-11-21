import { countTokens as countO200k } from 'gpt-tokenizer/encoding/o200k_base';
import { countTokens as countCl100k } from 'gpt-tokenizer/encoding/cl100k_base';

/**
 * Token measurement.
 *
 * We only ever report a count produced by a *named* BPE encoder. There is no
 * "about 4 characters per token" path anywhere in this codebase.
 *
 * `exact` means the encoder is the one the provider publishes for that model.
 * `proxy` means we are counting with a different encoder and state the proxy
 * explicitly, because a silently-wrong token count is worse than an obvious
 * approximation.
 */

export type EncoderId = 'o200k_base' | 'cl100k_base';

export interface TokenCount {
  readonly tokens: number;
  readonly encoder: EncoderId;
  readonly accuracy: 'exact' | 'proxy';
}

const ENCODERS: Record<EncoderId, (text: string) => number> = {
  o200k_base: countO200k,
  cl100k_base: countCl100k,
};

/** Cheap guard so a pathological paste cannot freeze the tab. */
const MAX_COUNT_LENGTH = 200_000;

export function countWith(text: string, encoder: EncoderId): number {
  if (!text) return 0;
  if (text.length > MAX_COUNT_LENGTH) throw new Error('Prompt exceeds the tokenizer limit of 200,000 characters.');
  return ENCODERS[encoder](text);
}

export function measure(
  text: string,
  encoder: EncoderId,
  accuracy: 'exact' | 'proxy',
): TokenCount {
  return { tokens: countWith(text, encoder), encoder, accuracy };
}
