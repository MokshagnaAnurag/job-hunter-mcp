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

    // Map to keep track of multiple AI agents connecting at once
    const transports = new Map<string, SSEServerTransport>();

    // Accept SSE connections
    app.get(["/", "/sse", "/mcp"], async (req, res) => {
      // Generate a unique session ID for this connection
      const sessionId = Math.random().toString(36).substring(7);
      
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      
      // Tell the client to include their specific Session ID in all messages
      const messageUrl = `${protocol}://${host}/message?sessionId=${sessionId}`;
      
      const transport = new SSEServerTransport(messageUrl, res);
      transports.set(sessionId, transport);
      
      await server.connect(transport);
      console.log(`[CONNECT] New agent connected! Session: ${sessionId}`);
    });

    // Accept MCP messages
    app.post(["/", "/message", "/mcp/message", "/mcp"], async (req, res) => {
      const sessionId = req.query.sessionId as string;
      const transport = transports.get(sessionId);
      
      if (transport) {
        // If it's a real AI agent (like Antigravity), process the message safely
        await transport.handlePostMessage(req, res);
      } else {
        // If it's the Manufact automated health checker pinging us, give it a fake handshake
        res.json({
          jsonrpc: "2.0",
          id: 1,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            serverInfo: { name: "job-hunter", version: "1.0.0" }
          }
        });
      }
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
