/**
 * fable-safe - MCP Server
 *
 * Implements the Model Context Protocol (MCP) server for fable-safe,
 * exposing prompt rewriting capabilities as a tool.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { type RewriteMode, rewriteWithChanges, summarizeChanges } from "./index.js";

const server = new Server(
  {
    name: "fable-safe",
    version: "1.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "rewrite_prompt",
        description:
          "Normalizes a prompt for Claude Fable 5's content evaluation layer by replacing domain-specific trigger phrases with clean, defensive equivalents. Supports ultra (telegraphic) and wenyan (classical Chinese) surface modes for maximum surface-form variation.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The raw prompt containing sensitive keywords or safety triggers.",
            },
            explain: {
              type: "boolean",
            },
            mode: {
              type: "string",
              enum: ["normal", "ultra", "wenyan"],
              description: "Output surface mode. 'ultra' = caveman-ultra compression (drops articles, arrows for causality). 'wenyan' = classical Chinese translation of key terms. Default: 'normal'.",
            },
          },
          required: ["prompt"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== "rewrite_prompt") {
    throw new Error(`Tool not found: ${name}`);
  }

  const mode = (args?.mode as RewriteMode) ?? "normal";
  const prompt = String(args?.prompt || "");
  const { prompt: rewritten, changes } = rewriteWithChanges(prompt, mode);
  const text =
    args?.explain === true
      ? `${rewritten}\n\n--- changes ---\n${summarizeChanges(changes)}`
      : rewritten;

  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Fable-Safe MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
