/** Small, pure presentation helpers. No logic that belongs in the engine. */

export function sign(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** Percentage of `part` in `whole`, rounded for display only. */
export function share(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Compact USD. The engine reports full float precision; the UI never invents digits. */
export function usd(value: number): string {
  if (value === 0) return '$0';
  if (value >= 0.01) return `$${value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`;
  return `$${value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`;
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const INTENT_LABEL: Record<string, string> = {
  CODE_GEN: 'Code generation',
  DEBUG_FIX: 'Debugging',
  EXPLAIN_LEARN: 'Explanation',
  DATA_TRANSFORM: 'Data transform',
  WRITING_STRATEGY: 'Writing',
  QUICK_FACT: 'Quick fact',
};
