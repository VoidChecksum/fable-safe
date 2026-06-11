#!/usr/bin/env bun
/**
 * fable-safe — CLI
 *
 * Subcommands:
 *   (default)          Rewrite prompt from argv or stdin
 *   setup              Interactive setup wizard (Claude Code, Desktop, OpenCode, OMP)
 *   status             Show installation state + auto-mode
 *   auto [on|off]      Enable / disable / toggle auto-rewrite
 *   add-rule <w> <r>   Add a custom keyword rule
 *   remove-rule <w>    Remove a custom keyword rule
 *   list-rules         List all user-defined rules
 *
 * Flags (for default rewrite):
 *   --ultra            Caveman-ultra surface compression
 *   --wenyan           Classical Chinese surface translation
 *   -e, --explain      Print change summary to stderr
 *   -c, --copy         Copy result to system clipboard
 *   -h, --help         Show usage
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { spawnSync } from "node:child_process";
import type { RewriteMode } from "./index.js";
import {
  rewriteWithChanges,
  summarizeChanges,
  compileUserRules,
  isAutoMode,
  setAutoMode,
  toggleAutoMode,
  loadUserRules,
  addKeywordRule,
  removeKeywordRule,
  autoFlagPath,
  rulesFilePath
} from "./index.js";
import { runSetup } from "./setup.js";

// ── Constants ─────────────────────────────────────────────────────────────

const SUBCOMMANDS = new Set(["setup", "status", "auto", "add-rule", "remove-rule", "list-rules"]);

const HELP = `fable-safe — Prompt normalizer for Claude Fable 5's content evaluation layer

Usage:
  fable-safe [options] "your prompt here"
  echo "your prompt" | fable-safe [options]
  fable-safe <subcommand> [args]

Subcommands:
  setup              Interactive wizard — installs into Claude Code, Desktop, OpenCode, and OMP.
  status             Show auto-mode state, detected targets, and custom rule count.
  auto [on|off]      Toggle auto-rewrite for ALL prompts. No arg = toggle.
  add-rule <w> <r>   Add custom keyword rule: "w" → "r" (stored in rules.json).
  remove-rule <w>    Remove a custom keyword rule by word.
  list-rules         Print all user-defined rules.

Options (default rewrite mode):
  --ultra            Caveman-ultra: telegraphic fragments, abbreviations, → arrows.
  --wenyan           Classical Chinese surface translation (key terms → 中文).
  -e, --explain      Print a change summary to stderr.
  -c, --copy         Copy the rewritten prompt to the system clipboard.
  -h, --help         Show this help.

The rewritten prompt always goes to stdout — pipe-friendly.`;

// ── Clipboard ─────────────────────────────────────────────────────────────

function copyToClipboard(text: string): boolean {
  const candidates: Array<[string, string[]]> =
    process.platform === "darwin"
      ? [["pbcopy", []]]
      : process.platform === "win32"
        ? [["clip", []]]
        : [["wl-copy", []], ["xclip", ["-selection", "clipboard"]], ["xsel", ["--clipboard", "--input"]]];
  for (const [cmd, args] of candidates) {
    const res = spawnSync(cmd, args, { input: text });
    if (!res.error && res.status === 0) return true;
  }
  return false;
}

// ── Stdin reader ──────────────────────────────────────────────────────────

async function readStdin(): Promise<string> {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

// ── Status subcommand ─────────────────────────────────────────────────────

function cmdStatus(): void {
  const auto = isAutoMode();
  const rules = loadUserRules();
  const kwCount = (rules.keywords ?? []).length;
  const swapCount = (rules.swaps ?? []).length;

  // Target detection
  const has = (p: string) => existsSync(p);
  const home = homedir();
  const xdgCfg = process.env.XDG_CONFIG_HOME ?? join(home, ".config");

  const claudeCodeSettings = join(home, ".claude", "settings.json");
  const claudeCodeHook = join(home, ".claude", "hooks", "fable-safe-hook.ts");
  // claude mcp add -s user writes to ~/.claude.json; fallback writes there too
  const claudeCodeMcp = (() => {
    const check = (p: string, key: string) => {
      try { return "fable-safe" in ((JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>)[key] as object ?? {}); }
      catch { return false; }
    };
    return check(join(home, ".claude.json"), "mcpServers") || check(claudeCodeSettings, "mcpServers");
  })();
  const claudeCodeHookInstalled = has(claudeCodeHook);

  const desktopCfgPath =
    process.platform === "darwin"
      ? join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
      : process.platform === "win32"
        ? join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json")
        : join(xdgCfg, "Claude", "claude_desktop_config.json");
  const desktopMcp = (() => {
    try { return "fable-safe" in ((JSON.parse(readFileSync(desktopCfgPath, "utf-8")) as Record<string, unknown>).mcpServers as object ?? {}); }
    catch { return false; }
  })();

  const openCodeCfg =
    process.platform === "win32"
      ? join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "opencode", "opencode.json")
      : join(xdgCfg, "opencode", "opencode.json");
  const openCodeMcp = (() => {
    try { return "fable-safe" in ((JSON.parse(readFileSync(openCodeCfg, "utf-8")) as Record<string, unknown>).mcp as object ?? {}); }
    catch { return false; }
  })();

  const ompHook = has(join(home, ".agents", "hooks", "core", "fable-safe-hook.ts"));
  const ompSkill = has(join(home, ".agents", "skills", "oma-fable-safe-prompt", "SKILL.md"));
  const fsCmd = has(join(home, ".claude", "commands", "fs.md"));

  const tick = (v: boolean) => v ? "✓" : "○";

  console.log("\nfable-safe status");
  console.log("──────────────────────────────────────────");
  console.log(`auto-rewrite:  ${auto ? "🟢 ON" : "⚫ OFF"}`);
  console.log(`auto flag:     ${autoFlagPath()}`);
  console.log(`rules file:    ${rulesFilePath()}`);
  console.log(`custom rules:  ${kwCount} keyword(s), ${swapCount} phrase swap(s)`);
  console.log();
  console.log("  Claude Code CLI");
  console.log(`    hook (settings.json):  ${tick(claudeCodeHookInstalled)}`);
  console.log(`    MCP server:            ${tick(claudeCodeMcp)}`);
  console.log(`    /fs slash command:     ${tick(fsCmd)}`);
  console.log();
  console.log("  Claude Desktop");
  console.log(`    MCP server:            ${tick(desktopMcp)}`);
  console.log();
  console.log("  OpenCode");
  console.log(`    MCP server:            ${tick(openCodeMcp)}`);
  console.log();
  console.log("  OMP / oh-my-agent");
  console.log(`    hook (hooks/core):     ${tick(ompHook)}`);
  console.log(`    skill:                 ${tick(ompSkill)}`);
  console.log();
  console.log("  Run `fable-safe setup` to install missing components.");
  console.log();
}

// ── Auto subcommand ───────────────────────────────────────────────────────

function cmdAuto(arg?: string): void {
  let nowOn: boolean;
  if (arg === "on")       { setAutoMode(true);  nowOn = true; }
  else if (arg === "off") { setAutoMode(false); nowOn = false; }
  else                    { nowOn = toggleAutoMode(); }
  console.log(nowOn
    ? "🟢 fable-safe auto-rewrite: ON  — every prompt will be normalised"
    : "⚫ fable-safe auto-rewrite: OFF — only 'fs …' prefixed prompts");
}

// ── Rule management subcommands ───────────────────────────────────────────

function cmdAddRule(word: string, rep: string): void {
  addKeywordRule(word, rep);
  console.log(`✓ Added rule: "${word}" → "${rep}"`);
}

function cmdRemoveRule(word: string): void {
  const removed = removeKeywordRule(word);
  if (removed) console.log(`✓ Removed rule for "${word}"`);
  else console.error(`✗ No rule found for "${word}"`);
}

function cmdListRules(): void {
  const rules = loadUserRules();
  const kws = rules.keywords ?? [];
  const swaps = rules.swaps ?? [];
  if (kws.length === 0 && swaps.length === 0) {
    console.log("No user-defined rules. Use `fable-safe add-rule <word> <replacement>`.");
    return;
  }
  if (kws.length > 0) {
    console.log("\nKeyword rules:");
    for (const { word, rep } of kws) console.log(`  "${word}" → "${rep}"`);
  }
  if (swaps.length > 0) {
    console.log("\nPhrase swaps:");
    for (const { pattern, replacement } of swaps) console.log(`  /${pattern}/ → "${replacement}"`);
  }
  console.log();
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const has = (...names: string[]) => names.some((n) => argv.includes(n));

  if (has("-h", "--help")) { console.log(HELP); return; }

  // Subcommand dispatch
  const [first, ...rest] = argv.filter((a) => !a.startsWith("-"));
  if (first && SUBCOMMANDS.has(first)) {
    switch (first) {
      case "setup":       return runSetup();
      case "status":      return cmdStatus();
      case "auto":        return cmdAuto(rest[0]);
      case "add-rule":
        if (!rest[0] || !rest[1]) { console.error("Usage: fable-safe add-rule <word> <replacement>"); process.exit(1); }
        return cmdAddRule(rest[0], rest[1]);
      case "remove-rule":
        if (!rest[0]) { console.error("Usage: fable-safe remove-rule <word>"); process.exit(1); }
        return cmdRemoveRule(rest[0]);
      case "list-rules":  return cmdListRules();
    }
  }

  // Default: rewrite prompt
  const mode: RewriteMode = has("--wenyan") ? "wenyan" : has("--ultra") ? "ultra" : "normal";
  const positional = argv.filter((a) => !a.startsWith("-"));

  let prompt: string;
  if (positional.length > 0) {
    prompt = positional.join(" ");
  } else if (!process.stdin.isTTY) {
    prompt = await readStdin();
  } else {
    console.log(HELP);
    return;
  }

  // Load user config and compile into extra rules
  const userRules = loadUserRules();
  const { extraKeywords, extraSwaps } = compileUserRules(userRules);

  const { prompt: rewritten, changes } = rewriteWithChanges(prompt, { mode, extraKeywords, extraSwaps });
  console.log(rewritten);

  if (has("-e", "--explain")) {
    console.error(`\n[fable-safe] ${changes.length} change(s):`);
    console.error(summarizeChanges(changes));
  }

  if (has("-c", "--copy")) {
    console.error(copyToClipboard(rewritten)
      ? "[fable-safe] copied to clipboard."
      : "[fable-safe] clipboard unavailable (install wl-copy/xclip/xsel).");
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
