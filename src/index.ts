import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import chalk from "chalk";
import { screenEntity, monitorChanges, exportList, listStatus } from "./tools.js";
import { initialLoad, startBackgroundRefresh } from "./cache.js";

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
const LIST_NAMES = ["OFAC SDN", "OFAC Consolidated", "EU Consolidated", "UK OFSI", "UN Consolidated"] as const;

const subjectSchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    entityType: z.enum(["any", "person", "org"]).optional(),
    yearOfBirth: z.number().int().optional(),
    dob: z.string().optional().describe("ISO date YYYY-MM-DD, if known."),
    country: z.string().optional(),
    nationality: z.string().optional(),
    idNumber: z.string().optional(),
    passport: z.string().optional(),
    regNumber: z.string().optional(),
    lei: z.string().optional(),
    program: z.string().optional().describe("Restrict this subject's matches to a programme, e.g. \"IRAN\"."),
  }),
]);

const screenOptionsSchema = {
  entityType: z.enum(["any", "person", "org"]).optional().describe('Narrow matching to persons or organizations only. Defaults to "any".'),
  threshold: z.number().int().min(0).max(100).optional().describe("Minimum fuzzy-match score (0-100) for a list entry to be returned as a match. Defaults to 85."),
  fuzzy: z.boolean().optional().describe("Typo/word-order/transliteration-tolerant matching. Defaults to true; false requires an exact (or punctuation-only-different) match."),
  lists: z.array(z.enum(LIST_NAMES)).optional().describe("Restrict screening to specific lists. Omit to screen all 5."),
  whitelist: z.array(z.string()).optional().describe('Names or list entityIds (e.g. "OFAC SDN-36") from prior decisions to suppress.'),
};

const riskIndicatorSchema = z.object({ code: z.string(), label: z.string() });

const matchSchema = z.object({
  matchedName: z.string(),
  aliasHit: z.string().optional().describe("The specific alias that scored highest, if different from matchedName."),
  confidence: z.number().int().min(0).max(100),
  matchType: z.enum(["exact", "strong-fuzzy", "fuzzy", "alias", "transliteration", "crypto-address"]),
  sources: z.array(
    z.object({
      list: z.string(),
      entityId: z.string(),
      program: z.string(),
      listVersion: z.string(),
      sourceUrl: z.string(),
    }),
  ).describe("Every list this same entity appears on, consolidated - not one row per list."),
  riskIndicators: z.array(riskIndicatorSchema),
  falsePositiveAnalysis: z.object({
    mismatchSignals: z.array(z.string()),
    likelyFalsePositive: z.boolean(),
    reason: z.string(),
  }),
  autoCleared: z.boolean(),
  ownershipRisk: z.object({
    flagged: z.boolean(),
    linkedEntities: z.array(z.string()),
    note: z.string(),
  }),
});

const screeningSummarySchema = z.object({
  subject: z.string(),
  verdict: z.enum(["CLEAR", "REVIEW", "ESCALATE"]),
  recommendedAction: z.string(),
  priorityScore: z.number().int().min(0).max(100),
  matchCount: z.number().int(),
  highestConfidence: z.number().int().min(0).max(100),
  narrative: z.string(),
  matches: z.array(matchSchema),
  whitelisted: z.boolean(),
});

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "sanctions-screening",
    version: "2.0.0",
  });

  server.registerTool(
    "screen_entity",
    {
      title: "Screen Entity",
      description:
        "Screen one or more names, companies or crypto addresses (AML/KYC/PEP watchlist check) against the official OFAC SDN, OFAC Consolidated, EU, UK OFSI and UN sanctions lists. Cross-list matches are consolidated into one result per identity, with risk-programme flags, false-positive analysis and an OFAC 50%-rule ownership signal. Example: { \"subjects\": [\"AeroCaribbean Airlines\"], \"threshold\": 85 }.",
      inputSchema: {
        subjects: z.array(subjectSchema).min(1).describe('Plain names, or objects for richer matching, e.g. ["AeroCaribbean Airlines"] or [{"name": "...", "country": "Cuba"}].'),
        ...screenOptionsSchema,
        generateCertificate: z.boolean().optional().describe("Render a PDF Sanctions Screening Certificate (base64) covering every subject in this call."),
      },
      outputSchema: {
        results: z.array(screeningSummarySchema).describe("One entry per requested subject, in the same order."),
        certificatePdfBase64: z.string().optional(),
      },
    },
    async (input) => {
      await initialLoad;
      const output = await screenEntity(input);
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    "monitor_changes",
    {
      title: "Monitor Changes",
      description:
        "Re-screens subjects against the freshly-cached lists and reports only what changed versus a prior result set you supply back (previousResults - your own copy of an earlier screen_entity/monitor_changes \"results\" array). Use this to detect new hits, newly-cleared subjects, or list updates without re-reading every unchanged subject.",
      inputSchema: {
        subjects: z.array(subjectSchema).min(1),
        previousResults: z.array(z.unknown()).describe("The \"results\" array from a prior screen_entity or monitor_changes call, for the same subjects."),
        ...screenOptionsSchema,
      },
      outputSchema: {
        changedCount: z.number().int(),
        unchangedCount: z.number().int(),
        changes: z.array(
          z.object({
            subject: z.string(),
            changeType: z.enum(["new-hit", "newly-cleared", "list-version-changed", "score-changed"]),
            detail: z.string(),
            current: screeningSummarySchema,
            previous: screeningSummarySchema.optional(),
          }),
        ),
        checkedAt: z.string(),
      },
    },
    async (input) => {
      await initialLoad;
      const output = await monitorChanges(input);
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    "export_list",
    {
      title: "Export List",
      description: "Dump one official sanctions list as clean structured data (CSV, JSON, or base64 XLSX) - commodity mode, no screening.",
      inputSchema: {
        list: z.enum(LIST_NAMES),
        format: z.enum(["csv", "json", "xlsx"]).optional().describe("Defaults to csv."),
      },
      outputSchema: {
        list: z.string(),
        format: z.enum(["csv", "json", "xlsx"]),
        recordCount: z.number().int(),
        csv: z.string().optional(),
        json: z.array(z.unknown()).optional(),
        xlsxBase64: z.string().optional(),
      },
    },
    async (input) => {
      await initialLoad;
      const output = await exportList(input);
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
