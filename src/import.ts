import type {
  FetchFunction,
  ImportOptions,
  ImportResult,
  ParsedFeed,
  PublicationInfo,
  PublicationVerification,
} from "./types.js";
import { parseFeed } from "./parse.js";
import { tidFromDateAndString } from "./tid.js";
import { buildPublicationRecord, buildDocumentRecord } from "./records.js";
import { validateFeed, isWritingItem } from "./validate.js";

// ─── Verification strategies ────────────────────────────────────────────────

const AT_URI_RE = /^at:\/\/(did:[^/]+)\/site\.standard\.publication\/(.+)$/;

function parseAtUri(atUri: string): PublicationInfo {
  const match = atUri.match(AT_URI_RE);
  if (!match) {
    throw new Error(
      `Invalid publication AT URI: "${atUri}". ` +
        "Expected format: at://did:plc:xxx/site.standard.publication/rkey"
    );
  }
  return { did: match[1], rkey: match[2], atUri };
}

/**
 * Resolve via /.well-known/site.standard.publication on the publication domain.
 */
async function resolveWellKnown(
  publicationUrl: string,
  fetchFn: FetchFunction
): Promise<PublicationInfo> {
  let origin: string;
  try {
    origin = new URL(publicationUrl).origin;
  } catch {
    origin = publicationUrl.replace(/\/+$/, "");
  }
  const wellKnownUrl = `${origin}/.well-known/site.standard.publication`;

  const response = await fetchFn(wellKnownUrl);
  if (!response.ok) {
    throw new Error(
      `Could not reach ${wellKnownUrl}. The site must have a ` +
        "/.well-known/site.standard.publication file containing the AT URI " +
        "of the publication. Visit https://standard.site for setup instructions."
    );
  }

  return parseAtUri((await response.text()).trim());
}

/**
 * Resolve the publication owner DID via a DNS TXT record at _atproto.{domain},
 * then list their site.standard.publication records to find the matching one.
 */
async function resolveDnsTxt(
  domain: string,
  fetchFn: FetchFunction
): Promise<PublicationInfo> {
  // Resolve DID from DNS TXT record
  const dnsUrl = `https://cloudflare-dns.com/dns-query?name=_atproto.${encodeURIComponent(domain)}&type=TXT`;
  const dnsResponse = await fetchFn(dnsUrl, {
    headers: { Accept: "application/dns-json" },
  });
  if (!dnsResponse.ok) {
    throw new Error(
      `DNS lookup failed for _atproto.${domain}: ${dnsResponse.status}`
    );
  }

  const dnsResult = (await dnsResponse.json()) as {
    Answer?: { data: string }[];
  };

  const answers = dnsResult.Answer ?? [];
  let did: string | null = null;

  for (const answer of answers) {
    // TXT data comes quoted, e.g. "\"did=did:plc:xxx\""
    const raw = answer.data.replace(/^"|"$/g, "");
    const match = raw.match(/^did=(did:.+)$/);
    if (match) {
      did = match[1];
      break;
    }
  }

  if (!did) {
    throw new Error(
      `No valid _atproto TXT record found for ${domain}. ` +
        `Expected a TXT record at _atproto.${domain} with value "did=did:plc:xxx". ` +
        "See https://atproto.com/specs/handle for details."
    );
  }

  // Resolve the PDS endpoint for this DID
  const plcResponse = await fetchFn(
    `https://plc.directory/${encodeURIComponent(did)}`
  );
  if (!plcResponse.ok) {
    throw new Error(`Could not resolve DID "${did}" from plc.directory`);
  }
  const didDoc = (await plcResponse.json()) as {
    service?: { type: string; serviceEndpoint: string }[];
  };
  const pdsService = didDoc.service?.find(
    (s) => s.type === "AtprotoPersonalDataServer"
  );
  if (!pdsService?.serviceEndpoint) {
    throw new Error(`No PDS service found for "${did}"`);
  }

  // List publication records and find one matching the domain
  const listUrl =
    `${pdsService.serviceEndpoint}/xrpc/com.atproto.repo.listRecords` +
    `?repo=${encodeURIComponent(did)}&collection=site.standard.publication&limit=100`;
  const listResponse = await fetchFn(listUrl);
  if (!listResponse.ok) {
    throw new Error(
      `Failed to list publication records for ${did}: ${listResponse.status}`
    );
  }

  const listResult = (await listResponse.json()) as {
    records: { uri: string; value: { url?: string } }[];
  };

  const normalizedDomain = domain.replace(/\/+$/, "").toLowerCase();
  const matchingRecord = listResult.records.find((r) => {
    const pubUrl = r.value.url?.replace(/\/+$/, "").toLowerCase() ?? "";
    try {
      return new URL(pubUrl).hostname === normalizedDomain;
    } catch {
      return pubUrl === normalizedDomain;
    }
  });

  if (!matchingRecord) {
    throw new Error(
      `No site.standard.publication record found for domain "${domain}" ` +
        `in repo ${did}. The account has ${listResult.records.length} publication(s), ` +
        "but none match this domain."
    );
  }

  const uriMatch = matchingRecord.uri.match(AT_URI_RE);
  if (!uriMatch) {
    throw new Error(
      `Unexpected publication URI format: "${matchingRecord.uri}"`
    );
  }

  return {
    did: uriMatch[1],
    rkey: uriMatch[2],
    atUri: matchingRecord.uri,
  };
}

