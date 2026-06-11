#!/bin/bash
# fable-safe - Installation script for hooks and MCP server
#
# Installs fable-safe hooks in OMP / Claude Code / Cursor / etc.
# and registers the MCP server for Claude Desktop App.

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_DIR="${HOME}/.agents"
HOOKS_CORE_DIR="${AGENTS_DIR}/hooks/core"
VARIANTS_DIR="${AGENTS_DIR}/hooks/variants"

echo "=== Installing fable-safe ==="

# 1. Compile or verify bun is installed
if ! command -v bun &> /dev/null; then
  echo "Error: bun is required but not installed. Please install bun first."
  exit 1
fi

# 2. Copy the hook script to .agents/hooks/core/ if it exists
if [ -d "$HOOKS_CORE_DIR" ]; then
  echo "OMP/Oh-My-Pi hooks directory detected at: $HOOKS_CORE_DIR"
  cp "${PROJECT_DIR}/hooks/fable-safe-hook.ts" "${HOOKS_CORE_DIR}/fable-safe-hook.ts"
  echo "✓ Copied fable-safe-hook.ts to hooks/core"
  
  # Register the hook in variant configurations if not present
  for variant_file in "${VARIANTS_DIR}"/*.json; do
    [ -e "$variant_file" ] || continue
    # Skip schema validation file
    if [[ "$variant_file" == *"schema.json"* ]]; then
      continue
    fi
    
    # Check if fable-safe-hook.ts is registered
    if grep -q "fable-safe-hook.ts" "$variant_file"; then
      echo "✓ Hook already registered in $(basename "$variant_file")"
    else
      echo "Registering hook in $(basename "$variant_file")..."
      # Simple node script to safely update the json
      bun -e "
        const fs = require('fs');
        const file = '$variant_file';
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (data.events && data.events.UserPromptSubmit) {
          if (!data.events.UserPromptSubmit.some(h => h.hook === 'fable-safe-hook.ts')) {
            data.events.UserPromptSubmit.push({ hook: 'fable-safe-hook.ts', timeout: 3 });
            fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
            console.log('  Registered successfully.');
          }
        }
      "
    fi
  done
else
  echo "OMP/Oh-My-Pi hooks directory not found. Skipping hook installation."
fi

# 3. Register MCP server in Claude Desktop App config
CLAUDE_CONFIG_DIR=""
if [[ "$OSTYPE" == "darwin"* ]]; then
  CLAUDE_CONFIG_DIR="${HOME}/Library/Application Support/Claude"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  CLAUDE_CONFIG_DIR="${HOME}/.config/Claude"
fi

CLAUDE_CONFIG_PATH="${CLAUDE_CONFIG_DIR}/claude_desktop_config.json"

if [ -n "$CLAUDE_CONFIG_DIR" ]; then
  mkdir -p "$CLAUDE_CONFIG_DIR"
  
  # Initialize empty config if not present
  if [ ! -f "$CLAUDE_CONFIG_PATH" ]; then
    echo '{"mcpServers":{}}' > "$CLAUDE_CONFIG_PATH"
  fi
  
  echo "Registering MCP server in Claude Desktop configuration at: $CLAUDE_CONFIG_PATH"
  
  bun -e "
    const fs = require('fs');
    const path = '$CLAUDE_CONFIG_PATH';
    const config = JSON.parse(fs.readFileSync(path, 'utf-8'));
    config.mcpServers = config.mcpServers || {};
    config.mcpServers['fable-safe'] = {
      command: 'bun',
      args: ['run', '${PROJECT_DIR}/src/mcp.ts']
    };
    fs.writeFileSync(path, JSON.stringify(config, null, 2), 'utf-8');
    console.log('✓ Registered fable-safe MCP server.');
  "
else
  echo "Unsupported OS for automatic Claude Desktop registration. Please add to your config manually:"
  echo "{"
  echo "  \"mcpServers\": {"
  echo "    \"fable-safe\": {"
  echo "      \"command\": \"bun\","
  echo "      \"args\": [\"run\", \"${PROJECT_DIR}/src/mcp.ts\"]"
  echo "    }"
  echo "  }"
  echo "}"
fi

echo "=== Installation complete ==="
