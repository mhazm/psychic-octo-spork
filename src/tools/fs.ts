import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

export function registerFsTools(server: McpServer) {
  // 1. Tool untuk membaca file (Berguna untuk AI Agent melakukan explorasi kode)
  server.tool(
    "read_file",
    "Baca isi dari suatu file berdasarkan absolute path.",
    {
      filePath: z.string().describe("Absolute path ke file yang ingin dibaca (contoh: e:/Project/nismara-client/package.json)")
    },
    async ({ filePath }) => {
      try {
        const content = await fs.readFile(filePath, "utf8");
        return {
          content: [{ type: "text", text: content }]
        };
      } catch (error) {
         return {
          content: [{ type: "text", text: `Error reading file: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true
        };
      }
    }
  );

  // 2. Tool untuk melist directory (Berguna untuk melihat struktur project)
  server.tool(
    "list_directory",
    "List isi dari sebuah directory berdasarkan absolute path.",
    {
      dirPath: z.string().describe("Absolute path ke directory (contoh: e:/Project/nismara-client)")
    },
    async ({ dirPath }) => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const list = entries.map(e => `${e.isDirectory() ? "[DIR] " : "[FILE]"} ${e.name}`).join("\n");
        return {
          content: [{ type: "text", text: `Isi dari ${dirPath}:\n${list}` }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error listing directory: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true
        };
      }
    }
  );

  // 3. Resource Template untuk membaca file secara langsung melalui standar MCP Resources
  server.registerResource(
    "file",
    new ResourceTemplate("file:///{path}", { list: undefined }),
    { description: "Membaca file dari local filesystem melalui absolute path" },
    async (uri, { path: filePath }) => {
      try {
        // path dari template variables merupakan sisa dari file:///
        // decode URI component untuk memulihkan spasi dan karakter khusus
        const decodedPath = decodeURIComponent(filePath as string);
        
        // Di Windows, file:///e:/... menghasilkan path "e:/..."
        // Namun terkadang klien MCP mengirimkannya dengan slash tambahan
        const actualPath = process.platform === 'win32' && decodedPath.startsWith('/') 
            ? decodedPath.slice(1) 
            : decodedPath;

        const content = await fs.readFile(actualPath, "utf8");
        
        return {
          contents: [{
            uri: uri.href,
            text: content
          }]
        };
      } catch (error) {
        throw new Error(`Failed to read resource at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
}
