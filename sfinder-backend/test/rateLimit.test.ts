import { describe, it } from "node:test";
import assert from "node:assert";
import { InMemoryRateLimiter } from "../src/rateLimit";

describe("Rate Limiter Unit Tests", () => {
  it("permits requests up to limit and blocks subsequent requests", () => {
    const limiter = new InMemoryRateLimiter(60_000, 3);
    const ip = "192.168.1.10";

    const r1 = limiter.check(ip);
    assert.strictEqual(r1.allowed, true);
    assert.strictEqual(r1.remaining, 2);

    const r2 = limiter.check(ip);
    assert.strictEqual(r2.allowed, true);
    assert.strictEqual(r2.remaining, 1);

    const r3 = limiter.check(ip);
    assert.strictEqual(r3.allowed, true);
    assert.strictEqual(r3.remaining, 0);

    // 4th request must be blocked
    const r4 = limiter.check(ip);
    assert.strictEqual(r4.allowed, false);
    assert.strictEqual(r4.remaining, 0);
    assert.ok(r4.resetInSec > 0);
  });

  it("differentiates between distinct client IPs", () => {
    const limiter = new InMemoryRateLimiter(60_000, 2);
    const ip1 = "10.0.0.1";
    const ip2 = "10.0.0.2";

    limiter.check(ip1);
    limiter.check(ip1);
    assert.strictEqual(limiter.check(ip1).allowed, false);

    // ip2 should still be allowed
    assert.strictEqual(limiter.check(ip2).allowed, true);
  });
});
