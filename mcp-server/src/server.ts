#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { scanDirectory } from "./scan.js";
import { classifyImpact } from "./classify.js";

const server = new McpServer({
  name: "ripplecheck-mcp-server",
  version: "0.1.0",
});

server.registerTool(
  "scan_schema_impact",
  {
    description:
      "Scans a local project directory to identify every file that references a specific " +
      "schema field (database column, TypeScript interface property, GraphQL field, etc.) " +
      "that is about to change or be removed. Returns a structured impact report classifying " +
      "each affected file as 'direct' (uses the field by name) or 'indirect' (structurally " +
      "coupled via wildcard SELECT *, spread operators, Prisma include/select, GraphQL " +
      "fragment spreads, or type aliases of the parent type). " +
      "Call this tool whenever the user asks: which files will break if I rename or delete " +
      "a field, column, or property? What is the blast radius of this schema change? " +
      "Show me what references <fieldName> in my codebase.",
    inputSchema: z.object({
      directory: z
        .string()
        .describe(
          "Absolute path to the project directory to scan (e.g. /Users/alice/my-app)."
        ),
      changedField: z
        .string()
        .describe(
          "The exact field name to search for (e.g. 'userId', 'created_at', 'email'). " +
            "Case-sensitive, matched as a whole word."
        ),
    }),
  },
  async ({ directory, changedField }) => {
    try {
      const files = await scanDirectory(directory);
      const report = classifyImpact(files, changedField);

      const lines: string[] = [
        `## Schema Impact Report`,
        ``,
        `**Changed field:** \`${report.changedField}\``,
        `**Directory scanned:** ${directory}`,
        `**Files scanned:** ${report.scannedFileCount}`,
        `**Direct references:** ${report.directCount}`,
        `**Indirect (structural) references:** ${report.indirectCount}`,
        ``,
      ];

      if (report.impacts.length === 0) {
        lines.push("No references found. Safe to rename or remove.");
      } else {
        // Group by impact level for readability.
        const direct = report.impacts.filter((i) => i.level === "direct");
        const indirect = report.impacts.filter((i) => i.level === "indirect");

        if (direct.length > 0) {
          lines.push("### Direct references (will break immediately)");
          lines.push("");
          for (const entry of direct) {
            lines.push(`**${entry.file}**`);
            for (const m of entry.matches.slice(0, 5)) {
              lines.push(`  - Line ${m.line}: \`${m.text}\``);
            }
            if (entry.matches.length > 5) {
              lines.push(`  - … and ${entry.matches.length - 5} more lines`);
            }
            lines.push("");
          }
        }

        if (indirect.length > 0) {
          lines.push(
            "### Indirect references (structurally coupled — review manually)"
          );
          lines.push("");
          for (const entry of indirect) {
            lines.push(`**${entry.file}**`);
            for (const m of entry.matches.slice(0, 3)) {
              lines.push(`  - Line ${m.line}: \`${m.text}\``);
            }
            if (entry.matches.length > 3) {
              lines.push(`  - … and ${entry.matches.length - 3} more lines`);
            }
            lines.push("");
          }
        }
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `scan_schema_impact failed: ${message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ripplecheck-mcp-server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in ripplecheck-mcp-server:", error);
  process.exit(1);
});
