#!/usr/bin/env bash
# fable-safe — one-liner installer
#
#   curl -fsSL https://raw.githubusercontent.com/VoidChecksum/fable-safe/main/install.sh | bash
#
# What this does:
#   1. Checks for bun; installs it if missing (via the official script).
#   2. Clones / pulls fable-safe into $FABLE_SAFE_DIR (default: ~/.local/share/fable-safe).
#   3. Runs `bun install` inside the repo.
#   4. Runs `bun link` to make `fable-safe` available globally.
#   5. Invokes the setup wizard so you can choose what to wire up.

set -euo pipefail

REPO="https://github.com/VoidChecksum/fable-safe.git"
INSTALL_DIR="${FABLE_SAFE_DIR:-$HOME/.local/share/fable-safe}"

# ── Colour helpers ────────────────────────────────────────────────────────
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
dim()   { printf '\033[2m%s\033[0m\n' "$*"; }
err()   { printf '\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }

bold "
╔═══════════════════════════════════════╗
║  fable-safe — one-line installer      ║
╚═══════════════════════════════════════╝
"

# ── 1. Bun ────────────────────────────────────────────────────────────────
if ! command -v bun &>/dev/null; then
  dim "bun not found — installing..."
  curl -fsSL https://bun.sh/install | bash
  # Source the new bun path without requiring the user to open a new shell
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi
BUN_VERSION=$(bun --version)
green "✓ bun $BUN_VERSION"

# ── 2. Clone or update repo ───────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  dim "Updating existing checkout at $INSTALL_DIR..."
  git -C "$INSTALL_DIR" pull --ff-only --quiet
  green "✓ Updated to $(git -C "$INSTALL_DIR" rev-parse --short HEAD)"
else
  dim "Cloning into $INSTALL_DIR..."
  git clone --quiet --depth 1 "$REPO" "$INSTALL_DIR"
  green "✓ Cloned $(git -C "$INSTALL_DIR" rev-parse --short HEAD)"
fi

# ── 3. Install dependencies ───────────────────────────────────────────────
dim "Installing dependencies..."
bun install --cwd "$INSTALL_DIR" --frozen-lockfile --silent
green "✓ Dependencies installed"

# ── 4. Global CLI link ────────────────────────────────────────────────────
dim "Linking global CLI..."
bun link --cwd "$INSTALL_DIR" 2>/dev/null || true
if command -v fable-safe &>/dev/null; then
  green "✓ 'fable-safe' available globally"
else
  # Fallback: create wrapper in ~/.local/bin
  BIN_DIR="$HOME/.local/bin"
  mkdir -p "$BIN_DIR"
  cat > "$BIN_DIR/fable-safe" <<WRAPPER
#!/usr/bin/env bash
exec bun run "$INSTALL_DIR/src/cli.ts" "\$@"
WRAPPER
  chmod +x "$BIN_DIR/fable-safe"
  green "✓ Wrapper installed to $BIN_DIR/fable-safe"
  if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo ""
    dim "  Add to your shell profile:"
    dim "    export PATH=\"\$HOME/.local/bin:\$PATH\""
  fi
fi

# ── 5. Setup wizard ───────────────────────────────────────────────────────
echo ""
bold "Running setup wizard…"
echo ""
fable-safe setup

dim "
Done. Quick-start:
  fs reverse engineer this binary       # one-shot rewrite with prefix
  /fs                                   # toggle auto-rewrite mode in Claude Code
  fable-safe status                     # check what's configured
  fable-safe --help                     # all options
"
