import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import chalk from "chalk";
import { screenEntity, listStatus } from "./tools.js";
import { initialLoad, startBackgroundRefresh } from "./lib/cache.js";

// ============================================================================
// Dev Logging Utilities
// ============================================================================

const isDev = process.env.NODE_ENV !== "production";

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function formatLatency(ms: number): string {
  if (ms < 100) return chalk.green(`${ms}ms`);
  if (ms < 500) return chalk.yellow(`${ms}ms`);
  return chalk.red(`${ms}ms`);
}

function truncate(str: string, maxLen = 60): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

function logRequest(method: string, params?: unknown): void {
  if (!isDev) return;

  const paramsStr = params ? chalk.gray(` ${truncate(JSON.stringify(params))}`) : "";
  console.log(`${chalk.gray(`[${timestamp()}]`)} ${chalk.cyan("→")} ${method}${paramsStr}`);
}

function logResponse(method: string, result: unknown, latencyMs: number): void {
  if (!isDev) return;

  const latency = formatLatency(latencyMs);

  // For tool calls, show the result
  if (method === "tools/call" && result) {
    const resultStr = typeof result === "string" ? result : JSON.stringify(result);
    console.log(
      `${chalk.gray(`[${timestamp()}]`)} ${chalk.green("←")} ${truncate(resultStr)} ${chalk.gray(`(${latency})`)}`
    );
  } else {
    console.log(`${chalk.gray(`[${timestamp()}]`)} ${chalk.green("✓")} ${method} ${chalk.gray(`(${latency})`)}`);
  }
}

function logError(method: string, error: unknown, latencyMs: number): void {
  const latency = formatLatency(latencyMs);

  let errorMsg: string;
  if (error instanceof Error) {
    errorMsg = error.message;
  } else if (typeof error === "object" && error !== null) {
    // JSON-RPC error object has { code, message, data? }
    const rpcError = error as { message?: string; code?: number };
    errorMsg = rpcError.message || `Error ${rpcError.code || "unknown"}`;
  } else {
    errorMsg = String(error);
  }

  console.log(
    `${chalk.gray(`[${timestamp()}]`)} ${chalk.red("✖")} ${method} ${chalk.red(truncate(errorMsg))} ${chalk.gray(`(${latency})`)}`
  );
}

// ============================================================================
// MCP Server Setup
// ============================================================================

// Build a FRESH MCP server per request.
//
// In stateless streamable-HTTP mode the MCP SDK allows a Server to be connected
// to exactly ONE transport. Reusing a single module-scope instance throws
// "Already connected to a transport" on the second connection — and Cloud Run
// opens several (startup probe + real requests). So always create a new server
// (and a new transport) inside the request handler below.
const matchSchema = z.object({
  matchedName: z.string().describe("The primary name or alias on the list that scored highest against the query."),
  list: z.string().describe("Which official list the match came from, e.g. \"OFAC SDN\"."),
  program: z.string().describe("The sanctions programme/regime this listing falls under."),
  entityType: z.enum(["person", "org", "other"]),
  score: z.number().int().min(0).max(100).describe("Deterministic fuzzy-match score, 0-100."),
  entityId: z.string().describe("Stable identifier for this list entry, e.g. \"OFAC SDN-36\"."),
  details: z.string().optional().describe("Short free-text context from the source list (title, remarks), if any."),
});

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "sanctions-screening",
    version: "1.0.0",
  });

  server.registerTool(
    "screen_entity",
    {
      title: "Screen Entity",
      description:
        "Screen one or more names or companies against the official OFAC SDN, OFAC Consolidated, EU, UK OFSI and UN sanctions lists; returns deterministic scored matches. Primary government sources only - never OpenSanctions or other aggregated data. Example: { \"names\": [\"AeroCaribbean Airlines\"], \"threshold\": 85 }.",
      inputSchema: {
        names: z
          .array(z.string())
          .min(1)
          .describe('One or more person or company names to screen, e.g. ["AeroCaribbean Airlines"].'),
        entityType: z
          .enum(["any", "person", "org"])
          .optional()
          .describe('Narrow matching to persons or organizations only. Defaults to "any".'),
        country: z
          .string()
          .optional()
          .describe('Narrow matching to list entries tagged with this country, e.g. "Cuba". Omit to match any country.'),
        threshold: z
          .number()
          .int()
          .min(0)
          .max(100)
          .optional()
          .describe("Minimum fuzzy-match score (0-100) for a list entry to be returned as a match. Defaults to 85."),
      },
      outputSchema: {
        results: z
          .array(
            z.object({
              query: z.string(),
              isMatch: z.boolean(),
              topScore: z.number().int().min(0).max(100).describe("Highest score found, even if below the threshold."),
              matches: z.array(matchSchema),
            }),
          )
          .describe("One entry per requested name, in the same order."),
      },
    },
    async ({ names, entityType, country, threshold }) => {
      await initialLoad;
      const output = screenEntity(names, { entityType, country, threshold });
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    "list_status",
    {
      title: "List Status",
      description:
        "Report each official sanctions list's cached record count and last-refresh time, so you can confirm data freshness before relying on a screening result. Takes no input.",
      inputSchema: {},
      outputSchema: {
        lists: z.array(
          z.object({
            list: z.string(),
            recordCount: z.number().int(),
            lastRefreshedAt: z.string().nullable(),
            sourceUrl: z.string(),
            stale: z.boolean(),
          }),
        ),
      },
    },
    async () => {
      await initialLoad;
      const output = listStatus();
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    }
  );

  return server;
}

