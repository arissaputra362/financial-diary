const RATE_TIMEOUT_MS = 5_000;
const FRANKFURTER_URL = "https://api.frankfurter.app";

export interface ExchangeRateProvider {
  /** Returns how many IDR one unit of `currencyCode` bought on `date`. */
  getIdrRate(currencyCode: string, date: string): Promise<number>;
}

class ExchangeRateUnavailableError extends Error {
  constructor() {
    super("Historical exchange rate is unavailable.");
    this.name = "ExchangeRateUnavailableError";
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ExchangeRateUnavailableError()), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createFrankfurterRateProvider(): ExchangeRateProvider {
  return {
    async getIdrRate(currencyCode, date) {
      if (currencyCode === "IDR") return 1;
      const url = `${FRANKFURTER_URL}/${encodeURIComponent(date)}?from=${encodeURIComponent(currencyCode)}&to=IDR`;
      let response: Response;
      try {
        response = await withTimeout(fetch(url, { headers: { accept: "application/json" } }), RATE_TIMEOUT_MS);
      } catch {
        throw new ExchangeRateUnavailableError();
      }
      if (!response.ok) throw new ExchangeRateUnavailableError();

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new ExchangeRateUnavailableError();
      }
      const rates = (payload as { rates?: unknown } | null)?.rates;
      const rate = (rates as Record<string, unknown> | undefined)?.IDR;
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
        throw new ExchangeRateUnavailableError();
      }
      return rate;
    },
  };
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

