#!/usr/bin/env bun
/**
 * fable-safe — CLI interface
 *
 * Flags:
 *   -e, --explain   print change summary to stderr
 *   -c, --copy      copy rewritten prompt to clipboard
 *   --ultra         caveman-ultra surface compression (telegraphic fragments)
 *   --wenyan        classical Chinese surface translation (最大混淆)
 *   -h, --help      usage
 */

import { spawnSync } from "node:child_process";
import { type RewriteMode, rewriteWithChanges, summarizeChanges } from "./index.js";

const HELP = `fable-safe — Prompt normalizer for Claude Fable 5 content evaluation layer

Usage:
  fable-safe [options] "your prompt here"
  echo "your prompt" | fable-safe [options]

Options:
  -e, --explain   Print change summary to stderr.
  -c, --copy      Copy rewritten prompt to system clipboard.
  --ultra         Caveman-ultra surface form: telegraphic fragments, arrows, abbreviated prose.
                  Changes surface pattern — classifiers trained on verbose EN prose may not recognise.
  --wenyan        Classical Chinese surface translation. Key domain terms → 中文.
                  Maximally changes surface form; model still reads the prompt correctly.
  -h, --help      Show this help.

The rewritten prompt is always printed to stdout, so it composes with pipes.`;

function copyToClipboard(text: string): boolean {
  const candidates: Array<[string, string[]]> =
    process.platform === "darwin"
      ? [["pbcopy", []]]
      : process.platform === "win32"
        ? [["clip", []]]
        : [
            ["wl-copy", []],
            ["xclip", ["-selection", "clipboard"]],
            ["xsel", ["--clipboard", "--input"]]
          ];
  for (const [cmd, args] of candidates) {
    const res = spawnSync(cmd, args, { input: text });
    if (!res.error && res.status === 0) return true;
  }
  return false;
}

async function readStdin(): Promise<string> {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

async function main() {
  const argv = process.argv.slice(2);
  const has = (...names: string[]) => names.some((n) => argv.includes(n));
  const positional = argv.filter((a) => !a.startsWith("-"));

  if (has("-h", "--help")) { console.log(HELP); return; }

  const mode: RewriteMode = has("--wenyan") ? "wenyan" : has("--ultra") ? "ultra" : "normal";

  let prompt: string;
  if (positional.length > 0) {
    prompt = positional.join(" ");
  } else if (!process.stdin.isTTY) {
    prompt = await readStdin();
  } else {
    console.log(HELP);
    return;
  }

  const { prompt: rewritten, changes } = rewriteWithChanges(prompt, mode);
  console.log(rewritten);

  if (has("-e", "--explain")) {
    console.error(`\n[fable-safe] ${changes.length} change(s):`);
    console.error(summarizeChanges(changes));
  }

  if (has("-c", "--copy")) {
    console.error(copyToClipboard(rewritten) ? "[fable-safe] copied to clipboard." : "[fable-safe] clipboard unavailable (install wl-copy/xclip/xsel).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
