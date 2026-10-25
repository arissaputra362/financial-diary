import { prisma } from "@/lib/db";
import { GoldBrand } from "@/lib/generated/prisma/enums";
import { jakartaDateOnly } from "@/lib/server/jakarta";
import type { GoldPriceItemDTO, GoldPriceResponseDTO } from "@/types/gold";

const PROVIDER_KEY_PREFIX = "emas-api-id";
const DEFAULT_GOLD_API_BASE_URL = "https://emas.maulanar.my.id";
const REQUEST_TIMEOUT_MS = 5_000;

interface ProviderBrand {
  brand: string;
  resource: string;
  label: string;
}

const PROVIDER_BRANDS: Partial<Record<GoldBrand, ProviderBrand>> = {
  [GoldBrand.ANTAM]: { brand: "ANTAM", resource: "antam", label: "Logam Mulia" },
  [GoldBrand.UBS]: { brand: "UBS", resource: "galeri24", label: "UBS" },
  [GoldBrand.GALERI_24]: { brand: "GALERI 24", resource: "galeri24", label: "Galeri 24" },
  [GoldBrand.LOTUS_ARCHI]: { brand: "LOTUS ARCHI", resource: "lotusarchi", label: "Lotus Archi" },
};

interface ProviderPrice {
  brand: string;
  resource?: string;
  weight: number;
  sell_price: number;
  buyback_price: number;
  date?: string;
  updated_at?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractRows(payload: unknown): ProviderPrice[] {
  if (!isRecord(payload)) return [];
  const data = payload.data;
  const rows = Array.isArray(data) ? data : isRecord(data) ? [data] : [];
  return rows.filter((row): row is ProviderPrice => {
    if (!isRecord(row)) return false;
    return (
      typeof row.brand === "string" &&
      typeof row.weight === "number" &&
      typeof row.sell_price === "number" &&
      typeof row.buyback_price === "number"
    );
  });
}

function dateValue(value: string | undefined, fallback: string): string | null {
  const candidate = value?.slice(0, 10) ?? fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate
    ? candidate
    : null;
}

function dateColumn(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

function sourceRef(brand: GoldBrand): string {
  return `Emas API ID · ${PROVIDER_BRANDS[brand]?.label ?? brand}`;
}

export class GoldPriceService {
  /** Fetch requested brands once per day and fall back to their latest DB snapshots. */
  static async getDailyPrices(requestedBrands: GoldBrand[] = []): Promise<GoldPriceResponseDTO> {
    const today = jakartaDateOnly();
    const brands = [...new Set([GoldBrand.ANTAM, ...requestedBrands])]
      .filter((brand) => PROVIDER_BRANDS[brand] !== undefined);

    try {
      const cachedToday = await prisma.goldMarketPrice.findMany({
        where: {
          brand: { in: brands },
          sourceDate: dateColumn(today),
          sourceRef: { startsWith: "Emas API ID" },
        },
      });
      const cachedBrands = new Set(cachedToday.map((row) => row.brand));

      for (const brand of brands) {
        if (cachedBrands.has(brand)) continue;

        const providerKey = `${PROVIDER_KEY_PREFIX}-${brand.toLowerCase()}-1g-v1`;
        const claim = await prisma.$queryRaw<Array<{ provider_key: string }>>`
          INSERT INTO "gold_price_fetch_state" ("provider_key", "last_attempt_date", "last_error")
          VALUES (${providerKey}, ${dateColumn(today)}::date, NULL)
          ON CONFLICT ("provider_key") DO UPDATE
            SET "last_attempt_date" = EXCLUDED."last_attempt_date", "last_error" = NULL
            WHERE "gold_price_fetch_state"."last_attempt_date" <> EXCLUDED."last_attempt_date"
          RETURNING "provider_key"
        `;
        if (claim.length === 0) continue;

        const saved = await this.fetchExternalPrice(brand, today);
        if (!saved) {
          await prisma.goldPriceFetchState.update({
            where: { providerKey },
            data: { lastError: "Provider tidak tersedia atau respons tidak valid." },
          });
        }
      }

      return this.formatResponse(await this.findLatestSnapshots(brands), today);
    } catch (error) {
      console.error("[GoldPriceService] Error retrieving gold prices:", error);
      try {
        return this.formatResponse(await this.findLatestSnapshots(brands), today);
      } catch (fallbackError) {
        console.error("[GoldPriceService] Database fallback failed:", fallbackError);
        return this.emptyResponse(today);
      }
    }
  }

  private static async fetchExternalPrice(brand: GoldBrand, today: string): Promise<boolean> {
    const providerBrand = PROVIDER_BRANDS[brand];
    if (!providerBrand) return false;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const baseUrl = process.env.GOLD_PRICE_API_BASE_URL || DEFAULT_GOLD_API_BASE_URL;
      const apiUrl = new URL("/api/prices", baseUrl);
      apiUrl.searchParams.set("brand[eq]", providerBrand.brand);
      apiUrl.searchParams.set("resource[eq]", providerBrand.resource);
      apiUrl.searchParams.set("weight[eq]", "1");
      apiUrl.searchParams.set("limit", "1");

      const apiKey = process.env.GOLD_PRICE_API_KEY;
      const response = await fetch(apiUrl.toString(), {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(apiKey ? { "X-API-Key": apiKey } : {}),
        },
        cache: "no-store",
      });
      if (!response.ok) return false;

      const rows = extractRows(await response.json());
      const row = rows.find((candidate) =>
        candidate.brand.toUpperCase() === providerBrand.brand &&
        (candidate.resource === undefined || candidate.resource.toLowerCase() === providerBrand.resource) &&
        candidate.weight === 1 &&
        Number.isSafeInteger(candidate.sell_price) && candidate.sell_price > 0 &&
        Number.isSafeInteger(candidate.buyback_price) && candidate.buyback_price > 0,
      );
      if (!row) return false;

      const sourceDate = dateValue(row.date ?? row.updated_at, today);
      if (!sourceDate) return false;
      const snapshot = {
        brand,
        buyPriceMinor: row.sell_price,
        buybackPriceMinor: row.buyback_price,
        sourceDate: dateColumn(sourceDate),
        sourceRef: sourceRef(brand),
      };

      await prisma.$transaction([
        prisma.goldMarketPrice.deleteMany({
          where: { brand, sourceRef: { not: { startsWith: "Emas API ID" } } },
        }),
        prisma.goldMarketPrice.upsert({
          where: { brand_sourceDate: { brand, sourceDate: snapshot.sourceDate } },
          create: snapshot,
          update: {
            buyPriceMinor: snapshot.buyPriceMinor,
            buybackPriceMinor: snapshot.buybackPriceMinor,
            sourceRef: snapshot.sourceRef,
            fetchedAt: new Date(),
          },
        }),
      ]);
      return true;
    } catch (error) {
      console.warn(`[GoldPriceService] ${brand} provider fetch failed:`, error);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private static async findLatestSnapshots(brands: GoldBrand[]) {
    const rows = await prisma.goldMarketPrice.findMany({
      where: { brand: { in: brands }, sourceRef: { startsWith: "Emas API ID" } },
      orderBy: [{ brand: "asc" }, { sourceDate: "desc" }],
    });
    const latestByBrand = new Map<GoldBrand, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latestByBrand.has(row.brand)) latestByBrand.set(row.brand, row);
    }
    return [...latestByBrand.values()];
  }