// ============================================================================
// Express App Setup
// ============================================================================

const app = express();
app.use(express.json());

// Health check endpoint (required for Cloud Run)
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "healthy" });
});

// MCP endpoint with dev logging
app.post("/mcp", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const body = req.body;

  // Extract method and params from JSON-RPC request
  const method = body?.method || "unknown";
  const params = body?.params;

  // Log incoming request
  if (method === "tools/call") {
    const toolName = params?.name || "unknown";
    const toolArgs = params?.arguments;
    logRequest(`tools/call ${chalk.bold(toolName)}`, toolArgs);
  } else if (method !== "notifications/initialized") {
    logRequest(method, params);
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  // Capture response body for logging
  let responseBody = "";
  const originalWrite = res.write.bind(res) as typeof res.write;
  const originalEnd = res.end.bind(res) as typeof res.end;

  res.write = function (chunk: unknown, encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void), callback?: (error: Error | null | undefined) => void) {
    if (chunk) {
      responseBody += typeof chunk === "string" ? chunk : Buffer.from(chunk as ArrayBuffer).toString();
    }
    return originalWrite(chunk as string, encodingOrCallback as BufferEncoding, callback);
  };

  res.end = function (chunk?: unknown, encodingOrCallback?: BufferEncoding | (() => void), callback?: () => void) {
    if (chunk) {
      responseBody += typeof chunk === "string" ? chunk : Buffer.from(chunk as ArrayBuffer).toString();
    }

    // Log response
    if (method !== "notifications/initialized") {
      const latency = Date.now() - startTime;

      try {
        const rpcResponse = JSON.parse(responseBody) as { result?: unknown; error?: unknown };

        if (rpcResponse?.error) {
          logError(method, rpcResponse.error, latency);
        } else if (method === "tools/call") {
          const content = (rpcResponse?.result as { content?: Array<{ text?: string }> })?.content;
          const resultText = content?.[0]?.text;
          logResponse(method, resultText, latency);
        } else {
          logResponse(method, null, latency);
        }
      } catch {
        logResponse(method, null, latency);
      }
    }

    return originalEnd(chunk as string, encodingOrCallback as BufferEncoding, callback);
  };

  res.on("close", () => {
    transport.close();
  });

  // Fresh server instance per request (see createMcpServer above) — required for
  // stateless streamable-HTTP so a second connection never reuses a transport.
  const server = createMcpServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// JSON error handler (Express defaults to HTML errors)
app.use((_err: unknown, _req: Request, res: Response, _next: Function) => {
  res.status(500).json({ error: "Internal server error" });
});

// ============================================================================
// Start Server
// ============================================================================

const port = parseInt(process.env.PORT || "8080");
const httpServer = app.listen(port, () => {
  console.log();
  console.log(chalk.bold("MCP Server running on"), chalk.cyan(`http://localhost:${port}`));
  console.log(`  ${chalk.gray("Health:")} http://localhost:${port}/health`);
  console.log(`  ${chalk.gray("MCP:")}    http://localhost:${port}/mcp`);

  if (isDev) {
    console.log();
    console.log(chalk.gray("─".repeat(50)));
    console.log();
  }
});

// Health check responds immediately - the initial ~70MB list download/parse
// (see lib/cache.ts) happens in the background and tool calls simply await
// it, so it never blocks server startup or Cloud Run's readiness probe.
startBackgroundRefresh();
void initialLoad.then(() => console.log(chalk.gray("[sanctions-screening] Initial list load complete")));

// Graceful shutdown for Cloud Run (SIGTERM before kill)
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down...");
  httpServer.close(() => {
    process.exit(0);
  });
});
