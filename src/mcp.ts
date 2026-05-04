import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatVueUseDocsSearch, searchVueUseDocs } from "./vueuse-docs.ts";

function textResponse(text: string) {
  return {
    content: [
      {
        type: "text" as const,
        text
      }
    ]
  };
}

export function registerVueUseTools(server: McpServer) {
  server.tool(
    "search_docs",
    "Search VueUse documentation.",
    {
      query: z.string().describe("Search query for VueUse documentation."),
      category: z.string().optional().describe("Optional filter by page category."),
      limit: z.number().int().positive().optional().describe("Limit number of results.")
    },
    async ({ query, category, limit }) => {
      const state = searchVueUseDocs(query, { category, limit });
      return textResponse(formatVueUseDocsSearch(query, state));
    }
  );
}

export function createVueUseMcpServer() {
  return new McpServer({
    name: "vueuse-mcp",
    version: "1.0.0"
  });
}
