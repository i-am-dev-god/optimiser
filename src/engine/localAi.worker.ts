/// <reference lib="webworker" />
import { env, pipeline, TextStreamer, type ProgressInfo } from '@huggingface/transformers';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import wasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';

const MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct';
const REVISION = '516c8d04add8a80c5228f32102b57953b8d421a9';
// Bundle runtime assets with the site, not an unpinned external CDN.
env.allowLocalModels = false;
env.useWasmCache = false;
env.useBrowserCache = true;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = { wasm: new URL(wasmUrl, self.location.href).href, mjs: new URL(wasmModuleUrl, self.location.href).href };
  // GitHub Pages is not cross-origin isolated. A single WASM thread works without it.
  env.backends.onnx.wasm.numThreads = 1;
}
let generator: Awaited<ReturnType<typeof load>> | undefined;
async function load(localOnly: boolean) {
  // Transformers.js requires local access enabled for cache-only loads.
  env.allowLocalModels = localOnly;
  return pipeline('text-generation', MODEL, {
    revision: REVISION, dtype: 'q4', device: 'wasm', local_files_only: localOnly,
    progress_callback: (info: ProgressInfo) => {
      // Report only the file currently being transferred; aggregate file sizes
      // are not always known in advance. Never label this as overall progress.
      if (info.status === 'progress' && info.total > 0) {
        self.postMessage({ type: 'progress', file: info.file, loaded: info.loaded, total: info.total });
      }
    },
  });
}
self.onmessage = async (event: MessageEvent<{ type: 'load' | 'restore' | 'rewrite'; prompt?: string }>) => {
  try {
    if (event.data.type === 'load' || event.data.type === 'restore') {
      generator = await load(event.data.type === 'restore');
      self.postMessage({ type: 'ready' });
      return;
    }
    if (!generator) throw new Error('The model is not ready.');
    // Partial text is for progress only; apply only after validation.
    const streamer = new TextStreamer(generator.tokenizer, {
      skip_prompt: true,
      callback_function: (text: string) => { if (text) self.postMessage({ type: 'chunk', text }); },
    });
    const result = await generator([
      { role: 'system', content: 'Rewrite the user prompt for clarity and concision. Preserve every relevant detail, task, constraint and uncertainty. Do not answer the prompt or add facts, examples or instructions. If already clear, leave it unchanged. Output only the revised prompt.' },
      { role: 'user', content: event.data.prompt ?? '' },
    ], { max_new_tokens: 512, do_sample: false, return_full_text: false, streamer });
    const first = result[0];
    const generated = first && !Array.isArray(first) ? first.generated_text : undefined;
    const output = typeof generated === 'string' ? generated : Array.isArray(generated) ? generated.at(-1)?.content : undefined;
    if (typeof output !== 'string' || !output.trim()) throw new Error('The model returned an empty response.');
    self.postMessage({ type: 'result', output: output.trim() });
  } catch (error) {
    self.postMessage({ type: event.data.type === 'restore' ? 'not-cached' : 'error', operation: event.data.type, message: error instanceof Error ? error.message : 'Local model failed.' });
  }
};
