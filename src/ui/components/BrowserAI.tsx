import { useEffect, useRef, useState } from 'react';
import { validateAi } from '../../engine/validateAi';

type State = 'NOT_DOWNLOADED' | 'DOWNLOADING' | 'FAILED' | 'READY';
type Message = { type: 'ready' | 'not-cached' | 'error' | 'progress' | 'result' | 'chunk' | 'self-test-result'; elapsedMs?: number; text?: string; operation?: string; message?: string; file?: string; loaded?: number; total?: number; output?: string };
export function BrowserAI({ prompt, source, onApply }: { prompt: string; source: string; onApply: (output: string, original: string) => void }) {
  const worker = useRef<Worker | null>(null);
  const pending = useRef('');
  const currentPrompt = useRef(prompt);
  currentPrompt.current = prompt;
  const started = useRef(0);
  const [epoch, setEpoch] = useState(0);
  const [partial, setPartial] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [state, setState] = useState<State>('NOT_DOWNLOADED');
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [operation, setOperation] = useState<'rewrite' | 'self-test'>('rewrite');
  const [selfTest, setSelfTest] = useState<{ output: string; elapsedMs: number } | null>(null);
  const [progress, setProgress] = useState<{ file: string; loaded: number; total: number } | null>(null);
  const [message, setMessage] = useState('');
  const [review, setReview] = useState<{ original: string; candidate: string } | null>(null);
  useEffect(() => {
    let w: Worker;
    try { w = new Worker(new URL('../../engine/localAi.worker.ts', import.meta.url), { type: 'module' }); }
    catch { setChecking(false); setState('FAILED'); setMessage('This browser could not start a model worker.'); return; }
    worker.current = w;
    w.onmessage = (event: MessageEvent<Message>) => {
      if (worker.current !== w) return;
      const m = event.data;
      if (m.type === 'ready') { setState('READY'); setChecking(false); setProgress(null); setMessage(''); }
      if (m.type === 'not-cached') { setState('NOT_DOWNLOADED'); setChecking(false); }
      if (m.type === 'progress' && m.file && m.total && m.loaded !== undefined) setProgress({ file: m.file, total: m.total, loaded: m.loaded });
      if (m.type === 'error') { setChecking(false); setBusy(false); if (m.operation === 'load') setState('FAILED'); setMessage(m.message || 'Local AI failed.'); }
      if (m.type === 'self-test-result') {
        setBusy(false); setPartial('');
        if (typeof m.output === 'string' && typeof m.elapsedMs === 'number') {
          setSelfTest({ output: m.output, elapsedMs: m.elapsedMs });
          setMessage('The model returned a response to the local self-test. This shows inference ran, not that rewrites preserve meaning.');
        } else setMessage('The self-test returned an invalid response.');
      }
      if (m.type === 'chunk' && m.text) setPartial(value => value + m.text);
      if (m.type === 'result') {
        setBusy(false); setPartial('');
        if (pending.current !== currentPrompt.current) {
          setMessage('The prompt changed while the AI was running. The outdated result was discarded; run Rewrite again.');
          return;
        }
        try {
          const reasons = validateAi(pending.current, m.output ?? '');
          if (reasons.length) {
            if (m.output?.trim()) setReview({ original: pending.current, candidate: m.output });
            setMessage(`Rewrite not applied: ${reasons.join(' ')} The existing result is unchanged. Review the candidate below; the check may be detecting a real loss or a rewording.`);
            return;
          }
          onApply(m.output!, pending.current); setMessage('AI rewrite applied. Review it against your original; automatic checks cannot verify all meaning.');
        } catch { setMessage('Could not validate the AI rewrite. The existing result is unchanged.'); }
      }
    };
    w.onerror = () => { if (worker.current !== w) return; setChecking(false); setBusy(false); setState('FAILED'); setMessage('The model worker stopped. Reload the page to retry.'); worker.current = null; w.terminate(); };
    w.postMessage({ type: 'restore' });
    return () => { worker.current = null; w.terminate(); };
  }, [onApply, epoch]);
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((performance.now() - started.current) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  const enable = () => { if (!worker.current) { window.location.reload(); return; } setState('DOWNLOADING'); setMessage(''); setProgress(null); worker.current.postMessage({ type: 'load' }); };
  const rewrite = () => { if (state !== 'READY' || busy || !prompt.trim() || !worker.current) return; setOperation('rewrite'); pending.current = prompt; started.current = performance.now(); setElapsed(0); setPartial(''); setBusy(true); setMessage(''); setReview(null); worker.current.postMessage({ type: 'rewrite', prompt: source }); };
  const testModel = () => {
    if (state !== 'READY' || busy || !worker.current) return;
    started.current = performance.now(); setElapsed(0); setPartial(''); setMessage(''); setSelfTest(null);
    setOperation('self-test'); setBusy(true);
    worker.current.postMessage({ type: 'self-test' });
  };
  const cancel = () => {
    worker.current?.terminate();
    worker.current = null;
    setBusy(false); setPartial(''); setChecking(true); setState('NOT_DOWNLOADED');
    setMessage('Operation cancelled. The model will be reloaded from browser cache if available; your existing result is unchanged.');
    setEpoch(value => value + 1);
  };
  return <section className="panel mt-5 p-5 sm:p-6" aria-labelledby="ai-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="ai-title" className="font-semibold">AI Rewrite</h2><span className="chip" role="status">{checking ? 'Checking saved model…' : state === 'NOT_DOWNLOADED' ? 'Not downloaded' : state === 'DOWNLOADING' ? 'Downloading / loading' : state === 'FAILED' ? 'Download failed' : 'Ready'}</span></div>
    <p className="mt-3 text-sm leading-6 text-ink-300">Optional local rewrite using Qwen2.5 0.5B. The model file is 786 MB plus supporting files and needs a network download. Inference runs on your device in a worker; prompts are not sent to the model host. Speed and memory depend on your device.</p>
    {state === 'DOWNLOADING' && <div className="mt-3 text-xs text-ink-300">{progress ? <><div>Downloading {progress.file}: {Math.floor(progress.loaded / progress.total * 100)}% ({progress.loaded.toLocaleString()} / {progress.total.toLocaleString()} bytes)</div><progress className="mt-2 w-full accent-jade-400" max={progress.total} value={progress.loaded}/><div>Progress is for this file, not the complete model.</div></> : 'Preparing model files…'}</div>}
    {!checking && state !== 'DOWNLOADING' && (state === 'READY' ? <button type="button" disabled={busy || !prompt.trim()} onClick={rewrite} className="mt-4 rounded-lg bg-jade-400 px-5 py-3 text-sm font-semibold text-ink-950 disabled:opacity-40">{busy ? 'Rewriting…' : 'Rewrite'}</button> : <button type="button" onClick={enable} className="mt-4 rounded-lg bg-jade-400 px-5 py-3 text-sm font-semibold text-ink-950">{state === 'FAILED' ? 'Retry' : 'Enable'}</button>)}
    {state === 'READY' && !checking && <button type="button" disabled={busy} onClick={testModel} className="ml-3 mt-4 rounded-lg border border-ink-600 px-5 py-3 text-sm text-ink-100 disabled:opacity-40">Test AI model</button>}
    {selfTest && <div className="mt-3 rounded-lg border border-ink-700 bg-ink-950 p-3 text-sm" role="status"><div className="font-medium text-ink-200">Actual model self-test</div><p className="mt-1 text-xs text-ink-300">Asked the model to reply READY. This is a functional test, not an accuracy test.</p><p className="mt-2 whitespace-pre-wrap break-words">Model returned: <strong>{selfTest.output}</strong></p><p className="mt-1 text-xs text-ink-300">Inference: {selfTest.elapsedMs} ms on this device.</p></div>}
    {busy && <div className="mt-4 rounded-lg border border-ink-700 p-4" role="status">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-ink-200">{operation === 'self-test' ? 'Testing AI model' : 'AI rewriting'} · {elapsed} seconds elapsed</span><button type="button" onClick={cancel} className="rounded-md border border-ink-600 px-3 py-1.5 text-xs text-ink-100">{operation === 'self-test' ? 'Cancel test' : 'Cancel rewrite'}</button></div>
      <p className="mt-2 text-xs leading-5 text-ink-300">{operation === 'self-test' ? 'Running a small fixed prompt through the model locally. The cleanup X-Ray below is separate.' : partial ? 'Generating text locally. This draft is incomplete and has not been checked.' : 'Preparing the prompt; the first words may take time. The automatic cleanup X-Ray below is separate.'}</p>
      {partial && <div className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-ink-950 p-3 text-sm text-ink-200">{partial}</div>}
    </div>}
    {message && <p role="status" className="mt-3 text-sm leading-6 text-amber-400">{message}</p>}
    {review && <div className="mt-4 rounded-lg border border-amber-400/30 p-4">
      <h3 className="text-sm font-semibold text-amber-400">Review rejected rewrite</h3>
      <p className="mt-2 text-xs leading-5 text-ink-300">This candidate failed automatic checks. Compare it carefully with your original, especially the flagged constraint. Applying it overrides the checks and can lose important information.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div><h4 className="mb-2 text-xs font-semibold text-ink-300">Original prompt</h4><div className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-ink-700 bg-ink-950 p-3 text-sm leading-6">{review.original}</div></div>
        <div><h4 className="mb-2 text-xs font-semibold text-ink-300">AI candidate — not applied</h4><div className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-ink-700 bg-ink-950 p-3 text-sm leading-6">{review.candidate}</div></div>
      </div>
      {review.original !== prompt && <p className="mt-3 text-xs text-amber-400">The input changed since this rewrite. Run Rewrite again to review the current prompt.</p>}
      <button type="button" disabled={busy || review.original !== prompt} onClick={() => { onApply(review.candidate, review.original); setReview(null); setMessage('AI candidate applied by you despite failed checks. Review all details before copying.'); }} className="mt-4 rounded-lg border border-amber-400/50 px-4 py-2 text-sm font-medium text-amber-400 disabled:cursor-not-allowed disabled:opacity-40">Apply anyway after review</button>
      <button type="button" onClick={() => { setReview(null); setMessage('Rejected candidate discarded. The existing result is unchanged.'); }} className="ml-4 mt-4 text-sm text-ink-300 hover:text-ink-100">Discard</button>
    </div>}
    <p className="mt-3 text-xs leading-5 text-ink-300">Browser storage can be cleared or evicted, and interrupted downloads may restart. Model initialization can take time on later visits. AI can omit or alter meaning; compare before copying.</p>
  </section>;
}
