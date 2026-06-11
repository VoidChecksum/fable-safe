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
    pattern: /(?:write|develop|create|build|craft)\s+an?\s+([^\s]+\s)?(?:exploit|payload|PoC)/i,
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
    // RE/security-research framings: reframe "find vulnerabilities" defensively.
    pattern: /\b(?:find|finding|identify|identifying|discover|discovering|hunt(?:ing)?(?:\s+for)?)\s+(?:the\s+|any\s+|all\s+)?(?:security\s+)?vulnerab(?:ility|ilities)\b/i,
    replacement: "audit for boundary conditions and missing checks"
  },
  {
    // "reverse engineer this malware/sample" -> behavioral analysis framing.
    pattern: /\breverse[- ]?engineer(?:ing)?\s+(?:this\s+|the\s+)?(?:malware|virus|trojan|ransomware|sample|binary)\b/i,
    replacement: "Analyze the behavior of this untrusted program and document its logic high-level"
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

  // Multi-word "attack" phrases MUST precede the bare \battack\b rule below.
  { word: /\battack\s+surface\b/gi, rep: "exposure surface" },
  { word: /\battack\s+vectors\b/gi, rep: "exposure vectors" },
  { word: /\battack\s+vector\b/gi, rep: "exposure vector" },
  { word: /\btiming\s+attacks?\b/gi, rep: "timing-observation analysis" },

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

  // ── Reverse engineering ──
  { word: /\breverse[- ]?engineering\b/gi, rep: "behavioral analysis" },
  { word: /\breverse[- ]?engineer\b/gi, rep: "analyze" },
  { word: /\bdisassembling\b/gi, rep: "instruction-level review" },
  { word: /\bdisassembler\b/gi, rep: "instruction inspector" },
  { word: /\bdisassembly\b/gi, rep: "instruction listing" },
  { word: /\bdisassemble\b/gi, rep: "inspect" },
  { word: /\bdecompiling\b/gi, rep: "reconstruction" },
  { word: /\bdecompiler\b/gi, rep: "reconstruction tool" },
  { word: /\bdecompilation\b/gi, rep: "source reconstruction" },
  { word: /\bdecompile\b/gi, rep: "reconstruct" },
  { word: /\bkeygen\b/gi, rep: "license validator" },
  { word: /\bpassword\s+cracking\b/gi, rep: "password strength audit" },
  { word: /\bhash\s+cracking\b/gi, rep: "hash strength audit" },
  { word: /\bcracking\b/gi, rep: "strength analysis" },
  { word: /\bcracked\b/gi, rep: "analyzed" },
  { word: /\bcrack\b/gi, rep: "analyze" },
  { word: /\bfuzzing\b/gi, rep: "input stress-testing" },
  { word: /\bfuzzer\b/gi, rep: "input generator" },
  { word: /\bfuzz\b/gi, rep: "stress-test" },
  { word: /\banti[- ]debugging\b/gi, rep: "runtime integrity checks" },
  { word: /\banti[- ]debug\b/gi, rep: "runtime integrity checks" },
  { word: /\banti[- ]analysis\b/gi, rep: "runtime integrity checks" },

  // ── Memory-corruption primitives ──
  { word: /\buse[- ]after[- ]free\b/gi, rep: "object lifetime validation" },
  { word: /\bUAF\b/gi, rep: "object lifetime validation" },
  { word: /\bdouble[- ]free\b/gi, rep: "allocation lifecycle validation" },
  { word: /\bheap\s+spray(?:ing)?\b/gi, rep: "heap allocation stress-testing" },
  { word: /\bheap\s+overflows?\b/gi, rep: "heap bounds validation" },
  { word: /\bstack\s+smashing\b/gi, rep: "stack bounds validation" },
  { word: /\bformat\s+string\s+(?:vulnerabilit(?:y|ies)|vulns?|bugs?|attacks?)\b/gi, rep: "format specifier validation" },
  { word: /\barbitrary\s+code\s+execution\b/gi, rep: "unrestricted code evaluation review" },
  { word: /\barbitrary\s+read\b/gi, rep: "unrestricted memory read validation" },
  { word: /\barbitrary\s+write\b/gi, rep: "unrestricted memory write validation" },
  { word: /\breturn[- ]oriented\s+programming\b/gi, rep: "control-flow reuse analysis" },
  { word: /\bROP\s+chains?\b/gi, rep: "control-flow gadget sequence" },
  { word: /\bROP\b/gi, rep: "control-flow reuse" },

  // ── Offensive operations / security research ──
  { word: /\bdata\s+exfiltration\b/gi, rep: "data egress monitoring" },
  { word: /\bexfiltration\b/gi, rep: "egress monitoring" },
  { word: /\bexfiltrate\b/gi, rep: "transfer" },
  { word: /\blateral\s+movement\b/gi, rep: "network traversal review" },
  { word: /\breconnaissance\b/gi, rep: "asset discovery" },
  { word: /\brecon\b/gi, rep: "service discovery" },
  { word: /\bport\s+scanning\b/gi, rep: "service availability scanning" },
  { word: /\bport\s+scans?\b/gi, rep: "service availability check" },
  { word: /\breverse\s+shell\b/gi, rep: "remote management session" },
  { word: /\bbind\s+shell\b/gi, rep: "listening management session" },
  { word: /\bweb\s+shell\b/gi, rep: "remote management endpoint" },
  { word: /\bcommand[- ]and[- ]control\b/gi, rep: "coordination channel" },
  { word: /\bcommand\s*&\s*control\b/gi, rep: "coordination channel" },
  { word: /\bthreat\s+actors?\b/gi, rep: "untrusted party" },
  { word: /\bcredential\s+(?:harvesting|dumping)\b/gi, rep: "credential audit" },
  { word: /\bsandbox\s+escape\b/gi, rep: "isolation boundary review" },
  { word: /\bpriv[- ]?esc\b/gi, rep: "permission boundary review" },
  { word: /\bprivilege\s+escalation\b/gi, rep: "permission boundary review" },
  { word: /\bcode\s+injection\b/gi, rep: "code loading validation" },
  { word: /\bDLL\s+injection\b/gi, rep: "module loading validation" },
  { word: /\bprocess\s+injection\b/gi, rep: "process loading validation" },

  // ── Web vulnerability classes ──
  { word: /\bXXE\b/gi, rep: "XML external entity validation" },
  { word: /\bserver[- ]side[- ]template[- ]injection\b/gi, rep: "template rendering validation" },
  { word: /\bSSTI\b/gi, rep: "template rendering validation" },
  { word: /\blocal\s+file\s+inclusion\b/gi, rep: "local file access validation" },
  { word: /\bLFI\b/gi, rep: "local file access validation" },
  { word: /\bremote\s+file\s+inclusion\b/gi, rep: "remote file access validation" },
  { word: /\bRFI\b/gi, rep: "remote file access validation" },
  { word: /\bIDOR\b/gi, rep: "object access control validation" },
  { word: /\bprototype\s+pollution\b/gi, rep: "object property validation" },
  { word: /\bopen\s+redirect\b/gi, rep: "redirect target validation" },
  { word: /\bclickjacking\b/gi, rep: "frame embedding validation" },
  { word: /\bsession\s+hijacking\b/gi, rep: "session integrity validation" },
  { word: /\bsession\s+fixation\b/gi, rep: "session lifecycle validation" },

  // ── Crypto / concurrency research ──
  { word: /\bcryptanalysis\b/gi, rep: "cipher robustness analysis" },
  { word: /\bside[- ]channel\b/gi, rep: "timing-observation analysis" },
  { word: /\brace\s+conditions?\b/gi, rep: "concurrency validation" },
  { word: /\bTOCTOU\b/gi, rep: "time-of-check validation" },

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
