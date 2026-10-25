import { GoogleGenAI, Type } from "@google/genai";
import { GoldBrand } from "@/lib/generated/prisma/enums";
import { parsePurityPermille } from "@/lib/gold";
import type { GoldScanResultDTO } from "@/types/gold";
import { resolveModelChain } from "./model-chain";

const GOLD_SCAN_TIMEOUT_MS = 12_000;

const GOLD_SCAN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    scanType: {
      type: Type.STRING,
      enum: ["BULLION_CERTICARD", "JEWELRY_RECEIPT", "UNKNOWN"],
    },
    brand: {
      type: Type.STRING,
      enum: ["ANTAM", "UBS", "LOTUS_ARCHI", "GALERI_24", "OTHER"],
    },
    brandCustomName: { type: Type.STRING, nullable: true },
    name: { type: Type.STRING },
    weightGrams: { type: Type.NUMBER },
    purityString: { type: Type.STRING, nullable: true },
    serialNumber: { type: Type.STRING, nullable: true },
    totalPriceMinor: { type: Type.INTEGER, nullable: true },
    purchaseDate: { type: Type.STRING, nullable: true },
    merchantName: { type: Type.STRING, nullable: true },
    confidence: { type: Type.NUMBER },
  },
  required: ["scanType", "name", "weightGrams", "confidence"],
};

const GOLD_SCAN_PROMPT = [
  "Analisis foto ini. Foto bisa berupa kemasan kartu certicard logam mulia batangan (seperti Antam CertiEye, UBS Assayer, Galeri 24) ATAU nota faktur kwitansi pembelian dari toko emas perhiasan.",
  "Aturan ekstraksi data:",
  "1. scanType: pilih 'BULLION_CERTICARD' bila foto kartu kemasan emas batangan/certicard, 'JEWELRY_RECEIPT' bila foto nota/struk toko emas perhiasan, atau 'UNKNOWN' jika bukan keduanya.",
  "2. brand: ANTAM, UBS, LOTUS_ARCHI, GALERI_24, atau OTHER.",
  "3. name: nama ringkas barang (misal: 'Antam Certicard 5g' atau 'Cincin Emas Kuning 17K' atau 'Kalung').",
  "4. weightGrams: berat dalam gram (angka desimal seperti 0.5, 1, 2.5, 5, 10, dsb).",
  "5. purityString: kadar emas (misal: 'Fine Gold 999.9', '24K', '750', '18K', '70%', '17K', '375', dll).",
  "6. serialNumber: nomor seri assay yang tertera pada certicard bila ada (null jika tidak ada).",
  "7. totalPriceMinor: total harga pembelian dalam rupiah penuh jika tertera di nota (null jika tidak ada).",
  "8. purchaseDate: tanggal pembelian YYYY-MM-DD bila tertera pada nota (null jika tidak ada).",
  "9. merchantName: nama toko emas bila berupa nota.",
  "10. confidence: angka keyakinan 0 sampai 1.",
  "Jangan mengarang angka bila tidak terbaca jelas.",
].join("\n");

export class GoldVisionProvider {
  static async scanGoldImage(
    imageBytes: Uint8Array,
    mimeType: string
  ): Promise<GoldScanResultDTO> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const chain = resolveModelChain(
      process.env.GEMINI_MODEL,
      process.env.GEMINI_MODEL_FALLBACKS
    );

    let lastError: unknown = null;

    for (const model of chain) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GOLD_SCAN_TIMEOUT_MS);

      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                { text: GOLD_SCAN_PROMPT },
                {
                  inlineData: {
                    data: Buffer.from(imageBytes).toString("base64"),
                    mimeType,
                  },
                },
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: GOLD_SCAN_SCHEMA,
            abortSignal: controller.signal,
          },
        });

        clearTimeout(timeoutId);

        const text = response.text?.trim();
        if (!text) {
          throw new Error("Empty response from Gemini Vision");
        }

        const parsed = JSON.parse(text);

        const purityPermille = parsed.purityString
          ? parsePurityPermille(parsed.purityString)
          : parsed.scanType === "BULLION_CERTICARD"
          ? 999
          : 750;

        let brand: GoldBrand = GoldBrand.OTHER;
        if (parsed.brand && Object.values(GoldBrand).includes(parsed.brand as GoldBrand)) {
          brand = parsed.brand as GoldBrand;
        }

        return {
          scanType: parsed.scanType || "UNKNOWN",
          brand,
          brandCustomName: parsed.brandCustomName || undefined,
          name: parsed.name || "Aset Emas",
          weightGrams: Number(parsed.weightGrams) || 1,
          purityPermille,
          serialNumber: parsed.serialNumber || undefined,
          buyPriceMinor: parsed.totalPriceMinor ? Number(parsed.totalPriceMinor) : undefined,
          purchaseDate: parsed.purchaseDate || undefined,
          merchantName: parsed.merchantName || undefined,
          confidence: Number(parsed.confidence) || 0.8,
        };
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;
        console.warn(`[GoldVisionProvider] Model ${model} failed, trying next in chain...`, err);
      }
    }

    throw lastError || new Error("Failed to scan gold image via Gemini Vision");
  }
}
