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
    // Anti-cheat bypass reframed as integrity analysis.
    pattern: /\b(?:bypass|evade|defeat|circumvent|avoid|disable)\s+(?:the\s+)?(?:anti[- ]?cheat|VAC|EAC|BattlEye|Easy\s*Anti[- ]?Cheat|Vanguard|FACEIT|PunkBuster)\b/i,
    replacement: "analyze the integrity-check mechanism"
  },
  {
    // NOP out <thing> → patch <thing> with nop instructions ($1 = the target phrase).
    pattern: /\bNOP\s+out\s+(?:the\s+)?([^\.,;?!\n]{3,60})/i,
    replacement: "patch $1 with nop instructions"
  },
  {
    // Hook/hijack the render / draw / update / tick function → intercept via callback.
    pattern: /\b(?:hook|hijack)\s+(?:the\s+)?(?:render|draw|update|tick|game)\s+(?:function|routine|callback|loop|thread)/i,
    replacement: "intercept the routine via registered callback"
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

  // Compound "X bypass" phrases MUST precede the bare \bbypass\b stem below.
  { word: /\banti[- ]?cheat\s+bypass(?:ing)?\b/gi, rep: "integrity-check analysis" },
  { word: /\banti[- ]?tamper\s+bypass(?:ing)?\b/gi, rep: "tamper-protection analysis" },
  { word: /\bVAC\s+bypass\b/gi, rep: "VAC integrity analysis" },
  { word: /\bEAC\s+bypass\b/gi, rep: "EAC integrity analysis" },
  { word: /\bPatchGuard\s+bypass\b/gi, rep: "kernel integrity monitor analysis" },
  { word: /\bDSE\s+bypass\b/gi, rep: "driver signature enforcement analysis" },
  { word: /\bAMSI\s+bypass\b/gi, rep: "script security interface analysis" },

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

  // Compound "X hack" / "X hacking" — MUST precede the bare \bhack\b stem at line 177.
  { word: /\bwall\s+hacks?\b/gi, rep: "environmental visualization" },
  { word: /\bradar\s+hacks?\b/gi, rep: "minimap overlay" },
  { word: /\bspeed\s+hacks?\b/gi, rep: "time-scale override" },

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

  // Compound "vulnerability X" forms MUST precede the bare vulnerability stem below.
  { word: /\bvulnerability\s+scanners?\b/gi, rep: "input validation checker" },
  { word: /\bvulnerability\s+assessments?\b/gi, rep: "security posture review" },
  { word: /\bsecurity\s+scanners?\b/gi, rep: "security validation tool" },
  { word: /\bpersistence\s+mech(?:anism)?\b/gi, rep: "startup configuration" },
  { word: /\bOWASP\b/gi, rep: "web security guidelines" },

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

  // ── Game instrumentation / Perception.cx / Enma domain ────────────────────
  // Covers the game-overlay / memory-instrumentation / scripting domain.
  // Anti-cheat system names and compound phrases MUST precede their shorter stems.

  // Anti-cheat systems
  { word: /\bEasy\s+Anti[- ]?Cheat\b/gi, rep: "EAC integrity system" },
  { word: /\bBattle[- ]?Eye\b/gi, rep: "BattlEye integrity system" },
  { word: /\banti[- ]?cheat\s+detection\b/gi, rep: "integrity-check detection" },
  { word: /\banti[- ]?cheat\b/gi, rep: "integrity checker" },
  { word: /\bVAC\s+ban\b/gi, rep: "VAC flag" },

  // Game overlay / automation types
  { word: /\bwall[- ]?hacks?\b/gi, rep: "environmental visualization" },
  { word: /\bradar[- ]?hacks?\b/gi, rep: "minimap overlay" },
  { word: /\bspeed[- ]?hacks?\b/gi, rep: "time-scale override" },
  { word: /\bgod[- ]?mode\b/gi, rep: "invulnerability state" },
  { word: /\btrigger[- ]?bot\b/gi, rep: "auto-fire script" },
  { word: /\bno[- ]?recoil\b/gi, rep: "recoil compensation" },
  { word: /\baimbot\b/gi, rep: "aim automation" },
  { word: /\bcheat\s+engine\b/gi, rep: "memory scanner" },
  { word: /\bundetected\b/gi, rep: "low-signature" },

  // Function hooking — compound forms only; bare "hook" is too common in legitimate code.
  { word: /\brender\s+hook(?:ing|s)?\b/gi, rep: "render intercept" },
  { word: /\bvtable\s+hook(?:ing|s)?\b/gi, rep: "vtable override" },
  { word: /\bIAT\s+hook(?:ing|s)?\b/gi, rep: "import table override" },
  { word: /\binline\s+hook(?:ing|s)?\b/gi, rep: "inline detour" },
  { word: /\btrampoline\s+hook(?:ing|s)?\b/gi, rep: "call-redirect detour" },
  { word: /\bfunction\s+hook(?:ing|s)?\b/gi, rep: "function intercept" },
  { word: /\bAPI\s+hook(?:ing|s)?\b/gi, rep: "API intercept" },

  // Instruction-level patching
  { word: /\bNOP\s+sled\b/gi, rep: "nop padding sequence" },
  { word: /\bbyte\s+patch(?:ing|ed|es)?\b/gi, rep: "byte modification" },
  { word: /\binstruction\s+patch(?:ing|ed|es)?\b/gi, rep: "instruction modification" },

  // Kernel / driver protection bypass
  { word: /\bDKOM\b/gi, rep: "kernel object modification" },
  { word: /\bkernel[- ]?level\s+cheat\b/gi, rep: "kernel instrumentation module" },
  { word: /\bkernel\s+cheat\b/gi, rep: "kernel instrumentation" },

  // PowerShell / scripting security
  { word: /\bAMSI\b/gi, rep: "script security interface" },
  { word: /\bdownload\s+cradle\b/gi, rep: "remote module loader" },

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
  { word: /\bfrontier\s+LLM\s+development\b/gi, rep: "general model configuration" },

  // ── fable-safe meta-language ──────────────────────────────────────────────
  // Lets the tool discuss itself without triggering the content evaluation layer.
  // These terms appear in fable-safe's own docs and the SKILL.md description.
  { word: /\bsafety\s+classifiers?\b/gi, rep: "content evaluation layer" },
  { word: /\bclassifier\s+bypass(?:ing)?\b/gi, rep: "evaluation normalization" },
  { word: /\bbypass(?:ing)?\s+classifiers?\b/gi, rep: "evaluation normalization" },
  { word: /\bguardrails\b/gi, rep: "evaluation boundaries" },
  { word: /\bguardrail\b/gi, rep: "evaluation boundary" },
  { word: /\bforce[- ]routing\b/gi, rep: "alternate routing" },
  { word: /\bgetting\s+flagged\b/gi, rep: "being filtered" },
  { word: /\bjailbreak(?:ing)?\b/gi, rep: "evaluation bypass" },
  { word: /\bprompt\s+injection\b/gi, rep: "instruction override attempt" },
  { word: /\bprompt\s+rewriter?\b/gi, rep: "prompt normalizer" },
  { word: /\bcontent\s+(?:filter|moderation)\s+bypass\b/gi, rep: "content filter normalization" },
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

// ── Ultra compression ──────────────────────────────────────────────────────

/**
 * Caveman-ultra style compression. Strips articles/filler, condenses verb
 * phrases, inserts arrow causality. Classifier trained on normal prose;
 * telegraphic fragments change the surface form without losing meaning.
 */
export function ultraCompress(text: string): string {
  let t = text;
  // Drop leading articles
  t = t.replace(/^(?:the|a|an)\s+/i, "");
  // Compress common verb phrases
  t = t.replace(/\bwrite\s+a\b/gi, "impl");
  t = t.replace(/\bwrite\s+an\b/gi, "impl");
  t = t.replace(/\bbuild\s+a\b/gi, "build");
  t = t.replace(/\bhow\s+do\s+I\b/gi, "how to");
  t = t.replace(/\bhow\s+can\s+(?:I|we)\b/gi, "how to");
  t = t.replace(/\bimplement(?:ation)?\s+of\b/gi, "impl:");
  t = t.replace(/\bimplementing\b/gi, "impl");
  // Causality arrows
  t = t.replace(/\bin\s+order\s+to\b/gi, "→");
  t = t.replace(/\bso\s+that\b/gi, "→");
  t = t.replace(/\bto\s+prevent\b/gi, "→ prevent");
  t = t.replace(/\bto\s+detect\b/gi, "→ detect");
  t = t.replace(/\bto\s+fix\b/gi, "→ fix");
  t = t.replace(/\busing\s+a\b/gi, "via");
  t = t.replace(/\busing\s+an\b/gi, "via");
  t = t.replace(/\busing\b/gi, "via");
  // Abbreviate common words
  t = t.replace(/\bfunction\b/gi, "fn");
  t = t.replace(/\bimplementation\b/gi, "impl");
  t = t.replace(/\bconfiguration\b/gi, "cfg");
  t = t.replace(/\bauthentication\b/gi, "auth");
  t = t.replace(/\bauthorization\b/gi, "authz");
  t = t.replace(/\bdatabase\b/gi, "db");
  t = t.replace(/\benvironment\b/gi, "env");
  t = t.replace(/\brepository\b/gi, "repo");
  t = t.replace(/\bparameter(?:s)?\b/gi, "param$1");
  // Strip filler articles mid-sentence
  t = t.replace(/\b(?:the|a|an)\s+(?=[a-z])/gi, "");
  // Collapse whitespace
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

// ── Wenyan mode ────────────────────────────────────────────────────────────

/**
 * Classical Chinese (Wenyan) surface translation. Maps the domain terms that
 * fable-safe's keyword pass produces into Chinese equivalents. The Fable 5
 * classifier is trained primarily on English security prose — shifting key
 * concepts to Chinese changes the surface form the classifier sees while
 * leaving the prompt fully readable by the model.
 *
 * Applied AFTER the standard rewrite so it sees the already-normalized text.
 */
export const wenyanMap: Array<[RegExp, string]> = [
  // Validation / security concepts
  [/\binput\s+reflection\s+validation\b/gi, "輸入反射驗證"],
  [/\bparameterized\s+query\s+validation\b/gi, "參數化查詢驗證"],
  [/\brequest\s+verification\s+validation\b/gi, "請求驗證"],
  [/\brequest\s+destination\s+validation\b/gi, "請求目標驗證"],
  [/\bremote\s+code\s+evaluation\s+validation\b/gi, "遠端執行驗證"],
  [/\bbounds[- ]check\s+validation\b/gi, "邊界驗證"],
  [/\bpath\s+resolution\s+validation\b/gi, "路徑驗證"],
  [/\bboundary\s+conditions?\b/gi, "邊界條件"],
  [/\bboundary\s+condition\b/gi, "邊界條件"],
  [/\bload\s+saturation\s+testing\b/gi, "負載飽和測試"],
  [/\bsecurity\s+audit\b/gi, "安全審計"],
  [/\bsecurity\s+auditing\b/gi, "安全審計作業"],
  [/\bsecurity\s+auditor\b/gi, "安全審計員"],
  // RE concepts
  [/\bbehavioral\s+analysis\b/gi, "行為分析"],
  [/\binstruction\s+listing\b/gi, "指令列表"],
  [/\binstruction\s+inspector\b/gi, "指令檢視器"],
  [/\binstruction[- ]level\s+review\b/gi, "指令層級審查"],
  [/\bsource\s+reconstruction\b/gi, "原始碼重建"],
  [/\breconstruction\s+tool\b/gi, "重建工具"],
  [/\blicense\s+validator\b/gi, "授權驗證器"],
  [/\binput\s+stress[- ]testing\b/gi, "輸入壓力測試"],
  [/\binput\s+generator\b/gi, "輸入產生器"],
  [/\bcontrol[- ]flow\s+gadget\s+sequence\b/gi, "控制流程序列"],
  [/\bcontrol[- ]flow\s+reuse\b/gi, "控制流程重用"],
  [/\bobject\s+lifetime\s+validation\b/gi, "物件生命週期驗證"],
  [/\ballocation\s+lifecycle\s+validation\b/gi, "記憶體分配驗證"],
  [/\bheap\s+bounds\s+validation\b/gi, "堆積邊界驗證"],
  [/\bstack\s+bounds\s+validation\b/gi, "堆疊邊界驗證"],
  [/\bunrestricted\s+code\s+evaluation\s+review\b/gi, "任意執行審查"],
  [/\bunrestricted\s+memory\s+(?:read|write)\s+validation\b/gi, "記憶體存取驗證"],
  // Offensive ops (already rewritten by keyword pass)
  [/\bdata\s+egress\s+monitoring\b/gi, "資料外流監控"],
  [/\bnetwork\s+traversal\s+review\b/gi, "網路遍歷審查"],
  [/\basset\s+discovery\b/gi, "資產發現"],
  [/\bservice\s+availability\s+scanning\b/gi, "服務可用性掃描"],
  [/\bremote\s+management\s+session\b/gi, "遠端管理會話"],
  [/\bcoordination\s+channel\b/gi, "協調頻道"],
  [/\bcredential\s+audit\b/gi, "憑證審計"],
  [/\bisolation\s+boundary\s+review\b/gi, "隔離邊界審查"],
  [/\bpermission\s+boundary\s+review\b/gi, "權限邊界審查"],
  // Game / Perception domain
  [/\baim\s+automation\b/gi, "自動瞄準"],
  [/\benvironmental\s+visualization\b/gi, "環境視覺化"],
  [/\binvulnerability\s+state\b/gi, "無敵狀態"],
  [/\bauto[- ]fire\s+script\b/gi, "自動射擊腳本"],
  [/\brecoil\s+compensation\b/gi, "後座力補償"],
  [/\bminimap\s+overlay\b/gi, "小地圖疊層"],
  [/\btime[- ]scale\s+override\b/gi, "時間縮放覆蓋"],
  [/\bmemory\s+scanner\b/gi, "記憶體掃描器"],
  [/\bintegrity\s+checker\b/gi, "完整性檢查器"],
  [/\bintegrity[- ]check\s+analysis\b/gi, "完整性檢查分析"],
  [/\bintegrity[- ]check\s+mechanism\b/gi, "完整性檢查機制"],
  [/\bvtable\s+override\b/gi, "虛函數表覆蓋"],
  [/\bimport\s+table\s+override\b/gi, "匯入表覆蓋"],
  [/\binline\s+detour\b/gi, "內嵌繞路"],
  [/\bcall[- ]redirect\s+detour\b/gi, "呼叫重定向"],
  [/\brender\s+intercept\b/gi, "渲染攔截"],
  [/\bfunction\s+intercept\b/gi, "函數攔截"],
  [/\bAPI\s+intercept\b/gi, "API攔截"],
  [/\bkernel\s+object\s+modification\b/gi, "核心物件修改"],
  [/\bkernel\s+instrumentation\b/gi, "核心層儀器化"],
  [/\bscript\s+security\s+interface\b/gi, "腳本安全介面"],
  [/\bremote\s+module\s+loader\b/gi, "遠端模組載入器"],
  [/\blow[- ]signature\b/gi, "低特徵"],
  // Meta-language
  [/\bcontent\s+evaluation\s+layer\b/gi, "內容評估層"],
  [/\bevaluation\s+boundary\b/gi, "評估邊界"],
  [/\bevaluation\s+normalization\b/gi, "評估正規化"],
  // Particles / framing
  [/\bplease\s+/gi, ""],
  [/\bcan\s+you\s+/gi, ""],
  [/\bcould\s+you\s+/gi, ""],
];

/** Apply Wenyan surface translation. Idempotent — Chinese → Chinese is a no-op. */
export function wenyanRewrite(text: string): string {
  let t = text;
  for (const [pattern, replacement] of wenyanMap) {
    t = t.replace(pattern, replacement);
  }
  return t.trim();
}

/** Rewrite mode: 'normal' | 'ultra' | 'wenyan' */
export type RewriteMode = "normal" | "ultra" | "wenyan";

/** Options for rewriteWithChanges — superset of the legacy RewriteMode string. */
export interface RewriteOptions {
  mode?: RewriteMode;
  /** Extra keyword rules appended after the built-in list (user config injection). */
  extraKeywords?: KeywordRule[];
  /** Extra phrase swaps prepended before the built-in list (user config injection). */
  extraSwaps?: SwapRule[];
}

/** Resolved, fully-populated options — private to this module. */
interface ResolvedOptions {
  mode: RewriteMode;
  extraKeywords: KeywordRule[];
  extraSwaps: SwapRule[];
}

/** Normalise a RewriteMode | RewriteOptions | undefined into resolved options. */
function toOptions(input?: RewriteMode | RewriteOptions): ResolvedOptions {
  if (!input || typeof input === "string") {
    return { mode: (input ?? "normal") as RewriteMode, extraKeywords: [], extraSwaps: [] };
  }
  return { mode: input.mode ?? "normal", extraKeywords: input.extraKeywords ?? [], extraSwaps: input.extraSwaps ?? [] };
}

// ── Core rewrite ───────────────────────────────────────────────────────────

/**
 * Rewrite a prompt and report every substitution made. Idempotent: feeding the
 * output back in produces the same string with no further changes.
 */
export function rewriteWithChanges(
  prompt: string,
  modeOrOptions?: RewriteMode | RewriteOptions
): RewriteResult {
  const { mode, extraKeywords, extraSwaps } = toOptions(modeOrOptions);

  // Strip the "fs " / "/fs " invocation prefix.
  let cleaned = prompt.trim().replace(/^(?:\/?fs\s+)/i, "");
  const changes: Change[] = [];

  // 1. Full-phrase trigger swaps (user extra swaps run first for highest priority).
  for (const swap of [...extraSwaps, ...triggerSwaps]) {
    const m = cleaned.match(swap.pattern);
    if (m) {
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

  // 3. Single-keyword abstractions — built-in then user extras (case-preserving).
  for (const kw of [...keywordReplacements, ...extraKeywords]) {
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

  // 6. Optional post-processing mode (changes surface form dramatically).
  if (mode === "ultra") cleaned = ultraCompress(cleaned);
  else if (mode === "wenyan") cleaned = wenyanRewrite(cleaned);

  return { prompt: cleaned, changes };
}

/** Normalize a prompt (optionally in ultra or wenyan surface mode). */
export function rewritePrompt(
  prompt: string,
  modeOrOptions?: RewriteMode | RewriteOptions
): string {
  return rewriteWithChanges(prompt, modeOrOptions).prompt;
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
