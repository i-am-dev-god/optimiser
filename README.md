# optimiser

A browser prompt-refinement workbench with two explicitly separate modes:

- **Rule-based optimizer:** deterministic cleanup and checks; it does not call an AI model. The model selector changes token accounting assumptions, not the engine. The UI does not add optional response-shaping directives.
- **Browser AI rewrite:** calls the browser's built-in Prompt API language model, when available. It sends your prompt to that model on your device. The browser may need to download model files. Availability depends on browser version, device, configuration, and model support; the app reports unavailable rather than pretending inference occurred. The model used is determined by the browser, not the accounting selector.

To test AI: open the site in a compatible browser with the Prompt API enabled, paste a prompt, check the Browser AI status, and click **Rewrite with browser AI**. A result appears only after the model's `prompt()` call returns. Compare it against the original; a successful call or a changed output does not prove semantic accuracy. An unchanged result can also be a valid rewrite. Unsupported browsers can use the clearly labeled rules mode, but cannot run AI through this feature.

## Run locally

Requires Node.js 20.19+ or 22.12+ (Vite 8).

```sh
npm ci
npm run dev
```

`npm test` runs the engine and integration tests. The browser AI integration tests use a mock; they do not verify real model availability, quality, or inference. `npm run build` type-checks and builds the production site. GitHub Actions builds and deploys to Pages when configured for GitHub Actions.

## Accuracy and limits

Rule-based processing uses a vault, heuristic scanning and reversible transforms with verification checks and fallbacks. It cannot guarantee semantic equivalence, recognize every constraint, or adapt perfectly to outliers. AI rewriting is also fallible and is not covered by those rule-based checks. Always compare the output to the original, especially for consequential work.

Token counts use the named BPE encoder on prompt text only, excluding message framing and model responses. OpenAI selections use matching encoders; other models use clearly labeled proxies. Inputs over 200,000 characters are rejected rather than silently truncated. Prices in `src/engine/pricing.ts` are dated assumptions, not live quotes. Break-even numbers are conditional arithmetic, not predicted savings; context-sensitive tokenization can change marginal cost. AI inference cost or savings are not measured.
