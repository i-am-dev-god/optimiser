import { useCallback, useEffect, useMemo, useState } from 'react';
import { countWith } from '../engine/tokenizer';
import { BrowserAI } from './components/BrowserAI';
import { optimize } from '../engine/optimize';
import { MODELS, PRICING_AS_OF } from '../engine/pricing';
import type { DepthSetting, OptimizationResult } from '../engine/types';
import { SAMPLES } from '../samples';
import { diffWords } from './lib/diff';
import { INTENT_LABEL, titleCase } from './lib/format';

type ExtensionStorage = {
  session: { get(key: string): Promise<Record<string, unknown>>; remove(key: string): Promise<void> };
  onChanged: { addListener(fn: (changes: Record<string, { newValue?: unknown }>, area: string) => void): void; removeListener(fn: (changes: Record<string, { newValue?: unknown }>, area: string) => void): void };
};
const extensionStorage = (globalThis as typeof globalThis & { chrome?: { storage?: ExtensionStorage } }).chrome?.storage;

const field = 'w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2.5 text-sm text-ink-100';

export default function App() {
  const [prompt, setPrompt] = useState('');
  useEffect(() => {
    if (!extensionStorage?.session) return;
    const storage = extensionStorage;
    const receive = (value: unknown) => { if (typeof value === 'string' && value) { setPrompt(value); void storage.session.remove('selectedPrompt'); } };
    void storage.session.get('selectedPrompt').then(data => receive(data.selectedPrompt));
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => { if (area === 'session') receive(changes.selectedPrompt?.newValue); };
    storage.onChanged.addListener(listener);
    return () => storage.onChanged.removeListener(listener);
  }, []);
  const modelId = MODELS[0]!.id;
  const [ai, setAi] = useState<{ original: string; output: string } | null>(null);
  const applyAi = useCallback((output: string, original: string) => setAi({ original, output }), []);
  const [depth, setDepth] = useState<DepthSetting>('AUTO');
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [resultModel, setResultModel] = useState(MODELS[0]!);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const model = MODELS.find(m => m.id === modelId) ?? MODELS[0]!;
  const aiActive = !!ai && ai.original === prompt;
  const displayed = aiActive ? ai.output : result?.optimized ?? '';
  const diff = useMemo(() => result && showDiff ? diffWords(result.original, displayed) : [], [result, showDiff, displayed]);
  const stale = !!result && result.original !== prompt;
  useEffect(() => {
    if (!prompt.trim()) { setResult(null); setError(''); return; }
    const timer = setTimeout(() => {
      try {
        setResult(optimize(prompt, { modelId, depth, addDirective: false }));
        setResultModel(model); setError(''); setCopied(false);
      } catch { setResult(null); setError('Could not process this prompt. Your input is unchanged.'); }
    }, 250);
    return () => clearTimeout(timer);
  }, [prompt, modelId, depth, model]);
  async function copy() {
    if (!result) return;
    try { await navigator.clipboard.writeText(displayed); setCopied(true); }
    catch { setError('Clipboard unavailable. Select and copy the result manually.'); }
  }
  return <div className="min-h-screen">
    <header className="border-b border-ink-800"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
      <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-jade-500 text-lg font-bold text-ink-950">✳</span><div><div className="font-semibold tracking-tight">optimiser<span className="text-jade-400">.</span></div><div className="text-[10px] uppercase tracking-[.18em] text-ink-300">Prompt workbench</div></div></div>
      <span className="chip"><span className="h-1.5 w-1.5 rounded-full bg-jade-400"/> Local processing</span>
    </div></header>
    <main className="mx-auto max-w-7xl px-5 pb-16 pt-12 sm:px-8">
      <div className="mb-9 max-w-3xl"><div className="mb-3 text-xs font-semibold uppercase tracking-[.2em] text-jade-400">A clearer way to prompt</div><h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Make every word count<span className="text-jade-400">.</span></h1><p className="mt-4 max-w-2xl leading-7 text-ink-300">Automatic rule-based cleanup runs as you type. To use AI, click Rewrite after the model is ready; it can take longer. Compare all changes before copying.</p></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel overflow-hidden"><div className="flex items-center justify-between border-b border-ink-800 px-5 py-4"><div><div className="text-xs font-medium uppercase tracking-widest text-ink-300">01 / Input</div><h2 className="mt-1 font-semibold">Your prompt</h2></div><span className="text-xs text-ink-400">Never leaves your browser</span></div>
          <div className="p-5"><label htmlFor="prompt" className="mb-2 block text-sm text-ink-200">What are you working on?</label><textarea id="prompt" value={prompt} onChange={e => {setPrompt(e.target.value); setCopied(false);}} placeholder="Paste or write your prompt here..." className={`${field} min-h-[260px] resize-y leading-7`} />
            <div className="mt-4"><span className="text-xs text-ink-300">Try an example</span><div className="mt-2 flex flex-wrap gap-2">{SAMPLES.map(s => <button type="button" key={s.id} onClick={() => setPrompt(s.prompt)} title={s.note} className="chip cursor-pointer transition hover:border-jade-500/50 hover:text-jade-400">{s.label}</button>)}</div></div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-xs font-medium text-ink-300">Response depth<select value={depth} onChange={e => {setDepth(e.target.value as DepthSetting); setResult(null);}} className={`${field} mt-2`}><option value="AUTO">Auto-detect</option><option value="DEEP">Deep</option><option value="BALANCED">Balanced</option><option value="DIRECT_ONLY">Direct only</option></select></label></div>
            <button type="button" onClick={() => { setPrompt(''); setResult(null); setAi(null); setError(''); }} className="mt-5 text-sm text-ink-300 hover:text-ink-100">Reset</button>{error && <p role="alert" className="mt-3 text-sm text-rose-400">{error}</p>}
          </div></section>
        <section className="panel overflow-hidden"><div className="flex items-center justify-between border-b border-ink-800 px-5 py-4"><div><div className="text-xs font-medium uppercase tracking-widest text-ink-300">02 / Current output</div><h2 className="mt-1 font-semibold">Optimized prompt</h2></div>{result && <span className="chip text-jade-400">{aiActive ? 'AI rewrite · review required' : result.verification.ok ? 'Automatic cleanup · checks passed' : 'Automatic cleanup · checks failed'}</span>}</div>
          {result ? <div className="fade-in p-5">{stale && <p className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-sm text-amber-400">Updating result…</p>}
            <div className="mb-3 flex items-center justify-between"><div className="flex gap-2"><button className={`chip cursor-pointer ${!showDiff ? 'text-jade-400' : ''}`} onClick={() => setShowDiff(false)}>Result</button><button className={`chip cursor-pointer ${showDiff ? 'text-jade-400' : ''}`} onClick={() => setShowDiff(true)}>Changes</button></div><button onClick={copy} disabled={stale} className="text-sm text-jade-400 hover:underline">{copied ? 'Copied' : 'Copy prompt'}</button></div>
            <div className="min-h-[260px] whitespace-pre-wrap break-words rounded-lg border border-ink-700 bg-ink-950 p-4 text-sm leading-7 text-ink-100">{showDiff ? diff.map((p, i) => <span key={i} className={p.kind === 'add' ? 'bg-jade-500/20 text-jade-400' : p.kind === 'del' ? 'bg-rose-400/10 text-rose-400 line-through' : ''}>{p.text}</span>) : displayed}</div>
            {showDiff && <p className="mt-2 text-xs text-ink-300">Green: added · red: removed. Large prompts are shown as a full replacement.</p>}
            <div className="mt-5 grid grid-cols-3 gap-2">{[['Original', result.tokens.original], ['Optimized', (aiActive ? countWith(displayed, resultModel.encoder) : result.tokens.optimized)], ['Change', `${(aiActive ? countWith(displayed, resultModel.encoder) : result.tokens.optimized) - result.tokens.original > 0 ? '+' : ''}${(aiActive ? countWith(displayed, resultModel.encoder) : result.tokens.optimized) - result.tokens.original}`]].map(([label, value]) => <div key={label} className="rounded-lg border border-ink-800 bg-ink-850 p-3"><div className="text-xs text-ink-300">{label}</div><div className="mt-1 text-xl font-semibold tabular-nums">{value}</div><div className="text-[11px] text-ink-400">o200k_base tokens</div></div>)}</div>
            <p className="mt-3 text-xs leading-5 text-ink-300">{`Reference count using ${resultModel.encoder} for prompt text only. This is not a Claude or Qwen token count and does not include message framing, responses, or billed usage.`}</p>
          </div> : <div className="flex min-h-[480px] flex-col items-center justify-center px-8 text-center"><div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-ink-700 bg-ink-850 text-2xl text-jade-400">✳</div><h3 className="font-medium">Your refined prompt will appear here</h3><p className="mt-2 max-w-xs text-sm leading-6 text-ink-300">Start with your own prompt or choose an example to see the engine in action.</p></div>}</section>
      </div>
      <BrowserAI prompt={prompt} source={!stale && result ? result.optimized : prompt} onApply={applyAi} />
      {result && <section className="panel mt-5 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-medium uppercase tracking-widest text-jade-400">Under the hood</div><h2 className="mt-1 text-xl font-semibold">Diagnostic X-Ray (automatic cleanup)</h2><p className="mt-1 text-sm text-ink-300">These checks and timing apply only to automatic cleanup—not AI rewriting. They do not guarantee semantic equivalence.</p></div><span className="chip">{result.elapsedMs} ms · automatic cleanup</span></div>
        <div className="mt-6 grid gap-4 md:grid-cols-3"><div className="rounded-lg border border-ink-800 bg-ink-850 p-4"><div className="text-xs uppercase tracking-wider text-ink-300">Detected intent</div><div className="mt-2 font-medium">{result.diagnostic.intents.map(i => INTENT_LABEL[i] ?? i).join(' + ') || 'Unclassified'}</div><div className="mt-2 text-xs text-ink-300">Depth: {titleCase(result.diagnostic.depth)}</div></div><div className="rounded-lg border border-ink-800 bg-ink-850 p-4"><div className="text-xs uppercase tracking-wider text-ink-300">Strategy</div><div className="mt-2 font-medium">{result.strategy.directive ? 'Cleanup + directive' : 'Automatic cleanup'}</div><div className="mt-2 text-xs text-ink-300">Bloat signal: {titleCase(result.diagnostic.bloatRisk)} · Retry signal: {titleCase(result.diagnostic.retryRisk)}</div></div><div className="rounded-lg border border-ink-800 bg-ink-850 p-4"><div className="text-xs uppercase tracking-wider text-ink-300">Protected spans</div><div className="mt-2 font-medium">{result.vault.length} identified</div><div className="mt-2 text-xs text-ink-300">Code, quotes, links and other recognized details</div></div></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2"><details className="rounded-lg border border-ink-800 p-4" open><summary className="cursor-pointer text-sm font-medium">Verification checks</summary><ul className="mt-3 space-y-3">{result.verification.checks.map(c => <li key={c.id} className="text-sm"><span className={c.status === 'pass' ? 'text-jade-400' : 'text-amber-400'}>{c.status.toUpperCase()}</span> <span className="text-ink-200">{c.label}</span><div className="mt-1 text-xs leading-5 text-ink-300">{c.detail}</div></li>)}</ul></details><details className="rounded-lg border border-ink-800 p-4" open><summary className="cursor-pointer text-sm font-medium">Decisions &amp; economics</summary><p className="mt-3 text-sm leading-6 text-ink-200">{result.strategy.rationale.join(' ')}</p><ul className="mt-3 space-y-2 text-xs leading-5 text-ink-300">{result.transforms.filter(t => t.applied).map((t, i) => <li key={i}>• {t.reason}</li>)}</ul><p className="mt-4 text-xs leading-5 text-ink-300">{result.economy.directive.applied ? `Directive break-even: ${result.economy.directive.breakEvenOutputTokens} output tokens, based on the selected price assumptions and directive token count. This is not a prediction of savings.` : 'No directive applied.'} Prices are assumptions dated {PRICING_AS_OF}; check current provider rates. {resultModel.encoderAccuracy === 'proxy' && 'Token and break-even figures are proxies for this model.'}</p></details></div>
      </section>}
      <footer className="mt-8 flex flex-wrap justify-between gap-2 border-t border-ink-800 pt-5 text-xs text-ink-400"><span>Built for clarity, not blind compression.</span><span>Local processing · Review before use</span></footer>
    </main></div>;
}
