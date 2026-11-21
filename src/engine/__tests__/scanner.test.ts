import { describe, expect, it } from 'vitest';
import { scan } from '../scanner';
import { seal } from '../vault';

const diag = (text: string, depth: 'AUTO' | 'DEEP' | 'BALANCED' | 'DIRECT_ONLY' = 'AUTO') =>
  scan(seal(text).text, depth);

describe('scanner: intents', () => {
  it('detects code generation', () => {
    expect(diag('Write a TypeScript function that debounces an async call').intents).toContain('CODE_GEN');
  });

  it('detects debugging', () => {
    expect(diag('Getting TypeError: undefined is not a function when I click submit').intents).toContain('DEBUG_FIX');
  });

  it('detects explanation', () => {
    expect(diag('Why do React hooks need a stable order?').intents).toContain('EXPLAIN_LEARN');
  });

  it('detects data transformation', () => {
    expect(diag('Convert this JSON array into CSV').intents).toContain('DATA_TRANSFORM');
  });

  it('detects writing tasks', () => {
    expect(diag('Draft a concise email to my landlord about a broken heater').intents).toContain('WRITING_STRATEGY');
  });

  it('is multi-label for mixed prompts', () => {
    const result = diag('Fix this SQL query and explain why my JOIN duplicated rows');
    expect(result.intents).toContain('DEBUG_FIX');
    expect(result.intents).toContain('EXPLAIN_LEARN');
  });

  it('never returns zero intents', () => {
    expect(diag('asdfgh').intents.length).toBeGreaterThan(0);
  });

  it('does not label a build request as a quick fact', () => {
    expect(diag('What is the best way to write a Rust parser?').intents).not.toEqual(['QUICK_FACT']);
  });
});

describe('scanner: depth', () => {
  it('honours an explicit user override', () => {
    expect(diag('What is a monad?', 'DEEP').depth).toBe('DEEP');
    expect(diag('Explain monads in depth', 'DIRECT_ONLY').depth).toBe('DIRECT_ONLY');
  });

  it('detects deep intent from phrasing', () => {
    expect(diag('Explain in detail how the event loop schedules microtasks').depth).toBe('DEEP');
  });

  it('detects direct-only intent', () => {
    expect(diag('Just give me the code, no explanation').depth).toBe('DIRECT_ONLY');
  });

  it('defaults to balanced', () => {
    expect(diag('Write a hello world in Go').depth).toBe('BALANCED');
  });
});

describe('scanner: fluff and risk', () => {
  it('scores a fluffy prompt higher than a terse one', () => {
    const fluffy = diag('Hey! I was wondering if you could please help me to fix this bug');
    const terse = diag('Fix this bug');
    expect(fluffy.fluffRatio).toBeGreaterThan(terse.fluffRatio);
  });

  it('explains why fluff was detected', () => {
    expect(diag('Hey, could you help me write a test').fluffEvidence.length).toBeGreaterThan(0);
  });

  it('raises retry risk for long compound sentences with buried constraints', () => {
    const text =
      'Build a dashboard that shows sales and also lets me filter by region and it must work on mobile and do not use any external libraries and keep the bundle under 200kb and also please make sure it supports dark mode while being accessible.';
    expect(diag(text).retryRisk).toBe('HIGH');
  });

  it('keeps retry risk low for a simple closed question', () => {
    expect(diag('What is the capital of France?').retryRisk).toBe('LOW');
  });

  it('flags regulated domains as retry risk', () => {
    expect(diag('Draft terms of service for my app that satisfy GDPR').retryRisk).not.toBe('LOW');
  });
});
