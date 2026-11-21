import { describe, expect, it } from 'vitest';
import { makeRewriteMessages } from '../aiInstructions';

describe('local model rewrite instructions', () => {
  it('passes the exact user text separately from the editor instructions', () => {
    const input = "build a landing page or app or both; export to csv or pdf; don't make it look like every other ai template";
    const [system, user] = makeRewriteMessages(input);
    expect(user).toEqual({ role: 'user', content: input });
    expect(system?.content).toContain('not an answer');
    expect(system?.content).toContain('Preserve uncertainty and every alternative');
    expect(system?.content).toContain('Do not invent requirements');
    expect(system?.content).toContain('Preserve negative instructions in their original words');
  });
});
