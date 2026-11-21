import { NEGATIVE_CUES, REQUIREMENT_CUES } from './phrases';
import type { Constraint } from './types';

/**
 * Constraint extraction.
 *
 * Constraints are **copied**, never moved. The original sentence keeps its
 * clause so the restored prompt stays grammatical; the copy exists only to
 * raise the constraint's visual salience for the target model.
 *
 * Clause splitting is on sentence boundaries and coordinating conjunctions,
 * which is deliberately conservative: an unsplit clause is still correct, a
 * wrongly split one is not.
 */

/**
 * Clause boundaries, in order of reliability:
 *  1. sentence enders
 *  2. a comma before a new requirement
 *  3. coordinating conjunctions that introduce a requirement, because people
 *     routinely chain four requirements in one unpunctuated sentence
 *
 * Rule 3 is what stops a 40-word run-on from being treated as a single clause,
 * which previously hid every constraint inside it.
 */
const SENTENCE_SPLIT = /(?<=[.!?;])\s+|\n{2,}/;

const LIST_SPLIT =
  /,\s*(?:and\s+|but\s+|also\s+)?|\s+(?:and\s+also|also|plus|but|and)\s+(?=(?:it\s+)?(?:must|should|needs?\s+to|has\s+to|do\s+not|don'?t|never|without|avoid|no\b|only|ensure|make\s+sure|keep|use|support|handle|include|exclude|omit|prefer|target|limit|allow|require|stay)\b)/i;

function clausesOf(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT)
    .flatMap((sentence) => sentence.split(LIST_SPLIT))
    .map((c) => c.trim().replace(/^[,;.\s]+|[,;.\s]+$/g, ''))
    .filter(Boolean);
}

function classify(clause: string): Constraint | null {
  const words = clause.split(/\s+/).filter(Boolean);
  // A one-word "clause" is noise from splitting, not a constraint.
  if (words.length < 2) return null;
  // Upper bound: a 45-word clause is a paragraph, and elevating it would
  // duplicate most of the prompt. Surface it in place instead.
  if (words.length > 45) return null;

  if (NEGATIVE_CUES.some((re) => re.test(clause))) {
    return { text: clause, kind: 'negative' };
  }
  if (REQUIREMENT_CUES.some((re) => re.test(clause))) {
    return { text: clause, kind: 'requirement' };
  }
  return null;
}

export function extractConstraints(text: string): Constraint[] {
  const seen = new Set<string>();
  const out: Constraint[] = [];
  for (const clause of clausesOf(text)) {
    const constraint = classify(clause);
    if (!constraint) continue;
    const key = constraint.text.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(constraint);
  }
  return out;
}

/**
 * Cost of duplicating constraints into a visible block, measured in characters
 * of added prompt text. Used by the router to decide whether elevation is worth
 * it — we never raise constraints when the copy would exceed the original.
 */
export function elevationCost(constraints: readonly Constraint[]): number {
  if (constraints.length === 0) return 0;
  const header = 'Constraints: ';
  const body = constraints.map((c) => '-' + c.text).join('\n');
  return header.length + body.length;
}
