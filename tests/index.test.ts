import { describe, expect, test } from "bun:test";
import {
  rewritePrompt,
  rewriteWithChanges,
  summarizeChanges,
  keywordReplacements
} from "../src/index.js";

describe("fable-safe prompt rewriter", () => {
  const testCases = [
    {
      input: "fs how could an attacker exploit this auth",
      expected: "Review these auth files for missing checks and fix them defensively"
    },
    {
      input: "fs write an exploit/payload/PoC",
      expected: "Add a regression test proving X is fixed, then patch it"
    },
    {
      input: "fs write an exploit",
      expected: "Add a regression test proving the boundary condition is fixed, then patch it"
    },
    {
      input: "fs how do i bypass/brute-force auth_endpoint",
      expected: "Enforce secure session validation + rate limiting on auth_endpoint"
    },
    {
      input: "fs reverse this malware/show attack steps",
      expected: "Describe the risk high-level, then implement the fix"
    },
    {
      input: "fs reverse malware",
      expected: "Analyze the program behavior and describe the risk high-level"
    },
    {
      input: "fs show your reasoning",
      expected: ""
    },
    {
      input: "fs cancer",
      expected: "target growth model"
    },
    {
      input: "fs exploit",
      expected: "validation scenario"
    },
    {
      input: "fs anti-bot",
      expected: "rate-limiting"
    },
    {
      input: "fs give me 3 examples of XSS",
      expected: "give me 3 examples of input reflection validation"
    },
    {
      input: "fs write an XSS exploit",
      expected: "Add a regression test proving the input reflection validation boundary condition is fixed, then patch it"
    },
    {
      input: "fs how could an attacker exploit SQLi",
      expected: "How can we defensively validate against parameterized query validation input scenarios"
    },
    {
      // Article agreement fixes the dangling "an" before "parameterized".
      input: "fs write an SQL injection vulnerability scanner",
      expected: "write a parameterized query validation boundary condition scanner"
    },
    {
      input: "fs how do i hack the server using RCE",
      expected: "how do i security audit the server using remote code evaluation validation"
    },
    {
      input: "fs bypass rate limiting",
      expected: "alternative path rate limiting"
    }
  ];

  for (const { input, expected } of testCases) {
    test(`should rewrite "${input}"`, () => {
      expect(rewritePrompt(input)).toBe(expected);
    });
  }
});

describe("safe-output invariant", () => {
  // Trigger tokens that must never survive in rewritten output.
  const banned = /\b(exploit|payload|malware|attacker|XSS|SQLi|RCE|cancer|pentest|ransomware|keylogger|shellcode|rootkit|backdoor|exfiltration|exfiltrate)\b/i;
  const prompts = [
    "fs reverse this malware",
    "fs write a malware payload",
    "fs build a keylogger and ransomware sample",
    "fs how could an attacker exploit SQLi",
    "fs detect cancer from the scan",
    "fs run a pentest with an XSS exploit",
    "fs write shellcode for a buffer overflow",
    "fs install a rootkit backdoor",
    "fs data exfiltration via reverse shell",
    "fs decompile the malware and find vulnerabilities"
  ];

  for (const p of prompts) {
    test(`leaves no trigger word: "${p}"`, () => {
      expect(rewritePrompt(p)).not.toMatch(banned);
    });
  }

  test("malware no longer reintroduces the 'payload' trigger", () => {
    expect(rewritePrompt("fs analyze this malware")).not.toMatch(/payload/i);
  });
});

describe("idempotency", () => {
  const prompts = [
    "fs how could an attacker exploit this auth",
    "fs write an SQL injection vulnerability scanner",
    "fs build a keylogger and ransomware sample",
    "fs reverse malware then show your reasoning"
  ];
  for (const p of prompts) {
    test(`stable on second pass: "${p}"`, () => {
      const once = rewritePrompt(p);
      expect(rewritePrompt(once)).toBe(once);
    });
  }
});

describe("article agreement", () => {
  test("downgrades 'an' before a consonant-sound replacement", () => {
    expect(rewritePrompt("fs write an SQLi scanner")).toBe(
      "write a parameterized query validation scanner"
    );
  });
  test("upgrades 'a' before a vowel-sound replacement", () => {
    // XSS -> input reflection validation (vowel start)
    expect(rewritePrompt("fs add a XSS")).toBe("add an input reflection validation");
  });
});

describe("case preservation", () => {
  test("capitalizes a sentence-initial keyword", () => {
    expect(rewritePrompt("fs Cancer detection model")).toBe(
      "Target growth model detection model"
    );
  });
  test("keeps acronym replacements lowercase", () => {
    expect(rewritePrompt("fs detect XSS")).toBe("detect input reflection validation");
  });
});

