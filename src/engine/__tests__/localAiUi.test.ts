// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BrowserAI } from '../../ui/components/BrowserAI';

class FakeWorker {
  static current: FakeWorker;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { FakeWorker.current = this; }
  send(data: unknown) { this.onmessage?.({ data }); }
}
let root: Root | undefined;
afterEach(() => { if (root) act(() => root?.unmount()); root = undefined; document.body.innerHTML = ''; vi.unstubAllGlobals(); });
describe('local model status controls', () => {
  it('requires a loaded worker before rewrite, reports file progress, and applies a checked result', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('Worker', FakeWorker);
    const host = document.createElement('div'); document.body.appendChild(host);
    const apply = vi.fn();
    root = createRoot(host);
    await act(async () => root!.render(createElement(BrowserAI, { prompt: 'Explain bread.', source: 'Explain bread.', onApply: apply })));
    const worker = FakeWorker.current;
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'restore' });
    await act(async () => worker.send({ type: 'not-cached' }));
    expect(host.textContent).toContain('Not downloaded');
    await act(async () => host.querySelector('button')!.click());
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'load' });
    expect(host.querySelector('button')).toBeNull();
    await act(async () => worker.send({ type: 'progress', file: 'model.onnx', loaded: 20, total: 100 }));
    expect(host.textContent).toContain('model.onnx: 20%');
    await act(async () => worker.send({ type: 'ready' }));
    expect(host.textContent).toContain('Ready');
    await act(async () => host.querySelector('button')!.click());
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'rewrite', prompt: 'Explain bread.' });
    await act(async () => worker.send({ type: 'result', output: 'Explain bread.' }));
    expect(apply).toHaveBeenCalledWith('Explain bread.', 'Explain bread.');
  });
});

it('offers an explicit review of a rejected constraint rewrite, without silently applying it', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Worker', FakeWorker);
  const host = document.createElement('div'); document.body.appendChild(host);
  const apply = vi.fn();
  const original = "Make a website. Don't make it look like every other AI template.";
  const candidate = 'Make a website with an original look.';
  root = createRoot(host);
  await act(async () => root!.render(createElement(BrowserAI, { prompt: original, source: original, onApply: apply })));
  const worker = FakeWorker.current;
  await act(async () => worker.send({ type: 'ready' }));
  await act(async () => host.querySelector('button')!.click());
  await act(async () => worker.send({ type: 'result', output: candidate }));
  expect(apply).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Review rejected rewrite');
  expect(host.textContent).toContain(candidate);
  const button = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Apply anyway'))!;
  await act(async () => root!.render(createElement(BrowserAI, { prompt: 'Different prompt', source: 'Different prompt', onApply: apply })));
  expect(button.disabled).toBe(true);
  await act(async () => root!.render(createElement(BrowserAI, { prompt: original, source: original, onApply: apply })));
  await act(async () => button.click());
  expect(apply).toHaveBeenCalledWith(candidate, original);
});

it('shows an unchecked streaming draft and discards stale output when the prompt changes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Worker', FakeWorker);
  const host = document.createElement('div'); document.body.appendChild(host);
  const apply = vi.fn();
  root = createRoot(host);
  await act(async () => root!.render(createElement(BrowserAI, { prompt: 'Explain bread.', source: 'Explain bread.', onApply: apply })));
  const worker = FakeWorker.current;
  await act(async () => worker.send({ type: 'ready' }));
  await act(async () => host.querySelector('button')!.click());
  await act(async () => worker.send({ type: 'chunk', text: 'Partial draft' }));
  expect(host.textContent).toContain('Partial draft');
  expect(host.textContent).toContain('incomplete and has not been checked');
  expect(apply).not.toHaveBeenCalled();
  await act(async () => root!.render(createElement(BrowserAI, { prompt: 'Different input', source: 'Different input', onApply: apply })));
  await act(async () => worker.send({ type: 'result', output: 'Explain bread.' }));
  expect(host.textContent).toContain('outdated result was discarded');
  expect(apply).not.toHaveBeenCalled();
});

it('cancels the active worker and reloads without applying a late result', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Worker', FakeWorker);
  const host = document.createElement('div'); document.body.appendChild(host);
  const apply = vi.fn();
  root = createRoot(host);
  await act(async () => root!.render(createElement(BrowserAI, { prompt: 'Explain bread.', source: 'Explain bread.', onApply: apply })));
  const worker = FakeWorker.current;
  await act(async () => worker.send({ type: 'ready' }));
  await act(async () => host.querySelector('button')!.click());
  const cancel = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Cancel rewrite'))!;
  await act(async () => cancel.click());
  expect(worker.terminate).toHaveBeenCalled();
  expect(FakeWorker.current).not.toBe(worker);
  expect(FakeWorker.current.postMessage).toHaveBeenCalledWith({ type: 'restore' });
  await act(async () => worker.send({ type: 'result', output: 'Explain bread.' }));
  expect(apply).not.toHaveBeenCalled();
});

it('runs a real self-test request only when ready and displays the worker output without applying it', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Worker', FakeWorker);
  const host = document.createElement('div'); document.body.appendChild(host);
  const apply = vi.fn(); root = createRoot(host);
  await act(async () => root!.render(createElement(BrowserAI, { prompt: '', source: '', onApply: apply })));
  const worker = FakeWorker.current;
  expect(host.textContent).not.toContain('Test AI model');
  await act(async () => worker.send({ type: 'ready' }));
  const test = [...host.querySelectorAll('button')].find(b => b.textContent === 'Test AI model')!;
  await act(async () => test.click());
  expect(worker.postMessage).toHaveBeenCalledWith({ type: 'self-test' });
  expect(test.disabled).toBe(true);
  expect(host.textContent).toContain('Testing AI model');
  await act(async () => worker.send({ type: 'self-test-result', output: 'READY', elapsedMs: 1200 }));
  expect(host.textContent).toContain('Model returned: READY');
  expect(host.textContent).toContain('1200 ms');
  expect(apply).not.toHaveBeenCalled();
});

it('shows an inference error without incorrectly reporting a failed download', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Worker', FakeWorker);
  const host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(BrowserAI, { prompt: '', source: '', onApply: vi.fn() })));
  const worker = FakeWorker.current;
  await act(async () => worker.send({ type: 'ready' }));
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Test AI model')!.click());
  await act(async () => worker.send({ type: 'error', operation: 'self-test', message: 'Inference failed' }));
  expect(host.textContent).toContain('Inference failed');
  expect(host.textContent).not.toContain('Download failed');
});
