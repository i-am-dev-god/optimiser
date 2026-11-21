import { describe, expect, it } from 'vitest';
import { stripFiller, stripGreetings, stripPreamble, stripPostamble, isImperative } from '../rewrite';

/**
 * Trap 4 from the brief: naive fluff removal turns prompts into fragments.
 * These tests assert the *rejection* behaviour as heavily as the removal
 * behaviour, because refusing to edit is a feature.
 */
describe('preamble stripping', () => {
  it('converts an infinitive opener to an imperative', () => {
    const result = stripPreamble('Could you please help me to fix this bug');
    expect(result.applied).toBe(true);
    expect(result.after).toBe('fix this bug');
  });

  it('converts a gerund opener using the curated map, not suffix slicing', () => {
    const result = stripPreamble('Can you help me with debugging this API');
    expect(result.applied).toBe(true);
    expect(result.after).toBe('Debug this API');
  });

  it('refuses when the remainder would not be a command', () => {
    const result = stripPreamble('I am trying the new build');
    expect(result.applied).toBe(false);
    expect(result.after).toBe('I am trying the new build');
  });

  it('never mangles a word ending in -ing', () => {
    // Words already on the dictionary are converted deliberately; anything else
    // must be left completely untouched. Naive suffix slicing would turn
    // "string" into "str" and "ceiling" into "ceil".
    for (const word of ['string', 'bring', 'spring', 'ceiling', 'ping', 'king']) {
      const result = stripPreamble(`Can you help me with ${word}`);
      // Refusal leaves the sentence intact; that is the pass condition.
      expect(result.applied).toBe(false);
      expect(result.after).toBe(`Can you help me with ${word}`);
    }
  });

  it('converts only dictionary gerunds, and converts them correctly', () => {
    const cases: Array<[string, string]> = [
      ['Can you help me with debugging this API', 'Debug this API'],
      ['Could you help me with writing tests', 'Write tests'],
      ['Can you help me with fixing this crash', 'Fix this crash'],
    ];
    for (const [input, expected] of cases) {
      expect(stripPreamble(input).after).toBe(expected);
    }
  });

  it('does not treat a mid-sentence politeness as an opener', () => {
    const input = 'Here is the code. Could you please fix it';
    const result = stripPreamble(input);
    expect(result.after.startsWith('Here is the code.')).toBe(true);
  });

  it('preserves protected code spans when stripping', () => {
    const result = stripPreamble('Could you please help me to fix \u00010\u0001');
    expect(result.after).toContain('\u00010\u0001');
  });
});

describe('greeting stripping', () => {
  it('removes a leading greeting', () => {
    const result = stripGreetings('Hey, explain closures in JS');
    expect(result.applied).toBe(true);
    expect(result.after.trim()).toBe('explain closures in JS');
  });

  it('leaves a greeting-like word mid-prompt alone', () => {
    const result = stripGreetings('The greeting function is broken');
    expect(result.applied).toBe(false);
  });
});

describe('postamble stripping', () => {
  it('removes a trailing thanks', () => {
    const result = stripPostamble('Write a cover letter for a PM role. Thanks in advance!');
    expect(result.applied).toBe(true);
    expect(result.after.trim()).toBe('Write a cover letter for a PM role.');
  });

  it('keeps thanks that are followed by more content', () => {
    const input = 'Thanks, but now explain the second part';
    const result = stripPostamble(input);
    expect(result.after).toBe(input);
  });

  it('does not leave a dangling comma behind', () => {
    const result = stripPostamble('Summarise this article, thanks');
    expect(result.after).not.toMatch(/,\s*$/);
  });
});

describe('filler stripping', () => {
  it('removes hedging phrases without breaking the sentence', () => {
    const result = stripFiller('Basically, if you don\u2019t mind, refactor this module');
    expect(result.applied).toBe(true);
    expect(result.after).not.toContain('Basically');
    expect(result.after).not.toContain('if you don');
    expect(result.after).toContain('refactor this module');
  });

  it('never removes content that carries meaning', () => {
    const result = stripFiller('Do not basically ignore errors');
    expect(result.after).toContain('Do not');
  });
});

describe('imperative detection', () => {
  it.each(['fix this', 'Write a function', 'explain closures'])('accepts %s', (text) => {
    expect(isImperative(text)).toBe(true);
  });

  it.each(['the bug in this code', 'my function is slow', 'a cover letter'])('rejects %s', (text) => {
    expect(isImperative(text)).toBe(false);
  });
});
