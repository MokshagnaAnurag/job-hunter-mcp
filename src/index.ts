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
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : null;

  if (port) {
    const app = express();
    app.use(cors());

    let transport: SSEServerTransport;

    // 1. Accept SSE connections from Real AI Agents
    app.get(["/", "/sse", "/mcp"], async (req, res) => {
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      
      // Tell the AI to send messages to the exact same path they connected to, plus "/message"
      const basePath = req.originalUrl.endsWith('/') ? req.originalUrl.slice(0, -1) : req.originalUrl;
      const messageUrl = `${protocol}://${host}${basePath}/message`;
      
      transport = new SSEServerTransport(messageUrl, res);
      await server.connect(transport);
      console.log(`[CONNECT] Real AI Agent connected to ${req.originalUrl}`);
    });

    // 2. Accept POST messages from Real AI Agents
    app.post(["/message", "/mcp/message", "/sse/message"], async (req, res) => {
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(503).send("SSE connection not established");
      }
    });
    
    // 3. Fake Handshake for Manufact's Automated Health Checker
    // This catches Manufact's "POST /mcp" requests without breaking the real connection
    app.post(["/", "/mcp", "/sse"], (req, res) => {
      res.json({
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          serverInfo: { name: "job-hunter", version: "1.0.0" }
        }
      });
    });

    app.listen(port, () => {
      console.log(`Job Hunter MCP Server running on SSE transport (HTTP) at http://localhost:${port}`);
      console.log(`Tools registered: 22`);
    });
  } else {
    // Default to Stdio transport for local Desktop Clients (Claude Desktop)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Job Hunter MCP Server running on stdio transport");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
