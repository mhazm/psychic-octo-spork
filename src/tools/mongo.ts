import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Db } from "mongodb";
import { z } from "zod";

// ============================================================================
// SECURITY NOTE:
// Modul ini DIBATASI HANYA UNTUK OPERASI BACA (READ-ONLY).
// Dilarang keras menambahkan fungsi seperti insertOne, updateOne, atau deleteMany.
// Semua alat (tools) di bawah ini hanya boleh menggunakan fungsi .find() atau .findOne()
// ============================================================================

export function registerMongoTools(server: McpServer, db: Db) {
  // Tool 1: List Collections
  server.tool(
    "list_collections",
    "List all collections in the MongoDB database",
    {},
    async () => {
      const collections = await db.listCollections().toArray();
      const names = collections.map(c => c.name);
      return {
        content: [{ type: "text", text: `Collections:\n${names.join("\n")}` }]
      };
    }
  );

  // Tool 2: Sample Collection Schema
  server.tool(
    "get_collection_schema",
    "Get sample document from a collection to understand its schema",
    {
      collectionName: z.string().describe("Name of the collection")
    },
    async ({ collectionName }) => {
      const doc = await db.collection(collectionName).findOne({});
      return {
        content: [{ type: "text", text: doc ? JSON.stringify(doc, null, 2) : "Collection is empty or does not exist." }]
      };
    }
  );

  // Tool 3: Query Collection
  server.tool(
    "query_collection",
    "Run a find query on a collection",
    {
      collectionName: z.string().describe("Name of the collection"),
      query: z.string().describe("JSON string representing the query filter, e.g., '{\"status\":\"active\"}'"),
      limit: z.number().optional().describe("Maximum number of results to return (default: 10, max: 1000)"),
      sort: z.string().optional().describe("JSON string representing sort order, e.g., '{\"createdAt\": -1}' for latest first")
    },
    async ({ collectionName, query, limit, sort }) => {
      // Fungsi untuk meng-convert string ISO 8601 ke objek Date secara otomatis
      const dateReviver = (key: string, value: any) => {
          if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) {
              return new Date(value);
          }
          return value;
      };

      let filter = {};
      try {
        if (query && query.trim() !== "") {
           filter = JSON.parse(query, dateReviver);
        }
      } catch (e) {
        return {
          content: [{ type: "text", text: `Invalid query JSON: ${e}` }]
        };
      }
      
      let sortObj = {};
      if (sort && sort.trim() !== "") {
         try {
            sortObj = JSON.parse(sort);
         } catch (e) {
            return {
              content: [{ type: "text", text: `Invalid sort JSON: ${e}` }]
            };
         }
      }

      const resultLimit = Math.min(limit || 10, 10000);
      const docs = await db.collection(collectionName).find(filter).sort(sortObj).limit(resultLimit).toArray();
      
      return {
        content: [{ type: "text", text: JSON.stringify(docs, null, 2) }]
      };
    }
  );
}
