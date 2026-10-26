/**
 * Edge request-throttling layer for S Finder.
 *
 * ARCHITECTURAL LIMITATION NOTICE:
 * --------------------------------
 * This in-memory limiter operates within the scope of a Cloudflare Worker isolate/location.
 * Cloudflare edge nodes across 300+ data centers do not share synchronized global state.
 * Consequently, this mechanism serves as an opportunistic, location-specific request-throttling
 * shield against client-level flooding and rapid bursts.
 *
 * IT MUST NOT BE REPRESENTED OR RELIED UPON AS AN EXACT GLOBAL QUOTA COUNTER.
 * Google Gemini's upstream rate-limit responses (HTTP 429 RESOURCE_EXHAUSTED) remain the
 * authoritative global quota enforcement. Under no circumstances will quota limits trigger
 * paid billing or automatic upgrades.
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export class InMemoryRateLimiter {
  private records = new Map<string, RateLimitRecord>();

  constructor(
    private readonly windowMs: number = 60_000,
    private readonly maxRequests: number = 15
  ) {}

  public check(clientIp: string): { allowed: boolean; remaining: number; resetInSec: number } {
    const now = Date.now();
    const cleanIp = clientIp.trim() || "unknown-client";
    const record = this.records.get(cleanIp);

    // Evict expired record
    if (!record || now > record.resetAt) {
      this.records.set(cleanIp, {
        count: 1,
        resetAt: now + this.windowMs
      });
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetInSec: Math.ceil(this.windowMs / 1000)
      };
    }

    // Exceeded limit
    if (record.count >= this.maxRequests) {
      const resetInSec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
      return {
        allowed: false,
        remaining: 0,
        resetInSec
      };
    }

    // Increment count
    record.count++;
    return {
      allowed: true,
      remaining: this.maxRequests - record.count,
      resetInSec: Math.max(1, Math.ceil((record.resetAt - now) / 1000))
    };
  }

  public reset(): void {
    this.records.clear();
  }
}

/**
 * Extracts a trusted client identifier from the request.
 * Strictly prefers Cloudflare's 'cf-connecting-ip'.
 * Client-supplied 'X-Forwarded-For' headers are deliberately NOT trusted to prevent spoofing.
 */
export function extractTrustedClientIp(request: Request): string {
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp && cfConnectingIp.trim().length > 0) {
    return cfConnectingIp.trim();
  }

  // Safe fallback for local development or non-Cloudflare test runners
  return "local-client";
}
