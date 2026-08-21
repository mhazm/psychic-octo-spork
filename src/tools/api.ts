import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerApiTools(server: McpServer) {
  server.tool(
    "get_users_via_api",
    "Fetch user data from the Nismara Logistics local REST API",
    {
      discordId: z
        .string()
        .optional()
        .describe("Optional exact Discord ID to search for a specific user"),
      queryStr: z
        .string()
        .optional()
        .describe(
          "Optional query string for filtering, e.g., 'q=budi'",
        ),
    },
    async ({ discordId, queryStr }) => {
      try {
        const baseUrl = process.env.NISMARA_API_URL || "http://localhost:3000";
        let url = `${baseUrl}/api/mcp/users`;
        if (discordId && discordId.trim() !== "") {
          url += `?q=${discordId.trim()}`;
        } else if (queryStr && queryStr.trim() !== "") {
          url += `?${queryStr}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
          return {
            content: [
              {
                type: "text",
                text: `API Error: ${response.status} ${response.statusText}`,
              },
            ],
          };
        }

        const data = await response.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [
            { type: "text", text: `Failed to fetch from API: ${err.message}` },
          ],
        };
      }
    },
  );

  server.tool(
    "get_articles_via_api",
    "Fetch articles data from the Nismara Group website API",
    {
      slug: z
        .string()
        .optional()
        .describe(
          "Optional article slug to fetch a specific article, e.g., 'my-article-title'",
        ),
    },
    async ({ slug }) => {
      try {
        const baseUrl = process.env.NISMARA_ARTICLES_API_URL || "https://nismara.web.id";
        let url = `${baseUrl}/api/articles`;
        if (slug && slug.trim() !== "") {
          url += `?slug=${slug.trim()}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
          return {
            content: [
              {
                type: "text",
                text: `API Error: ${response.status} ${response.statusText}`,
              },
            ],
          };
        }

        const data = await response.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch articles from API: ${err.message}`,
            },
          ],
        };
      }
    },
  );

  server.tool(
    "get_jobs_via_api",
    "Fetch job history data for a specific user from the Nismara Logistics local REST API",
    {
      discordId: z
        .string()
        .describe("Required Discord ID of the user to fetch jobs for"),
    },
    async ({ discordId }) => {
      try {
        const baseUrl = process.env.NISMARA_API_URL || "http://localhost:3000";
        let url = `${baseUrl}/api/mcp/jobs`;
        if (discordId && discordId.trim() !== "") {
          url += `?discordId=${discordId.trim()}`;
        } else {
           return {
             content: [{ type: "text", text: "Error: discordId is required" }]
           };
        }

        const response = await fetch(url);
        if (!response.ok) {
          return {
            content: [
              {
                type: "text",
                text: `API Error: ${response.status} ${response.statusText}`,
              },
            ],
          };
        }

        const data = await response.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [
            { type: "text", text: `Failed to fetch jobs from API: ${err.message}` },
          ],
        };
      }
    },
  );

  server.tool(
    "get_points_via_api",
    "Fetch penalty points and history data for a specific user from the Nismara Logistics local REST API",
    {
      discordId: z
        .string()
        .describe("Required Discord ID of the user to fetch penalty points for"),
    },
    async ({ discordId }) => {
      try {
        const baseUrl = process.env.NISMARA_API_URL || "http://localhost:3000";
        let url = `${baseUrl}/api/mcp/points`;
        if (discordId && discordId.trim() !== "") {
          url += `?discordId=${discordId.trim()}`;
        } else {
           return {
             content: [{ type: "text", text: "Error: discordId is required" }]
           };
        }

        const response = await fetch(url);
        if (!response.ok) {
          return {
            content: [
              {
                type: "text",
                text: `API Error: ${response.status} ${response.statusText}`,
              },
            ],
          };
        }

        const data = await response.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [
            { type: "text", text: `Failed to fetch points from API: ${err.message}` },
          ],
        };
      }
    },
  );

  // 1. Economy
  server.tool(
    "get_economy_via_api",
    "Fetch Nismara Coin (NC) balance and currency history for a specific user from Nismara Logistics API",
    {
      discordId: z.string().describe("Required Discord ID of the user"),
    },
    async ({ discordId }) => {
      try {
        const baseUrl = process.env.NISMARA_API_URL || "http://localhost:3000";
        if (!discordId || discordId.trim() === "") {
          return { content: [{ type: "text", text: "Error: discordId is required" }] };
        }
        const response = await fetch(`${baseUrl}/api/mcp/economy?discordId=${discordId.trim()}`);
        if (!response.ok) return { content: [{ type: "text", text: `API Error: ${response.status} ${response.statusText}` }] };
        const data = await response.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Failed to fetch from API: ${err.message}` }] };
      }
    }
  );

  // 2. Transactions
  server.tool(
    "get_transactions_via_api",
    "Fetch user shopping and transaction history from Nismara Logistics API",
    {
      discordId: z.string().describe("Required Discord ID of the user"),
    },
    async ({ discordId }) => {
      try {
        const baseUrl = process.env.NISMARA_API_URL || "http://localhost:3000";
        if (!discordId || discordId.trim() === "") {
          return { content: [{ type: "text", text: "Error: discordId is required" }] };
        }
        const response = await fetch(`${baseUrl}/api/mcp/transactions?discordId=${discordId.trim()}`);
        if (!response.ok) return { content: [{ type: "text", text: `API Error: ${response.status} ${response.statusText}` }] };
        const data = await response.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Failed to fetch from API: ${err.message}` }] };
      }
    }
  );

  // 3. Market Items
  server.tool(
    "get_market_via_api",
    "Fetch globally available market items (mods) from Nismara Logistics API",
    {
      q: z.string().optional().describe("Optional string for searching item name"),
      category: z.string().optional().describe("Optional string for filtering category"),
    },
    async ({ q, category }) => {
      try {
        const baseUrl = process.env.NISMARA_API_URL || "http://localhost:3000";
        let url = `${baseUrl}/api/mcp/market`;
        const params = new URLSearchParams();
        if (q) params.append("q", q.trim());
        if (category) params.append("category", category.trim());
        const qs = params.toString();
        if (qs) url += `?${qs}`;
        
        const response = await fetch(url);
        if (!response.ok) return { content: [{ type: "text", text: `API Error: ${response.status} ${response.statusText}` }] };
        const data = await response.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Failed to fetch from API: ${err.message}` }] };
      }
    }
  );

  // 4. Fuel Market
  server.tool(
    "get_fuel_via_api",
    "Fetch current global fuel prices and active user fuel market listings",
    {},
    async () => {
      try {
        const baseUrl = process.env.NISMARA_API_URL || "http://localhost:3000";
        const response = await fetch(`${baseUrl}/api/mcp/fuel`);
        if (!response.ok) return { content: [{ type: "text", text: `API Error: ${response.status} ${response.statusText}` }] };
        const data = await response.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Failed to fetch from API: ${err.message}` }] };
      }
    }
  );

  // 5. Cargo Market
  server.tool(
    "get_cargo_via_api",
    "Fetch list of available cargos and their market history",
    {
      limit: z.number().optional().describe("Optional max items to fetch"),
    },
    async ({ limit }) => {
      try {
        const baseUrl = process.env.NISMARA_API_URL || "http://localhost:3000";
        let url = `${baseUrl}/api/mcp/cargo`;
        if (limit !== undefined) url += `?limit=${limit}`;
        const response = await fetch(url);
        if (!response.ok) return { content: [{ type: "text", text: `API Error: ${response.status} ${response.statusText}` }] };
        const data = await response.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Failed to fetch from API: ${err.message}` }] };
      }
    }
  );

  // 6. Garage & Fleets
  server.tool(
    "get_garage_via_api",
    "Fetch user's garage data and owned truck fleets",
    {
      discordId: z.string().describe("Required Discord ID of the user"),
    },
    async ({ discordId }) => {
      try {
        const baseUrl = process.env.NISMARA_API_URL || "http://localhost:3000";
        if (!discordId || discordId.trim() === "") {
          return { content: [{ type: "text", text: "Error: discordId is required" }] };
        }
        const response = await fetch(`${baseUrl}/api/mcp/garage?discordId=${discordId.trim()}`);
        if (!response.ok) return { content: [{ type: "text", text: `API Error: ${response.status} ${response.statusText}` }] };
        const data = await response.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Failed to fetch from API: ${err.message}` }] };
      }
    }
  );

  // 7. Convoy Lobbies
  server.tool(
    "get_convoy_via_api",
    "Fetch active or upcoming convoy lobbies from Nismara Logistics",
    {
      status: z.string().optional().describe("Optional status, e.g., 'ONGOING', 'SCHEDULED'"),
    },
    async ({ status }) => {
      try {
        const baseUrl = process.env.NISMARA_API_URL || "http://localhost:3000";
        let url = `${baseUrl}/api/mcp/convoy`;
        if (status && status.trim() !== "") url += `?status=${status.trim()}`;
        const response = await fetch(url);
        if (!response.ok) return { content: [{ type: "text", text: `API Error: ${response.status} ${response.statusText}` }] };
        const data = await response.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Failed to fetch from API: ${err.message}` }] };
      }
    }
  );

  // 8. Community Goals
  server.tool(
    "get_community_goals_via_api",
    "Fetch the status of ongoing community goals and special contracts",
    {},
    async () => {
      try {
        const baseUrl = process.env.NISMARA_API_URL || "http://localhost:3000";
        const response = await fetch(`${baseUrl}/api/mcp/community-goals`);
        if (!response.ok) return { content: [{ type: "text", text: `API Error: ${response.status} ${response.statusText}` }] };
        const data = await response.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Failed to fetch from API: ${err.message}` }] };
      }
    }
  );

  // 9. Currency Boost Events
  server.tool(
    "get_currency_boost_via_api",
    "Fetch active NC/XP currency boost events",
    {},
    async () => {
      try {
        const baseUrl = process.env.NISMARA_API_URL || "http://localhost:3000";
        const response = await fetch(`${baseUrl}/api/mcp/currency-boost`);
        if (!response.ok) return { content: [{ type: "text", text: `API Error: ${response.status} ${response.statusText}` }] };
        const data = await response.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Failed to fetch from API: ${err.message}` }] };
      }
    }
  );

  // 10. Gallery Posts
  server.tool(
    "get_gallery_via_api",
    "Fetch the latest community gallery posts",
    {
      discordId: z.string().optional().describe("Optional Discord ID to filter posts by specific user"),
    },
    async ({ discordId }) => {
      try {
        const baseUrl = process.env.NISMARA_API_URL || "http://localhost:3000";
        let url = `${baseUrl}/api/mcp/gallery`;
        if (discordId && discordId.trim() !== "") url += `?discordId=${discordId.trim()}`;
        const response = await fetch(url);
        if (!response.ok) return { content: [{ type: "text", text: `API Error: ${response.status} ${response.statusText}` }] };
        const data = await response.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Failed to fetch from API: ${err.message}` }] };
      }
    },
  );

  // 11. Fleet Store
  server.tool(
    "get_fleet_store_via_api",
    "Fetch available trucks, trailers, and buses from the Nismara Logistics Fleet Store",
    {
      q: z.string().optional().describe("Optional string for searching vehicle name"),
      type: z.string().optional().describe("Optional string for filtering vehicle type (e.g., 'truck', 'trailer', 'bus')"),
    },
    async ({ q, type }) => {
      try {
        const baseUrl = process.env.NISMARA_API_URL || "http://localhost:3000";
        let url = `${baseUrl}/api/mcp/fleet-store`;
        const params = new URLSearchParams();
        if (q) params.append("q", q.trim());
        if (type) params.append("type", type.trim());
        const qs = params.toString();
        if (qs) url += `?${qs}`;
        
        const response = await fetch(url);
        if (!response.ok) return { content: [{ type: "text", text: `API Error: ${response.status} ${response.statusText}` }] };
        const data = await response.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Failed to fetch from API: ${err.message}` }] };
      }
    }
  );
}
