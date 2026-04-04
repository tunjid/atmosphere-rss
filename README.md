# atmosphere-rss

Import RSS and Atom feeds as [standard.site](https://standard.site) publications and documents on the [AT Protocol](https://atproto.com).

This package reads an RSS/Atom feed, creates a `site.standard.publication` record for the feed, and a `site.standard.document` record for each article. Record keys are deterministic, derived from the publish date and URL path, so re-importing the same feed is idempotent.

Only long-form writing feeds (blogs, newsletters) are supported. Podcast and video feeds are automatically detected and rejected.

## Installation

```bash
npm install atmosphere-rss
```

Requires Node.js 18+.

## Quick start

```typescript
import { Agent } from "@atproto/api";
import { importRss } from "atmosphere-rss";

const agent = new Agent("https://bsky.social");
await agent.login({ identifier: "you.bsky.social", password: "app-password" });

const result = await importRss(new URL("https://myblog.com/rss"), {
  agent,
  onProgress: (p) => console.log(p),
});

console.log(`Imported ${result.succeeded} documents`);
```

## API

### `importRss(url, options)`

Fetches an RSS/Atom feed, validates it is a writing feed, resolves the publication's AT URI, then creates/updates all records.

```typescript
async function importRss(url: URL, options: ImportOptions): Promise<ImportResult>;
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `url` | `URL` | URL of the RSS or Atom feed |
| `options.agent` | `Agent` | Authenticated `@atproto/api` Agent |
| `options.start` | `Date?` | Only import items published on or after this date. If omitted, the whole feed is imported. |
| `options.verification` | `PublicationVerification?` | How to resolve publication ownership. Defaults to `well-known`. |
| `options.onProgress` | `(p: ImportProgress) => void` | Optional progress callback |
| `options.fetch` | `FetchFunction?` | Custom fetch function for all network requests. Defaults to global `fetch`. |

**Returns** an `ImportResult`:

```typescript
{
  publication: { uri: string; rkey: string };
  succeeded: number;
  skipped: number;
  failed: number;
}
```

### `parseFeed(xmlText)`

Parse an RSS 2.0 or Atom feed XML string into structured data without importing. Useful for inspecting a feed before committing to an import.

```typescript
function parseFeed(xmlText: string): ParsedFeed;
```

### `documentRecordKey(publishedAt, url)`

Return the deterministic record key (TID) for a `site.standard.document` given its publish date and URL. The key is derived from the date (truncated to second precision) and the URL pathname.

```typescript
async function documentRecordKey(publishedAt: Date, url: URL): Promise<string>;
```

The record key is domain-independent. The same path on different domains produces the same key:

```typescript
const key1 = await documentRecordKey(date, new URL("https://myblog.com/posts/hello"));
const key2 = await documentRecordKey(date, new URL("https://mirror.example.org/posts/hello"));
// key1 === key2
```

### `validateFeed(feed)`

Validate that a parsed feed is a long-form writing feed. Throws if the feed appears to be a podcast or video feed.

```typescript
function validateFeed(feed: ParsedFeed): void;
```

**Channel-level rejection** (rejects the entire feed):
- iTunes podcast namespace metadata at the channel level (`itunes:image`, `itunes:type`, `itunes:category`, `itunes:explicit`, `itunes:author`, `itunes:owner`)
- More than 50% of items have audio or video enclosures

### `isWritingItem(item)`

Check whether an individual parsed item is a writing item. Returns `false` for items that have audio/video enclosures but no written content. Returns `true` for items with written content, even if they also have media (e.g., a blog post with audio narration).

```typescript
function isWritingItem(item: ParsedItem): boolean;
```

## Publication verification

RSS feeds hosted by third parties (e.g., Feedburner, Medium) may not allow placing a `.well-known` file on the feed's domain. Three verification strategies are supported:

### Well-known (default)

Fetches `/.well-known/site.standard.publication` from the publication's domain to get the AT URI. This is the standard approach for sites you control.

```typescript
await importRss(feedUrl, {
  agent,
  verification: { type: "well-known" },
});
```

### DNS TXT record

Resolves the publication owner DID via a `_atproto.{domain}` DNS TXT record, then looks up the matching `site.standard.publication` record from the owner's repo.

```typescript
await importRss(feedUrl, {
  agent,
  verification: { type: "dns-txt", domain: "myblog.com" },
});
```

### Feed-declared

Uses an AT URI declared directly in the feed XML via an `<atom:link>` element:

```xml
<atom:link rel="site.standard.publication"
           href="at://did:plc:xxx/site.standard.publication/rkey" />
```

```typescript
await importRss(feedUrl, {
  agent,
  verification: { type: "feed-declared" },
});
```

## How record keys work

Record keys are deterministic [TIDs](https://atproto.com/specs/record-key) generated from:

- **Documents**: The publish date (truncated to second precision for RFC 2822 compatibility) and a SHA-256 hash of the URL pathname for the 10-bit clock ID.
- **Publications**: The URL origin hashed into the clock ID.

This means re-importing the same feed produces the same record keys, making imports idempotent (existing records are updated in place via `putRecord`).

## Feed format support

| Format | Status |
|--------|--------|
| RSS 2.0 | Supported |
| Atom | Supported |
| RSS 2.0 with `content:encoded` | Supported (HTML extracted) |
| Podcast feeds (iTunes namespace) | Rejected |
| MRSS video feeds | Rejected |

## Browser usage (CORS)

In browser environments, RSS feeds and AT Protocol endpoints will typically be blocked by CORS. Pass a custom `fetch` function to route all requests through your proxy:

```typescript
import { importRss } from "atmosphere-rss";

// All network requests go through your proxy
const result = await importRss(new URL("https://myblog.com/rss"), {
  agent,
  fetch: (input, init) =>
    globalThis.fetch(`/api/proxy?url=${encodeURIComponent(String(input))}`, init),
});
```

The custom `fetch` is used for every network request the library makes: fetching the feed, resolving `.well-known` files, DNS-over-HTTPS lookups, PLC directory resolution, PDS record listing, and image blob downloads.

## Related

- [standard.site](https://standard.site) - The lexicon standard for publications and documents on the AT Protocol
- [@atproto/api](https://www.npmjs.com/package/@atproto/api) - AT Protocol API client
- [AT Protocol](https://atproto.com) - The underlying protocol

## License

MIT
