import { XMLParser } from "fast-xml-parser";
import type {
  ParsedFeed,
  ParsedPublication,
  ParsedItem,
  RssEnclosure,
} from "./types.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  isArray: (name) =>
    ["item", "entry", "category", "enclosure"].includes(name) ||
    name === "media:content" ||
    name === "media:thumbnail",
});

function text(obj: unknown): string | null {
  if (obj == null) return null;
  if (typeof obj === "string") return obj.trim() || null;
  if (typeof obj === "number") return String(obj);
  if (typeof obj === "object" && "#text" in (obj as Record<string, unknown>)) {
    return text((obj as Record<string, unknown>)["#text"]);
  }
  return null;
}

function parseEnclosures(item: Record<string, unknown>): RssEnclosure[] {
  const enclosures: RssEnclosure[] = [];

  // RSS <enclosure>
  const enc = item["enclosure"];
  if (Array.isArray(enc)) {
    for (const e of enc) {
      if (e && typeof e === "object") {
        const url = (e as Record<string, unknown>)["@_url"];
        const type = (e as Record<string, unknown>)["@_type"];
        const length = (e as Record<string, unknown>)["@_length"];
        if (typeof url === "string" && typeof type === "string") {
          enclosures.push({
            url,
            mimeType: type,
            length: length ? Number(length) || null : null,
          });
        }
      }
    }
  }

  // MRSS <media:content>
  const mediaContent = item["media:content"];
  if (Array.isArray(mediaContent)) {
    for (const mc of mediaContent) {
      if (mc && typeof mc === "object") {
        const obj = mc as Record<string, unknown>;
        const url = obj["@_url"];
        const type = obj["@_type"];
        const medium = obj["@_medium"];
        if (typeof url === "string") {
          const mimeType =
            typeof type === "string"
              ? type
              : medium === "video"
                ? "video/mp4"
                : medium === "audio"
                  ? "audio/mpeg"
                  : "application/octet-stream";
          enclosures.push({
            url,
            mimeType,
            length: obj["@_fileSize"] ? Number(obj["@_fileSize"]) || null : null,
          });
        }
      }
    }
  }

  return enclosures;
}

function extractCoverImage(item: Record<string, unknown>): string | null {
  // Image enclosure
  const enc = item["enclosure"];
  if (Array.isArray(enc)) {
    for (const e of enc) {
      if (e && typeof e === "object") {
        const type = (e as Record<string, unknown>)["@_type"];
        if (typeof type === "string" && type.startsWith("image/")) {
          return (e as Record<string, unknown>)["@_url"] as string;
        }
      }
    }
  }

  // MRSS <media:content medium="image">
  const mediaContent = item["media:content"];
  if (Array.isArray(mediaContent)) {
    for (const mc of mediaContent) {
      if (mc && typeof mc === "object") {
        const obj = mc as Record<string, unknown>;
        if (obj["@_medium"] === "image" && typeof obj["@_url"] === "string") {
          return obj["@_url"] as string;
        }
      }
    }
  }

  // MRSS <media:thumbnail>
  const mediaThumbnail = item["media:thumbnail"];
  if (Array.isArray(mediaThumbnail) && mediaThumbnail.length > 0) {
    const thumb = mediaThumbnail[0] as Record<string, unknown>;
    if (typeof thumb["@_url"] === "string") return thumb["@_url"] as string;
  } else if (
    mediaThumbnail &&
    typeof mediaThumbnail === "object" &&
    typeof (mediaThumbnail as Record<string, unknown>)["@_url"] === "string"
  ) {
    return (mediaThumbnail as Record<string, unknown>)["@_url"] as string;
  }

  // iTunes image
  const itunesImage = item["itunes:image"];
  if (itunesImage && typeof itunesImage === "object") {
    const href = (itunesImage as Record<string, unknown>)["@_href"];
    if (typeof href === "string") return href;
  }

  return null;
}

/**
 * Extract a declared AT URI from feed-level elements.
 */
function extractDeclaredAtUri(
  feedLevel: Record<string, unknown>
): string | null {
  const links = feedLevel["atom:link"] || feedLevel["link"];
  const linkArr = Array.isArray(links) ? links : links ? [links] : [];
  for (const l of linkArr) {
    if (l && typeof l === "object") {
      const obj = l as Record<string, unknown>;
      if (
        obj["@_rel"] === "site.standard.publication" &&
        typeof obj["@_href"] === "string" &&
        (obj["@_href"] as string).startsWith("at://")
      ) {
        return obj["@_href"] as string;
      }
    }
  }
  return null;
}

/**
 * Detect channel-level iTunes podcast namespace metadata.
 */
function hasPodcastChannelMetadata(
  channel: Record<string, unknown>
): boolean {
  return (
    channel["itunes:type"] != null ||
    channel["itunes:category"] != null ||
    channel["itunes:explicit"] != null ||
    channel["itunes:image"] != null ||
    channel["itunes:author"] != null ||
    channel["itunes:owner"] != null
  );
}

