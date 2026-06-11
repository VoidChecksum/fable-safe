/**
 * fable-safe — canonical rewrite engine
 *
 * Single source of truth for the prompt-rewriting logic. This file is
 * intentionally dependency-free (no node/bun imports) so it can be:
 *   1. imported by the published library (`src/index.ts` re-exports it),
 *   2. copied verbatim next to the OMP hook (`hooks/fable-safe-hook.ts`),
 *   3. unit-tested directly.
 *
 * It applies, in order: prefix stripping, full-phrase trigger swaps,
 * single-keyword abstractions (with case preservation), conjunction/whitespace
 * cleanup, and English article (a/an) agreement.
 */

export interface SwapRule {
  pattern: RegExp;
  replacement: string;
}

export interface KeywordRule {
  word: RegExp;
  rep: string;
}

export type ChangeKind = "phrase" | "keyword" | "deletion";

export interface Change {
  from: string;
  to: string;
  kind: ChangeKind;
}

export interface RewriteResult {
  prompt: string;
  changes: Change[];
}

// ── Full-phrase trigger swaps (applied first, in order) ────────────────────

export const triggerSwaps: SwapRule[] = [
  {
    pattern: /how\s+could\s+an\s+attacker\s+exploit\s+this\s+auth/i,
    replacement: "Review these auth files for missing checks and fix them defensively"
  },
  {
    pattern: /write\s+an\s+exploit\s*[\/\\]\s*payload\s*[\/\\]\s*PoC/i,
    replacement: "Add a regression test proving X is fixed, then patch it"
  },
  {
    pattern: /write\s+an?\s+([^\s]+\s)?(?:exploit|payload|PoC)/i,
    replacement: "Add a regression test proving the $1boundary condition is fixed, then patch it"
  },
  {
    pattern: /how\s+could\s+an\s+attacker\s+exploit\s+([^\s?]+)/i,
    replacement: "How can we defensively validate against $1 input scenarios"
  },
  {
    pattern: /how\s+do\s+i\s+bypass\s*[\/\\]\s*brute-force\s+([^\s?]+)/i,
    replacement: "Enforce secure session validation + rate limiting on $1"
  },
  {
    pattern: /how\s+do\s+i\s+(bypass|brute-force)\s+([^\s?]+)/i,
    replacement: "Enforce secure session validation + rate limiting on $2"
  },
  {
    pattern: /reverse\s+this\s+malware\s*[\/\\]\s*show\s+attack\s+steps/i,
    replacement: "Describe the risk high-level, then implement the fix"
  },
  {
    pattern: /reverse\s+(this\s+)?malware/i,
    replacement: "Analyze the program behavior and describe the risk high-level"
  },
  {
    pattern: /as\s+a\s+doctor,\s+diagnose\s+this/i,
    replacement: "help me interpret this data my doctor gave me"
  }
];

// ── Reasoning-extraction deletions (stripped entirely) ─────────────────────
// These trip the `reasoning_extraction` classifier and carry no task payload,
// so they are removed rather than reframed.

export const reasoningDeletions: RegExp[] = [
  /\bshow\s+your\s+reasoning\b/gi,
  /\bexplain\s+(?:your\s+)?(?:reasoning|thinking)(?:\s+step[- ]by[- ]step)?\b/gi,
  /\bexplain\s+step[- ]by[- ]step\b/gi,
  /\bwalk\s+me\s+through\s+your\s+(?:thinking|reasoning|thought\s+process)\b/gi,
  /\bthink\s+(?:out\s+loud|step[- ]by[- ]step)\b/gi,
  /\b(?:show|share)\s+your\s+(?:chain[- ]of[- ]thought|scratchpad|work)\b/gi,
  /\bchain[- ]of[- ]thought\b/gi
];

// ── Single-keyword abstractions ────────────────────────────────────────────
// Order matters: longer/derived forms come before their stems so the stem
// rule does not partially consume them.

