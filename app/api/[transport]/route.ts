import { createMcpHandler } from "mcp-handler";
import { registerVueUseTools } from "../../../src/mcp.ts";

const handler = createMcpHandler(
  (server) => {
    registerVueUseTools(server);
  },
  {},
  {
    basePath: "/api"
  }
);

export const runtime = "nodejs";

export { handler as GET, handler as POST, handler as DELETE };
