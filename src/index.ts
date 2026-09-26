// ═══════════════════════════════════════════════════════════════════
// MCP Server Entry Point
// ═══════════════════════════════════════════════════════════════════

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createJobHunterServer } from "./server.js";
import express from "express";
import cors from "cors";

async function main(): Promise<void> {
  const server = createJobHunterServer();

  // If PORT is provided, assume cloud deployment (SSE/HTTP)
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : null;

  if (port) {
    const app = express();
    app.use(cors());

    let transport: SSEServerTransport;

    // SSE endpoint for AI clients to connect
    app.get("/sse", async (req, res) => {
      transport = new SSEServerTransport("/message", res);
      await server.connect(transport);
    });

    // Endpoint for AI clients to send messages to the server
    app.post("/message", async (req, res) => {
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(503).send("SSE connection not established");
      }
    });

    // Health check for deployment platforms
    app.get("/health", (req, res) => res.send("OK"));

    app.listen(port, () => {
      console.log(`Job Hunter MCP Server running on SSE transport (HTTP) at http://localhost:${port}`);
      console.log(`SSE URL: http://localhost:${port}/sse`);
      console.log(`Tools registered: 22`);
    });
  } else {
    // Default to Stdio transport for local Desktop Clients (Claude Desktop)
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("Job Hunter MCP Server running on stdio transport");
    console.error("Tools registered: 22");
    console.error("Ready to accept connections.");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
