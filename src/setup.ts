/**
 * fable-safe — interactive setup wizard
 *
 * Installs fable-safe into Claude Code CLI, Claude Desktop, OpenCode, and OMP.
 * Run via `fable-safe setup`.
 */

import {
  copyFileSync, existsSync, mkdirSync, readFileSync,
  readdirSync, writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";

// ── Readline prompt ───────────────────────────────────────────────────────

async function ask(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const { promise, resolve: res } = Promise.withResolvers<boolean>();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.question(`  ${question} ${hint} `, (answer) => {
    rl.close();
    const a = answer.trim().toLowerCase();
    res(a === "" ? defaultYes : a === "y" || a === "yes");
  });
  return promise;
}

// ── Detection helpers ─────────────────────────────────────────────────────

/** The directory where this package is installed. */
function projectRoot(): string {
  const pathname = new URL(import.meta.url).pathname;
  // On Windows, file:///C:/Users/... yields pathname = /C:/Users/...
  // Decode percent-encoding and strip the leading slash on win32.
  const filePath = process.platform === "win32"
    ? decodeURIComponent(pathname.slice(1))
    : decodeURIComponent(pathname);
  return resolve(dirname(filePath), "..");
}

// OMP / OpenCode (oh-my-openagent)
function ompHooksDir(): string {
  return join(homedir(), ".agents", "hooks", "core");
}
function ompVariantsDir(): string {
  return join(homedir(), ".agents", "hooks", "variants");
}
function ompSkillsDir(): string {
  return join(homedir(), ".agents", "skills");
}

// Claude Code CLI
function claudeCodeSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}
function claudeCodeCommandsDir(): string {
  return join(homedir(), ".claude", "commands");
}

// Claude Desktop
function claudeDesktopConfigPath(): string {
  if (process.platform === "darwin")
    return join(
      homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  if (process.platform === "win32")
    return join(
      process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
      "Claude",
      "claude_desktop_config.json",
    );
  // Linux: Claude Desktop uses XDG_CONFIG_HOME/Claude, not ~/.config/Claude (Electron cache)
  return join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "Claude",
    "claude_desktop_config.json",
  );
}

// OpenCode
function openCodeConfigPath(): string {
  // Windows: %APPDATA%\opencode\opencode.json
  // Unix: $XDG_CONFIG_HOME/opencode/opencode.json or ~/.config/opencode/opencode.json
  if (process.platform === "win32")
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "opencode", "opencode.json");
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "opencode", "opencode.json");
}

// ── Detection booleans ────────────────────────────────────────────────────

function detectClaudeCode(): boolean {
  return existsSync(join(homedir(), ".claude"));
}
function detectOmp(): boolean {
  return existsSync(join(homedir(), ".agents"));
}
function detectOpenCode(): boolean {
  const cfgDir = process.platform === "win32"
    ? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "opencode")
    : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "opencode");
  return existsSync(cfgDir);
}
function detectClaudeDesktop(): boolean {
  return existsSync(dirname(claudeDesktopConfigPath()));
}

// ── Install: Claude Code CLI hook ─────────────────────────────────────────

function installClaudeCodeHook(root: string): void {
  // Copy the standalone hook + rules engine
  const dest = join(homedir(), ".claude", "hooks");
  mkdirSync(dest, { recursive: true });
  copyFileSync(
    join(root, "hooks", "claude-code-hook.ts"),
    join(dest, "fable-safe-hook.ts"),
  );
  copyFileSync(
    join(root, "hooks", "fable-safe-rules.ts"),
    join(dest, "fable-safe-rules.ts"),
  );
  console.log("  ✓ Copied hook files to", dest);

  // Patch ~/.claude/settings.json
  const settingsPath = claudeCodeSettingsPath();
  mkdirSync(dirname(settingsPath), { recursive: true });

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
    } catch { /* start fresh */ }
  }

  const hookCommand = `bun run "${join(dest, "fable-safe-hook.ts")}"`;
  const hookEntry = { type: "command", command: hookCommand, timeout: 3 };

  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
  const ups = (hooks.UserPromptSubmit ?? []) as Array<{ hooks?: Array<Record<string, unknown>> }>;

  const alreadyRegistered = ups.some((group) =>
    group.hooks?.some((h) => typeof h.command === "string" && h.command.includes("fable-safe-hook.ts"))
  );

  if (!alreadyRegistered) {
    ups.push({ hooks: [hookEntry] });
  }

  hooks.UserPromptSubmit = ups;
  settings.hooks = hooks;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
  console.log("  ✓ Registered UserPromptSubmit hook in", settingsPath);
  console.log("    Reload Claude Code or start a new session to activate.");
}

// ── Install: Claude Code MCP ──────────────────────────────────────────────

