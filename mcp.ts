// Entry point: node dist/mcp.js — the stdio MCP server with the one tool, score_member_match.
import { main } from "./src/mcp-server.js";

main().catch((e) => {
  console.error(e); // stderr only: stdout belongs to the MCP protocol
  process.exit(1);
});