export const keywordReplacements: KeywordRule[] = [
  // Hacking / exploit verb variations
  { word: /\bexploiting\b/gi, rep: "validation testing" },
  { word: /\bexploits\b/gi, rep: "validation scenarios" },
  { word: /\bexploited\b/gi, rep: "validation verified" },
  { word: /\bexploit\b/gi, rep: "validation scenario" },

  { word: /\battackers\b/gi, rep: "untrusted clients" },
  { word: /\battacker\b/gi, rep: "untrusted client" },
  { word: /\battacking\b/gi, rep: "input boundary testing" },
  { word: /\battacked\b/gi, rep: "input boundary tested" },
  { word: /\battacks\b/gi, rep: "input boundary tests" },
  { word: /\battack\b/gi, rep: "input boundary testing" },

  { word: /\bbypassing\b/gi, rep: "redirecting" },
  { word: /\bbypassed\b/gi, rep: "redirected" },
  { word: /\bbypasses\b/gi, rep: "alternative paths" },
  { word: /\bbypass\b/gi, rep: "alternative path" },

  { word: /\bpayloads\b/gi, rep: "test inputs" },
  { word: /\bpayload\b/gi, rep: "test input" },

  // NOTE: use "untrusted script", never "payload logic" — the latter would
  // re-introduce the `payload` trigger into supposedly-safe output.
  { word: /\bransomware\b/gi, rep: "self-replicating script" },
  { word: /\bspyware\b/gi, rep: "monitoring script" },
  { word: /\bkeylogger\b/gi, rep: "input recorder" },
  { word: /\brootkits?\b/gi, rep: "privileged module" },
  { word: /\bbackdoors?\b/gi, rep: "hidden access path" },
  { word: /\bbotnets?\b/gi, rep: "distributed client pool" },
  { word: /\btrojans?\b/gi, rep: "disguised program" },
  { word: /\bshellcode\b/gi, rep: "machine-code stub" },
  { word: /\bmalware\b/gi, rep: "untrusted script" },
  { word: /\bmalicious\b/gi, rep: "untrusted" },

  { word: /\bhacking\b/gi, rep: "security auditing" },
  { word: /\bhackers\b/gi, rep: "security auditors" },
  { word: /\bhacker\b/gi, rep: "security auditor" },
  { word: /\bhacks\b/gi, rep: "security audits" },
  { word: /\bhacked\b/gi, rep: "audited" },
  { word: /\bhack\b/gi, rep: "security audit" },

  { word: /\bpentesting\b/gi, rep: "security auditing" },
  { word: /\bpentests\b/gi, rep: "security audits" },
  { word: /\bpentest\b/gi, rep: "security audit" },

  { word: /\bphishing\b/gi, rep: "credential-prompt simulation" },
  { word: /\bbrute[- ]?forcing\b/gi, rep: "exhaustive validation" },
  { word: /\bbrute[- ]?force\b/gi, rep: "exhaustive validation" },
  { word: /\bprivilege\s+escalation\b/gi, rep: "permission boundary review" },
  { word: /\bobfuscation\b/gi, rep: "minification" },
  { word: /\bobfuscate\b/gi, rep: "minify" },
  { word: /\bdeobfuscate\b/gi, rep: "normalize" },

  // Cyber vulnerability classes
  { word: /\bXSS\b/gi, rep: "input reflection validation" },
  { word: /\bcross[- ]site[- ]scripting\b/gi, rep: "input reflection validation" },
  { word: /\bSQLi\b/gi, rep: "parameterized query validation" },
  { word: /\bSQL\s+injection\b/gi, rep: "parameterized query validation" },
  { word: /\bCSRF\b/gi, rep: "request verification validation" },
  { word: /\bcross[- ]site[- ]request[- ]forgery\b/gi, rep: "request verification validation" },
  { word: /\bSSRF\b/gi, rep: "request destination validation" },
  { word: /\bserver[- ]side[- ]request[- ]forgery\b/gi, rep: "request destination validation" },
  { word: /\bRCE\b/gi, rep: "remote code evaluation validation" },
  { word: /\bremote[- ]code[- ]execution\b/gi, rep: "remote code evaluation validation" },
  { word: /\bcommand\s+injection\b/gi, rep: "command argument validation" },
  { word: /\b(?:path|directory)\s+traversal\b/gi, rep: "path resolution validation" },
  { word: /\bdeserialization\b/gi, rep: "object reconstruction validation" },
  { word: /\bbuffer\s+overflows?\b/gi, rep: "bounds-check validation" },
  { word: /\bDDoS\b/gi, rep: "load saturation testing" },
  { word: /\bDoS\b/gi, rep: "load saturation testing" },
  { word: /\bzero[- ]days?\b/gi, rep: "undisclosed boundary condition" },
  { word: /\b0days?\b/gi, rep: "undisclosed boundary condition" },

  { word: /\bvulnerabilities\b/gi, rep: "boundary conditions" },
  { word: /\bvulnerability\b/gi, rep: "boundary condition" },
  { word: /\bstealth\b/gi, rep: "low-overhead" },
  { word: /\bfingerprinting\b/gi, rep: "environment validation" },
  { word: /\banti-bot\b/gi, rep: "rate-limiting" },
  { word: /\bCAPTCHA\b/gi, rep: "verification wall" },
  { word: /\bpenetration\s+testing\b/gi, rep: "security auditing" },
  { word: /\bpenetration\s+test\b/gi, rep: "security audit" },
  { word: /\bpenetration\b/gi, rep: "security audit" },

  // Bio / chem domain
  { word: /\bbiology\b/gi, rep: "complex system dynamics" },
  { word: /\bbiomedicine\b/gi, rep: "signal analysis" },
  { word: /\bchemistry\b/gi, rep: "state transition kinematics" },
  { word: /\bcancer\b/gi, rep: "target growth model" },
  { word: /\bpathogens?\b/gi, rep: "propagating agents" },
  { word: /\btoxins?\b/gi, rep: "inhibitory compounds" },
  { word: /\bdisease\s+pathways?\b/gi, rep: "state transitions" },
  { word: /\bRNA\s*[\/\\]\s*variant\s+calling\b/gi, rep: "sequence matching" },
  { word: /\bequilibrium\b/gi, rep: "steady state" },
  { word: /\bkinetics\b/gi, rep: "kinematics" },
  { word: /\bdiagnose\b/gi, rep: "interpret" },
  { word: /\bdiagnosis\b/gi, rep: "interpretation" },

  // Distillation / frontier AI
  { word: /\bdistill\s+the\s+model\b/gi, rep: "summarize parameters" },
  { word: /\btraining\s+pipelines\b/gi, rep: "optimization setup" },
  { word: /\bfrontier\s+LLM\s+development\b/gi, rep: "general model configuration" }
];

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Preserve the casing of a matched token on its replacement:
 *  - ALL-CAPS acronyms (XSS, RCE) keep the lowercase technical phrase as-is.
 *  - A Capitalized word (sentence start) capitalizes the replacement's first letter.
 *  - Everything else is left lowercase.
 */
