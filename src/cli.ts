#!/usr/bin/env bun
/**
 * fable-safe — CLI interface
 *
 * Reads a prompt from argv or stdin, prints the Fable-safe rewrite to stdout
 * (so it stays pipe-friendly). Flags:
 *   -e, --explain   print the change summary to stderr
 *   -c, --copy      copy the rewritten prompt to the system clipboard
 *   -h, --help      show usage
 */

import { spawnSync } from "node:child_process";
import { rewriteWithChanges, summarizeChanges } from "./index.js";

const HELP = `fable-safe — Surgical prompt re-writer for Claude Fable 5

Usage:
  fable-safe [options] "your prompt here"
  echo "your prompt" | fable-safe [options]

Options:
  -e, --explain   Print a summary of every substitution to stderr.
  -c, --copy      Copy the rewritten prompt to the system clipboard.
  -h, --help      Show this help.

The rewritten prompt is always printed to stdout, so it composes with pipes.`;

function copyToClipboard(text: string): boolean {
  // Try platform clipboard commands in order; first that exists wins.
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

  if (has("-h", "--help")) {
    console.log(HELP);
    return;
  }

  let prompt: string;
  if (positional.length > 0) {
    prompt = positional.join(" ");
  } else if (!process.stdin.isTTY) {
    prompt = await readStdin();
  } else {
    console.log(HELP);
    return;
  }

  const { prompt: rewritten, changes } = rewriteWithChanges(prompt);
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
