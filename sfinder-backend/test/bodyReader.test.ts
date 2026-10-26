import { describe, it } from "node:test";
import assert from "node:assert";
import { readLimitedBodyText } from "../src/bodyReader";

describe("BodyReader Unit Tests", () => {
  it("reads valid body under the limit correctly", async () => {
    const payload = JSON.stringify({ query: "The K2", category: "KDRAMA" });
    const req = new Request("https://mock.url", {
      method: "POST",
      body: payload
    });

    const result = await readLimitedBodyText(req, 10240);
    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.text, payload);
  });

  it("rejects when Content-Length header is missing and actual stream exceeds maxBytes", async () => {
    // Large payload (> 10KB)
    const hugePayload = "X".repeat(12000);
    
    // In Fetch API, we can create a request with body. If we don't set Content-Length header:
    const req = new Request("https://mock.url", {
      method: "POST",
      body: hugePayload
    });
    // Explicitly delete Content-Length to simulate chunked/missing header
    req.headers.delete("content-length");

    const result = await readLimitedBodyText(req, 10240);
    assert.strictEqual(result.error, "TOO_LARGE");
    assert.strictEqual(result.text, "");
  });

  it("rejects when Content-Length header is deliberately misleading (too small)", async () => {
    const hugePayload = "Y".repeat(15000);

    const req = new Request("https://mock.url", {
      method: "POST",
      headers: {
        // Misleading header claims payload is only 50 bytes!
        "Content-Length": "50"
      },
      body: hugePayload
    });

    const result = await readLimitedBodyText(req, 10240);
    assert.strictEqual(result.error, "TOO_LARGE");
    assert.strictEqual(result.text, "");
  });

  it("handles empty body safely", async () => {
    const req = new Request("https://mock.url", { method: "POST" });
    const result = await readLimitedBodyText(req, 10240);
    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.text, "");
  });
});
