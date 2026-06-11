/**
 * fable-safe — user configuration
 *
 * Config dir: $XDG_CONFIG_HOME/fable-safe  (default: ~/.config/fable-safe/)
 *   rules.json  — custom keyword rules and trigger swaps
 *   auto        — empty flag file; existence = auto-rewrite ON for ALL prompts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ── Paths ─────────────────────────────────────────────────────────────────

function configDir(): string {
  // Windows: use %APPDATA% (Roaming); Unix: XDG_CONFIG_HOME or ~/.config
  if (process.platform === "win32")
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "fable-safe");
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "fable-safe");
}

export function configPath(file: string): string {
  return join(configDir(), file);
}

function ensureDir(): void {
  mkdirSync(configDir(), { recursive: true });
}

export function autoFlagPath(): string { return configPath("auto"); }
export function rulesFilePath(): string { return configPath("rules.json"); }

// ── Auto-mode toggle ──────────────────────────────────────────────────────

/** Returns true when the global auto-rewrite flag is set. */
export function isAutoMode(): boolean {
  return existsSync(autoFlagPath());
}

export function setAutoMode(on: boolean): void {
  if (on) {
    ensureDir();
    writeFileSync(autoFlagPath(), "", "utf-8");
  } else if (existsSync(autoFlagPath())) {
    unlinkSync(autoFlagPath());
  }
}

/** Toggle auto-mode. Returns the new state. */
export function toggleAutoMode(): boolean {
  const next = !isAutoMode();
  setAutoMode(next);
  return next;
}

// ── User rules (raw JSON shape — engine types stay in index.ts) ───────────

export interface StoredKeyword {
  word: string;
  rep: string;
}

export interface StoredSwap {
  /** RegExp source string — flags applied separately. */
  pattern: string;
  flags?: string;
  replacement: string;
}

export interface UserRules {
  keywords?: StoredKeyword[];
  swaps?: StoredSwap[];
  defaultMode?: "normal" | "ultra" | "wenyan";
}

export function loadUserRules(): UserRules {
  const p = rulesFilePath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as UserRules;
  } catch {
    return {};
  }
}

export function saveUserRules(rules: UserRules): void {
  ensureDir();
  writeFileSync(rulesFilePath(), JSON.stringify(rules, null, 2) + "\n", "utf-8");
}

/** Add or update a keyword rule. Deduplicates by word. */
export function addKeywordRule(word: string, rep: string): void {
  const rules = loadUserRules();
  rules.keywords = rules.keywords ?? [];
  const idx = rules.keywords.findIndex((k) => k.word === word);
  if (idx >= 0) rules.keywords[idx].rep = rep;
  else rules.keywords.push({ word, rep });
  saveUserRules(rules);
}

/** Remove a keyword rule by word. Returns true if it existed. */
export function removeKeywordRule(word: string): boolean {
  const rules = loadUserRules();
  const before = (rules.keywords ?? []).length;
  rules.keywords = (rules.keywords ?? []).filter((k) => k.word !== word);
  if (rules.keywords.length !== before) { saveUserRules(rules); return true; }
  return false;
}
