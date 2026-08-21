import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Fungsi untuk memecah teks panjang menjadi paragraf-paragraf kecil
 */
function chunkText(text: string, maxChunkSize = 1000): string[] {
  const paragraphs = text.split(/\n\s*\n/);
  
  const chunks: string[] = [];
  let currentChunk = "";

  for (const p of paragraphs) {
    const cleaned = p.trim().replace(/\n/g, " ");
    if (!cleaned) continue;

    if (currentChunk.length + cleaned.length > maxChunkSize) {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = cleaned;
    } else {
      currentChunk += (currentChunk ? " " : "") + cleaned;
    }
  }
  if (currentChunk) chunks.push(currentChunk);

  return chunks;
}

export function registerPdfTools(server: McpServer) {
  server.tool(
    "search_docs",
    "WAJIB DIGUNAKAN ketika user bertanya tentang isi dokumen, panduan, guide book, SOP, atau aturan. Tool ini mencari informasi langsung dari file Markdown (MD) aslinya.",
    {
      filename: z.string().optional().describe("Nama file dokumen (opsional). Jika tidak diisi, AI akan mencari ke SEMUA file dokumen yang ada di database."),
      query: z.string().describe("Kata kunci atau kalimat yang ingin dicari di dalam PDF")
    },
    async ({ filename, query }) => {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_KEY;
      const geminiKey = process.env.GEMINI_API_KEY;

      if (!supabaseUrl || !supabaseKey || !geminiKey) {
        return {
          content: [{ type: "text", text: "Error: SUPABASE_URL, SUPABASE_KEY, atau GEMINI_API_KEY tidak ditemukan di .env" }]
        };
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      const genAI = new GoogleGenerativeAI(geminiKey);
      
      const docsDir = path.resolve(__dirname, "..", "..", "md");
      
      if (!fs.existsSync(docsDir)) {
        return {
          content: [{ type: "text", text: `Error: Folder 'md' tidak ditemukan.` }]
        };
      }

      // 1. Tentukan file mana saja yang perlu dicek/di-index
      let filesToCheck: string[] = [];
      if (filename) {
        const filePath = path.join(docsDir, filename);
        if (!filePath.startsWith(docsDir) || !fs.existsSync(filePath)) {
           return {
             content: [{ type: "text", text: `Error: File '${filename}' tidak ditemukan di folder 'md' atau path tidak valid.` }]
           };
        }
        filesToCheck.push(filename);
      } else {
        filesToCheck = fs.readdirSync(docsDir).filter(f => f.toLowerCase().endsWith('.md'));
      }

      // 2. Pastikan file-file tersebut sudah di-index di Supabase
      const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

      for (const targetFile of filesToCheck) {
        // Cek apakah file ini sudah ada di tabel pdf_chunks
        const { data: existingData, error: checkError } = await supabase
          .from('pdf_chunks')
          .select('id')
          .eq('filename', targetFile)
          .limit(1);

        if (checkError) {
          console.error(`Gagal mengecek file ${targetFile} di Supabase:`, checkError);
          continue;
        }

        // Jika belum ada di Supabase, lakukan indexing (baca, pecah, embed, insert)
        if (!existingData || existingData.length === 0) {
          console.log(`Meng-index ${targetFile} ke Supabase untuk pertama kalinya...`);
          try {
            const filePath = path.join(docsDir, targetFile);
            const text = fs.readFileSync(filePath, 'utf8');
            const chunks = chunkText(text);

            for (let i = 0; i < chunks.length; i++) {
              const chunk = chunks[i];
              // Buat vektor dari teks chunk menggunakan Gemini
              const result = await embeddingModel.embedContent({
                content: { role: 'user', parts: [{ text: chunk }] },
                // @ts-ignore
                outputDimensionality: 768
              });
              const embedding = result.embedding.values;

              // Simpan ke Supabase
              await supabase.from('pdf_chunks').insert({
                filename: targetFile,
                chunk_index: i + 1,
                content: chunk,
                embedding: embedding
              });
            }
            console.log(`Selesai meng-index ${targetFile}!`);
          } catch (error) {
            console.error(`Error saat meng-index ${targetFile}:`, error);
          }
        }
      }

      // 3. Lakukan Vector Search untuk query yang diminta
      try {
        // Embed query pencarian
        const queryResult = await embeddingModel.embedContent({
          content: { role: 'user', parts: [{ text: query }] },
          // @ts-ignore
          outputDimensionality: 768
        });
        const queryEmbedding = queryResult.embedding.values;

        // Panggil fungsi pencarian di Supabase
        const { data: searchResults, error: searchError } = await supabase.rpc("match_pdf_chunks", {
          query_embedding: queryEmbedding,
          match_threshold: 0.1, // Ambang batas kemiripan (semakin besar semakin ketat)
          match_count: 20 // Ambil lebih banyak jika nanti difilter
        });

        if (searchError) {
          throw searchError;
        }

        let hits = searchResults || [];

        // Filter manual jika user spesifik meminta filename tertentu
        if (filename) {
          hits = hits.filter((h: any) => h.filename === filename);
        }

        // Ambil 3 terbaik setelah difilter
        const topHits = hits.slice(0, 3);

        if (topHits.length === 0) {
           return {
             content: [{ type: "text", text: `Tidak ditemukan informasi yang relevan untuk query: "${query}".` }]
           };
        }

        const resultsText = topHits
          .map((hit: any) => `[Dokumen: ${hit.filename}] [Kemiripan: ${(hit.similarity * 100).toFixed(1)}%]\nParagraf:\n${hit.content}`)
          .join("\n\n---\n\n");

        return {
          content: [{ type: "text", text: `Hasil pencarian untuk "${query}":\n\n${resultsText}` }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error saat melakukan pencarian: ${error instanceof Error ? error.message : String(error)}` }]
        };
      }
    }
  );
}
