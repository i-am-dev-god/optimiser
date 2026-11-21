import { seal } from './vault';
import { verify } from './verify';

/** Conservative checks only; they cannot establish semantic equivalence. */
export function validateAi(original: string, candidate: string): string[] {
  if (!candidate.trim()) return ['The AI returned an empty rewrite.'];
  const checks = verify({ original, optimizedRestored: candidate, vault: seal(original).entries, encoder: 'o200k_base', addedDirectiveTokens: 0 }).checks;
  return checks.filter(c => ['vault', 'numbers', 'constraints', 'structure', 'substance'].includes(c.id) && c.status === 'fail').map(c => c.detail);
}
