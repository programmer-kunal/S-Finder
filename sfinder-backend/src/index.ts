import { readLimitedBodyText } from "./bodyReader";
import { executeDiscoveryPipeline } from "./pipeline";
import { extractTrustedClientIp, InMemoryRateLimiter } from "./rateLimit";
import { DiscoverRequest, Env } from "./types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-SFinder-Client",
  "Content-Type": "application/json; charset=utf-8"
};

// Location-local opportunistic rate limiter (15 requests per 60 seconds per IP)
export const globalRateLimiter = new InMemoryRateLimiter(60_000, 15);

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. Handle CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    // 2. Health Check Endpoint
    if (url.pathname === "/health" || url.pathname === "/") {
      return new Response(
        JSON.stringify({
          status: "healthy",
          service: "sfinder-backend",
          timestamp: new Date().toISOString(),
          configuredModel: env.PRIMARY_MODEL || "gemini-3.5-flash-lite",
          catalog: "TVmaze"
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 3. Privacy Policy & Third-Party AI Notice Endpoint
    if (url.pathname === "/privacy" || url.pathname === "/api/v1/privacy") {
      return new Response(
        JSON.stringify({
          service: "S Finder Discovery Service",
          aiProvider: "Google Gemini API",
          dataProcessingNotice: 
            "Search queries are processed using Google Gemini models under Google AI Studio API terms. " +
            "Queries on free tier access may be logged and reviewed by Google to improve product services. " +
            "S Finder does not collect or store user accounts, passwords, or personal identifying data. " +
            "Do not enter personal, financial, or confidential information in entertainment search queries.",
          catalogSource: "TVmaze REST API",
          catalogAttribution: "Data provided by TVmaze (CC BY-SA 4.0)"
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 4. Main Discovery Endpoint
    if (url.pathname === "/api/v1/discover") {
      if (request.method !== "POST") {
        return new Response(
          JSON.stringify({ error: "Method not allowed. Use POST." }),
          { status: 405, headers: CORS_HEADERS }
        );
      }

      // Best-effort rate limiting using trusted client IP
      const clientIp = extractTrustedClientIp(request);
      const rateCheck = globalRateLimiter.check(clientIp);
      if (!rateCheck.allowed) {
        return new Response(
          JSON.stringify({
            mode: "ERROR",
            query: "",
            resolvedCount: 0,
            items: [],
            disclaimer: "Rate limit exceeded. Please wait a moment before sending more requests.",
            fallbackUsed: false,
            error: "Too many requests. Rate limit is 15 requests per minute."
          }),
          {
            status: 429,
            headers: {
              ...CORS_HEADERS,
              "Retry-After": String(rateCheck.resetInSec),
              "X-RateLimit-Limit": "15",
              "X-RateLimit-Remaining": "0"
            }
          }
        );
      }

      // Enforce actual maximum body size (10 KB max) before JSON parsing
      const bodyResult = await readLimitedBodyText(request, 10240);
      if (bodyResult.error === "TOO_LARGE") {
        return new Response(
          JSON.stringify({
            mode: "ERROR",
            query: "",
            resolvedCount: 0,
            items: [],
            disclaimer: "Payload exceeds 10KB size limit.",
            fallbackUsed: false,
            error: "Payload too large: maximum 10KB supported."
          }),
          { status: 413, headers: CORS_HEADERS }
        );
      }

      if (bodyResult.error === "READ_ERROR") {
        return new Response(
          JSON.stringify({
            mode: "ERROR",
            query: "",
            resolvedCount: 0,
            items: [],
            disclaimer: "Failed to read request body.",
            fallbackUsed: false,
            error: "Malformed request stream"
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      let body: DiscoverRequest;
      try {
        body = JSON.parse(bodyResult.text) as DiscoverRequest;
      } catch {
        return new Response(
          JSON.stringify({
            mode: "ERROR",
            query: "",
            resolvedCount: 0,
            items: [],
            disclaimer: "Invalid JSON payload in request body.",
            fallbackUsed: false,
            error: "Malformed JSON"
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      // Opportunistic Edge Caching
      let cacheKey: Request | null = null;
      let cache: Cache | null = null;

      try {
        if (typeof caches !== "undefined" && (caches as any).default) {
          cache = (caches as any).default as Cache;
          const page = body.page || 1;
          const limit = body.limit || 20;
          // Versioned internal cache key namespace ensures deployments invalidate stale caches
          const CACHE_NAMESPACE = "v5bw";
          const normalized = `${CACHE_NAMESPACE}:${body.contentType || body.category || "ALL"}:${body.genre || "ANY"}:${body.country || "ANY"}:p${page}:l${limit}:${(body.query || "").trim().toLowerCase()}`;
          cacheKey = new Request(`https://cache.sfinder.internal/discover?k=${encodeURIComponent(normalized)}`, {
            method: "GET"
          });

          const cachedResponse = await cache.match(cacheKey);
          if (cachedResponse) {
            return new Response(cachedResponse.body, {
              status: 200,
              headers: {
                ...CORS_HEADERS,
                "X-SFinder-Cache": "HIT"
              }
            });
          }
        }
      } catch {
        // Cache failures must never break discovery
      }

      try {
        const result = await executeDiscoveryPipeline(body, env);

        const responsePayload = JSON.stringify(result);
        const response = new Response(responsePayload, {
          status: result.mode === "ERROR" ? 400 : 200,
          headers: {
            ...CORS_HEADERS,
            "X-SFinder-Cache": "MISS",
            "X-RateLimit-Limit": "15",
            "X-RateLimit-Remaining": String(rateCheck.remaining)
          }
        });

        // Store successful non-fallback responses in opportunistic edge cache for 24h
        if (cache && cacheKey && !result.fallbackUsed && result.items.length > 0) {
          const cacheTtl = parseInt(env.CACHE_TTL_SECONDS || "86400", 10);
          const cacheableResponse = new Response(responsePayload, {
            status: 200,
            headers: {
              ...CORS_HEADERS,
              "Cache-Control": `public, max-age=${cacheTtl}`
            }
          });
          if (ctx && typeof ctx.waitUntil === "function") {
            ctx.waitUntil(cache.put(cacheKey, cacheableResponse));
          }
        }

        return response;
      } catch {
        // Ensure no internal details or secret keys are exposed
        return new Response(
          JSON.stringify({
            mode: "ERROR",
            query: body?.query ? body.query.substring(0, 50) : "",
            resolvedCount: 0,
            items: [],
            disclaimer: "An unexpected server error occurred. Please try again.",
            fallbackUsed: false,
            error: "Internal server error"
          }),
          { status: 500, headers: CORS_HEADERS }
        );
      }
    }

    // 5. Unknown routes
    return new Response(
      JSON.stringify({ error: "Endpoint not found" }),
      { status: 404, headers: CORS_HEADERS }
    );
  }
};
