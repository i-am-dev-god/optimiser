import { useEffect, useState } from 'react';
import { browserModel, checkBrowserAi, rewriteWithBrowserAi } from '../../engine/browserAi';
import { diffWords } from '../lib/diff';

export function BrowserAI({ prompt }: { prompt: string }) {
  const [availability, setAvailability] = useState('checking');
  const [busy, setBusy] = useState(false);
  const [original, setOriginal] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { let live = true; checkBrowserAi().then(s => { if (live) setAvailability(s); }).catch(() => { if (live) setAvailability('error'); }); return () => { live = false; }; }, []);
  async function run() {
    if (!prompt.trim()) { setError('Enter a prompt first.'); return; }
    const input = prompt;
    setBusy(true); setError(''); setCopied(false);
    try { const answer = await rewriteWithBrowserAi(input); setOriginal(input); setOutput(answer); setAvailability('available'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Model failed to run.'); }
    finally { setBusy(false); }
  }
  async function copy() { try { await navigator.clipboard.writeText(output); setCopied(true); } catch { setError('Clipboard unavailable. Select and copy the result manually.'); } }
  const available = !['checking', 'unsupported', 'unavailable', 'error'].includes(availability) && !!browserModel();
  return <section className="panel mt-5 p-5 sm:p-6" aria-labelledby="ai-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-medium uppercase tracking-widest text-jade-400">Actual model inference</div><h2 id="ai-title" className="mt-1 text-xl font-semibold">Browser AI rewrite</h2></div><span className="chip">Model: {availability}</span></div>
    <p className="mt-3 text-sm leading-6 text-ink-300">This mode calls your browser’s built-in language model, if supported. The target-model selector above is only for token accounting and does not select this model. Your prompt stays on your device; your browser may need to download model files first.</p>
    {!available && <p role="status" className="mt-3 rounded-lg border border-amber-400/30 p-3 text-sm text-amber-400">{availability === 'checking' ? 'Checking browser model availability…' : 'Browser AI is unavailable here. A compatible browser, supported device, enabled Prompt API and a downloaded model are required. No AI rewrite has run; the rule-based optimizer above remains separate.'}</p>}
    {available && <p className="mt-3 text-xs text-ink-300">{availability === 'available' ? 'Model is ready. Run a rewrite to verify inference.' : 'Model setup or download may be required when you run it.'}</p>}
    <button type="button" disabled={!available || busy} onClick={run} className="mt-4 rounded-lg bg-jade-400 px-5 py-3 text-sm font-semibold text-ink-950 disabled:cursor-not-allowed disabled:opacity-40">{busy ? 'Running model…' : 'Rewrite with browser AI'}</button>
    {error && <p role="alert" className="mt-3 text-sm text-rose-400">{error}</p>}
    {output && <div className="mt-5"><div className="flex justify-between gap-3"><h3 className="text-sm font-semibold">AI output {original === output && <span className="text-ink-300">· unchanged</span>}</h3><button onClick={copy} className="text-sm text-jade-400">{copied ? 'Copied' : 'Copy'}</button></div>{original !== prompt && <p className="mt-2 text-sm text-amber-400">Input changed since this result was generated.</p>}<div className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-ink-700 bg-ink-950 p-4 text-sm leading-7">{output}</div><details className="mt-4"><summary className="cursor-pointer text-sm text-ink-200">Compare with original</summary><div className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{diffWords(original, output).map((part, i) => <span key={i} className={part.kind === 'add' ? 'bg-jade-500/20 text-jade-400' : part.kind === 'del' ? 'bg-rose-400/10 text-rose-400 line-through' : ''}>{part.text}</span>)}</div></details><p className="mt-4 text-xs leading-5 text-amber-400">Model inference completed, but that does not prove the rewrite is correct. AI can omit details or add instructions. Compare it with the original before use. No AI cost or output savings are claimed.</p></div>}
  </section>;
}
