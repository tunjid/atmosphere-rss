import type { Agent } from "@atproto/api";
import type { FetchFunction, ParsedItem, ParsedPublication } from "./types.js";
import { truncateGraphemes } from "./truncate.js";
import { uploadBlobFromUrl } from "./blob.js";

export async function buildPublicationRecord(
  agent: Agent,
  pub: ParsedPublication,
  fetchFn: FetchFunction = globalThis.fetch
): Promise<Record<string, unknown>> {
  const record: Record<string, unknown> = {
    $type: "site.standard.publication",
    url: pub.url.replace(/\/+$/, ""),
    name: truncateGraphemes(pub.name, 128),
  };

  if (pub.description) {
    record.description = truncateGraphemes(pub.description, 300);
  }

  if (pub.iconUrl) {
    const iconBlob = await uploadBlobFromUrl(agent, pub.iconUrl, fetchFn);
    if (iconBlob) {
      record.icon = iconBlob;
    }
  }

  return record;
}

export async function buildDocumentRecord(
  agent: Agent,
  item: ParsedItem,
  pubAtUri: string,
  fetchFn: FetchFunction = globalThis.fetch
): Promise<Record<string, unknown>> {
  const record: Record<string, unknown> = {
    $type: "site.standard.document",
    site: pubAtUri,
    title: truncateGraphemes(item.title, 500),
    publishedAt: item.publishedAt!,
  };

  if (item.path) record.path = item.path;
  if (item.description) {
    record.description = truncateGraphemes(item.description, 3000);
  }
  if (item.tags.length > 0) {
    record.tags = item.tags.map((t) => truncateGraphemes(t, 50));
  }

  if (item.coverImageUrl) {
    const coverBlob = await uploadBlobFromUrl(agent, item.coverImageUrl, fetchFn);
    if (coverBlob) {
      record.coverImage = coverBlob;
    }
  }

  return record;
}
