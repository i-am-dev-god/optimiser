/**
 * Starting points, not templates.
 *
 * Each sample exists to exercise a different path through the pipeline, so a
 * visitor can see the machinery adapt rather than take our word for it:
 *
 *  - `chatty`     — heavy filler, one real request buried in it
 *  - `code`       — generative intent where a directive can actually pay off
 *  - `constraints`— multiple hard requirements that must survive untouched
 *  - `debug`      — a bug report wrapped in apology and hedging
 *  - `precise`    — already tight; the engine should decline to touch it
 */

export interface Sample {
  readonly id: string;
  readonly label: string;
  /** What a viewer should watch for. */
  readonly note: string;
  readonly prompt: string;
}

export const SAMPLES: readonly Sample[] = [
  {
    id: 'chatty',
    label: 'Buried request',
    note: 'Most of the text is greeting and hedging. Only one sentence is the task.',
    prompt:
      "Hey ChatGPT! I was hoping you could please help me with something. So basically I've been trying to get this thing working for a while now and it's just not happening, and I've tried a bunch of different things already but none of them seem to work. I need to fix this bug in my React app where the state doesn't update. Thanks so much in advance, I really appreciate it!",
  },
  {
    id: 'code',
    label: 'Generative task',
    note: 'Open-ended enough that output bloat is likely, so a directive can earn its cost.',
    prompt:
      'Write a TypeScript function that debounces an async callback. It should cancel in-flight work when called again, and I need it to keep the original `this` binding.',
  },
  {
    id: 'constraints',
    label: 'Hard constraints',
    note: 'Watch that every requirement survives verbatim; none of them are "cleaned".',
    prompt:
      'Can you help me with refactoring this caching layer? It must not break the public API, it must keep working on Node 18, it must never cache responses over 1MB, and please do not add any new dependencies. Respond with the refactored code and a short summary of what changed.',
  },
  {
    id: 'debug',
    label: 'Apologetic bug report',
    note: 'The apology and the hedge carry no information. The stack trace does.',
    prompt:
      "Sorry to bother you, I'm probably missing something obvious. My API keeps returning a 500 error whenever I POST to /api/orders, and I can't figure out why. Here's the error: `TypeError: Cannot read properties of undefined (reading 'items')`. I've checked the logs and the body looks fine. Could you tell me what's going wrong?",
  },
  {
    id: 'precise',
    label: 'Already tight',
    note: 'No filler to remove and no justified directive. The engine should leave it alone.',
    prompt: 'What is the capital of France?',
  },
];
