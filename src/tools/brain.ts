import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline";
import { createReadStream } from "fs";
import os from "os";

export function registerBrainTools(server: McpServer) {
  // Tool 4: Search Antigravity Chats
  server.tool(
    "search_antigravity_chats",
    "Search for a keyword across past Antigravity AI chat transcripts",
    {
      keyword: z.string().describe("Keyword to search for in past chats")
    },
    async ({ keyword }) => {
      const brainDir = path.join(os.homedir(), ".gemini", "antigravity-ide", "brain");
      const results = [];
      const MAX_RESULTS = 20;

      try {
        const dirs = await fs.readdir(brainDir, { withFileTypes: true });
        for (const dir of dirs) {
          if (!dir.isDirectory()) continue;
          const transcriptPath = path.join(brainDir, dir.name, ".system_generated", "logs", "transcript.jsonl");
          
          try {
            await fs.access(transcriptPath);
            const fileStream = createReadStream(transcriptPath);
            const rl = readline.createInterface({
              input: fileStream,
              crlfDelay: Infinity
            });
            for await (const line of rl) {
              if (line.toLowerCase().includes(keyword.toLowerCase())) {
                const parsed = JSON.parse(line);
                if (parsed.content && typeof parsed.content === 'string') {
                   results.push(`[${dir.name}] ${parsed.source || "UNKNOWN"}: ${parsed.content.substring(0, 200)}...`);
                }
                if (results.length >= MAX_RESULTS) break;
              }
            }
          } catch (e) {
             // Ignore if file doesn't exist
          }
          if (results.length >= MAX_RESULTS) break;
        }

        if (results.length === 0) {
          return { content: [{ type: "text", text: `No chat transcripts found containing '${keyword}'.` }] };
        }
        return { content: [{ type: "text", text: `Matches for '${keyword}':\n\n${results.join("\n\n")}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error reading brain directory: ${err}` }] };
      }
    }
  );

  // Tool 5: List Knowledge Items
  server.tool(
    "list_knowledge_items",
    "List summaries of Knowledge Items (KIs) that the AI has learned about your projects",
    {},
    async () => {
       const kiDir = path.join(os.homedir(), ".gemini", "antigravity-ide", "knowledge");
       const results = [];
       try {
         const dirs = await fs.readdir(kiDir, { withFileTypes: true });
         for (const dir of dirs) {
           if (!dir.isDirectory()) continue;
           const metaPath = path.join(kiDir, dir.name, "metadata.json");
           try {
             const metaContent = await fs.readFile(metaPath, "utf-8");
             const meta = JSON.parse(metaContent);
             results.push(`- KI: ${meta.title || dir.name}\n  Summary: ${meta.summary || "No summary"}`);
           } catch(e) {
             // Skip
           }
         }
         if (results.length === 0) {
           return { content: [{ type: "text", text: "No Knowledge Items found." }] };
         }
         return { content: [{ type: "text", text: `Knowledge Items:\n\n${results.join("\n")}` }] };
       } catch (err) {
         return { content: [{ type: "text", text: `Error reading knowledge directory: ${err}` }] };
       }
    }
  );
}
