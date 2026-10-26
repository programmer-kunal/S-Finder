import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import worker, { globalRateLimiter } from "../src/index";
import { Env } from "../src/types";

describe("Worker HTTP Endpoint Audit Tests", () => {
  beforeEach(() => {
    globalRateLimiter.reset();
  });

  it("returns 200 for health check and privacy endpoints", async () => {
    const env: Env = { PRIMARY_MODEL: "gemini-3.5-flash-lite" };

    const healthReq = new Request("https://api.sfinder.internal/health");
    const healthRes = await worker.fetch(healthReq, env);
    assert.strictEqual(healthRes.status, 200);
    const healthData = await healthRes.json() as any;
    assert.strictEqual(healthData.status, "healthy");
    assert.strictEqual(healthData.configuredModel, "gemini-3.5-flash-lite");

    const privacyReq = new Request("https://api.sfinder.internal/api/v1/privacy");
    const privacyRes = await worker.fetch(privacyReq, env);
    assert.strictEqual(privacyRes.status, 200);
    const privacyData = await privacyRes.json() as any;
    assert.ok(privacyData.dataProcessingNotice.includes("Google Gemini"));
  });

  it("rejects oversized request bodies (>10KB) with explicit Content-Length", async () => {
    const env: Env = {};
    const hugePayload = JSON.stringify({ query: "a".repeat(11000) });

    const req = new Request("https://api.sfinder.internal/api/v1/discover", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(hugePayload.length)
      },
      body: hugePayload
    });

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 413);
    const data = await res.json() as any;
    assert.strictEqual(data.mode, "ERROR");
    assert.ok(data.error.includes("Payload too large"));
  });

  it("rejects oversized request bodies (>10KB) when Content-Length is missing or misleading", async () => {
    const env: Env = {};
    const hugePayload = JSON.stringify({ query: "b".repeat(12000) });

    // Misleading Content-Length header claims only 50 bytes
    const req = new Request("https://api.sfinder.internal/api/v1/discover", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "50"
      },
      body: hugePayload
    });

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 413);
    const data = await res.json() as any;
    assert.strictEqual(data.mode, "ERROR");
    assert.ok(data.error.includes("Payload too large"));
  });

  it("enforces HTTP 429 rate limiting using trusted cf-connecting-ip", async () => {
    const env: Env = {};
    const trustedIp = "198.51.100.42";

    // Exhaust 15 requests under this trusted IP
    for (let i = 0; i < 15; i++) {
      const check = globalRateLimiter.check(trustedIp);
      assert.strictEqual(check.allowed, true);
    }

    // 16th request from this trusted IP must receive 429
    const req = new Request("https://api.sfinder.internal/api/v1/discover", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cf-connecting-ip": trustedIp
      },
      body: JSON.stringify({ query: "The K2" })
    });

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 429);
    assert.strictEqual(res.headers.get("X-RateLimit-Remaining"), "0");
    assert.ok(res.headers.get("Retry-After") != null);
    const data = await res.json() as any;
    assert.strictEqual(data.mode, "ERROR");
    assert.ok(data.error.includes("Rate limit"));
  });

  it("ignores spoofed X-Forwarded-For headers when cf-connecting-ip is present", async () => {
    const env: Env = {};
    const realIp = "198.51.100.99";
    const spoofedIp = "1.2.3.4";

    // Exhaust rate limit on the real IP
    for (let i = 0; i < 15; i++) {
      globalRateLimiter.check(realIp);
    }

    // Attacker attempts to bypass by injecting a spoofed X-Forwarded-For header
    const req = new Request("https://api.sfinder.internal/api/v1/discover", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cf-connecting-ip": realIp,
        "x-forwarded-for": spoofedIp
      },
      body: JSON.stringify({ query: "The K2" })
    });

    const res = await worker.fetch(req, env);
    // Must STILL be blocked because cf-connecting-ip is authoritative!
    assert.strictEqual(res.status, 429);
  });

  it("isolates edge cache keys across different pagination pages", async () => {
    const cachedRequests: string[] = [];
    const mockCache = {
      match: async (req: Request) => {
        cachedRequests.push(req.url);
        return null;
      },
      put: async () => {}
    };
    (globalThis as any).caches = { default: mockCache };

    const env: Env = {};
    const reqP1 = new Request("https://api.sfinder.internal/api/v1/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Breaking Bad", page: 1, limit: 10 })
    });
    await worker.fetch(reqP1, env);

    const reqP2 = new Request("https://api.sfinder.internal/api/v1/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Breaking Bad", page: 2, limit: 10 })
    });
    await worker.fetch(reqP2, env);

    delete (globalThis as any).caches;

    assert.strictEqual(cachedRequests.length, 2);
    assert.notStrictEqual(cachedRequests[0], cachedRequests[1]);
    assert.ok(cachedRequests[0].includes("p1%3Al10") || cachedRequests[0].includes("p1:l10") || decodeURIComponent(cachedRequests[0]).includes("p1:l10"));
    assert.ok(cachedRequests[1].includes("p2%3Al10") || cachedRequests[1].includes("p2:l10") || decodeURIComponent(cachedRequests[1]).includes("p2:l10"));
  });
});
