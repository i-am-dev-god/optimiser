import { describe, expect, it } from 'vitest';
import { seal, restore } from '../vault';
import { stripPostamble, stripPreamble } from '../rewrite';
import { optimize } from '../optimize';

describe('prompt preservation regressions', () => {
  it('does not mistake contractions for a quotation spanning multiple sentences', () => {
    const input = "I've tried this and it's broken. I've checked logs but it doesn't work.";
    const sealed = seal(input);
    expect(sealed.entries.filter(e => e.kind === 'quoted')).toHaveLength(0);
    expect(restore(sealed.text, sealed.entries)).toBe(input);
  });
  it('still protects actual single quoted text', () => {
    const input = "Output exactly 'hello world' and nothing else.";
    expect(seal(input).entries.some(e => e.original === "'hello world'")).toBe(true);
  });
  it('does not turn the imperative conversion into a question', () => {
    const result = stripPreamble('Can you help me with refactoring this code?');
    expect(result.after).not.toMatch(/^Refactor.*\?$/);
  });
  it('keeps punctuation between the body and a sign-off', () => {
    expect(stripPostamble('Explain this. Thanks!').after).toBe('Explain this.');
    expect(stripPostamble('Explain this? Thanks!').after).toBe('Explain this?');
  });
  it('reports the accepted cleanup word delta, not an independent guess', () => {
    const result = optimize('Hello! Please explain closures. Thanks!');
    const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
    const lastApplied = result.transforms.filter(t => t.applied).at(-1);
    const cleaned = lastApplied?.after ?? result.original;
    expect(result.diagnostic.fluffRatio).toBe((words(result.original) - words(cleaned)) / words(result.original));
  });
});
