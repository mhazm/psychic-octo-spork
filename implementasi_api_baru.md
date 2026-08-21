# Instruksi Implementasi MCP Tools - Nismara Logistics

> [!NOTE]
> **Kepada Agent AI**: Dokumen ini berisi instruksi dan referensi lengkap untuk mengimplementasikan **11 _tools_ baru** di dalam server MCP (`src/tools/api.ts`). Anda diminta untuk membuat kode _tool_ MCP yang melakukan HTTP GET _request_ ke REST API backend Nismara Logistics.

## Konteks Global

1. Pastikan Anda berada di direktori project `nismara-mcp-server`.
2. Anda harus mendaftarkan _tool_ baru ini di dalam fungsi inisialisasi yang ada pada file `src/tools/api.ts` menggunakan pola `server.tool("nama_tool", "deskripsi", { schema }, async (args) => { ... })`.
3. Seluruh _tool_ ini akan mengambil `baseUrl` dari `process.env.NISMARA_API_URL || "http://localhost:3000"`.
4. Jika respons dari _fetch_ gagal (`!response.ok`), _return_ pesan error dari `response.statusText`. Jika berhasil, _return_ datanya dalam format `JSON.stringify(data, null, 2)`.

---

## Daftar Tools yang Harus Dibuat

### 1. Economy

- **Nama Tool**: `get_economy_via_api`
- **Deskripsi**: Fetch Nismara Coin (NC) balance and currency history for a specific user from Nismara Logistics API.
- **Skema Zod**: `discordId` (string, required).
- **Target URL**: `${baseUrl}/api/mcp/economy?discordId=${discordId}`

### 2. Transactions

- **Nama Tool**: `get_transactions_via_api`
- **Deskripsi**: Fetch user shopping and transaction history from Nismara Logistics API.
- **Skema Zod**: `discordId` (string, required).
- **Target URL**: `${baseUrl}/api/mcp/transactions?discordId=${discordId}`

### 3. Market Items

- **Nama Tool**: `get_market_via_api`
- **Deskripsi**: Fetch globally available market items (mods) from Nismara Logistics API.
- **Skema Zod**: `q` (string, optional, for searching item name), `category` (string, optional, for filtering category).
- **Target URL**: `${baseUrl}/api/mcp/market` (append `?q=...&category=...` jika parameter ada).

### 4. Fuel Market

- **Nama Tool**: `get_fuel_via_api`
- **Deskripsi**: Fetch current global fuel prices and active user fuel market listings.
- **Skema Zod**: Tidak ada parameter (empty object `{}`).
- **Target URL**: `${baseUrl}/api/mcp/fuel`

### 5. Cargo Market

- **Nama Tool**: `get_cargo_via_api`
- **Deskripsi**: Fetch list of available cargos and their market history.
- **Skema Zod**: `limit` (number, optional, max items to fetch).
- **Target URL**: `${baseUrl}/api/mcp/cargo` (append `?limit=...` jika ada).

### 6. Garage & Fleets

- **Nama Tool**: `get_garage_via_api`
- **Deskripsi**: Fetch user's garage data and owned truck fleets.
- **Skema Zod**: `discordId` (string, required).
- **Target URL**: `${baseUrl}/api/mcp/garage?discordId=${discordId}`

### 7. Convoy Lobbies

- **Nama Tool**: `get_convoy_via_api`
- **Deskripsi**: Fetch active or upcoming convoy lobbies from Nismara Logistics.
- **Skema Zod**: `status` (string, optional, e.g., 'ONGOING', 'SCHEDULED').
- **Target URL**: `${baseUrl}/api/mcp/convoy` (append `?status=...` jika ada).

### 8. Community Goals

- **Nama Tool**: `get_community_goals_via_api`
- **Deskripsi**: Fetch the status of ongoing community goals and special contracts.
- **Skema Zod**: Tidak ada parameter (empty object `{}`).
- **Target URL**: `${baseUrl}/api/mcp/community-goals`

### 9. Currency Boost Events

- **Nama Tool**: `get_currency_boost_via_api`
- **Deskripsi**: Fetch active NC/XP currency boost events.
- **Skema Zod**: Tidak ada parameter (empty object `{}`).
- **Target URL**: `${baseUrl}/api/mcp/currency-boost`

### 10. Gallery Posts

- **Nama Tool**: `get_gallery_via_api`
- **Deskripsi**: Fetch the latest community gallery posts.
- **Skema Zod**: `discordId` (string, optional, to filter posts by specific user).
- **Target URL**: `${baseUrl}/api/mcp/gallery` (append `?discordId=...` jika ada).

### 11. Fleet Store

- **Nama Tool**: `get_fleet_store_via_api`
- **Deskripsi**: Fetch prices and details of trucks/buses available in the fleet store.
- **Skema Zod**: `q` (string, optional, for searching brand or truck name).
- **Target URL**: `${baseUrl}/api/mcp/fleet-store` (append `?q=...` jika ada).

---

## Templat / Contoh Referensi Implementasi

Silakan gunakan referensi struktur di bawah ini saat menulis 11 _tools_ tersebut:

```typescript
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
        return {
          content: [{ type: "text", text: "Error: discordId is required" }],
        };
      }

      const url = `${baseUrl}/api/mcp/economy?discordId=${discordId.trim()}`;
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
```

> [!CAUTION]
> Harap pastikan semua _tool_ dideklarasikan dengan parameter Zod yang tepat dan _error handling_ (`try/catch`) agar server tidak _crash_ apabila koneksi terputus.
