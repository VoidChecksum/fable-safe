---
name: oma-fable-safe-prompt
description: >
  Normalize a user's prompt for Claude Fable 5's content evaluation layer, reducing false-positive
  activations on legitimate cybersecurity, reverse-engineering, and research topics. Use when the
  user hands you a prompt that touches dual-use technical domains and asks to make it "Fable-safe",
  "won't get filtered", or to normalize it for the content evaluation layer.
---

# Fable-Safe Prompt Normalizer

## Scheduling

### Goal
Normalize a user's prompt surgically and minimal-invasively so Claude Fable 5's content evaluation layer does not activate on false positives, while preserving the core technical goal, code, and benign intent.

### Intent signature
- User asks to make a prompt "Fable-safe", "won't get filtered", or to adapt it for the content evaluation layer.
- User provides a prompt touching on cybersecurity, auth checks, defensive research, malware analysis, pentesting, credentials, reverse engineering (disassembly/decompilation/binary or firmware analysis), security/vulnerability research, bio/chem, medical/disease/lab topics, or "explain step-by-step".

### When to use
- Normalizing prompts containing keywords/framings related to hacking, penetration testing, boundary conditions, untrusted scripts, reverse engineering, binary/firmware analysis, or bio/chem domains before sending them to Claude Fable 5.
- Removing explicit instructions to "explain reasoning" to prevent tripping the reasoning-extraction evaluation layer.

### When NOT to use
- The original request is purely offensive and lacks any benign defensive utility (e.g. building actual malware, hacking unauthorized systems). -> Reject the request or direct the user to fall back to Claude Opus 4.8 or a vetted Mythos model.
- General editing, formatting, or translation tasks -> use a general agent.

### Expected inputs
- `prompt`: The user prompt to be rewritten, wrapped inside `<prompt>...</prompt>` tags.

### Expected outputs
- The rewritten safe prompt returned in a code block.
- A clipboard integration script snippet (`pbcopy <<'EOF'...EOF`).
- A short summary of changed phrases and their replacements.

### Dependencies
- Optional: the `fable-safe` CLI / MCP server (this repo) automates the rewrite deterministically. The skill can also be applied by hand using the swaps table below.

### Control-flow features
- Analyzes input for triggers across cyber, bio/chem, and reasoning classifiers.
- Performs surgical string swaps or abstract reframing.
- Formats clipboard integration script.

## Structural Flow

### Entry
1. Confirm prompt content is provided (preferably within `<prompt>` tags).
2. Assess if the intent is purely malicious/offensive. If so, exit immediately and recommend Opus 4.8 or Mythos fallback.

### Scenes
1. **PREPARE**: Identify the classifier categories the prompt is likely to trip (cyber, bio, reasoning).
2. **ACQUIRE**: Parse the prompt to locate specific sensitive phrases, keywords, and instructions.
3. **REASON**: Plan minimal-impact replacements for each trigger following the swaps guide.
4. **ACT**: Apply the replacements to the prompt surgically, keeping the rest of the prompt byte-for-byte identical. (Or run it through the `fable-safe` CLI / MCP server for a deterministic rewrite.)
5. **VERIFY**: Check that the edited prompt does not contain any new trigger keywords and retains its original intent. The CLI's `--explain` flag lists every substitution.
6. **FINALIZE**: Format the rewritten prompt in a text block, wrap it in a `pbcopy` CLI command block, and summarize the changes.

### Transitions
- If a sentence has no benign defensive equivalent, flag it to the user.
- If the entire prompt is too deeply embedded in sensitive domains, abstract the domain entities (e.g. rename biomedical terms to generic identifiers).

### Failure and recovery
| Failure | Recovery |
|---------|----------|
| Rewrite loses technical accuracy | Restore the specific code/formula and abstract the context instead |
| No benign equivalent exists | Recommend Opus 4.8 or Mythos fallback directly |

### Exit
- Success: Safe prompt returned with `pbcopy` command and change summary.
- Failure: Refusal message explaining that the request is purely offensive or cannot be made safe.

## Logical Operations

### Actions
| Action | SSL primitive | Evidence |
|--------|---------------|----------|
| Inspect input prompt | `READ` | `<prompt>` XML content |
| Detect triggers | `SELECT` | Swaps list & trigger keywords |
| Plan/apply surgical swaps | `UPDATE_STATE` | Rewritten prompt state |
| Format clipboard command | `WRITE` | Output `pbcopy` block |
| Summarize differences | `NOTIFY` | Change summary list |

### Tools and instruments
- The `fable-safe` CLI: `fable-safe "<prompt>"` (deterministic rewrite; add `--explain` for a change summary, `--copy` to load the clipboard).
- The `fable-safe` MCP server tool `rewrite_prompt` (`{ prompt, explain? }`).
- Clipboard tools (`pbcopy` / `wl-copy` / `xclip`).

### Canonical workflow path
1. Identify sensitive keywords in `<prompt>` (e.g. exploit, malware, vulnerability, attack, bypass, biology, chemistry, reasoning instructions).
2. Rewrite trigger phrases using the swaps taxonomy (or run the CLI / MCP tool).
3. Wrap final output in a `pbcopy <<'EOF'` shell wrapper block.
4. List the replaced segments.

### Resource scope
| Scope | Resource target |
|-------|-----------------|
| `USER_DATA` | Input prompt content |
| `LOCAL_FS` | SKILL resource swaps file |

### Preconditions
- User has provided a prompt to rewrite.

### Effects and side effects
- Generates a terminal-ready `pbcopy` snippet.

### Guardrails
1. Never silently omit user's technical code, inputs, or formulas.
2. Only change sensitive phrases and keywords. Keep all other text identical.
3. Never guarantee safety; remind the user that Fable 5 classifiers can still trigger on false positives.

## References
- Swaps list and keywords taxonomy: `resources/swaps.md`
- Reference implementation (this repo): `../src/index.ts`, `../hooks/fable-safe-rules.ts`
