/**
 * fable-safe — public library entry point.
 *
 * The rewrite engine lives in `hooks/fable-safe-rules.ts` so a single
 * dependency-free copy can be deployed next to the OMP hook.
 * This module re-exports it and provides the user-config compiler.
 */

export type {
  SwapRule,
  KeywordRule,
  Change,
  ChangeKind,
  RewriteResult,
  RewriteMode,
  RewriteOptions
} from "../hooks/fable-safe-rules.js";

export {
  triggerSwaps,
  keywordReplacements,
  reasoningDeletions,
  wenyanMap,
  rewritePrompt,
  rewriteWithChanges,
  summarizeChanges,
  ultraCompress,
  wenyanRewrite
} from "../hooks/fable-safe-rules.js";

// ── User-config compiler ──────────────────────────────────────────────────
// Converts the raw JSON UserRules from config.ts into live engine objects.

import type { KeywordRule, SwapRule } from "../hooks/fable-safe-rules.js";
import type { UserRules } from "./config.js";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Compile stored JSON rules into KeywordRule / SwapRule arrays the engine consumes. */
export function compileUserRules(rules: UserRules): {
  extraKeywords: KeywordRule[];
  extraSwaps: SwapRule[];
} {
  const extraKeywords: KeywordRule[] = (rules.keywords ?? []).map((k) => ({
    word: new RegExp(`\\b${escapeRegex(k.word)}\\b`, "gi"),
    rep: k.rep
  }));
  const extraSwaps: SwapRule[] = (rules.swaps ?? []).map((s) => ({
    pattern: new RegExp(s.pattern, s.flags ?? "i"),
    replacement: s.replacement
  }));
  return { extraKeywords, extraSwaps };
}

export type { UserRules, StoredKeyword, StoredSwap } from "./config.js";
export {
  isAutoMode,
  setAutoMode,
  toggleAutoMode,
  loadUserRules,
  saveUserRules,
  addKeywordRule,
  removeKeywordRule,
  autoFlagPath,
  rulesFilePath
} from "./config.js";
