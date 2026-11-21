/**
 * Word diff for the before/after view.
 *
 * Why hand-rolled: the engine makes a small number of reversible edits, so the
 * diff only needs to be *legible*, not clever. An LCS over words is enough to
 * show exactly which words were removed and which were added, and it is exact —
 * no heuristics about what "counts" as a change.
 */

export type DiffKind = 'same' | 'add' | 'del';
export interface DiffPart {
  readonly kind: DiffKind;
  readonly text: string;
}

/** Above this many words the quadratic table is pointless; show plain text. */
const MAX_DIFF_WORDS = 1200;

function words(text: string): string[] {
  return text.split(/(\s+)/).filter((part) => part !== '');
}

export function diffWords(before: string, after: string): DiffPart[] {
  const a = words(before);
  const b = words(after);

  if (a.length === 0) return b.length ? [{ kind: 'add', text: after }] : [];
  if (b.length === 0) return [{ kind: 'del', text: before }];
  if (a.length > MAX_DIFF_WORDS || b.length > MAX_DIFF_WORDS) {
    return [
      { kind: 'del', text: before },
      { kind: 'add', text: after },
    ];
  }

  const n = a.length;
  const m = b.length;
  const table = new Uint32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[at(i, j)] =
        a[i] === b[j]
          ? (table[at(i + 1, j + 1)] ?? 0) + 1
          : Math.max(table[at(i + 1, j)] ?? 0, table[at(i, j + 1)] ?? 0);
    }
  }

  const parts: DiffPart[] = [];
  const push = (kind: DiffKind, text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) {
      parts[parts.length - 1] = { kind, text: last.text + text };
      return;
    }
    parts.push({ kind, text });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('same', a[i] ?? '');
      i += 1;
      j += 1;
    } else if ((table[at(i + 1, j)] ?? 0) >= (table[at(i, j + 1)] ?? 0)) {
      push('del', a[i] ?? '');
      i += 1;
    } else {
      push('add', b[j] ?? '');
      j += 1;
    }
  }
  while (i < n) {
    push('del', a[i] ?? '');
    i += 1;
  }
  while (j < m) {
    push('add', b[j] ?? '');
    j += 1;
  }

  return parts;
}
