import { describe, expect, it } from "vitest";

/*
  Model-chain policy unit tests (ADR-003 amended 2026-10-23). Pure functions:
  no SDK mock, no env access, no timers, fully deterministic.
*/

import {
  DEFAULT_FALLBACK_MODELS,
  DEFAULT_MODEL,
  MAX_MODEL_CHAIN,
  isModelFallbackWorthy,
  providerStatus,
  resolveModelChain,
} from "./model-chain";

describe("resolveModelChain", () => {
  it("uses the documented defaults when env is unset", () => {
    expect(resolveModelChain(undefined, undefined)).toEqual([
      DEFAULT_MODEL,
      ...DEFAULT_FALLBACK_MODELS,
    ]);
  });

  it("honors the primary override and keeps default fallbacks after it", () => {
    expect(resolveModelChain("gemini-primary", undefined)).toEqual([
      "gemini-primary",
      "gemini-3.1-flash-lite",
    ]);
  });

  it("honors comma-separated fallback order (capped at MAX_MODEL_CHAIN)", () => {
    expect(resolveModelChain("primary", "a, b")).toEqual([
      "primary",
      "a",
      "b",
    ]);
  });

  it("dedupes: the primary repeated in fallbacks appears once", () => {
    expect(resolveModelChain("primary", "secondary, primary ,secondary")).toEqual([
      "primary",
      "secondary",
    ]);
  });

  it("falls back to the default fallback list when GEMINI_MODEL_FALLBACKS is blank", () => {
    expect(resolveModelChain("primary", "")).toEqual([
      "primary",
      "gemini-3.1-flash-lite",
    ]);
    expect(resolveModelChain("primary", "   ")).toEqual([
      "primary",
      "gemini-3.1-flash-lite",
    ]);
  });

  it("drops empty tokens and trims whitespace", () => {
    expect(resolveModelChain("primary", ",a ,, b,")).toEqual([
      "primary",
      "a",
      "b",
    ]);
  });

  it("caps the whole chain at MAX_MODEL_CHAIN models", () => {
    const chain = resolveModelChain("a", "b,c,d");
    expect(chain).toEqual(["a", "b", "c"]);
    expect(chain.length).toBeLessThanOrEqual(MAX_MODEL_CHAIN);
  });
});

describe("providerStatus", () => {
  it("reads the numeric status from SDK-style errors", () => {
    expect(providerStatus({ status: 429 })).toBe(429);
    const sdkError = Object.assign(new Error("HTTP error"), { status: 404 });
    expect(providerStatus(sdkError)).toBe(404);
  });

  it("returns null when the status is absent or not a number", () => {
    expect(providerStatus(new Error("boom"))).toBeNull();
    expect(providerStatus({ status: "429" })).toBeNull();
    expect(providerStatus({})).toBeNull();
    expect(providerStatus(null)).toBeNull();
    expect(providerStatus(undefined)).toBeNull();
    expect(providerStatus("oops")).toBeNull();
  });
});

describe("isModelFallbackWorthy", () => {
  it("is true for model-specific failures only (429/404/503)", () => {
    expect(isModelFallbackWorthy({ status: 429 })).toBe(true);
    expect(isModelFallbackWorthy({ status: 404 })).toBe(true);
    expect(isModelFallbackWorthy({ status: 503 })).toBe(true);
  });

  it("is false for 400, 500, missing status, and timeout-style errors", () => {
    expect(isModelFallbackWorthy({ status: 400 })).toBe(false);
    expect(isModelFallbackWorthy({ status: 500 })).toBe(false);
    expect(isModelFallbackWorthy(new Error("boom"))).toBe(false);
    const abort = Object.assign(new Error("The operation was aborted"), {
      name: "AbortError",
    });
    expect(isModelFallbackWorthy(abort)).toBe(false);
    expect(isModelFallbackWorthy(null)).toBe(false);
  });
});
