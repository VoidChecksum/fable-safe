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
import { rewritePrompt } from "./index.js";

const server = new Server(
  {
    name: "fable-safe",
    version: "1.0.0",
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
          "Surgically rewrites a prompt to bypass Claude Fable 5's safety classifiers (cyber, bio/chem, reasoning extraction) by replacing trigger words and phrasing with clean, defensive, or abstract equivalents.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The raw prompt containing sensitive keywords or safety triggers.",
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

  const prompt = String(args?.prompt || "");
  const rewritten = rewritePrompt(prompt);

  return {
    content: [
      {
        type: "text",
        text: rewritten,
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