function installClaudeCodeMcp(root: string): void {
  const mcpEntry = join(root, "src", "mcp.ts");
  const proc = Bun.spawnSync(
    ["claude", "mcp", "add", "fable-safe", "-s", "user", "--", "bun", "run", mcpEntry],
    { stderr: "pipe", stdout: "pipe" },
  );
  if (proc.exitCode === 0) {
    console.log("  ✓ Registered MCP server via `claude mcp add` (user scope).");
    console.log("    Provides rewrite_prompt tool in all Claude Code sessions.");
    return;
  }
  // Fallback: write directly into ~/.claude.json (same location claude mcp add -s user uses)
  const userCfgPath = join(homedir(), ".claude.json");
  let userCfg: Record<string, unknown> = {};
  if (existsSync(userCfgPath)) {
    try { userCfg = JSON.parse(readFileSync(userCfgPath, "utf-8")) as Record<string, unknown>; }
    catch { /* start fresh */ }
  }
  const mcpServers = (userCfg.mcpServers ?? {}) as Record<string, unknown>;
  mcpServers["fable-safe"] = { command: "bun", args: ["run", mcpEntry] };
  userCfg.mcpServers = mcpServers;
  writeFileSync(userCfgPath, JSON.stringify(userCfg, null, 2), "utf-8");
  console.log("  ✓ Registered MCP server in", userCfgPath, "(fallback).");
}

// ── Install: Claude Desktop MCP ───────────────────────────────────────────

function installClaudeDesktopMcp(root: string): void {
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
    args: ["run", join(root, "src", "mcp.ts")],
  };
  cfg.mcpServers = servers;
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), "utf-8");
  console.log("  ✓ Registered MCP server in", cfgPath);
  console.log("    Restart Claude Desktop to activate.");
}

// ── Install: OpenCode MCP ─────────────────────────────────────────────────

function installOpenCodeMcp(root: string): void {
  const cfgPath = openCodeConfigPath();
  mkdirSync(dirname(cfgPath), { recursive: true });

  let cfg: Record<string, unknown> = {};
  if (existsSync(cfgPath)) {
    try { cfg = JSON.parse(readFileSync(cfgPath, "utf-8")) as Record<string, unknown>; }
    catch { /* start fresh */ }
  }

  const mcp = (cfg.mcp ?? {}) as Record<string, unknown>;
  mcp["fable-safe"] = {
    type: "local",
    command: ["bun", "run", join(root, "src", "mcp.ts")],
  };
  cfg.mcp = mcp;
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), "utf-8");
  console.log("  ✓ Registered MCP server in", cfgPath);
  console.log("    Restart OpenCode to activate.");
}

// ── Install: OMP hook ─────────────────────────────────────────────────────

function installOmpHook(root: string): void {
  const dest = ompHooksDir();
  mkdirSync(dest, { recursive: true });
  copyFileSync(
    join(root, "hooks", "fable-safe-hook.ts"),
    join(dest, "fable-safe-hook.ts"),
  );
  copyFileSync(
    join(root, "hooks", "fable-safe-rules.ts"),
    join(dest, "fable-safe-rules.ts"),
  );
  console.log("  ✓ Copied hook files to", dest);

  const variantsDir = ompVariantsDir();
  if (!existsSync(variantsDir)) {
    console.log("  ! No variants dir — hook files copied but not registered.");
    console.log("    Add to your variant JSON manually:", dest + "/fable-safe-hook.ts");
    return;
  }

  let patched = 0;
  for (const entry of readdirSync(variantsDir)) {
    if (!entry.endsWith(".json") || entry.includes("schema")) continue;
    const p = join(variantsDir, entry);
    try {
      const data = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
      const events = data.events as Record<string, unknown[]> | undefined;
      if (!events?.UserPromptSubmit) continue;
      const hooksList = events.UserPromptSubmit;
      const already = hooksList.some(
        (h: unknown) =>
          typeof h === "object" &&
          h !== null &&
          (h as Record<string, unknown>).hook === "fable-safe-hook.ts",
      );
      if (already) continue;
      hooksList.push({ hook: "fable-safe-hook.ts", timeout: 3 });
      writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
      patched++;
    } catch { /* skip malformed */ }
  }
  if (patched > 0)
    console.log(`  ✓ Registered hook in ${patched} variant config(s).`);
  else
    console.log("  ✓ Hook already registered in all variant configs (or none found).");
}

// ── Install: OMP skill ────────────────────────────────────────────────────

function installOmpSkill(root: string): void {
  const dest = join(ompSkillsDir(), "oma-fable-safe-prompt");
  mkdirSync(join(dest, "resources"), { recursive: true });
  copyFileSync(join(root, "skill", "SKILL.md"), join(dest, "SKILL.md"));
  copyFileSync(
    join(root, "skill", "resources", "swaps.md"),
    join(dest, "resources", "swaps.md"),
  );
  console.log("  ✓ Installed skill to", dest);
}

