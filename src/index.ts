import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createVueUseMcpServer, registerVueUseTools } from "./mcp.ts";

async function main() {
  const server = createVueUseMcpServer();
  registerVueUseTools(server);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.log("✅ vueuse-mcp server started successfully");
}

main().catch((err) => {
  console.error("❌ Failed to start server:", err);
  process.exit(1);
});
