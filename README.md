# Optimiser

A client-side prompt workbench. Text cleanup runs automatically. Optional AI rewriting uses Qwen2.5 0.5B Instruct q4 with Transformers.js and ONNX Runtime WASM in a dedicated worker. No account, API key, inference server, or user database is required.

## AI setup and privacy

Click **Enable** to fetch the pinned model from Hugging Face; the q4 ONNX file alone is listed as 786 MB, plus tokenizer, runtime and other files. Progress is the current file's byte progress, not an invented overall percentage. Only after the worker has loaded the model does **Rewrite** become available. Inference occurs on-device; prompts are not sent to the model host. The hosting site, runtime files and model weights are network downloads, and the model host can observe downloads and IP addresses.

Transformers.js uses the browser Cache API, not a guaranteed permanent IndexedDB download. On a later visit the worker tries to initialize using cached files only. Storage may be denied, cleared, or evicted, initialization takes time and interrupted transfers may restart. Devices and browsers differ in WASM, memory and storage support; failure can be retried and does not prevent automatic cleanup. No fixed load time, file size for the complete download, or universal browser support is promised.

The production website uses a service worker to cache its static files, including model runtime assets as they are used. After the site, runtime and model are fully cached, they can work without a network connection; offline use depends on browser storage, prior successful caching and service-worker support. The browser extension bundles its runtime assets separately and maintains its own model cache.

AI output is checked for recognized protected spans, numbers, constraints and basic structure; these checks are heuristic and **cannot prove semantic equivalence or detect all missing information**. Rejected AI outputs leave the prior result unchanged. Review every result before copying, particularly in high-stakes contexts. Model quality and output-token savings are not guaranteed. The fixed generation cap can result in incomplete output; review closely. The original text is never overwritten.

## Local development

Requires Node.js 20.19+ or 22.12+.

```sh
npm ci --ignore-scripts
npm run dev
npm test
npm run build
```

`--ignore-scripts` avoids downloading native Node inference dependencies; this project runs inference in the browser. The tests cover deterministic logic and AI validation, not a real Qwen model run. Actual inference must be tested on a supported browser/device with enough storage and a network connection to the model host. The built website is static and deploys with the GitHub Pages workflow.

## Optional Chrome extension

`npm run build:extension` creates an unpacked Manifest V3 extension in `extension-dist/`. In Chrome open `chrome://extensions`, enable Developer mode and choose **Load unpacked**. Click its toolbar icon to open the side panel, or select text on a page and choose **Optimise selected text** from the context menu. It uses `contextMenus`, `sidePanel` and session storage permissions; the selected text is placed in the side panel only on explicit action. Model host permissions allow optional downloads. The extension does not modify site text, and is not guaranteed to work on every browser or restricted page. It is not published to an extension store; real-browser extension/model compatibility requires testing.

## Measurements

Token counts are for prompt text only using the named BPE encoder, not message framing or the Qwen model tokenizer. The original prompt is rejected if it exceeds the tokenizer limit rather than silently truncating. Cleanup and validation use rules and fixed parameters; they do not handle every outlier perfectly. No model quality or financial savings are predicted.
