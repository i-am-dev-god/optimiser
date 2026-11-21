import { describe, it, expect, vi } from 'vitest';
import { checkBrowserAi, rewriteWithBrowserAi, type BrowserLanguageModel } from '../browserAi';
import { optimize } from '../optimize';
import { countWith } from '../tokenizer';

const example = "Hey can you explain why my sourdough starter smells like nail polish remover and what I should do next? I'm kind of panicking because I fed it this morning and it's bubbly but smells super sharp.";
describe('browser AI integration', () => {
  it('sends the exact input to the model and cleans up its session', async () => {
    const prompt = vi.fn().mockResolvedValue('Explain why my sourdough starter smells like nail polish remover and what to do next. It was fed this morning, is bubbly and smells sharp.');
    const destroy = vi.fn();
    const api: BrowserLanguageModel = { availability: async () => 'available', create: vi.fn().mockResolvedValue({ prompt, destroy }) };
    const result = await rewriteWithBrowserAi(example, api);
    expect(prompt).toHaveBeenCalledWith(example);
    expect(api.create).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
    expect(result).toContain('sourdough starter');
  });
  it('reports unsupported and never fabricates a model output', async () => {
    expect(await checkBrowserAi()).toBe('unsupported');
    await expect(rewriteWithBrowserAi(example)).rejects.toThrow('not available');
  });
  it('destroys the session when inference fails', async () => {
    const destroy = vi.fn();
    const api: BrowserLanguageModel = { availability: async () => 'available', create: async () => ({ prompt: async () => { throw new Error('inference failed'); }, destroy }) };
    await expect(rewriteWithBrowserAi(example, api)).rejects.toThrow('inference failed');
    expect(destroy).toHaveBeenCalledOnce();
  });
  it('rejects empty output rather than presenting it as success', async () => {
    const api: BrowserLanguageModel = { availability: async () => 'available', create: async () => ({ prompt: async () => '  ', destroy: () => {} }) };
    await expect(rewriteWithBrowserAi(example, api)).rejects.toThrow('empty');
  });
  it('rule-based example preserves important details', () => {
    const out = optimize(example, { addDirective: false }).optimized;
    expect(out).not.toContain("Dense explanation with examples.");
    for (const fact of ['sourdough starter', 'nail polish remover', 'this morning', 'bubbly', 'sharp']) expect(out.toLowerCase()).toContain(fact);
  });
  it('never silently truncates a purported exact token count', () => {
    expect(() => countWith('x'.repeat(200_001), 'o200k_base')).toThrow('200,000');
  });
});