  private static formatResponse(
    records: Array<{
      brand: GoldBrand;
      buyPriceMinor: number;
      buybackPriceMinor: number;
      sourceDate: Date;
      sourceRef: string;
      fetchedAt: Date;
    }>,
    today: string,
  ): GoldPriceResponseDTO {
    const prices: GoldPriceItemDTO[] = records.map((record) => ({
      brand: record.brand,
      buyPriceMinor: record.buyPriceMinor,
      buybackPriceMinor: record.buybackPriceMinor,
      sourceDate: record.sourceDate.toISOString().slice(0, 10),
      sourceRef: record.sourceRef,
    }));
    const antam = prices.find((price) => price.brand === GoldBrand.ANTAM);
    const lastUpdatedMs = records.reduce(
      (latest, record) => Math.max(latest, record.fetchedAt.getTime()),
      0,
    );

    return {
      prices,
      jewelryBaseBuybackMinor: antam?.buybackPriceMinor ?? 0,
      lastUpdated: lastUpdatedMs > 0 ? new Date(lastUpdatedMs).toISOString() : new Date().toISOString(),
      isStale:
        prices.length === 0 ||
        records.some((record) => !record.sourceRef.startsWith("Emas API ID")) ||
        prices.some((price) => price.sourceDate !== today),
    };
  }

  private static emptyResponse(today: string): GoldPriceResponseDTO {
    return {
      prices: [],
      jewelryBaseBuybackMinor: 0,
      lastUpdated: new Date(`${today}T00:00:00.000Z`).toISOString(),
      isStale: true,
    };
  }
}
