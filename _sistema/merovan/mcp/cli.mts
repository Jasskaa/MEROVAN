// Command-line bridge to the MEROVAN tool server, for sessions where the MCP server is not loaded.
// Same tools and rules: it starts mcp/server.mts and calls one tool.
//
//   npm run merovan -- lista                         (tools and their parameters)
//   npm run merovan -- ver_producto '{"code":"PRD-0001"}'
//   npm run merovan -- crear_producto @datos.json    (arguments from a JSON file)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const APP = resolve(import.meta.dirname, "..");
const [tool = "lista", raw = "{}"] = process.argv.slice(2);
const args = JSON.parse(raw.startsWith("@") ? readFileSync(resolve(raw.slice(1)), "utf8") : raw);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["--no-deprecation", "--conditions=react-server", "--import", "tsx", resolve(APP, "mcp/server.mts")],
  cwd: APP,
  env: { ...process.env, TSX_TSCONFIG_PATH: resolve(APP, "tsconfig.json") } as Record<string, string>,
  stderr: "inherit",
});
const client = new Client({ name: "merovan-cli", version: "1.0.0" });
await client.connect(transport);

try {
  if (tool === "lista") {
    const { tools } = await client.listTools();
    for (const t of tools) {
      const props = Object.keys((t.inputSchema as { properties?: object }).properties ?? {});
      console.log(`${t.name}(${props.join(", ")})\n  ${t.description}`);
    }
  } else {
    const r = (await client.callTool({ name: tool, arguments: args })) as { isError?: boolean; content: { type: string; text?: string }[] };
    for (const c of r.content) if (c.text) console.log(c.text);
    process.exitCode = r.isError ? 1 : 0;
  }
} finally {
  await client.close();
}
