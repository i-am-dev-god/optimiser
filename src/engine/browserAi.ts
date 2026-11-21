/** Browser Prompt API: capability is checked at runtime; no network fallback. */
export interface BrowserSession {
  prompt(input: string): Promise<string>;
  destroy(): void;
}
export interface BrowserLanguageModel {
  availability(): Promise<string>;
  create(options: { initialPrompts: Array<{ role: 'system'; content: string }> }): Promise<BrowserSession>;
}

export function browserModel(): BrowserLanguageModel | undefined {
  return (globalThis as typeof globalThis & { LanguageModel?: BrowserLanguageModel }).LanguageModel;
}

export async function checkBrowserAi(api = browserModel()): Promise<string> {
  if (!api) return 'unsupported';
  return api.availability();
}

export async function rewriteWithBrowserAi(input: string, api = browserModel()): Promise<string> {
  if (!input.trim()) throw new Error('Enter a prompt first.');
  if (!api) throw new Error('Browser AI is not available in this browser.');
  const availability = await api.availability();
  if (availability === 'unavailable') throw new Error('The browser reports that its AI model is unavailable on this device.');
  const session = await api.create({ initialPrompts: [{ role: 'system', content:
    'Rewrite the user’s prompt for clarity and concision. Preserve the task, context, uncertainty, constraints, and all important details. Do not answer the prompt or add requirements, examples, or facts. If it is already clear, leave it unchanged. Return only the rewritten prompt.' }] });
  try {
    const output = (await session.prompt(input)).trim();
    if (!output) throw new Error('The model returned an empty response.');
    return output;
  } finally { session.destroy(); }
}
