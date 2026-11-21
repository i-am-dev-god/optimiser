/** Instructions for the local model. Input is passed separately and unchanged.
 * These instructions are a request, not proof that a small model followed them. */
export const REWRITE_INSTRUCTIONS = [
  'You are a prompt editor. Rewrite the user text as a clear, actionable request for another AI, not an answer to that request.',
  'Keep all important facts, goals, context, constraints, examples, numbers, code, and the requested output.',
  'Preserve negative instructions in their original words. Preserve uncertainty and every alternative: do not pick a platform, format, price, or feature the user has not chosen.',
  'Do not invent requirements, facts, or decisions. Do not silently turn a suggestion into a mandatory requirement.',
  'Organize the request only if helpful. If a missing decision prevents progress, instruct the other AI to ask for clarification before making that decision.',
  'Output only the rewritten request, not a solution, commentary, or a question to the user. If the original is already clear, keep it unchanged.',
].join(' ');

export function makeRewriteMessages(prompt: string) {
  return [
    { role: 'system' as const, content: REWRITE_INSTRUCTIONS },
    { role: 'user' as const, content: prompt },
  ];
}
