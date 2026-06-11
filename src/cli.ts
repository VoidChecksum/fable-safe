#!/usr/bin/env bun
/**
 * fable-safe - CLI interface
 */

import { rewritePrompt } from "./index.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    const prompt = args.join(" ");
    console.log(rewritePrompt(prompt));
    return;
  }

  // Check if stdin is a TTY. If it isn't, read from stdin.
  if (!process.stdin.isTTY) {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
    }
    console.log(rewritePrompt(input));
    return;
  }

  // Interactive help
  console.log("fable-safe - Surgical prompt re-writer for Claude Fable 5");
  console.log("\nUsage:");
  console.log("  fable-safe \"your prompt here\"");
  console.log("  echo \"your prompt\" | fable-safe");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
