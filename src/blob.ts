import type { Agent } from "@atproto/api";
import type { FetchFunction } from "./types.js";

export async function uploadBlobFromUrl(
  agent: Agent,
  imageUrl: string,
  fetchFn: FetchFunction = globalThis.fetch
): Promise<unknown | null> {
  try {
    const response = await fetchFn(imageUrl);
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > 1_000_000) {
      console.warn(`Image exceeds 1MB limit: ${imageUrl}`);
      return null;
    }

    const mimeType =
      response.headers.get("content-type") || "application/octet-stream";
    const uint8 = new Uint8Array(arrayBuffer);

    const result = await agent.com.atproto.repo.uploadBlob(uint8, {
      encoding: mimeType,
    });
    return result.data.blob;
  } catch (err) {
    console.warn("Failed to upload blob:", imageUrl, err);
    return null;
  }
}
