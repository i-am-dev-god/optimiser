import { describe, expect, it } from 'vitest';
import { validateAi } from '../validateAi';
import { optimize } from '../optimize';
import { countWith } from '../tokenizer';

const prompt = "Hey can you explain why my sourdough starter smells like nail polish remover and what I should do next? I'm kind of panicking because I fed it this morning and it's bubbly but smells super sharp.";
describe('local rewrite safety checks', () => {
  it('rejects an empty rewrite', () => expect(validateAi(prompt, '')).not.toHaveLength(0));
  it('rejects a rewrite that drops a protected quote or number', () => {
    expect(validateAi('Keep "important" and use 18 items.', 'Use 19 items.')).not.toHaveLength(0);
  });
  it('accepts unchanged text (the checks are not proof of meaning)', () => expect(validateAi(prompt, prompt)).toHaveLength(0));
  it('does not add the unsolicited explanation directive to the user example', () => {
    const out = optimize(prompt, { addDirective: false }).optimized;
    expect(out).not.toContain('Dense explanation with examples.');
    for (const fact of ['sourdough starter', 'nail polish remover', 'this morning', 'bubbly', 'sharp']) expect(out.toLowerCase()).toContain(fact);
  });
  it('does not silently truncate an exact token count', () => expect(() => countWith('x'.repeat(200_001), 'o200k_base')).toThrow('200,000'));
});
