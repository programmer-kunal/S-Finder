/**
 * Safe request body reader enforcing a hard maximum byte limit.
 * Protects against oversized payloads, chunked transfer attacks,
 * and missing or deliberately misleading Content-Length headers.
 */

export interface BodyReadResult {
  text: string;
  error?: "TOO_LARGE" | "READ_ERROR";
}

export async function readLimitedBodyText(
  request: Request,
  maxBytes: number = 10240
): Promise<BodyReadResult> {
  // 1. Fast preliminary check: reject if Content-Length header is present and exceeds maxBytes
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const parsedLength = parseInt(contentLengthHeader, 10);
    if (!isNaN(parsedLength) && parsedLength > maxBytes) {
      return { text: "", error: "TOO_LARGE" };
    }
  }

  // 2. Stream-level chunk reading: enforces actual byte size regardless of Content-Length accuracy
  if (!request.body) {
    return { text: "" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          // Immediately cancel the stream to stop consuming memory/bandwidth
          await reader.cancel();
          return { text: "", error: "TOO_LARGE" };
        }
        chunks.push(value);
      }
    }
  } catch {
    return { text: "", error: "READ_ERROR" };
  }

  // Merge accumulated chunks
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder("utf-8").decode(merged);
  return { text };
}
