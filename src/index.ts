import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { registerMongoTools } from "./tools/mongo.js";
import { registerBrainTools } from "./tools/brain.js";
import { registerApiTools } from "./tools/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sangat Penting untuk MCP: Arahkan semua console.log ke console.error
// agar output dari library apa pun (seperti dotenv) tidak merusak jalur komunikasi JSON-RPC di stdout.
console.log = console.error; 

// Arahkan dotenv untuk secara eksplisit membaca file .env di root proyek mcp-server
// Ini penting karena MCP client mungkin menjalankan file ini dari directory yang berbeda (misalnya dari nismara-logistics)
dotenv.config({ 
  path: path.join(__dirname, '..', '.env'),
  quiet: true 
} as any);

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/nismara";

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  console.error("Connected to MongoDB"); // Use stderr for logs, as stdout is for MCP communication

  const db = client.db();

  const server = new McpServer({
    name: "nismara-mcp-server",
    version: "1.0.0",
  });

  // Register Tools
  registerMongoTools(server, db);
  registerBrainTools(server);
  registerApiTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Nismara MCP Server started and connected via stdio");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
