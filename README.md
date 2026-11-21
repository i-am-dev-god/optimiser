# optimiser

A local, deterministic prompt-refinement tool. Paste a prompt, choose a target model and response depth, and inspect the suggested rewrite, token counts, changes, and verification checks before copying it. Processing runs in the browser; the app does not send prompts to a server or an AI model.

## Run locally

Requires Node.js 20.19+ or 22.12+ (Vite 8).

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. `npm test` runs the engine suite; `npm run build` type-checks and builds the production site; `npm run preview` serves that build.

## How it works

The pipeline recognizes and seals selected fragile spans, scans the remaining text for intent, depth and risk signals, applies conservative cleanup steps, routes a strategy, and verifies candidates against structural and preservation checks. Failed candidates fall back to less intrusive alternatives, including the original text. Cleanup steps that increase the selected encoder's token count are rejected. The X-Ray shows the decisions and checks; the diff is provided for manual review.

Token counts are calculated on the prompt text with the indicated BPE encoder, not API message framing or the model response. The OpenAI model selections use their matching encoder; other selections use a clearly labeled proxy and are not exact counts for those models. Prices are dated assumptions in `src/engine/pricing.ts`, not live quotes. A directive's break-even figure is the output-token reduction needed to offset its standalone input-token cost under those assumptions; it is not a prediction of actual savings, and context-sensitive tokenization can change the marginal cost.

## Limits and responsible use

Detection, routing and preservation checks use rules and fixed policy parameters, not an understanding of every possible prompt. They cannot guarantee semantic equivalence, detect every constraint, predict output quality or savings, or adapt perfectly to outliers. Carefully compare the result with the original, especially for code, legal, medical, financial or other consequential work. No model output or retry behavior is measured. Prices, model specifications and tokenizer support must be maintained as providers change them.