function parseRss2(channel: Record<string, unknown>): ParsedFeed {
  const publication: ParsedPublication = {
    name: text(channel["title"]) || "Untitled",
    url: text(channel["link"]) || "",
    description: text(channel["description"]),
    iconUrl: (() => {
      const image = channel["image"] as Record<string, unknown> | undefined;
      if (image && typeof image === "object") return text(image["url"]);
      const itunesImage = channel["itunes:image"] as
        | Record<string, unknown>
        | undefined;
      if (itunesImage && typeof itunesImage === "object")
        return text(itunesImage["@_href"]) || text(itunesImage["#text"]);
      return null;
    })(),
  };

  const rawItems = (channel["item"] as Record<string, unknown>[]) || [];

  const items: ParsedItem[] = rawItems.map((item) => {
    const link = text(item["link"]) || "";
    let path: string | null = null;
    try {
      path = new URL(link).pathname;
    } catch {
      // ignore invalid URLs
    }

    const categories = Array.isArray(item["category"])
      ? (item["category"] as unknown[])
          .map((c) => text(c))
          .filter((t): t is string => t !== null)
      : item["category"]
        ? [text(item["category"])].filter((t): t is string => t !== null)
        : [];

    const pubDate = text(item["pubDate"]);
    const publishedAt = pubDate ? new Date(pubDate).toISOString() : null;

    const contentEncoded = text(item["content:encoded"]);
    const description = text(item["description"]);

    const enclosures = parseEnclosures(item);

    return {
      title: text(item["title"]) || "Untitled",
      link,
      path,
      description,
      contentHtml: contentEncoded,
      publishedAt,
      tags: categories,
      coverImageUrl: extractCoverImage(item),
      enclosures: enclosures.filter(
        (e) => !e.mimeType.startsWith("image/")
      ),
    };
  });

  const declaredAtUri = extractDeclaredAtUri(channel) ?? undefined;
  const hasPodcastMetadata = hasPodcastChannelMetadata(channel);
  return { publication, items, declaredAtUri, hasPodcastMetadata };
}

function parseAtom(feed: Record<string, unknown>): ParsedFeed {
  function getAtomLink(
    parent: Record<string, unknown>,
    rel?: string
  ): string | null {
    const links = parent["link"];
    if (!links) return null;
    const linkArr = Array.isArray(links) ? links : [links];
    for (const l of linkArr) {
      if (l && typeof l === "object") {
        const obj = l as Record<string, unknown>;
        const linkRel = obj["@_rel"] as string | undefined;
        if (rel && linkRel === rel) return obj["@_href"] as string;
        if (!rel && (!linkRel || linkRel === "alternate"))
          return obj["@_href"] as string;
      }
    }
    const first = linkArr[0];
    if (first && typeof first === "object") {
      return (first as Record<string, unknown>)["@_href"] as string || null;
    }
    return null;
  }

  const publication: ParsedPublication = {
    name: text(feed["title"]) || "Untitled",
    url: getAtomLink(feed, "alternate") || getAtomLink(feed) || "",
    description: text(feed["subtitle"]),
    iconUrl: text(feed["icon"]) || text(feed["logo"]),
  };

  const rawEntries =
    (feed["entry"] as Record<string, unknown>[]) || [];
  const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];

  const items: ParsedItem[] = entries.map((entry) => {
    const link =
      getAtomLink(entry as Record<string, unknown>, "alternate") ||
      getAtomLink(entry as Record<string, unknown>) ||
      "";
    let path: string | null = null;
    try {
      path = new URL(link).pathname;
    } catch {
      // ignore invalid URLs
    }

    const summary = text(entry["summary"]);
    const content = entry["content"];
    let contentHtml: string | null = null;
    if (content && typeof content === "object") {
      const contentObj = content as Record<string, unknown>;
      if (
        contentObj["@_type"] === "html" ||
        contentObj["@_type"] === "xhtml"
      ) {
        contentHtml = text(contentObj);
      }
    } else if (typeof content === "string") {
      contentHtml = content;
    }

    const published =
      text(entry["published"]) || text(entry["updated"]);
    const publishedAt = published ? new Date(published).toISOString() : null;

    const rawCategories = entry["category"];
    const categories = Array.isArray(rawCategories)
      ? rawCategories
          .map((c) =>
            c && typeof c === "object"
              ? ((c as Record<string, unknown>)["@_term"] as string)
              : null
          )
          .filter((t): t is string => t !== null)
      : rawCategories && typeof rawCategories === "object"
        ? [
            (rawCategories as Record<string, unknown>)["@_term"] as string,
          ].filter((t): t is string => t !== null)
        : [];

    const enclosures = parseEnclosures(entry);

    return {
      title: text(entry["title"]) || "Untitled",
      link,
      path,
      description: summary,
      contentHtml,
      publishedAt,
      tags: categories,
      coverImageUrl: extractCoverImage(entry),
      enclosures: enclosures.filter(
        (e) => !e.mimeType.startsWith("image/")
      ),
    };
  });

  const declaredAtUri = extractDeclaredAtUri(feed) ?? undefined;
  // Atom feeds with iTunes metadata are podcasts too
  const hasPodcastMetadata = hasPodcastChannelMetadata(feed);
  return { publication, items, declaredAtUri, hasPodcastMetadata };
}

export function parseFeed(xmlText: string): ParsedFeed {
  const doc = parser.parse(xmlText);

  const rss = doc["rss"];
  if (rss && typeof rss === "object") {
    const channel = (rss as Record<string, unknown>)["channel"];
    if (channel && typeof channel === "object") {
      return parseRss2(channel as Record<string, unknown>);
    }
  }

  const feed = doc["feed"];
  if (feed && typeof feed === "object") {
    return parseAtom(feed as Record<string, unknown>);
  }

  throw new Error("Unrecognized feed format. Expected RSS 2.0 or Atom.");
}
