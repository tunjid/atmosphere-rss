export interface ParsedPublication {
  name: string;
  url: string;
  description: string | null;
  iconUrl: string | null;
}

export interface RssEnclosure {
  url: string;
  mimeType: string;
  length: number | null;
}

export interface ParsedItem {
  title: string;
  link: string;
  path: string | null;
  description: string | null;
  contentHtml: string | null;
  publishedAt: string | null;
  tags: string[];
  coverImageUrl: string | null;
  enclosures: RssEnclosure[];
}

export interface ParsedFeed {
  publication: ParsedPublication;
  items: ParsedItem[];
  /**
   * AT URI declared in the feed via an <atom:link rel="site.standard.publication">
   * or similar element. Used by the "feed-declared" verification strategy.
   */
  declaredAtUri?: string;
  /**
   * Whether the feed has channel-level iTunes podcast namespace metadata
   * (itunes:type, itunes:category, or itunes:explicit).
   */
  hasPodcastMetadata: boolean;
}

export interface PublicationInfo {
  did: string;
  rkey: string;
  atUri: string;
}

export type ImportProgressStatus =
  | "resolving-publication"
  | "creating-publication"
  | "importing";

export interface ImportProgress {
  status: ImportProgressStatus;
  index?: number;
  total?: number;
  succeeded?: number;
  skipped?: number;
  failed?: number;
}

export interface ImportResult {
  publication: { uri: string; rkey: string };
  succeeded: number;
  skipped: number;
  failed: number;
}

/**
 * Resolve the publication's AT URI via /.well-known/site.standard.publication
 * hosted on the publication's domain.
 */
export interface WellKnownVerification {
  type: "well-known";
  /** Optional override domain. Defaults to the feed's publication URL host. */
  domain?: string;
}

/**
 * Resolve the publication owner via a DNS TXT record at
 * _atproto.{domain}, then use the provided rkey for the publication.
 */
export interface DnsTxtVerification {
  type: "dns-txt";
  /** The domain to look up the _atproto TXT record on. */
  domain: string;
  /** The record key to use for the publication. */
  rkey: string;
}

/**
 * Use the AT URI declared in the feed itself, e.g. via an
 * <atom:link rel="site.standard.publication" href="at://..." />.
 */
export interface FeedDeclaredVerification {
  type: "feed-declared";
}

export type PublicationVerification =
  | WellKnownVerification
  | DnsTxtVerification
  | FeedDeclaredVerification;

export interface ImportOptions {
  agent: import("@atproto/api").Agent;
  start?: Date;
  onProgress?: (progress: ImportProgress) => void;
  /**
   * How to resolve the publication's AT URI for ownership verification.
   * Defaults to "well-known" if not specified.
   */
  verification?: PublicationVerification;
}