/**
 * Use the AT URI declared directly in the feed XML.
 */
function resolveFeedDeclared(feed: ParsedFeed): PublicationInfo {
  if (!feed.declaredAtUri) {
    throw new Error(
      'Verification type "feed-declared" was requested, but the feed does not ' +
        "contain a declared AT URI. Expected an <atom:link> or similar element " +
        'with rel="site.standard.publication" and an at:// href.'
    );
  }
  return parseAtUri(feed.declaredAtUri);
}

// ─── Resolve dispatcher ─────────────────────────────────────────────────────

async function resolvePublicationInfo(
  feed: ParsedFeed,
  verification: PublicationVerification | undefined,
  fetchFn: FetchFunction
): Promise<PublicationInfo> {
  const strategy = verification ?? { type: "well-known" as const };

  const publicationUrl = feed.publication.url;
  let domain: string;
  try {
    domain = new URL(publicationUrl).hostname;
  } catch {
    throw new Error(`Cannot extract domain from feed publication URL: "${publicationUrl}"`);
  }

  switch (strategy.type) {
    case "well-known":
      return resolveWellKnown(publicationUrl, fetchFn);
    case "dns-txt":
      return resolveDnsTxt(domain, fetchFn);
    case "feed-declared":
      return resolveFeedDeclared(feed);
  }
}

// ─── Main import ─────────────────────────────────────────────────────────────

export async function importRss(
  url: URL,
  options: ImportOptions
): Promise<ImportResult> {
  const { agent, start, onProgress, verification } = options;
  const fetchFn = options.fetch ?? globalThis.fetch;
  const did = agent.did!;

  // Fetch and parse the feed
  const response = await fetchFn(url.toString());
  if (!response.ok) {
    throw new Error(
      `Failed to fetch feed: ${response.status} ${response.statusText}`
    );
  }
  const xmlText = await response.text();
  const feed = parseFeed(xmlText);

  // Validate that this is a writing feed (not a podcast or video feed)
  validateFeed(feed);

  // Resolve publication info using the chosen verification strategy
  onProgress?.({ status: "resolving-publication" });
  const pubInfo = await resolvePublicationInfo(feed, verification, fetchFn);

  // Create/update publication record
  onProgress?.({ status: "creating-publication" });
  const pubRecord = await buildPublicationRecord(agent, feed.publication, fetchFn);
  await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: "site.standard.publication",
    rkey: pubInfo.rkey,
    record: pubRecord,
  });

  const pubAtUri = `at://${did}/site.standard.publication/${pubInfo.rkey}`;

  // Import items
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  const items = feed.items
    .filter(isWritingItem)
    .filter((item) => {
      if (!item.publishedAt) return false;
      if (start && new Date(item.publishedAt) < start) return false;
      return true;
    });

  const total = items.length;

  for (let i = 0; i < total; i++) {
    const item = items[i];

    onProgress?.({
      status: "importing",
      index: i,
      total,
      succeeded,
      skipped,
      failed,
    });

    try {
      if (!item.publishedAt) {
        skipped++;
        continue;
      }

      const rkey = await tidFromDateAndString(
        new Date(item.publishedAt),
        new URL(item.link).pathname
      );

      const docRecord = await buildDocumentRecord(agent, item, pubAtUri, fetchFn);

      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: "site.standard.document",
        rkey,
        record: docRecord,
      });

      succeeded++;
    } catch {
      failed++;
    }
  }

  return {
    publication: { uri: pubAtUri, rkey: pubInfo.rkey },
    succeeded,
    skipped,
    failed,
  };
}
