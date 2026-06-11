/**
 * fable-safe — public library entry point.
 *
 * The rewrite engine lives in `hooks/fable-safe-rules.ts` so a single,
 * dependency-free copy can be deployed next to the OMP hook. This module
 * re-exports it as the package's public API.
 */

export type {
  SwapRule,
  KeywordRule,
  Change,
  ChangeKind,
  RewriteResult
} from "../hooks/fable-safe-rules.js";

export {
  triggerSwaps,
  keywordReplacements,
  reasoningDeletions,
  rewritePrompt,
  rewriteWithChanges,
  summarizeChanges
} from "../hooks/fable-safe-rules.js";
