/*
  Single source of truth for the E2E dev-server port. Kept out of the Playwright
  config so `global-setup.ts` can reuse it without re-evaluating the config.
  Port 3000 is avoided because WSL2 forwards nginx onto localhost:3000 here.
*/
export const E2E_PORT = 3010;
