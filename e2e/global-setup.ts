import { request } from "@playwright/test";
import { E2E_PORT } from "./port";

/*
  Pre-warm the Next dev server before the parallel suite starts.

  In dev mode every page and route handler is compiled on first request. When the
  six Playwright workers all hit an uncompiled route at the same time, the first
  paint can blow past the assertion budget (and Next can flash a transient
  compile overlay). This setup requests every route the suite uses once, in
  series, so the actual tests always run against already-compiled routes.
*/
export default async function globalSetup(): Promise<void> {
  const baseURL = `http://localhost:${E2E_PORT}`;
  const context = await request.newContext({ baseURL });
  try {
    for (const path of [
      "/",
      "/home",
      "/budget",
      "/transactions",
      "/family",
      "/profile",
      "/api/auth/me",
    ]) {
      await context.get(path).catch(() => undefined);
    }

    /* An approved owner session compiles the protected aggregation routes. */
    const signup = await context
      .post("/api/auth/signup", {
        data: {
          email: `e2e-warmup-${Date.now()}@test.local`,
          displayName: "E2E Warmup",
          password: "password123",
        },
      })
      .catch(() => undefined);

    if (signup?.ok()) {
      for (const path of [
        "/api/dashboard?period=7D",
        "/api/budget",
        "/api/goals",
        "/api/transactions?limit=5",
        "/api/institutions",
      ]) {
        await context.get(path).catch(() => undefined);
      }
    }
  } finally {
    await context.dispose();
  }
}
