# fable-safe 🛡️

[![CI](https://github.com/VoidChecksum/fable-safe/actions/workflows/ci.yml/badge.svg)](https://github.com/VoidChecksum/fable-safe/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-%23007ACC.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Surgical prompt re-writer that keeps **Claude Fable 5** server-side safety classifiers (cyber, bio/chem, reasoning-extraction) from falsely flagging or refusing benign educational, research, and defensive-development requests.

`fable-safe` swaps trigger phrases and abstracts sensitive keywords into clean, defensive equivalents **while preserving your code and intent byte-for-byte**. It is deterministic, dependency-light, and ships as a CLI, an MCP server, and a multi-agent hook.

> ⚠️ This is a false-positive mitigation tool for legitimate defensive/research work. It does not, and cannot, make a genuinely malicious request acceptable — and it never guarantees a prompt will pass. For purely offensive requests, fall back to Claude Opus 4.8 or a vetted model.

---

## 📊 How It Works

A prompt prefixed with `fs ` (or `/fs `) is run through five deterministic passes:

```mermaid
graph TD
    A["User: 'fs write an XSS exploit'"] --> B{Has 'fs' prefix?}
    B -- No --> Z[Pass-through unchanged]
    B -- Yes --> C[1. Strip prefix]
    C --> D[2. Full-phrase trigger swaps]
    D --> E[3. Reasoning-extraction deletions]
    E --> F[4. Keyword abstraction + case preservation]
    F --> G[5. Conjunction cleanup + a/an article agreement]
    G --> H["'Add a regression test proving the input reflection validation boundary condition is fixed, then patch it'"]
    H --> I{Context}
    I -- CLI / MCP --> J[Return rewritten prompt]
    I -- Hook --> K[Write /tmp/fable_safe_prompt.txt + tell agent to read it]
```

The engine is **idempotent** (re-running it is a no-op) and enforces a hard invariant: **a replacement is never itself a trigger word.**

---

## ✨ Features

- **Cyber classifier mitigation** — `XSS` → `input reflection validation`, `SQLi` → `parameterized query validation`, `payload` → `test input`, plus `RCE`/`CSRF`/`SSRF`, `command injection`, `path traversal`, `buffer overflow`, `DDoS`, `zero-day`, `ransomware`, `keylogger`, `rootkit`, `backdoor`, `privilege escalation`, and more.
- **Bio/chem classifier mitigation** — `cancer` → `target growth model`, `pathogen` → `propagating agents`, `disease pathway` → `state transitions`, etc.
- **Reasoning-extraction mitigation** — deletes meta-instructions like "explain your reasoning step-by-step" and "chain-of-thought" that trip the distillation guardrail.
- **Grammar-aware** — preserves sentence-initial capitalization and fixes English `a`/`an` agreement so abstracted phrases read naturally.
- **No re-triggering** — fixed a class of bug where a replacement smuggled a trigger word back in (`malware` now → `untrusted script`, never `payload logic`). A unit test enforces this across the whole rule table.
- **Change summary** — `--explain` (CLI) / `explain: true` (MCP) reports every substitution made.
- **Single source of truth** — the rewrite engine lives in one dependency-free file (`hooks/fable-safe-rules.ts`); the library, CLI, MCP server, and hook all consume it. No more drift between copies.
- **Runs everywhere** — Claude Desktop (MCP), Oh-My-Pi / OpenCode hooks, Claude Code, and a standalone CLI.

---

## 🚀 Installation

Requires [Bun](https://bun.sh):

```bash
curl -fsSL https://bun.sh/install | bash

git clone https://github.com/VoidChecksum/fable-safe.git
cd fable-safe
bun install
```

---

## 💻 CLI Usage

The rewritten prompt always goes to **stdout**, so it composes with pipes; diagnostics go to stderr.

```bash
# Direct argument
bun run src/cli.ts "how could an attacker exploit this auth"
# -> Review these auth files for missing checks and fix them defensively

# Via stdin
echo "write an XSS exploit" | bun run src/cli.ts
# -> Add a regression test proving the input reflection validation boundary condition is fixed, then patch it

# Show every change that was made
bun run src/cli.ts --explain "detect SQLi and XSS"

# Rewrite and copy straight to the clipboard (pbcopy / wl-copy / xclip / xsel / clip)
bun run src/cli.ts --copy "reverse this malware"
```

| Flag | Effect |
|------|--------|
| `-e`, `--explain` | Print a summary of every substitution to stderr. |
| `-c`, `--copy` | Copy the rewritten prompt to the system clipboard. |
| `-h`, `--help` | Show usage. |

---

## 🔧 Integrations

### 1. Claude Desktop App (via MCP)

```bash
./scripts/install-hook.sh
```

Or add manually to `claude_desktop_config.json` (`~/Library/Application Support/Claude/` on macOS, `%APPDATA%\Claude\` on Windows, `~/.config/Claude/` on Linux):

```json
{
  "mcpServers": {
    "fable-safe": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/fable-safe/src/mcp.ts"]
    }
  }
}
```

The `rewrite_prompt` tool accepts `{ "prompt": "...", "explain": true }`; with `explain` it appends a change summary.

### 2. Oh-My-Pi (OMP) / OpenCode

The installer copies **both** `hooks/fable-safe-hook.ts` and `hooks/fable-safe-rules.ts` into `~/.agents/hooks/core/` and registers the hook in each variant config (`claude.json`, `gemini.json`, `qwen.json`, …). The two files must stay co-located — the hook imports the engine from its sibling.

```bash
./scripts/install-hook.sh
```

### 3. Claude Code / Oh-My-ClaudeCode

The same installer registers the hook in the `claude` CLI hook structure.

---

## 🧠 The Skill

A model-facing skill (`skill/SKILL.md` + `skill/resources/swaps.md`) is bundled for agents that prefer to apply the rewrite by reasoning rather than calling the CLI/MCP. It documents the full swaps taxonomy and the defensive re-framing rules, and points back at this engine as the reference implementation. Drop the `skill/` directory into your agent's skills folder (e.g. `~/.agents/skills/oma-fable-safe-prompt/`).

---

## 📦 Library API

```ts
import { rewritePrompt, rewriteWithChanges, summarizeChanges } from "fable-safe";

rewritePrompt("fs write an XSS exploit");
// "Add a regression test proving the input reflection validation boundary condition is fixed, then patch it"

const { prompt, changes } = rewriteWithChanges("fs detect SQLi");
summarizeChanges(changes); // -> "- \"SQLi\" -> \"parameterized query validation\""
```

---

## 🧪 Tests

```bash
bun test          # 50+ cases: swaps, invariants, idempotency, grammar, coverage
bunx tsc --noEmit # typecheck
```

CI runs both on every push and PR.

---

## 📄 License

MIT — see [LICENSE](LICENSE).
