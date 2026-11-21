import { describe, expect, it } from 'vitest';
import { verify } from '../verify';
import { seal } from '../vault';
import { countWith } from '../tokenizer';

const run = (original: string, optimized: string) => {
  const sealed = seal(original);
  return verify({
    original,
    optimizedRestored: optimized,
    vault: sealed.entries,
    encoder: 'o200k_base',
    addedDirectiveTokens: 0,
  });
};

describe('verification gate', () => {
  it('passes an honest optimization', () => {
    const report = run(
      'Could you please help me to explain how closures work',
      'Explain how closures work',
    );
    expect(report.ok).toBe(true);
  });

  it('fails when a numeric fact is dropped', () => {
    const report = run('Return results within 500ms for at least 18 rows', 'Return results for at least 18 rows');
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.id === 'numbers')?.status).toBe('fail');
  });

  it('does not accept 18 as a match for 180', () => {
    const report = run('Limit to 18 items', 'Limit to 180 items');
    expect(report.checks.find((c) => c.id === 'numbers')?.status).toBe('fail');
  });

  it('does not accept 500 as a match for 500ms', () => {
    const report = run('Keep latency under 500ms', 'Keep latency under 500');
    expect(report.checks.find((c) => c.id === 'numbers')?.status).toBe('fail');
  });

  it('fails when a code span is altered', () => {
    const report = run('Fix `useEffect(() => {}, [])` in App.tsx', 'Fix the hook in App.tsx');
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.id === 'vault')?.status).toBe('fail');
  });

  it('fails when a negative constraint is dropped', () => {
    const report = run('Build a parser. Do not use any external libraries.', 'Build a parser.');
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.id === 'constraints')?.status).toBe('fail');
  });

  it('fails when the result is a fragment', () => {
    const report = run('Explain closures', '');
    expect(report.ok).toBe(false);
  });

  it('fails when cleanup grows the prompt with nothing to account for it', () => {
    const report = run('Explain closures', 'Explain closures. Be thorough but concise and skip filler.');
    expect(report.checks.find((c) => c.id === 'net-cost')?.status).toBe('fail');
  });

  it('passes when the growth is exactly the declared directive', () => {
    const original = 'Explain closures';
    const directive = 'Direct answer only.';
    const optimizedRestored = `${original}\n\n${directive}`;
    // Measure, never guess: the guard is only meaningful if the declared cost is
    // the real cost.
    const declared = countWith(`\n\n${directive}`, 'o200k_base');
    const report = verify({
      original,
      optimizedRestored,
      vault: seal(original).entries,
      encoder: 'o200k_base',
      addedDirectiveTokens: declared,
    });
    const net = report.checks.find((c) => c.id === 'net-cost');
    expect(net?.status).toBe('pass');
    expect(net?.detail).toContain('Directive adds');
  });

  it('fails when declared growth understates the real growth', () => {
    const original = 'Explain closures';
    const optimizedRestored = `${original}\n\nDirect answer only.`;
    const report = verify({
      original,
      optimizedRestored,
      vault: seal(original).entries,
      encoder: 'o200k_base',
      // Deliberately too small: the gate must not take the caller's word for it.
      addedDirectiveTokens: 1,
    });
    expect(report.checks.find((c) => c.id === 'net-cost')?.status).toBe('fail');
  });

  it('passes when growth is exactly zero', () => {
    const report = run('Explain closures', 'Explain closures');
    expect(report.checks.find((c) => c.id === 'net-cost')?.status).toBe('pass');
  });

  it('detects an empty header', () => {
    const report = run('Write a parser in Go', 'Task:\n\nWrite a parser in Go');
    expect(report.checks.find((c) => c.id === 'structure')?.status).toBe('fail');
  });
});
