export { importRss } from "./import.js";
export { parseFeed } from "./parse.js";
export { validateFeed, isWritingItem } from "./validate.js";
export { tidFromDate, tidFromDateAndString } from "./tid.js";
export { truncateGraphemes } from "./truncate.js";

import { tidFromDateAndString } from "./tid.js";

/**
 * Return the deterministic record key for a standard document.
 * Uses the publish date (truncated to second precision) and the URL pathname
 * to generate a stable TID.
 */
export async function documentRecordKey(
  publishedAt: Date,
  url: URL
): Promise<string> {
  return tidFromDateAndString(publishedAt, url.pathname);
}

/**
 * Return the deterministic record key for a standard publication.
 * Uses the URL origin as the hash input.
 */
export async function publicationRecordKey(url: URL): Promise<string> {
  return tidFromDateAndString(new Date(0), url.origin);
}

export type {
  ParsedFeed,
  ParsedPublication,
  ParsedItem,
  RssEnclosure,
  PublicationInfo,
  ImportOptions,
  ImportProgress,
  ImportProgressStatus,
  ImportResult,
  PublicationVerification,
  WellKnownVerification,
  DnsTxtVerification,
  FeedDeclaredVerification,
} from "./types.js";
