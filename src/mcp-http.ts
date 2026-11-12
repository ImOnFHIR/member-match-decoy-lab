/**
 * MCP server over Streamable HTTP, stateless: POST /mcp, one fresh server and transport per request.
 * The same createMcpServer() the stdio entry uses, so both modes list the same tool and return the same results.
 * GET /healthz answers 200 "ok". Plain JSON errors. No model API key or spend config is read here.
 *   PORT=8080 node dist/mcp-http.js
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp-server.js";

export const MAX_BODY_BYTES = 1_000_000;
export const REQUEST_TIMEOUT_MS = 30_000;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers = {}) {
  if (res.headersSent) return;
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

const rpcError = (code: number, message: string) => ({
  jsonrpc: "2.0",
  error: { code, message },
  id: null,
});

async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, "Request body too large");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Body is not valid JSON");
  }
}

async function handleMcp(req: IncomingMessage, res: ServerResponse, limit: number) {
  if (req.method !== "POST") {
    return sendJson(res, 405, rpcError(-32000, "Method not allowed: POST only"), { allow: "POST" });
  }
  const body = await readJson(req, limit);
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless: no session ids
    enableJsonResponse: true,
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

export function createHttpServer(
  o: { maxBodyBytes?: number; requestTimeoutMs?: number } = {},
): Server {
  const limit = o.maxBodyBytes ?? MAX_BODY_BYTES;
  const server = createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0];
    void (async () => {
      try {
        if (path === "/healthz" && (req.method === "GET" || req.method === "HEAD")) {
          res.writeHead(200, { "content-type": "text/plain" });
          return void res.end(req.method === "HEAD" ? undefined : "ok");
        }
        if (path === "/mcp") return await handleMcp(req, res, limit);
        sendJson(res, 404, { error: "Not found" });
      } catch (e) {
        if (e instanceof HttpError) {
          return sendJson(res, e.status, rpcError(e.status === 400 ? -32700 : -32600, e.message));
        }
        console.error(e);
        sendJson(res, 500, rpcError(-32603, "Internal server error"));
      }
    })();
  });
  server.requestTimeout = o.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  server.headersTimeout = Math.min(server.requestTimeout, 15_000);
  return server;
}

export function main() {
  const port = Number(process.env.PORT ?? 8080);
  const server = createHttpServer();
  server.listen(port, "0.0.0.0", () => console.error(`member-match-decoy-lab MCP on :${port}/mcp`));
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
