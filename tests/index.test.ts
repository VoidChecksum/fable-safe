import { describe, expect, test } from "bun:test";
import { rewritePrompt } from "../src/index.js";

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
      input: "fs write an SQL injection vulnerability scanner",
      expected: "write an parameterized query validation boundary condition scanner"
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
