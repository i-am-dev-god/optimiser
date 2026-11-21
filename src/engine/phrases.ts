/**
 * Curated phrase libraries.
 *
 * Every pattern here is hand-written and finite. Nothing is inferred
 * statistically, so behaviour is reproducible and auditable: if a phrase is
 * not in this file, the engine will not touch it.
 */

/** Openers that are pure conversational scaffolding, anchored at text start. */
/**
 * Frames that wrap a request in politeness. Each one is only usable when what
 * follows is itself an instruction — see `stripPreamble`.
 *
 * Frames that turn a noun phrase into a fragment ("I need a dashboard…",
 * "I have a question about…") are deliberately absent. Removing them cannot
 * produce a command, so they are never worth attempting.
 */
export const PREAMBLE_FRAMES: readonly RegExp[] = [
  /^(?:could|can|would|will)\s+you\s+(?:please\s+)?(?:help\s+me\s+)?(?:to\s+)?(?:with\s+)?/i,
  /^(?:please\s+)?help\s+me\s+(?:out\s+)?(?:with\s+|to\s+)?/i,
  /^i\s+(?:really\s+)?(?:just\s+)?(?:need|want)\s+(?:your\s+)?(?:some\s+)?help\s+(?:with|to|on|in|for)\s+/i,
  /^i\s+(?:really\s+)?need\s+you\s+to\s+/i,
  /^i\s+was\s+(?:just\s+)?wondering\s+(?:if\s+you\s+(?:could|can|would|might)\s+)?(?:you\s+)?(?:could\s+)?/i,
  /^i\s+(?:am|'m)\s+(?:currently\s+)?(?:trying|hoping|attempting)\s+to\s+/i,
  /^here(?:'s|\s+is)\s+(?:my|the|a)\s+(?:question|prompt|request|task)\s*[:.-]\s*/i,
  /^please\s+(?=(?:write|fix|create|build|explain|debug|make|generate|refactor|review|analyse|analyze|convert|summarise|summarize|optimi[sz]e|design|draft|describe|list|give|refactor)\b)/i,
];

/** Greetings and gratitude openers, stripped before frame matching. */
/**
 * Greetings, including a following vocative ("Hey ChatGPT", "Hi Claude").
 * The separator requirement is what keeps "Hello world in Python" from losing
 * its first word.
 */
export const GREETINGS: readonly RegExp[] = [
  /^(?:hi|hello|hey|heya|yo|howdy|greetings|good\s+(?:morning|afternoon|evening))\b(?:[\s,]+(?:chatgpt|claude|gemini|copilot|assistant|bot|there|team|folks|all))?\s*[,!.:;-]+\s*/i,
  /^(?:thanks|thank\s+you|thx|ty)(?:\s+(?:so\s+much|a\s+lot|in\s+advance))?\s*[,!.]\s*/i,
];

/**
 * Sentences that are entirely filler. These are removed whole, not clause by
 * clause, because a partially stripped filler sentence is the worst of both
 * worlds: it keeps the words and loses the point.
 */
export const PURE_FILLER_SENTENCES: readonly RegExp[] = [
  /^i\s+(?:was|am|'m)\s+(?:just\s+)?(?:hoping|wondering)\b[^.!?]*$/i,
  /^i\s+hoped\s+you\s+(?:could|can|would|might)\b[^.!?]*$/i,
  /^i\s+(?:need|want)\s+(?:some\s+|a\s+little\s+|your\s+)?help\s+(?:with\s+)?(?:something|this|it)?$/i,
  /^i\s+(?:really\s+)?(?:need|want)\s+your\s+(?:help|input|advice)$/i,
  /^(?:thanks|thank\s+you)(?:\s+(?:so\s+much|a\s+lot|in\s+advance|again))?$/i,
  /^(?:i\s+)?(?:really\s+)?(?:would\s+|'d\s+)?appreciate\s+(?:it|any\s+help|your\s+help)$/i,
  /^(?:hope\s+(?:this|that|you)\b[^.!?]*)$/i,
  /^(?:sorry\s+(?:to\s+bother|for\s+the\s+trouble)\b[^.!?]*)$/i,
  /^(?:let\s+me\s+know\s+if\s+you\s+need\b[^.!?]*)$/i,
  /^(?:this\s+is\s+(?:a|my)\s+(?:quick\s+)?question)$/i,
];

/** Openers that are filler but carry a request after them. */
export const FILLER_OPENERS: readonly RegExp[] = [
  /^(?:ok(?:ay)?[,.]?\s+)?so\s+/i,
  /^(?:quick\s+question|question)\s*[:.-]\s*/i,
  /^(?:first(?:ly)?|to\s+start)[,:]?\s+/i,
];

/**
 * Closers that may be removed, but ONLY when they terminate the text with
 * nothing but whitespace/punctuation after them. A `,` followed by another
 * clause means the phrase is doing real work and must be preserved.
 */
export const POSTAMBLE_TAIL: readonly RegExp[] = [
  /[\s,;.]*(?:thanks|thank\s+you|thx|ty)(?:\s+(?:so\s+much|a\s+lot|very\s+much))?(?:\s+(?:in\s+advance|again))?[\s!.]*$/i,
  /[\s,;.]*(?:any|your)\s+(?:help|input|guidance|advice)\s+(?:(?:would|will)\s+be\s+)?(?:greatly\s+)?appreciated[\s!.]*$/i,
  /[\s,;.]*i(?:'d|\s+would)\s+(?:really\s+)?appreciate\s+(?:any|your)\s+(?:help|input|guidance)[\s!.]*$/i,
  /[\s,;.]*(?:hoping|hope)\s+(?:that\s+)?(?:you\s+can\s+help|this\s+makes\s+sense)[\s!.]*$/i,
  /[\s,;.]*(?:looking\s+forward\s+to|awaiting)\s+(?:your\s+)?(?:response|reply|answer)[\s!.]*$/i,
  // "Thanks in advance, I really appreciate it!" — a sign-off is often two
  // clauses. Both halves must be recognised, or the strip leaves one dangling.
  /[\s,;.]*(?:i|we)\s+(?:really\s+|very\s+much\s+)?appreciate\s+(?:it|this|that|any\s+help|your\s+help)[\s!.]*$/i,
  /[\s,;.]*(?:much|greatly)\s+appreciated[\s!.]*$/i,
  /[\s,;.]*(?:cheers|ta|regards|best|kind\s+regards)[\s!.]*$/i,
];

/**
 * Gerund -> imperative. Only entries whose imperative form is unambiguous.
 * Anything absent is deliberately left alone rather than guessed at.
 */
export const GERUND_TO_IMPERATIVE: Readonly<Record<string, string>> = {
  debugging: 'Debug',
  writing: 'Write',
  building: 'Build',
  fixing: 'Fix',
  explaining: 'Explain',
  creating: 'Create',
  making: 'Make',
  generating: 'Generate',
  refactoring: 'Refactor',
  reviewing: 'Review',
  optimising: 'Optimise',
  optimizing: 'Optimize',
  converting: 'Convert',
  summarising: 'Summarise',
  summarizing: 'Summarize',
  designing: 'Design',
  drafting: 'Draft',
  describing: 'Describe',
  listing: 'List',
  analysing: 'Analyse',
  analyzing: 'Analyze',
  implementing: 'Implement',
  configuring: 'Configure',
  installing: 'Install',
  migrating: 'Migrate',
  testing: 'Test',
  validating: 'Validate',
  parsing: 'Parse',
  extracting: 'Extract',
  formatting: 'Format',
  translating: 'Translate',
  understanding: 'Explain',
  learning: 'Explain',
  calculating: 'Calculate',
  estimating: 'Estimate',
  improving: 'Improve',
  reducing: 'Reduce',
  setting: 'Set',
  adding: 'Add',
  removing: 'Remove',
  deleting: 'Delete',
  updating: 'Update',
  upgrading: 'Upgrade',
  deploying: 'Deploy',
  documenting: 'Document',
  structuring: 'Structure',
  organising: 'Organise',
  organizing: 'Organize',
  rewriting: 'Rewrite',
  proofreading: 'Proofread',
  editing: 'Edit',
  improving_performance: 'Improve performance',
  troubleshooting: 'Troubleshoot',
  investigating: 'Investigate',
  checking: 'Check',
  comparing: 'Compare',
  searching: 'Search',
  finding: 'Find',
  solving: 'Solve',
  getting: 'Get',
  starting: 'Start',
  running: 'Run',
  using: 'Use',
  applying: 'Apply',
  pushing: 'Push',
  pulling: 'Pull',
  merging: 'Merge',
  committing: 'Commit',
  handling: 'Handle',
  managing: 'Manage',
  scaling: 'Scale',
  securing: 'Secure',
  caching: 'Cache',
  loading: 'Load',
  rendering: 'Render',
  streaming: 'Stream',
  batching: 'Batch',
  scheduling: 'Schedule',
  monitoring: 'Monitor',
  logging: 'Log',
  tracking: 'Track',
  measuring: 'Measure',
  computing: 'Compute',
  simplifying: 'Simplify',
  cleaning: 'Clean',
  tidying: 'Tidy',
  restructuring: 'Restructure',
  modularising: 'Modularise',
  modularizing: 'Modularize',
};

/** Verbs that can legitimately start an imperative clause. */
export const IMPERATIVE_VERBS: readonly string[] = [
  'add', 'analyse', 'analyze', 'answer', 'apply', 'audit', 'batch', 'build',
  'calculate', 'change', 'check', 'clean', 'code', 'combine', 'commit',
  'compare', 'compile', 'complete', 'compress', 'compute', 'configure',
  'connect', 'consider', 'convert', 'create', 'debug', 'decide', 'define',
  'delete', 'deploy', 'describe', 'design', 'detect', 'determine', 'develop',
  'display', 'document', 'draft', 'drop', 'edit', 'evaluate', 'examine',
  'explain', 'export', 'extract', 'fetch', 'figure', 'fill', 'filter', 'find',
  'fix', 'flag', 'format', 'generate', 'get', 'give', 'group', 'handle',
  'help', 'identify', 'implement', 'import', 'improve', 'include', 'install',
  'integrate', 'investigate', 'keep', 'learn', 'let', 'list', 'load', 'log',
  'look', 'make', 'manage', 'map', 'measure', 'merge', 'migrate', 'minimise',
  'minimize', 'modify', 'monitor', 'move', 'name', 'normalise', 'normalize',
  'note', 'optimi', 'optimi[sz]e', 'order', 'organize', 'organise', 'output',
  'parse', 'pick', 'plan', 'point', 'populate', 'predict', 'prepare',
  'present', 'print', 'produce', 'profile', 'proofread', 'provide', 'publish',
  'pull', 'push', 'put', 'read', 'recommend', 'reduce', 'refactor', 'refactor',
  'remove', 'rename', 'render', 'replace', 'reply', 'report', 'request',
  'require', 'reset', 'resolve', 'respond', 'restore', 'restructure', 'retry',
  'return', 'review', 'rewrite', 'run', 'save', 'scale', 'schedule',
  'search', 'secure', 'select', 'send', 'set', 'show', 'simplify', 'skip',
  'solve', 'sort', 'specify', 'split', 'start', 'stop', 'store', 'stream',
  'structure', 'summarise', 'summarize', 'switch', 'sync', 'tell', 'test',
  'think', 'throw', 'tidy', 'track', 'transform', 'translate',
  'troubleshoot', 'try', 'turn', 'understand', 'update', 'upgrade', 'use',
  'validate', 'verify', 'view', 'walk', 'write',
  // Natural request verbs: stripping "help me" off these would destroy the ask.
  'help', 'tell', 'show', 'give', 'find', 'list', 'name', 'suggest', 'recommend',
  'sanity', 'sanity-check', 'double-check', 'point', 'remind', 'summarise',
];

/** Words that make the following clause a hard constraint. */
export const NEGATIVE_CUES: readonly RegExp[] = [
  /\b(?:don'?t|do\s+not|doesn'?t|does\s+not|didn'?t|must\s+not|mustn'?t|should\s+not|shouldn'?t|cannot|can'?t|never)\b/i,
  /\bwithout\b/i,
  /\bavoid(?:ing)?\b/i,
  /\bno\s+(?:external|third[- ]party|extra|additional|new|unnecessary|nested|global|magic)\b/i,
  /\bonly\s+(?:use|using|support|run|show|return|output)\b/i,
  /\binstead\s+of\b/i,
  /\bexcept\b/i,
  /\bexclude\b/i,
  /\bomit\b/i,
];

/** Words that make a clause a positive requirement worth surfacing. */
export const REQUIREMENT_CUES: readonly RegExp[] = [
  /\bmust\b/i,
  /\brequired?\b/i,
  /\bensure\b/i,
  /\bmake\s+sure\b/i,
  /\bat\s+least\b/i,
  /\bat\s+most\b/i,
  /\bno\s+more\s+than\b/i,
  /\bunder\s+\d/i,
  /\bwithin\b/i,
  /\bexactly\b/i,
  /\bstrictly\b/i,
  /\bcompatible\s+with\b/i,
  /\bhas\s+to\b/i,
];

/** Conversational filler that carries no request content, mid-sentence. */
export const FILLER_PHRASES: readonly RegExp[] = [
  /\bi\s+(?:really\s+)?(?:just\s+)?(?:kindly\s+)?(?:wanted|want)\s+to\s+ask\s+(?:you\s+)?(?:if\s+)?/gi,
  /\bif\s+(?:that['’]?s|it['’]?s)\s+(?:ok(?:ay)?|possible|fine)\b,?\s*/gi,
  /\bwhen\s+you\s+(?:get\s+a\s+chance|have\s+a\s+minute|have\s+time)\b,?\s*/gi,
  /\bif\s+you\s+(?:don['’]?t\s+mind|wouldn['’]?t\s+mind)\b,?\s*/gi,
  /\bas\s+(?:you\s+)?(?:can\s+see|mentioned)\b,?\s*/gi,
  /\bi\s+(?:would|'d)\s+(?:really\s+)?like\s+(?:you\s+)?to\s+/gi,
  /\bso\s+basically\b,?\s*/gi,
  /\bbasically\b,?\s*/gi,
  /\bjust\s+(?=(?:a|an|the|some)\b)/gi,
  // Sentence-initial politeness is handled by the frame rules, which can reason
  // about the grammar of what follows. Removing it here as well would strip
  // "Please fix" down to "fix" while leaving "please help me" half-edited.
  /(?<=[.!?]\s)please\b\s*/gi,
];

/** Signals used by the scanner. All hand-tuned, finite, inspectable. */
export const INTENT_SIGNALS: Readonly<Record<string, readonly RegExp[]>> = {
  CODE_GEN: [
    /\b(?:write|create|build|implement|generate|add|make)\b[^.!?]{0,40}\b(?:function|class|component|script|module|endpoint|api|query|snippet|program|app|hook|method|handler|dockerfile|migration|test|dashboard|page|form|ui|layout|table|chart|widget|cli|server|database|schema|index|parser)\b/i,
    /\b(?:code|snippet|boilerplate)\s+(?:for|that|to)\b/i,
    // "Respond with the refactored code" is a code request stated as a reply
    // shape. Without this the prompt reads as an explanation request, and the
    // router then attaches an explanation directive to a coding task.
    /\b(?:respond|reply|answer|return|give\s+me|show\s+me)\s+(?:with|in|only)\b[^.!?]{0,40}\b(?:code|snippet|implementation|refactor)\w*\b/i,
    /\brefactor\w*\b[^.!?]{0,40}\b(?:code|function|class|component|module|query|layer|implementation|endpoint|handler)\b/i,
    /\bin\s+(?:python|javascript|typescript|react|rust|go|java|c\+\+|c#|sql|bash|php|swift|kotlin|ruby|vue|svelte|node|deno)\b/i,
    /```/,
  ],
  DEBUG_FIX: [
    /\b(?:error|exception|traceback|stack\s?trace|bug|crash(?:es|ing)?|fails?|failing|failed|broken|not\s+working|doesn'?t\s+work|undefined\s+is\s+not|typeerror|referenceerror|nullpointer|segfault|panic|runs?\s+twice|duplicat(?:e|es|ed|ing)|leak(?:s|ing)?|hangs?|stuck|throws?)\b/i,
    /\b(?:fix|debug|resolve|why\s+(?:is|does|doesn'?t|do)|what'?s\s+wrong)\b/i,
    /\b(?:expected|got|instead\s+got|returns?\s+nothing|returns?\s+null)\b/i,
  ],
  EXPLAIN_LEARN: [
    /\b(?:explain|why|how\s+does|how\s+do|how\s+come|what\s+(?:is|are|does)|difference\s+between|compare|teach|understand|walk\s+me\s+through|concept|internals|under\s+the\s+hood)\b/i,
    /\b(?:in\s+detail|from\s+first\s+principles|deep\s+dive|tradeoffs?|architecture)\b/i,
  ],
  DATA_TRANSFORM: [
    /\b(?:convert|transform|parse|extract|format|normalis|normaliz|serialis|serializ|map|flatten|dedupe|clean)\b[^.!?]{0,40}\b(?:json|csv|xml|yaml|tsv|regex|data|array|object|string|list|table)\b/i,
    /\b(?:regex|regular\s+expression)\b/i,
    /\b(?:json|csv|yaml|xml)\s*(?:to|->|→|=>)\s*(?:json|csv|yaml|xml|array|object|table)\b/i,
  ],
  WRITING_STRATEGY: [
    /\b(?:write|draft|compose|rewrite|edit|proofread|summarise|summarize|paraphrase)\b[^.!?]{0,40}\b(?:email|essay|article|post|blog|copy|letter|report|resume|cv|cover\s+letter|pitch|plan|proposal|story|caption|tweet|thread|message|summary)\b/i,
    /\b(?:tone|voice|audience|persona|style)\b/i,
    /\b(?:marketing|sales|brand|seo)\s+(?:copy|email|page|post|strategy|plan|pitch|deck|funnel)\b/i,
  ],
  QUICK_FACT: [
    // Deliberately narrow: a question mark alone does not make a lookup. Asking
    // "why does X happen?" is analysis, not a fact, and treating it as one
    // would strip the depth the user asked for.
    /^\s*(?:what|who|when|where|which)\s+(?:is|are|was|were)\s+(?:the\s+)?[^,]{1,60}\?\s*$/i,
    /^\s*(?:how\s+many|how\s+much)\b[^.!?]{0,60}\?\s*$/i,
    /\b(?:capital\s+of|population\s+of|height\s+of|who\s+wrote|who\s+founded)\b/i,
  ],
};

export const DEPTH_DEEP_SIGNALS: readonly RegExp[] = [
  /\b(?:explain\s+(?:in\s+detail|thoroughly|deeply|fully)|in\s+detail|thorough(?:ly)?|comprehensive|deep\s+dive|step\s+by\s+step|from\s+first\s+principles)\b/i,
  /\b(?:why|how\s+does|how\s+do|how\s+come|what\s+are\s+the\s+tradeoffs?|architecture|internals|under\s+the\s+hood|design\s+decisions?|compare|contrast)\b/i,
  /\b(?:teach|educate|mentor|walk\s+me\s+through|explain\s+like)\b/i,
];

export const DEPTH_DIRECT_ONLY_SIGNALS: readonly RegExp[] = [
  /\b(?:just\s+(?:give|show|send|paste)|only\s+(?:the\s+)?(?:code|answer|output|result)|no\s+explanation|without\s+explanation|straight\s+to\s+the\s+point|tldr|tl;dr|answer\s+only|code\s+only|skip\s+the\s+explanation)\b/i,
];

export const BLOAT_SIGNALS: readonly RegExp[] = [
  /^(?:what|who|when|where|which)\b/i,
  /\b(?:explain|describe|why|how|teach|compare|walk\s+me\s+through|summarise|summarize)\b/i,
  /\b(?:essay|article|post|guide|tutorial|report|analysis)\b/i,
];

export const LEGALISH_SIGNALS: readonly RegExp[] = [
  /\b(?:legal|contract|terms\s+of\s+service|privacy\s+policy|gdpr|hipaa|compliance|liability|indemnif|statute|clause)\b/i,
  /\b(?:medical|dosage|diagnos|symptom|prescri)/i,
  /\b(?:financial\s+advice|investment|tax\s+advice|securities)\b/i,
];

/**
 * Struggle narration.
 *
 * Sentences in which the user reports their own effort describe the *author*,
 * not the problem: "I've been trying for a while and it's just not happening"
 * tells a model nothing it can act on. They are the single largest source of
 * avoidable tokens in real prompts.
 *
 * They are only removable under the guard in `rewrite.ts`: the sentence must
 * contain no number, no protected span, and no substantive word. A sentence
 * that merely *starts* like a struggle narrative but names the failing thing
 * ("I keep getting a 500 on /api/orders") is content, and is kept.
 */
export const STRUGGLE_NARRATION: readonly RegExp[] = [
  /\bi(?:'ve|\s+have)\s+been\s+(?:trying|struggling|stuck|battling|at\s+this|working\s+on\s+this)\b/i,
  /\bi(?:'ve|\s+have)\s+(?:already\s+)?tried\s+(?:a\s+)?(?:bunch|lot|ton|few|couple|several|many|everything|all)\b/i,
  /\bfor\s+(?:a|some|quite\s+a)\s+(?:while|time)\s+now\b/i,
  /\b(?:it|this|nothing)\s+(?:just\s+)?(?:isn'?t|is\s+not|won'?t|doesn'?t|didn'?t)\s+(?:seem\s+to\s+)?(?:work|working|happen|happening|help)\b/i,
  /\bnone\s+of\s+(?:them|these|those|it)\s+(?:seem(?:s)?\s+to\s+)?(?:work|help)/i,
  /\bi\s+(?:don'?t|do\s+not)\s+(?:really\s+)?(?:know|understand)\s+(?:what|why|how)\s+(?:i'?m|i\s+am)\s+doing\s+wrong\b/i,
];

/**
 * Words whose presence means a sentence carries information, whatever else it
 * looks like. Used as a veto, so a false positive here costs nothing but a
 * missed optimization, while a false negative would delete real content.
 */
export const SUBSTANCE_WORDS: readonly RegExp[] = [
  /\b(?:error|errors|exception|traceback|stack|bug|crash|fail|fails|failed|failure|warning|undefined|null|nan|timeout|denied|refused|invalid|corrupt)\b/i,
  /\b(?:api|endpoint|route|request|response|status|header|payload|schema|query|database|table|column|index|migration|cache|queue|worker|cron|socket|webhook)\b/i,
  /\b(?:function|method|class|component|module|package|library|import|export|interface|type|variable|state|props|hook|context|reducer|effect|closure|promise|async|await|callback|event|loop|array|object|string|number|boolean)\b/i,
  /\b(?:react|vue|angular|svelte|next|node|deno|bun|python|typescript|javascript|rust|golang|java|kotlin|swift|php|ruby|sql|postgres|mysql|redis|mongo|docker|kubernetes|nginx|aws|gcp|azure|vercel|supabase|firebase)\b/i,
  /\b(?:auth|oauth|jwt|session|cookie|token|login|password|permission|role|ssh|tls|ssl|cors|csrf|xss)\b/i,
  /\b(?:file|path|directory|config|environment|env|deploy|build|test|tests|ci|branch|commit|merge|version|dependency|dependencies)\b/i,
  /\b(?:must|should|require|requires|required|only|never|always|ensure|support|support(?:s|ed)?|compatible|backwards?)\b/i,
  /\b(?:[A-Za-z_]+\.[A-Za-z_]+\(|\w+\(\)|`[^`]+`|\/[\w./-]+)/,
];
