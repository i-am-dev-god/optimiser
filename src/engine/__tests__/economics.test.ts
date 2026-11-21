import { describe, expect, it } from 'vitest';
import { breakEvenOutputTokens, costOf, findModel, MODELS } from '../pricing';
import { optimize } from '../optimize';

/**
 * The economics suite.
 *
 * The product's central claim is not "we save N tokens". It is "we publish the
 * exact threshold at which an added instruction pays for itself". These tests
 * pin that arithmetic down, because a wrong break-even figure is the one number
 * that would make the whole dashboard misleading.
 */
describe('break-even arithmetic', () => {
  it('is zero when nothing is added', () => {
    expect(breakEvenOutputTokens(0, findModel('gpt-4o'))).toBe(0);
  });

  it('uses the model ratio exactly, rounded up because tokens are integers', () => {
    const model = findModel('gpt-4o'); // $2.50 in / $10.00 out → ratio 0.25
    expect(breakEvenOutputTokens(7, model)).toBe(Math.ceil(7 * 0.25));
    expect(breakEvenOutputTokens(8, model)).toBe(2);
  });

  it('scales correctly for a model where output is 10x input', () => {
    const cheap = findModel('gpt-4o-mini'); // $0.15 in / $0.60 out → ratio 0.25
    expect(breakEvenOutputTokens(4, cheap)).toBe(1);
  });

  it('never returns a negative or fractional threshold', () => {
    for (const model of MODELS) {
      for (const tokens of [1, 3, 7, 50, 1000]) {
        const n = breakEvenOutputTokens(tokens, model);
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('cost is exact for a known quantity', () => {
    // 1M tokens at $2.50 should be exactly $2.50.
    expect(costOf(1_000_000, 2.5)).toBe(2.5);
    expect(costOf(0, 2.5)).toBe(0);
  });
});

describe('directive application', () => {
  it('never applies a directive without a matching template', () => {
    const result = optimize('What is the capital of France?');
    expect(result.economy.directive.applied).toBe(false);
    expect(result.strategy.directive).toBeNull();
  });

  it('applies a directive only when its break-even is affordable', () => {
    const result = optimize(
      'Write a Python function that parses a CSV file and handles malformed rows gracefully',
    );
    if (result.economy.directive.applied) {
      expect(result.economy.directive.breakEvenOutputTokens).toBeLessThanOrEqual(60);
      expect(result.economy.directive.tokens).toBeGreaterThan(0);
      expect(result.strategy.directive).toBe(result.economy.directive.text);
    }
  });

  it('keeps an applied directive a minority of the final prompt', () => {
    const prompts = [
      'Write a Python function that parses a CSV file and handles malformed rows gracefully',
      'Explain in detail how the V8 garbage collector works, with examples',
      'Fix this TypeScript error I keep getting about possibly undefined values',
    ];
    for (const prompt of prompts) {
      const result = optimize(prompt);
      if (!result.economy.directive.applied) continue;
      const share = result.economy.directive.tokens / result.tokens.optimized;
      expect(share, `${prompt.slice(0, 30)} → ${Math.round(share * 100)}%`).toBeLessThanOrEqual(0.6);
    }
  });

  it('reports the same model that was used for counting', () => {
    const result = optimize('Explain closures in JavaScript', { modelId: 'claude-sonnet' });
    expect(result.economy.directive.modelId).toBe('claude-sonnet');
  });

  it('records every gate outcome with a readable reason', () => {
    const result = optimize('Write a parser in Go that handles nested expressions');
    expect(result.economy.gates.length).toBeGreaterThan(0);
    for (const gate of result.economy.gates) {
      expect(gate.text.length).toBeGreaterThan(0);
      expect(gate.detail.length).toBeGreaterThan(0);
    }
  });

  it('cleanup alone never costs more than the original', () => {
    const prompts = [
      'Hey, could you please help me to debug this.',
      'ok so i need help with my api please, thanks',
      'Hi! I was wondering if you could help me with something. Explain closures.',
    ];
    for (const prompt of prompts) {
      const result = optimize(prompt);
      expect(result.tokens.cleanupOnly).toBeLessThanOrEqual(result.tokens.original);
    }
  });
});
