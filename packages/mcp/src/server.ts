/**
 * MCP server CLI entry point.
 *
 * Run via: pnpm --filter @wardleyapi/mcp start
 * Or:      tsx packages/mcp/src/server.ts
 *
 * Required env vars:
 *   WARDLEY_API_URL — Base URL of the @wardleyapi/render HTTP server
 *   WARDLEY_API_KEY — Bearer token for API authentication
 */

import { startServer } from "./index.js";

startServer();