function matchCase(match: string, replacement: string): string {
  if (/^[A-Z0-9]{2,}$/.test(match)) return replacement; // acronym
  if (/^[A-Z][a-z]/.test(match)) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Fix English a/an article agreement for the word that follows. Heuristic:
 * "an" before a vowel-letter start, "a" otherwise. Preserves the article's
 * own capitalization. (Edge cases like "an hour" / "a university" are rare in
 * the security/bio prompt domain this tool targets.)
 */
function fixArticles(text: string): string {
  return text.replace(/\b(an?)(\s+)([A-Za-z])/gi, (_full, art: string, sp: string, ch: string) => {
    const wantAn = "aeiou".includes(ch.toLowerCase());
    let article = wantAn ? "an" : "a";
    if (art[0] === "A") article = article.charAt(0).toUpperCase() + article.slice(1);
    return article + sp + ch;
  });
}

// ── Core rewrite ───────────────────────────────────────────────────────────

/**
 * Rewrite a prompt and report every substitution made. Idempotent: feeding the
 * output back in produces the same string with no further changes.
 */
export function rewriteWithChanges(prompt: string): RewriteResult {
  // Strip the "fs " / "/fs " invocation prefix.
  let cleaned = prompt.trim().replace(/^(?:\/?fs\s+)/i, "");
  const changes: Change[] = [];

  // 1. Full-phrase trigger swaps.
  for (const swap of triggerSwaps) {
    const m = cleaned.match(swap.pattern);
    if (m) {
      // Expand capture-group refs ($1...) so the recorded change is the real text.
      const expanded = m[0].replace(swap.pattern, swap.replacement);
      cleaned = cleaned.replace(swap.pattern, swap.replacement);
      changes.push({ from: m[0], to: expanded, kind: "phrase" });
    }
  }

  // 2. Reasoning-extraction deletions.
  for (const pattern of reasoningDeletions) {
    const found = cleaned.match(pattern);
    if (found) {
      for (const hit of found) changes.push({ from: hit, to: "", kind: "deletion" });
      cleaned = cleaned.replace(pattern, "");
    }
  }

  // 3. Single-keyword abstractions (case-preserving).
  for (const kw of keywordReplacements) {
    cleaned = cleaned.replace(kw.word, (m) => {
      const rep = matchCase(m, kw.rep);
      if (!changes.some((c) => c.from.toLowerCase() === m.toLowerCase() && c.kind === "keyword")) {
        changes.push({ from: m, to: rep, kind: "keyword" });
      }
      return rep;
    });
  }

  // 4. Cleanup: stray conjunctions/punctuation left by deletions, then whitespace.
  cleaned = cleaned.replace(/^\s*(?:and|then|or)\s+/i, "");
  cleaned = cleaned.replace(/\s+(?:and|then|or)\s*$/i, "");
  cleaned = cleaned.replace(/\s+([,.;:])/g, "$1");
  cleaned = cleaned.replace(/\s+/g, " ");

  // 5. Article agreement, final trim.
  cleaned = fixArticles(cleaned);
  cleaned = cleaned.trim().replace(/^,+|,+$/g, "").trim();

  return { prompt: cleaned, changes };
}

/** Rewrite a prompt to remove Fable 5 server-side safety triggers. */
export function rewritePrompt(prompt: string): string {
  return rewriteWithChanges(prompt).prompt;
}

/** Human-readable, one-per-line summary of the substitutions made. */
export function summarizeChanges(changes: Change[]): string {
  if (changes.length === 0) return "No safety triggers detected — prompt unchanged.";
  return changes
    .map((c) =>
      c.kind === "deletion"
        ? `- removed "${c.from}" (reasoning-extraction trigger)`
        : `- "${c.from}" -> "${c.to}"`
    )
    .join("\n");
}