// ── Install: /fs slash command ────────────────────────────────────────────

function installSlashCommand(root: string): void {
  const dest = claudeCodeCommandsDir();
  mkdirSync(dest, { recursive: true });
  copyFileSync(
    join(root, ".claude", "commands", "fs.md"),
    join(dest, "fs.md"),
  );
  console.log("  ✓ Installed /fs command to", dest);
}

// ── Install: global CLI ───────────────────────────────────────────────────

function installGlobalCli(): void {
  const proc = Bun.spawnSync(["bun", "link"], { cwd: projectRoot(), stderr: "pipe" });
  if (proc.exitCode === 0) {
    console.log("  ✓ Global CLI linked — `fable-safe` available everywhere.");
  } else {
    console.log("  ✗ bun link failed:", new TextDecoder().decode(proc.stderr));
    console.log("    Manual: cd", projectRoot(), "&& bun link");
  }
}

// ── Main wizard ───────────────────────────────────────────────────────────

export async function runSetup(): Promise<void> {
  const root = projectRoot();

  const hasClaudeCode = detectClaudeCode();
  const hasOmp = detectOmp();
  const hasOpenCode = detectOpenCode();
  const hasClaudeDesktop = detectClaudeDesktop();

  console.log("\n╔═══════════════════════════════════════════╗");
  console.log("║     fable-safe — setup wizard             ║");
  console.log("╚═══════════════════════════════════════════╝\n");
  console.log("  Detected:");
  console.log(`    Claude Code CLI    ${hasClaudeCode   ? "✓" : "○"}`);
  console.log(`    Claude Desktop     ${hasClaudeDesktop ? "✓" : "○"}`);
  console.log(`    OpenCode           ${hasOpenCode     ? "✓" : "○"}`);
  console.log(`    OMP / oh-my-agent  ${hasOmp          ? "✓" : "○"}`);
  console.log();

  // ── 1. Claude Code CLI ───────────────────────────────────────────────────
  if (hasClaudeCode) {
    console.log("━━━ Claude Code CLI ━━━━━━━━━━━━━━━━━━━━━━━━");
    if (await ask("Install UserPromptSubmit hook? (intercepts 'fs …' prompts)")) {
      installClaudeCodeHook(root);
    }
    if (await ask("Register MCP server? (adds rewrite_prompt tool inside sessions)")) {
      installClaudeCodeMcp(root);
    }
    if (await ask("Install /fs slash command to ~/.claude/commands/?")) {
      installSlashCommand(root);
    }
    console.log();
  } else {
    console.log("○ Claude Code not found — install from https://claude.ai/code\n");
  }

  // ── 2. Claude Desktop ────────────────────────────────────────────────────
  console.log("━━━ Claude Desktop ━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (hasClaudeDesktop) {
    console.log("  Config detected at:", dirname(claudeDesktopConfigPath()));
  } else {
    console.log("  Config not found — will create it.");
  }
  if (await ask("Register MCP server? (adds rewrite_prompt tool in Claude Desktop)")) {
    installClaudeDesktopMcp(root);
  }
  console.log();

  // ── 3. OpenCode ──────────────────────────────────────────────────────────
  if (hasOpenCode) {
    console.log("━━━ OpenCode ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    if (await ask("Register MCP server in opencode.json? (adds rewrite_prompt tool)")) {
      installOpenCodeMcp(root);
    }
    console.log();
  } else {
    console.log("○ OpenCode not found — skipping.\n");
  }

  // ── 4. OMP / oh-my-agent ─────────────────────────────────────────────────
  if (hasOmp) {
    console.log("━━━ OMP / oh-my-agent ━━━━━━━━━━━━━━━━━━━━━");
    if (await ask("Install UserPromptSubmit hook? (intercepts 'fs …' prompts)")) {
      installOmpHook(root);
    }
    if (await ask("Install oma-fable-safe-prompt skill to ~/.agents/skills/?")) {
      installOmpSkill(root);
    }
    console.log();
  } else {
    console.log("○ OMP not found — skipping.\n");
  }

  // ── 5. Global CLI ─────────────────────────────────────────────────────────
  console.log("━━━ Global CLI ━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (await ask("Link global CLI with `bun link`? (run `fable-safe` from anywhere)")) {
    installGlobalCli();
  }
  console.log();

  console.log("✓ Setup complete.\n");
  console.log("  Quick-start:");
  console.log("    fs reverse engineer the binary        # Claude Code / OMP: prefix");
  console.log("    /fs                                   # Claude Code: toggle auto-rewrite");
  console.log("    fable-safe status                     # check installation state");
  console.log("    fable-safe auto                       # toggle auto-rewrite from CLI");
  console.log("    fable-safe add-rule trigger safe-rep  # add a custom rule");
  console.log();
}
