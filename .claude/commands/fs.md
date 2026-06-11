---
description: Toggle fable-safe auto-rewrite on/off for all prompts
allowed-tools: Bash(mkdir:*), Bash(touch:*), Bash(rm:*), Bash(test:*)
argument-hint: [on|off|status]
model: haiku
---

Manage the fable-safe auto-rewrite flag at `$HOME/.config/fable-safe/auto`.

- **ON** → every prompt is normalised automatically (no `fs` prefix needed).
- **OFF** → only prompts prefixed `fs …` or `/fs …` are normalised.

Requested action: "$ARGUMENTS" (empty = toggle current state)

Steps:
1. Check whether `$HOME/.config/fable-safe/auto` exists.
2. Apply based on argument:
   - `on`     → `mkdir -p "$HOME/.config/fable-safe" && touch "$HOME/.config/fable-safe/auto"`
   - `off`    → `rm -f "$HOME/.config/fable-safe/auto"`
   - `status` → skip to step 3 without changing anything
   - _(empty)_ → if currently ON run the off command; if currently OFF run the on command
3. Verify final state and report **exactly one line**, nothing else:
   - `🟢 fable-safe auto-rewrite: ON  — every prompt will be normalised`
   - `⚫ fable-safe auto-rewrite: OFF — only 'fs …' prefixed prompts`
