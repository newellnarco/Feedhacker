// FeedHacker — shared ambient types. The extension keeps its no-bundler, global
// (UMD/IIFE) loading model; these declarations give the TypeScript sources real
// types across files without introducing an import graph. Data shapes are typed
// for documentation and safety; the cross-module registry is intentionally
// permissive (index signature) so the loose loading model still type-checks.

// Chrome extension + CommonJS ambients (kept `any` to avoid @types churn).
declare const chrome: any;
declare var module: any;

// Let modules attach/read `self.FeedHackerX` in both window and worker contexts.
interface Window { [key: string]: any; }
interface WorkerGlobalScope { [key: string]: any; }

// The DOM layer works against generic elements from querySelectorAll and reads
// .dataset/.value/.checked/.files without narrowing to a specific element type
// (LinkedIn's classes are hashed, so we can't). Broaden these so that access is
// `any` rather than requiring a cast at every call site.
interface Element { [key: string]: any; }
interface HTMLElement { [key: string]: any; }
interface EventTarget { [key: string]: any; }

// --- data shapes ---
interface FhFilterDef { id: string; key: string; label: string; defaultMute: boolean; }

interface FhFlag { id?: string; label: string; detail?: string; features?: FhFeatures; }

interface FhFeatures { [feature: string]: any; _hits?: FhHitDetail[]; }

interface FhWeights { bias: number; [feature: string]: number; }

interface FhHitDetail { id: string; text: string; category?: string; aggressive?: boolean; }

interface FhMatcher { id: string; aggressive: boolean; category: string; re: RegExp; minCount?: number; reCount?: RegExp | null; }

interface FhClassification { isSlop: boolean; prob: number; features: FhFeatures; contributions: any[]; detail: string; }

interface FhAuthorInfo { name: string; url: string; }

interface FhAuthorScore { hidden: number; shown: number; name?: string; }
interface FhAuthorStore {
  muted: { [key: string]: any };
  allowed: { [key: string]: any };
  scores: { [key: string]: FhAuthorScore };
}

interface FhCustomLists { words?: string[]; regexes?: string[]; hashtags?: string[]; companies?: string[]; }
interface FhCompiledCustom {
  wordRe: RegExp | null;
  regexList: Array<{ src: string; re: RegExp }>;
  hashtagRe: RegExp | null;
  companies: string[];
  words: string[];
  tags: string[];
}
interface FhCustomFlag { type: string; value: string; }

interface FhLogEntry { ts: number; iso: string; context: string; msg: string; source: string; }

// Settings passed through the DOM layer. Known keys are typed; callbacks + the
// long tail of per-filter mute*/solo* booleans use the index signature.
interface FhSettings {
  enabled?: boolean;
  nameNames?: boolean;
  hideCompletely?: boolean;
  hideSlopComments?: boolean;
  digest?: boolean;
  slopThreshold?: number;
  slopWeights?: FhWeights | null;
  implicitLearning?: boolean;
  scanEverywhere?: boolean;
  authors?: FhAuthorStore;
  authorMutesActive?: boolean;
  customCompiled?: FhCompiledCustom | null;
  customActive?: boolean;
  onFeedback?: (features: FhFeatures, label: number, lr?: number) => void;
  onMuteAuthor?: (info: FhAuthorInfo) => void;
  onAuthorOutcome?: (info: FhAuthorInfo, hidden: boolean) => void;
  onHidden?: (flags: FhFlag[]) => void;
  [key: string]: any;
}

// The shared global registry each UMD module attaches to. Permissive by design.
interface FeedHackerGlobals {
  FeedHackerFilters?: any;
  FeedHackerLog?: any;
  FeedHackerSelectors?: any;
  FeedHackerMatcher?: any;
  FeedHackerScorer?: any;
  FeedHackerAuthors?: any;
  FeedHackerCustom?: any;
  FeedHackerFeed?: any;
  [key: string]: any;
}