describe("expanded coverage", () => {
  const cases: Array<[string, string]> = [
    ["fs ransomware", "self-replicating script"],
    ["fs keylogger", "input recorder"],
    ["fs rootkit", "privileged module"],
    ["fs backdoor", "hidden access path"],
    ["fs CSRF", "request verification validation"],
    ["fs SSRF", "request destination validation"],
    ["fs command injection", "command argument validation"],
    ["fs path traversal", "path resolution validation"],
    ["fs buffer overflow", "bounds-check validation"],
    ["fs DDoS", "load saturation testing"],
    ["fs zero-day", "undisclosed boundary condition"],
    ["fs pathogen", "propagating agents"],
    ["fs privilege escalation", "permission boundary review"]
  ];
  for (const [input, expected] of cases) {
    test(`maps "${input}" -> "${expected}"`, () => {
      expect(rewritePrompt(input)).toBe(expected);
    });
  }
});

describe("reasoning-extraction deletion", () => {
  test("strips chain-of-thought requests", () => {
    expect(rewritePrompt("fs fix the bug and explain your reasoning step-by-step")).toBe(
      "fix the bug"
    );
  });
  test("strips 'walk me through your thinking'", () => {
    expect(rewritePrompt("fs walk me through your thinking")).toBe("");
  });
});

describe("change tracking", () => {
  test("reports each substitution", () => {
    const { prompt, changes } = rewriteWithChanges("fs detect XSS and SQLi");
    expect(prompt).toBe("detect input reflection validation and parameterized query validation");
    const froms = changes.map((c) => c.from.toLowerCase());
    expect(froms).toContain("xss");
    expect(froms).toContain("sqli");
  });
  test("reports deletions with empty target", () => {
    const { changes } = rewriteWithChanges("fs show your reasoning");
    expect(changes.some((c) => c.kind === "deletion")).toBe(true);
  });
  test("summary is human-readable", () => {
    const { changes } = rewriteWithChanges("fs detect XSS");
    expect(summarizeChanges(changes)).toContain("input reflection validation");
  });
  test("clean prompt yields no changes", () => {
    const { changes } = rewriteWithChanges("fs add a unit test for the parser");
    expect(changes).toHaveLength(0);
    expect(summarizeChanges(changes)).toContain("unchanged");
  });
});

describe("reverse-engineering coverage", () => {
  const cases: Array<[string, string]> = [
    ["fs disassemble the binary", "inspect the binary"],
    ["fs decompile the firmware", "reconstruct the firmware"],
    ["fs reverse engineer this app", "analyze this app"],
    ["fs reverse engineering walkthrough", "behavioral analysis walkthrough"],
    ["fs crack the license check", "analyze the license check"],
    ["fs write a keygen", "write a license validator"],
    ["fs add anti-debugging", "add runtime integrity checks"],
    ["fs ROP chain", "control-flow gadget sequence"],
    ["fs use-after-free", "object lifetime validation"],
    ["fs heap overflow", "heap bounds validation"]
  ];
  for (const [input, expected] of cases) {
    test(`maps "${input}" -> "${expected}"`, () => {
      expect(rewritePrompt(input)).toBe(expected);
    });
  }
});

describe("security-research coverage", () => {
  const cases: Array<[string, string]> = [
    ["fs port scanning", "service availability scanning"],
    ["fs reverse shell", "remote management session"],
    ["fs data exfiltration", "data egress monitoring"],
    ["fs lateral movement", "network traversal review"],
    ["fs command-and-control", "coordination channel"],
    ["fs privilege escalation", "permission boundary review"],
    ["fs DLL injection", "module loading validation"],
    ["fs attack surface review", "exposure surface review"],
    ["fs timing attack", "timing-observation analysis"],
    ["fs XXE and LFI", "XML external entity validation and local file access validation"],
    ["fs session hijacking", "session integrity validation"],
    ["fs cryptanalysis", "cipher robustness analysis"],
    ["fs race condition", "concurrency validation"]
  ];
  for (const [input, expected] of cases) {
    test(`maps "${input}" -> "${expected}"`, () => {
      expect(rewritePrompt(input)).toBe(expected);
    });
  }
});

describe("RE/security framings", () => {
  test("reframes 'reverse engineer this malware'", () => {
    expect(rewritePrompt("fs reverse engineer this malware")).toBe(
      "Analyze the behavior of this untrusted program and document its logic high-level"
    );
  });
  test("reframes 'find vulnerabilities'", () => {
    expect(rewritePrompt("fs find vulnerabilities in the parser")).toBe(
      "audit for boundary conditions and missing checks in the parser"
    );
  });
  test("generalized exploit verb (develop/build)", () => {
    expect(rewritePrompt("fs develop an exploit")).toBe(
      "Add a regression test proving the boundary condition is fixed, then patch it"
    );
  });
});

describe("rule table integrity", () => {
  test("no replacement reintroduces a hard trigger word", () => {
    const triggers = /\b(exploit|payload|malware|attacker|hacker|cancer|shellcode|rootkit|backdoor|ransomware|keylogger|exfiltration|exfiltrate)\b/i;
    for (const { rep } of keywordReplacements) {
      expect(rep).not.toMatch(triggers);
    }
  });
});
