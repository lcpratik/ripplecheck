#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { scanDirectory } from "./scan.js";
import { classifyImpact } from "./classify.js";
import { generateMigration } from "./migration.js";

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

server.registerTool(
  "generate_migration",
  {
    description:
      "Generates up and down SQL migration statements for a single column change " +
      "(rename or drop) on a PostgreSQL table. Always call scan_schema_impact first to " +
      "discover which files reference the column; pass any trigger or PL/pgSQL function " +
      "names found in that report as dependentFunctions so they are listed in the warning. " +
      "Returns { up, down, warnings } — never writes files. " +
      "Use for: producing the ALTER TABLE SQL before the user applies a schema change.",
    inputSchema: z.object({
      table: z.string().describe("Table name, e.g. 'sightings'."),
      column: z.string().describe("Current column name, e.g. 'upvote_count'."),
      changeType: z
        .enum(["rename", "drop"])
        .describe("'rename' to rename the column, 'drop' to remove it."),
      newName: z
        .string()
        .optional()
        .describe("New column name. Required when changeType is 'rename'."),
      columnType: z
        .string()
        .optional()
        .describe(
          "SQL type for the DOWN migration (e.g. 'INTEGER NOT NULL DEFAULT 0'). " +
            "Required when changeType is 'drop' to make the rollback runnable."
        ),
      dependentFunctions: z
        .array(z.string())
        .optional()
        .describe(
          "Names of PL/pgSQL functions or trigger functions that reference the column, " +
            "as found by scan_schema_impact. Listed in the migration warning."
        ),
    }),
  },
  async ({ table, column, changeType, newName, columnType, dependentFunctions }) => {
    try {
      const result = generateMigration({
        table,
        column,
        changeType,
        newName,
        columnType,
        dependentFunctions,
      });

      const lines: string[] = [
        `## Migration: ${changeType.toUpperCase()} \`${table}.${column}\``,
        ``,
        `### UP`,
        `\`\`\`sql`,
        result.up,
        `\`\`\``,
        ``,
        `### DOWN`,
        `\`\`\`sql`,
        result.down,
        `\`\`\``,
        ``,
        `### Warnings`,
      ];
      for (const w of result.warnings) {
        lines.push(`- ${w}`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `generate_migration failed: ${message}` }],
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
