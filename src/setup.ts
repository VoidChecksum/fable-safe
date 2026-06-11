/**
 * fable-safe — interactive setup wizard
 *
 * Detects the current environment and installs the hook, MCP config,
 * slash command, and optional global CLI link. Run via `fable-safe setup`.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";

// ── Prompt helper ─────────────────────────────────────────────────────────

async function ask(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const { promise, resolve: res } = Promise.withResolvers<boolean>();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.question(`  ${question} ${hint} `, (answer) => {
    rl.close();
    const a = answer.trim().toLowerCase();
    if (a === "") res(defaultYes);
    else res(a === "y" || a === "yes");
  });
  return promise;
}

// ── Detection helpers ─────────────────────────────────────────────────────

function ompHooksDir(): string {
  return join(homedir(), ".agents", "hooks", "core");
}

function ompVariantsDir(): string {
  return join(homedir(), ".agents", "hooks", "variants");
}

function claudeDesktopConfigPath(): string {
  if (process.platform === "darwin")
    return join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (process.platform === "win32")
    return join(process.env.APPDATA ?? "", "Claude", "claude_desktop_config.json");
  return join(homedir(), ".config", "Claude", "claude_desktop_config.json");
}

function claudeCommandsDir(): string {
  return join(homedir(), ".claude", "commands");
}

function projectRoot(): string {
  return resolve(dirname(new URL(import.meta.url).pathname), "..");
}

// ── Step implementations ──────────────────────────────────────────────────

function installOmpHook(root: string): void {
  const dest = ompHooksDir();
  mkdirSync(dest, { recursive: true });
  copyFileSync(join(root, "hooks", "fable-safe-hook.ts"), join(dest, "fable-safe-hook.ts"));
  copyFileSync(join(root, "hooks", "fable-safe-rules.ts"), join(dest, "fable-safe-rules.ts"));
  console.log("  ✓ Copied hook files to", dest);

  const variantsDir = ompVariantsDir();
  if (!existsSync(variantsDir)) return;
  for (const entry of readdirSync(variantsDir)) {
    if (!entry.endsWith(".json") || entry.includes("schema")) continue;
    const p = join(variantsDir, entry);
    try {
      const data = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
      const events = data.events as Record<string, unknown[]> | undefined;
      if (!events?.UserPromptSubmit) continue;
      const hooks = events.UserPromptSubmit;
      if (hooks.some((h: unknown) => typeof h === "object" && h !== null && (h as Record<string, unknown>).hook === "fable-safe-hook.ts")) continue;
      hooks.push({ hook: "fable-safe-hook.ts", timeout: 3 });
      writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
      console.log("  ✓ Registered hook in", entry);
    } catch { /* skip malformed variants */ }
  }
}

function installMcp(root: string): void {
  const cfgPath = claudeDesktopConfigPath();
  mkdirSync(dirname(cfgPath), { recursive: true });

  let cfg: Record<string, unknown> = {};
  if (existsSync(cfgPath)) {
    try { cfg = JSON.parse(readFileSync(cfgPath, "utf-8")) as Record<string, unknown>; }
    catch { /* start fresh */ }
  }

  const servers = (cfg.mcpServers ?? {}) as Record<string, unknown>;
  servers["fable-safe"] = {
    command: "bun",
    args: ["run", join(root, "src", "mcp.ts")]
  };
  cfg.mcpServers = servers;
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), "utf-8");
  console.log("  ✓ Registered MCP server in", cfgPath);
  console.log("    Restart Claude Desktop to activate.");
}

function installSlashCommand(root: string): void {
  const dest = claudeCommandsDir();
  mkdirSync(dest, { recursive: true });
  copyFileSync(join(root, ".claude", "commands", "fs.md"), join(dest, "fs.md"));
  console.log("  ✓ Installed /fs command to", dest);
}

function installSkill(root: string): void {
  const dest = join(homedir(), ".agents", "skills", "oma-fable-safe-prompt");
  mkdirSync(join(dest, "resources"), { recursive: true });
  copyFileSync(join(root, "skill", "SKILL.md"), join(dest, "SKILL.md"));
  copyFileSync(join(root, "skill", "resources", "swaps.md"), join(dest, "resources", "swaps.md"));
  console.log("  ✓ Installed skill to", dest);
}

function installGlobalCli(): void {
  const proc = Bun.spawnSync(["bun", "link"], { cwd: projectRoot(), stderr: "pipe" });
  if (proc.exitCode === 0) {
    console.log("  ✓ Global CLI linked — run `fable-safe --help` from anywhere.");
  } else {
    console.log("  ✗ bun link failed:", new TextDecoder().decode(proc.stderr));
    console.log("    Manual: cd", projectRoot(), "&& bun link");
  }
}

// ── Main wizard ───────────────────────────────────────────────────────────

export async function runSetup(): Promise<void> {
  const root = projectRoot();
  console.log("\n╔═══════════════════════════════════════╗");
  console.log("║     fable-safe setup wizard           ║");
  console.log("╚═══════════════════════════════════════╝\n");

  // OMP / OpenCode hook
  const ompPresent = existsSync(ompHooksDir()) || existsSync(join(homedir(), ".agents"));
  if (ompPresent) {
    console.log("● OMP / OpenCode hooks directory detected.");
    if (await ask("Install hook (rewrites 'fs …' prompts automatically)?")) {
      installOmpHook(root);
    }
  } else {
    console.log("○ OMP hooks directory not found — skipping hook install.");
    console.log("  (Install OMP first, then re-run `fable-safe setup`.)");
  }

  // Claude Desktop MCP
  const mcpDirPresent = existsSync(dirname(claudeDesktopConfigPath()));
  const mcpLabel = mcpDirPresent ? "Claude Desktop config detected." : "Claude Desktop not found — will create config.";
  console.log(`\n● ${mcpLabel}`);
  if (await ask("Register MCP server (adds rewrite_prompt tool to Claude Desktop)?")) {
    installMcp(root);
  }

  // /fs slash command
  console.log("\n● Claude Code / Claude Desktop slash commands.");
  if (await ask("Install /fs toggle command to ~/.claude/commands/?")) {
    installSlashCommand(root);
  }

  // OMP skill
  if (ompPresent) {
    console.log("\n● OMP skill (lets agents apply rewrites by reasoning).");
    if (await ask("Install oma-fable-safe-prompt skill to ~/.agents/skills/?")) {
      installSkill(root);
    }
  }

  // Global CLI
  console.log("\n● Global CLI (run `fable-safe` from any directory).");
  if (await ask("Link global CLI with `bun link`?")) {
    installGlobalCli();
  }

  console.log("\n✓ Setup complete.\n");
  console.log("  Quick-start:");
  console.log("    fs bypass anti-cheat             # one-shot via prefix");
  console.log("    /fs                              # toggle auto-rewrite mode");
  console.log("    fable-safe status                # check installation");
  console.log("    fable-safe add-rule trigger rep  # add custom rule");
  console.log();
}
